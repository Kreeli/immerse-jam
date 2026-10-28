import numpy as np

def midi_features(file, rate=10):
    import pretty_midi
    midi=pretty_midi.PrettyMIDI(str(file)); duration=midi.get_end_time()
    if duration<=0:raise ValueError('MIDI 中没有可对齐的音符')
    features=np.zeros((12,int(duration*rate)+2),dtype=np.float32);notes=[]
    for instrument in midi.instruments:
        for n in instrument.notes:
            notes.append({'start':float(n.start),'end':float(n.end),'pitch':int(n.pitch),'velocity':int(n.velocity),'drum':bool(instrument.is_drum),'program':int(instrument.program)})
            if not instrument.is_drum:features[n.pitch%12,int(n.start*rate):max(int(n.start*rate)+1,int(n.end*rate))]+=n.velocity/127
    if not np.any(features):raise ValueError('此 MIDI 只有打击乐；请附带旋律/和声轨道以进行音高对齐')
    return midi,features,notes

def align(file,midi_file,emit):
    import librosa
    from scipy.ndimage import median_filter
    emit(.08,'展开乐谱反复并读取 MIDI 时间轴')
    rate=10; midi,score,notes=midi_features(midi_file,rate)
    y,sr=librosa.load(file,sr=11025,mono=True);hop=1102
    emit(.2,'计算原曲音高特征')
    audio=librosa.feature.chroma_stft(y=y,sr=sr,n_fft=2048,hop_length=hop)
    audio=median_filter(audio,size=(1,3));score=median_filter(score,size=(1,3))
    # Bounded at 10 Hz: 10-minute songs use ~144 MB for the cost matrix.
    if score.shape[1]*audio.shape[1]>80_000_000:
        score=score[:,::2];audio=audio[:,::2];rate=5
    score/=np.maximum(np.linalg.norm(score,axis=0,keepdims=True),1e-7)
    audio/=np.maximum(np.linalg.norm(audio,axis=0,keepdims=True),1e-7)
    # Match transposed recordings as well as concert-pitch scores.
    offset=max(range(12),key=lambda k:float(np.dot(np.roll(score.mean(axis=1),k),audio.mean(axis=1))))
    emit(.35,'匹配小节、速度变化与原曲位置')
    similarity=np.clip(1-np.roll(score,offset,axis=0).T@audio,0,2).astype(np.float32)
    subsequence=score.shape[1]<audio.shape[1]*.8
    # Whole-song scores need an end-to-end path: unconstrained subsequence
    # matching can incorrectly squeeze repeated harmonies into half a song.
    cost=similarity.copy()
    if not subsequence:
        relative=np.abs(np.linspace(0,1,cost.shape[0])[:,None]-np.linspace(0,1,cost.shape[1])[None,:])
        cost+=np.maximum(0,relative-.12)*1.5
    _,path=librosa.sequence.dtw(C=cost,subseq=subsequence,step_sizes_sigma=np.array([[1,1],[1,2],[2,1]]),weights_add=np.array([0.,.15,.15]))
    # With an explicit C matrix librosa flips the returned axes when N > M,
    # although C itself was not transposed. Restore score/audio ordering.
    if subsequence and cost.shape[0]>cost.shape[1]:path=path[:,::-1]
    path=path[::-1];mapping=[];confidences=[]
    for i in np.unique(path[:,0]):
        js=path[path[:,0]==i,1];j=float(np.median(js));confidence=float(1-np.mean(similarity[i,js]));mapping.append((float(i/rate),j/rate));confidences.append(confidence)
    # Resample to half-second anchors; each anchor stays monotone.
    times=np.arange(0,midi.get_end_time()+.001,.5);xs=np.array([p[0] for p in mapping]);ys=np.array([p[1] for p in mapping]);values=np.maximum.accumulate(np.interp(times,xs,ys))
    points=[{'scoreTime':round(float(t),4),'audioTime':round(float(a),4),'confidence':round(float(np.interp(t,xs,confidences)),3)} for t,a in zip(times,values)]
    if not points or points[-1]['scoreTime']<midi.get_end_time():points.append({'scoreTime':midi.get_end_time(),'audioTime':float(ys[-1]),'confidence':float(confidences[-1])})
    emit(.95,'生成同步锚点和待检查片段')
    confidence=float(np.mean(confidences));return {'schemaVersion':1,'method':'subsequence-chroma-dtw-v1','points':points,'notes':notes,'duration':midi.get_end_time(),'transpose':offset if offset<=6 else offset-12,'confidence':round(confidence,3),'needsReview':confidence<.72,'uncertain':[{ 'scoreTime':p['scoreTime'],'audioTime':p['audioTime']} for p in points if p['confidence']<.55]}
