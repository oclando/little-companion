(() => {
  const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const runId=new URLSearchParams(location.search).get('runId');let run,busy=false,mutating=false;
  let prefs={autoWord:true,autoDialogue:false,narration:false,rate:1,wordVoice:'',actors:{}};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem('companion-system-voice')||'{}')};}catch{}
  const speech=SystemSpeech.create({onStatus:message=>{$('#voice-status').textContent=message;}});
  const seenSpeech=new Set();let speechInitialized=false,lastWordId=null;
  const voiceItems=rows=>rows.filter(e=>e.type==='dialogue'||(prefs.narration&&e.type==='narration')).map(e=>({text:e.text,kind:SystemSpeech.language(e.text),voiceURI:prefs.actors[e.actorId]||'',rate:prefs.rate}));
  function voiceOptions(){
    const option=(kind,value)=>'<option value="">系统默认</option>'+speech.voices(kind).map(v=>`<option value="${esc(v.voiceURI)}" ${v.voiceURI===value?'selected':''}>${esc(v.name)}（${esc(v.lang)}）</option>`).join('');
    $('#voice-options').innerHTML=`<label><input type="checkbox" data-voice="autoWord" ${prefs.autoWord?'checked':''}>记忆卡自动读单词</label><label><input type="checkbox" data-voice="autoDialogue" ${prefs.autoDialogue?'checked':''}>自动朗读新增角色对白</label><label><input type="checkbox" data-voice="narration" ${prefs.narration?'checked':''}>自动对白时包含旁白</label><label>语速<select data-voice="rate">${[.7,.85,1,1.15,1.3].map(r=>`<option value="${r}" ${r===Number(prefs.rate)?'selected':''}>${r} 倍</option>`).join('')}</select></label><label>英文发音<select data-voice="wordVoice">${option('en',prefs.wordVoice)}</select></label>${(run?.companions||[]).map(c=>`<label>${esc(c.name)}的中文声音<select data-actor="${esc(c.id)}">${option('zh',prefs.actors[c.id])}</select></label>`).join('')}<small>检测到 ${speech.voices('en').length} 个英文、${speech.voices('zh').length} 个中文本地声音。语音不使用聊天 API。</small>`;
  }
  const portrait=c=>`<span class="portrait">${/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c?.avatar||'')?`<img src="${esc(c.avatar)}" alt="${esc(c.name)}头像">`:esc((c?.name||'你').slice(0,1))}</span>`;
  async function call(op,p={}){const r=await window.adventure.call(op,{...p,runId});if(!r.ok)throw new Error(r.error);return r.value;}
  function error(message){$('#error').textContent=message||'';$('#error').hidden=!message;}
  async function action(fn){try{error('');await fn();}catch(e){error(e.message);}}
  async function refresh(){run=await call('adventureWindowData');draw();}
  function draw(){
    $('#title').textContent=run.title;$('#progress').textContent=`${run.depth} / ${run.layers}`;
    $('#targets').textContent=`${run.words.length} 个目标词 · 每关答对 ${run.quota} 个不同单词\n来源：${[...new Set(run.words.flatMap(w=>w.sourceNames||['历史词库']))].join('、')}`;
    if(run.groups?.length)$('#targets').textContent+='\n分组：'+run.groups.map(g=>`${g.name} ${g.wordIds.length} 词`).join(' / ');
    $('#party').innerHTML=run.companions.map(c=>`<span>${portrait(c)}${esc(c.name)}</span>`).join('');
    $('#route').innerHTML=(run.path.length?`<div class="route-path">${run.path.map((id,i)=>`第 ${i+1} 层：${esc(run.nodes[i].find(n=>n.id===id)?.name)} ✓`).join('<br>')}</div>`:'')+(run.status==='complete'?'<h3>这段旅程已完成</h3>':run.quiz?'<p class="route-note">当前节点进行中，完成试炼后解锁下一层。</p>':run.nodes[run.depth].map(n=>`<button class="route-node" data-node="${esc(n.id)}" ${busy?'disabled':''}><strong>${['◇','✎','?'][n.lane]} ${esc(n.name)}</strong><small>${({meaning:'英译中辨义',spelling:'看释义拼写',mixed:'辨义与拼写交替'})[n.kind]} · ${n.wordIds.length} 词达标</small></button>`).join(''));
    const feed=$('#feed'),atBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<100;
    feed.innerHTML=(run.feed||[]).map(e=>{
      if(e.type==='action')return `<div class="user-action">你的行动：${esc(e.text)}</div>`;
      const source=e.source==='ai'?'AI 剧情':e.source==='system'?'关卡记录':'本地开场';
      if(e.type==='narration')return `<div class="narration">${esc(e.text)}<span class="source-tag">${source} <button class="read-line" data-read="${esc(e.id)}" aria-label="朗读旁白">🔊</button></span></div>`;
      const c=run.companions.find(c=>c.id===e.actorId)||{name:'伙伴'};
      return `<article class="dialogue ${e.actorId===(run.viewpointId||run.companions[0]?.id)?'right':''}">${portrait(c)}<div class="dialogue-content"><p class="speaker">${esc(c.name)}</p><div class="speech">${esc(e.text)}</div><span class="source-tag">${source} <button class="read-line" data-read="${esc(e.id)}" aria-label="朗读${esc(c.name)}的对白">🔊</button></span></div></article>`;
    }).join('')||'<p class="narration">林间的风吹过岔路。选择一条路线，或让同伴讲述眼前的故事。</p>';
    if(atBottom)feed.scrollTop=feed.scrollHeight;
    $('#resume').disabled=!run.quiz||busy;$('#scene').disabled=busy||run.status==='complete';$('#stop').hidden=!busy;
    $('#action-form button').disabled=busy;$('#action').disabled=busy;$('#status').textContent=busy?'角色正在组织剧情… 可以暂停关闭窗口，已完成的学习记录会保留。':run.status==='complete'?'本次旅程完成，学习履历已保存。':'选择路线，或和同伴聊聊眼前的故事。';
    voiceOptions();const fresh=(run.feed||[]).filter(e=>!seenSpeech.has(e.id));(run.feed||[]).forEach(e=>seenSpeech.add(e.id));if(speechInitialized&&prefs.autoDialogue&&fresh.length)speech.read(voiceItems(fresh));speechInitialized=true;
  }
  function quiz(){
    const q=run.question,d=$('#quiz');if(!q){if(d.open)d.close();return;}
    $('#quiz-progress').textContent=`第 ${run.depth+1} 层 · ${q.passed}/${q.required} 个词达标`;
    const word=run.words.find(w=>w.id===run.quiz.remaining[0]);
    $('#quiz-source').textContent=`词源：${(word.sourceNames||['历史词库']).join(' / ')}${word.groupId?` · 本次分组：${run.groups?.find(g=>g.sourceId===word.groupId)?.name||''}`:''}`;
    $('#word-speak').hidden=q.phase==='answer'&&q.kind==='spelling';
    $('#quiz-title').textContent=q.phase==='memorize'?'先记住这个词':q.phase==='feedback'?(q.feedback.correct?'这一词，记住了':'看看答案，稍后重练'):q.kind==='meaning'?'选择正确释义':'写出对应英文';
    $('#flashcard').innerHTML=`<strong>${esc(q.front||q.back)}</strong>${q.phase==='memorize'?`<p>${esc(q.back)}</p>`:''}`;
    $('#quiz-feedback').textContent=q.feedback?`${q.feedback.companion}：${q.feedback.text} 正确答案：${q.feedback.expected}`:'';
    $('#quiz-form').innerHTML=q.phase==='answer'?(q.kind==='meaning'?`<div class="options">${q.options.map(o=>`<button type="button" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div>`:'<input name="answer" placeholder="请输入英文" autocomplete="off" required><button class="primary">提交答案</button>'):`<button type="button" class="primary" data-next>${q.phase==='memorize'?'记好了，开始答题':'继续'}</button>`;
    if(!d.open)d.showModal();$('#quiz-form input')?.focus();
    if(q.phase==='memorize'&&q.id!==lastWordId){lastWordId=q.id;if(prefs.autoWord)speech.word(word.front,{voiceURI:prefs.wordVoice,rate:prefs.rate});}
  }
  async function mutate(op,p={}){
    if(mutating||busy)return;mutating=true;speech.stop();const depth=run.depth;
    try{await call(op,p);await refresh();quiz();}finally{mutating=false;}
    if(run.depth!==depth&&run.autoScene&&run.status!=='complete')await scene(undefined,true);
  }
  async function scene(text,automatic=false){
    if(busy)return;busy=true;draw();
    try{await call('adventureScene',{...(automatic?{}:{newBeat:true,requestId:crypto.randomUUID()}),...(text?{text}: {})});if(text)$('#action').value='';}
    finally{busy=false;await refresh();}
  }
  $('#route').onclick=e=>{const n=e.target.closest('[data-node]');if(n)action(()=>mutate('adventureChoose',{nodeId:n.dataset.node}));};
  $('#resume').onclick=()=>{lastWordId=null;quiz();};$('#pause').onclick=()=>{speech.stop();window.close();};$('#quiz-pause').onclick=()=>{speech.stop();$('#quiz').close();};
  const changeSources=()=>action(async()=>{speech.stop();if($('#quiz').open)$('#quiz').close();await call('adventureChangeSources');});
  $('#change-sources').onclick=changeSources;$('#quiz-change-sources').onclick=changeSources;
  $('#word-speak').onclick=()=>{const q=run.question;if(q.phase==='answer'&&q.kind==='spelling')return;speech.word(run.words.find(w=>w.id===run.quiz.remaining[0]).front,{voiceURI:prefs.wordVoice,rate:prefs.rate});};
  $('#feed').onclick=e=>{const b=e.target.closest('[data-read]');if(!b)return;const row=run.feed.find(r=>r.id===b.dataset.read);if(row)speech.read([{text:row.text,kind:SystemSpeech.language(row.text),voiceURI:prefs.actors[row.actorId],rate:prefs.rate}]);};
  $('#voice-options').onchange=e=>{if(e.target.dataset.actor)prefs.actors[e.target.dataset.actor]=e.target.value;else if(e.target.dataset.voice)prefs[e.target.dataset.voice]=e.target.type==='checkbox'?e.target.checked:e.target.value;try{localStorage.setItem('companion-system-voice',JSON.stringify(prefs));}catch{}speech.stop();};
  $('#voice-stop').onclick=()=>{speech.stop();$('#voice-status').textContent='已停止朗读';};
  window.speechSynthesis?.addEventListener('voiceschanged',voiceOptions);window.addEventListener('beforeunload',()=>speech.stop());$('#quiz').addEventListener('cancel',()=>speech.stop());
  $('#quiz-form').onclick=e=>{const b=e.target.closest('button');if(!b)return;const q=run.question;if(b.dataset.answer!==undefined)action(()=>mutate('adventureAnswer',{questionId:q.id,answer:b.dataset.answer}));else if(b.hasAttribute('data-next'))action(()=>mutate(q.phase==='memorize'?'adventureReveal':'adventureNext',{questionId:q.id}));};
  $('#quiz-form').onsubmit=e=>{e.preventDefault();action(()=>mutate('adventureAnswer',{questionId:run.question.id,answer:$('#quiz-form input').value}));};
  $('#scene').onclick=()=>action(()=>scene());$('#stop').onclick=()=>action(()=>call('adventureCancel'));
  $('#action-form').onsubmit=e=>{e.preventDefault();const text=$('#action').value.trim();if(text)action(()=>scene(text));};
  $('#font-size').onchange=()=>document.documentElement.style.setProperty('--story-size',`${$('#font-size').value}px`);
  action(async()=>{
    await refresh();
    if(run.generating){busy=true;draw();const timer=setInterval(()=>action(async()=>{await refresh();if(!run.generating){busy=false;draw();clearInterval(timer);}}),1000);}
    else if(run.quiz)quiz();else if(run.autoScene&&run.status!=='complete')await scene(undefined,true);
  });
})();
