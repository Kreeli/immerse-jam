import json,sys,time
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from rhythm import detect
folder=ROOT/'.runtime'/'rhythm-check';folder.mkdir(parents=True,exist_ok=True)
model={'directory':str(ROOT/'.runtime/models/beat-this'),'file':'final0.ckpt'}
def music(bpm,duration=32):
    sr=22050;audio=np.zeros(int(duration*sr),np.float32);rng=np.random.default_rng(131)
    def add(at,signal):
        start=int(at*sr);end=min(len(audio),start+len(signal))
        if start<len(audio):audio[start:end]+=signal[:end-start]
    beat=60/bpm
    for index,at in enumerate(np.arange(.25,duration,beat)):
        t=np.arange(int(.24*sr))/sr
        if index%2==0:signal=.6*np.sin(2*np.pi*(65*t+1.8*(1-np.exp(-t*35))))*np.exp(-t*20)
        else:signal=.3*rng.normal(size=len(t))*np.exp(-t*22)
        add(at,signal)
    for at in np.arange(.25,duration,beat/2):
        t=np.arange(int(.04*sr))/sr;add(at,.08*rng.normal(size=len(t))*np.exp(-t*100))
    t=np.arange(len(audio))/sr;audio+=.025*(np.sin(2*np.pi*130.81*t)+np.sin(2*np.pi*164.81*t)+np.sin(2*np.pi*196*t))
    return audio,sr
results=[]
for expected in [90,120,150]:
    audio,sr=music(expected);sf.write(folder/f'drums-{expected}.wav',audio,sr);started=time.perf_counter();result=detect(audio,sr,model)
    assert result['tempoMethod']=='beat-this',result
    assert abs(result['bpm']-expected)<1.5,(expected,result['bpm'])
    results.append({'expected':expected,'estimated':result['bpm'],'meter':result['beatsPerBar'],'seconds':round(time.perf_counter()-started,2)})
audio,sr=music(120,10);cpu=detect(audio,sr,{**model,'cpuOnly':True});assert cpu['tempoMethod']=='beat-this' and abs(cpu['bpm']-120)<2,cpu
report={'synthetic':results,'cpu120':cpu['bpm']}
if len(sys.argv)>1:
    import librosa
    y,sr=librosa.load(sys.argv[1],sr=22050,mono=True);actual=detect(y,sr,model)
    assert actual['tempoMethod']=='beat-this' and len(actual['beats'])>4,actual
    report['optionalAudio']={'bpm':actual['bpm'],'meter':actual['beatsPerBar'],'beats':len(actual['beats']),'downbeats':len(actual['downbeats'])}
(folder/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print('RHYTHM_MODEL_CHECK_PASSED',json.dumps(report),flush=True)
