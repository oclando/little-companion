(()=>{
  const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sessionId=new URLSearchParams(location.search).get('sessionId');let data,speakerId,stream='',streamActor=null,pending=false,missing=false,lastGeneration=0;
  let prefs={rate:1,autoDialogue:false,actors:{}};try{prefs={...prefs,...JSON.parse(localStorage.getItem('companion-chat-voice')||'{}')};}catch{}prefs.actors ||= {};
  const speech=SystemSpeech.create({onStatus:s=>$('#voice-status').textContent=s});
  const seen=new Set();let initialized=false,visible=true;
  const actor=id=>data?.session.instances.find(a=>a.id===id);
  const face=(a,user=false)=>`<span class="portrait">${!user&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a?.avatar||'')?`<img src="${esc(a.avatar)}" alt="${esc(a.name)}头像">`:esc((user?data.userName:a?.name||'伙伴').slice(0,1))}</span>`;
  function error(s){$('#error').textContent=s||'';$('#error').hidden=!s;}
  async function call(op,p={}){const r=await window.chat.call(op,{...p,sessionId});if(!r.ok)throw new Error(r.error);return r.value;}
  async function action(fn){error('');try{await fn();}catch(e){error(e.message);}}
  async function refresh(){const generation=++lastGeneration;try{const next=await call('chatWindowData');if(generation!==lastGeneration)return;if(JSON.stringify(next)===JSON.stringify(data))return;data=next;draw();}catch(e){missing=true;$('#input').disabled=true;$('#send').disabled=true;error(e.message);}}
  function readRows(rows){speech.read(rows.map(e=>({text:e.content,kind:SystemSpeech.language(e.content),voiceURI:prefs.actors[e.instanceId],rate:prefs.rate})));}
  function voiceOptions(){
    const options=value=>'<option value="">系统默认</option>'+speech.voices('zh').map(v=>`<option value="${esc(v.voiceURI)}" ${v.voiceURI===value?'selected':''}>${esc(v.name)}</option>`).join('');
    $('#voice-options').innerHTML=`<label><input type="checkbox" data-pref="autoDialogue" ${prefs.autoDialogue?'checked':''}>自动朗读新增角色回应</label><label>语速<select data-pref="rate">${[.7,.85,1,1.15,1.3].map(v=>`<option value="${v}" ${Number(prefs.rate)===v?'selected':''}>${v} 倍</option>`).join('')}</select></label>${(data?.session.instances||[]).map(a=>`<label>${esc(a.name)}<select data-actor="${esc(a.id)}">${options(prefs.actors[a.id])}</select></label>`).join('')}<small>使用系统本地声音，不额外调用聊天 API。没有语音包时会提示安装。</small>`;
  }
  function draw(){
    if(!data)return;
    if(!actor(speakerId))speakerId=data.session.instances[0]?.id;
    $('#title').textContent=data.session.title;document.title=`${data.session.title} · 角色聊天`;
    $('#party').innerHTML=data.session.instances.map(a=>`<span>${face(a)}${esc(a.name)}</span>`).join('');
    $('#speaker').innerHTML=data.session.instances.map(a=>`<option value="${esc(a.id)}" ${a.id===speakerId?'selected':''}>${esc(a.name)}</option>`).join('');
    $('#group').disabled=data.session.instances.length<2;
    $('#world').textContent=`${data.world.name}\n${data.world.rules||'暂无额外设定'}${data.world.characterGrowth?'\n角色成长：开启':''}`;
    $('#memories').innerHTML=data.memories.filter(m=>m.instanceId===speakerId).map(m=>`<article class="memory"><p>${esc(m.content)}</p><button data-edit-memory="${esc(m.id)}">编辑</button><button data-forget="${esc(m.id)}">销毁</button></article>`).join('')||'<p class="route-note">尚未保存私人记忆。</p>';
    drawFeed();voiceOptions();
    const blocked=pending||data.busy||missing;
    $('#input').disabled=blocked;$('#send').disabled=blocked;$('#continue').disabled=blocked;$('#add-memory').disabled=blocked;
    $('#speaker').disabled=blocked;$('#stop').hidden=!data.ownBusy;
    $('#status').textContent=data.busy?(data.ownBusy?'伙伴正在回应…':'其他窗口正在生成，请稍候。'):'已连接原存档 · 关闭窗口只收起聊天';
  }
  function drawFeed(){
    const node=$('#feed'),bottom=node.scrollHeight-node.scrollTop-node.clientHeight<110;
    node.innerHTML=data.session.events.map(e=>{
      if(e.type==='world.updated')return `<div class="narration">世界已更新：${esc(e.world.name)}</div>`;
      if(e.type!=='message')return '';
      const user=e.role==='user',a=actor(e.instanceId),name=user?data.userName:a?.name||'伙伴';
      return `<article class="dialogue ${user?'right':''}">${face(a,user)}<div class="dialogue-content"><p class="speaker">${esc(name)}</p><div class="speech">${esc(e.content)}</div><div class="message-actions"><button data-read="${esc(e.id)}">🔊 朗读</button><button data-remember="${esc(e.id)}" ${data.busy?'disabled':''}>记住</button></div></div></article>`;
    }).join('')||'<div class="chat-empty">窗外的日常，也可以慢慢说给伙伴听。<br>从一句问候开始吧。</div>';
    if(data.ownBusy&&streamActor)node.insertAdjacentHTML('beforeend',`<article class="dialogue stream">${face(actor(streamActor))}<div class="dialogue-content"><p class="speaker">${esc(actor(streamActor)?.name||'伙伴')} · 正在回应</p><div class="speech" id="stream">${esc(stream||'…')}</div></div></article>`);
    if(bottom)node.scrollTop=node.scrollHeight;
    const fresh=data.session.events.filter(e=>e.type==='message'&&e.role==='assistant'&&!seen.has(e.id));data.session.events.forEach(e=>seen.add(e.id));if(visible&&initialized&&prefs.autoDialogue&&fresh.length)readRows(fresh);initialized=true;
  }
  async function send(content){
    if(pending||data?.busy||missing)return;pending=true;draw();error('');
    try{await call('chatSend',{instanceId:speakerId,group:$('#group').checked,...(content!==undefined?{content}: {})});}
    catch(e){error(e.message);}
    finally{pending=false;stream='';streamActor=null;await refresh();draw();}
  }
  let editingMemory=null,sourceIds=[];
  function memoryEditor(row,memory){
    editingMemory=memory?.id||null;sourceIds=row?[row.id]:memory?.sourceEventIds||[];
    $('#memory-title').textContent=memory?'编辑角色记忆':'确认保存的记忆';
    const owner=memory?.instanceId||row?.instanceId||speakerId;
    $('#memory-owner').innerHTML=data.session.instances.map(a=>`<option value="${esc(a.id)}" ${a.id===owner?'selected':''}>${esc(a.name)}</option>`).join('');$('#memory-owner').disabled=Boolean(memory);
    $('#memory-text').value=memory?.content||row?.content||'';$('#memory-error').textContent='';$('#memory-editor').showModal();
  }
  $('#compose').onsubmit=e=>{e.preventDefault();const text=$('#input').value.trim();if(text)send(text);};
  $('#input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#compose').requestSubmit();}};
  $('#continue').onclick=()=>send();$('#stop').onclick=()=>action(()=>call('chatCancel'));
  $('#hide').onclick=()=>window.close();$('#speaker').onchange=()=>{speakerId=$('#speaker').value;draw();};
  $('#add-memory').onclick=()=>memoryEditor();$('#memory-close').onclick=()=>$('#memory-editor').close();
  $('#memory-form').onsubmit=async e=>{e.preventDefault();const button=$('#memory-form .primary');button.disabled=true;try{await call(editingMemory?'chatEditMemory':'chatRemember',{memoryId:editingMemory,instanceId:$('#memory-owner').value,content:$('#memory-text').value,sourceEventIds:sourceIds});$('#memory-editor').close();await refresh();}catch(e){$('#memory-error').textContent=e.message;}finally{button.disabled=false;}};
  $('#feed').onclick=e=>{const read=e.target.closest('[data-read]'),remember=e.target.closest('[data-remember]');const id=read?.dataset.read||remember?.dataset.remember;const row=data?.session.events.find(e=>e.id===id);if(!row)return;if(read)readRows([row]);else memoryEditor(row);};
  $('#memories').onclick=e=>action(async()=>{const edit=e.target.closest('[data-edit-memory]'),forget=e.target.closest('[data-forget]');const id=edit?.dataset.editMemory||forget?.dataset.forget;const memory=data.memories.find(m=>m.id===id);if(!memory)return;if(edit)memoryEditor(null,memory);else if(confirm('销毁这条私人记忆？聊天原文仍保留。')){await call('chatForget',{memoryId:id});await refresh();}});
  $('#voice-options').onchange=e=>{if(e.target.dataset.actor)prefs.actors[e.target.dataset.actor]=e.target.value;else if(e.target.dataset.pref)prefs[e.target.dataset.pref]=e.target.type==='checkbox'?e.target.checked:e.target.value;try{localStorage.setItem('companion-chat-voice',JSON.stringify(prefs));}catch{}speech.stop();};
  $('#voice-stop').onclick=()=>speech.stop();$('#font-size').onchange=()=>document.documentElement.style.setProperty('--story-size',`${$('#font-size').value}px`);
  window.speechSynthesis?.addEventListener('voiceschanged',voiceOptions);window.addEventListener('beforeunload',()=>speech.stop());window.chat.onHidden(()=>{visible=false;speech.stop();});window.chat.onShown(()=>{visible=true;refresh();});
  window.chat.onEvent(e=>{
    if(e.sessionId!==sessionId)return;
    if(e.type==='start'){stream='';streamActor=e.instanceId;if(e.hasUserMessage)$('#input').value='';}
    if(e.data){lastGeneration++;data=e.data;if(e.type==='end'){stream='';streamActor=null;}draw();}
    if(e.type==='delta'){stream+=e.delta||'';const text=$('#stream');if(text){text.textContent=stream;const node=$('#feed');if(node.scrollHeight-node.scrollTop-node.clientHeight<160)node.scrollTop=node.scrollHeight;}}
  });
  refresh();setInterval(()=>{if(!missing&&!$('#memory-editor').open)refresh();},1800);
})();
