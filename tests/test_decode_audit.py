import os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import soundfile as sf
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from analysis import decode

class DecodeAuditTests(unittest.TestCase):
    def setUp(self):
        parent = Path(__file__).resolve().parents[1] / '.runtime' / 'test-workspaces'
        parent.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=parent)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source.wav'
        self.target = self.root / 'playback.wav'
        sf.write(self.source, np.zeros((4410, 2), np.float32), 44100, subtype='FLOAT')
        self.target.write_bytes(b'Keep the previous playback file')
        self.before = self.target.read_bytes()

    def test_failed_decoder_preserves_previous_playback_and_removes_partial_output(self):
        def fail(args, **_kwargs):
            Path(args[-1]).write_bytes(b'partial decoder output')
            raise subprocess.CalledProcessError(1, args)
        with patch.dict(os.environ, {'IMMERSE_FFMPEG': 'fixture-decoder'}), patch('analysis.subprocess.run', side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError):
                decode(self.source, self.target)
        self.assertEqual(self.target.read_bytes(), self.before)
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['playback.wav', 'source.wav'])

    def test_oversized_decode_is_bounded_and_cannot_replace_valid_playback(self):
        observed = []
        def oversized(args, **_kwargs):
            observed.extend(args)
            Path(args[-1]).write_bytes(b'oversized fixture')
        with patch.dict(os.environ, {'IMMERSE_FFMPEG': 'fixture-decoder'}), patch('analysis.subprocess.run', side_effect=oversized), patch('analysis.sf.info', return_value=SimpleNamespace(duration=14401)):
            with self.assertRaisesRegex(ValueError, '最长四小时'):
                decode(self.source, self.target)
        self.assertEqual(observed[observed.index('-t') + 1], '14401')
        self.assertEqual(observed[observed.index('-rf64') + 1], 'auto')
        self.assertEqual(self.target.read_bytes(), self.before)
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['playback.wav', 'source.wav'])

    def test_invalid_decoded_duration_preserves_previous_playback(self):
        def invalid(args, **_kwargs):
            Path(args[-1]).write_bytes(b'empty decode fixture')

        with patch.dict(os.environ, {'IMMERSE_FFMPEG': 'fixture-decoder'}), patch('analysis.subprocess.run', side_effect=invalid):
            for duration in (0, -1, float('nan'), float('inf')):
                with self.subTest(duration=duration), patch('analysis.sf.info', return_value=SimpleNamespace(duration=duration)):
                    with self.assertRaisesRegex(ValueError, '没有可读取的采样'):
                        decode(self.source, self.target)
                    self.assertEqual(self.target.read_bytes(), self.before)
                    self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['playback.wav', 'source.wav'])

    def test_successful_decode_atomically_replaces_the_previous_file(self):
        decoder = shutil.which('ffmpeg')
        if not decoder:
            self.skipTest('FFmpeg is unavailable')
        with patch.dict(os.environ, {'IMMERSE_FFMPEG': decoder}):
            info = decode(self.source, self.target)
        self.assertAlmostEqual(info.duration, .1, places=5)
        self.assertEqual(info.samplerate, 44100)
        samples, _ = sf.read(self.target, always_2d=True)
        self.assertEqual(samples.shape, (4410, 2))
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['playback.wav', 'source.wav'])

if __name__ == '__main__':
    unittest.main()
