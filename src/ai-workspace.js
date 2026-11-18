(() => {
  const root = document.querySelector('#ai-workspace');
  const $ = selector => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let state = null, selectedId = null, speakerId = null, tab = 'story', inspector = 'memories', stream = '', initializedSettings = false;
  let pendingAction = false; const chatSpeech=window.SystemSpeech?.create({onStatus:message=>feedback(message)});
  const session = () => state?.sessions.find(x => x.id === selectedId);
  const actor = () => session()?.instances.find(x => x.id === speakerId) || session()?.instances[0];
  const activateActor = () => selectedId && speakerId ? call('activateActor', { sessionId: selectedId, instanceId: speakerId }, false) : null;
  const error = message => { $('#ai-error').textContent = message || ''; $('#ai-error').hidden = !message; };
  const feedback = message => { $('#ai-status').textContent = message; };

  async function call(operation, payload = {}, render = true) {
    const result = await window.companion.ai(operation, payload);
    if (result.state) state = result.state;
    if (render) draw();
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  async function run(fn) {
    error('');
    try { return await fn(); }
    catch (e) { error(e.message); }
  }
  function bind(id, fn) { $(id).addEventListener('click', () => run(fn)); }
  function switchTab(name) {
    tab = name;
    root.querySelectorAll('[data-ai-tab]').forEach(b => { b.classList.toggle('active', b.dataset.aiTab === name); b.setAttribute('aria-selected', String(b.dataset.aiTab === name)); });
    root.querySelectorAll('[data-ai-panel]').forEach(p => { p.hidden = p.dataset.aiPanel !== name; });
    if (name === 'api' && state) fillSettings();
  }
  function fillSettings() {
    const settings = state.settings;
    $('#ai-stream-enabled').checked = settings.stream !== false;
    for (const [id, field] of Object.entries({ 'ai-base-url': 'baseUrl', 'ai-model': 'model', 'ai-user-name': 'userName', 'ai-temperature': 'temperature', 'ai-max-tokens': 'maxTokens', 'ai-context-chars': 'contextChars' })) $(`#${id}`).value = settings[field];
    $('#ai-api-key').value = '';
    $('#ai-key-status').textContent = state.hasApiKey ? '已保存密钥（本机加密）' : '尚未保存密钥；本机模型可以不填。';
    initializedSettings = true;
  }
  function draw() {
    if (!state) return;
    if (!state.sessions.some(s => s.id === selectedId)) selectedId = state.sessions.at(-1)?.id || null;
    const current = session();
    if (!current?.instances.some(a => a.id === speakerId)) speakerId = current?.instances[0]?.id || null;
    feedback(state.busy ? '角色正在回应…' : `本机保存 · ${state.sessions.length} 个存档`);
    $('#ai-session-list').innerHTML = [...state.sessions].reverse().map(s => `<button class="ai-save ${s.id === selectedId ? 'active' : ''}" data-ai-session="${esc(s.id)}"><strong>${esc(s.title)}</strong><small>${s.mode === 'adventure' ? '小说冒险' : '日常陪伴'} · ${s.instances.length} 位角色${s.parent ? ' · 分支' : ''}</small></button>`).join('') || '<p class="ai-hint">创建存档，让角色拥有这段旅程的独立记忆。</p>';
    $('#ai-story-title').textContent = current?.title || '从一次相遇开始';
    $('#ai-mode-label').textContent = current ? current.mode === 'adventure' ? 'ADVENTURE / 小说冒险' : 'COMPANION / 日常陪伴' : '陪伴 / 冒险';
    $('#ai-speaker').innerHTML = (current?.instances || []).map(a => `<option value="${esc(a.id)}" ${a.id === speakerId ? 'selected' : ''}>${esc(a.card.name)}</option>`).join('');
    drawMessages(); drawMemories(); drawWorld(); drawCards();
    const r = state.settings.reminder;
    $('#ai-reminder-enabled').checked = Boolean(r.enabled && r.sessionId === selectedId);
    $('#ai-reminder-minutes').value = r.intervalMinutes;
    for (const id of ['#ai-send', '#ai-continue', '#ai-share-study', '#ai-delete-save', '#ai-export-save', '#ai-open-chat', '#ai-add-memory', '#ai-clear-memories', '#ai-edit-world', '#ai-save-reminder']) $(id).disabled = !current || Boolean(state.busy);
    $('#ai-input').disabled = !current || Boolean(state.busy);
    $('#ai-stop').hidden = !state.busy;
    $('#ai-send').hidden = Boolean(state.busy);
    if (!initializedSettings) fillSettings();
  }
  function drawMessages() {
    const current = session(); const node = $('#ai-messages');
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
    if (!current) { node.innerHTML = '<div class="ai-empty"><strong>你的角色，尚未落笔的故事</strong>导入喜欢的角色卡，或用桌宠现有角色新建存档。<br>日常聊天和小说冒险，各自保存经历与记忆。</div>'; return; }
    node.innerHTML = current.events.map(e => {
      if (e.type === 'world.updated') return `<div class="ai-world-event">世界已更新 · ${esc(e.world.name)} <button class="text-button" data-ai-event-action="rewind" data-event-id="${esc(e.id)}">回到此处</button></div>`;
      const name = e.role === 'user' ? state.settings.userName || '你' : current.instances.find(a => a.id === e.instanceId)?.card.name || '角色';
      return `<article class="ai-message ${esc(e.role)}"><header>${e.role === 'assistant' && current.instances.find(a=>a.id===e.instanceId)?.card.avatar?`<img class="ai-chat-avatar" src="${esc(current.instances.find(a=>a.id===e.instanceId).card.avatar)}" alt="${esc(name)}头像">`:`<span class="ai-chat-avatar fallback">${esc(name.slice(0,1))}</span>`}<b>${esc(name)}</b><span>${e.editedAt ? '已编辑' : e.role === 'user' ? '你的话与行动' : '角色回应'}</span></header><div class="ai-message-body">${esc(e.content)}</div><div class="ai-message-actions">${['read', 'stopSpeech', 'remember', 'edit', 'branch', 'rewind', ...(e.role === 'assistant' ? ['regenerate'] : [])].map(action => `<button class="text-button" data-ai-event-action="${action}" data-event-id="${esc(e.id)}" ${state.busy ? 'disabled' : ''}>${({ read: '🔊 朗读', stopSpeech: '停止', remember: '记住', edit: '编辑', branch: '从此分支', rewind: '回到此处', regenerate: '重新生成' })[action]}</button>`).join('')}</div></article>`;
    }).join('');
    if (state.busy?.sessionId === selectedId) {
      const who = current.instances.find(a => a.id === state.busy.instanceId)?.card.name || '角色';
      node.insertAdjacentHTML('beforeend', `<article class="ai-message assistant"><header><b>${esc(who)}</b><span>正在回应</span></header><div class="ai-message-body" id="ai-stream">${esc(stream || '…')}</div></article>`);
    }
    if (atBottom) node.scrollTop = node.scrollHeight;
  }
  function drawMemories() {
    const rows = state.memories.filter(m => m.sessionId === selectedId && m.instanceId === speakerId);
    $('#ai-memories').innerHTML = rows.map(m => `<article class="ai-memory"><p>${esc(m.content)}</p><small>${m.sourceEventIds.length ? `来源：${m.sourceEventIds.length} 条聊天 / 事件` : '手动确认的记忆'}</small><div class="ai-inline"><button class="text-button" data-ai-memory-action="edit" data-memory-id="${esc(m.id)}">编辑</button><button class="text-button" data-ai-memory-action="delete" data-memory-id="${esc(m.id)}">销毁</button></div></article>`).join('') || '<p class="ai-hint">这位角色尚未保存私人记忆。角色不会自动把模型的推测存为事实。</p>';
  }
  function world() { const current = session(); return current ? [...current.events].reverse().find(e => e.type === 'world.updated')?.world || current.initialWorld : null; }
  function drawWorld() {
    const w = world();
    $('#ai-world-name').textContent = w?.name || '';
    $('#ai-world-summary').textContent = w ? `${w.name}\n${w.rules || '尚未设定世界规则'}\n${w.clock ? `时间：${w.clock}\n` : ''}${w.locations.length} 个地点 · ${w.npcs.length} 位人物 · ${w.quests.length} 项任务` : '新建存档后，可以设定世界与地点。';
    if (!w?.locations.length) { $('#ai-map').innerHTML = '<p class="ai-hint">还没有地点。在“编辑世界”中添加第一站。</p>'; return; }
    const positions = new Map(w.locations.map((p, i) => [p.id, { x: 105 + 72 * Math.cos(i * 2 * Math.PI / w.locations.length), y: 100 + 65 * Math.sin(i * 2 * Math.PI / w.locations.length) }]));
    $('#ai-map').innerHTML = `<svg viewBox="0 0 210 200" role="img" aria-label="${esc(w.name)}的地点连接图">${w.connections.map(e => { const a = positions.get(e.from), b = positions.get(e.to); return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--line)" stroke-width="2"/>` : ''; }).join('')}${w.locations.map(p => { const pos = positions.get(p.id); return `<g><circle cx="${pos.x}" cy="${pos.y}" r="7" fill="${p.id === w.currentLocationId ? 'var(--violet)' : 'var(--ai-forest)'}"/><text x="${pos.x}" y="${pos.y + 20}" text-anchor="middle" font-size="10" fill="var(--ink)">${esc(p.name || p.id)}</text></g>`; }).join('')}</svg>`;
  }
  function drawCards() {
    $('#ai-card-list').innerHTML = state.cards.map(c => `<article class="ai-card"><small>${esc(c.format)}${c.desktopCharacterId ? ' · 已关联桌宠' : ''}</small><div class="ai-card-portrait">${c.avatar?`<img src="${esc(c.avatar)}" alt="${esc(c.name)}头像">`:`<span>${esc(c.name.slice(0,1))}</span>`}</div><h3>${esc(c.name)}</h3><p>${esc(c.description || c.personality || '还没有填写背景。')}</p><div class="ai-inline">${['start', 'edit', 'avatar', 'export', 'delete'].map(a => `<button class="text-button" data-ai-card-action="${a}" data-card-id="${esc(c.id)}">${({ start: '开始聊天', edit: '编辑', avatar: '头像', export: '导出', delete: '移除卡片' })[a]}</button>`).join('')}</div></article>`).join('') || '<p class="ai-hint">导入一张角色卡，或创建自己的角色。</p>';
  }
  function dialog(title, body, saveLabel, onSave) {
    const node = document.createElement('dialog'); node.className = 'ai-dialog';
    node.innerHTML = `<form><h2>${esc(title)}</h2>${body}<p class="ai-error" role="alert" hidden></p><div class="ai-inline ai-dialog-actions"><button type="button" class="button ghost" data-cancel>取消</button><button class="button primary" data-save>${esc(saveLabel)}</button></div></form>`;
    document.body.append(node);
    node.querySelector('[data-cancel]').onclick = () => node.close();
    node.addEventListener('close', () => node.remove());
    node.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const button = node.querySelector('[data-save]'); button.disabled = true;
      try { await onSave(node); node.close(); }
      catch (e) { const output = node.querySelector('[role=alert]'); output.textContent = e.message; output.hidden = false; }
      finally { button.disabled = false; }
    };
    node.showModal(); return node;
  }
  function newSession(preselected) {
    if (!state.cards.length) { switchTab('cards'); error('请先创建或导入角色卡。'); return; }
    dialog('开启一段新的旅程', `<label>存档名称<input name="title" placeholder="例如：伙伴的日常 / 雾港之旅" maxlength="100"></label><label>玩法<select name="mode"><option value="chat">日常陪伴</option><option value="adventure">小说冒险</option></select></label><label><input name="character-growth" type="checkbox">角色具有成长性（附加人格可塑性指令）</label><p class="ai-hint">选择参与角色（最多 8 位）。每位角色在新存档中拥有独立记忆；发言时可切换回复角色。</p>${state.cards.map((c, i) => `<label class="ai-card-choice"><input type="checkbox" name="card" value="${esc(c.id)}" ${(preselected ? preselected === c.id : i === 0) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}`, '开始', async node => {
      const row = await call('createSession', { title: node.querySelector('[name=title]').value, mode: node.querySelector('[name=mode]').value, characterGrowth: node.querySelector('[name=character-growth]').checked, cardIds: [...node.querySelectorAll('[name=card]:checked')].map(x => x.value) });
      selectedId = row.id; speakerId = row.instances[0].id; switchTab('story'); draw(); await activateActor(); await call('chatOpen',{sessionId:selectedId});
    });
  }
  async function editCard(cardId) {
    const card = state.cards.find(c => c.id === cardId);
    const study = await window.companion.getData();
    const fields = { name: '角色名称', description: '背景与身份', personality: '性格与说话方式', scenario: '初始情境', first_mes: '开场白', mes_example: '示例对话', system_prompt: '角色指令', post_history_instructions: '对话后置指令' };
    dialog(card ? '编辑通用角色卡' : '创建通用角色卡', `<p class="ai-hint">支持 {{char}} 和 {{user}}。已有剧情保留创建时的人设。</p>${Object.entries(fields).map(([key, label]) => `<label>${label}${key === 'name' ? `<input name="${key}" required value="${esc(card?.[key] || '')}">` : `<textarea name="${key}" rows="3">${esc(card?.[key] || '')}</textarea>`}</label>`).join('')}<label>关联桌宠形象<select name="desktop"><option value="">独立角色（不关联桌宠）</option>${study.characters.map(c => `<option value="${esc(c.id)}" ${c.id === card?.desktopCharacterId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`, '保存角色卡', async node => {
      const raw = card ? structuredClone(card.raw) : { spec: 'chara_card_v2', spec_version: '2.0', data: {} };
      const d = raw.data && typeof raw.data === 'object' ? raw.data : raw;
      for (const field of Object.keys(fields)) d[field] = node.querySelector(`[name=${field}]`).value;
      await call('saveCard', { cardId, raw, desktopCharacterId: node.querySelector('[name=desktop]').value || null });
    });
  }
  async function generate(content, learning = false) {
    if (pendingAction || state?.busy) return;
    pendingAction = true; stream = ''; error('');
    try {
      const result = await call($('#ai-group-mode').checked && session()?.instances.length > 1 ? 'generateGroup' : 'generate', { sessionId: selectedId, instanceId: speakerId, ...(content !== undefined ? { content } : {}), learning });
      $('#ai-input').value = '';
      feedback(`${result.finishReason === 'length' ? '达到回复长度上限，可点击继续 · ' : ''}上下文 ${result.context.includedMessages}/${result.context.totalMessages} 条 · 调用 ${result.context.recalledMemories} 条记忆`);
    } catch (e) { error(e.message); }
    finally { pendingAction = false; }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.aiTab) switchTab(button.dataset.aiTab);
    if (button.dataset.aiSession) { selectedId = button.dataset.aiSession; speakerId = null; error(''); draw(); $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight; run(async()=>{await activateActor();await call('chatOpen',{sessionId:selectedId});}); }
    if (button.dataset.aiInspect) {
      inspector = button.dataset.aiInspect;
      root.querySelectorAll('[data-ai-inspect]').forEach(b => b.classList.toggle('active', b.dataset.aiInspect === inspector));
      $('#ai-memory-panel').hidden = inspector !== 'memories'; $('#ai-world-panel').hidden = inspector !== 'world';
    }
    if (button.dataset.aiCardAction) run(async () => {
      const cardId = button.dataset.cardId, action = button.dataset.aiCardAction;
      if (action === 'start') newSession(cardId);
      if (action === 'edit') await editCard(cardId);
      if (action === 'avatar') await call('setAvatar', {cardId});
      if (action === 'export') await call('exportCard', { cardId });
      if (action === 'delete' && confirm('移除这张通用角色卡？已有存档中的角色与记忆会保留。')) await call('deleteCard', { cardId });
    });
    if (button.dataset.aiMemoryAction) run(async () => {
      const memory = state.memories.find(m => m.id === button.dataset.memoryId);
      if (!memory) return;
      if (button.dataset.aiMemoryAction === 'delete') { if (confirm('销毁这条记忆？聊天原文仍保留；需要彻底移除经历时请同时编辑或回退聊天。')) await call('forget', { memoryId: memory.id }); }
      else dialog('编辑私人记忆', `<textarea name="content" rows="6" required>${esc(memory.content)}</textarea>`, '保存', async node => call('editMemory', { memoryId: memory.id, content: node.querySelector('textarea').value }));
    });
    if (button.dataset.aiEventAction) run(async () => {
      const eventId = button.dataset.eventId; const row = session().events.find(e => e.id === eventId); const action = button.dataset.aiEventAction;
      if(action==='read')chatSpeech?.read([{text:row.content,kind:SystemSpeech.language(row.content)}]);
      if(action==='stopSpeech')chatSpeech?.stop();
      if (action === 'remember') {
        const owner = row.instanceId || speakerId;
        dialog('确认要保存的记忆', `<p class="ai-hint">归属：${esc(session().instances.find(a => a.id === owner)?.card.name)}。请将对话整理成准确的事实；保存后会记录这条聊天为来源。</p><textarea name="content" rows="6" required>${esc(row.content)}</textarea>`, '保存记忆', async node => call('addMemory', { sessionId: selectedId, instanceId: owner, content: node.querySelector('textarea').value, sourceEventIds: [eventId] }));
      }
      if (action === 'branch') { const next = await call('branch', { sessionId: selectedId, eventId }); selectedId = next.id; speakerId = null; draw(); }
      if (action === 'rewind' && confirm('回到这个节点？之后的聊天、世界变化和相应记忆将被移除。可以先从此处分支保留原剧情。')) await call('rewind', { sessionId: selectedId, eventId });
      if (action === 'edit') dialog('编辑这条消息', `<p class="ai-hint">保存后会移除这条消息之后的剧情与相关记忆，让故事从修改处继续。</p><textarea name="content" rows="7" required>${esc(row.content)}</textarea>`, '保存并回退', async node => call('rewind', { sessionId: selectedId, eventId, replacement: node.querySelector('textarea').value }));
      if (action === 'regenerate' && confirm('重新生成这条回应？该回应以及后续剧情和相关记忆将被移除。')) { const owner = row.instanceId; await call('rewind', { sessionId: selectedId, eventId, include: false }); speakerId = owner; await generate(); }
    });
  });
  $('#ai-speaker').addEventListener('change', () => { speakerId = $('#ai-speaker').value; drawMemories(); run(activateActor); });
  $('#ai-compose').addEventListener('submit', event => { event.preventDefault(); if ($('#ai-input').value.trim()) generate($('#ai-input').value.trim()); });
  $('#ai-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#ai-compose').requestSubmit(); } });
  bind('#ai-new-session', () => newSession());
  bind('#ai-create-card', () => editCard());
  bind('#ai-import-card', () => call('importCard'));
  bind('#ai-import-save', async () => { const imported = await call('importSession'); if (imported) { selectedId = imported.id; speakerId = null; draw(); } });
  bind('#ai-open-chat',()=>call('chatOpen',{sessionId:selectedId}));
  bind('#ai-export-save', () => call('exportSession', { sessionId: selectedId }));
  bind('#ai-delete-save', async () => { if (confirm('删除整个存档及其角色私人记忆？此操作无法撤销，已导出的文件需自行删除。')) await call('deleteSession', { sessionId: selectedId }); });
  bind('#ai-stop', () => call('cancel'));
  bind('#ai-continue', () => generate());
  bind('#ai-share-study', async () => { if (confirm('将当前单词总量、待复习数量和今日复习数量发送给你设置的 API，让角色陪你学习？')) await generate('陪我背单词吧。请根据真实的学习进度鼓励我，帮我制定一轮简短的复习计划。', true); });
  bind('#ai-add-memory', async () => { await call('addMemory', { sessionId: selectedId, instanceId: speakerId, content: $('#ai-memory-text').value }); $('#ai-memory-text').value = ''; });
  bind('#ai-clear-memories', async () => { if (confirm('清空当前角色在这个存档中的全部私人记忆？聊天原文仍保留；如需移除整个经历，请删除存档。')) await call('forget', { sessionId: selectedId, instanceId: speakerId }); });
  bind('#ai-edit-world', () => {
    const current = structuredClone(world());
    dialog('设定这个世界', `<label>世界名称<input name="name" required value="${esc(current.name)}"></label><label><input name="character-growth" type="checkbox" ${current.characterGrowth?'checked':''}>角色具有成长性（动态人格）</label><label>规则与背景<textarea name="rules" rows="4">${esc(current.rules)}</textarea></label><label>世界时间<input name="clock" value="${esc(current.clock)}" placeholder="例如：初夏，第 3 天傍晚"></label><label>地点（每行一个名称）<textarea name="locations" rows="5">${esc(current.locations.map(p => p.name || p.id).join('\n'))}</textarea></label><label>当前位置<select name="current"><option value="">尚未决定</option>${current.locations.map(p => `<option value="${esc(p.id)}" ${p.id === current.currentLocationId ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select></label><p class="ai-hint">新增地点依次连接；已有地点保留其标识与连接。更复杂的任务、物品和坐标可在高级数据中编辑。</p><details><summary>高级世界数据</summary><p class="ai-hint">修改下方数据后，优先使用此数据。地点与连接中的每项需要唯一 id；连接使用 from 和 to。</p><textarea name="advanced" class="ai-world-code" spellcheck="false">${esc(JSON.stringify(current, null, 2))}</textarea></details>`, '保存世界', async node => {
      const advanced = node.querySelector('[name=advanced]').value;
      let next;
      if (advanced !== JSON.stringify(current, null, 2)) next = JSON.parse(advanced);
      else {
        const names = [...new Set(node.querySelector('[name=locations]').value.split('\n').map(s => s.trim()).filter(Boolean))];
        const locations = names.map(name => current.locations.find(p => p.name === name) || { id: `place_${crypto.randomUUID()}`, name });
        const retained = new Set(locations.map(p => p.id));
        const connections = current.connections.filter(e => retained.has(e.from) && retained.has(e.to));
        for (let i = 1; i < locations.length; i++) if (!current.locations.some(p => p.id === locations[i].id)) connections.push({ id: `edge_${crypto.randomUUID()}`, from: locations[i - 1].id, to: locations[i].id });
        const locationId = node.querySelector('[name=current]').value;
        next = { ...current, characterGrowth:node.querySelector('[name=character-growth]').checked, name: node.querySelector('[name=name]').value, rules: node.querySelector('[name=rules]').value, clock: node.querySelector('[name=clock]').value, locations, connections, currentLocationId: retained.has(locationId) ? locationId : locations[0]?.id || null };
      }
      next.characterGrowth=node.querySelector('[name=character-growth]').checked;await call('updateWorld', { sessionId: selectedId, world: next });
    });
  });
  bind('#ai-save-reminder', () => call('reminder', { sessionId: selectedId, enabled: $('#ai-reminder-enabled').checked, intervalMinutes: Number($('#ai-reminder-minutes').value) }));
  async function saveApiForm() { await call('settings', { baseUrl: $('#ai-base-url').value, model: $('#ai-model').value, apiKey: $('#ai-api-key').value, stream: $('#ai-stream-enabled').checked, userName: $('#ai-user-name').value, temperature: Number($('#ai-temperature').value), maxTokens: Number($('#ai-max-tokens').value), contextChars: Number($('#ai-context-chars').value) }); fillSettings(); }
  $('#ai-api-form').addEventListener('submit', event => { event.preventDefault(); run(async () => { await saveApiForm(); feedback('API 设置已保存'); }); });
  bind('#ai-test-api', async () => { $('#ai-test-api').disabled = true; feedback('正在保存并测试…'); try { await saveApiForm(); const result = await call('test'); feedback(`连接成功 · ${result}`); } finally { $('#ai-test-api').disabled = false; } });
  bind('#ai-clear-key', async () => { if (confirm('删除本机保存的 API 密钥？')) { await call('settings', { ...state.settings, clearApiKey: true }); fillSettings(); } });
  window.companion.onAIEvent(event => {
    if (event.type === 'start') { state = event.state; stream = ''; if (event.hasUserMessage && event.sessionId === selectedId) $('#ai-input').value = ''; draw(); }
    if (event.type === 'delta') {
      stream += event.delta;
      if (event.sessionId === selectedId) {
        const node = $('#ai-stream'); if (node) { node.textContent = stream; const list = $('#ai-messages'); if (list.scrollHeight - list.scrollTop - list.clientHeight < 150) list.scrollTop = list.scrollHeight; }
      }
    }
    if (event.type === 'end') { state = event.state; stream = ''; draw(); }
  });
  window.addEventListener('beforeunload',()=>chatSpeech?.stop());
  window.companion.onOpenAIChat(() => { if (typeof setPage === 'function') setPage('ai'); });
  window.AIWorkspace = { open: () => run(async () => { await call('get'); switchTab(tab); await activateActor(); }), refresh: () => call('get'), newSession: () => run(() => newSession()), currentSession: () => selectedId };
})();
