import {Download,LoaderCircle,RefreshCw} from 'lucide-react';
import type {Model} from './types';

export interface ModelDownload{status:'progress'|'complete'|'error';message?:string;progress?:number}
export default function ModelManager({models,downloads,onDownload}:{models:Model[];downloads:Record<string,ModelDownload>;onDownload:(id:string)=>void}){
 const names:Record<string,string>={vocals:'人声',drums:'鼓',bass:'贝斯',piano:'钢琴',guitar:'吉他',other:'其他',lead:'主奏吉他',rhythm:'节奏吉他',lead_vocals:'主唱',backing_vocals:'和声'};
 return <div className="model-list">{models.map(model=>{
  const state=downloads[model.id],loading=state?.status==='progress';
  return <div key={model.id} className="model-item"><div className="model-description"><strong>{model.name}{model.recommended&&<span className="recommend">推荐</span>}</strong><p>{model.description}</p><small>{model.adapter==='BeatThis'?'节拍 · 小节首拍 · BPM':model.stems.map(stem=>names[stem]||stem).join(' · ')}</small>{loading&&<><progress aria-label={`${model.name}下载进度`} max="1" value={state.progress??undefined}/><span className="model-download-message">{state.message||'正在准备下载…'}</span></>}{state?.status==='error'&&<span className="model-download-error">{state.message}，可点击重试继续下载。</span>}</div><div className="model-actions"><span className={'badge '+(model.installed?'green':'')}>{model.installed?'已下载':'未下载'}</span>{!model.custom&&<button className={'small '+(model.installed?'':'primary')} aria-label={`${model.name}${model.installed?'校验模型':'下载模型'}`} disabled={loading} onClick={()=>onDownload(model.id)}>{loading?<LoaderCircle size={14} className="spin"/>:model.installed?<RefreshCw size={14}/>:<Download size={14}/>} {loading?'下载 / 校验中…':state?.status==='error'?'重试':model.installed?'校验模型':'下载模型'}</button>}</div></div>;
 })}</div>;
}
