from pathlib import Path
p=Path('src/App.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("<p className=\"notice\">如果电脑有多个网络连接，确保配对地址属于手机所在网络。远程直连将在连接测试通过后开放。</p>","<p className=\"notice\">如果电脑有多个网络连接，请选用手机所在网络的配对地址。</p><RemoteTransfer ids={selected} onError={notify}/>")
s=s.replace("window.jam.call('pair-select',{id:incoming.id", "window.jam.call(incoming.remote?'peer-select':'pair-select',{id:incoming.id")
s=s.replace("(page!=='recent'||true)","(page!=='recent'||!!p.practice.lastPlayedAt)")
s=s.replace("const togglePlay=useCallback(()=>{if(loading)return;", "const togglePlay=useCallback(()=>{if(loading)return;if(current.current)save({...current.current,practice:{...current.current.practice,lastPlayedAt:new Date().toISOString()}});")
s=s.replace("[loading,notify]);", "[loading,notify,save]);")
s=s.replace("adopt(p);if(saveTimer.current)clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{void window.jam.call('update',{id:p.id,patch:p}).catch(e=>notify(e.message));},350);", "adopt(p);void window.jam.call('update',{id:p.id,patch:p}).catch(e=>notify(e.message));")
s=s.replace("<video className=\"video-preview\" src={asset(project.id,project.original)} muted ref={v=>{if(v&&Math.abs(v.currentTime-position)>.2)v.currentTime=position;}}/>","<SyncedVideo project={project} position={position} playing={playing}/>")
s+='''\nfunction SyncedVideo({project,position,playing}:{project:Project;position:number;playing:boolean}){const ref=useRef<HTMLVideoElement>(null);useEffect(()=>{const v=ref.current;if(!v)return;v.playbackRate=project.practice.tempo;if(Math.abs(v.currentTime-position)>.25)v.currentTime=position;if(playing)void v.play().catch(()=>{});else v.pause();},[position,playing,project.practice.tempo]);return <video ref={ref} className="video-preview" src={asset(project.id,project.original)} muted playsInline/>;}\n'''
p.write_text(s,encoding='utf-8')
p=Path('src/types.ts');s=p.read_text(encoding='utf-8').replace('export interface Practice{','export interface Practice{lastPlayedAt?:string;');p.write_text(s,encoding='utf-8')
p=Path('src/audio.ts');s=p.read_text(encoding='utf-8').replace('Math.min(duration,2)','Math.min(duration,60)');p.write_text(s,encoding='utf-8')
p=Path('scripts/dev.cjs');s=p.read_text(encoding='utf-8').replace("const vite=spawn", "require('./copy-assets.cjs');\nconst vite=spawn");p.write_text(s,encoding='utf-8')
