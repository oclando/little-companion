(function(root){
  function language(text){return /[\u3400-\u9fff]/.test(String(text))?'zh':'en';}
  function create({engine=root.speechSynthesis,Utterance=root.SpeechSynthesisUtterance,onStatus=()=>{}}={}){
    let generation=0;
    function voices(kind){return (engine?.getVoices?.()||[]).filter(v=>v.localService!==false&&(!kind||String(v.lang).toLowerCase().startsWith(kind)));}
    function stop(){generation++;engine?.cancel?.();}
    function read(items){
      stop();if(!engine||!Utterance){onStatus('当前环境不支持系统语音。');return false;}
      const token=generation, prepared=[];
      for(const item of items){
        const text=String(item.text||'').trim();if(!text)continue;
        const kind=item.kind||language(text), available=voices(kind);
        if(!available.length){onStatus(`未检测到${kind==='en'?'英文':'中文'}本地语音，请在 Windows 的语音设置中安装对应文本转语音包。`);return false;}
        const u=new Utterance(text);u.voice=available.find(v=>v.voiceURI===item.voiceURI)||available[0];u.lang=u.voice.lang;u.rate=Math.max(.5,Math.min(1.5,Number(item.rate)||1));
        u.onstart=()=>{if(token===generation)onStatus('正在朗读…');};u.onend=()=>{if(token===generation&&u===prepared.at(-1))onStatus('朗读完成');};
        u.onerror=e=>{if(token===generation&&!['interrupted','canceled'].includes(e.error))onStatus('语音播放失败，请检查系统音量和本地语音包。');};prepared.push(u);
      }
      prepared.forEach(u=>engine.speak(u));return prepared.length>0;
    }
    return {voices,stop,read,word:(text,options={})=>read([{text:(String(text).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).join(' '),kind:'en',...options}])};
  }
  const api={create,language};if(typeof module==='object')module.exports=api;else root.SystemSpeech=api;
})(typeof window!=='undefined'?window:globalThis);
