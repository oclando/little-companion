const assert = require('node:assert/strict');
const { parseVocabularyText, normalizeWord, scheduleReview, isDue } = require('../src/vocabulary');

const parsed = parseVocabularyText(`
# comment
apple\t苹果
resilient = 有韧性的
commitment：承诺；投入
apple,重复项
singleword
| ★Hierarchy | 层级窗口 | 当前场景中所有物体的名单 |
take care 照顾；小心
`);

assert.deepEqual(parsed, [
  { front: 'apple', back: '苹果', favorite: false },
  { front: 'resilient', back: '有韧性的', favorite: false },
  { front: 'commitment', back: '承诺；投入', favorite: false },
  { front: 'singleword', back: '', favorite: false },
  { front: 'Hierarchy', back: '层级窗口；当前场景中所有物体的名单', favorite: false },
  { front: 'take care', back: '照顾；小心', favorite: false }
]);

const now = Date.UTC(2026, 7, 24, 12, 0, 0);
const fresh = normalizeWord({ id: 'word-1', front: ' apple ', back: ' 苹果 ' }, now);
assert.equal(fresh.front, 'apple');
assert.equal(fresh.favorite, false);
assert.equal(fresh.mastery, 0);
assert.equal(isDue(fresh, now), true);

const good = scheduleReview(fresh, 'good', now);
assert.equal(good.repetitions, 1);
assert.equal(good.intervalDays, 1);
assert.equal(good.mastery, 11);
assert.equal(isDue(good, now), false);

const again = scheduleReview(good, 'again', now);
assert.equal(again.repetitions, 0);
assert.equal(again.lapses, 1);
assert.equal(new Date(again.dueAt).getTime(), now + 10 * 60 * 1000);

console.log('vocabulary core tests passed');
