const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['chatWindowData','chatSend','chatCancel','chatRemember','chatEditMemory','chatForget']);
contextBridge.exposeInMainWorld('chat',{
  call:(operation,payload)=>allowed.has(operation)?ipcRenderer.invoke('ai-call',operation,payload):Promise.resolve({ok:false,error:'不支持的操作'}),
  onEvent:callback=>ipcRenderer.on('chat-event',(_event,event)=>callback(event)),
  onHidden:callback=>ipcRenderer.on('chat-hidden',()=>callback()),
  onShown:callback=>ipcRenderer.on('chat-shown',()=>callback())
});
