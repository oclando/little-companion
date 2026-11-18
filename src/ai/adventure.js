const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const uid = () => randomUUID();
const clean = s => String(s || '').normalize('NFKC').trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ');
const themes = ['迷雾林地', '遗忘渡口', '古树回廊', '星光营地', '寂静书塔'];

// Runs and immutable learning attempts share one atomic file, outside role-play saves.
class AdventureStore {
  constructor(file) { this.file = file; }
  read() {
    if (!fs.existsSync(this.file)) return { version: 1, runs: [], attempts: [] };
    const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (s.version !== 1) throw new Error('不支持的背词履历版本');
    return s;
  }
  tx(fn) {
    const s = this.read(); const result = fn(s);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(s, null, 2)); fs.renameSync(`${this.file}.tmp`, this.file);
    return result;
  }
  run(s, id) { const r = s.runs.find(x => x.id === id); if (!r) throw new Error('冒险不存在'); return r; }
  start(p, vocabulary, companions, wordLists = []) {
    return this.tx(s => {
      const ids = new Set(p.wordIds || []);
      const sourceIds=Array.isArray(p.sourceIds)?[...new Set(p.sourceIds)]:[];
      const byId=new Map(vocabulary.map(w=>[w.id,w]));
      const selected=[...ids].map(id=>byId.get(id)).filter(w=>w?.front?.trim()&&w?.back?.trim());
      if(sourceIds.length && selected.some(w=>!(w.libraryIds?.length?w.libraryIds:['list_default']).some(id=>sourceIds.includes(id))))throw new Error('目标词包含所选来源之外的单词，请重新选择来源。');
      const words = selected.map(w => ({ id: w.id, front: w.front.trim(), back: w.back.trim(), groupId:p.groups?.find(g=>g.wordIds?.includes(w.id) && (w.libraryIds?.length?w.libraryIds:['list_default']).includes(g.sourceId))?.sourceId || null, sourceIds: [...(w.libraryIds?.length ? w.libraryIds : ['list_default'])], sourceNames: (w.libraryIds?.length ? w.libraryIds : ['list_default']).map(id => wordLists.find(l => l.id === id)?.name || '历史词库') }));
      if (!words.length || words.length !== ids.size) throw new Error('请选择有英文和释义的有效目标单词');
      if (words.length > 500) throw new Error('每次冒险最多选择500个目标单词');
      const layers = Math.max(1, Math.min(40, Math.trunc(Number(p.layers) || 8)));
      const quota = Math.max(1, Math.trunc(Number(p.quota) || Math.min(3,words.length)));
      if(quota>words.length)throw new Error('每关要求的不同单词数超过目标词数，请减少每关词数或增加目标单词。');
      if (words.length > layers * quota) throw new Error(`当前路线最多安排 ${layers * quota} 个词，已选 ${words.length} 个。请增加层数、每关词数或减少选择。`);
      const run = { id: uid(), sessionId: p.sessionId, title: String(p.title || '迷雾中的记忆之旅').slice(0, 100), seed: uid(), words, companions, layers, quota, depth: 0, path: [], quiz: null, status: 'active', createdAt: new Date().toISOString() };
      run.sourceSelection=sourceIds;run.groups=(p.groups||[]).filter(g=>sourceIds.includes(g.sourceId)).map(g=>({sourceId:g.sourceId,name:wordLists.find(l=>l.id===g.sourceId)?.name||'历史词库',wordIds:words.filter(w=>w.groupId===g.sourceId).map(w=>w.id)}));
      run.characterGrowth=Boolean(p.characterGrowth);
      run.autoScene = Boolean(p.autoScene); run.viewpointId = companions.some(c=>c.id===p.viewpointId) ? p.viewpointId : companions[0]?.id || null;
      run.feed = [{ id: uid(), type: 'narration', text: `林间的雾缓缓散开。${companions.map(c => c.name).join('、') || '你'}来到三条岔路前，旅程从这里开始。`, source: 'local' }, ...companions.map(c => ({ id: uid(), type: 'dialogue', actorId: c.id, text: '准备好了就选一条路吧，我会陪你一起记住这些单词。', source: 'local' }))];
      run.sceneKeys = [];
      run.nodes = Array.from({ length: layers }, (_, depth) => Array.from({ length: 3 }, (_, lane) => ({ id: uid(), depth, lane, name: themes[(depth + lane) % themes.length], kind: ['meaning', 'spelling', 'mixed'][lane], wordIds: Array.from({ length: quota }, (_, j) => words[(depth * quota + j) % words.length].id) })));
      if(p.replaceRunId){this.run(s,p.replaceRunId);s.runs=s.runs.filter(old=>old.id!==p.replaceRunId);run.replacesRunId=p.replaceRunId;}
      s.runs.push(run); return run;
    });
  }
  choose(runId, nodeId) {
    return this.tx(s => {
      const r = this.run(s, runId);
      if (r.status !== 'active' || r.quiz) throw new Error('请先完成当前节点');
      const node = r.nodes[r.depth]?.find(n => n.id === nodeId);
      if (!node) throw new Error('只能选择当前层的三个目标之一');
      r.quiz = { nodeId, remaining: [...node.wordIds], passed: [], phase: 'memorize', questionId: uid(), feedback: null, attempts: 0 };
      (r.feed ||= []).push({ id: uid(), type: 'narration', source: 'system', text: `进入${node.name}。本关需答对 ${node.wordIds.length} 个不同单词，通过后才能前进。` });
      s.exposures ||= []; s.exposures.push({ runId, wordId: r.quiz.remaining[0], front: r.words.find(w=>w.id===r.quiz.remaining[0]).front, viewedAt: new Date().toISOString() });
      return r;
    });
  }
  reveal(runId, questionId) { return this.tx(s => { const r = this.run(s, runId); if (r.quiz?.phase !== 'memorize' || (questionId && r.quiz.questionId!==questionId)) throw new Error('记忆卡已变化，请刷新后重试'); r.quiz.phase = 'answer'; return r; }); }
  question(r) {
    if (!r.quiz) return null;
    const q = r.quiz, word = r.words.find(w => w.id === q.remaining[0]);
    const node = r.nodes[r.depth].find(n => n.id === q.nodeId);
    const distractors = [...new Set(r.words.filter(w => w.back !== word.back).map(w => w.back))].slice(0, 3);
    const meaning = q.phase==='feedback' ? q.feedback.kind==='meaning' : node.kind !== 'spelling' && (node.kind !== 'mixed' || q.passed.length % 2 === 0) && distractors.length > 0;
    const options = meaning ? [...distractors, word.back].sort((a, b) => a.localeCompare(b, 'zh')) : [];
    return { id: q.questionId, phase: q.phase, front: q.phase === 'memorize' || meaning ? word.front : null, back: q.phase === 'memorize' || !meaning ? word.back : null, kind: meaning ? 'meaning' : 'spelling', options, feedback: q.feedback, passed: q.passed.length, required: node.wordIds.length, attempts: q.attempts };
  }
  answer(runId, questionId, answer) {
    return this.tx(s => {
      const r = this.run(s, runId), q = r.quiz;
      if (!q || q.phase !== 'answer' || q.questionId !== questionId) throw new Error('题目已变化，请刷新后作答');
      const word = r.words.find(w => w.id === q.remaining[0]); const question = this.question(r);
      const correct = clean(answer) === clean(question.kind === 'meaning' ? word.back : word.front);
      const attempt = { id: uid(), runId, nodeId: q.nodeId, questionId, wordId: word.id, front: word.front, back: word.back, correct, kind: question.kind, reviewedAt: new Date().toISOString() };
      s.attempts.push(attempt); q.attempts++; q.phase = 'feedback';
      q.feedback = { correct, kind:question.kind, expected: question.kind === 'meaning' ? word.back : word.front, companion: r.companions[q.attempts % Math.max(1, r.companions.length)]?.name || '伙伴', text: correct ? '记住了这一词。继续走，我在你身边。' : '先别着急，看看答案，我们稍后再练一次。' };
      if (correct && !q.passed.includes(word.id)) q.passed.push(word.id);
      return { run: r, attempt };
    });
  }
  next(runId, questionId) {
    return this.tx(s => {
      const r = this.run(s, runId), q = r.quiz;
      if (q?.phase !== 'feedback') throw new Error('请先作答');
      if (questionId && q.questionId !== questionId) throw new Error('题目已变化，请刷新后继续');
      const previous = q.remaining.shift(); if (!q.feedback.correct) q.remaining.push(previous);
      if (!q.remaining.length) {
        r.path.push(q.nodeId); r.depth++; r.quiz = null;
        (r.feed ||= []).push({ id: uid(), type: 'narration', source: 'system', text: `第 ${r.depth} 层试炼通过。${r.depth === r.layers ? '本次旅程完成。' : '前方的三条路已经解锁。'}` });
        if (r.depth === r.layers) { r.status = 'complete'; r.completedAt = new Date().toISOString(); }
      } else { q.phase = 'memorize'; q.feedback = null; q.questionId = uid(); s.exposures ||= []; const w=r.words.find(w=>w.id===q.remaining[0]); s.exposures.push({runId,wordId:w.id,front:w.front,viewedAt:new Date().toISOString()}); }
      return r;
    });
  }
  remove(runId) { return this.tx(s => { s.runs = s.runs.filter(r => r.id !== runId); }); }
  appendScene(runId, key, rows, depth) {
    return this.tx(s => { const r=this.run(s,runId); if(r.depth!==depth)throw new Error('关卡已变化，请重新生成剧情'); r.sceneKeys ||= []; if(r.sceneKeys.includes(key))return r; r.feed ||= []; r.feed.push(...rows.map(row=>({...row,id:uid()}))); r.sceneKeys.push(key);return r; });
  }
  view() {
    const s = this.read(); const words = new Map();
    for (const a of s.attempts) {
      const key = clean(a.front); const w = words.get(key) || { front: a.front, back: a.back, attempts: 0, correct: 0, wrong: 0 };
      w.attempts++; if (a.correct) w.correct++; else w.wrong++; w.lastReviewedAt = a.reviewedAt; words.set(key, w);
    }
    return { runs: s.runs.map(r => ({ ...r, question: this.question(r) })), words: [...words.values()], exposures: s.exposures || [], learnedIds:[...new Set([...s.attempts,...(s.exposures||[])].map(a=>a.wordId))], wrongIds: [...new Set(s.attempts.filter(a=>!a.correct).map(a=>a.wordId))], totalAttempts: s.attempts.length, correctAttempts: s.attempts.filter(a => a.correct).length };
  }
}
module.exports = { AdventureStore };
