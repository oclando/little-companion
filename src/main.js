const { app, BrowserWindow, ipcMain, Notification, screen, shell, Tray, Menu, nativeImage, dialog, clipboard, net, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const TranslationProvider = require('./translation-provider');
const { registerAI } = require('./ai/service');
let aiService;

let mainWindow;
let petWindow;
let readerWindow;
let chatWindow,chatSessionId;
function openChatWindow(sessionId){
  if(chatWindow&&!chatWindow.isDestroyed()){
    if(chatSessionId!==sessionId){chatSessionId=sessionId;chatWindow.loadFile(path.join(__dirname,'chat-window.html'),{query:{sessionId}});}
    if(chatWindow.isMinimized())chatWindow.restore();chatWindow.show();chatWindow.focus();return;
  }
  chatSessionId=sessionId;
  chatWindow=new BrowserWindow({width:1060,height:820,minWidth:760,minHeight:620,show:false,title:'角色聊天 · 小伙伴',backgroundColor:'#e8f0ee',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'chat-preload.js'),contextIsolation:true,sandbox:true}});
  chatWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));chatWindow.webContents.on('will-navigate',e=>e.preventDefault());
  chatWindow.loadFile(path.join(__dirname,'chat-window.html'),{query:{sessionId}});
  chatWindow.once('ready-to-show',()=>chatWindow?.show());
  chatWindow.on('show',()=>chatWindow.webContents.send('chat-shown'));
  chatWindow.on('close',event=>{if(!quitting){event.preventDefault();chatWindow.hide();chatWindow.webContents.send('chat-hidden');}});
  chatWindow.on('closed',()=>{chatWindow=null;chatSessionId=null;});
}
let adventureWindow, adventureRunId;

function openAdventureWindow(runId) {
  if(adventureWindow && !adventureWindow.isDestroyed()) {
    if(adventureRunId!==runId) { adventureRunId=runId; adventureWindow.loadFile(path.join(__dirname,'adventure-window.html'),{query:{runId}}); }
    if(adventureWindow.isMinimized())adventureWindow.restore(); adventureWindow.show();adventureWindow.focus();return;
  }
  adventureRunId=runId;
  adventureWindow=new BrowserWindow({width:1060,height:820,minWidth:760,minHeight:620,show:false,title:'记忆林地 · 角色冒险',backgroundColor:'#e8f0ee',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'adventure-preload.js'),contextIsolation:true,sandbox:true}});
  adventureWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  adventureWindow.webContents.on('will-navigate',e=>e.preventDefault());
  adventureWindow.loadFile(path.join(__dirname,'adventure-window.html'),{query:{runId}});
  adventureWindow.once('ready-to-show',()=>adventureWindow?.show());
  adventureWindow.on('closed',()=>{adventureWindow=null;adventureRunId=null;});
}
let tray;
let quitting = false;
let petDragState = null;
let pomodoroTimer;
let ocrWorkerPromise;
let bookFolderWatcher;
let bookFolderSyncTimer;
const quickTranslationCache = new Map();
let pomodoro = { mode: 'focus', running: false, duration: 1500, remaining: 1500, endsAt: null, completedToday: 0, dateKey: new Date().toDateString() };

const userDataRoot = () => process.env.LITTLE_COMPANION_TEST_DATA_DIR || app.getPath('userData');
const dataFile = () => path.join(userDataRoot(), 'study-companion.json');

const defaultModules = [
  { id: 'dashboard', defaultName: '今日助手', visible: true, locked: true },
  { id: 'characters', defaultName: '角色剧场', visible: true },
  { id: 'ai', defaultName: '聊天与冒险', visible: true },
  { id: 'schedule', defaultName: '课程表', visible: true },
  { id: 'todos', defaultName: '待办事项', visible: true },
  { id: 'vocabulary', defaultName: '英语学习', visible: true },
  { id: 'pomodoro', defaultName: '番茄钟', visible: true },
  { id: 'calendar', defaultName: '日历足迹', visible: true },
  { id: 'civilService', defaultName: '考公学习', visible: true },
  { id: 'finalExam', defaultName: '期末复习', visible: true },
  { id: 'settings', defaultName: '设置', visible: true, locked: true }
];

function normalizeModules(modules) {
  const existing = new Map((Array.isArray(modules) ? modules : []).map(item => [item.id, item]));
  return defaultModules.map((fallback, order) => ({
    ...fallback,
    ...(existing.get(fallback.id) || {}),
    id: fallback.id,
    defaultName: fallback.defaultName,
    name: String(fallback.id === 'vocabulary' && existing.get(fallback.id)?.name === '单词记忆' ? fallback.defaultName : (existing.get(fallback.id)?.name || fallback.defaultName)).slice(0, 18),
    visible: fallback.locked ? true : existing.get(fallback.id)?.visible !== false,
    order: Number.isFinite(existing.get(fallback.id)?.order) ? existing.get(fallback.id).order : order
  })).sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order }));
}

function defaultExamData() {
  return {
    resources: [], questionGroups: [], questions: [], attempts: [], targets: [], sources: [],
    categories: ['行测/常识判断', '行测/言语理解', '行测/数量关系', '行测/判断推理', '行测/资料分析', '申论/归纳概括', '申论/综合分析', '申论/提出对策', '申论/文章写作'],
    tags: ['国考', '省考', '事业单位', '高频', '重点复刷'],
    activeTab: 'resources'
  };
}

function defaultEnglishData() {
  return {
    articles: [], readingSets: [], sentences: [], books: [], activeTab: 'words', selectedArticleId: null, selectedBookId: null,
    wordLists: [{ id: 'list_default', name: '默认词库', createdAt: new Date().toISOString() }], activeWordListId: 'all',
    quizHistory: [], reviewSession: null, favoriteModelVersion: 0,
    aiWebsiteUrl: 'https://chat.deepseek.com',
    promptDepth: 'standard'
  };
}

function defaultFinalExamData() {
  return {
    sources: [], questions: [], attempts: [], activeSourceId: 'all', activeChapter: 'all', activeType: 'all',
    activeTab: 'practice', sessionSize: 10, session: null
  };
}

function projectAssetsDir() {
  const root = app.isPackaged
    ? path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath), 'assets')
    : path.join(app.getAppPath(), 'assets');
  fs.mkdirSync(path.join(root, 'frames'), { recursive: true });
  if (app.isPackaged) {
    const defaults = path.join(process.resourcesPath, 'default-assets');
    const hasCharacter = fs.existsSync(path.join(root, 'character.png')) || fs.existsSync(path.join(root, 'character.gif')) || fs.readdirSync(path.join(root, 'frames')).some(file => /\.png$/i.test(file));
    if (!hasCharacter && fs.existsSync(defaults)) {
      for (const file of ['character.png', 'character.gif', '把图片放在这里.txt']) {
        const source = path.join(defaults, file);
        if (fs.existsSync(source)) fs.copyFileSync(source, path.join(root, file));
      }
    }
  }
  return root;
}

function bundledIconPath() {
  const packaged = path.join(process.resourcesPath || '', 'app-icon.png');
  return app.isPackaged && fs.existsSync(packaged) ? packaged : path.join(app.getAppPath(), 'assets', 'app-icon.png');
}

function defaultData() {
  return {
    todos: [], courses: [], reminders: [], courseNotices: [], vocabulary: [], reviewLog: [], activityLog: [],
    exam: defaultExamData(),
    english: defaultEnglishData(),
    finalExam: defaultFinalExamData(),
    characters: [{
      id: 'char_default', name: '小伙伴', identity: '学习助手', personality: '温柔、认真，会陪你把事情慢慢做好。',
      catchphrase: '稳稳地向前。', accent: '#59598f', enabled: true,
      memory: { summary: '这是最早陪伴你的角色。', affinity: 0, interactionCount: 0, lastInteractionAt: null }
    }],
    migrations: {},
    settings: {
      frameMs: 180, quietStart: '22:30', quietEnd: '08:00', courseNoticeMinutes: 10,
      petAlwaysOnTop: true, petVisible: true, petScale: 1.8, focusMinutes: 25, shortBreakMinutes: 5,
      dailyWordGoal: 20, reviewGroupSize: 10, pronunciationLocale: 'en-US', pronunciationRate: 1, autoPronounce: false,
      translationProvider: 'baidu', translationBaiduAuthMode: 'apiKey', translationBaiduModel: 'nmt',
      translationBaiduAppId: '', translationYoudaoAppKey: '', autoTranslateReading: true,
      localBookFolder: '',
      theme: 'latte', customTheme: { accent: '#8f6245', canvas: '#f3e7d5', paper: '#fffaf2', sidebar: '#6f4933' },
      sidebarCollapsed: false, activeCharacterId: 'char_default', stageMode: 'single', stageCharacterIds: ['char_default'],
      modules: normalizeModules()
    }
  };
}

function readData() {
  const fallback = defaultData();
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    const data = {
      ...fallback, ...parsed,
      settings: { ...fallback.settings, ...(parsed.settings || {}), modules: normalizeModules(parsed.settings?.modules) },
      todos: parsed.todos || [], courses: parsed.courses || [], reminders: parsed.reminders || [], courseNotices: parsed.courseNotices || [],
      vocabulary: parsed.vocabulary || [], reviewLog: parsed.reviewLog || [], activityLog: parsed.activityLog || [],
      exam: { ...fallback.exam, ...(parsed.exam || {}), resources: parsed.exam?.resources || [], questionGroups: parsed.exam?.questionGroups || [], questions: parsed.exam?.questions || [], attempts: parsed.exam?.attempts || [], targets: parsed.exam?.targets || [], sources: parsed.exam?.sources || [], categories: parsed.exam?.categories?.length ? parsed.exam.categories : fallback.exam.categories, tags: parsed.exam?.tags?.length ? parsed.exam.tags : fallback.exam.tags },
      english: { ...fallback.english, ...(parsed.english || {}), articles: parsed.english?.articles || [], readingSets: parsed.english?.readingSets || [], sentences: parsed.english?.sentences || [], books: parsed.english?.books || [], quizHistory: parsed.english?.quizHistory || [], wordLists: parsed.english?.wordLists?.length ? parsed.english.wordLists : fallback.english.wordLists },
      finalExam: { ...fallback.finalExam, ...(parsed.finalExam || {}), sources: parsed.finalExam?.sources || [], questions: parsed.finalExam?.questions || [], attempts: parsed.finalExam?.attempts || [] },
      characters: parsed.characters?.length ? parsed.characters : fallback.characters,
      migrations: { ...(parsed.migrations || {}) }
    };
    if (!Object.prototype.hasOwnProperty.call(parsed.settings || {}, 'translationBaiduAuthMode')) {
      data.settings.translationBaiduAuthMode = /^sk-/i.test(String(data.settings.translationBaiduAppId || '').trim()) ? 'apiKey' : 'legacy';
    }
    if (!data.migrations.baiduApiKeyMovedFromAppId && /^sk-/i.test(String(data.settings.translationBaiduAppId || '').trim()) && safeStorage.isEncryptionAvailable()) {
      const misplacedKey = String(data.settings.translationBaiduAppId).trim();
      if (!readTranslationSecrets().baiduApiKey) saveTranslationSecrets({ baiduApiKey: misplacedKey });
      data.settings.translationBaiduAppId = '';
      data.settings.translationBaiduAuthMode = 'apiKey';
      data.migrations.baiduApiKeyMovedFromAppId = true;
      saveData(data);
    }
    data.characters = data.characters.map(character => ({
      ...character, enabled: character.enabled !== false,
      memory: { summary: '', affinity: 0, interactionCount: 0, lastInteractionAt: null, ...(character.memory || {}) }
    }));
    if (!data.characters.some(character => character.id === data.settings.activeCharacterId && character.enabled)) data.settings.activeCharacterId = data.characters.find(character => character.enabled)?.id || data.characters[0].id;
    data.settings.stageCharacterIds = (data.settings.stageCharacterIds || [data.settings.activeCharacterId]).filter(id => data.characters.some(character => character.id === id && character.enabled));
    if (!data.settings.stageCharacterIds.length) data.settings.stageCharacterIds = [data.settings.activeCharacterId];
    if (!data.todos.length && data.reminders.length) {
      data.todos = data.reminders.map(item => ({
        id: item.id, title: item.title, dueAt: item.dueAt, priority: 'medium',
        done: Boolean(item.done), notified: Boolean(item.notified), createdAt: item.dueAt
      }));
      data.reminders = [];
      saveData(data);
    }
    return data;
  } catch { return fallback; }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2));
  return data;
}

function translationSecretsFile() { return path.join(userDataRoot(), 'translation-secrets.json'); }

function readTranslationSecrets() {
  try {
    const payload = JSON.parse(fs.readFileSync(translationSecretsFile(), 'utf8'));
    const decrypt = value => {
      if (!value) return '';
      if (!safeStorage.isEncryptionAvailable()) return '';
      return safeStorage.decryptString(Buffer.from(String(value), 'base64'));
    };
    return { baiduSecret: decrypt(payload.baiduSecret), baiduApiKey: decrypt(payload.baiduApiKey), youdaoSecret: decrypt(payload.youdaoSecret) };
  } catch { return { baiduSecret: '', baiduApiKey: '', youdaoSecret: '' }; }
}

function saveTranslationSecrets(changes = {}) {
  const previous = readTranslationSecrets();
  const next = {
    baiduSecret: changes.baiduSecret === undefined ? previous.baiduSecret : String(changes.baiduSecret || ''),
    baiduApiKey: changes.baiduApiKey === undefined ? previous.baiduApiKey : String(changes.baiduApiKey || ''),
    youdaoSecret: changes.youdaoSecret === undefined ? previous.youdaoSecret : String(changes.youdaoSecret || '')
  };
  if (!safeStorage.isEncryptionAvailable() && (next.baiduSecret || next.baiduApiKey || next.youdaoSecret)) throw new Error('当前 Windows 会话无法安全保存翻译密钥');
  const encrypt = value => value ? safeStorage.encryptString(value).toString('base64') : '';
  fs.mkdirSync(path.dirname(translationSecretsFile()), { recursive: true });
  fs.writeFileSync(translationSecretsFile(), JSON.stringify({ baiduSecret: encrypt(next.baiduSecret), baiduApiKey: encrypt(next.baiduApiKey), youdaoSecret: encrypt(next.youdaoSecret) }, null, 2));
  return next;
}

function translationSettingsSnapshot() {
  const data = readData();
  const settings = data.settings;
  const secrets = readTranslationSecrets();
  const provider = ['baidu', 'youdao'].includes(settings.translationProvider) ? settings.translationProvider : 'baidu';
  const baiduAuthMode = settings.translationBaiduAuthMode === 'legacy' ? 'legacy' : 'apiKey';
  const configured = provider === 'baidu'
    ? Boolean(settings.translationBaiduAppId && (baiduAuthMode === 'apiKey' ? secrets.baiduApiKey : secrets.baiduSecret))
    : Boolean(settings.translationYoudaoAppKey && secrets.youdaoSecret);
  return {
    provider, configured, autoTranslateReading: settings.autoTranslateReading !== false,
    baiduAuthMode, baiduModel: settings.translationBaiduModel === 'llm' ? 'llm' : 'nmt',
    baiduAppId: settings.translationBaiduAppId || '', youdaoAppKey: settings.translationYoudaoAppKey || '',
    hasBaiduSecret: Boolean(secrets.baiduSecret), hasBaiduApiKey: Boolean(secrets.baiduApiKey), hasYoudaoSecret: Boolean(secrets.youdaoSecret),
    misplacedBaiduApiKey: /^sk-/i.test(String(settings.translationBaiduAppId || '').trim()),
    movedMisplacedBaiduApiKey: Boolean(data.migrations.baiduApiKeyMovedFromAppId)
  };
}

function safeFileUrl(file) { return `file:///${file.replace(/\\/g, '/')}`; }

function libraryRoot() {
  const root = path.join(userDataRoot(), 'study-library');
  fs.mkdirSync(path.join(root, 'exam'), { recursive: true });
  fs.mkdirSync(path.join(root, 'english'), { recursive: true });
  return root;
}

function safeLibraryPath(relativePath) {
  const root = path.resolve(libraryRoot());
  const target = path.resolve(root, String(relativePath || ''));
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
}

function uniqueStoredName(originalName) {
  const ext = path.extname(originalName).slice(0, 12);
  const stem = path.basename(originalName, ext).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 72) || '资料';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${stem}${ext}`;
}

const libraryAllowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.tsv', '.epub', '.html', '.htm', '.rtf', '.odt', '.mobi', '.azw3']);

function copyLibraryFiles(filePaths = [], section = 'exam') {
  const safeSection = String(section).startsWith('english') ? 'english' : 'exam';
  return filePaths.slice(0, 80).flatMap(sourcePath => {
    try {
      const stat = fs.statSync(sourcePath);
      const ext = path.extname(sourcePath).toLowerCase();
      if (!stat.isFile() || !libraryAllowedExtensions.has(ext)) return [];
      const storedName = uniqueStoredName(path.basename(sourcePath));
      const relativePath = path.join(safeSection, storedName);
      const target = safeLibraryPath(relativePath);
      fs.copyFileSync(sourcePath, target);
      return [{
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: path.basename(sourcePath), relativePath: relativePath.replace(/\\/g, '/'),
        fileUrl: safeFileUrl(target), extension: ext.slice(1), size: stat.size,
        importedAt: new Date().toISOString()
      }];
    } catch { return []; }
  });
}

function storeVirtualLibraryFiles(entries = [], section = 'exam') {
  const safeSection = String(section).startsWith('english') ? 'english' : 'exam';
  let acceptedBytes = 0;
  return entries.slice(0, 30).flatMap(entry => {
    try {
      const originalName = path.basename(String(entry?.name || '聊天文件')).slice(0, 100);
      const ext = path.extname(originalName).toLowerCase();
      const bytes = Buffer.from(entry?.bytes || []);
      if (!libraryAllowedExtensions.has(ext) || !bytes.length || bytes.length > 100 * 1024 * 1024 || acceptedBytes + bytes.length > 300 * 1024 * 1024) return [];
      acceptedBytes += bytes.length;
      const storedName = uniqueStoredName(originalName);
      const relativePath = path.join(safeSection, storedName);
      const target = safeLibraryPath(relativePath);
      fs.writeFileSync(target, bytes);
      return [{
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: originalName, relativePath: relativePath.replace(/\\/g, '/'),
        fileUrl: safeFileUrl(target), extension: ext.slice(1), size: bytes.length,
        importedAt: new Date().toISOString(), importedFrom: 'virtual-drag'
      }];
    } catch { return []; }
  });
}

function normalizeExtractedText(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function pdfPageText(content) {
  const lines = []; let current = null;
  for (const item of content?.items || []) {
    const value = String(item?.str || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const y = Number(item?.transform?.[5]);
    const x = Number(item?.transform?.[4]);
    const height = Math.max(8, Math.abs(Number(item?.height) || Number(item?.transform?.[3]) || 10));
    const sameLine = current && Number.isFinite(y) && Number.isFinite(current.y) && Math.abs(current.y - y) <= Math.max(2.5, height * 0.28);
    if (!sameLine) {
      if (current?.parts.length) lines.push(current);
      current = { y, height, parts: [{ x, value }] };
    } else current.parts.push({ x, value });
    if (item.hasEOL && current?.parts.length) { lines.push(current); current = null; }
  }
  if (current?.parts.length) lines.push(current);
  const output = [];
  lines.forEach((line, index) => {
    const text = line.parts.sort((a, b) => a.x - b.x).map(part => part.value).join(' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    if (!text) return;
    const previous = lines[index - 1];
    const gap = previous && Number.isFinite(previous.y) && Number.isFinite(line.y) ? Math.abs(previous.y - line.y) : 0;
    if (output.length && gap > Math.max(previous?.height || 10, line.height) * 1.75) output.push('');
    output.push(text);
  });
  return normalizeExtractedText(output.join('\n'));
}

function bookChapterChunks(text, fallbackTitle = '正文') {
  const source = normalizeExtractedText(text);
  if (!source) return [];
  const lines = source.split('\n'); const sections = []; let current = null;
  const heading = /^(?:#{1,3}\s*)?(?:(?:chapter|part|book)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b.*|prologue|epilogue|introduction|preface|foreword|afterword|acknowledg(?:e)?ments?)$/i;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line && line.length <= 90 && heading.test(line.replace(/^#{1,3}\s*/, ''))) {
      if (current?.lines.join('\n').trim()) sections.push(current);
      current = { title: line.replace(/^#{1,3}\s*/, '').trim(), lines: [] };
    } else {
      current ||= { title: fallbackTitle, lines: [] };
      current.lines.push(rawLine);
    }
  }
  if (current?.lines.join('\n').trim()) sections.push(current);
  if (sections.length >= 2) return sections.map((section, index) => ({ id: `chapter_${index + 1}`, title: section.title || `Chapter ${index + 1}`, text: normalizeExtractedText(section.lines.join('\n')) })).filter(item => item.text);
  const chunks = []; const size = 24000;
  for (let start = 0; start < source.length; start += size) chunks.push({ id: `chapter_${chunks.length + 1}`, title: chunks.length ? `${fallbackTitle} · ${chunks.length + 1}` : fallbackTitle, text: source.slice(start, start + size).trim() });
  return chunks;
}

function pdfBookChapters(pages) {
  const heading = /^(?:chapter|part|book)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b.*$/i;
  const chapters = []; let current = null;
  pages.forEach((pageText, index) => {
    const text = normalizeExtractedText(pageText); if (!text) return;
    const firstLine = text.split('\n').map(line => line.trim()).find(Boolean) || '';
    if (firstLine.length <= 90 && heading.test(firstLine)) {
      if (current?.text.trim()) chapters.push(current);
      current = { id: `chapter_${chapters.length + 1}`, title: firstLine, text: text.slice(firstLine.length).trim(), pageStart: index + 1, pageEnd: index + 1 };
    } else if (current) { current.text += `\n\n${text}`; current.pageEnd = index + 1; }
  });
  if (current?.text.trim()) chapters.push(current);
  if (chapters.length >= 2) return chapters;
  const grouped = [];
  for (let index = 0; index < pages.length; index += 12) {
    const end = Math.min(pages.length, index + 12);
    grouped.push({ id: `chapter_${grouped.length + 1}`, title: `Pages ${index + 1}–${end}`, text: normalizeExtractedText(pages.slice(index, end).join('\n\n')), pageStart: index + 1, pageEnd: end });
  }
  return grouped.filter(item => item.text);
}

function xmlElementsByLocalName(document, name) {
  return Array.from(document.getElementsByTagName('*')).filter(node => node.localName === name || node.nodeName?.split(':').pop() === name);
}

function htmlDocumentText(html) {
  const { JSDOM } = require('jsdom');
  const document = new JSDOM(String(html || '')).window.document;
  document.querySelectorAll('script,style,noscript,svg').forEach(node => node.remove());
  return normalizeExtractedText(document.body?.textContent || document.documentElement?.textContent || '');
}

async function extractEpubBook(target) {
  const JSZip = require('jszip'); const { DOMParser } = require('@xmldom/xmldom');
  const zip = await JSZip.loadAsync(fs.readFileSync(target));
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('EPUB 缺少 META-INF/container.xml');
  const container = new DOMParser().parseFromString(await containerFile.async('string'), 'application/xml');
  const rootfile = xmlElementsByLocalName(container, 'rootfile')[0]; const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath || !zip.file(opfPath)) throw new Error('EPUB 缺少内容清单');
  const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('string'), 'application/xml');
  const textOf = name => normalizeExtractedText(xmlElementsByLocalName(opf, name)[0]?.textContent || '');
  const title = textOf('title') || path.basename(target, path.extname(target)); const author = textOf('creator');
  const directory = path.posix.dirname(opfPath); const resolve = href => path.posix.normalize(path.posix.join(directory === '.' ? '' : directory, String(href || '').split('#')[0]));
  const manifest = new Map(xmlElementsByLocalName(opf, 'item').map(item => [item.getAttribute('id'), { href: item.getAttribute('href'), type: item.getAttribute('media-type'), properties: item.getAttribute('properties') || '' }]));
  const spine = xmlElementsByLocalName(opf, 'itemref').map(item => item.getAttribute('idref')).filter(Boolean);
  const tocTitles = new Map();
  const navItem = [...manifest.values()].find(item => item.properties.split(/\s+/).includes('nav'));
  if (navItem && zip.file(resolve(navItem.href))) {
    const { JSDOM } = require('jsdom'); const nav = new JSDOM(await zip.file(resolve(navItem.href)).async('string')).window.document;
    nav.querySelectorAll('nav a[href]').forEach(link => tocTitles.set(resolve(link.getAttribute('href')), normalizeExtractedText(link.textContent)));
  }
  const ncxId = xmlElementsByLocalName(opf, 'spine')[0]?.getAttribute('toc'); const ncxItem = manifest.get(ncxId);
  if (ncxItem && zip.file(resolve(ncxItem.href))) {
    const ncx = new DOMParser().parseFromString(await zip.file(resolve(ncxItem.href)).async('string'), 'application/xml');
    xmlElementsByLocalName(ncx, 'navPoint').forEach(point => {
      const content = xmlElementsByLocalName(point, 'content')[0]; const label = xmlElementsByLocalName(point, 'text')[0];
      if (content?.getAttribute('src')) tocTitles.set(resolve(content.getAttribute('src')), normalizeExtractedText(label?.textContent || ''));
    });
  }
  const chapters = [];
  for (const id of spine.slice(0, 500)) {
    const item = manifest.get(id); const archivePath = resolve(item?.href); const entry = zip.file(archivePath); if (!entry) continue;
    const html = await entry.async('string'); const text = htmlDocumentText(html); if (text.length < 20) continue;
    const guessed = text.split('\n').map(line => line.trim()).find(line => line && line.length <= 90) || '';
    chapters.push({ id: `chapter_${chapters.length + 1}`, title: tocTitles.get(archivePath) || guessed || `Chapter ${chapters.length + 1}`, text, href: item.href });
  }
  if (!chapters.length) throw new Error('EPUB 中没有找到可阅读章节');
  return { title, author, chapters };
}

async function extractBookFile(file) {
  const target = safeLibraryPath(file?.relativePath);
  if (!target || !fs.existsSync(target)) return { ...file, error: '文件不存在或已经删除' };
  const ext = path.extname(target).toLowerCase(); const format = ext.slice(1).toUpperCase();
  const displayName = path.basename(file?.name || target);
  const base = { id: `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title: path.basename(displayName, path.extname(displayName)), author: '', format, relativePath: file.relativePath, originalName: displayName, size: file.size || fs.statSync(target).size, chapters: [], selectedChapterId: null, progress: 0, importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  try {
    if (ext === '.epub') Object.assign(base, await extractEpubBook(target));
    else if (ext === '.pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const bytes = new Uint8Array(fs.readFileSync(target));
      const document = await pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true }).promise; const pages = [];
      for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 800); pageNumber += 1) {
        const page = await document.getPage(pageNumber); const content = await page.getTextContent();
        pages.push(pdfPageText(content));
        if (pageNumber % 10 === 0 || pageNumber === document.numPages) mainWindow?.webContents.send('book-import-progress', { name: file.name, current: pageNumber, total: document.numPages });
      }
      const textLength = pages.join('').trim().length; base.pageCount = document.numPages; base.chapters = pdfBookChapters(pages);
      base.needsOcr = textLength < Math.max(80, document.numPages * 18); base.warning = base.needsOcr ? '这是扫描版 PDF，需要按页 OCR 后才能进入章节阅读' : document.numPages > 800 ? '当前最多读取前 800 页' : '';
    } else if (ext === '.docx') {
      const mammoth = require('mammoth'); const result = await mammoth.extractRawText({ path: target }); base.chapters = bookChapterChunks(result.value, '正文');
    } else if (['.txt', '.md'].includes(ext)) base.chapters = bookChapterChunks(fs.readFileSync(target, 'utf8'), '正文');
    else if (['.html', '.htm'].includes(ext)) base.chapters = bookChapterChunks(htmlDocumentText(fs.readFileSync(target, 'utf8')), '正文');
    else if (['.doc', '.rtf', '.odt'].includes(ext)) return { ...file, book: { ...base, conversionRequired: true, conversionHint: '请用 WPS 或 LibreOffice 另存为 DOCX，再拖回书架' } };
    else if (['.mobi', '.azw3'].includes(ext)) return { ...file, book: { ...base, conversionRequired: true, conversionHint: '请用 Calibre 转换为 EPUB，再拖回书架' } };
    else return { ...file, error: '这种格式暂不能作为书籍读取' };
    base.selectedChapterId = base.chapters[0]?.id || null; base.wordCandidates = [];
    if (!base.chapters.length && !base.needsOcr) base.error = '没有提取到可阅读文字';
    return { ...file, book: base, error: base.error || '' };
  } catch (error) { return { ...file, error: `书籍读取失败：${error.message}`, book: { ...base, error: error.message } }; }
}

const readableBookExtensions = new Set(['.epub', '.pdf', '.docx', '.txt', '.md', '.html', '.htm', '.doc', '.rtf', '.odt', '.mobi', '.azw3']);

function localBookFiles(root, depth = 0, output = []) {
  if (depth > 4 || output.length >= 240) return output;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (output.length >= 240) break;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) localBookFiles(target, depth + 1, output);
    else if (entry.isFile() && readableBookExtensions.has(path.extname(entry.name).toLowerCase())) output.push(target);
  }
  return output;
}

function normalizedDiskPath(value) { return path.resolve(String(value || '')).toLocaleLowerCase(); }

async function syncLocalBookFolder(requestedFolder) {
  const latest = readData();
  const rawFolder = String(requestedFolder || latest.settings.localBookFolder || '').trim();
  if (!rawFolder) return { ok: false, error: '尚未关联本地书库文件夹' };
  const folder = path.resolve(rawFolder);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return { ok: false, error: '本地书库文件夹不存在，请重新关联' };
  latest.settings.localBookFolder = folder;
  const existing = new Set((latest.english.books || []).map(book => book.sourcePath ? normalizedDiskPath(book.sourcePath) : '').filter(Boolean));
  const sources = localBookFiles(folder); const imported = []; const failed = [];
  for (const sourcePath of sources) {
    if (existing.has(normalizedDiskPath(sourcePath))) continue;
    const copied = copyLibraryFiles([sourcePath], 'english-books')[0];
    if (!copied) { failed.push({ name: path.basename(sourcePath), error: '格式或文件不可读取' }); continue; }
    const result = await extractBookFile(copied);
    if (result.book) {
      const stat = fs.statSync(sourcePath);
      result.book.sourcePath = sourcePath; result.book.sourceMtimeMs = stat.mtimeMs; result.book.linkedFolder = folder;
      imported.push(result.book); existing.add(normalizedDiskPath(sourcePath));
    } else {
      failed.push({ name: path.basename(sourcePath), error: result.error || '读取失败' });
      if (copied.relativePath) {
        const target = safeLibraryPath(copied.relativePath);
        if (target && fs.existsSync(target)) fs.unlinkSync(target);
      }
    }
  }
  if (imported.length) {
    latest.english.books.push(...imported);
    latest.english.selectedBookId ||= imported[0].id;
  }
  const saved = saveData(latest);
  mainWindow?.webContents.send('data-changed', saved); readerWindow?.webContents.send('data-changed', saved);
  startLocalBookWatcher(folder);
  return { ok: true, folder, scanned: sources.length, imported: imported.length, skipped: sources.length - imported.length - failed.length, failed, data: saved };
}

function startLocalBookWatcher(folder) {
  bookFolderWatcher?.close(); bookFolderWatcher = null;
  if (!folder || !fs.existsSync(folder)) return;
  try {
    bookFolderWatcher = fs.watch(folder, { recursive: true }, () => {
      clearTimeout(bookFolderSyncTimer);
      bookFolderSyncTimer = setTimeout(() => syncLocalBookFolder(folder).catch(() => {}), 1200);
    });
  } catch { /* 仍可通过“立即同步”和启动时扫描使用书库。 */ }
}

async function reparseBook(bookId) {
  const latest = readData(); const index = latest.english.books.findIndex(book => book.id === bookId);
  if (index < 0) return { ok: false, error: '找不到这本书' };
  const previous = latest.english.books[index]; const result = await extractBookFile(previous);
  if (!result.book || result.error) return { ok: false, error: result.error || '重新整理失败' };
  result.book = {
    ...result.book, id: previous.id, importedAt: previous.importedAt, progress: previous.progress || 0,
    sourcePath: previous.sourcePath || '', sourceMtimeMs: previous.sourceMtimeMs || 0, linkedFolder: previous.linkedFolder || ''
  };
  latest.english.books[index] = result.book;
  const saved = saveData(latest);
  mainWindow?.webContents.send('data-changed', saved); readerWindow?.webContents.send('data-changed', saved);
  return { ok: true, data: saved, book: result.book };
}

async function extractLearningFile(file) {
  const target = safeLibraryPath(file?.relativePath);
  if (!target || !fs.existsSync(target)) return { ...file, error: '文件不存在或已经删除', text: '' };
  const ext = path.extname(target).toLowerCase();
  try {
    if (['.txt', '.md', '.csv', '.tsv'].includes(ext)) return { ...file, text: normalizeExtractedText(fs.readFileSync(target, 'utf8')), parseKind: ext.slice(1) };
    if (ext === '.doc') return { ...file, text: '', parseKind: 'doc', error: '旧版 DOC 暂不支持，请另存为 DOCX 后导入' };
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: target });
      return { ...file, text: normalizeExtractedText(result.value), parseKind: 'docx', warnings: (result.messages || []).map(item => item.message).slice(0, 6) };
    }
    if (ext === '.pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const bytes = new Uint8Array(fs.readFileSync(target));
      const document = await pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 100); pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(pdfPageText(content));
      }
      const text = normalizeExtractedText(pages.join('\n\n'));
      const needsOcr = text.length < Math.max(30, document.numPages * 12);
      const warning = needsOcr
        ? '扫描版 PDF 没有可复制文字；请打开原文件后截取需要的页面，再粘贴图片进行 OCR'
        : document.numPages > 100 ? '只读取了前 100 页' : '';
      return { ...file, text, parseKind: 'pdf', pageCount: document.numPages, needsOcr, warning };
    }
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return { ...file, text: '', parseKind: 'image', needsOcr: true };
    return { ...file, text: '', error: '暂不支持这种文件格式' };
  } catch (error) {
    return { ...file, text: '', parseKind: ext.slice(1), error: `读取失败：${error.message}` };
  }
}

function isPrivateIp(address) {
  const value = String(address || '').toLowerCase();
  if (value === '::1' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(item => !Number.isFinite(item))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

async function assertSafeWebUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 网页');
  if (url.username || url.password) throw new Error('网址不能包含账号或密码');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase()) || isPrivateIp(url.hostname)) throw new Error('不能读取本机或局域网地址');
  const resolved = await net.resolveHost(url.hostname, { queryType: 'A', secureDnsPolicy: 'allow' });
  if ((resolved.endpoints || []).some(item => isPrivateIp(item.address))) throw new Error('不能读取本机或局域网地址');
  return url;
}

async function fetchReadableArticle(rawUrl) {
  const requested = await assertSafeWebUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await net.fetch(requested.toString(), { signal: controller.signal, redirect: 'follow', headers: { 'accept': 'text/html,application/xhtml+xml', 'user-agent': 'LittleCompanionReader/1.0' } });
    if (!response.ok) throw new Error(`网页返回 ${response.status}`);
    const finalUrl = await assertSafeWebUrl(response.url || requested.toString());
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('这个地址不是可读取的网页正文');
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > 5 * 1024 * 1024) throw new Error('网页内容超过 5 MB');
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > 5 * 1024 * 1024) throw new Error('网页内容超过 5 MB');
    const { JSDOM } = require('jsdom');
    const { Readability } = require('@mozilla/readability');
    const dom = new JSDOM(html, { url: finalUrl.toString(), runScripts: 'outside-only' });
    const result = new Readability(dom.window.document, { charThreshold: 120, maxElemsToParse: 15000 }).parse();
    if (!result?.textContent?.trim()) throw new Error('没有识别出正文，建议保存网址并手动粘贴内容');
    return { url: finalUrl.toString(), title: result.title || finalUrl.hostname, source: result.siteName || finalUrl.hostname, byline: result.byline || '', lang: result.lang || '', excerpt: result.excerpt || '', text: normalizeExtractedText(result.textContent).slice(0, 200000) };
  } finally { clearTimeout(timer); }
}

async function postTranslationRequest(request, providerName) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await net.fetch(request.url, {
      method: 'POST', signal: controller.signal,
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'LittleCompanionReader/1.8.1', ...(request.headers || {}) },
      body: request.body
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error_msg || payload?.message || payload?.error || '';
      throw new Error(`${providerName}返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`${providerName}请求超时`);
    throw error;
  } finally { clearTimeout(timer); }
}

async function fetchQuickTranslation(sourceText) {
  const text = TranslationProvider.normalizeText(sourceText);
  if (!text) throw new Error('没有需要翻译的英文');
  if (text.length > 6000) throw new Error('单次联网翻译不能超过 6000 个字符');
  const settings = readData().settings; const secrets = readTranslationSecrets();
  const provider = ['baidu', 'youdao'].includes(settings.translationProvider) ? settings.translationProvider : 'baidu';
  const cacheKey = `${provider}\u0000${text}`;
  if (quickTranslationCache.has(cacheKey)) return { text: quickTranslationCache.get(cacheKey), provider };
  let translated;
  if (provider === 'baidu') {
    const authMode = settings.translationBaiduAuthMode === 'legacy' ? 'legacy' : 'apiKey';
    const appId = String(settings.translationBaiduAppId || '').trim();
    if (/^sk-/i.test(appId)) throw new Error('这里填入的是 API Key，不是 App ID。请在百度“开发者信息”复制 App ID，API Key 填入下方的密钥框');
    if (!appId) throw new Error('缺少百度 App ID：请从“开发者中心 → 开发者信息”复制，不是昵称或 API 名称');
    if (authMode === 'apiKey') {
      if (!secrets.baiduApiKey) throw new Error('请填写以 SK- 开头的百度 API Key');
      translated = TranslationProvider.parseBaiduResponse(await postTranslationRequest(TranslationProvider.baiduApiKeyRequest(text, appId, secrets.baiduApiKey, settings.translationBaiduModel), '百度大模型翻译'));
    } else {
      if (!secrets.baiduSecret) throw new Error('请填写百度开发者信息页面的“密钥”');
      translated = TranslationProvider.parseBaiduResponse(await postTranslationRequest(TranslationProvider.baiduRequest(text, appId, secrets.baiduSecret), '百度通用翻译'));
    }
  } else {
    if (!settings.translationYoudaoAppKey || !secrets.youdaoSecret) throw new Error('请先在“设置 → 在线翻译”填写有道翻译应用 ID 和密钥');
    translated = TranslationProvider.parseYoudaoResponse(await postTranslationRequest(TranslationProvider.youdaoRequest(text, settings.translationYoudaoAppKey, secrets.youdaoSecret), '有道翻译'));
  }
  if (!translated || translated.toLocaleLowerCase() === text.toLocaleLowerCase()) throw new Error('在线翻译没有返回有效中文');
  quickTranslationCache.set(cacheKey, translated);
  if (quickTranslationCache.size > 1200) quickTranslationCache.delete(quickTranslationCache.keys().next().value);
  return { text: translated, provider };
}

function ocrLanguagePath() {
  return path.join(app.getAppPath(), 'assets', 'ocr');
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    const { createWorker } = require('tesseract.js');
    ocrWorkerPromise = createWorker('eng+chi_sim', undefined, {
      langPath: ocrLanguagePath(), gzip: true,
      logger: message => mainWindow?.webContents.send('ocr-progress', { status: message.status, progress: Number(message.progress) || 0 })
    }).catch(error => { ocrWorkerPromise = null; throw error; });
  }
  return ocrWorkerPromise;
}

function imageBufferFromInput(input) {
  if (input?.relativePath) {
    const target = safeLibraryPath(input.relativePath);
    if (!target || !fs.existsSync(target)) throw new Error('图片不存在或已经删除');
    return fs.readFileSync(target);
  }
  const match = String(input?.dataUrl || '').match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) throw new Error('没有收到有效图片');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > 20 * 1024 * 1024) throw new Error('裁剪后的图片超过 20 MB');
  return buffer;
}

function characterDirectory(characterId = 'char_default') {
  const root = projectAssetsDir();
  let directory = root;
  if (characterId !== 'char_default') {
    const data = readData();
    const exists = data.characters.some(character => character.id === characterId);
    if (exists && /^char_[a-z0-9-]+$/i.test(characterId)) directory = path.join(root, 'characters', characterId);
  }
  for (const relative of ['static', 'static/frames', 'live2d', 'live2d/motions', 'live2d/expressions', 'spine', 'spine/runtime', 'spine/textures']) fs.mkdirSync(path.join(directory, relative), { recursive: true });
  if (app.isPackaged && characterId !== 'char_default') {
    const bundled = path.join(process.resourcesPath, 'default-assets', 'characters', characterId);
    for (const file of ['character.png', 'source-original.png']) {
      const source = path.join(bundled, 'static', file); const target = path.join(directory, 'static', file);
      try { if (fs.existsSync(source) && !fs.existsSync(target)) fs.copyFileSync(source, target); } catch { /* 仍可直接读取安装包内置图片 */ }
    }
  }
  const guide = path.join(directory, '角色素材放置说明.md');
  if (!fs.existsSync(guide)) fs.writeFileSync(guide, `# 角色素材放置说明

当前版本可直接显示：static/character.png、static/character.gif、static/frames/001.png…；旧版根目录放法仍兼容。

Live2D：把完整导出包放入 live2d/，入口必须是一个 .model3.json；不要只放 moc3 或贴图。

Spine：把 .json（或 .skel）、.atlas 与全部纹理放入 spine/runtime/；另写 spine/version.txt，内容为导出所用 Spine Editor 完整版本。当前版本会优先加载兼容的 Spine 运行时素材。

模型动作建议至少提供 idle；推荐再提供 tap、happy、sad、focus、remind、drag。文件不要使用绝对路径或离开角色文件夹的 ../ 路径。

注意：Spine 已接入 3.8 WebGL 运行时；导出版本必须与运行时主次版本一致。Live2D 文件夹仍用于素材验收和后续引擎接入。
`, 'utf8');
  return directory;
}

function imageMime(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function spineRuntimeAsset(root, previewSrc) {
  const candidates = [path.join(root, 'spine', 'runtime'), path.join(root, 'spine')];
  for (const runtimeRoot of candidates) {
    if (!fs.existsSync(runtimeRoot)) continue;
    const files = fs.readdirSync(runtimeRoot);
    const skeletonFile = files.find(file => /\.json$/i.test(file));
    const atlasFile = files.find(file => /\.atlas$/i.test(file));
    if (!skeletonFile || !atlasFile) continue;
    try {
      const skeleton = JSON.parse(fs.readFileSync(path.join(runtimeRoot, skeletonFile), 'utf8'));
      const atlas = fs.readFileSync(path.join(runtimeRoot, atlasFile), 'utf8');
      const textures = Object.fromEntries(files.filter(file => /\.(png|jpe?g|webp)$/i.test(file)).map(file => {
        const buffer = fs.readFileSync(path.join(runtimeRoot, file));
        return [file, `data:${imageMime(file)};base64,${buffer.toString('base64')}`];
      }));
      if (!Object.keys(textures).length) continue;
      const animations = Object.keys(skeleton.animations || {});
      return {
        type: 'spine', src: previewSrc, skeleton, atlas, textures,
        animation: animations.includes('idle') ? 'idle' : animations[0] || null,
        animations, premultipliedAlpha: true, spineVersion: skeleton.skeleton?.spine || ''
      };
    } catch { /* 尝试其他运行时目录或静态后备 */ }
  }
  return null;
}

function characterAssets(characterId = 'char_default') {
  const root = characterDirectory(characterId);
  const staticRoot = path.join(root, 'static');
  const bundledPng = app.isPackaged && characterId !== 'char_default' ? path.join(process.resourcesPath, 'default-assets', 'characters', characterId, 'static', 'character.png') : null;
  const previewPng = [path.join(staticRoot, 'character.png'), path.join(root, 'character.png'), bundledPng].find(file => file && fs.existsSync(file));
  const spineAsset = spineRuntimeAsset(root, previewPng ? safeFileUrl(previewPng) : safeFileUrl(bundledIconPath()));
  if (spineAsset) return spineAsset;
  const gif = [path.join(staticRoot, 'character.gif'), path.join(root, 'character.gif')].find(file => fs.existsSync(file));
  if (gif) return { type: 'gif', src: safeFileUrl(gif) };
  const frameDirectory = [path.join(staticRoot, 'frames'), path.join(root, 'frames')].find(directory => fs.existsSync(directory) && fs.readdirSync(directory).some(file => /\.png$/i.test(file)));
  const frames = frameDirectory ? fs.readdirSync(frameDirectory).filter(file => /\.png$/i.test(file)).sort().map(file => safeFileUrl(path.join(frameDirectory, file))) : [];
  if (frames.length) return { type: 'frames', frames };
  const png = previewPng;
  if (png) return { type: 'image', src: safeFileUrl(png) };
  const legacyPng = path.join(projectAssetsDir(), 'character.png');
  return { type: 'placeholder', src: safeFileUrl(fs.existsSync(legacyPng) ? legacyPng : bundledIconPath()) };
}

function broadcastCharacterReload(message) {
  petWindow?.webContents.send('reload-character');
  mainWindow?.webContents.send('characters-changed', readData());
  if (message) petWindow?.webContents.send('reminder-due', { title: message, kind: 'character' });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function setPetVisibility(visible) {
  const data = readData();
  data.settings.petVisible = visible;
  saveData(data);
  if (visible) petWindow?.show(); else petWindow?.hide();
  mainWindow?.webContents.send('pet-visibility', visible);
  tray?.setContextMenu(trayMenu());
}

function trayMenu() {
  const visible = petWindow?.isVisible() ?? false;
  return Menu.buildFromTemplate([
    { label: '打开学习助手', click: showMainWindow },
    { label: visible ? '隐藏桌宠' : '显示桌宠', click: () => setPetVisibility(!visible) },
    { type: 'separator' },
    { label: '打开角色图片文件夹', click: () => shell.openPath(projectAssetsDir()) },
    { label: '退出小伙伴桌宠', click: quitApp }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(bundledIconPath()).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip('小伙伴桌宠 · 学习助手');
  tray.setContextMenu(trayMenu());
  tray.on('click', showMainWindow);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 780, minWidth: 960, minHeight: 650, show: false,
    title: '小伙伴桌宠 · 学习助手', backgroundColor: '#f2f3f8', icon: bundledIconPath(), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'panel.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (Notification.isSupported()) new Notification({ title: '小伙伴仍在运行', body: '点击右下角托盘图标可以重新打开；选择“退出”可完全关闭。' }).show();
  });
}

function createReaderWindow(bookId, chapterId) {
  if (readerWindow && !readerWindow.isDestroyed()) {
    readerWindow.show();
    if (readerWindow.isMinimized()) readerWindow.restore();
    readerWindow.focus();
    readerWindow.webContents.send('reader-open-book', { bookId, chapterId });
    return true;
  }
  const ownerBounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(workArea.width, Math.max(1040, ownerBounds?.width || 1280));
  const height = Math.min(workArea.height, Math.max(700, ownerBounds?.height || 820));
  const x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, (ownerBounds?.x ?? workArea.x) + 18));
  const y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, (ownerBounds?.y ?? workArea.y) + 18));
  readerWindow = new BrowserWindow({
    width, height, x, y, minWidth: 920, minHeight: 620, show: false,
    frame: false, thickFrame: true, resizable: true, maximizable: true,
    title: '原版阅读 · 小伙伴桌宠', backgroundColor: '#f3e7d5', icon: bundledIconPath(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  readerWindow.loadFile(path.join(__dirname, 'reader.html'), { query: { bookId: String(bookId || ''), chapterId: String(chapterId || '') } });
  const emitState = () => readerWindow && !readerWindow.isDestroyed() && readerWindow.webContents.send('reader-window-state', { maximized: readerWindow.isMaximized() });
  readerWindow.once('ready-to-show', () => { readerWindow.show(); emitState(); });
  readerWindow.on('maximize', emitState);
  readerWindow.on('unmaximize', emitState);
  readerWindow.on('closed', () => { readerWindow = null; });
  return true;
}

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  petWindow = new BrowserWindow({
    width: 264, height: 318, x: workArea.x + workArea.width - 300, y: workArea.y + workArea.height - 356,
    transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.webContents.on('context-menu', () => trayMenu().popup());
  if (readData().settings.petVisible) petWindow.show();
}

function quitApp() { quitting = true; clearInterval(pomodoroTimer); app.quit(); }

function inQuietHours(settings) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = value => { const [hour, minute] = String(value).split(':').map(Number); return hour * 60 + minute; };
  const start = toMinutes(settings.quietStart); const end = toMinutes(settings.quietEnd);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function notify(title, body, payload = {}) {
  petWindow?.webContents.send('reminder-due', { title: body, ...payload });
  if (Notification.isSupported()) new Notification({ title, body, icon: bundledIconPath() }).show();
}

function checkTodoReminders(data, now) {
  let changed = false;
  data.todos.forEach(todo => {
    if (todo.done || todo.notified || !todo.dueAt || new Date(todo.dueAt).getTime() > now) return;
    todo.notified = true; changed = true;
    notify('待办到时间了', todo.title, { kind: 'todo' });
  });
  return changed;
}

function checkCourseReminders(data, now) {
  const current = new Date(now);
  const weekday = current.getDay() || 7;
  const dateKey = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}`;
  let changed = false;
  data.courses.filter(course => Number(course.weekday) === weekday).forEach(course => {
    const [hour, minute] = course.startTime.split(':').map(Number);
    const start = new Date(current); start.setHours(hour, minute, 0, 0);
    const noticeAt = start.getTime() - Number(data.settings.courseNoticeMinutes || 10) * 60_000;
    const key = `${dateKey}:${course.id}:${course.startTime}`;
    if (now < noticeAt || now > start.getTime() + 5 * 60_000 || data.courseNotices.includes(key)) return;
    data.courseNotices.push(key); changed = true;
    notify('课程即将开始', `${course.name} · ${course.location || '地点未填写'}`, { kind: 'course' });
  });
  const keepPrefix = `${current.getFullYear()}-${current.getMonth() + 1}`;
  data.courseNotices = data.courseNotices.filter(key => key.startsWith(keepPrefix));
  return changed;
}

function checkReminders() {
  const data = readData();
  if (inQuietHours(data.settings)) return;
  const now = Date.now();
  const todoChanged = checkTodoReminders(data, now);
  const courseChanged = checkCourseReminders(data, now);
  const changed = todoChanged || courseChanged;
  if (changed) saveData(data);
}

function resetPomodoroFromSettings(mode = 'focus') {
  const settings = readData().settings;
  const minutes = mode === 'focus' ? Number(settings.focusMinutes) : Number(settings.shortBreakMinutes);
  pomodoro.mode = mode; pomodoro.running = false; pomodoro.duration = Math.max(1, minutes) * 60;
  pomodoro.remaining = pomodoro.duration; pomodoro.endsAt = null;
}

function emitPomodoro() {
  if (pomodoro.dateKey !== new Date().toDateString()) { pomodoro.dateKey = new Date().toDateString(); pomodoro.completedToday = 0; }
  const snapshot = { ...pomodoro };
  mainWindow?.webContents.send('pomodoro-tick', snapshot);
  petWindow?.webContents.send('pomodoro-tick', snapshot);
  return snapshot;
}

function tickPomodoro() {
  if (!pomodoro.running) return;
  pomodoro.remaining = Math.max(0, Math.ceil((pomodoro.endsAt - Date.now()) / 1000));
  if (pomodoro.remaining <= 0) {
    const finishedMode = pomodoro.mode;
    pomodoro.running = false;
    if (finishedMode === 'focus') {
      pomodoro.completedToday += 1;
      const data = readData();
      data.activityLog ||= [];
      data.activityLog.push({ id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'pomodoro', title: `完成番茄钟：${Math.round(pomodoro.duration / 60)}分钟`, detail: '专注计时自动归档', occurredAt: new Date().toISOString() });
      if (data.activityLog.length > 20000) data.activityLog = data.activityLog.slice(-20000);
      saveData(data);
      mainWindow?.webContents.send('data-changed', data);
    }
    notify(finishedMode === 'focus' ? '专注完成' : '休息结束', finishedMode === 'focus' ? '做得好，起来活动五分钟吧。' : '准备好后，开始下一轮专注。', { kind: 'pomodoro' });
    resetPomodoroFromSettings(finishedMode === 'focus' ? 'break' : 'focus');
  }
  emitPomodoro();
}

const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', () => showMainWindow());
app.whenReady().then(() => {
  if (!ownsInstance) return;
  app.setAppUserModelId('com.local.studycompanion');
  aiService = registerAI({ ipcMain, dialog, safeStorage, root: userDataRoot, readStudyData: readData, getWindow: () => mainWindow, openChatWindow, getChatTarget:()=>({window:chatWindow,sessionId:chatSessionId}), chatContext:sender=>sender===chatWindow?.webContents?chatSessionId:null, closeChatWindow:()=>chatWindow?.destroy(), changeAdventureSources: runId=>{showMainWindow();mainWindow.webContents.send('open-ai-chat');mainWindow.webContents.send('adventure-source-setup',runId);}, openAdventureWindow, adventureContext: sender => sender===adventureWindow?.webContents ? adventureRunId : null, avatarFromBuffer: buffer=>{const img=nativeImage.createFromBuffer(buffer);if(img.isEmpty())throw new Error('无法读取头像图片');return img.resize({width:192,height:192,quality:'good'}).toDataURL();}, defaultAvatar: characterId=>{if(!characterId)return null;try{const asset=characterAssets(characterId);const url=asset.src||asset.frames?.[0];if(!url?.startsWith('file:'))return null;const img=nativeImage.createFromPath(require('url').fileURLToPath(url));return img.isEmpty()?null:img.resize({width:192,height:192}).toDataURL();}catch{return null;}}, notify, inQuietHours, fetchImpl: net.fetch.bind(net), activateDesktopGroup: characterIds => {
    const latest = readData();
    const ids = [...new Set(characterIds)].filter(id => latest.characters.some(c => c.id === id && c.enabled !== false)).slice(0, 3);
    if (!ids.length) return;
    latest.settings.stageMode = ids.length > 1 ? 'multi' : 'single'; latest.settings.stageCharacterIds = ids; latest.settings.activeCharacterId = ids[0];
    saveData(latest); broadcastCharacterReload();
  }, activateDesktopCharacter: characterId => {
    const latest = readData();
    if (!latest.characters.some(c => c.id === characterId && c.enabled !== false)) return false;
    if (latest.settings.activeCharacterId === characterId) return true;
    latest.settings.activeCharacterId = characterId;
    if (latest.settings.stageMode === 'single') latest.settings.stageCharacterIds = [characterId];
    saveData(latest); broadcastCharacterReload(); return true;
  } });
  createMainWindow(); createPetWindow(); createTray(); resetPomodoroFromSettings();
  const linkedBooks = readData().settings.localBookFolder;
  if (linkedBooks) {
    startLocalBookWatcher(linkedBooks);
    setTimeout(() => syncLocalBookFolder(linkedBooks).catch(() => {}), 900);
  }
  pomodoroTimer = setInterval(tickPomodoro, 1000);
  setInterval(checkReminders, 15_000); checkReminders();
  app.on('activate', showMainWindow);
});
app.on('before-quit', () => { quitting = true; aiService?.shutdown(); clearTimeout(bookFolderSyncTimer); bookFolderWatcher?.close(); });
app.on('window-all-closed', () => {});

ipcMain.handle('open-panel', showMainWindow);
ipcMain.handle('open-ai-chat', () => {
  if(aiService?.openLastChat())return;
  showMainWindow();
  const open = () => mainWindow?.webContents.send('open-ai-chat');
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', open); else open();
});
ipcMain.handle('hide-main', () => mainWindow?.hide());
ipcMain.handle('close-app', quitApp);
ipcMain.handle('open-book-reader', (_event, bookId, chapterId) => createReaderWindow(bookId, chapterId));
ipcMain.handle('reader-window-action', (event, action) => {
  if (!readerWindow || readerWindow.isDestroyed() || event.sender !== readerWindow.webContents) return false;
  if (action === 'minimize') readerWindow.minimize();
  else if (action === 'maximize') readerWindow.isMaximized() ? readerWindow.unmaximize() : readerWindow.maximize();
  else if (action === 'back') { showMainWindow(); readerWindow.close(); }
  else if (action === 'close') readerWindow.close();
  return true;
});
ipcMain.on('start-pet-drag', (event, point) => {
  if (!petWindow || event.sender !== petWindow.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const [windowX, windowY] = petWindow.getPosition();
  petDragState = { mouseX: point.x, mouseY: point.y, windowX, windowY };
});
ipcMain.on('drag-pet-to', (event, point) => {
  if (!petWindow || !petDragState || event.sender !== petWindow.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  petWindow.setPosition(
    Math.round(petDragState.windowX + point.x - petDragState.mouseX),
    Math.round(petDragState.windowY + point.y - petDragState.mouseY),
    false
  );
});
ipcMain.on('end-pet-drag', event => { if (petWindow && event.sender === petWindow.webContents) petDragState = null; });
ipcMain.handle('get-character', (_event, characterId) => characterAssets(characterId));
ipcMain.handle('reload-character', () => broadcastCharacterReload());
ipcMain.handle('open-assets-folder', () => shell.openPath(projectAssetsDir()));
ipcMain.handle('open-character-folder', (_event, characterId) => shell.openPath(characterDirectory(characterId)));
ipcMain.handle('cycle-character', () => {
  const data = readData();
  const enabled = data.characters.filter(character => character.enabled);
  if (!enabled.length) return data;
  const index = enabled.findIndex(character => character.id === data.settings.activeCharacterId);
  const next = enabled[(index + 1 + enabled.length) % enabled.length];
  data.settings.activeCharacterId = next.id;
  data.settings.stageMode = 'single';
  if (!data.settings.stageCharacterIds.includes(next.id)) data.settings.stageCharacterIds.push(next.id);
  saveData(data);
  broadcastCharacterReload(`${next.name} 上场了。`);
  return data;
});
ipcMain.handle('toggle-stage-mode', (_event, requestedMode) => {
  const data = readData();
  data.settings.stageMode = requestedMode === 'multi' || requestedMode === 'single'
    ? requestedMode
    : data.settings.stageMode === 'multi' ? 'single' : 'multi';
  if (!data.settings.stageCharacterIds?.length) data.settings.stageCharacterIds = [data.settings.activeCharacterId];
  saveData(data);
  broadcastCharacterReload(data.settings.stageMode === 'multi' ? '大家一起上场。' : '切换为单角色。');
  return data;
});
ipcMain.handle('set-pet-scale', (_event, requestedScale, shouldSave = true) => {
  const scale = Math.round(Math.max(0.2, Math.min(5, Number(requestedScale) || 1)) * 100) / 100;
  if (shouldSave) {
    const data = readData(); data.settings.petScale = scale; saveData(data);
  }
  petWindow?.webContents.send('pet-scale-changed', scale);
  mainWindow?.webContents.send('pet-scale-changed', scale);
  return scale;
});
ipcMain.handle('import-vocabulary-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入英语单词', properties: ['openFile'],
    filters: [
      { name: '单词文本', extensions: ['txt', 'csv', 'tsv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { name: path.basename(filePath), text: fs.readFileSync(filePath, 'utf8') };
});
ipcMain.handle('choose-exam-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入考公资料、题目或错题', properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '学习资料与图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'tsv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  return result.canceled ? [] : copyLibraryFiles(result.filePaths, 'exam');
});
ipcMain.handle('import-dropped-exam-files', (_event, filePaths) => copyLibraryFiles(Array.isArray(filePaths) ? filePaths : [], 'exam'));
ipcMain.handle('import-dropped-exam-file-data', (_event, entries) => storeVirtualLibraryFiles(Array.isArray(entries) ? entries : [], 'exam'));
ipcMain.handle('choose-learning-files', async (_event, requestedSection) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入英语或考公学习材料', properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文档、单词表与图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'tsv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  const copied = copyLibraryFiles(result.filePaths, requestedSection === 'exam' ? 'exam' : 'english');
  return Promise.all(copied.map(extractLearningFile));
});
ipcMain.handle('import-dropped-learning-files', async (_event, filePaths, requestedSection) => {
  const copied = copyLibraryFiles(Array.isArray(filePaths) ? filePaths : [], requestedSection === 'exam' ? 'exam' : 'english');
  return Promise.all(copied.map(extractLearningFile));
});
ipcMain.handle('import-dropped-learning-file-data', async (_event, entries, requestedSection) => {
  const copied = storeVirtualLibraryFiles(Array.isArray(entries) ? entries : [], requestedSection === 'exam' ? 'exam' : 'english');
  return Promise.all(copied.map(extractLearningFile));
});
ipcMain.handle('choose-book-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '把原版书放进书架', properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '电子书与文档', extensions: ['epub', 'pdf', 'docx', 'txt', 'md', 'html', 'htm', 'doc', 'rtf', 'odt', 'mobi', 'azw3'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  const copied = copyLibraryFiles(result.filePaths, 'english-books');
  return Promise.all(copied.map(extractBookFile));
});
ipcMain.handle('choose-local-book-folder', async () => {
  const current = readData().settings.localBookFolder || app.getPath('documents');
  const result = await dialog.showOpenDialog(mainWindow, { title: '关联本地原版书文件夹', defaultPath: current, properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  return syncLocalBookFolder(result.filePaths[0]);
});
ipcMain.handle('sync-local-book-folder', () => syncLocalBookFolder());
ipcMain.handle('reparse-book', (_event, bookId) => reparseBook(bookId));
ipcMain.handle('open-book-source', (_event, bookId) => {
  const latest = readData(); const book = latest.english.books.find(item => item.id === bookId);
  if (!book) return '书籍不存在或已经删除';
  const linkedRoot = latest.settings.localBookFolder ? path.resolve(latest.settings.localBookFolder) : '';
  const linkedTarget = book.sourcePath ? path.resolve(book.sourcePath) : '';
  if (linkedRoot && linkedTarget && (linkedTarget === linkedRoot || linkedTarget.startsWith(`${linkedRoot}${path.sep}`)) && fs.existsSync(linkedTarget) && fs.statSync(linkedTarget).isFile()) return shell.openPath(linkedTarget);
  const target = safeLibraryPath(book.relativePath);
  if (!target || !fs.existsSync(target)) return '找不到原文件或书架副本';
  return shell.openPath(target);
});
ipcMain.handle('import-dropped-book-files', async (_event, filePaths) => {
  const copied = copyLibraryFiles(Array.isArray(filePaths) ? filePaths : [], 'english-books');
  return Promise.all(copied.map(extractBookFile));
});
ipcMain.handle('import-dropped-book-file-data', async (_event, entries) => {
  const copied = storeVirtualLibraryFiles(Array.isArray(entries) ? entries : [], 'english-books');
  return Promise.all(copied.map(extractBookFile));
});
ipcMain.handle('parse-learning-file', (_event, file) => extractLearningFile(file));
ipcMain.handle('fetch-web-article', async (_event, url) => {
  try { return { ok: true, article: await fetchReadableArticle(url) }; }
  catch (error) { return { ok: false, error: error.name === 'AbortError' ? '网页读取超时' : error.message }; }
});
ipcMain.handle('translate-english-text', async (_event, text) => {
  try { return { ok: true, ...(await fetchQuickTranslation(text)) }; }
  catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('get-translation-settings', () => translationSettingsSnapshot());
ipcMain.handle('save-translation-settings', (_event, payload = {}) => {
  const latest = readData();
  latest.settings.translationProvider = ['baidu', 'youdao'].includes(payload.provider) ? payload.provider : 'baidu';
  latest.settings.translationBaiduAuthMode = payload.baiduAuthMode === 'legacy' ? 'legacy' : 'apiKey';
  latest.settings.translationBaiduModel = payload.baiduModel === 'llm' ? 'llm' : 'nmt';
  latest.settings.translationBaiduAppId = String(payload.baiduAppId || '').trim();
  latest.settings.translationYoudaoAppKey = String(payload.youdaoAppKey || '').trim();
  latest.settings.autoTranslateReading = payload.autoTranslateReading !== false;
  const secretChanges = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'baiduSecret')) secretChanges.baiduSecret = payload.baiduSecret;
  if (Object.prototype.hasOwnProperty.call(payload, 'baiduApiKey')) secretChanges.baiduApiKey = payload.baiduApiKey;
  if (Object.prototype.hasOwnProperty.call(payload, 'youdaoSecret')) secretChanges.youdaoSecret = payload.youdaoSecret;
  saveTranslationSecrets(secretChanges);
  const saved = saveData(latest); quickTranslationCache.clear();
  mainWindow?.webContents.send('data-changed', saved); readerWindow?.webContents.send('data-changed', saved);
  return translationSettingsSnapshot();
});
ipcMain.handle('test-translation-provider', async () => {
  const startedAt = Date.now();
  try {
    const result = await fetchQuickTranslation('Reading changes the way we notice the world.');
    return { ok: true, ...result, latencyMs: Date.now() - startedAt };
  } catch (error) { return { ok: false, error: error.message, latencyMs: Date.now() - startedAt }; }
});
ipcMain.handle('store-learning-image', (_event, dataUrl, suggestedName = '剪贴板图片.png', requestedSection) => {
  const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 25 * 1024 * 1024) return null;
  const ext = match[1].toLowerCase().includes('jpeg') ? '.jpg' : match[1].toLowerCase().includes('webp') ? '.webp' : '.png';
  const name = path.basename(suggestedName, path.extname(suggestedName)).slice(0, 70) + ext;
  const storedName = uniqueStoredName(name);
  const relativePath = path.join(requestedSection === 'exam' ? 'exam' : 'english', storedName);
  const target = safeLibraryPath(relativePath);
  fs.writeFileSync(target, buffer);
  return { id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, relativePath: relativePath.replace(/\\/g, '/'), fileUrl: safeFileUrl(target), extension: ext.slice(1), size: buffer.length, importedAt: new Date().toISOString(), text: '', parseKind: 'image', needsOcr: true };
});
ipcMain.handle('recognize-learning-image', async (_event, input) => {
  try {
    const worker = await getOcrWorker();
    const result = await worker.recognize(imageBufferFromInput(input), { rotateAuto: true }, { blocks: true });
    return { ok: true, text: normalizeExtractedText(result.data.text), confidence: Math.round(Number(result.data.confidence) || 0) };
  } catch (error) { return { ok: false, error: `图片识别失败：${error.message}` }; }
});
ipcMain.handle('delete-library-file', (_event, relativePath) => {
  const target = safeLibraryPath(relativePath);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  fs.unlinkSync(target);
  return true;
});
ipcMain.handle('open-library-file', (_event, relativePath) => {
  const target = safeLibraryPath(relativePath);
  if (!target || !fs.existsSync(target)) return '文件不存在或已经删除';
  return shell.openPath(target);
});
ipcMain.handle('copy-text', (_event, text) => { clipboard.writeText(String(text || '')); return true; });
ipcMain.handle('export-markdown', async (_event, suggestedName, text) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 Markdown', defaultPath: path.join(app.getPath('documents'), String(suggestedName || '学习档案.md')),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(text || ''), 'utf8');
  return result.filePath;
});
ipcMain.handle('open-speech-settings', () => shell.openExternal('ms-settings:speech'));
ipcMain.handle('open-external-url', (_event, requestedUrl) => {
  try {
    const url = new URL(String(requestedUrl || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    shell.openExternal(url.toString());
    return true;
  } catch { return false; }
});
ipcMain.handle('open-codex', () => shell.openExternal('codex://'));
ipcMain.handle('get-data', readData);
ipcMain.handle('save-data', (_event, data) => {
  const previous = readData();
  const characterChanged = JSON.stringify(previous.characters) !== JSON.stringify(data.characters)
    || previous.settings.activeCharacterId !== data.settings.activeCharacterId
    || previous.settings.stageMode !== data.settings.stageMode
    || JSON.stringify(previous.settings.stageCharacterIds) !== JSON.stringify(data.settings.stageCharacterIds);
  const saved = saveData(data);
  petWindow?.setAlwaysOnTop(Boolean(data.settings.petAlwaysOnTop), 'floating');
  if (Boolean(data.settings.petVisible) !== Boolean(petWindow?.isVisible())) setPetVisibility(Boolean(data.settings.petVisible));
  if (characterChanged) broadcastCharacterReload();
  readerWindow?.webContents.send('data-changed', saved);
  return saved;
});
ipcMain.handle('save-reader-state', (_event, payload = {}) => {
  const latest = readData();
  const book = latest.english.books.find(item => item.id === payload.bookId);
  if (!book) return { ok: false, error: '书籍不存在或已经删除' };
  if (payload.chapterId && book.chapters.some(item => item.id === payload.chapterId)) {
    book.selectedChapterId = payload.chapterId;
    const chapter = book.chapters.find(item => item.id === payload.chapterId);
    const index = book.chapters.indexOf(chapter);
    book.progress = Math.max(Number(book.progress) || 0, Math.round((index + 1) / Math.max(1, book.chapters.length) * 100));
    if (payload.paragraphTranslations && typeof payload.paragraphTranslations === 'object') chapter.paragraphTranslations = payload.paragraphTranslations;
    if (payload.wordTranslations && typeof payload.wordTranslations === 'object') chapter.wordTranslations = payload.wordTranslations;
  }
  book.updatedAt = new Date().toISOString();
  const saved = saveData(latest);
  mainWindow?.webContents.send('data-changed', saved);
  return { ok: true, data: saved };
});
ipcMain.handle('save-reader-word', (_event, payload = {}) => {
  const latest = readData();
  const front = String(payload.front || '').trim();
  if (!front || !/[A-Za-z]/.test(front)) return { ok: false, error: '单词不能为空' };
  const key = front.toLocaleLowerCase();
  const targetListId = latest.english.wordLists.some(item => item.id === payload.libraryId) ? payload.libraryId : 'list_default';
  let word = latest.vocabulary.find(item => String(item.front || '').toLocaleLowerCase() === key);
  if (word) {
    word.libraryIds = [...new Set([...(word.libraryIds || ['list_default']), targetListId])];
    if (!word.back && payload.back) word.back = String(payload.back).trim();
    word.tags = [...new Set([...(word.tags || []), '原版阅读'])];
  } else {
    word = {
      id: `word_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, front, back: String(payload.back || '').trim(),
      tags: ['原版阅读'], reason: String(payload.reason || '阅读时收藏'), contexts: payload.context ? [{ text: String(payload.context), articleId: payload.bookId || null, articleTitle: String(payload.bookTitle || ''), savedAt: new Date().toISOString() }] : [],
      sourceIds: payload.bookId ? [payload.bookId] : [], libraryIds: [targetListId], favorite: false,
      mastery: 0, reviewCount: 0, lapseCount: 0, nextReviewAt: new Date().toISOString(), createdAt: new Date().toISOString()
    };
    latest.vocabulary.push(word);
  }
  const saved = saveData(latest);
  mainWindow?.webContents.send('data-changed', saved);
  return { ok: true, word, data: saved };
});
ipcMain.handle('toggle-pet', (_event, visible) => setPetVisibility(Boolean(visible)));
ipcMain.handle('get-pet-visible', () => Boolean(petWindow?.isVisible()));
ipcMain.handle('test-reminder', () => notify('小伙伴提醒测试', '通知和桌宠气泡都工作正常。'));
ipcMain.handle('get-pomodoro', emitPomodoro);
ipcMain.handle('pomodoro-action', (_event, action) => {
  if (action === 'start') { pomodoro.running = true; pomodoro.endsAt = Date.now() + pomodoro.remaining * 1000; }
  else if (action === 'pause') { if (pomodoro.running) pomodoro.remaining = Math.max(0, Math.ceil((pomodoro.endsAt - Date.now()) / 1000)); pomodoro.running = false; pomodoro.endsAt = null; }
  else if (action === 'reset') resetPomodoroFromSettings(pomodoro.mode);
  else if (action === 'skip') resetPomodoroFromSettings(pomodoro.mode === 'focus' ? 'break' : 'focus');
  return emitPomodoro();
});
