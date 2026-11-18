const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['adventureWindowData','adventureChoose','adventureReveal','adventureAnswer','adventureNext','adventureScene','adventureCancel','adventureChangeSources']);
contextBridge.exposeInMainWorld('adventure',{call:(operation,payload)=>{
  if(!allowed.has(operation))return Promise.resolve({ok:false,error:'不支持的操作'});
  return ipcRenderer.invoke('ai-call',operation,payload);
}});
