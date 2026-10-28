const {contextBridge,ipcRenderer,webUtils}=require('electron');
const allowed=['library','import','update','attach','read-attachment','runtime-status','runtime-install','run','cancel','models','model-import','migration-scan','migration-import','export','export-audio','recording-import','pair-start','pair-stop','pair-select','reveal','window','pick-folder'];
allowed.push('peer-prepare','peer-outgoing','peer-read','peer-begin','peer-append','peer-finish','peer-close','peer-select');
allowed.push('migration-detect','migration-database-scan','migration-database-import');
allowed.push('model-download','result-select','result-rename','result-open');
contextBridge.exposeInMainWorld('jam',{call:(method,data)=>{if(!allowed.includes(method))throw new Error('Unsupported operation');return ipcRenderer.invoke('jam:'+method,data);},onEvent:callback=>{const listener=(_e,data)=>callback(data);ipcRenderer.on('jam:event',listener);return()=>ipcRenderer.removeListener('jam:event',listener);},filePath:file=>webUtils.getPathForFile(file)});
