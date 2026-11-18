let data;
let currentBookId = new URLSearchParams(location.search).get('bookId');
let currentChapterId = new URLSearchParams(location.search).get('chapterId');
let paragraphs = [];
let selectedParagraphIndex = -1;
let selectedWord = '';
let selectedWordContext = '';
let readerFontSize = 17;
let translator = null;
let translatorStatus = 'idle';
let chineseVisible = true;
let toastTimer;
let wordHoverTimer;
let translationSettings = null;
let autoTranslationObserver = null;
let autoTranslationActive = 0;
const autoTranslationQueue = [];
const autoTranslationPending = new Set();

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const normalizeWord = value => String(value || '').toLocaleLowerCase().replace(/[’]/g, "'").trim();
const readerFunctionWords = new Set(`a an and are as at be been being but by can could did do does doing for from had has have he her hers him his how i if in into is it its itself may might more most must my no nor not of on once only or our ours out over she should so some such than that the their them then there these they this those through to too under up us very was we were what when where which while who whom why will with would you your yours`.split(/\s+/));
const readerNoiseWords = new Set(`all contents copyright edition isbn page pages published publisher reserved rights title www http https com org net`.split(/\s+/));

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function book() {
  return data?.english?.books?.find(item => item.id === currentBookId) || null;
}

function chapter() {
  const current = book();
  return current?.chapters?.find(item => item.id === currentChapterId) || current?.chapters?.[0] || null;
}

function splitParagraphs(text) {
  const normalized = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!normalized) return [];
  let blocks = normalized.split(/\n\s*\n+/).map(item => item.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (blocks.length === 1) {
    const lines = normalized.split(/\n+/).map(item => item.replace(/\s+/g, ' ').trim()).filter(item => item.length > 12);
    if (lines.length > 1) blocks = lines;
  }
  const output = [];
  blocks.forEach(block => {
    if (block.length <= 760) return output.push(block);
    const sentences = block.match(/[^.!?]+[.!?]+(?:[”’"']+)?|[^.!?]+$/g) || [block];
    let buffer = '';
    sentences.forEach(sentence => {
      if (buffer && buffer.length + sentence.length > 520) { output.push(buffer.trim()); buffer = ''; }
      buffer += `${sentence.trim()} `;
    });
    if (buffer.trim()) output.push(buffer.trim());
  });
  return output.slice(0, 500);
}

function looksLikeNavigationText(text) {
  const source = String(text || '').trim();
  if (!source) return true;
  const words = source.match(/[A-Za-z]+/g) || [];
  const sentenceMarks = (source.match(/[.!?]/g) || []).length;
  const titleCase = words.filter(word => /^[A-Z][a-z]/.test(word)).length;
  const indexWords = words.filter(word => /^(contents|copyright|isbn|glossary|index|title|page|pages|edition|publisher|acknowledgements?)$/i.test(word)).length;
  return words.length >= 9 && sentenceMarks === 0 && (titleCase / words.length > 0.52 || indexWords >= 2);
}

function wordMarkup(text) {
  const known = new Set((data.vocabulary || []).map(item => normalizeWord(item.front)));
  return String(text).split(/([A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*)/g).map(part => {
    if (!/^[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*$/.test(part)) return escapeHtml(part);
    const key = normalizeWord(part);
    if (readerFunctionWords.has(key) || readerNoiseWords.has(key)) return `<span class="function-word">${escapeHtml(part)}</span>`;
    return `<button class="word-token ${known.has(key) ? 'known' : ''}" data-word="${escapeHtml(part)}" type="button">${escapeHtml(part)}</button>`;
  }).join('');
}

function cachedParagraphTranslation(item, index) {
  const cached = item?.paragraphTranslations?.[`p_${index}`];
  if (!cached) return '';
  if (typeof cached === 'string') return cached;
  return cached.source === paragraphs[index] ? cached.target || '' : '';
}

function renderParagraphs() {
  const current = chapter();
  paragraphs = splitParagraphs(current?.text);
  selectedParagraphIndex = Math.min(selectedParagraphIndex, paragraphs.length - 1);
  const target = $('#paragraph-scroll');
  if (!paragraphs.length) { target.innerHTML = '<div class="reader-empty">这一章没有可阅读的文字。扫描版 PDF 请先完成 OCR。</div>'; return; }
  target.innerHTML = paragraphs.map((paragraph, index) => {
    const translation = cachedParagraphTranslation(current, index);
    const structural = looksLikeNavigationText(paragraph);
    return `<article class="paragraph-row ${index === selectedParagraphIndex ? 'selected' : ''}" data-paragraph="${index}" data-structural="${structural}"><div class="paragraph-cell"><span class="paragraph-number-mark">${String(index + 1).padStart(2, '0')}</span><p class="original-text">${wordMarkup(paragraph)}</p></div><div class="paragraph-cell" data-translation-cell="${index}">${translation ? `<p class="translation-text">${escapeHtml(translation)}</p>` : `<div class="translation-placeholder"><button data-translate-index="${index}" type="button">${structural ? '目录内容 · 手动翻译' : '翻译本段'}</button></div>`}</div></article>`;
  }).join('');
  setupAutoTranslation();
}

function renderWordLists() {
  const lists = data?.english?.wordLists || [];
  $('#target-word-list').innerHTML = lists.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
}

function renderBook() {
  const current = book();
  if (!current) {
    $('#book-title').textContent = '找不到这本书'; $('#paragraph-scroll').innerHTML = '<div class="reader-empty">书籍可能已经从书架删除。</div>'; return;
  }
  if (!currentChapterId || !current.chapters.some(item => item.id === currentChapterId)) currentChapterId = current.selectedChapterId || current.chapters[0]?.id;
  const item = chapter();
  $('#window-book-title').textContent = current.title;
  $('#book-title').textContent = current.title;
  $('#book-meta').textContent = [current.author, current.format, `${current.chapters.length} 章`].filter(Boolean).join(' · ');
  $('#reading-progress-value').textContent = `${Math.round(current.progress || 0)}%`;
  $('#reading-progress-bar').style.width = `${Math.round(current.progress || 0)}%`;
  $('#chapter-title').textContent = item?.title || '没有章节';
  $('#chapter-list').innerHTML = current.chapters.map((entry, index) => `<button class="${entry.id === currentChapterId ? 'active' : ''}" data-chapter-id="${escapeHtml(entry.id)}" type="button"><b>${String(index + 1).padStart(2, '0')}</b><span>${escapeHtml(entry.title)}</span></button>`).join('');
  renderWordLists(); renderParagraphs(); updateParagraphInspector();
}

function updateParagraphInspector() {
  const valid = selectedParagraphIndex >= 0 && selectedParagraphIndex < paragraphs.length;
  $('#paragraph-number').textContent = valid ? `第 ${selectedParagraphIndex + 1} 段` : '未选择';
  $('#paragraph-translation-editor').disabled = !valid;
  $('#translate-paragraph').disabled = !valid;
  $('#copy-translation-prompt').disabled = !valid;
  $('#save-paragraph-translation').disabled = !valid;
  $('#paragraph-translation-editor').value = valid ? cachedParagraphTranslation(chapter(), selectedParagraphIndex) : '';
}

function selectParagraph(index, shouldScroll = false) {
  selectedParagraphIndex = index;
  document.querySelectorAll('[data-paragraph]').forEach(row => row.classList.toggle('selected', Number(row.dataset.paragraph) === index));
  updateParagraphInspector();
  if (shouldScroll) document.querySelector(`[data-paragraph="${index}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function localWordEntry(value) {
  const key = normalizeWord(value);
  return (data.vocabulary || []).find(item => normalizeWord(item.front) === key) || null;
}

function setSelectedWord(value, paragraphIndex, tokenElement = null) {
  selectedWord = value;
  selectedWordContext = paragraphs[paragraphIndex] || '';
  const entry = localWordEntry(value);
  const cached = chapter()?.wordTranslations?.[normalizeWord(value)] || '';
  $('#word-display').textContent = value;
  $('#word-meaning').textContent = entry?.back || cached || '正在查询中文释义…';
  $('#word-source-badge').textContent = entry?.back ? '词库释义' : cached ? '机器翻译' : '等待释义';
  $('#word-context').textContent = selectedWordContext;
  $('#speak-word').disabled = false;
  $('#translate-word').disabled = false;
  $('#save-word').disabled = false;
  $('#save-word').textContent = entry ? '★ 已在词库' : '☆ 加入词库';
  $('#save-word').disabled = Boolean(entry);
  document.querySelectorAll('.word-token.active').forEach(token => token.classList.remove('active'));
  tokenElement?.classList.add('active');
}

async function persistReaderState() {
  const item = chapter(); if (!item) return false;
  const result = await window.companion.saveReaderState({ bookId: currentBookId, chapterId: currentChapterId, paragraphTranslations: item.paragraphTranslations || {}, wordTranslations: item.wordTranslations || {} });
  if (result?.ok && result.data) data = result.data;
  return Boolean(result?.ok);
}

function updateTranslationStatus(message, mode = '') {
  const element = $('#translation-state'); element.textContent = message; element.className = `translation-state ${mode}`.trim();
}

async function refreshOnlineTranslationState() {
  translationSettings = await window.companion.getTranslationSettings();
  const enabled = data?.settings?.autoTranslateReading !== false;
  const providerName = translationSettings.provider === 'youdao' ? '有道翻译' : '百度翻译';
  $('#auto-translate').setAttribute('aria-pressed', String(enabled));
  $('#auto-translate').textContent = enabled ? '自动翻译：开' : '自动翻译：关';
  if (translationSettings.configured) updateTranslationStatus(`${providerName}已连接`, 'ready');
  else updateTranslationStatus(`请在设置中配置${providerName}`, 'error');
  setupAutoTranslation();
}

async function inspectTranslator() {
  if (!('Translator' in window)) {
    translatorStatus = 'unavailable'; updateTranslationStatus('本机翻译不可用', 'error'); return;
  }
  try {
    const state = await Promise.race([
      Translator.availability({ sourceLanguage: 'en', targetLanguage: 'zh' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('availability timeout')), 1800))
    ]);
    translatorStatus = state;
    if (['available', 'readily'].includes(state)) updateTranslationStatus('本机翻译可用', 'ready');
    else if (['downloadable', 'after-download', 'downloading'].includes(state)) updateTranslationStatus('语言模型待下载');
    else updateTranslationStatus('本机翻译不可用', 'error');
  } catch {
    translatorStatus = 'unavailable'; updateTranslationStatus('本机翻译不可用', 'error');
  }
}

async function ensureTranslator() {
  if (translator) return translator;
  if (!('Translator' in window)) throw new Error('当前版本没有可用的本机翻译组件');
  updateTranslationStatus('正在准备英中模型…');
  const pending = Translator.create({ sourceLanguage: 'en', targetLanguage: 'zh', monitor(monitor) {
    monitor.addEventListener('downloadprogress', event => updateTranslationStatus(`下载语言模型 ${Math.round((event.loaded || 0) * 100)}%`));
  } });
  translator = await Promise.race([pending, new Promise((_, reject) => setTimeout(() => reject(new Error('本机模型准备超时，请继续使用联网速译')), 6500))]);
  translatorStatus = 'available'; updateTranslationStatus('本机翻译可用', 'ready');
  return translator;
}

function splitForQuickTranslation(text) {
  const source = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!source) return [];
  const parts = source.match(/[^.!?;:]+[.!?;:]+|[^.!?;:]+$/g) || [source];
  const chunks = []; let buffer = '';
  const flush = () => { if (buffer.trim()) chunks.push(buffer.trim()); buffer = ''; };
  parts.forEach(part => {
    const sentences = [part.trim()];
    sentences.forEach(sentence => {
      if (sentence.length <= 900) {
        if (buffer && `${buffer} ${sentence}`.length > 900) flush();
        buffer += `${buffer ? ' ' : ''}${sentence}`;
        return;
      }
      flush(); let small = '';
      sentence.split(/\s+/).forEach(word => {
        if (small && `${small} ${word}`.length > 900) { chunks.push(small); small = ''; }
        small += `${small ? ' ' : ''}${word}`;
      });
      if (small) chunks.push(small);
    });
  });
  flush(); return chunks;
}

async function translateText(text, options = {}) {
  const chunks = splitForQuickTranslation(text); const output = [];
  for (const chunk of chunks) {
    const result = await window.companion.translateEnglishText(chunk, options);
    if (!result?.ok) {
      if (translator) output.push(String(await translator.translate(chunk)).trim());
      else throw new Error(result?.error || '联网速译失败');
    } else {
      output.push(result.text);
      updateTranslationStatus(`${result.provider === 'youdao' ? '有道翻译' : '百度翻译'}已连接`, 'ready');
    }
  }
  return output.join('\n').trim();
}

async function translateParagraph(index, options = {}) {
  const shouldSelect = options.select !== false; const notify = options.notify !== false;
  if (shouldSelect) selectParagraph(index, true);
  const button = document.querySelector(`[data-translate-index="${index}"]`) || $('#translate-paragraph');
  if (button) button.disabled = true;
  try {
    const source = paragraphs[index];
    const target = await translateText(source, { mode: 'paragraph', bookTitle: book()?.title || '', chapterTitle: chapter()?.title || '' });
    const item = chapter(); item.paragraphTranslations ||= {};
    item.paragraphTranslations[`p_${index}`] = { source, target, updatedAt: new Date().toISOString() };
    if (selectedParagraphIndex === index) $('#paragraph-translation-editor').value = target;
    const cell = document.querySelector(`[data-translation-cell="${index}"]`);
    if (cell) cell.innerHTML = `<p class="translation-text">${escapeHtml(target)}</p>`;
    await persistReaderState();
    if (notify) showToast('本段译文已生成并保存在书中');
    return true;
  } catch (error) {
    updateTranslationStatus('在线翻译暂不可用', 'error');
    if (notify) showToast(`${error.message}；可在设置中检查翻译服务`);
    return false;
  } finally { if (button) button.disabled = false; }
}

function enqueueAutoTranslation(index) {
  const item = chapter(); const key = `${currentChapterId}:${index}`;
  if (!item || cachedParagraphTranslation(item, index) || looksLikeNavigationText(paragraphs[index]) || autoTranslationPending.has(key)) return;
  autoTranslationPending.add(key); autoTranslationQueue.push({ chapterId: currentChapterId, index, key }); drainAutoTranslationQueue();
}

async function drainAutoTranslationQueue() {
  if (!translationSettings?.configured || data?.settings?.autoTranslateReading === false) return;
  while (autoTranslationActive < 2 && autoTranslationQueue.length) {
    const task = autoTranslationQueue.shift();
    if (task.chapterId !== currentChapterId) { autoTranslationPending.delete(task.key); continue; }
    autoTranslationActive += 1;
    translateParagraph(task.index, { select: false, notify: false }).finally(() => {
      autoTranslationActive -= 1; autoTranslationPending.delete(task.key); drainAutoTranslationQueue();
    });
  }
}

function setupAutoTranslation() {
  autoTranslationObserver?.disconnect(); autoTranslationObserver = null;
  if (!translationSettings?.configured || data?.settings?.autoTranslateReading === false || !$('#paragraph-scroll')) return;
  autoTranslationObserver = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(entry => enqueueAutoTranslation(Number(entry.target.dataset.paragraph)));
  }, { root: $('#paragraph-scroll'), rootMargin: '260px 0px', threshold: 0.01 });
  document.querySelectorAll('[data-paragraph]').forEach(row => autoTranslationObserver.observe(row));
}

async function saveParagraphTranslation(notify = true) {
  if (selectedParagraphIndex < 0) return;
  const item = chapter(); item.paragraphTranslations ||= {};
  const target = $('#paragraph-translation-editor').value.trim();
  if (target) item.paragraphTranslations[`p_${selectedParagraphIndex}`] = { source: paragraphs[selectedParagraphIndex], target, updatedAt: new Date().toISOString() };
  else delete item.paragraphTranslations[`p_${selectedParagraphIndex}`];
  await persistReaderState();
  const cell = document.querySelector(`[data-translation-cell="${selectedParagraphIndex}"]`);
  if (cell) cell.innerHTML = target ? `<p class="translation-text">${escapeHtml(target)}</p>` : `<div class="translation-placeholder"><button data-translate-index="${selectedParagraphIndex}" type="button">翻译本段</button></div>`;
  if (notify) showToast(target ? '译文已保存' : '这一段的译文已清空');
}

async function translateChapter() {
  if (!paragraphs.length) return;
  const button = $('#translate-chapter'); button.disabled = true;
  let completed = 0;
  try {
    for (let index = 0; index < paragraphs.length; index += 1) {
      if (cachedParagraphTranslation(chapter(), index)) { completed += 1; continue; }
      if (looksLikeNavigationText(paragraphs[index])) continue;
      updateTranslationStatus(`翻译本章 ${index + 1}/${paragraphs.length}`);
      const item = chapter(); item.paragraphTranslations ||= {};
      const target = await translateText(paragraphs[index], { mode: 'paragraph', bookTitle: book()?.title || '', chapterTitle: chapter()?.title || '' });
      item.paragraphTranslations[`p_${index}`] = { source: paragraphs[index], target, updatedAt: new Date().toISOString() };
      completed += 1;
      if (index % 5 === 4) await persistReaderState();
    }
    await persistReaderState(); renderParagraphs(); updateTranslationStatus('本章翻译完成', 'ready'); showToast(`已完成 ${completed} 段翻译`);
  } catch (error) { await persistReaderState(); renderParagraphs(); showToast(`已保留完成的段落：${error.message}`); }
  finally { button.disabled = false; }
}

async function translateSelectedWord() {
  if (!selectedWord) return;
  const requestedWord = selectedWord; const requestedKey = normalizeWord(requestedWord);
  const entry = localWordEntry(requestedWord);
  if (entry?.back) return;
  try {
    const target = await translateText(requestedWord, { mode: 'word', context: selectedWordContext });
    const item = chapter(); item.wordTranslations ||= {}; item.wordTranslations[requestedKey] = target;
    if (normalizeWord(selectedWord) === requestedKey) { $('#word-meaning').textContent = target; $('#word-source-badge').textContent = '联网速译'; }
    await persistReaderState();
  } catch (error) {
    if (normalizeWord(selectedWord) === requestedKey) { $('#word-meaning').textContent = '暂时没有查到中文释义。'; $('#word-source-badge').textContent = '查询失败'; }
    showToast(`${error.message}；可稍后重试或手动补充释义`);
  }
}

function speakSelectedWord() {
  if (!selectedWord || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(selectedWord); utterance.lang = data?.settings?.pronunciationLocale || 'en-US'; utterance.rate = Number(data?.settings?.pronunciationRate) || 1; speechSynthesis.speak(utterance);
}

async function saveSelectedWord() {
  if (!selectedWord || localWordEntry(selectedWord)) return;
  const back = chapter()?.wordTranslations?.[normalizeWord(selectedWord)] || '';
  const result = await window.companion.saveReaderWord({ front: selectedWord, back, libraryId: $('#target-word-list').value, context: selectedWordContext, bookId: currentBookId, bookTitle: book()?.title, reason: `来自《${book()?.title || '原版书'}》` });
  if (!result?.ok) return showToast(result?.error || '保存失败');
  data = result.data; $('#save-word').textContent = '★ 已在词库'; $('#save-word').disabled = true;
  document.querySelectorAll('.word-token').forEach(token => { if (normalizeWord(token.dataset.word) === normalizeWord(selectedWord)) token.classList.add('known'); });
  showToast('已加入目标词库');
}

function translationPrompt() {
  if (selectedParagraphIndex < 0) return '';
  return `你是一名具备母语级英语能力、保持学术严谨的专业语言导师。请把下面这段英文准确、自然地翻译成中文。保留原意、语气、专有名词和段落层次，不补写原文不存在的信息。只输出中文译文，不要解释。\n\n书名：${book()?.title || ''}\n章节：${chapter()?.title || ''}\n\n英文原文：\n${paragraphs[selectedParagraphIndex]}`;
}

$('#window-minimize').addEventListener('click', () => window.companion.readerWindowAction('minimize'));
$('#window-maximize').addEventListener('click', () => window.companion.readerWindowAction('maximize'));
$('#window-close').addEventListener('click', () => window.companion.readerWindowAction('close'));
$('#reader-back').addEventListener('click', () => window.companion.readerWindowAction('back'));
window.companion.onReaderWindowState(state => { $('#window-maximize span').textContent = state.maximized ? '❐' : '□'; $('#window-maximize').title = state.maximized ? '还原' : '最大化'; });
window.companion.onReaderOpenBook(next => { currentBookId = next.bookId; currentChapterId = next.chapterId; selectedParagraphIndex = -1; selectedWord = ''; renderBook(); });
window.companion.onDataChanged(next => { data = next; if (!book()) return renderBook(); renderWordLists(); refreshOnlineTranslationState(); });

$('#chapter-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-chapter-id]'); if (!button) return;
  currentChapterId = button.dataset.chapterId; selectedParagraphIndex = -1; selectedWord = '';
  await persistReaderState(); renderBook(); $('#paragraph-scroll').scrollTop = 0;
});
$('#paragraph-scroll').addEventListener('click', event => {
  const translate = event.target.closest('[data-translate-index]'); if (translate) return translateParagraph(Number(translate.dataset.translateIndex));
  const row = event.target.closest('[data-paragraph]'); if (!row) return;
  const index = Number(row.dataset.paragraph); selectParagraph(index);
  const token = event.target.closest('[data-word]'); if (token) setSelectedWord(token.dataset.word, index, token);
});
$('#paragraph-scroll').addEventListener('mouseover', event => {
  const token = event.target.closest('[data-word]'); const row = event.target.closest('[data-paragraph]');
  if (token && row) {
    setSelectedWord(token.dataset.word, Number(row.dataset.paragraph), token);
    clearTimeout(wordHoverTimer);
    if (!localWordEntry(selectedWord)?.back && !chapter()?.wordTranslations?.[normalizeWord(selectedWord)]) wordHoverTimer = setTimeout(translateSelectedWord, 260);
  }
});
$('#translate-paragraph').addEventListener('click', () => translateParagraph(selectedParagraphIndex));
$('#save-paragraph-translation').addEventListener('click', () => saveParagraphTranslation());
$('#copy-translation-prompt').addEventListener('click', async () => { await window.companion.copyText(translationPrompt()); showToast('翻译指令和当前段落已复制'); });
$('#enable-translator').addEventListener('click', async () => { try { await ensureTranslator(); showToast('本机英中翻译已启用'); } catch (error) { showToast(error.message); } });
$('#translate-chapter').addEventListener('click', translateChapter);
$('#auto-translate').addEventListener('click', async () => {
  const next = data.settings.autoTranslateReading === false;
  data.settings.autoTranslateReading = next;
  data = await window.companion.saveData(data);
  await refreshOnlineTranslationState();
  if (next && !translationSettings?.configured) showToast('请先回到“设置 → 在线翻译”填写翻译服务密钥');
  else showToast(next ? '已开启：会自动翻译屏幕附近的段落' : '已关闭自动翻译');
});
$('#translate-word').addEventListener('click', translateSelectedWord);
$('#speak-word').addEventListener('click', speakSelectedWord);
$('#save-word').addEventListener('click', saveSelectedWord);
$('#open-source').addEventListener('click', async () => { const current = book(); if (!current) return showToast('找不到原文件'); const result = await window.companion.openBookSource(current.id); if (result) showToast(result); });
$('#font-down').addEventListener('click', () => { readerFontSize = Math.max(13, readerFontSize - 1); document.documentElement.style.setProperty('--reader-size', `${readerFontSize}px`); });
$('#font-up').addEventListener('click', () => { readerFontSize = Math.min(25, readerFontSize + 1); document.documentElement.style.setProperty('--reader-size', `${readerFontSize}px`); });
$('#toggle-chinese').addEventListener('click', event => { chineseVisible = !chineseVisible; $('.reading-workspace').classList.toggle('chinese-hidden', !chineseVisible); event.currentTarget.textContent = chineseVisible ? '只看英文' : '显示中英对照'; event.currentTarget.setAttribute('aria-pressed', String(chineseVisible)); });

const paragraphScroll = $('#paragraph-scroll');
$('.reading-workspace').addEventListener('wheel', event => {
  if (event.ctrlKey) return;
  event.preventDefault(); paragraphScroll.scrollTop += event.deltaY || event.deltaX;
}, { passive: false });
let scrollPan = null;
paragraphScroll.addEventListener('pointerdown', event => {
  if (event.button !== 1) return;
  event.preventDefault(); scrollPan = { y: event.clientY, top: paragraphScroll.scrollTop, id: event.pointerId };
  paragraphScroll.setPointerCapture(event.pointerId); paragraphScroll.classList.add('panning');
});
paragraphScroll.addEventListener('pointermove', event => {
  if (!scrollPan || event.pointerId !== scrollPan.id) return;
  paragraphScroll.scrollTop = scrollPan.top - (event.clientY - scrollPan.y);
});
const finishScrollPan = event => {
  if (!scrollPan || event.pointerId !== scrollPan.id) return;
  scrollPan = null; paragraphScroll.classList.remove('panning');
};
paragraphScroll.addEventListener('pointerup', finishScrollPan);
paragraphScroll.addEventListener('pointercancel', finishScrollPan);
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.companion.readerWindowAction('back'); });

(async function init() {
  data = await window.companion.getData();
  translationSettings = await window.companion.getTranslationSettings();
  renderBook(); await refreshOnlineTranslationState();
})();
