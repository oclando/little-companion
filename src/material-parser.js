(function attachMaterialParser(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaterialParser = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  function cleanText(value) {
    return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  }

  function latinRatio(text) {
    const letters = (String(text).match(/[A-Za-z]/g) || []).length;
    const meaningful = (String(text).match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
    return meaningful ? letters / meaningful : 0;
  }

  function normalizeOptionText(value) {
    return cleanText(value).replace(/^[:：.、)）\s]+/, '').trim();
  }

  function extractOptions(segment) {
    const marker = /(?:^|\n|\s{2,})([A-HＡ-Ｈ])\s*[.．、:：)）]\s*/g;
    const matches = [...segment.matchAll(marker)];
    if (matches.length < 2) return { stem: cleanText(segment), options: [] };
    const options = matches.map((match, index) => {
      const key = String.fromCharCode(match[1].charCodeAt(0) > 127 ? match[1].charCodeAt(0) - 65248 : match[1].charCodeAt(0)).toUpperCase();
      const start = match.index + match[0].length;
      const end = matches[index + 1]?.index ?? segment.length;
      return { key, text: normalizeOptionText(segment.slice(start, end)) };
    }).filter(option => option.text);
    return { stem: cleanText(segment.slice(0, matches[0].index)), options };
  }

  function splitAnswerSection(text) {
    const patterns = [
      /\n\s*(?:参考答案|答案汇总|答案速查)\s*[:：]?\s*\n?/i,
      /\n\s*答案\s*[:：]?\s*(?=(?:第\s*)?\d{1,3}(?:\s*题)?\s*[.、:：)）-]?\s*[A-HＡ-Ｈ])/i,
      /\n\s*(?:Answer\s+Key|Answers?)\s*[:：]?\s*\n?/i
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match && match.index > text.length * .35) return { body: text.slice(0, match.index).trim(), answerSection: text.slice(match.index + match[0].length).trim() };
    }
    return { body: text, answerSection: '' };
  }

  function answerMapFromSection(section) {
    const result = {};
    const pattern = /(?:第\s*)?(\d{1,3})(?:\s*题)?\s*[.、:：)）-]?\s*([A-HＡ-Ｈ]{1,4}|正确|错误|对|错|True|False)/gi;
    for (const match of String(section || '').matchAll(pattern)) {
      result[Number(match[1])] = match[2].replace(/[Ａ-Ｈ]/g, char => String.fromCharCode(char.charCodeAt(0) - 65248)).toUpperCase();
    }
    return result;
  }

  function questionMarkers(text) {
    const linePattern = /(?:^|\n)\s*(?:第\s*)?[（(]?([1-9]\d{0,2})[）)]?(?:\s*题)?\s*[.．、:：]\s*/g;
    return [...text.matchAll(linePattern)].map(match => ({ number: Number(match[1]), index: match.index + (match[0].startsWith('\n') ? 1 : 0), contentStart: match.index + match[0].length }));
  }

  function inlineAnswer(segment) {
    const match = segment.match(/(?:^|\n)\s*(?:参考)?答案\s*[:：]\s*([A-HＡ-Ｈ]{1,4}|正确|错误|对|错|True|False)/i);
    return match ? match[1].replace(/[Ａ-Ｈ]/g, char => String.fromCharCode(char.charCodeAt(0) - 65248)).toUpperCase() : '';
  }

  function stripInlineAnswer(segment) {
    return segment.replace(/(?:^|\n)\s*(?:参考)?答案\s*[:：].*?(?=\n|$)/gi, '').replace(/(?:^|\n)\s*(?:解析|说明)\s*[:：].*$/gis, '').trim();
  }

  function inferQuestionType(question) {
    const text = `${question.stem} ${question.answer}`;
    if (!question.options.length) return /判断|正确|错误|true|false/i.test(text) ? 'judge' : 'subjective';
    if (/多选|不定项|选择所有|choose\s+(?:all|two|three)/i.test(text) || /^[A-H]{2,}$/i.test(question.answer || '')) return 'multiple';
    return 'single';
  }

  function parseQuestions(body, answerSection) {
    const markers = questionMarkers(body);
    const answerMap = answerMapFromSection(answerSection);
    const questions = [];
    let firstQuestionIndex = body.length;
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      const end = markers[index + 1]?.index ?? body.length;
      const raw = body.slice(marker.contentStart, end).trim();
      const parsed = extractOptions(stripInlineAnswer(raw));
      const looksLikeQuestion = parsed.options.length >= 2 || /[?？]$/.test(parsed.stem) || /下列|以下|哪项|何者|which|what|why|how|according/i.test(parsed.stem);
      if (!looksLikeQuestion) continue;
      firstQuestionIndex = Math.min(firstQuestionIndex, marker.index);
      const question = {
        number: marker.number,
        stem: parsed.stem,
        options: parsed.options,
        answer: answerMap[marker.number] || inlineAnswer(raw),
        explanation: '',
        confidence: parsed.options.length >= 4 ? .96 : parsed.options.length >= 2 ? .86 : .68
      };
      question.type = inferQuestionType(question);
      questions.push(question);
    }
    return { questions, firstQuestionIndex };
  }

  function inferDomain(text, requestedDomain) {
    if (requestedDomain === 'exam' || requestedDomain === 'english') return requestedDomain;
    return latinRatio(text) > .58 ? 'english' : 'exam';
  }

  function inferMaterialType(text, questions, domain) {
    const source = String(text || '');
    if (domain === 'english') {
      if (/完形填空|cloze|fill\s+in\s+the\s+blanks?/i.test(source) || (/\b_ {1,}_?\b/.test(source) && questions.length >= 3)) return 'english_cloze';
      if (questions.length) return 'english_reading';
      if (/translate|translation|翻译/i.test(source)) return 'english_translation';
      if (/essay|writing|composition|写作/i.test(source)) return 'english_writing';
      return 'english_article';
    }
    if (/给定资料|作答要求|申论/i.test(source) && !questions.some(item => item.options.length)) return 'exam_essay';
    if (/资料分析|根据以下资料|根据下列资料|下列资料|图表|统计表|同比|环比|增长率|占比/.test(source) && questions.length) return 'exam_data_analysis';
    if (/言语理解|主旨|意在说明|最恰当|填入划横线/.test(source)) return 'exam_verbal';
    if (/判断推理|定义判断|逻辑判断|图形推理|类比推理/.test(source)) return 'exam_reasoning';
    if (/数量关系|数学运算|工程问题|行程问题/.test(source)) return 'exam_quantitative';
    if (/常识判断|法律常识|科技常识|人文常识/.test(source)) return 'exam_knowledge';
    return questions.length ? 'exam_question_group' : 'exam_material';
  }

  function typeLabel(type) {
    return ({
      english_reading: '英语阅读理解', english_cloze: '英语完形填空', english_translation: '英语翻译', english_writing: '英语写作', english_article: '普通英文文章',
      exam_data_analysis: '行测 · 资料分析', exam_verbal: '行测 · 言语理解', exam_reasoning: '行测 · 判断推理', exam_quantitative: '行测 · 数量关系',
      exam_knowledge: '行测 · 常识判断', exam_essay: '申论材料题', exam_question_group: '考公材料题组', exam_material: '普通考公资料'
    })[type] || '学习材料';
  }

  function analyze(rawText, options = {}) {
    const text = cleanText(rawText);
    const split = splitAnswerSection(text);
    const parsed = parseQuestions(split.body, split.answerSection);
    const domain = inferDomain(text, options.domain);
    const materialType = inferMaterialType(text, parsed.questions, domain);
    const passage = cleanText(split.body.slice(0, parsed.firstQuestionIndex));
    const average = parsed.questions.length ? parsed.questions.reduce((sum, item) => sum + item.confidence, 0) / parsed.questions.length : .58;
    const confidence = Math.round(Math.min(.98, average + (parsed.questions.length >= 2 ? .04 : 0)) * 100);
    const warnings = [];
    if (!parsed.questions.length) warnings.push('没有识别到稳定的题号与选项结构，将按普通材料保存');
    if (parsed.questions.some(item => item.options.length && item.options.length < 4)) warnings.push('部分题目选项少于四项，请在归档前校对');
    if (parsed.questions.length && !passage) warnings.push('没有识别到公共材料，题干可能已经包含材料内容');
    return {
      domain, materialType, typeLabel: typeLabel(materialType), confidence, passage,
      questions: parsed.questions, answerSection: split.answerSection, warnings,
      stats: { characters: text.length, questions: parsed.questions.length, latinRatio: Math.round(latinRatio(text) * 100) }
    };
  }

  return { analyze, typeLabel, cleanText };
});
