"""Developer-only conversion of the same pinned Beat This! weights used by Windows.

No Python is used on Android. Keep the exported model and mel matrix out of Git.
"""
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'/'vendor'))
from beat_this.inference import load_model
from beat_this.preprocessing import LogMelSpect

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--checkpoint',type=Path,default=ROOT/'.runtime/models/beat-this/final0.ckpt')
    parser.add_argument('--output',type=Path,default=ROOT/'.runtime/android/models')
    args=parser.parse_args()
    if hashlib.sha256(args.checkpoint.read_bytes()).hexdigest()!='8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331':raise ValueError('Unverified Beat This! checkpoint')
    args.output.mkdir(parents=True,exist_ok=True)
    torch.set_num_threads(2)
    model=load_model(str(args.checkpoint),'cpu')
    class Export(torch.nn.Module):
        def __init__(self):super().__init__();self.model=model
        def forward(self,x):
            out=self.model(x)
            return out['beat'],out['downbeat']
    module=Export().eval(); sample=torch.rand(1,1500,128)
    # Warm the fixed rotary cache before tracing. Time length matches desktop's 30 s chunks.
    with torch.inference_mode():reference=module(sample)
    target=args.output/'beat-this-mobile.onnx'
    torch.onnx.export(module,sample,str(target),input_names=['spectrogram'],output_names=['beat','downbeat'],dynamic_axes={'spectrogram':{1:'frames'},'beat':{1:'frames'},'downbeat':{1:'frames'}},opset_version=17,dynamo=False)
    import onnxruntime as ort
    session=ort.InferenceSession(str(target),providers=['CPUExecutionProvider'])
    result=session.run(None,{'spectrogram':sample.numpy()})
    differences=[float(np.max(np.abs(a-b.numpy()))) for a,b in zip(result,reference)]
    for length in [72,612]:
        value=sample[:,:length].clone()
        with torch.inference_mode(): expected=module(value)
        actual=session.run(None,{'spectrogram':value.numpy()})
        differences.extend(float(np.max(np.abs(a-b.numpy()))) for a,b in zip(actual,expected))
    if max(differences)>.002:raise ValueError(f'ONNX differs from desktop model: {differences}')
    mel=LogMelSpect().spect_class.mel_scale.fb.detach().numpy().astype('<f4')
    mel.tofile(args.output/'beat-this-mel.bin')
    print(json.dumps({'model':{'sizeBytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()},'mel':{'shape':list(mel.shape),'sha256':hashlib.sha256((args.output/'beat-this-mel.bin').read_bytes()).hexdigest()},'maximumLogitDifference':differences},indent=2))

if __name__=='__main__':main()
