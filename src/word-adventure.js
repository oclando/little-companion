(() => {
  const root = document.querySelector('#ai-workspace');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  root.querySelector('.ai-tabs').insertAdjacentHTML('beforeend', '<button data-ai-tab="adventure">背词冒险</button>');
  root.insertAdjacentHTML('beforeend', `<section data-ai-panel="adventure" hidden class="wa"><header class="wa-head"><div><p>THE MEMORY WOOD / 记忆林地</p><h2>把每一个词，变成向前的一步。</h2><span>选择一条路。记住、答对，然后继续。</span></div><button class="button primary" id="wa-new">开启冒险</button></header><p id="wa-error" role="alert"></p><div class="wa-tools"><select id="wa-runs" aria-label="冒险存档"></select><button class="text-button" id="wa-resume">继续当前答题</button><button class="text-button" id="wa-replace">更换本次词源 / 多组选词</button><button class="text-button" id="wa-remove">结束并删除冒险</button></div><div id="wa-party"></div><button class="text-button" id="wa-story">让同行角色聊聊当前剧情（调用 API）</button><div id="wa-dialogue"></div><div id="wa-progress"></div><div class="wa-map" id="wa-map"></div><p class="ai-hint">判题和关卡在本机运行。可以随时关闭答题窗，下次继续；答错不会丢失冒险，当前单词将重练。</p><details class="wa-ledger"><summary>永久学习履历（删除冒险或聊天存档后仍保留）</summary><div id="wa-stats"></div><button class="text-button" id="wa-export">导出学习履历</button></details></section>`);
  const $ = s => root.querySelector(s);
  let state, selected, popup;
  const run = () => state?.runs.find(r => r.id === selected);
  async function call(op, p = {}) { const r = await window.companion.ai(op, p); if (!r.ok) throw new Error(r.error); return r.value; }
  async function action(fn) { $('#wa-error').textContent = ''; try { await fn(); } catch(e) { $('#wa-error').textContent = e.message; if (popup?.open) popup.querySelector('.wa-feedback').textContent = e.message; } }
  async function refresh() { state = await call('adventureGet'); if (!state.runs.some(r => r.id === selected)) selected = state.runs.at(-1)?.id; draw(); }
  function draw() {
    const r = run();
    $('#wa-runs').innerHTML = state.runs.map(r => `<option value="${esc(r.id)}" ${r.id === selected ? 'selected' : ''}>${esc(r.title)} · ${r.status === 'complete' ? '已完成' : `${r.depth}/${r.layers}`}</option>`).join('') || '<option>尚未开启冒险</option>';
    $('#wa-party').innerHTML = r ? r.companions.map(c => `<span>♙ ${esc(c.name)}</span>`).join('') : '';
    $('#wa-progress').textContent = r ? `${r.status === 'complete' ? '旅程完成！' : '当前旅程'} ${r.depth} / ${r.layers} 层 · ${r.words.length} 个目标词 · 每关答对 ${r.quota} 个不同单词` : '先设置目标单词、路线长度和每关答对数量。';
    $('#wa-resume').disabled = !r; $('#wa-resume').textContent = '打开独立冒险窗口'; $('#wa-remove').disabled = !r; $('#wa-replace').disabled=!r;
    if (!r) $('#wa-map').innerHTML = '<div class="wa-empty">♧<br>迷雾中，有三条等待选择的路。<br>点击“开启冒险”，带上你的角色一起出发。</div>';
    else {
      const height = r.layers * 135 + 90; const pt = n => ({ x: 180 + n.lane * 265, y: height - 85 - n.depth * 135 });
      let svg = '';
      for(let i = 0; i < 160; i++) { const x = (i * 139 + 37) % 900, y = (i * 251 + 19) % height; svg += `<path d="M${x} ${y}l-11 27h22z M${x} ${y+17}l-15 30h30z" fill="${i%2 ? '#63724b' : '#465b43'}" opacity=".3"/>`; }
      for(let d = 0; d < r.layers-1; d++) for(const a of r.nodes[d]) for(const b of r.nodes[d+1]) { const p=pt(a),q=pt(b); svg += `<path d="M${p.x} ${p.y} Q${p.x} ${(p.y+q.y)/2} ${q.x} ${q.y}" fill="none" stroke="#c1b88a" stroke-opacity=".32" stroke-dasharray="5 9" stroke-width="2"/>`; }
      svg += r.nodes.flat().map(n => { const p=pt(n), passed=r.path.includes(n.id), available=n.depth===r.depth&&!r.quiz&&r.status==='active'; return `<g class="wa-node ${passed?'passed':available?'available':'locked'}" ${available?`data-node="${esc(n.id)}" role="button" tabindex="0" aria-label="选择${esc(n.name)}"`:''}><circle cx="${p.x}" cy="${p.y}" r="29"/><text x="${p.x}" y="${p.y+8}" text-anchor="middle" class="wa-symbol">${passed?'✓':['◇','✎','?'][n.lane]}</text><text x="${p.x}" y="${p.y+50}" text-anchor="middle">${esc(n.name)} · ${['辨义','拼写','混合'][n.lane]}</text></g>`; }).join('');
      const old = $('#wa-map').scrollTop;
      $('#wa-map').innerHTML = `<svg viewBox="0 0 900 ${height}" aria-label="冒险路线图">${svg}</svg>`;
      $('#wa-map').scrollTop = old || Math.max(0, ($('#wa-map').scrollHeight - $('#wa-map').clientHeight) - r.depth*100);
    }
    $('#wa-stats').innerHTML = `<p>记忆卡展示 ${(state.exposures||[]).length} 次 · 累计 ${state.totalAttempts} 次作答 · ${state.correctAttempts} 次正确 · ${state.words.length} 个留痕单词</p><div class="wa-word-stats">${state.words.map(w=>`<div><b>${esc(w.front)}</b><span>${esc(w.back)}</span><small>正确 ${w.correct} / 错误 ${w.wrong}</small></div>`).join('') || '完成第一题后，这里开始记录。'}</div>`;
  }
  async function setup(replaceRunId=null) {
    const study = await window.companion.getData(), ai = await call('get');
    const words = study.vocabulary.filter(w=>w.front?.trim()&&w.back?.trim());
    if (!ai.sessions.length) throw new Error('请先在“聊天与剧情”创建一个陪伴存档，选择同行角色。');
    if (!words.length) throw new Error('请先在“英语学习”导入有英文和释义的单词。');
    const d=document.createElement('dialog'); d.className='ai-dialog wa-setup';
    const chosen=new Set(); let visible=[], sampledGroups=[]; const original=state?.runs.find(r=>r.id===replaceRunId);
    const lists=study.english?.wordLists || [{id:'list_default',name:'默认词库'}];
    d.innerHTML=`<form><p class="section-label">准备你的旅程</p><h2>选好词，和同伴一起出发</h2><label>冒险名称<input name="title" value="迷雾中的记忆之旅" required></label><label>同行存档<select name="session">${ai.sessions.map(s=>`<option value="${esc(s.id)}" ${s.id===window.AIWorkspace.currentSession()?'selected':''}>${esc(s.title)}（${esc(s.instances.map(a=>a.card.name).join('、'))}）</option>`).join('')}</select></label><label>右侧主视角角色<select name="viewpoint"></select></label><div class="ai-api-numbers"><label>路线层数<input type="number" name="layers" min="1" max="40" value="8" required></label><label>每关答对词数<input type="number" name="quota" min="1" max="500" value="3" required></label></div><fieldset class="wa-sources"><legend>单词来源（可多选）</legend><label><input type="checkbox" name="all-sources" checked>全部词库</label>${lists.map(l=>`<label><input type="checkbox" name="source" value="${esc(l.id)}">${esc(l.name)}（${WordSelection.filterWords(words,{sources:[l.id]}).length} 词）</label>`).join('')}</fieldset><div class="ai-inline wa-group-options"><label>每组目标词数<input name="per-group" type="number" min="1" max="100" value="10"></label><button type="button" data-sample>按组重新抽取</button></div><p class="wa-group-summary"></p><div class="ai-inline"><select name="mode" aria-label="单词状态"><option value="all">全部有效单词</option><option value="due">到期复习</option><option value="new">未学</option><option value="wrong">错词</option></select><input name="filter" placeholder="搜索单词或释义"></div><div class="wa-selection-actions"><button type="button" data-select>全选当前结果</button><button type="button" data-clear>清空全部选择</button><button type="button" data-only>移除筛选外已选</button></div><p class="wa-selection-summary" role="status"></p><div class="wa-word-picker"></div><p class="wa-capacity"></p><div class="ai-inline"><button type="button" data-more-layers>增加路线层数</button><button type="button" data-more-quota>按目标调整每关词数</button></div><label><input type="checkbox" name="character-growth">角色具有成长性（附加人格可塑性指令）</label><label><input type="checkbox" name="auto-scene" checked>开始和过关后自动生成角色剧情（调用已配置 API）</label><p class="ai-hint">切换来源会替换本次目标词，可同时勾选多个词库。各组去重后交替出题。设置确认后会打开独立窗口，关闭窗口表示暂停；学习履历始终保留。</p><p class="wa-feedback" role="alert"></p><div class="ai-inline"><button type="button" data-close class="button ghost">取消</button><button class="button primary" type="submit">确认并开始</button></div></form>`;
    document.body.append(d); d.showModal(); d.onclose=()=>d.remove(); d.querySelector('[data-close]').onclick=()=>d.close();
    const field=n=>d.querySelector(`[name="${n}"]`);
    function viewpoints(){const s=ai.sessions.find(s=>s.id===field('session').value);if(!original)field('character-growth').checked=Boolean(([...s.events].reverse().find(e=>e.type==='world.updated')?.world||s.initialWorld).characterGrowth);field('viewpoint').innerHTML=s.instances.map(a=>`<option value="${esc(a.id)}">${esc(a.card.name)}</option>`).join('');} viewpoints(); field('session').onchange=viewpoints;
    function update(){
      const sources=[...d.querySelectorAll('[name=source]:checked')].map(c=>c.value);
      visible=!field('all-sources').checked&&!sources.length?[]:WordSelection.filterWords(words,{sources:field('all-sources').checked?[]:sources,query:field('filter').value,mode:field('mode').value,wrongIds:state?.wrongIds||[],learnedIds:state?.learnedIds||[]});
      d.querySelector('.wa-word-picker').innerHTML=visible.map(w=>`<label><input type="checkbox" name="word" value="${esc(w.id)}" ${chosen.has(w.id)?'checked':''}><b>${esc(w.front)}</b><span>${esc(w.back)}</span><small>${esc((w.libraryIds||['list_default']).map(id=>lists.find(l=>l.id===id)?.name||'默认词库').join(' / '))}</small></label>`).join('')||'<p class="ai-hint">当前来源和筛选下没有单词。</p>';
      const outside=[...chosen].filter(id=>!visible.some(w=>w.id===id)).length;
      d.querySelector('.wa-selection-summary').textContent=`当前结果 ${visible.length} 个 · 已选 ${chosen.size} 个${outside?`（其中 ${outside} 个在当前筛选之外）`:''}`;
      d.querySelector('.wa-group-summary').textContent=assignments().map(g=>`${lists.find(l=>l.id===g.sourceId)?.name||'词库'}：${g.wordIds.filter(id=>chosen.has(id)).length} 词`).join(' · ');
      const capacity=Number(field('layers').value)*Math.min(chosen.size,Number(field('quota').value));
      d.querySelector('.wa-capacity').textContent=`路线容量 ${capacity} 个词 · 已选 ${chosen.size} 个${capacity<chosen.size?'，请调整后再开始。':'，可覆盖全部目标。'}`;
    }
    d.querySelector('.wa-word-picker').onchange=e=>{if(e.target.name==='word'){if(e.target.checked)chosen.add(e.target.value);else chosen.delete(e.target.value);update();}};
    field('filter').oninput=update;field('mode').onchange=update;
    field('all-sources').onchange=resample;
    d.querySelectorAll('[name=source]').forEach(c=>c.onchange=()=>{field('all-sources').checked=false;resample();});
    field('layers').oninput=update;field('quota').oninput=update;
    d.querySelector('[data-select]').onclick=()=>{visible.forEach(w=>chosen.add(w.id));update();};
    d.querySelector('[data-clear]').onclick=()=>{chosen.clear();update();};
    d.querySelector('[data-only]').onclick=()=>{for(const id of chosen)if(!visible.some(w=>w.id===id))chosen.delete(id);update();};
    d.querySelector('[data-more-layers]').onclick=()=>{field('layers').value=Math.min(40,Math.ceil(chosen.size/Math.max(1,Number(field('quota').value))));update();};
    d.querySelector('[data-more-quota]').onclick=()=>{field('quota').value=Math.max(1,Math.ceil(chosen.size/Math.max(1,Number(field('layers').value))));update();};
    function sources(){return field('all-sources').checked?lists.map(l=>l.id):[...d.querySelectorAll('[name=source]:checked')].map(c=>c.value);}
    function assignments(){const groups=sources().map(sourceId=>({sourceId,wordIds:[]}));for(const id of chosen){const w=words.find(w=>w.id===id);if(!w)continue;const eligible=groups.filter(g=>(w.libraryIds?.length?w.libraryIds:['list_default']).includes(g.sourceId));const previous=sampledGroups.find(g=>g.wordIds.includes(id));const g=eligible.find(g=>g.sourceId===previous?.sourceId)||eligible.sort((a,b)=>a.wordIds.length-b.wordIds.length)[0];if(g)g.wordIds.push(id);}return groups;}
    function resample(){update(); const result=WordSelection.sampleGroups(visible,sources(),Number(field('per-group').value),state?.learnedIds||[]);chosen.clear();result.ids.forEach(id=>chosen.add(id));sampledGroups=result.groups;update();}
    field('per-group').onchange=resample;d.querySelector('[data-sample]').onclick=resample;
    if(original){field('title').value=original.title;field('session').value=original.sessionId;if(!ai.sessions.some(s=>s.id===original.sessionId))field('session').value=ai.sessions[0].id;viewpoints();field('layers').value=original.layers;field('quota').value=original.quota;field('auto-scene').checked=original.autoScene;field('character-growth').checked=original.characterGrowth;}resample();
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;try{if(!chosen.size)throw new Error('所选词源没有有效单词，请先导入该词库；不会退回旧词库出题。');if(replaceRunId && !confirm('更换目标词会重新开始本次冒险的关卡与剧情，所有已产生的学习履历仍保留。继续吗？'))return;const r=await call('adventureStart',{sessionId:field('session').value,title:field('title').value,layers:Number(field('layers').value),quota:Number(field('quota').value),wordIds:[...chosen],sourceIds:sources(),groups:assignments(),replaceRunId,viewpointId:field('viewpoint').value,characterGrowth:field('character-growth').checked,autoScene:field('auto-scene').checked});selected=r.id;await call('adventureOpen',{runId:r.id});d.close();await refresh();}catch(e){d.querySelector('.wa-feedback').textContent=e.message;}finally{b.disabled=false;}};
  }
  root.addEventListener('click',e=>{const tab=e.target.closest('[data-ai-tab="adventure"]');if(tab)action(refresh);const n=e.target.closest('[data-node]');if(n)action(async()=>{await call('adventureOpen',{runId:selected});});});
  $('#wa-map').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.dataset.node){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  $('#wa-new').onclick=()=>action(setup); $('#wa-replace').onclick=()=>action(()=>setup(selected)); $('#wa-resume').onclick=()=>action(()=>call('adventureOpen',{runId:selected}));
  $('#wa-runs').onchange=()=>{selected=$('#wa-runs').value;draw();};
  $('#wa-remove').onclick=()=>action(async()=>{if(confirm('删除这次冒险？全部作答与单词学习履历仍会永久保留。')){await call('adventureRemove',{runId:selected});await refresh();}});
  $('#wa-story').textContent='打开剧情阅读窗口'; $('#wa-story').onclick=()=>action(()=>call('adventureOpen',{runId:selected}));
  window.companion.onAdventureSources?.(runId=>action(async()=>{await refresh();selected=runId;draw();await setup(runId);}));
  $('#wa-export').onclick=()=>action(()=>call('adventureExport'));
})();
