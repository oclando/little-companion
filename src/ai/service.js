const fs = require('fs');
const path = require('path');
const { AIStore, validateWorld } = require('./store');
const { normalizeCard, parseCard } = require('./cards');
const { buildPrompt, substitute } = require('./prompt');
const { complete, endpoint } = require('./provider');
const { AdventureStore } = require('./adventure');
const { parseScreenplay } = require('./screenplay');

function registerAI({ ipcMain, dialog, safeStorage, root, readStudyData, getWindow, notify, inQuietHours, activateDesktopCharacter, activateDesktopGroup, fetchImpl, openAdventureWindow, adventureContext, avatarFromBuffer, defaultAvatar, changeAdventureSources, openChatWindow, getChatTarget, chatContext, closeChatWindow }) {
  const store = new AIStore(path.join(root(), 'generative-ai', 'state.json'));
  const secretFile = path.join(root(), 'generative-ai', 'key.enc');
  const adventure = new AdventureStore(path.join(root(), 'generative-ai', 'learning.json'));
  let active = null, group = null;
  const emit = payload => {
    const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send('ai-event', payload);
    const target=getChatTarget?.();
    if(target?.sessionId===payload.sessionId && target.window && !target.window.isDestroyed())target.window.webContents.send('chat-event',{type:payload.type,sessionId:payload.sessionId,instanceId:payload.instanceId,hasUserMessage:payload.hasUserMessage,delta:payload.delta,...(payload.type==='delta'?{}:{data:chatData(payload.sessionId)})});
  };
  function chatData(sessionId){
    const s=state(), session=structuredClone(store.session(s,sessionId));
    session.instances=session.instances.map(a=>({id:a.id,name:a.card.name,avatar:a.card.avatar||defaultAvatar?.(a.card.desktopCharacterId)||null}));
    return {session,memories:s.memories.filter(m=>m.sessionId===sessionId),world:store.world(session),userName:s.settings.userName||'你',busy:Boolean(active||group),ownBusy:active?.sessionId===sessionId||group?.sessionId===sessionId,activeInstanceId:active?.sessionId===sessionId?active.instanceId:null};
  }
  function ownMemory(sessionId,memoryId){const m=state().memories.find(m=>m.id===memoryId&&m.sessionId===sessionId);if(!m)throw new Error('当前存档中不存在这条记忆');return m;}
  const key = () => {
    if (!fs.existsSync(secretFile)) return '';
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前 Windows 会话无法解密 API 密钥');
    try { return safeStorage.decryptString(fs.readFileSync(secretFile)); }
    catch { throw new Error('本机密钥无法解密，请在 API 设置中重新填写并保存密钥。'); }
  };
  const saveKey = value => {
    if (!value) { if (fs.existsSync(secretFile)) fs.unlinkSync(secretFile); return; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前 Windows 会话无法安全保存 API 密钥');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, safeStorage.encryptString(value), { mode: 0o600 });
  };
  function state() {
    let s = store.read();
    if (!s.settings.officialModelUpdated && /^https:\/\/api\.deepseek\.com\/?(?:v1\/?)?$/.test(s.settings.baseUrl) && s.settings.model === 'deepseek-chat') {
      store.transaction(data => { data.settings.model = 'deepseek-flash'; data.settings.officialModelUpdated = true; }); s = store.read();
    }
    if (!s.seeded) {
      store.seed(readStudyData().characters);
      store.transaction(data => { data.seeded = true; });
      s = store.read();
    }
    return { ...s, hasApiKey: fs.existsSync(secretFile), busy: active ? { sessionId: active.sessionId, instanceId: active.instanceId } : group ? { sessionId: group.sessionId, instanceId: group.instanceId } : null };
  }
  function learningFacts() {
    const study = readStudyData(); const today = new Date().toDateString();
    const reviewed = new Set(study.reviewLog.filter(x => new Date(x.reviewedAt || x.at || x.date).toDateString() === today).map(x => x.wordId));
    for (const a of adventure.read().attempts) if (a.correct && new Date(a.reviewedAt).toDateString() === today) reviewed.add(a.wordId);
    return { totalWords: study.vocabulary.length, dueWords: study.vocabulary.filter(x => new Date(x.dueAt || x.nextReviewAt || x.createdAt || 0).getTime() <= Date.now()).length, reviewedToday: reviewed.size, dailyGoal: Number(study.settings.dailyWordGoal) || 20 };
  }
  async function generate(p) {
    if (active) throw new Error('当前有回复正在生成，请等待或停止');
    const initial = state(); const session = store.session(initial, p.sessionId);
    const instanceId = p.instanceId || session.instances[0].id;
    if (!session.instances.some(x => x.id === instanceId)) throw new Error('回复角色不存在');
    const apiKey = key();
    const address = new URL(endpoint(initial.settings.baseUrl));
    if (!apiKey && !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) throw new Error('请先在 API 设置中保存密钥');
    if (p.content !== undefined) {
      const candidate = structuredClone(session);
      candidate.events.push({ type: 'message', role: 'user', content: String(p.content) });
      buildPrompt(store, initial, candidate, instanceId, { instruction: p.instruction || '', learning: p.learning ? learningFacts() : null });
      store.appendMessage(p.sessionId, 'user', p.content);
    }
    const current = state(); const currentSession = store.session(current, p.sessionId);
    const prompt = buildPrompt(store, current, currentSession, instanceId, { instruction: p.instruction || '', learning: p.learning ? learningFacts() : null });
    const controller = new AbortController();
    active = { sessionId: p.sessionId, instanceId, controller };
    emit({ type: 'start', sessionId: p.sessionId, instanceId, hasUserMessage: p.content !== undefined, state: state() });
    try {
      const result = await complete({ settings: current.settings, apiKey, fetchImpl, messages: prompt.messages, signal: controller.signal, onDelta: delta => emit({ type: 'delta', sessionId: p.sessionId, instanceId, delta }) });
      if (controller.signal.aborted) throw new Error('生成已停止');
      const event = store.appendMessage(p.sessionId, 'assistant', result.content, instanceId, current.revision);
      if (p.reminder) notify(`${currentSession.instances.find(x => x.id === instanceId).card.name} · 学习提醒`, result.content.slice(0, 180), { kind: 'ai-study' });
      return { event, finishReason: result.finishReason, context: { includedMessages: prompt.includedMessages, totalMessages: prompt.totalMessages, recalledMemories: prompt.memoryIds.length } };
    } finally {
      active = null;
      emit({ type: 'end', sessionId: p.sessionId, state: state() });
    }
  }
  async function exportJSON(name, data) {
    const result = await dialog.showSaveDialog(getWindow(), { title: '导出到本机', defaultPath: name.replace(/[<>:"/\\|?*]/g, '_'), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2)); return true;
  }
  async function chooseJSON(title, extensions) {
    const result = await dialog.showOpenDialog(getWindow(), { title, properties: ['openFile'], filters: [{ name: title, extensions }] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('文件不能超过 20 MB');
    return { file, buffer: fs.readFileSync(file) };
  }
  const commands = {
    get: () => state(),
    chatOpen:p=>{store.session(state(),p.sessionId);openChatWindow?.(p.sessionId);return true;},
    chatWindowData:p=>chatData(p.sessionId),
    chatSend:async p=>{
      const session=store.session(state(),p.sessionId), actor=session.instances.find(a=>a.id===p.instanceId)||session.instances[0];
      if(p.content!==undefined&&(!String(p.content).trim()||String(p.content).length>24000))throw new Error('请输入不超过24000字的消息');
      const payload={sessionId:session.id,instanceId:actor.id,...(p.content!==undefined?{content:String(p.content).trim()}: {})};
      if(p.group&&session.instances.length>1)return commands.generateGroup(payload);
      activateDesktopCharacter?.(actor.card.desktopCharacterId);return generate(payload);
    },
    chatCancel:p=>{if(active?.sessionId===p.sessionId||group?.sessionId===p.sessionId){if(group)group.cancelled=true;active?.controller.abort();}},
    chatRemember:p=>store.addMemory({sessionId:p.sessionId,instanceId:p.instanceId,content:p.content,sourceEventIds:p.sourceEventIds||[]}),
    chatEditMemory:p=>{ownMemory(p.sessionId,p.memoryId);return store.editMemory(p.memoryId,p.content);},
    chatForget:p=>{ownMemory(p.sessionId,p.memoryId);return store.forget({memoryId:p.memoryId});},
    adventureGet: () => adventure.view(),
    adventureStart: p => { const s = store.session(state(), p.sessionId), study=readStudyData(); return adventure.start(p, study.vocabulary, s.instances.map(a => ({ name: a.card.name, id: a.id, avatar: a.card.avatar || defaultAvatar?.(a.card.desktopCharacterId) || null })), study.english.wordLists); },
    adventureOpen: p => { adventure.run(adventure.read(),p.runId); openAdventureWindow?.(p.runId); return true; },
    adventureChangeSources: p => {adventure.run(adventure.read(),p.runId);changeAdventureSources?.(p.runId);return true;},
    adventureWindowData: p => { const r=adventure.run(adventure.read(),p.runId); return {...r,question:adventure.question(r),generating:active?.sessionId===`adventure:${r.id}`}; },
    adventureCancel: p => { if(active?.sessionId===`adventure:${p.runId}`)active.controller.abort(); },
    adventureScene: async p => {
      const r=adventure.run(adventure.read(),p.runId), checkpoint=`${r.depth}:${r.quiz?.nodeId || 'route'}`;
      if(!p.text && !p.newBeat && r.sceneKeys?.includes(checkpoint))return r;
      const keyName=p.text||p.newBeat?`${checkpoint}:${String(p.requestId || '')}`:checkpoint;
      if((p.text||p.newBeat) && !p.requestId)throw new Error('剧情请求缺少标识');
      if(r.sceneKeys?.includes(keyName))return r;
      const s=state(), session=store.session(s,r.sessionId), controller=new AbortController();
      const rows=[];
      active={sessionId:`adventure:${r.id}`,instanceId:session.instances[0].id,controller};
      try {
        for(const actor of session.instances) {
          const context=buildPrompt(store,s,session,actor.id,{characterGrowth:r.characterGrowth}).messages[0].content;
          const userAction=String(p.text||'描述眼前场景，回应同伴，邀请我选择下一步。').slice(0,4000), history=[];
          let remaining=(Number(s.settings.contextChars)||24000)-context.length-userAction.length-1500;
          if(remaining<0)throw new Error('剧情资料超过上下文预算，请精简角色或世界资料。');
          for(const e of (r.feed||[]).slice(-18).reverse()){const row={type:e.type,name:r.companions.find(c=>c.id===e.actorId)?.name,text:e.text},size=JSON.stringify(row).length;if(size>remaining)break;history.unshift(row);remaining-=size;}
          const result=await complete({settings:s.settings,apiKey:key(),fetchImpl,signal:controller.signal,messages:[{role:'system',content:context+'\n输出 JSON 对象 {"segments":[{"type":"narration","text":"环境或动作"},{"type":"dialogue","actorId":"'+actor.id+'","text":"你的发言"}]}。仅扮演当前角色，不输出其他人的发言。不得宣布未完成的关卡通过，不要伪造词数。'}, {role:'user',content:JSON.stringify({depth:r.depth,total:r.layers,currentNode:r.quiz?r.nodes[r.depth].find(n=>n.id===r.quiz.nodeId)?.name:'岔路前',quizPhase:r.quiz?.phase||null,history,action:userAction})}]});
          rows.push(...parseScreenplay(result.content,actor.id));
        }
        if(controller.signal.aborted)throw new Error('剧情生成已停止');
        return adventure.appendScene(r.id,keyName,[...(p.text?[{type:'action',text:String(p.text).slice(0,4000),source:'user'}]:[]),...rows],r.depth);
      } finally {active=null;}
    },
    adventureChoose: p => adventure.choose(p.runId, p.nodeId),
    adventureReveal: p => { if(!p.questionId)throw new Error('记忆卡标识缺失');return adventure.reveal(p.runId,p.questionId); },
    adventureAnswer: p => adventure.answer(p.runId, p.questionId, p.answer),
    adventureNext: p => {if(!p.questionId)throw new Error('题目标识缺失');return adventure.next(p.runId, p.questionId);},
    adventureRemove: p => adventure.remove(p.runId),
    adventureExport: () => {const s=adventure.read();return exportJSON('永久单词学习履历.json',{format:'companion-learning-ledger',version:1,attempts:s.attempts,exposures:s.exposures||[]});},
    generateGroup: async p => {
      const session = store.session(state(), p.sessionId);
      group = { sessionId: session.id, instanceId: session.instances[0].id, cancelled: false };
      activateDesktopGroup?.(session.instances.map(a => a.card.desktopCharacterId).filter(Boolean));
      const results = [];
      try {
        for (const [index, actor] of session.instances.entries()) {
          if (group.cancelled) break;
          group.instanceId = actor.id;
          results.push(await generate({ sessionId: session.id, instanceId: actor.id, ...(index === 0 && p.content !== undefined ? { content: p.content } : {}), learning: p.learning, instruction: `现在轮到${actor.card.name}回应用户和同伴。只以自己的角色发言。` }));
        }
        return { ...results.at(-1), turns: results.length };
      } finally { group = null; emit({ type: 'end', sessionId: session.id, state: state() }); }
    },
    settings: p => {
      const old = store.read().settings;
      const baseUrl = String(p.baseUrl || old.baseUrl).trim(); endpoint(baseUrl);
      const model = String(p.model || old.model).trim();
      if (!model) throw new Error('请填写模型名称');
      if (p.clearApiKey) saveKey(''); else if (typeof p.apiKey === 'string' && p.apiKey.trim()) saveKey(p.apiKey.trim());
      store.transaction(s => { s.settings = { ...s.settings, baseUrl, model, stream: p.stream !== false, userName: String(p.userName || '你').slice(0, 50), temperature: Math.max(0, Math.min(2, Number(p.temperature) || 0)), maxTokens: Math.max(64, Math.min(16000, Number(p.maxTokens) || 1400)), contextChars: Math.max(8000, Math.min(100000, Number(p.contextChars) || 24000)) }; });
    },
    test: async () => {
      const s = state();
      const result = await complete({ settings: { ...s.settings, maxTokens: 64 }, apiKey: key(), fetchImpl, messages: [{ role: 'user', content: '请只回复：连接成功' }] });
      return result.content;
    },
    importCard: async p => {
      const selected = await chooseJSON('导入酒馆角色卡', ['json', 'png']);
      if (selected) { const parsed=parseCard(selected.buffer,path.extname(selected.file)); if(path.extname(selected.file).toLowerCase()==='.png' && avatarFromBuffer){const d=parsed.raw.data||parsed.raw; d.extensions={...d.extensions,companion_avatar:avatarFromBuffer(selected.buffer)};} return store.importCard(parsed.raw, p.desktopCharacterId || null); }
    },
    setAvatar: async p => {
      const selected=await chooseJSON('选择角色头像',['png','jpg','jpeg','webp']); if(!selected)return;
      if(!avatarFromBuffer)throw new Error('头像功能不可用'); const avatar=avatarFromBuffer(selected.buffer);
      store.transaction(s=>{const c=s.cards.find(c=>c.id===p.cardId);if(!c)throw new Error('角色卡不存在');c.avatar=avatar;const d=c.raw.data||c.raw;d.extensions={...d.extensions,companion_avatar:avatar};for(const session of s.sessions)for(const actor of session.instances)if(actor.cardId===c.id){actor.card.avatar=avatar;const ad=actor.card.raw.data||actor.card.raw;ad.extensions={...ad.extensions,companion_avatar:avatar};}});
      adventure.tx(s=>{const actors=new Set(store.read().sessions.flatMap(s=>s.instances.filter(a=>a.cardId===p.cardId).map(a=>a.id))); for(const r of s.runs)for(const c of r.companions)if(actors.has(c.id))c.avatar=avatar;});
    },
    saveCard: p => {
      if (!p.cardId) return store.importCard(normalizeCard(p.raw), p.desktopCharacterId || null);
      store.transaction(s => {
        const index = s.cards.findIndex(x => x.id === p.cardId);
        if (index < 0) throw new Error('角色卡不存在');
        s.cards[index] = { ...s.cards[index], ...normalizeCard(p.raw), desktopCharacterId: p.desktopCharacterId || null, updatedAt: new Date().toISOString() };
      });
    },
    exportCard: p => {
      const card = state().cards.find(x => x.id === p.cardId);
      if (!card) throw new Error('角色卡不存在');
      return exportJSON(`${card.name}.json`, card.raw);
    },
    deleteCard: p => store.transaction(s => { s.cards = s.cards.filter(x => x.id !== p.cardId); }),
    createSession: p => store.createSession(p),
    activateActor: p => {
      const session = store.session(state(), p.sessionId);
      const actor = session.instances.find(a => a.id === p.instanceId);
      if (!actor) throw new Error('角色实例不存在');
      return actor.card.desktopCharacterId ? Boolean(activateDesktopCharacter?.(actor.card.desktopCharacterId)) : false;
    },
    generate,
    cancel: () => { if (group) group.cancelled = true; active?.controller.abort(); },
    rewind: p => store.rewind(p.sessionId, p.eventId, { include: p.include !== false, ...(p.replacement !== undefined ? { replacement: p.replacement } : {}) }),
    branch: p => store.branch(p.sessionId, p.eventId),
    addMemory: p => store.addMemory(p),
    editMemory: p => store.editMemory(p.memoryId, p.content),
    forget: p => store.forget(p),
    updateWorld: p => store.updateWorld(p.sessionId, p.world),
    deleteSession: p => {store.deleteSession(p.sessionId);if(getChatTarget?.()?.sessionId===p.sessionId)closeChatWindow?.();},
    exportSession: p => {
      const s = state(); const session = store.session(s, p.sessionId);
      return exportJSON(`${session.title}.json`, { format: 'companion-save', schemaVersion: 1, session, memories: s.memories.filter(m => m.sessionId === session.id) });
    },
    importSession: async () => {
      const selected = await chooseJSON('导入剧情与记忆存档', ['json']);
      if (!selected) return;
      const bundle = JSON.parse(selected.buffer.toString('utf8'));
      if (bundle.format !== 'companion-save' || bundle.schemaVersion !== 1) throw new Error('不是受支持的桌宠剧情存档');
      const session = bundle.session;
      if (!session || !['chat', 'adventure'].includes(session.mode) || !Array.isArray(session.events) || !Array.isArray(session.instances) || !session.instances.length || session.instances.length > 8 || !Array.isArray(bundle.memories)) throw new Error('存档结构不完整');
      validateWorld(session.initialWorld);
      const ids = new Set();
      for (const actor of session.instances) { if (!actor.id || ids.has(actor.id)) throw new Error('角色标识无效'); ids.add(actor.id); actor.card = { ...actor.card, ...normalizeCard(actor.card.raw) }; }
      const events = new Set();
      for (const e of session.events) {
        if (!e.id || events.has(e.id)) throw new Error('事件标识无效'); events.add(e.id);
        if (e.type === 'world.updated') validateWorld(e.world);
        else if (e.type !== 'message' || !['user', 'assistant'].includes(e.role) || typeof e.content !== 'string' || (e.role === 'assistant' && !ids.has(e.instanceId))) throw new Error('存档含有无效事件');
      }
      for (const m of bundle.memories) if (!ids.has(m.instanceId) || typeof m.content !== 'string' || !Array.isArray(m.sourceEventIds) || m.sourceEventIds.some(e => !events.has(e)) || (m.anchorEventId && !events.has(m.anchorEventId))) throw new Error('记忆归属或来源无效');
      // Import with fresh identifiers: reuse branch's remapping and isolation semantics.
      const { randomUUID } = require('crypto');
      const actorMap = new Map(session.instances.map(a => [a.id, `actor_${randomUUID()}`]));
      const eventMap = new Map(session.events.map(e => [e.id, `event_${randomUUID()}`]));
      session.id = `session_${randomUUID()}`; session.parent = null; session.title = String(session.title || '导入存档').slice(0, 100);
      session.instances.forEach(a => { a.id = actorMap.get(a.id); });
      session.events.forEach(e => { e.id = eventMap.get(e.id); if (e.instanceId) e.instanceId = actorMap.get(e.instanceId); });
      bundle.memories.forEach(m => { m.id = `memory_${randomUUID()}`; m.sessionId = session.id; m.instanceId = actorMap.get(m.instanceId); m.anchorEventId = eventMap.get(m.anchorEventId) || null; m.sourceEventIds = m.sourceEventIds.map(e => eventMap.get(e)); });
      store.transaction(s => { s.sessions.push(session); s.memories.push(...bundle.memories); });
      return session;
    },
    reminder: p => store.transaction(s => {
      const session = store.session(s, p.sessionId);
      if (session.mode !== 'chat') throw new Error('学习督促请选择日常聊天存档');
      s.settings.reminder = { ...s.settings.reminder, enabled: Boolean(p.enabled), sessionId: p.sessionId, intervalMinutes: Math.max(15, Math.min(1440, Number(p.intervalMinutes) || 60)) };
    })
  };
  ipcMain.handle('ai-call', async (event, operation, payload = {}) => {
    const isMain=event.sender===getWindow()?.webContents;
    try {
      if (!isMain) {
        const bound=adventureContext?.(event.sender);
        const chatBound=chatContext?.(event.sender);
        const allowed=['adventureWindowData','adventureChoose','adventureReveal','adventureAnswer','adventureNext','adventureScene','adventureCancel','adventureChangeSources'];
        const chatAllowed=['chatWindowData','chatSend','chatCancel','chatRemember','chatEditMemory','chatForget'];
        if(!(bound&&allowed.includes(operation)&&payload?.runId===bound)&&!(chatBound&&chatAllowed.includes(operation)&&payload?.sessionId===chatBound))throw new Error('此窗口只允许操作当前存档');
      }
      if (!Object.prototype.hasOwnProperty.call(commands, operation)) throw new Error('不支持的操作');
      if ((active || group) && !['get', 'cancel', 'exportCard', 'exportSession', 'activateActor', 'adventureGet','adventureWindowData','adventureCancel','chatOpen','chatWindowData','chatCancel'].includes(operation)) throw new Error('请先停止当前生成，再修改存档');
      const value = await commands[operation](payload || {});
      return { ok: true, value, ...(isMain?{state:state()}:{}) };
    } catch (error) {
      return { ok: false, error: error.name === 'AbortError' ? '生成已停止；用户消息已保留，可点击继续重试。' : error.name === 'TimeoutError' ? 'API 等待超时，请重试。' : error.message, ...(isMain?{state:(()=>{try{return state();}catch{return null;}})()}: {}) };
    }
  });

  let reminding = false;
  const timer = setInterval(async () => {
    if (active || group || reminding) return;
    try {
      const s = state(); const r = s.settings.reminder;
      if (!r.enabled || Date.now() - new Date(r.lastAt || 0).getTime() < r.intervalMinutes * 60000) return;
      if (inQuietHours(readStudyData().settings)) return;
      const facts = learningFacts();
      if (!facts.dueWords || facts.reviewedToday >= facts.dailyGoal) return;
      const session = store.session(s, r.sessionId); const actor = session.instances[0];
      reminding = true;
      store.transaction(data => { data.settings.reminder.lastAt = new Date().toISOString(); });
      try {
        await generate({ sessionId: session.id, instanceId: actor.id, learning: true, reminder: true, instruction: '根据程序学习数据，用角色语气写一条不超过80字的背单词提醒。只描述真实数量，不声称执行了任何操作。' });
      } catch {
        notify(`${actor.card.name} · 学习提醒`, `${substitute(actor.card.first_mes || '一起复习吧。', actor, s.settings.userName)} 还有 ${facts.dueWords} 个待复习单词。`, { kind: 'ai-study' });
      }
    } catch { /* A missing/deleted save cannot break the existing reminder loop. */ }
    finally { reminding = false; }
  }, 60000);
  timer.unref();
  return { store, openLastChat:()=>{const s=state();const session=[...s.sessions].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];if(!session)return false;openChatWindow?.(session.id);return true;}, shutdown: () => { clearInterval(timer); active?.controller.abort(); } };
}

module.exports = { registerAI };
