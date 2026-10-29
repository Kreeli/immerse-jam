"""Run developer-generated Java log-mel chunks through ONNX, compare desktop timings."""
from pathlib import Path
import sys,json
import numpy as np
import onnxruntime as ort
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/vendor'))
from beat_this.model.postprocessor import Postprocessor
import torch
folder=ROOT/'.runtime/android/beat-parity'
session=ort.InferenceSession(str(ROOT/'.runtime/android/models/beat-this-mobile.onnx'),providers=['CPUExecutionProvider'])
length=int((folder/'native-frames.txt').read_text());beat=np.full(length,-1000,dtype=np.float32);downbeat=beat.copy();covered=0
starts=list(range(-6,length-6,1488))
if length>1488:starts[-1]=length-1494
for index,start in enumerate(starts):
    spect=np.fromfile(folder/f'native-{index}.bin',dtype='<f4').reshape(1,-1,128)
    b,d=session.run(None,{'spectrogram':spect})
    for j in range(6,spect.shape[1]-6):
        i=start+j
        if covered<=i<length:beat[i]=b[0,j];downbeat[i]=d[0,j]
    covered=max(covered,min(length,start+spect.shape[1]-6))
beats,downs=Postprocessor(type='minimal')(torch.from_numpy(beat),torch.from_numpy(downbeat))
ref=np.loadtxt(folder/'beats.txt');refdown=np.loadtxt(folder/'downbeats.txt')
assert len(beats)==len(ref),(len(beats),len(ref))
assert len(downs)==len(refdown),(len(downs),len(refdown))
errors=[float(np.max(np.abs(beats-ref))),float(np.max(np.abs(downs-refdown)))]
assert max(errors)<=.021,errors
beat.astype('<f4').tofile(folder/'native-beat-logits.bin');downbeat.astype('<f4').tofile(folder/'native-downbeat-logits.bin')
print(json.dumps({'beats':len(beats),'downbeats':len(downs),'maxTimeErrorSeconds':errors,'crossesThirtySecondBoundary':True}))
