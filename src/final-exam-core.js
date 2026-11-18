(function attachFinalExamCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FinalExamCore = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const CHAPTER_PATTERN = /第\s*([一二三四五六七八九十百零〇\d]+)\s*章\s*([^\n]{1,50})/g;

  function cleanText(value) {
    return String(value || '')
      .replace(/\u0000/g, '').replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  function normalizeAnswer(value) {
    return String(value || '').toLocaleLowerCase()
      .replace(/[\s，,。；;：:、（）()【】\[\]“”"'·]/g, '');
  }

  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
    return result >>> 0;
  }

  function chaptersFromText(text) {
    const matches = [...text.matchAll(CHAPTER_PATTERN)];
    if (!matches.length) return [{ title: '综合复习', start: 0, end: text.length }];
    return matches.map((match, index) => ({
      title: `第${match[1]}章 ${match[2].replace(/[（(].*$/, '').trim()}`,
      start: match.index,
      end: matches[index + 1]?.index ?? text.length
    }));
  }

  function chapterAt(chapters, index) {
    return chapters.find(chapter => index >= chapter.start && index < chapter.end)?.title || chapters[0]?.title || '综合复习';
  }

  function previousPrompt(text, index) {
    const fragments = text.slice(Math.max(0, index - 220), index)
      .split(/[\n。！？；】]/).map(item => item.trim()).filter(Boolean);
    const fragment = fragments.pop() || '';
    return fragment.replace(/^[：:；;，,、\s]+/, '').slice(-88);
  }

  function detectExplicitChoices(text, chapters) {
    const questions = [];
    const marker = /(?:^|\n)\s*(?:第\s*)?(\d{1,3})(?:\s*题)?\s*[.、．:：)]\s*/g;
    const matches = [...text.matchAll(marker)];
    matches.forEach((match, index) => {
      const end = matches[index + 1]?.index ?? Math.min(text.length, match.index + 1800);
      const block = text.slice(match.index + match[0].length, end);
      const optionMatches = [...block.matchAll(/(?:^|\n|\s{2,})([A-DＡ-Ｄ])\s*[.、．:：)）]\s*/g)];
      if (optionMatches.length < 3) return;
      const options = optionMatches.map((option, optionIndex) => ({
        key: String.fromCharCode(option[1].charCodeAt(0) > 127 ? option[1].charCodeAt(0) - 65248 : option[1].charCodeAt(0)).toUpperCase(),
        text: block.slice(option.index + option[0].length, optionMatches[optionIndex + 1]?.index ?? block.length)
          .replace(/(?:参考)?答案\s*[：:].*$/s, '').trim()
      })).filter(option => option.text);
      const answer = block.match(/(?:参考)?答案\s*[：:]\s*([A-DＡ-Ｄ])/i)?.[1];
      if (options.length < 3 || !answer) return;
      const normalizedAnswer = answer.replace(/[Ａ-Ｄ]/g, char => String.fromCharCode(char.charCodeAt(0) - 65248)).toUpperCase();
      questions.push({
        type: 'choice', origin: 'copied', chapter: chapterAt(chapters, match.index),
        prompt: block.slice(0, optionMatches[0].index).trim(), options,
        answer: options.find(option => option.key === normalizedAnswer)?.text || '', correctKey: normalizedAnswer,
        sourceExcerpt: block.slice(0, 500)
      });
    });
    return questions;
  }

  function uniqueQuestions(questions) {
    const seen = new Set();
    return questions.filter(question => {
      const key = `${normalizeAnswer(question.prompt)}|${normalizeAnswer(question.answer)}`;
      if (!question.prompt || !question.answer || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function collectGenerated(text, chapters) {
    const questions = [];

    for (const match of text.matchAll(/【\s*([^【】]{2,220}?)\s*】/g)) {
      const answer = match[1].replace(/\s+/g, ' ').trim();
      if (/^[a-z]\s*[.、]/i.test(answer) || /^(各自的)?意义$/.test(answer) || answer.length < 2) continue;
      const context = previousPrompt(text, match.index);
      if (!context || /^第\s*[一二三四五六七八九十百零〇\d]+\s*章/.test(context)) continue;
      questions.push({
        type: 'cloze', origin: 'generated', chapter: chapterAt(chapters, match.index),
        prompt: `${context}${/[：:]$/.test(context) ? '' : '：'}____`, answer,
        sourceExcerpt: `${context}【${answer}】`, label: '原文挖空', responseMode: answer.length > 18 ? 'choice' : 'fill'
      });
    }

    const definitionPattern = /(?:^|\n|[。；]\s*)(?:[（(]?[一二三四五六七八九十\d]+[）)、.]?\s*)?([^\n。；：:]{2,28}?)(?:的)?(?:概念|定义|本质|含义)\s*[：:]\s*([^\n。；]{4,220})/g;
    for (const match of text.matchAll(definitionPattern)) {
      const term = match[1].replace(/^[（(\d一二三四五六七八九十）)、.\s]+/, '').trim();
      const definition = match[2].trim();
      if (term.length < 2 || term.length > 24 || definition.length < 4) continue;
      questions.push({
        type: 'term', origin: 'generated', chapter: chapterAt(chapters, match.index),
        prompt: `____：${definition}`, answer: term,
        sourceExcerpt: `${term}：${definition}`, label: '名词解释', responseMode: 'fill'
      });
    }

    const listPattern = /([^\n。；]{2,38}(?:职能|要素|特点|内容|原因|作用|意义|原则|条件|类型))\s*[：:]\s*((?:(?:\d+|[①②③④⑤⑥⑦⑧⑨⑩])\s*[^\n。；]{2,100}[；。]\s*){2,})/g;
    for (const match of text.matchAll(listPattern)) {
      const title = match[1].replace(/^[（(\d一二三四五六七八九十）)、.\s]+/, '').trim();
      const items = [...match[2].matchAll(/(?:\d+|[①②③④⑤⑥⑦⑧⑨⑩])\s*([^；。]{2,100})[；。]/g)].map(item => item[1].trim());
      items.forEach((answer, itemIndex) => questions.push({
        type: 'list-cloze', origin: 'generated', chapter: chapterAt(chapters, match.index),
        prompt: `${title}（第 ${itemIndex + 1} 项）：____`, answer,
        sourceExcerpt: `${title}：${items.join('；')}`, label: '简答拆项', responseMode: 'fill'
      }));
    }
    return uniqueQuestions(questions);
  }

  function lengthBucket(value) {
    const length = String(value || '').length;
    return length <= 8 ? 0 : length <= 24 ? 1 : 2;
  }

  function addGeneratedOptions(questions) {
    const answerPool = [...new Set(questions.map(question => question.answer).filter(Boolean))];
    return questions.map(question => {
      if (question.origin === 'copied' && question.options?.length) return question;
      if (question.responseMode === 'fill') return { ...question, options: [], correctKey: '' };
      const sameChapter = questions.filter(candidate => candidate !== question && candidate.chapter === question.chapter && candidate.answer !== question.answer);
      const sameKind = sameChapter.filter(candidate => candidate.type === question.type || lengthBucket(candidate.answer) === lengthBucket(question.answer));
      const fallback = questions.filter(candidate => candidate !== question && candidate.answer !== question.answer && lengthBucket(candidate.answer) === lengthBucket(question.answer));
      const candidates = [...sameKind, ...sameChapter, ...fallback, ...questions]
        .map(candidate => candidate.answer).filter(answer => answer && answer !== question.answer);
      const unique = [...new Set(candidates)];
      const offset = unique.length ? hash(`${question.prompt}|${question.answer}`) % unique.length : 0;
      const distractors = [];
      for (let step = 0; step < unique.length && distractors.length < 2; step += 1) {
        const candidate = unique[(offset + step) % unique.length];
        if (normalizeAnswer(candidate) !== normalizeAnswer(question.answer)) distractors.push(candidate);
      }
      if (distractors.length < 2) return { ...question, options: [], correctKey: '' };
      const values = [question.answer, ...distractors];
      const rotate = hash(question.prompt) % 3;
      const ordered = values.slice(rotate).concat(values.slice(0, rotate));
      const options = ordered.map((text, index) => ({ key: String.fromCharCode(65 + index), text }));
      return { ...question, options, correctKey: options.find(option => option.text === question.answer).key };
    });
  }

  function buildQuestionBank(rawText, options = {}) {
    const text = cleanText(rawText);
    const chapters = chaptersFromText(text);
    const copied = detectExplicitChoices(text, chapters);
    const generated = collectGenerated(text, chapters);
    const questions = addGeneratedOptions(uniqueQuestions([...copied, ...generated]));
    return {
      title: options.title || '期末复习资料', chapters: chapters.map(item => item.title), questions,
      stats: {
        total: questions.length,
        copied: questions.filter(item => item.origin === 'copied').length,
        cloze: questions.filter(item => item.type === 'cloze').length,
        terms: questions.filter(item => item.type === 'term').length,
        listCloze: questions.filter(item => item.type === 'list-cloze').length,
        unsupported: questions.filter(item => !item.options?.length).length
      }
    };
  }

  function normalizeQuestion(question) {
    return {
      seenCount: 0, correctCount: 0, wrongCount: 0, correctStreak: 0,
      mastery: 0, dueAt: null, lastAnsweredAt: null, isMistake: false,
      mistakeEver: false, masteredMistake: false, ...question
    };
  }

  function grade(question, selectedKey) {
    return String(selectedKey || '').toUpperCase() === String(question.correctKey || '').toUpperCase();
  }

  function gradeFill(question, value) {
    return Boolean(normalizeAnswer(value)) && normalizeAnswer(value) === normalizeAnswer(question.answer);
  }

  function recordAttempt(rawQuestion, correct, now = new Date()) {
    const question = normalizeQuestion(rawQuestion);
    const next = { ...question };
    next.seenCount += 1; next.lastAnsweredAt = now.toISOString();
    if (correct) {
      next.correctCount += 1; next.correctStreak += 1;
      next.mastery = Math.min(100, next.mastery + (next.wrongCount ? 18 : 24));
      if (next.isMistake && next.correctStreak >= 2) { next.isMistake = false; next.masteredMistake = true; }
    } else {
      next.wrongCount += 1; next.correctStreak = 0; next.mastery = Math.max(0, next.mastery - 22);
      next.isMistake = true; next.mistakeEver = true; next.masteredMistake = false;
    }
    const intervalMinutes = correct
      ? ([10, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 15 * 24 * 60][Math.min(4, next.correctStreak - 1)] || 10)
      : 5;
    next.dueAt = new Date(now.getTime() + intervalMinutes * 60_000).toISOString();
    return next;
  }

  function studyPriority(question, now = new Date()) {
    const due = !question.dueAt || new Date(question.dueAt) <= now;
    return (due ? 100 : 0) + (question.isMistake ? 70 : 0) + Math.max(0, 100 - (question.mastery || 0)) + (question.seenCount ? 0 : 45);
  }

  function makeSession(questions, options = {}) {
    const now = options.now || new Date();
    const chapter = options.chapter || 'all'; const type = options.type || 'all';
    const filtered = questions.filter(question => (chapter === 'all' || question.chapter === chapter) && (type === 'all' || question.type === type));
    const sorted = filtered.slice().sort((a, b) => studyPriority(b, now) - studyPriority(a, now) || hash(`${a.id}|${now.toDateString()}`) - hash(`${b.id}|${now.toDateString()}`));
    return sorted.slice(0, Math.max(1, Number(options.size) || 10)).map(question => question.id);
  }

  return { buildQuestionBank, normalizeQuestion, normalizeAnswer, grade, gradeFill, recordAttempt, studyPriority, makeSession };
});
