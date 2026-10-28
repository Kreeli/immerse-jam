const fs = require('node:fs');
const methods = require('../shared/ipc-methods.json');
if (new Set(methods).size !== methods.length || methods.some((method) => !/^[a-z-]+$/.test(method)))
  throw new Error('Invalid IPC method list');
fs.writeFileSync(
  'desktop/preload.cjs',
  `// Generated from shared/ipc-methods.json. Run npm run build after changing the contract.
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const allowed=${JSON.stringify(methods)};
contextBridge.exposeInMainWorld('jam',{
 language:ipcRenderer.sendSync('jam:initial-ui').language||undefined,
 call:(method,data)=>{if(!allowed.includes(method))throw new Error('Unsupported operation');return ipcRenderer.invoke('jam:'+method,data);},
 onEvent:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('jam:event',listener);return()=>ipcRenderer.removeListener('jam:event',listener);},
 filePath:file=>webUtils.getPathForFile(file)
});
`,
);
