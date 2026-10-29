"""Disk-backed PCM and bounded feature blocks for long recordings."""
import os, shutil, subprocess, uuid
from pathlib import Path
import numpy as np

BLOCK = 131072

def pcm(source, directory, sr, channels=2):
    target = Path(directory) / ('pcm-' + str(uuid.uuid4()) + '.f32')
    ffmpeg = os.environ.get('IMMERSE_FFMPEG') or shutil.which('ffmpeg')
    if not ffmpeg:
        local = Path(__file__).resolve().parents[1] / 'node_modules/ffmpeg-static/ffmpeg.exe'
        if local.is_file(): ffmpeg = str(local)
    if not ffmpeg: raise ValueError('未找到应用音频解码组件')
    subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(source), '-vn', '-t', '14401', '-ac', str(channels), '-ar', str(sr), '-f', 'f32le', str(target)], check=True, creationflags=0x08000000 if os.name == 'nt' else 0)
    frames = target.stat().st_size // (4 * channels)
    if frames < 1: raise ValueError('音频中没有可读取的采样')
    if frames > sr * 14400: target.unlink(); raise ValueError('音频最长四小时，请先分段处理')
    return np.memmap(target, mode='r', dtype='float32', shape=(frames,) if channels == 1 else (frames, channels))

def mapped(directory, shape):
    return np.memmap(Path(directory) / ('buffer-' + str(uuid.uuid4()) + '.f32'), mode='w+', dtype='float32', shape=shape)

def chroma_blocks(y, sr, hop, harmonic=False):
    import librosa
    n_fft = 4096 if harmonic else 2048
    # Context on both sides preserves HPSS median windows across block seams.
    padding = 32 * hop
    core = hop * max(1, int(30 * sr / hop))
    parts = []
    for begin in range(0, len(y), core):
        left = max(0, begin - padding); end = min(len(y), begin + core)
        block = np.asarray(y[left:min(len(y), end + padding)])
        spectrum = librosa.stft(block, n_fft=n_fft, hop_length=hop)
        if harmonic: spectrum = librosa.decompose.hpss(spectrum)[0]
        values = librosa.feature.chroma_stft(S=np.abs(spectrum)**2, sr=sr, n_fft=n_fft, hop_length=hop)
        offset = (begin - left) // hop; count = (end - begin + hop - 1) // hop
        parts.append(values[:, offset:offset + count])
    return np.concatenate(parts, axis=1)

def onset_blocks(y, sr, hop):
    import librosa
    padding = 32 * hop; core = hop * max(1, int(30 * sr / hop)); parts = []
    for begin in range(0, len(y), core):
        left = max(0, begin - padding); end = min(len(y), begin + core)
        values = librosa.onset.onset_strength(y=np.asarray(y[left:min(len(y), end + padding)]), sr=sr, hop_length=hop, aggregate=np.median)
        offset = (begin - left) // hop; count = (end - begin + hop - 1) // hop
        parts.append(values[offset:offset + count])
    return np.concatenate(parts)
