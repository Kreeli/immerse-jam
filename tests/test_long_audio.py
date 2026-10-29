import math,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from alignment import bounded_step, MAX_CELLS

class LongAudioTests(unittest.TestCase):
    def test_dtw_cost_stays_bounded_for_hours_and_asymmetric_inputs(self):
        for rows,columns in [(36000,36000),(144000,144000),(9000,144000),(1,10000000)]:
            step=bounded_step(rows,columns)
            self.assertLessEqual(math.ceil(rows/step)*math.ceil(columns/step),MAX_CELLS)

    def test_chunked_features_preserve_global_frame_grid(self):
        import librosa
        from audio_io import chroma_blocks,onset_blocks
        sr=11025;hop=1102;t=np.arange(sr*65)/sr
        y=(.2*np.sin(2*np.pi*220*t)).astype(np.float32)
        actual=chroma_blocks(y,sr,hop);expected=librosa.feature.chroma_stft(y=y,sr=sr,n_fft=2048,hop_length=hop)
        self.assertLessEqual(abs(actual.shape[1]-expected.shape[1]),1)
        # Exclude the outer context affected by centered padding.
        np.testing.assert_allclose(actual[:,4:-4],expected[:,4:actual.shape[1]-4],atol=.003)
        self.assertLessEqual(abs(len(onset_blocks(y,sr,hop))-expected.shape[1]),1)

    def test_float_stems_preserve_loudness_instead_of_hiding_a_scale(self):
        from separation import separate
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);sr=22050;t=np.arange(sr)/sr;original=np.stack([.2*np.sin(2*np.pi*220*t)]*2,axis=1).astype(np.float32)
            source=root/'input.wav';sf.write(source,original,sr,subtype='FLOAT')
            primary=original*8
            with patch('separation.run_model',return_value=({'vocals':primary,'other':original-primary},sr)):
                result=separate({'directory':folder,'source':str(source),'model':{'id':'fixture'},'mode':'vocal'},lambda *args:None)
            self.assertEqual(result['separation']['scale'],1)
            arrays=[sf.read(root/track['file'],dtype='float32')[0] for track in result['tracks']]
            self.assertGreater(np.max(np.abs(arrays[0])),1)
            np.testing.assert_allclose(sum(arrays),original,atol=2e-7)

if __name__=='__main__':unittest.main()
