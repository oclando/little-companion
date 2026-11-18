const assert = require('assert');
const FinalExamCore = require('../src/final-exam-core');

const sample = `第一章 货币及货币制度
（一）货币的概念：从商品中分离出来固定地充当一般等价物的商品。
（二）货币的职能及【各自的意义】：1 价值尺度；【通过价格形态使商品能够相互比较】 2 流通手段；【使商品买卖突破时空限制】
货币制度的要素：1 规定货币材料；2 规定货币单位；3 规定流通中货币的种类；`;

const bank = FinalExamCore.buildQuestionBank(sample, { title: '金融学' });
assert(bank.questions.length >= 3, '应从定义、括号答案和列表生成题目');
assert(bank.questions.some(item => item.type === 'term' && item.answer.includes('货币')), '名词解释应生成术语挖空');
assert(bank.questions.some(item => item.type === 'term' && item.responseMode === 'fill' && item.options.length === 0), '名词解释应使用真实填空输入');
assert(bank.questions.some(item => item.type === 'list-cloze' && item.responseMode === 'fill'), '简答拆项应使用填空模式');
assert(bank.questions.every(item => item.prompt !== '根据原文完成填空：____'), '不应生成没有上下文的假题干');

const first = FinalExamCore.normalizeQuestion({ id: 'q1', correctKey: 'B' });
const wrong = FinalExamCore.recordAttempt(first, false, new Date('2026-09-22T00:00:00Z'));
assert.equal(wrong.isMistake, true, '答错后进入错题本');
const rightOnce = FinalExamCore.recordAttempt(wrong, true, new Date('2026-09-22T00:10:00Z'));
assert.equal(rightOnce.isMistake, true, '答对一次仍保留错题记录');
const rightTwice = FinalExamCore.recordAttempt(rightOnce, true, new Date('2026-09-23T00:10:00Z'));
assert.equal(rightTwice.isMistake, false, '连续答对两次后移出待复习错题');
assert.equal(rightTwice.mistakeEver, true, '历史错题标记必须保留');
assert.equal(FinalExamCore.grade({ correctKey: 'C' }, 'c'), true, '答案校验应忽略大小写');
assert.equal(FinalExamCore.gradeFill({ answer: '金融工具' }, ' 金融 工具 '), true, '填空校验应忽略空格和标点');

const session = FinalExamCore.makeSession([
  { id: 'known', mastery: 90, seenCount: 5, isMistake: false, dueAt: '2099-01-01T00:00:00Z' },
  { id: 'wrong', mastery: 10, seenCount: 1, isMistake: true, dueAt: null }
], { size: 1, now: new Date('2026-09-22T00:00:00Z') });
assert.deepEqual(session, ['wrong'], '随机复习应优先到期错题和薄弱题');

console.log('final exam core tests passed');
