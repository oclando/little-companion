const {test}=require('node:test');const assert=require('node:assert/strict');const {create}=require('../src/system-speech');
test('单词使用英文声音，角色使用中文声音，新的朗读先停止旧队列',()=>{
 const spoken=[],status=[];let cancelled=0;const voices=[{voiceURI:'en',lang:'en-US',localService:true},{voiceURI:'zh',lang:'zh-CN',localService:true},{voiceURI:'remote',lang:'en-US',localService:false}];
 const engine={getVoices:()=>voices,cancel:()=>cancelled++,speak:u=>spoken.push(u)},speech=create({engine,Utterance:class{constructor(text){this.text=text;}},onStatus:s=>status.push(s)});
 assert(speech.word('Scene 场景',{rate:.85}));assert.equal(spoken[0].text,'Scene');assert.equal(spoken[0].voice.voiceURI,'en');assert.equal(spoken[0].rate,.85);
 assert(speech.read([{text:'一起出发吧。',voiceURI:'zh'}]));assert.equal(spoken[1].voice.voiceURI,'zh');assert.equal(cancelled,2);assert.equal(speech.voices('en').length,1);
 speech.stop();assert.equal(cancelled,3);
});
test('缺少语音包明确提示，不使用远程声音或假装播放成功',()=>{
 const messages=[];let count=0;const speech=create({engine:{getVoices:()=>[{voiceURI:'remote',lang:'en-US',localService:false}],cancel(){},speak(){count++;}},Utterance:class{},onStatus:s=>messages.push(s)});
 assert.equal(speech.word('apple'),false);assert.equal(count,0);assert(messages[0].includes('英文'));
});
