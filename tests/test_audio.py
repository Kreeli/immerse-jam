import json,sys,tempfile,unittest
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from separation import assert_outputs
from alignment import align

class AudioTests(unittest.TestCase):
    def test_harmony_smoothing_rejects_a_brief_flicker_but_keeps_a_real_change(self):
        from analysis import smooth_chords
        scores=np.array([[.9,.4],[.9,.4],[.72,.76],[.9,.4],[.4,.9],[.4,.9],[.4,.9]])
        self.assertEqual(smooth_chords(scores),[0,0,0,0,1,1,1])

    def test_custom_onnx_output_contract(self):
        import onnx,hashlib
        from onnx import helper,TensorProto
        from separation import run_model
        parent=Path(__file__).resolve().parents[1]/'.runtime'/'test-workspaces';parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as folder:
            directory=Path(folder);source=directory/'input.wav';x=np.random.default_rng(8).normal(0,.02,(11025,2)).astype(np.float32);sf.write(source,x,22050,subtype='FLOAT')
            nodes=[helper.make_node('Mul',['input','half'],['scaled']),helper.make_node('Unsqueeze',['scaled','axes'],['stem']),helper.make_node('Concat',['stem','stem'],['output'],axis=1)]
            initial=[helper.make_tensor('half',TensorProto.FLOAT,[],[.5]),helper.make_tensor('axes',TensorProto.INT64,[1],[1])]
            graph=helper.make_graph(nodes,'two-stem-contract',[helper.make_tensor_value_info('input',TensorProto.FLOAT,[1,2,None])],[helper.make_tensor_value_info('output',TensorProto.FLOAT,[1,2,2,None])],initial)
            model=helper.make_model(graph,opset_imports=[helper.make_opsetid('',17)]);model.ir_version=9;onnx.save(model,directory/'model.onnx')
            spec={'adapter':'onnx-waveform','directory':folder,'file':'model.onnx','stems':['vocals','other'],'sampleRate':22050,'chunkSeconds':1}
            outputs,_=run_model(spec,source,directory,lambda *args:None);assert_outputs(outputs,spec['stems'],len(x))
            np.testing.assert_allclose(outputs['vocals']+outputs['other'],x,atol=1e-5)
            with self.assertRaises(ValueError):run_model({**spec,'stems':['one']},source,directory,lambda *args:None)

    def test_reject_wrong_stems_lengths_and_nan(self):
        audio=np.zeros((5000,2),np.float32)
        with self.assertRaises(ValueError):assert_outputs({'vocals':audio},['vocals','other'],5000)
        with self.assertRaises(ValueError):assert_outputs({'vocals':audio},['vocals'],20000)
        audio[0,0]=np.nan
        with self.assertRaises(ValueError):assert_outputs({'vocals':audio},['vocals'],5000)

    def test_variable_tempo_alignment_is_monotone_and_serializable(self):
        import pretty_midi
        parent=Path(__file__).resolve().parents[1]/'.runtime'/'test-workspaces';parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as folder:
            midi=pretty_midi.PrettyMIDI();instrument=pretty_midi.Instrument(0);sr=11025
            pitches=[60,64,67,62,65,69,59,63,66,61,65,68]
            durations=[.8,.8,.8,1.1,1.1,1.1,.65,.65,.65,.9,.9,.9]
            pieces=[np.zeros(int(.3*sr))];audio_times=[];cursor=.3
            for i,(pitch,duration) in enumerate(zip(pitches,durations)):
                instrument.notes.append(pretty_midi.Note(100,pitch,float(i),float(i+.9)))
                audio_times.append(cursor);t=np.arange(int(duration*sr))/sr;freq=440*2**((pitch-69)/12)
                tone=sum(np.sin(2*np.pi*freq*k*t)/k for k in range(1,4))*.1
                tone*=np.minimum(1,t/.02)*np.minimum(1,(duration-t)/.04);pieces.append(tone);cursor+=len(tone)/sr
            midi.instruments.append(instrument);mf=Path(folder)/'score.mid';af=Path(folder)/'audio.wav';midi.write(str(mf));sf.write(af,np.concatenate(pieces),sr)
            result=align(af,mf,lambda *args:None);json.dumps(result)
            points=result['points'];times=[p['audioTime'] for p in points]
            self.assertTrue(all(a<=b for a,b in zip(times,times[1:])))
            predicted=np.interp(np.arange(1,11),[p['scoreTime'] for p in points],times)
            error=float(np.median(np.abs(predicted-np.array(audio_times[1:11]))))
            self.assertLess(error,.45,f'median alignment error {error:.2f}s')
            self.assertGreater(times[-1],cursor-1)

if __name__=='__main__':unittest.main()
