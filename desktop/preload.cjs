// Generated from shared/ipc-methods.json. Run npm run build after changing the contract.
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const allowed=["attach","audio-tools-ensure","cancel","creation-new","session-create","creation-add-group","creation-import-group","project-delete","project-recover","export","export-audio","import","library","migration-database-import","migration-database-scan","migration-detect","migration-import","migration-scan","model-download","model-import","models","open-license-folder","pair-select","pair-start","pair-stop","peer-append","peer-begin","peer-close","peer-finish","peer-outgoing","peer-prepare","peer-read","peer-select","pick-folder","read-attachment","recording-import","result-open","result-rename","result-select","reveal","run","runtime-install","runtime-status","playback-budget","take-append","take-delete","take-finish","take-import","take-open","take-recover","take-select","take-start","ui-language","update","window","folders-list","folders-edit","feedback-open"];
contextBridge.exposeInMainWorld('jam',{
 language:ipcRenderer.sendSync('jam:initial-ui').language||undefined,
 call:(method,data)=>{if(!allowed.includes(method))throw new Error('Unsupported operation');return ipcRenderer.invoke('jam:'+method,data);},
 onEvent:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('jam:event',listener);return()=>ipcRenderer.removeListener('jam:event',listener);},
 filePath:file=>webUtils.getPathForFile(file)
});
