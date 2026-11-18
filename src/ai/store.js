const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { normalizeCard } = require('./cards');
const id = prefix => `${prefix}_${randomUUID()}`;
const now = () => new Date().toISOString();
const copy = value => structuredClone(value);
const emptyWorld = () => ({ name: '未命名世界', rules: '', clock: '', generation: { seed: null, generatorId: null, version: null }, currentLocationId: null, locations: [], connections: [], npcs: [], quests: [], inventory: [], flags: {} });
const initial = () => ({ schemaVersion: 1, revision: 0, cards: [], sessions: [], memories: [], settings: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', userName: '你', temperature: 0.8, maxTokens: 1400, contextChars: 24000, reminder: { enabled: false, sessionId: '', intervalMinutes: 60, lastAt: null } } });

function validateWorld(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) throw new Error('世界必须是对象');
  const result = { ...emptyWorld(), ...copy(world) };
  if (typeof result.name !== 'string' || !result.name.trim() || typeof result.rules !== 'string' || typeof result.clock !== 'string') throw new Error('世界名称、规则与时间必须是文本，名称不能为空');
  if (!result.flags || typeof result.flags !== 'object' || Array.isArray(result.flags)) throw new Error('世界 flags 必须是对象');
  for (const field of ['locations', 'connections', 'npcs', 'quests', 'inventory']) {
    if (!Array.isArray(result[field])) throw new Error(`${field} 必须是数组`);
    if (result[field].some(x => !x || typeof x.id !== 'string' || !x.id)) throw new Error(`${field} 中每项都需要 id`);
    if (new Set(result[field].map(x => x.id)).size !== result[field].length) throw new Error(`${field} 存在重复 id`);
  }
  const places = new Set(result.locations.map(x => x.id));
  if (result.currentLocationId && !places.has(result.currentLocationId)) throw new Error('当前位置必须属于已有地点');
  for (const edge of result.connections) if (!places.has(edge.from) || !places.has(edge.to)) throw new Error('地图连接引用了不存在的地点');
  return result;
}

class AIStore {
  constructor(file) { this.file = file; }
  read() {
    if (!fs.existsSync(this.file)) return initial();
    const state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (state.schemaVersion !== 1) throw new Error('存档版本暂不支持，请勿覆盖');
    return state;
  }
  write(state) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  transaction(fn, revision) {
    const state = this.read();
    if (revision !== undefined && revision !== state.revision) throw new Error('存档已变化，请刷新后重试');
    const result = fn(state);
    state.revision++;
    this.write(state);
    return copy(result ?? state);
  }
  session(state, sessionId) {
    const session = state.sessions.find(x => x.id === sessionId);
    if (!session) throw new Error('存档不存在');
    return session;
  }
  importCard(card, desktopCharacterId = null) {
    return this.transaction(s => {
      const row = { ...normalizeCard(card.raw || card), id: id('card'), desktopCharacterId, createdAt: now() };
      s.cards.push(row); return row;
    });
  }
  seed(characters) {
    return this.transaction(s => {
      for (const c of characters) {
        if (s.cards.some(x => x.desktopCharacterId === c.id)) continue;
        s.cards.push({ ...normalizeCard({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: c.name, description: c.identity || '', personality: c.personality || '', first_mes: c.catchphrase || '' } }), id: id('card'), desktopCharacterId: c.id, createdAt: now() });
      }
    });
  }
  createSession({ cardIds, title, mode = 'chat', world, characterGrowth = false }) {
    return this.transaction(s => {
      if (!['chat', 'adventure'].includes(mode)) throw new Error('不支持的会话模式');
      if (!Array.isArray(cardIds) || !cardIds.length || cardIds.length > 8) throw new Error('请选择 1–8 位角色');
      const instances = [...new Set(cardIds)].map(cardId => {
        const card = s.cards.find(x => x.id === cardId);
        if (!card) throw new Error('角色卡不存在');
        return { id: id('actor'), cardId, card: copy(card), relationship: {}, state: {} };
      });
      const session = { id: id('session'), title: String(title || instances.map(x => x.card.name).join('、')).slice(0, 100), mode, instances, initialWorld: validateWorld({...emptyWorld(),...(world||{}),characterGrowth:Boolean(characterGrowth||world?.characterGrowth)}), events: [], createdAt: now(), updatedAt: now(), parent: null };
      if (instances[0].card.first_mes) {
        const greeting = instances[0].card.first_mes.replace(/\{\{char\}\}/gi, instances[0].card.name).replace(/\{\{user\}\}/gi, s.settings.userName || '你');
        session.events.push({ id: id('event'), type: 'message', role: 'assistant', instanceId: instances[0].id, content: greeting, createdAt: now() });
      }
      s.sessions.push(session); return session;
    });
  }
  world(session) { return copy([...session.events].reverse().find(e => e.type === 'world.updated')?.world || session.initialWorld); }
  appendMessage(sessionId, role, content, instanceId, revision) {
    return this.transaction(s => {
      const session = this.session(s, sessionId);
      if (!['user', 'assistant'].includes(role) || !String(content).trim()) throw new Error('消息不能为空');
      if (role === 'assistant' && !session.instances.some(x => x.id === instanceId)) throw new Error('角色实例不存在');
      const event = { id: id('event'), type: 'message', role, content: String(content).slice(0, 100000), instanceId: role === 'assistant' ? instanceId : null, createdAt: now() };
      session.events.push(event); session.updatedAt = now(); return event;
    }, revision);
  }
  updateWorld(sessionId, world) {
    return this.transaction(s => {
      const session = this.session(s, sessionId);
      session.events.push({ id: id('event'), type: 'world.updated', world: validateWorld(world), createdAt: now() });
      session.updatedAt = now();
    });
  }
  addMemory({ sessionId, instanceId, content, sourceEventIds = [] }) {
    return this.transaction(s => {
      const session = this.session(s, sessionId);
      if (!session.instances.some(x => x.id === instanceId)) throw new Error('记忆所属角色不存在');
      if (!String(content || '').trim()) throw new Error('记忆不能为空');
      if (!Array.isArray(sourceEventIds) || sourceEventIds.some(e => !session.events.some(x => x.id === e))) throw new Error('记忆来源不存在');
      const memory = { id: id('memory'), sessionId, instanceId, content: String(content).trim().slice(0, 12000), sourceEventIds, anchorEventId: session.events.at(-1)?.id || null, origin: 'user-confirmed', createdAt: now() };
      s.memories.push(memory); return memory;
    });
  }
  editMemory(memoryId, content) {
    return this.transaction(s => {
      const row = s.memories.find(x => x.id === memoryId);
      if (!row || !String(content || '').trim()) throw new Error('记忆不存在或内容为空');
      row.content = String(content).trim().slice(0, 12000); row.updatedAt = now();
    });
  }
  forget({ memoryId, sessionId, instanceId }) {
    return this.transaction(s => {
      if (!memoryId && (!sessionId || !instanceId)) throw new Error('必须指定记忆或角色实例');
      s.memories = s.memories.filter(x => memoryId ? x.id !== memoryId : !(x.sessionId === sessionId && x.instanceId === instanceId));
    });
  }
  trim(session, state, index) {
    session.events = session.events.slice(0, index + 1);
    const retained = new Set(session.events.map(x => x.id));
    state.memories = state.memories.filter(x => x.sessionId !== session.id || ((!x.anchorEventId || retained.has(x.anchorEventId)) && x.sourceEventIds.every(e => retained.has(e))));
    session.updatedAt = now();
  }
  rewind(sessionId, eventId, { include = true, replacement } = {}) {
    return this.transaction(s => {
      const session = this.session(s, sessionId);
      const index = session.events.findIndex(x => x.id === eventId);
      if (index < 0) throw new Error('回退位置不存在');
      this.trim(session, s, include ? index : index - 1);
      if (replacement !== undefined) {
        const event = session.events.at(-1);
        if (event?.type !== 'message' || !String(replacement).trim()) throw new Error('只能编辑非空聊天消息');
        // A changed source invalidates memories derived from its old text too.
        s.memories = s.memories.filter(x => x.sessionId !== sessionId || !(x.sourceEventIds.includes(eventId) || x.anchorEventId === eventId));
        event.content = String(replacement).slice(0, 100000); event.editedAt = now();
      }
    });
  }
  branch(sessionId, eventId) {
    return this.transaction(s => {
      const original = this.session(s, sessionId);
      const index = eventId ? original.events.findIndex(x => x.id === eventId) : original.events.length - 1;
      if (eventId && index < 0) throw new Error('分支位置不存在');
      const session = copy(original);
      session.id = id('session'); session.title += ' · 分支'; session.createdAt = now(); session.updatedAt = now();
      session.parent = { sessionId, eventId: eventId || original.events.at(-1)?.id || null };
      session.events = session.events.slice(0, index + 1);
      const actors = new Map(session.instances.map(x => [x.id, id('actor')]));
      session.instances.forEach(x => { x.id = actors.get(x.id); });
      const events = new Map(session.events.map(x => [x.id, id('event')]));
      session.events.forEach(e => { e.id = events.get(e.id); if (e.instanceId) e.instanceId = actors.get(e.instanceId); });
      s.memories.push(...s.memories.filter(m => m.sessionId === sessionId && (!m.anchorEventId || events.has(m.anchorEventId)) && m.sourceEventIds.every(e => events.has(e))).map(m => ({ ...copy(m), id: id('memory'), sessionId: session.id, instanceId: actors.get(m.instanceId), sourceEventIds: m.sourceEventIds.map(e => events.get(e)), anchorEventId: events.get(m.anchorEventId) || null })));
      s.sessions.push(session); return session;
    });
  }
  deleteSession(sessionId) {
    return this.transaction(s => {
      this.session(s, sessionId);
      s.sessions = s.sessions.filter(x => x.id !== sessionId);
      s.memories = s.memories.filter(x => x.sessionId !== sessionId);
      if (s.settings.reminder.sessionId === sessionId) s.settings.reminder.enabled = false;
    });
  }
}

module.exports = { AIStore, emptyWorld, validateWorld };
