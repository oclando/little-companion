const {CHARACTER_GROWTH_INSTRUCTION}=require('./character-growth');
function substitute(text, actor, userName) {
  return String(text || '').replace(/\{\{char\}\}/gi, actor.card.name).replace(/\{\{user\}\}/gi, userName || '你');
}

// Retrieval is a replaceable boundary. First version uses lexical ranking, no embedding service.
function retrieveMemories(memories, sessionId, instanceId, query, budget = 4500) {
  const words = [...new Set(String(query).toLowerCase().match(/[a-z]+|[\u3400-\u9fff]{1,2}/g) || [])];
  const rows = memories.filter(x => x.sessionId === sessionId && x.instanceId === instanceId)
    .map((m, index) => ({ m, score: words.reduce((n, w) => n + (m.content.toLowerCase().includes(w) ? 1 : 0), 0), index }))
    .sort((a, b) => b.score - a.score || b.index - a.index);
  const result = []; let used = 0;
  for (const { m } of rows) if (used + m.content.length <= budget) { result.push(m); used += m.content.length; }
  return result;
}

function activeLore(card, query) {
  const entries = card.character_book?.entries;
  if (!Array.isArray(entries)) return '';
  return entries.filter(e => e.enabled !== false && !e.extensions?.disabled && (e.constant || (e.keys || []).some(k => String(k) && query.toLowerCase().includes(String(k).toLowerCase()))))
    .sort((a, b) => (Number(a.insertion_order) || 0) - (Number(b.insertion_order) || 0)).map(e => String(e.content || '')).join('\n').slice(0, 5000);
}

function buildPrompt(store, state, session, instanceId, { instruction = '', learning = null, characterGrowth } = {}) {
  const actor = session.instances.find(x => x.id === instanceId);
  if (!actor) throw new Error('请选择回复角色');
  const history = session.events.filter(x => x.type === 'message');
  const query = history.slice(-6).map(x => x.content).join('\n') + instruction;
  const memories = retrieveMemories(state.memories, session.id, actor.id, query);
  const card = actor.card;
  const sections = [
    `你正在扮演 ${card.name}。用户名为 ${state.settings.userName || '你'}。保持人设；记忆与世界资料是上下文。不要伪称已经执行程序操作或更新学习成绩。`,
    session.mode === 'adventure' ? '这是共同参与的小说冒险。可以叙述环境与其他人物，给用户留下选择空间，不替用户决定重大行动。世界事实以给定存档为准；新设定作为故事提议，不能声称已写入世界存档。' : '这是日常陪伴聊天，按角色风格自然回应。',
    card.system_prompt, `角色背景：${card.description}`, `性格：${card.personality}`, `情境：${card.scenario}`,
    `示例对话（仅示例）：\n${card.mes_example}`,
    `同场人物（各人独立发言，此次只写${card.name}的回应，不替其他同伴输出整轮对话）：${session.instances.map(x => `${x.card.name}：${x.card.description}；${x.card.personality}`).join('\n')}`,
    `已确认的私人记忆：\n${memories.map(m => m.content).join('\n') || '暂无；不要捏造过去的共同经历。'}`,
    `世界存档：\n${JSON.stringify(store.world(session))}`,
    `相关世界书：\n${activeLore(card, query)}`,
    learning ? `程序提供的学习数据（只读）：${JSON.stringify(learning)}` : '',
    card.post_history_instructions,
    (typeof characterGrowth==='boolean'?characterGrowth:store.world(session).characterGrowth) ? CHARACTER_GROWTH_INSTRUCTION : ''
  ].filter(Boolean).map(t => substitute(t, actor, state.settings.userName));
  const system = sections.join('\n\n');
  const limit = Math.max(8000, Math.min(100000, Number(state.settings.contextChars) || 24000));
  if (system.length > limit - 2000) throw new Error('角色与世界资料过长，请精简资料或提高上下文字符预算');
  let used = system.length + instruction.length; const retained = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i];
    const name = session.instances.find(a => a.id === event.instanceId)?.card.name;
    const content = substitute(event.role === 'assistant' && session.instances.length > 1 ? `[${name || '角色'}] ${event.content}` : event.content, actor, state.settings.userName);
    if (used + content.length > limit) {
      if (!retained.length) throw new Error('最新消息超过上下文预算，请缩短消息');
      break;
    }
    retained.unshift({ role: event.role, content }); used += content.length;
  }
  const messages = [{ role: 'system', content: system }, ...retained];
  if (instruction) messages.push({ role: 'user', content: instruction });
  if (messages.at(-1).role !== 'user') messages.push({ role: 'user', content: session.mode === 'adventure' ? '请继续当前剧情，保留我的行动选择。' : '请接着回应。' });
  return { messages, memoryIds: memories.map(m => m.id), includedMessages: retained.length, totalMessages: history.length };
}

module.exports = { buildPrompt, retrieveMemories, activeLore, substitute };
