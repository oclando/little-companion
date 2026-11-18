const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { AdventureStore } = require('../src/ai/adventure');
const { filterWords, sampleGroups } = require('../src/word-selection');
const { parseScreenplay } = require('../src/ai/screenplay');
const words = ['apple','book','cat','dog','earth'].map((front,i)=>({id:`w${i}`,front,back:`释义${i}`}));
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adventure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new AdventureStore(path.join(dir,'learning.json'));}
test('三选一、前层锁定、错词重练、题目去重、重启恢复、通关覆盖目标词', t=>{
 const store=fixture(t); assert.throws(()=>store.start({layers:2,quota:1,wordIds:words.map(w=>w.id)},words,[]),/路线最多/);let run=store.start({sessionId:'story',layers:2,quota:3,wordIds:words.map(w=>w.id)},words,[{id:'c',name:'同行者甲'}]);
 assert.equal(run.quota,3);assert.equal(run.nodes[0].length,3);
 assert.throws(()=>store.choose(run.id,run.nodes[1][0].id));
 store.choose(run.id,run.nodes[0][1].id);store.reveal(run.id);
 let q=store.view().runs[0].question;
 store.answer(run.id,q.id,'wrong');assert.throws(()=>store.answer(run.id,q.id,'apple'));
 assert.equal(store.view().runs[0].depth,0);
 store.next(run.id);
 assert.equal(new AdventureStore(store.file).view().totalAttempts,1);
 let guard=0;
 while(store.view().runs[0].status!=='complete'&&guard++<50){
  run=store.view().runs[0];
  if(!run.quiz){store.choose(run.id,run.nodes[run.depth][2].id);continue;}
  q=run.question;
  if(q.phase==='memorize')store.reveal(run.id);
  else if(q.phase==='feedback')store.next(run.id);
  else{const word=run.words.find(w=>w.id===run.quiz.remaining[0]);store.answer(run.id,q.id,q.kind==='meaning'?word.back:word.front);}
 }
 assert(guard<50);assert.equal(store.view().runs[0].depth,2);assert.equal(store.view().words.length,5);assert.equal(store.view().totalAttempts,7);
 const before=store.view();store.remove(run.id);assert.equal(store.view().runs.length,0);assert.deepEqual(store.view().words,before.words);assert.equal(store.view().totalAttempts,7);
});
test('没有释义不能开局，其他冒险不能覆盖旧学习履历',t=>{
 const store=fixture(t);assert.throws(()=>store.start({wordIds:['x']},[{id:'x',front:'bad'}],[]));
 const run=store.start({wordIds:['w0'],layers:1},words,[]);store.choose(run.id,run.nodes[0][0].id);store.reveal(run.id);let q=store.view().runs[0].question;assert.equal(q.kind,'spelling');
 store.answer(run.id,q.id,' APPLE ');store.next(run.id);store.start({wordIds:['w1']},words,[]);assert.equal(store.view().correctAttempts,1);assert.equal(store.view().words[0].front,'apple');
});
test('词库多选不重复，默认词库兜底，状态和搜索共同筛选',()=>{
 const rows=[{id:'a',front:'apple',back:'苹果',libraryIds:['one','two'],lapses:1},{id:'b',front:'book',back:'书',libraryIds:['two'],lastReviewedAt:'2026-01-01'},{id:'c',front:'cat',back:'猫'}];
 assert.deepEqual(filterWords(rows,{sources:['one','two']}).map(w=>w.id),['a','b']);
 assert.deepEqual(filterWords(rows,{sources:['list_default']}).map(w=>w.id),['c']);
 assert.deepEqual(filterWords(rows,{sources:['two'],mode:'wrong',query:'苹果'}).map(w=>w.id),['a']);
 assert.deepEqual(filterWords(rows,{mode:'new'}).map(w=>w.id),['a','c']);
});
test('旁白与发言类型校验，禁止把其他角色冒认为当前角色',()=>{
 const rows=parseScreenplay(JSON.stringify({segments:[{type:'narration',text:'风吹过树林。'},{type:'dialogue',actorId:'a',text:'我们出发吧。'}]}),'a');
 assert.equal(rows[0].actorId,null);assert.equal(rows[1].actorId,'a');
 assert.throws(()=>parseScreenplay('{"segments":[{"type":"dialogue","actorId":"b","text":"冒名"}]}','a'));
 assert.throws(()=>parseScreenplay('旁白：这不是结构化剧情','a'));
});
test('来源快照、剧情检查点去重和重复下一步不推进两次',t=>{
 const store=fixture(t);const run=store.start({layers:2,quota:1,wordIds:['w0'],viewpointId:'a'},[{...words[0],libraryIds:['source']}],[{id:'a',name:'同行者甲'}],[{id:'source',name:'考研'}]);
 assert.deepEqual(run.words[0].sourceNames,['考研']);assert(run.feed.some(e=>e.type==='narration'));
 store.appendScene(run.id,'start',[{type:'narration',text:'AI开场',source:'ai'}],0);store.appendScene(run.id,'start',[{type:'narration',text:'重复',source:'ai'}],0);
 assert(!store.view().runs[0].feed.some(e=>e.text==='重复'));
 store.choose(run.id,run.nodes[0][0].id);store.reveal(run.id);const q=store.view().runs[0].question;store.answer(run.id,q.id,'apple');store.next(run.id,q.id);assert.throws(()=>store.next(run.id,q.id));assert.equal(store.view().runs[0].depth,1);
});
test('多组抽词去重交替，后端保留选定顺序且拒绝来源外旧词',t=>{
 const rows=[{id:'old',front:'Hierarchy',back:'层级',libraryIds:['dev']},{id:'a',front:'apple',back:'苹果',libraryIds:['en']},{id:'b',front:'book',back:'书',libraryIds:['en']},{id:'c',front:'cat',back:'猫',libraryIds:['other']},{id:'d',front:'dog',back:'狗',libraryIds:['en','other']}];
 const result=sampleGroups(rows,['en','other'],2,[],()=>.5);
 assert.deepEqual(result.ids,['a','c','b','d']);assert.equal(new Set(result.ids).size,4);assert.equal(result.groups[0].wordIds.length,2);assert.equal(result.groups[1].wordIds.length,2);
 const store=fixture(t);const run=store.start({wordIds:result.ids,sourceIds:['en','other'],groups:result.groups,layers:2,quota:2},rows,[]);
 assert.equal(run.words[0].front,'apple');assert.equal(run.words[1].front,'cat');
 assert.throws(()=>store.start({wordIds:['old'],sourceIds:['en'],quota:1},rows,[]),/来源之外/);
 assert.deepEqual(sampleGroups(rows,['empty'],5).ids,[]);
 store.choose(run.id,run.nodes[0][0].id);store.reveal(run.id);const q=store.view().runs[0].question;store.answer(run.id,q.id,'苹果');
 const replacement=store.start({wordIds:['c'],sourceIds:['other'],replaceRunId:run.id,quota:1},rows,[]);assert.equal(store.view().runs.length,1);assert.notEqual(replacement.id,run.id);assert.equal(store.view().totalAttempts,1);
});
