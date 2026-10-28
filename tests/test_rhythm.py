import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from rhythm import summarize

class RhythmTests(unittest.TestCase):
    def test_quantized_beat_times_do_not_bias_tempo_to_the_single_interval_grid(self):
        expected=129.
        beats=np.round((.24+np.arange(160)*60/expected)*50)/50
        result=summarize(beats,beats[::4])
        self.assertLess(abs(result['bpm']-expected),.2)
        self.assertEqual(result['beatsPerBar'],4)
        self.assertGreater(result['tempoStability'],.9)

    def test_meter_and_missing_beat_are_handled_without_inventing_silence_tempo(self):
        beats=.2+np.arange(100)*.5
        result=summarize(np.delete(beats,30),beats[::3])
        self.assertLess(abs(result['bpm']-120),1)
        self.assertEqual(result['beatsPerBar'],3)
        self.assertEqual(summarize([])['bpm'],0)
        self.assertEqual(summarize([0,1])['bpm'],0)

if __name__=='__main__':unittest.main()
