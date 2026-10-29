"""Synthetic parity vectors for the Android feature pipeline, never personal audio."""
import json,os,subprocess,sys
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'/'vendor'))
from beat_this.preprocessing import LogMelSpect
from beat_this.inference import Audio2Beats

dest=ROOT/'.runtime/android/beat-parity';dest.mkdir(parents=True,exist_ok=True)
rate=44100;duration=36;t=np.arange(rate*duration)/rate
rng=np.random.default_rng(9201);audio=np.zeros(len(t))
for beat in np.arange(.4,duration,.5):
    x=t-beat;gate=(x>=0)&(x<.24)
    audio[gate]+=.4*np.sin(2*np.pi*(70*x[gate]+20*(1-np.exp(-30*x[gate]))))*np.exp(-22*x[gate])
    audio[gate]+=.10*rng.normal(size=gate.sum())*np.exp(-35*x[gate])
for i,pitches in enumerate([[48,60,64,67],[53,60,65,69],[55,59,62,67]]):
    a=i*12;b=a+12;x=t[a*rate:b*rate]-a
    for pitch in pitches:audio[a*rate:b*rate]+=.025*(np.sin(2*np.pi*440*2**((pitch-69)/12)*x)+.2*np.sin(4*np.pi*440*2**((pitch-69)/12)*x))
sf.write(dest/'input.wav',audio,rate,subtype='PCM_16')
ffmpeg=ROOT/'.runtime/tools/ffmpeg.exe'
subprocess.run([str(ffmpeg),'-v','error','-y','-i',str(dest/'input.wav'),'-ar','22050','-ac','1','-c:a','pcm_f32le',str(dest/'reference.wav')],check=True)
y,sr=sf.read(dest/'reference.wav',dtype='float32')
spect=LogMelSpect()(torch.from_numpy(y)).detach().numpy().astype('<f4');spect.tofile(dest/'spectrogram.bin')
tracker=Audio2Beats(checkpoint_path=str(ROOT/'.runtime/models/beat-this/final0.ckpt'),device='cpu',float16=False,dbn=False)
torch.set_num_threads(2)
beats,downbeats=tracker(y,sr)
(dest/'beats.txt').write_text('\n'.join(map(str,beats)))
(dest/'downbeats.txt').write_text('\n'.join(map(str,downbeats)))
window=np.sin(2*np.pi*440*np.arange(1024)/22050)+.3*np.sin(2*np.pi*1760*np.arange(1024)/22050)
stft=torch.stft(torch.tensor(window,dtype=torch.float32),n_fft=1024,hop_length=441,window=torch.hann_window(1024),center=False,normalized=True,return_complex=True).abs()[:,0]
np.log1p(1000*(stft.numpy()@LogMelSpect().spect_class.mel_scale.fb.numpy())).astype('<f4').tofile(dest/'frame.bin')
print(json.dumps({'frames':len(spect),'desktopBeats':beats.tolist(),'desktopDownbeats':downbeats.tolist()}))
