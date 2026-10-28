import contextlib,gc,hashlib,json,logging,os,re,tempfile,uuid,time
from pathlib import Path
import numpy as np
import soundfile as sf

ALIASES={'vocal':'vocals','vocals':'vocals','drum':'drums','drums':'drums','bass':'bass','guitar':'guitar','piano':'piano','other':'other','others':'other','instrumental':'other','lead':'lead','rhythm':'rhythm','lead vocals':'lead_vocals','backing vocals':'backing_vocals'}

def assert_outputs(outputs,stems,frames=None):
    if set(outputs)!=set(stems) or len(outputs)!=len(stems):raise ValueError(f'模型声部不匹配：期望 {stems}，实际 {list(outputs)}')
    for name,array in outputs.items():
        if array.ndim!=2 or array.shape[1]!=2 or not np.all(np.isfinite(array)):raise ValueError(f'{name} 输出格式无效，应为有限数值的立体声音频')
        if frames is not None and abs(len(array)-frames)>4096:raise ValueError(f'{name} 输出长度不匹配')

def tensor_model(model,x,sr,emit):
    import torch,yaml
    class ConfigLoader(yaml.SafeLoader):pass
    ConfigLoader.add_constructor('tag:yaml.org,2002:python/tuple',lambda loader,node:tuple(loader.construct_sequence(node)))
    config=yaml.load((Path(model['directory'])/model['config']).read_text(encoding='utf-8'),Loader=ConfigLoader) if model.get('config') else {}
    use_gpu=torch.cuda.is_available() and not model.get('cpuOnly'); device='cuda' if use_gpu else 'cpu'
    if model['adapter']=='scnet':
        from vendor.scnet import SCNet
        net=SCNet(**config['model']);state=torch.load(Path(model['directory'])/model['file'],map_location='cpu',weights_only=True)
        if 'state_dict' in state:state=state['state_dict']
        if 'state' in state:state=state['state']
        state={k.removeprefix('module.'):v for k,v in state.items()};net.load_state_dict(state,strict=True);net=net.to(device).eval()
        def infer(chunk):
            with torch.inference_mode():return net(torch.from_numpy(chunk.T[None]).to(device)).float().cpu().numpy()[0]
        expected=config.get('model',{}).get('sources',model['stems'])
        if expected!=model['stems']:raise ValueError('配置的声部顺序与模型清单不一致')
    else:
        import onnx,onnxruntime as ort
        file=Path(model['directory'])/model['file'];graph=onnx.load(str(file),load_external_data=False)
        if any(t.external_data for t in graph.graph.initializer):raise ValueError('暂不支持含外部数据的 ONNX，请导出为单个完整模型文件')
        session=ort.InferenceSession(str(file),providers=['CPUExecutionProvider'])
        if len(session.get_inputs())!=1 or len(session.get_outputs())!=1:raise ValueError('只支持单输入单输出的波形 ONNX 模型')
        def infer(chunk):
            out=session.run(None,{session.get_inputs()[0].name:chunk.T[None].astype(np.float32)})[0]
            if out.ndim==4 and out.shape[0]==1:out=out[0]
            return out
    chunk=int(sr*model.get('chunkSeconds',6));step=chunk//2;length=len(x)
    accum=np.zeros((len(model['stems']),2,length+chunk),np.float32);weight=np.zeros(length+chunk,np.float32);window=np.hanning(chunk).astype(np.float32);window[:32]=np.maximum(window[:32],.001);window[-32:]=np.maximum(window[-32:],.001)
    for start in range(0,length,step):
        data=np.zeros((chunk,2),np.float32);n=min(chunk,length-start);data[:n]=x[start:start+n]
        out=infer(data)
        if out.shape!=(len(model['stems']),2,chunk):raise ValueError(f'模型输出维度错误：{out.shape}，期望 {(len(model["stems"]),2,chunk)}')
        if not np.isfinite(out).all():raise ValueError('模型产生了无效数值')
        accum[:,:,start:start+chunk]+=out*window;weight[start:start+chunk]+=window;emit(min(.9,.1+.8*start/max(1,length)),f'本机推理 {start/sr:.0f} / {length/sr:.0f} 秒')
    return {name:(accum[i,:,:length]/np.maximum(weight[:length],1e-7)).T for i,name in enumerate(model['stems'])}

def run_model(model,source,output,emit):
    try:return _run_model(model,source,output,emit)
    except RuntimeError as error:
        import torch
        if model.get('cpuOnly') or not torch.cuda.is_available():raise
        if 'out of memory' not in str(error).lower():raise
        error.__traceback__=None;gc.collect();torch.cuda.empty_cache()
        emit(.08,'显存不足或 GPU 加载失败，改用 CPU 兼容计算')
        return _run_model({**model,'cpuOnly':True},source,output,emit)


def _run_model(model,source,output,emit):
    import librosa
    sr=model['sampleRate'];x,_=librosa.load(str(source),sr=sr,mono=False);x=x.T
    if x.ndim==1:x=np.repeat(x[:,None],2,axis=1)
    if model['adapter'] in ['scnet','onnx-waveform']:return tensor_model(model,x,sr,emit),sr
    from audio_separator.separator import Separator
    class LocalSeparator(Separator):
        def setup_torch_device(self,system_info):
            # These adapters are PyTorch models. ONNX CUDA availability does
            # not determine their device and must not produce a false warning.
            import torch
            self.torch_device_cpu=torch.device('cpu')
            self.torch_device=torch.device('cuda' if torch.cuda.is_available() and not model.get('cpuOnly') else 'cpu')
            self.onnx_execution_provider=['CPUExecutionProvider']
        def download_model_files(self,filename):
            return model['file'],model['adapter'],model['name'],str(Path(model['directory'])/model['file']),str(Path(model['directory'])/model['config']) if model.get('config') else None
    # The model already performs overlapped, bounded-size inference internally.
    # Upstream file chunking uses pydub/ffprobe for files over three minutes;
    # our float WAV input needs neither that tool nor a second lossy split.
    separator=LocalSeparator(model_file_dir=model['directory'],output_dir=str(output),output_format='WAV',sample_rate=sr,use_soundfile=True,use_autocast=False,log_level=logging.WARNING,normalization_threshold=1.,demucs_params={'segment_size':7,'shifts':1,'overlap':.25,'segments_enabled':True},mdxc_params={'segment_size':model.get('segmentFrames',512),'override_model_segment_size':True,'batch_size':1,'overlap':4,'pitch_shift':0},chunk_duration=None)
    # audio-separator 0.47.1's MelBand constructor omits the configured
    # mask MLP expansion. Rebuild only those heads before strict weight loading.
    from audio_separator.separator.roformer.roformer_loader import RoformerLoader
    original_creator=RoformerLoader._create_mel_band_roformer
    def configured_mel(loader,config):
        net=original_creator(loader,config);factor=config.get('mlp_expansion_factor',4)
        if factor!=4:
            import torch
            from audio_separator.separator.uvr_lib_v5.roformer.mel_band_roformer import MaskEstimator
            dims=net.mask_estimators[0].dim_inputs
            net.mask_estimators=torch.nn.ModuleList([MaskEstimator(dim=config['dim'],dim_inputs=dims,depth=config.get('mask_estimator_depth',1),mlp_expansion_factor=factor) for _ in range(config.get('num_stems',2))])
        return net
    class LoadDiagnostics(logging.Handler):
        oom=False
        def emit(self,record):
            if 'out of memory' in record.getMessage().lower():self.oom=True
    diagnostics=LoadDiagnostics();logging.getLogger().addHandler(diagnostics)
    RoformerLoader._create_mel_band_roformer=configured_mel
    try:
        try:separator.load_model(model['file'])
        except SystemExit:
            if diagnostics.oom:raise RuntimeError('CUDA out of memory')
            raise ValueError('模型权重与配置不兼容，加载失败；已有歌曲和分轨保持完整')
    finally:
        RoformerLoader._create_mel_band_roformer=original_creator
        logging.getLogger().removeHandler(diagnostics)
    emit(.15,'模型已加载，正在使用 '+('NVIDIA 显卡' if separator.torch_device.type=='cuda' else 'CPU')+' 分离音轨')
    # Compressed input subtypes (MPEG_LAYER_III, VORBIS…) cannot be used
    # as WAV encodings by upstream's soundfile writer. Feed lossless float WAV.
    decoded=Path(output)/'_input.wav';sf.write(decoded,x,sr,subtype='FLOAT')
    files=separator.separate(str(decoded));outputs={}
    for filename in files:
        match=re.search(r'_\(([^)]+)\)',Path(filename).name)
        if not match:raise ValueError('模型输出文件缺少声部标记')
        raw=match.group(1);name=model.get('outputMap',{}).get(raw,ALIASES.get(raw.lower(),raw.lower()))
        if name in outputs:raise ValueError('模型产生了重复声部')
        y,out_sr=sf.read(Path(output)/filename,dtype='float32',always_2d=True)
        if out_sr!=sr:raise ValueError('模型输出采样率错误')
        if y.shape[1]==1:y=np.repeat(y,2,axis=1)
        outputs[name]=y
    assert_outputs(outputs,model['stems'],len(x));del separator;gc.collect()
    try:
        import torch
        if torch.cuda.is_available():torch.cuda.empty_cache()
    except ImportError:pass
    return outputs,sr

def normalized(outputs,length):
    return {name:np.pad(data,((0,max(0,length-len(data))),(0,0)))[:length] for name,data in outputs.items()}

def separate(request,emit):
    import librosa
    started=time.perf_counter()
    directory=Path(request['directory']);dest=directory/'.work'/str(uuid.uuid4());dest.mkdir(parents=True)
    model=request['model'];mode=request.get('mode','six');outputs,sr=run_model(model,request['source'],dest,emit)
    original,_=librosa.load(request['source'],sr=sr,mono=False);original=original.T
    if original.ndim==1:original=np.repeat(original[:,None],2,axis=1)
    outputs=normalized(outputs,len(original));emit(.92,'校验分轨并构建练习模式')
    if mode in ['guitarist','singer']:
        target='guitar' if mode=='guitarist' else 'vocals'
        if target not in outputs:raise ValueError('当前模型不包含此模式需要的声部，请选择六轨模型')
        stage=dest/'stage';stage.mkdir();source=stage/'input.wav';sf.write(source,outputs[target],sr,subtype='FLOAT')
        pair,_=run_model(request['secondaryModel'],source,stage,emit)
        pair=normalized(pair,len(original));keys=['lead','rhythm'] if mode=='guitarist' else ['lead_vocals','backing_vocals']
        assert_outputs(pair,keys,len(original));outputs={keys[0]:pair[keys[0]],keys[1]:outputs[target]-pair[keys[0]],'other':original-outputs[target]}
    elif mode=='basic':
        if not all(k in outputs for k in ['vocals','drums','bass']):raise ValueError('此模型无法生成基础四轨')
        outputs={k:outputs[k] for k in ['vocals','drums','bass']};outputs['other']=original-sum(outputs.values())
    elif mode in ['drummer','bassist','vocal']:
        target={'drummer':'drums','bassist':'bass','vocal':'vocals'}[mode]
        if target not in outputs:raise ValueError('模型不包含所选声部')
        outputs={target:outputs[target],'other':original-outputs[target]}
    assert_outputs(outputs,list(outputs),len(original))
    # A shared scale keeps relative gains; individual stem normalization breaks a mix.
    peak=max(1.,max(float(np.max(np.abs(v))) for v in outputs.values()));tracks=[]
    for name,data in outputs.items():
        file=dest/(name+'.wav');sf.write(file,data/peak,sr,subtype='FLOAT');tracks.append({'id':name,'name':name,'file':file.relative_to(directory).as_posix(),'gain':1,'pan':0,'mute':False,'solo':False})
    import torch
    return {'tracks':tracks,'separation':{'model':model['id'],'mode':mode,'scale':1/peak,'elapsedSeconds':round(time.perf_counter()-started,2),'peakCudaAllocatedMB':round(torch.cuda.max_memory_allocated()/1048576) if torch.cuda.is_available() else 0}}

def validate(request,emit):
    model=request['model'];sr=model['sampleRate']
    with tempfile.TemporaryDirectory() as tmp:
        file=Path(tmp)/'probe.wav';t=np.arange(sr*8)/sr;x=.025*np.sin(2*np.pi*220*t);sf.write(file,np.stack([x,x],axis=1),sr)
        outputs,_=run_model(model,file,Path(tmp),emit);assert_outputs(outputs,model['stems'],len(x))
    return {'validated':True,'stems':model['stems']}
