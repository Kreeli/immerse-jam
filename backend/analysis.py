import json, math, os, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf

def decode(source, destination, sr=44100):
    Path(destination).parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([os.environ['IMMERSE_FFMPEG'],'-nostdin','-v','error','-y','-i',str(source),'-vn','-ac','2','-ar',str(sr),'-c:a','pcm_f32le',str(destination)],check=True,creationflags=0x08000000 if os.name=='nt' else 0)
    return sf.info(destination)

def peaks(file, count=1800):
    info=sf.info(file); size=max(1,math.ceil(info.frames/count)); result=[]
    with sf.SoundFile(file) as f:
        for block in f.blocks(blocksize=size, dtype='float32',always_2d=True):
            result.append(round(float(np.max(np.abs(block))),5))
    return {'duration':info.duration,'sampleRate':info.samplerate,'peaks':result}

def analyze(file, emit, tempo_model=None):
    import librosa
    from scipy.ndimage import median_filter
    emit(.12,'提取节拍与音高特征')
    y,sr=librosa.load(file,sr=22050,mono=True)
    if len(y)<2048: raise ValueError('音频太短，无法分析')
    hop=1024
    # Percussive attacks should locate beats, not dominate chord names.
    spectrum=librosa.stft(y,n_fft=4096,hop_length=hop)
    harmonic,_=librosa.decompose.hpss(spectrum)
    chroma=librosa.feature.chroma_stft(S=np.abs(harmonic)**2,sr=sr,hop_length=hop,n_fft=4096)
    chroma=median_filter(chroma,size=(1,5))
    onset=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop)
    from rhythm import detect
    rhythm=detect(y,sr,tempo_model,emit)
    beat_times=np.array(rhythm['beats']);beat_times=beat_times[(beat_times>=0)&(beat_times<len(y)/sr)];rhythm['downbeats']=[time for time in rhythm['downbeats'] if 0<=time<len(y)/sr];bpm=rhythm['bpm']
    emit(.65,'识别和弦与调性')
    names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B']
    qualities={'':[0,4,7],'m':[0,3,7],'7':[0,4,7,10],'maj7':[0,4,7,11],'m7':[0,3,7,10],'dim':[0,3,6],'sus2':[0,2,7],'sus4':[0,5,7]}
    templates=[];labels=[];complexity=[]
    for root in range(12):
        for suffix,intervals in qualities.items():
            t=np.full(12,-.1);t[[(root+i)%12 for i in intervals]]=1;t[root]=1.15
            templates.append(t/np.linalg.norm(t));labels.append(names[root]+suffix);complexity.append(.035 if len(intervals)>3 else .015 if suffix in ['sus2','sus4','dim'] else 0.)
    templates=np.array(templates)
    boundaries=np.unique(np.r_[0,beat_times,len(y)/sr]);chords=[];features=[];energies=[];spans=[]
    for a,b in zip(boundaries[:-1],boundaries[1:]):
        if b-a<.03:continue
        section=chroma[:,int(a*sr/hop):max(int(a*sr/hop)+1,int(b*sr/hop))]
        v=np.mean(section,axis=1);n=np.linalg.norm(v)
        energy=float(np.sqrt(np.mean(y[int(a*sr):max(int(a*sr)+1,int(b*sr))]**2)))
        features.append(templates@(v/(n+1e-8))-np.array(complexity));energies.append(energy);spans.append((a,b))
    scores=np.array(features)
    states=smooth_chords(scores)
    for index,((a,b),state) in enumerate(zip(spans,states)):
        confidence=float(np.clip(scores[index,state],0,1));label=labels[state] if energies[index]>.003 else 'N'
        if chords and chords[-1]['label']==label:
            previous=chords[-1];length=previous['end']-previous['start']
            previous['confidence']=round((previous['confidence']*length+confidence*(b-a))/(length+b-a),3);previous['end']=float(b)
        else:chords.append({'start':float(a),'end':float(b),'label':label,'confidence':round(confidence,3)})
    major=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]);minor=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]);avg=chroma.mean(axis=1)
    candidates=[(float(np.corrcoef(avg,np.roll(profile,r))[0,1]),names[r]+suffix) for profile,suffix in [(major,''),(minor,'m')] for r in range(12)]
    strength=np.array([onset[min(len(onset)-1,int(t*sr/hop))] for t in beat_times])
    phase=max(range(min(4,len(strength))),key=lambda i:float(np.mean(strength[i::4]))) if len(strength) else 0
    return {**rhythm,'bpm':round(bpm,2),'beats':beat_times.tolist(),'beatsPerBar':rhythm['beatsPerBar'],'downbeat':float(rhythm['downbeats'][0]) if rhythm['downbeats'] else float(beat_times[phase]) if len(beat_times) else 0.,'chords':chords,'key':max(candidates)[1] if float(np.std(avg))>1e-7 else '—','method':'harmonic-beat-viterbi-v3','editable':True,'tempoReviewed':False}


def smooth_chords(scores,change_cost=.14):
    """Find a coherent harmonic sequence; retain real changes on beat boundaries."""
    if len(scores)==0:return []
    value=scores[0].copy();back=np.zeros(scores.shape,np.int32)
    for index in range(1,len(scores)):
        best=int(np.argmax(value));change=value[best]-change_cost
        stay=value>=change
        back[index]=np.where(stay,np.arange(len(value)),best)
        value=scores[index]+np.where(stay,value,change)
    state=int(np.argmax(value));result=[state]
    for index in range(len(scores)-1,0,-1):
        state=int(back[index,state]);result.append(state)
    return result[::-1]
