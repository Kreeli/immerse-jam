"""Local beat tracking and conservative tempo summaries.

Beat This! inference is supplied under MIT by CPJKU; see vendor/beat_this.
"""
import gc,logging,sys
from pathlib import Path
import numpy as np


def summarize(beats,downbeats=()):
    beats=np.unique(np.asarray(beats,dtype=float));beats=beats[np.isfinite(beats)&(beats>=0)]
    downbeats=np.unique(np.asarray(downbeats,dtype=float));downbeats=downbeats[np.isfinite(downbeats)&(downbeats>=0)]
    if len(beats)<4:return {'bpm':0.,'beats':beats.tolist(),'downbeats':downbeats.tolist(),'beatsPerBar':4,'tempoStability':0.,'tempoCandidates':[]}
    # A median of multi-beat spans reduces frame-grid quantization and ignores
    # occasional missed/doubled detections. It does not claim a calibrated confidence.
    width=min(16,max(2,len(beats)//4));spans=(beats[width:]-beats[:-width])/width
    spans=spans[(spans>60/350)&(spans<60/20)]
    if not len(spans):return {'bpm':0.,'beats':beats.tolist(),'downbeats':downbeats.tolist(),'beatsPerBar':4,'tempoStability':0.,'tempoCandidates':[]}
    interval=float(np.median(spans));mad=float(np.median(np.abs(spans-interval)));bpm=round(60/interval,2)
    counts=[int(np.searchsorted(beats,b-.04)-np.searchsorted(beats,a-.04)) for a,b in zip(downbeats[:-1],downbeats[1:])]
    counts=[count for count in counts if count in [2,3,4,6]]
    meter=max(set(counts),key=counts.count) if counts else 4
    return {'bpm':bpm,'beats':beats.tolist(),'downbeats':downbeats.tolist(),'beatsPerBar':meter,'tempoStability':round(max(0.,1.-5*mad/interval),3),'tempoCandidates':[round(value,2) for value in [bpm/2,bpm,bpm*2] if 20<=value<=350]}


def detect(y,sr,model=None,emit=lambda *args:None):
    if model:
        try:
            import torch
            vendor=str(Path(__file__).resolve().parent/'vendor')
            if vendor not in sys.path:sys.path.insert(0,vendor)
            from beat_this.inference import Audio2Beats
            checkpoint=Path(model['directory'])/model['file']
            if not checkpoint.is_file():raise FileNotFoundError(checkpoint)
            device='cuda' if torch.cuda.is_available() and not model.get('cpuOnly') else 'cpu'
            emit(.4,'在本机识别节拍与小节首拍')
            tracker=Audio2Beats(checkpoint_path=str(checkpoint),device=device,dbn=False,float16=False)
            beats,downbeats=tracker(y,sr)
            result=summarize(beats,downbeats)
            del tracker;gc.collect()
            if torch.cuda.is_available():torch.cuda.empty_cache()
            if result['bpm']>0:return {**result,'tempoMethod':'beat-this'}
        except Exception as error:
            logging.getLogger(__name__).warning('Beat This! unavailable; using basic tempo estimation: %s',error)
    import librosa
    emit(.42,'使用基础方法估计节拍')
    hop=256
    onset=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop,aggregate=np.median)
    if not np.any(onset>1e-5):return {**summarize([]),'tempoMethod':'basic'}
    _,frames=librosa.beat.beat_track(onset_envelope=onset,sr=sr,hop_length=hop,trim=False)
    return {**summarize(librosa.frames_to_time(frames,sr=sr,hop_length=hop)),'tempoMethod':'basic'}
