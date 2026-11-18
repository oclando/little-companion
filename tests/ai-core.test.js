const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { AIStore, emptyWorld, validateWorld } = require('../src/ai/store');
const { parseCard, normalizeCard } = require('../src/ai/cards');
const { buildPrompt } = require('../src/ai/prompt');
const { complete, endpoint } = require('../src/ai/provider');
const rawCard = name => ({ spec: 'chara_card_v2', spec_version: '2.0', data: { name, description: '旅行者', extensions: { future: { enabled: true } } } });

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-ai-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new AIStore(path.join(dir, 'state.json'));
  const card = store.importCard(rawCard('同行者甲'));
  const other = store.importCard(rawCard('同行者乙'));
  const session = store.createSession({ cardIds: [card.id, other.id], title: '雾港', mode: 'adventure' });
  return { dir, store, card, other, session, actor: session.instances[0], second: session.instances[1] };
}

test('同一卡的人设快照和各存档角色实例独立，重启后记忆仍在', t => {
  const { store, card, session, actor } = fixture(t);
  const another = store.createSession({ cardIds: [card.id] });
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '共同去过雾港' });
  store.transaction(s => { s.cards[0].description = '已经改变'; });
  assert.notEqual(another.instances[0].id, actor.id);
  const loaded = new AIStore(store.file).read();
  assert.equal(loaded.memories.length, 1);
  assert.equal(loaded.sessions[0].instances[0].card.description, '旅行者');
  assert.equal(loaded.memories[0].sessionId, session.id);
});
test('角色成长开关按世界生效，可由冒险显式关闭且不改变原卡',t=>{
 const {store,card}=fixture(t);const run=store.createSession({cardIds:[card.id],characterGrowth:true});const s=store.read();
 const enabled=buildPrompt(store,s,s.sessions.find(x=>x.id===run.id),run.instances[0].id);
 assert(enabled.messages[0].content.includes('人格可塑性'));assert(enabled.messages[0].content.includes('不以迎合用户为成长目标'));
 const disabled=buildPrompt(store,s,s.sessions.find(x=>x.id===run.id),run.instances[0].id,{characterGrowth:false});assert(!disabled.messages[0].content.includes('人格可塑性'));assert.equal(s.cards[0].description,'旅行者');
});

test('提示词只检索选定角色的私人记忆，不泄露同场角色或其他世界的记忆', t => {
  const { store, card, session, actor, second } = fixture(t);
  const another = store.createSession({ cardIds: [card.id] });
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '私密甲：用户喜欢蓝色' });
  store.addMemory({ sessionId: session.id, instanceId: second.id, content: '私密乙：第二角色秘密' });
  store.addMemory({ sessionId: another.id, instanceId: another.instances[0].id, content: '异世界秘密' });
  const state = store.read();
  const prompt = buildPrompt(store, state, state.sessions[0], actor.id);
  const system = prompt.messages[0].content;
  assert(system.includes('私密甲')); assert(!system.includes('私密乙')); assert(!system.includes('异世界秘密'));
});

test('回退同时撤销未来世界变化与来源/锚点在未来的记忆', t => {
  const { store, session, actor } = fixture(t);
  const first = store.appendMessage(session.id, 'user', '我来到港口');
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '曾在港口见面', sourceEventIds: [first.id] });
  const world = { ...emptyWorld(), name: '未来世界', locations: [{ id: 'port', name: '雾港' }], currentLocationId: 'port' };
  store.updateWorld(session.id, world);
  const future = store.appendMessage(session.id, 'assistant', '我们已经到城堡了', actor.id);
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '未来的城堡', sourceEventIds: [future.id] });
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '未来手写记忆' });
  store.rewind(session.id, first.id);
  const s = store.read();
  assert.equal(s.sessions[0].events.length, 1);
  assert.equal(store.world(s.sessions[0]).name, '未命名世界');
  assert.deepEqual(s.memories.map(x => x.content), ['曾在港口见面']);
});

test('编辑源消息使旧记忆失效；重新生成前移除旧回应', t => {
  const { store, session, actor } = fixture(t);
  const message = store.appendMessage(session.id, 'user', '我喜欢红色');
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '喜欢红色', sourceEventIds: [message.id] });
  store.appendMessage(session.id, 'assistant', '记住了', actor.id);
  store.rewind(session.id, message.id, { replacement: '我喜欢蓝色' });
  assert.equal(store.read().memories.length, 0);
  assert.equal(store.read().sessions[0].events[0].content, '我喜欢蓝色');
  const reply = store.appendMessage(session.id, 'assistant', '蓝色很好', actor.id);
  store.rewind(session.id, reply.id, { include: false });
  assert.equal(store.read().sessions[0].events.at(-1).role, 'user');
});

test('剧情分支重映射角色、事件和记忆来源，后续删除互不影响', t => {
  const { store, session, actor } = fixture(t);
  const first = store.appendMessage(session.id, 'user', '出发');
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '一起出发', sourceEventIds: [first.id] });
  const future = store.appendMessage(session.id, 'user', '左转');
  store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '选择左转', sourceEventIds: [future.id] });
  const branch = store.branch(session.id, first.id);
  const branchMem = store.read().memories.filter(x => x.sessionId === branch.id);
  assert.equal(branch.events.length, 1); assert.equal(branchMem.length, 1);
  assert.notEqual(branch.instances[0].id, actor.id); assert.notEqual(branch.events[0].id, first.id);
  assert.equal(branchMem[0].instanceId, branch.instances[0].id);
  assert.deepEqual(branchMem[0].sourceEventIds, [branch.events[0].id]);
  store.deleteSession(session.id);
  assert.equal(store.read().sessions.length, 1); assert.equal(store.read().memories.length, 1);
});

test('清空记忆限定角色，销毁单条后磁盘内容不再含该记忆', t => {
  const { store, session, actor, second } = fixture(t);
  const one = store.addMemory({ sessionId: session.id, instanceId: actor.id, content: '唯一的待销毁记忆' });
  store.addMemory({ sessionId: session.id, instanceId: second.id, content: '其他角色的记忆' });
  store.forget({ memoryId: one.id });
  assert(!fs.readFileSync(store.file, 'utf8').includes('唯一的待销毁记忆'));
  store.forget({ sessionId: session.id, instanceId: actor.id });
  assert.equal(store.read().memories.length, 1);
  assert.throws(() => store.forget({}), /必须指定/);
});

test('拒绝错误地图、错误记忆归属与过期生成提交，失败不改变磁盘', t => {
  const { store, session, actor } = fixture(t);
  const revision = store.read().revision;
  store.appendMessage(session.id, 'user', '新内容');
  assert.throws(() => store.appendMessage(session.id, 'assistant', '过期回复', actor.id, revision), /存档已变化/);
  const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.addMemory({ sessionId: session.id, instanceId: 'missing', content: '秘密' }));
  assert.throws(() => validateWorld({ connections: [{ id: 'edge', from: 'x', to: 'y' }] }), /不存在/);
  assert.throws(() => validateWorld({ locations: [{ id: 'p' }, { id: 'p' }] }), /重复/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
});

test('损坏或未知版本存档被拒绝，不静默覆盖', t => {
  const { store } = fixture(t);
  fs.writeFileSync(store.file, '{"schemaVersion":99}');
  assert.throws(() => store.read(), /版本/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), '{"schemaVersion":99}');
});

test('JSON 与 PNG 角色卡保留扩展字段，支持 V3 优先级与损坏文件拒绝', () => {
  const raw = rawCard('通用角色');
  assert.deepEqual(parseCard(Buffer.from(JSON.stringify(raw)), '.json').raw, raw);
  function chunk(key, data) {
    const payload = Buffer.from(`${key}\0${Buffer.from(JSON.stringify(data)).toString('base64')}`);
    const b = Buffer.alloc(12 + payload.length); b.writeUInt32BE(payload.length); b.write('tEXt', 4); payload.copy(b, 8); return b;
  }
  const v3 = { ...raw, spec: 'chara_card_v3' };
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('chara', raw), chunk('ccv3', v3)]);
  assert.equal(parseCard(png, '.png').format, 'chara_card_v3');
  assert.deepEqual(parseCard(png, '.png').raw.data.extensions, raw.data.extensions);
  assert.throws(() => parseCard(Buffer.from('image'), '.png'), /PNG/);
  assert.throws(() => normalizeCard({ data: {} }), /name/);
});

test('开场白中的通用角色与用户宏在存档创建时展开', t => {
  const { store } = fixture(t);
  const raw = rawCard('旅人'); raw.data.first_mes = '{{char}}向{{user}}打招呼。';
  const card = store.importCard(raw);
  store.transaction(s => { s.settings.userName = '小明'; });
  const session = store.createSession({ cardIds: [card.id] });
  assert.equal(session.events[0].content, '旅人向小明打招呼。');
  assert.equal(session.instances[0].card.first_mes, '{{char}}向{{user}}打招呼。');
});

test('世界书按关键词触发，宏替换且上下文保留最近消息', t => {
  const { store, session, actor } = fixture(t);
  store.transaction(s => {
    const card = s.sessions[0].instances[0].card;
    card.personality = '{{char}}称呼{{user}}为朋友';
    card.character_book = { entries: [{ keys: ['雾港'], content: '雾港设定' }, { keys: ['城堡'], content: '城堡秘密' }] };
    s.settings.contextChars = 8000;
  });
  for (let i = 0; i < 30; i++) store.appendMessage(session.id, 'user', `旧消息${i}${'远'.repeat(300)}`);
  store.appendMessage(session.id, 'user', '去雾港');
  const s = store.read(); const p = buildPrompt(store, s, s.sessions[0], actor.id);
  assert(p.messages[0].content.includes('同行者甲称呼你为朋友'));
  assert(p.messages[0].content.includes('雾港设定')); assert(!p.messages[0].content.includes('城堡秘密'));
  assert(p.includedMessages < p.totalMessages); assert.equal(p.messages.at(-1).content, '去雾港');
});

test('API URL 兼容基础地址和完整路径，拒绝明文远程连接', () => {
  assert.equal(endpoint('https://example.com/v1/'), 'https://example.com/v1/chat/completions');
  assert.equal(endpoint('http://127.0.0.1:1234/v1/chat/completions'), 'http://127.0.0.1:1234/v1/chat/completions');
  assert.throws(() => endpoint('http://remote.example.com'), /HTTPS/);
  assert.throws(() => endpoint('https://x/?key=secret'));
});

test('角色督促遵守安静时间、间隔与每日目标，API 未配置时使用本地提醒', async t => {
  const { registerAI } = require('../src/ai/service');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-reminder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const handlers = new Map(), notifications = [];
  const webContents = { send() {} }; const win = { webContents, isDestroyed: () => false };
  const study = { characters: [{ id: 'pet', name: '同行者甲', catchphrase: '一起复习吧。' }], vocabulary: [{ id: 'word', dueAt: new Date(0).toISOString() }], reviewLog: [], settings: { dailyWordGoal: 1 } };
  let quiet = true, tick;
  const originalTimer = global.setInterval;
  global.setInterval = callback => { tick = callback; return { unref() {} }; };
  let service;
  try {
    service = registerAI({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, dialog: {}, safeStorage: {}, root: () => dir, readStudyData: () => study, getWindow: () => win, inQuietHours: () => quiet, notify: (...args) => notifications.push(args) });
  } finally { global.setInterval = originalTimer; }
  const call = (op, data) => handlers.get('ai-call')({ sender: webContents }, op, data);
  const initial = await call('get');
  const created = await call('createSession', { cardIds: [initial.state.cards[0].id] });
  await call('reminder', { sessionId: created.value.id, enabled: true, intervalMinutes: 15 });
  await tick(); assert.equal(notifications.length, 0);
  quiet = false;
  await tick(); assert.equal(notifications.length, 1); assert(notifications[0][1].includes('1 个待复习单词'));
  await tick(); assert.equal(notifications.length, 1);
  service.store.transaction(s => { s.settings.reminder.lastAt = null; });
  study.reviewLog.push({ wordId: 'word', reviewedAt: new Date().toISOString() });
  await tick(); assert.equal(notifications.length, 1);
});

test('真实 HTTP 流按 UTF-8 字节切片仍能还原中文，支持取消与断流拒绝', async t => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body); requests.push(parsed);
    if (parsed.model === 'denied') { res.writeHead(401); res.end('PRIVATE-SECRET'); return; }
    if (parsed.model === 'waiting') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders(); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const response = `data: ${JSON.stringify({ choices: [{ delta: { content: '你好，雾港' } }] })}\r\n\r\n${parsed.model === 'broken' ? '' : 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'}`;
    const bytes = Buffer.from(response);
    for (let i = 0; i < bytes.length; i += 2) res.write(bytes.subarray(i, i + 2));
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const settings = { baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'good', temperature: 0.8, maxTokens: 300 };
  const messages = [{ role: 'user', content: 'hello' }]; let deltas = '';
  const result = await complete({ settings, apiKey: 'local-test', messages, onDelta: d => { deltas += d; } });
  assert.equal(result.content, '你好，雾港'); assert.equal(deltas, result.content); assert.equal(requests[0].stream, true);
  await assert.rejects(complete({ settings: { ...settings, model: 'broken' }, messages }), /连接提前中断/);
  await assert.rejects(complete({ settings: { ...settings, model: 'denied' }, messages }), e => e.message.includes('401') && !e.message.includes('PRIVATE-SECRET'));
  const controller = new AbortController();
  const pending = complete({ settings: { ...settings, model: 'waiting' }, messages, signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(pending, e => e.name === 'AbortError');
});
