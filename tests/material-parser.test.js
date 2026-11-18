const assert = require('assert');
const MaterialParser = require('../src/material-parser');

const exam = MaterialParser.analyze(`根据以下资料，回答1—2题。\n2025年某市完成投资120亿元，同比增长20%，其中产业投资占60%。\n1. 2024年该市完成投资约为多少亿元？\nA. 80\nB. 90\nC. 100\nD. 110\n2. 2025年产业投资约为多少亿元？\nA. 60\nB. 72\nC. 80\nD. 90\n参考答案：\n1.C 2.B`, { domain: 'exam' });
assert.equal(exam.materialType, 'exam_data_analysis');
assert.equal(exam.questions.length, 2);
assert.equal(exam.questions[0].options.length, 4);
assert.equal(exam.questions[0].answer, 'C');
assert(exam.passage.includes('120亿元'));

const compactAnswers = MaterialParser.analyze(`资料：某平台访问量同比增长25%。\n1. 下列说法正确的是？\nA. 同比下降\nB. 同比增长25%\nC. 没有变化\nD. 无法判断\n答案：1.B`, { domain: 'exam' });
assert.equal(compactAnswers.questions[0].answer, 'B');

const english = MaterialParser.analyze(`Read the following passage and answer the questions.\nAcademic reading is not a race. Good readers pause to test the writer's claims and connect them with evidence.\n1. What is the main idea of the passage?\nA. Reading should always be fast.\nB. Careful reading involves evaluating claims.\nC. Evidence is unnecessary.\nD. Writers should avoid arguments.\n2. What do good readers connect claims with?\nA. Speed.\nB. Memory.\nC. Evidence.\nD. Translation.\nAnswer Key\n1.B 2.C`, { domain: 'english' });
assert.equal(english.materialType, 'english_reading');
assert.equal(english.questions.length, 2);
assert.equal(english.questions[1].answer, 'C');
assert(english.passage.startsWith('Read the following'));

const article = MaterialParser.analyze('Language learning improves when practice is deliberate and feedback is timely.', { domain: 'english' });
assert.equal(article.materialType, 'english_article');
assert.equal(article.questions.length, 0);
assert(article.warnings.length);

console.log('material parser tests passed');
