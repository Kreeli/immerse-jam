import contextlib,json,os,sys,traceback
from pathlib import Path

def event(**data): print(json.dumps(data,ensure_ascii=False),flush=True)
def progress(value,message):event(type='progress',progress=value,message=message)

def main(request):
    if os.environ.get('IMMERSE_FFMPEG'):
        os.environ['PATH']=str(Path(os.environ['IMMERSE_FFMPEG']).parent)+os.pathsep+os.environ.get('PATH','')
    op=request['operation'];directory=Path(request.get('directory','.'))
    if op=='probe':
        import torch
        return {'cuda':torch.cuda.is_available(),'device':torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}
    if op=='prepare':
        from analysis import decode,peaks
        target=directory/'media'/'playback.wav';decode(request['source'],target);return {'duration':peaks(target)['duration'],'waveform':peaks(target),'playback':'media/playback.wav'}
    if op=='analyze':
        from analysis import analyze
        return {'analysis':analyze(request['source'],progress,request.get('tempoModel'))}
    if op=='align':
        from alignment import align
        return {'alignment':align(request['source'],request['midi'],progress)}
    if op in ['separate','validate-model']:
        from separation import separate,validate
        return validate(request,progress) if op=='validate-model' else separate(request,progress)
    raise ValueError('未知本地操作')

if __name__=='__main__':
    try:
        request=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        # Third-party progress belongs on stderr; stdout is a JSON-lines protocol.
        protocol=sys.stdout
        def event(**data): print(json.dumps(data,ensure_ascii=False),file=protocol,flush=True)
        with contextlib.redirect_stdout(sys.stderr):result=main(request)
        event(type='result',result=result)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        if isinstance(error,FileNotFoundError):message='音频处理组件或源文件无法找到，请检查文件是否仍在本机并更新应用。'
        elif isinstance(error,MemoryError) or 'out of memory' in str(error).lower():message='可用内存不足，请关闭其他占用较高的程序后重试。'
        elif isinstance(error,ValueError):message=str(error)
        else:message='本地处理未完成：'+str(error).splitlines()[-1][:180]
        event(type='failure',message=message);sys.exit(1)
