(function attachVocabularyCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VocabularyCore = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const DAY = 24 * 60 * 60 * 1000;

  function clean(value) {
    return String(value ?? '').trim().replace(/^['"“”]+|['"“”]+$/g, '').trim();
  }

  function cleanFront(value) {
    return clean(value)
      .replace(/^\s*(?:\d+[.\)\u3001]\s*)/, '')
      .replace(/^\s*[|\uff5c]\s*|\s*[|\uff5c]\s*$/g, '')
      .replace(/^\s*(?:⭐|★|☆|\*|\u2022|\u00b7)\s*/, '')
      .trim();
  }

  function splitLine(line) {
    const original = String(line || '').trim();
    const pipeParts = original.split(/[|\uff5c]/).map(clean).filter(Boolean);
    if (pipeParts.length >= 2 && !pipeParts.every(part => /^:?-{3,}:?$/.test(part))) {
      return [cleanFront(pipeParts[0]), pipeParts.slice(1).map(clean).filter(Boolean).join('；')];
    }
    const separators = ['\t', '=>', '—', '–', ' - ', '=', '：', ':', ','];
    for (const separator of separators) {
      const index = line.indexOf(separator);
      if (index > 0) return [cleanFront(line.slice(0, index)), line.slice(index + separator.length)];
    }
    const spaced = line.match(/^(\S+)\s{2,}(.+)$/);
    if (spaced) return [cleanFront(spaced[1]), spaced[2]];
    const englishThenChinese = line.match(/^([A-Za-z][A-Za-z'\u2019 -]*?)\s+([\u3400-\u9fff].+)$/);
    return englishThenChinese ? [cleanFront(englishThenChinese[1]), englishThenChinese[2]] : [cleanFront(line), ''];
  }

  function parseVocabularyText(text) {
    const rows = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const result = [];
    const seen = new Set();
    for (const raw of rows) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      if (/^\s*[|\uff5c]?\s*:?-{3,}/.test(line)) continue;
      const [frontRaw, backRaw] = splitLine(line);
      const front = clean(frontRaw);
      const back = clean(backRaw);
      if (!front || /^(word|english|英文|单词)$/i.test(front)) continue;
      const key = front.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ front, back, favorite: false });
    }
    return result;
  }

  function normalizeWord(word, now = Date.now()) {
    const createdAt = word.createdAt || new Date(now).toISOString();
    let front = clean(word.front); let back = clean(word.back); let favorite = Boolean(word.favorite);
    if (!back) {
      const [repairedFront, repairedBack] = splitLine(front);
      if (clean(repairedBack)) { front = clean(repairedFront); back = clean(repairedBack); }
    }
    front = cleanFront(front);
    return {
      id: word.id,
      front,
      back,
      favorite,
      note: clean(word.note),
      tags: Array.isArray(word.tags) ? word.tags : [],
      reason: clean(word.reason),
      contexts: Array.isArray(word.contexts) ? word.contexts : [],
      sourceIds: Array.isArray(word.sourceIds) ? word.sourceIds : [],
      libraryIds: Array.isArray(word.libraryIds) && word.libraryIds.length ? word.libraryIds : ['list_default'],
      createdAt,
      dueAt: word.dueAt || createdAt,
      lastReviewedAt: word.lastReviewedAt || null,
      repetitions: Number(word.repetitions) || 0,
      intervalDays: Number(word.intervalDays) || 0,
      ease: Math.max(1.3, Number(word.ease) || 2.5),
      lapses: Number(word.lapses) || 0,
      mastery: Math.max(0, Math.min(100, Number(word.mastery) || 0)),
      lastRating: word.lastRating || null
    };
  }

  function scheduleReview(input, rating, now = Date.now()) {
    const word = normalizeWord(input, now);
    let intervalDays = word.intervalDays;
    let repetitions = word.repetitions;
    let ease = word.ease;
    let lapses = word.lapses;
    let mastery = word.mastery;
    let dueAt;

    if (rating === 'again') {
      repetitions = 0;
      intervalDays = 0;
      lapses += 1;
      mastery = Math.max(0, mastery - 12);
      dueAt = now + 10 * 60 * 1000;
    } else if (rating === 'hard') {
      repetitions += 1;
      intervalDays = Math.max(1, Math.round((intervalDays || 1) * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      mastery = Math.min(100, mastery + 5);
      dueAt = now + intervalDays * DAY;
    } else if (rating === 'easy') {
      repetitions += 1;
      intervalDays = repetitions === 1 ? 4 : Math.max(4, Math.round((intervalDays || 1) * (ease + 0.4)));
      ease = Math.min(3.2, ease + 0.15);
      mastery = Math.min(100, mastery + 18);
      dueAt = now + intervalDays * DAY;
    } else {
      repetitions += 1;
      intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.max(3, Math.round((intervalDays || 1) * ease));
      mastery = Math.min(100, mastery + 11);
      dueAt = now + intervalDays * DAY;
    }

    return {
      ...word,
      repetitions,
      intervalDays,
      ease: Number(ease.toFixed(2)),
      lapses,
      mastery,
      dueAt: new Date(dueAt).toISOString(),
      lastReviewedAt: new Date(now).toISOString(),
      lastRating: rating
    };
  }

  function isDue(word, now = Date.now()) {
    const due = new Date(word.dueAt || word.createdAt || 0).getTime();
    return !Number.isFinite(due) || due <= now;
  }

  return { parseVocabularyText, normalizeWord, scheduleReview, isDue };
});
