let data;
let currentPage = 'dashboard';
let todoFilter = 'all';
let weekOffset = 0;
let pomodoroState = { mode: 'focus', running: false, duration: 1500, remaining: 1500, completedToday: 0 };
let toastTimer;
let reviewQueue = [];
let reviewSessionTotal = 0;
let reviewCompleted = 0;
let reviewSessionIndex = 0;
let reviewSessionRatings = {};
let reviewSessionSeenIds = new Set();
let reviewCycleSeenIds = new Set();
let reviewPhase = 'memory';
let reviewQuizQuestions = [];
let reviewQuizIndex = 0;
let reviewQuizCorrect = 0;
let reviewQuizAnswered = false;
let reviewShowingAnswer = false;
let reviewSessionComplete = false;
let favoriteWordsOnly = false;
let lastAutoSpokenWordId = null;
const reviewSessionStorageKey = 'little-companion.review-session.v1';
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDay = localDayKey();
let examResourceFilter = 'all';
let englishTab = 'words';
let learningImportQueue = [];
let activeLearningImportId = null;
let ocrState = { itemId: null, image: null, crop: null, drawing: false, start: null };
let moduleDraft = null;
let moduleDraftDirty = false;
let selectedExamGroupId = null;
let selectedExamGroupQuestionId = null;
let selectedEnglishQuestionIndex = 0;
let bookReaderFontSize = 14;
let translationSettingsState = null;
let finalExamTab = 'practice';

const moduleDefaults = [
  { id: 'dashboard', name: '今日助手', icon: '⌂', locked: true },
  { id: 'characters', name: '角色剧场', icon: '♙' },
  { id: 'ai', name: '聊天与冒险', icon: '✧' },
  { id: 'schedule', name: '课程表', icon: '▦' },
  { id: 'todos', name: '待办事项', icon: '✓' },
  { id: 'vocabulary', name: '英语学习', icon: 'Aa' },
  { id: 'pomodoro', name: '番茄钟', icon: '◷' },
  { id: 'calendar', name: '日历足迹', icon: '▤' },
  { id: 'civilService', name: '考公学习', icon: '册' },
  { id: 'finalExam', name: '期末复习', icon: '考' },
  { id: 'settings', name: '设置', icon: '⚙', locked: true }
];

const pageMeta = {
  dashboard: ['TODAY / 今日', '今天，稳稳地向前'],
  characters: ['STAGE / 角色', '让不同的伙伴轮流上场'],
  ai: ['STORIES / 陪伴与世界', '聊天与冒险'],
  schedule: ['SCHEDULE / 课程', '把一周安排得清清楚楚'],
  todos: ['TASKS / 待办', '把事情一件件放下'],
  vocabulary: ['ENGLISH / 英语', '阅读、收藏与记忆在这里汇合'],
  pomodoro: ['FOCUS / 番茄钟', '留一段完整时间给自己'],
  calendar: ['ARCHIVE / 日历', '每一天做过的事，都有迹可循'],
  civilService: ['DOSSIER / 考公', '整理资料，也整理自己的薄弱点'],
  finalExam: ['FINALS / 期末', '把资料练成真正记住的答案'],
  settings: ['SETTINGS / 设置', '让小伙伴更懂你的习惯']
};
const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const shortWeekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const themePresets = {
  latte: { ink: '#3e3028', muted: '#7b6b60', line: '#dfd0bf', canvas: '#f3e7d5', paper: '#fffaf2', accent: '#8f6245', accentDark: '#6f4933', accentSoft: '#ead8c8', yellow: '#d8aa70', green: '#697c63', coral: '#b66f61', sidebar: '#6f4933' },
  mist: { ink: '#30373a', muted: '#6d787c', line: '#d7dedf', canvas: '#edf1f0', paper: '#fbfcfa', accent: '#5e7d83', accentDark: '#46636a', accentSoft: '#dae6e7', yellow: '#c7a66a', green: '#5f7d68', coral: '#b87469', sidebar: '#405d61' },
  forest: { ink: '#2f362f', muted: '#697267', line: '#d4d8cd', canvas: '#e9eee5', paper: '#fafbf6', accent: '#66785c', accentDark: '#485a42', accentSoft: '#dce5d6', yellow: '#c5a35d', green: '#56735c', coral: '#b56f62', sidebar: '#3f513b' }
};

function customThemePalette(settings) {
  const custom = settings.customTheme || {};
  return {
    ...themePresets.latte,
    canvas: custom.canvas || '#f3e7d5', paper: custom.paper || '#fffaf2',
    accent: custom.accent || '#8f6245', accentDark: `color-mix(in srgb, ${custom.accent || '#8f6245'} 78%, black)`,
    accentSoft: `color-mix(in srgb, ${custom.accent || '#8f6245'} 18%, ${custom.paper || '#fffaf2'})`,
    sidebar: custom.sidebar || '#6f4933', line: `color-mix(in srgb, ${custom.accent || '#8f6245'} 18%, ${custom.paper || '#fffaf2'})`
  };
}

function applyTheme(settings = data?.settings || {}) {
  const theme = settings.theme || 'latte';
  const palette = theme === 'custom' ? customThemePalette(settings) : (themePresets[theme] || themePresets.latte);
  const root = document.documentElement;
  root.dataset.theme = theme;
  const variables = {
    '--ink': palette.ink, '--muted': palette.muted, '--line': palette.line, '--canvas': palette.canvas,
    '--paper': palette.paper, '--violet': palette.accent, '--violet-dark': palette.accentDark,
    '--violet-soft': palette.accentSoft, '--yellow': palette.yellow, '--green': palette.green,
    '--coral': palette.coral, '--sidebar': palette.sidebar
  };
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  document.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === theme)));
}

function localInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function dateKey(date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function sameDay(a, b) { return dateKey(a) === dateKey(b); }
function formatDateTime(value) {
  if (!value) return '未设时间';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function moduleSettings() {
  if (Array.isArray(data.settings.modules) && moduleDefaults.every(fallback => data.settings.modules.some(item => item.id === fallback.id))) {
    return data.settings.modules.sort((a, b) => a.order - b.order);
  }
  const existing = new Map((data.settings.modules || []).map(item => [item.id, item]));
  data.settings.modules = moduleDefaults.map((fallback, order) => ({
    id: fallback.id, defaultName: fallback.name, name: existing.get(fallback.id)?.name || fallback.name,
    visible: fallback.locked ? true : existing.get(fallback.id)?.visible !== false,
    locked: Boolean(fallback.locked), order: Number.isFinite(existing.get(fallback.id)?.order) ? existing.get(fallback.id).order : order
  })).sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order }));
  return data.settings.modules;
}
function getModule(id) { return moduleSettings().find(item => item.id === id); }
function freshModuleDraft() { return moduleSettings().map(item => ({ ...item })); }
function ensureModuleDraft() {
  if (!moduleDraft) moduleDraft = freshModuleDraft();
  return moduleDraft;
}
function updateModuleDraftActions() {
  const actions = document.querySelector('#module-change-actions'); if (!actions) return;
  actions.dataset.state = moduleDraftDirty ? 'dirty' : 'clean';
  document.querySelector('#module-change-status').textContent = moduleDraftDirty ? '页面显示设置尚未保存' : '没有未保存的修改';
  document.querySelector('#cancel-module-changes').disabled = !moduleDraftDirty;
  document.querySelector('#confirm-module-changes').disabled = !moduleDraftDirty;
}
function markModuleDraftDirty() { moduleDraftDirty = true; updateModuleDraftActions(); }
function syncModuleDraftFromDom() {
  const modules = ensureModuleDraft();
  document.querySelectorAll('#module-manager [data-module-id]').forEach((row, order) => {
    const module = modules.find(item => item.id === row.dataset.moduleId); if (!module) return;
    const name = row.querySelector('[data-module-name]')?.value.trim();
    module.name = (name || module.defaultName).slice(0, 18);
    module.visible = module.locked ? true : Boolean(row.querySelector('[data-module-visible]')?.checked);
    module.order = order;
  });
  return modules;
}
function cancelModuleDraft(showMessage = true) {
  moduleDraft = freshModuleDraft(); moduleDraftDirty = false; renderModuleManager();
  if (showMessage) showToast('未保存的页面显示修改已取消');
}
function applyModuleSettings() {
  moduleSettings().forEach(module => {
    const button = document.querySelector(`.nav-item[data-page="${module.id}"]`);
    if (!button) return;
    button.hidden = !module.visible;
    button.style.order = module.order;
    button.title = module.name;
    const label = button.querySelector('b');
    if (label) label.textContent = module.name;
  });
}
function addActivity(type, title, detail = '', occurredAt = new Date().toISOString()) {
  data.activityLog ||= [];
  data.activityLog.push({ id: crypto.randomUUID(), type, title, detail, occurredAt });
  if (data.activityLog.length > 20000) data.activityLog = data.activityLog.slice(-20000);
}
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}
async function persist(message) {
  data = await window.companion.saveData(data);
  if (message) showToast(message);
}

function setPage(page) {
  if (currentPage === 'settings' && page !== 'settings' && moduleDraftDirty) {
    if (!confirm('页面名称或侧栏显示还有未保存的修改。\n离开设置会取消这些修改，仍要离开吗？')) return;
    cancelModuleDraft(false);
  }
  const module = getModule(page);
  if (module && !module.visible && !module.locked) page = 'dashboard';
  currentPage = page;
  document.querySelector('.page-scroll').scrollTop = 0;
  document.querySelectorAll('.page').forEach(section => section.classList.toggle('active', section.id === `page-${page}`));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  document.querySelector('#page-eyebrow').textContent = pageMeta[page]?.[0] || 'PAGE / 页面';
  document.querySelector('#page-title').textContent = getModule(page)?.name || pageMeta[page]?.[1] || '学习助手';
  document.querySelector('#top-add').title = page === 'schedule' ? '添加课程' : page === 'characters' ? '添加角色' : page === 'vocabulary' ? (englishTab === 'articles' ? '收藏文章' : englishTab === 'sentences' ? '收藏句子' : '导入单词') : page === 'civilService' ? '导入考公资料' : page === 'finalExam' ? '导入期末资料' : '添加待办';
  renderPage(page);
  if (page === 'ai') document.querySelector('#top-add').title = '新建聊天或冒险存档';
}

function renderPage(page) {
  if (page === 'ai') window.AIWorkspace?.open();
  if (page === 'dashboard') renderDashboard();
  if (page === 'characters') renderCharacters();
  if (page === 'schedule') renderSchedule();
  if (page === 'todos') renderTodos();
  if (page === 'vocabulary') renderVocabulary();
  if (page === 'pomodoro') renderPomodoro(pomodoroState);
  if (page === 'calendar') renderCalendar();
  if (page === 'civilService') renderExam();
  if (page === 'finalExam') renderFinalExam();
  if (page === 'settings') renderSettings();
}

async function loadDashboardCharacter() {
  const asset = await window.companion.getCharacter(data.settings.activeCharacterId);
  const image = document.querySelector('#dashboard-pet');
  image.src = asset.type === 'frames' ? asset.frames[0] : asset.src;
  image.style.setProperty('--pet-scale', data.settings.petScale || 1);
}

function stageCharacters() {
  const enabled = data.characters.filter(character => character.enabled !== false);
  if (data.settings.stageMode === 'multi') {
    const selected = (data.settings.stageCharacterIds || []).map(id => enabled.find(character => character.id === id)).filter(Boolean).slice(0, 3);
    if (selected.length) return selected;
  }
  return [enabled.find(character => character.id === data.settings.activeCharacterId) || enabled[0]].filter(Boolean);
}

async function characterPreviewSource(characterId) {
  const asset = await window.companion.getCharacter(characterId);
  return asset.type === 'frames' ? asset.frames[0] : asset.src;
}

async function hydrateCharacterImages() {
  const images = [...document.querySelectorAll('[data-character-image]')];
  await Promise.all(images.map(async image => { image.src = await characterPreviewSource(image.dataset.characterImage); }));
  const preview = document.querySelector('#stage-preview');
  const cast = stageCharacters();
  preview.classList.toggle('multi', cast.length > 1);
  preview.replaceChildren(...await Promise.all(cast.map(async role => {
    const image = new Image(); image.alt = role.name; image.src = await characterPreviewSource(role.id); return image;
  })));
}

function renderCharacters() {
  const activeId = data.settings.activeCharacterId;
  const stageIds = data.settings.stageCharacterIds || [];
  document.querySelectorAll('[data-stage-mode]').forEach(button => button.classList.toggle('active', button.dataset.stageMode === data.settings.stageMode));
  document.querySelector('#character-count').textContent = `${data.characters.length} 位角色 · ${stageCharacters().length} 位在舞台`;
  document.querySelector('#character-grid').innerHTML = data.characters.map(character => {
    const active = character.id === activeId;
    const selected = stageIds.includes(character.id);
    return `<article class="character-card ${active ? 'active' : ''}" style="--accent:${character.accent || '#59598f'}">
      <div class="character-portrait"><img data-character-image="${character.id}" alt="${escapeHtml(character.name)}"></div>
      <div class="character-name-line"><h3>${escapeHtml(character.name)}</h3><span>${escapeHtml(character.identity || '桌面伙伴')}</span></div>
      <p class="character-personality">${escapeHtml(character.personality || '还没有填写性格设定。')}</p>
      <div class="character-memory-line"><b>独立记忆</b><span>${escapeHtml(character.memory?.summary || '等待与你建立新的记忆')}</span></div>
      <div class="character-card-actions">
        <button class="primary-card" data-character-active="${character.id}">${active ? '正在上场' : '单独上场'}</button>
        <button class="${selected ? 'selected' : ''}" data-character-stage="${character.id}">${selected ? '✓ 已选同台' : '加入同台'}</button>
        <button data-character-folder="${character.id}">图片文件夹</button>
        <button data-character-edit="${character.id}">编辑档案</button>
      </div>
    </article>`;
  }).join('');
  hydrateCharacterImages();
}

function getTodayCourses() {
  const weekday = new Date().getDay() || 7;
  return data.courses.filter(course => Number(course.weekday) === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function getTodayTodos() {
  const today = new Date();
  return data.todos.filter(todo => !todo.done && todo.dueAt && sameDay(new Date(todo.dueAt), today)).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

function renderDashboard() {
  const hour = new Date().getHours();
  document.querySelector('#greeting').textContent = hour < 11 ? '早上好，找到今天的节奏' : hour < 18 ? '下午好，先做最重要的事' : '晚上好，给今天收个尾';
  const courses = getTodayCourses();
  const todos = getTodayTodos();
  const wordPlan = dailyWordPlan();
  const now = new Date();
  const nextCourse = courses.find(course => {
    const [h, m] = course.endTime.split(':').map(Number); const end = new Date(); end.setHours(h, m, 0, 0); return end > now;
  });
  const nextTodo = todos.find(todo => new Date(todo.dueAt) > now);
  let message = '今天还没有安排。可以先添加课程或待办，再开始一轮专注。';
  if (nextCourse) message = `下一项课程是 ${nextCourse.name}，${nextCourse.startTime} 开始${nextCourse.location ? `，地点在 ${nextCourse.location}` : ''}。`;
  else if (nextTodo) message = `接下来要记得“${nextTodo.title}”，到期时间是 ${formatDateTime(nextTodo.dueAt)}。`;
  else if (data.todos.some(todo => !todo.done)) message = `清单里还有 ${data.todos.filter(todo => !todo.done).length} 件未完成的事，挑最重要的一件开始吧。`;
  else {
    const dueWords = data.vocabulary.filter(word => VocabularyCore.isDue(word)).length;
    if (wordPlan.goal && !wordPlan.done) message = `今天的单词计划完成了 ${wordPlan.completed}/${wordPlan.goal}，再记住 ${wordPlan.goal - wordPlan.completed} 个就达标。`;
    else if (dueWords) message = `今天有 ${dueWords} 个单词等待复习。回想一次，比重新背一遍更有效。`;
  }
  document.querySelector('#assistant-message').textContent = message;

  const events = [
    ...(wordPlan.goal ? [{ time: '全天', sortTime: '00:00', title: '单词复习', meta: wordPlan.done ? `${wordPlan.completed}/${wordPlan.goal} · 今日已达标` : `${wordPlan.completed}/${wordPlan.goal} · 点击继续复习`, color: 'var(--yellow)', go: 'vocabulary' }] : []),
    ...courses.map(course => ({ time: course.startTime, sortTime: course.startTime, title: course.name, meta: [course.location, course.teacher].filter(Boolean).join(' · ') || '课程', color: course.color || 'var(--violet)' })),
    ...todos.map(todo => ({ time: new Date(todo.dueAt).toTimeString().slice(0, 5), sortTime: new Date(todo.dueAt).toTimeString().slice(0, 5), title: todo.title, meta: '待办截止', color: todo.priority === 'high' ? 'var(--coral)' : 'var(--green)' }))
  ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));
  const timeline = document.querySelector('#today-timeline');
  timeline.innerHTML = events.length ? events.map(event => `<div class="timeline-item ${event.go ? 'actionable' : ''}" ${event.go ? `data-go="${event.go}" role="button" tabindex="0"` : ''}><span class="timeline-time">${event.time}</span><i class="timeline-dot" style="background:${event.color};box-shadow:0 0 0 2px ${event.color}"></i><div class="timeline-copy"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.meta)}</span></div></div>`).join('') : '<div class="empty-state"><div><span class="empty-mark">⌁</span>今天还没有课程或到期待办<br>留一点空白，也是一种安排</div></div>';

  const pending = data.todos.filter(todo => !todo.done).sort((a, b) => (new Date(a.dueAt || 8640000000000000) - new Date(b.dueAt || 8640000000000000))).slice(0, 4);
  const brief = document.querySelector('#dashboard-todos');
  const wordPlanItem = wordPlan.goal ? `<button class="brief-word-plan ${wordPlan.done ? 'done' : ''}" type="button" data-go="vocabulary"><span class="plan-check">${wordPlan.done ? '✓' : 'Aa'}</span><span><strong>单词复习</strong><small>${wordPlan.completed}/${wordPlan.goal}${wordPlan.done ? ' · 今日已达标' : ' · 继续积累'}</small><i><b style="width:${wordPlan.percent}%"></b></i></span></button>` : '';
  const todoItems = pending.map(todo => `<label class="brief-item"><input type="checkbox" data-todo-check="${todo.id}"><span><strong>${escapeHtml(todo.title)}</strong><span>${todo.dueAt ? formatDateTime(todo.dueAt) : '未设截止时间'}</span></span></label>`).join('');
  brief.innerHTML = wordPlanItem || todoItems ? wordPlanItem + todoItems : '<div class="empty-state"><div><span class="empty-mark">✓</span>清单已经空了</div></div>';
}

function startOfWeek(offset = 0) {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + offset * 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

function renderSchedule() {
  const start = startOfWeek(weekOffset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  document.querySelector('#week-range').textContent = `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`;
  document.querySelector('#week-caption').textContent = `${data.courses.length} 门课程 · ${weekOffset === 0 ? '本周' : weekOffset > 0 ? `${weekOffset} 周后` : `${Math.abs(weekOffset)} 周前`}`;
  const today = new Date();
  const grid = document.querySelector('#week-grid');
  grid.innerHTML = weekdays.map((name, index) => {
    const date = new Date(start); date.setDate(date.getDate() + index);
    const courses = data.courses.filter(course => Number(course.weekday) === index + 1).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return `<section class="day-column ${sameDay(date, today) ? 'today' : ''}"><header class="day-head"><strong>${name}</strong><span>${date.getMonth() + 1}/${date.getDate()}</span></header>${courses.length ? courses.map(course => `<button class="course-card" data-course-id="${course.id}" style="--course-color:${course.color || '#59598f'}"><strong>${escapeHtml(course.name)}</strong><span>${course.startTime}–${course.endTime}</span><span>${escapeHtml(course.location || '地点待定')}</span></button>`).join('') : '<div class="day-empty">暂无课程</div>'}</section>`;
  }).join('');
}

function filteredTodos() {
  const today = new Date();
  if (todoFilter === 'today') return data.todos.filter(todo => todo.dueAt && sameDay(new Date(todo.dueAt), today));
  if (todoFilter === 'pending') return data.todos.filter(todo => !todo.done);
  if (todoFilter === 'done') return data.todos.filter(todo => todo.done);
  return data.todos;
}

function renderTodos() {
  const todos = filteredTodos().slice().sort((a, b) => Number(a.done) - Number(b.done) || new Date(a.dueAt || 8640000000000000) - new Date(b.dueAt || 8640000000000000));
  const wordPlan = dailyWordPlan();
  const showWordPlan = wordPlan.goal > 0 && (todoFilter === 'all' || todoFilter === 'today' || (todoFilter === 'pending' && !wordPlan.done) || (todoFilter === 'done' && wordPlan.done));
  const pendingCount = data.todos.filter(todo => !todo.done).length + (wordPlan.goal > 0 && !wordPlan.done ? 1 : 0);
  document.querySelector('#todo-count').textContent = `${pendingCount} 项未完成`;
  const list = document.querySelector('#todo-list');
  const wordPlanRow = showWordPlan ? `<div class="todo-row generated-plan ${wordPlan.done ? 'done' : ''}"><span class="todo-check generated">${wordPlan.done ? '✓' : 'Aa'}</span><div class="todo-copy"><strong>单词复习</strong><span>每日计划 · 已完成 ${wordPlan.completed}/${wordPlan.goal}</span><i class="plan-progress"><b style="width:${wordPlan.percent}%"></b></i></div><span class="priority medium">自动计划</span><button class="text-button" data-go="vocabulary">去复习</button></div>` : '';
  const todoRows = todos.map(todo => `<div class="todo-row ${todo.done ? 'done' : ''}"><input class="todo-check" type="checkbox" ${todo.done ? 'checked' : ''} data-todo-check="${todo.id}" aria-label="完成 ${escapeHtml(todo.title)}"><div class="todo-copy"><strong>${escapeHtml(todo.title)}</strong><span>${todo.dueAt ? formatDateTime(todo.dueAt) : '未设截止时间'}${todo.notified ? ' · 已提醒' : ''}</span></div><span class="priority ${todo.priority || 'medium'}">${todo.priority === 'high' ? '重要' : todo.priority === 'low' ? '稍后' : '普通'}</span><button class="delete-button" data-delete-todo="${todo.id}" title="删除">×</button></div>`).join('');
  list.innerHTML = wordPlanRow || todoRows ? wordPlanRow + todoRows : '<div class="empty-state"><div><span class="empty-mark">☁</span>这里暂时没有待办<br>把脑海里的事写下来，就不用一直记着</div></div>';
  const select = document.querySelector('#focus-task');
  const selected = select.value;
  select.innerHTML = '<option value="">不绑定待办</option>' + data.todos.filter(todo => !todo.done).map(todo => `<option value="${todo.id}">${escapeHtml(todo.title)}</option>`).join('');
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function renderPomodoro(state) {
  pomodoroState = state;
  const minutes = String(Math.floor(state.remaining / 60)).padStart(2, '0');
  const seconds = String(state.remaining % 60).padStart(2, '0');
  const display = `${minutes}:${seconds}`;
  document.querySelector('#timer-display').textContent = display;
  document.querySelector('#mini-time').textContent = display;
  const progress = state.duration ? (state.duration - state.remaining) / state.duration : 0;
  document.querySelector('#timer-ring').style.setProperty('--progress', `${Math.max(0, Math.min(1, progress)) * 360}deg`);
  document.querySelector('#mini-progress').style.width = `${progress * 100}%`;
  document.querySelector('#timer-mode').textContent = state.mode === 'focus' ? '专注时间' : '短休息';
  document.querySelector('#timer-caption').textContent = state.mode === 'focus' ? '保持专注，只做一件事' : '放松眼睛，伸展一下身体';
  document.querySelector('#mini-mode').textContent = state.running ? (state.mode === 'focus' ? '正在专注' : '正在休息') : (state.mode === 'focus' ? '准备开始一轮专注' : '给自己短暂休息');
  document.querySelector('#timer-toggle').textContent = state.running ? '暂停' : (state.mode === 'focus' ? '开始专注' : '开始休息');
  document.querySelector('#completed-pomodoros').textContent = state.completedToday || 0;
  document.querySelector('#tomato-row').innerHTML = Array.from({ length: Math.min(10, state.completedToday || 0) }, () => '<i class="tomato"></i>').join('');
}

function localDayKey(value = Date.now()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activeWordListWords() {
  const activeListId = data.english.activeWordListId || 'all';
  return data.vocabulary.filter(word => activeListId === 'all' || (word.libraryIds || ['list_default']).includes(activeListId));
}

function activeWordListReviewLog() {
  const allowedIds = new Set(activeWordListWords().map(word => word.id));
  return data.reviewLog.filter(item => allowedIds.has(item.wordId));
}

function reviewedTodayCount() {
  const today = localDayKey();
  return activeWordListReviewLog().filter(item => localDayKey(item.reviewedAt) === today).length;
}

function dailyWordPlan() {
  const goal = Math.max(0, Number(data.settings.dailyWordGoal) || 0);
  const today = localDayKey();
  const reviewedIds = new Set(activeWordListReviewLog().filter(item => localDayKey(item.reviewedAt) === today).map(item => item.wordId));
  const completed = Math.min(goal, reviewedIds.size);
  return { goal, completed, done: goal > 0 && completed >= goal, percent: goal ? Math.min(100, (completed / goal) * 100) : 0 };
}

function availableEnglishVoices() {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter(voice => String(voice.lang || '').toLowerCase().startsWith('en'));
}

function updatePronunciationStatus() {
  const status = document.querySelector('#pronunciation-status');
  if (!status) return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') {
    status.dataset.state = 'missing'; status.querySelector('span').textContent = '当前系统不支持文字转语音。'; return;
  }
  const all = window.speechSynthesis.getVoices();
  const english = availableEnglishVoices();
  if (!all.length) {
    status.dataset.state = 'loading'; status.querySelector('span').textContent = '正在读取 Windows 语音……'; return;
  }
  if (!english.length) {
    status.dataset.state = 'missing'; status.querySelector('span').textContent = '没有检测到英文语音包；词库是否为空不会影响发音。请先安装 English 文本转语音。'; return;
  }
  const locale = data?.settings?.pronunciationLocale || 'en-US';
  const selected = english.find(voice => voice.lang.toLowerCase() === locale.toLowerCase()) || english[0];
  status.dataset.state = 'ready'; status.querySelector('span').textContent = `已就绪：${selected.name}（${selected.lang}）`;
}

function speakWord(text) {
  if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') return showToast('当前系统没有可用的语音引擎');
  const voices = window.speechSynthesis.getVoices();
  const englishVoices = availableEnglishVoices();
  if (voices.length && !englishVoices.length) {
    updatePronunciationStatus();
    showToast('没有检测到英文语音包，请先在 Windows 设置中安装');
    return false;
  }
  if (!voices.length) {
    updatePronunciationStatus();
    showToast('正在读取系统语音，请稍后再试听');
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = data.settings.pronunciationLocale || 'en-US';
  utterance.rate = Math.max(0.7, Math.min(1.3, Number(data.settings.pronunciationRate) || 1));
  const locale = utterance.lang.toLowerCase();
  utterance.voice = englishVoices.find(voice => voice.lang.toLowerCase() === locale) || englishVoices[0];
  utterance.onerror = () => showToast('英文语音播放失败，请检查 Windows 语音设置');
  window.speechSynthesis.speak(utterance);
  return true;
}

function speakVocabularyWord(word) {
  return speakWord(vocabularyPronunciationText(word));
}

function vocabularyPronunciationText(word) {
  const front = String(word?.front || '').trim();
  const englishOnly = (front.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).join(' ');
  return englishOnly || front;
}

function reviewStreak() {
  const days = new Set(activeWordListReviewLog().map(item => localDayKey(item.reviewedAt)));
  let cursor = new Date();
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(localDayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function formatDue(value) {
  if (!value || VocabularyCore.isDue({ dueAt: value })) return '现在';
  const due = new Date(value);
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (diffDays <= 1) return '明天';
  if (diffDays < 7) return `${diffDays} 天后`;
  return `${due.getMonth() + 1}月${due.getDate()}日`;
}

function reviewSessionSnapshot() {
  return {
    version: 1,
    wordListId: data.english.activeWordListId || 'all',
    wordIds: [...reviewQueue],
    sessionTotal: reviewSessionTotal,
    completed: reviewCompleted,
    currentIndex: reviewSessionIndex,
    ratings: { ...reviewSessionRatings },
    seenIds: [...reviewSessionSeenIds],
    cycleSeenIds: [...reviewCycleSeenIds],
    phase: reviewPhase,
    quizQuestions: structuredClone(reviewQuizQuestions),
    quizIndex: reviewQuizIndex,
    quizCorrect: reviewQuizCorrect,
    quizAnswered: reviewQuizAnswered,
    showingAnswer: reviewShowingAnswer,
    sessionComplete: reviewSessionComplete,
    updatedAt: new Date().toISOString()
  };
}

function rememberReviewSession() {
  if (!data?.english) return;
  const snapshot = reviewSessionSnapshot();
  data.english.reviewSession = snapshot;
  try { localStorage.setItem(reviewSessionStorageKey, JSON.stringify(snapshot)); } catch { /* 本地文件仍会在下次常规保存时记录 */ }
}

function storedReviewSession() {
  const candidates = [data.english.reviewSession];
  try { candidates.push(JSON.parse(localStorage.getItem(reviewSessionStorageKey) || 'null')); } catch { /* 忽略损坏的浏览器缓存 */ }
  return candidates.filter(item => item?.version === 1).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
}

function restoreReviewSession() {
  const session = storedReviewSession();
  const activeListId = data.english.activeWordListId || 'all';
  if (!session || session.wordListId !== activeListId) return false;
  const validIds = new Set(activeWordListWords().map(word => word.id));
  const restoredQueue = (session.wordIds || []).filter(id => validIds.has(id));
  if ((session.wordIds || []).length && !restoredQueue.length) return false;
  reviewQueue = restoredQueue;
  reviewSessionTotal = restoredQueue.length;
  reviewSessionIndex = Math.max(0, Math.min(Math.max(0, restoredQueue.length - 1), Number(session.currentIndex) || 0));
  reviewSessionRatings = Object.fromEntries(Object.entries(session.ratings || {}).filter(([id]) => validIds.has(id)));
  reviewCompleted = Object.keys(reviewSessionRatings).length;
  reviewSessionSeenIds = new Set((session.seenIds || []).filter(id => validIds.has(id)));
  reviewCycleSeenIds = new Set((session.cycleSeenIds || []).filter(id => validIds.has(id)));
  reviewPhase = ['memory', 'choice', 'quiz', 'complete'].includes(session.phase) ? session.phase : 'memory';
  reviewQuizQuestions = (session.quizQuestions || []).filter(question => validIds.has(question.wordId));
  reviewQuizIndex = Math.max(0, Math.min(Math.max(0, reviewQuizQuestions.length - 1), Number(session.quizIndex) || 0));
  reviewQuizCorrect = Math.max(0, Number(session.quizCorrect) || 0);
  reviewQuizAnswered = Boolean(session.quizAnswered);
  reviewShowingAnswer = Boolean(session.showingAnswer);
  reviewSessionComplete = Boolean(session.sessionComplete);
  if (reviewPhase === 'quiz' && !reviewQuizQuestions.length) reviewPhase = restoredQueue.length ? 'choice' : 'memory';
  rememberReviewSession();
  return Boolean(restoredQueue.length || reviewCycleSeenIds.size || reviewSessionComplete);
}

function buildReviewQueue(includeAll = false) {
  const groupSize = Math.max(3, Math.min(50, Number(data.settings.reviewGroupSize) || 10));
  const words = activeWordListWords()
    .filter(word => includeAll || VocabularyCore.isDue(word))
    .filter(word => !reviewCycleSeenIds.has(word.id))
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || new Date(a.dueAt || 0) - new Date(b.dueAt || 0) || a.mastery - b.mastery)
    .slice(0, groupSize);
  reviewQueue = words.map(word => word.id);
  reviewSessionTotal = reviewQueue.length;
  reviewCompleted = 0;
  reviewSessionIndex = 0;
  reviewSessionRatings = {};
  reviewSessionSeenIds = new Set(reviewQueue.slice(0, 1));
  reviewPhase = 'memory';
  reviewQuizQuestions = [];
  reviewQuizIndex = 0;
  reviewQuizCorrect = 0;
  reviewQuizAnswered = false;
  reviewShowingAnswer = false;
  reviewSessionComplete = false;
  lastAutoSpokenWordId = null;
  rememberReviewSession();
}

function currentReviewWord() {
  const id = reviewQueue[reviewSessionIndex];
  return data.vocabulary.find(word => word.id === id);
}

function moveReviewCard(direction) {
  if (!reviewQueue.length || reviewPhase !== 'memory') return;
  if (direction > 0 && reviewSessionIndex >= reviewQueue.length - 1) { openReviewChoice(); renderReviewCard(); return; }
  reviewSessionIndex = Math.max(0, Math.min(reviewQueue.length - 1, reviewSessionIndex + direction));
  reviewSessionSeenIds.add(reviewQueue[reviewSessionIndex]);
  reviewShowingAnswer = Boolean(reviewSessionRatings[reviewQueue[reviewSessionIndex]]);
  lastAutoSpokenWordId = null;
  rememberReviewSession();
  renderReviewCard();
}

function openReviewChoice() {
  reviewPhase = 'choice'; reviewSessionComplete = true; reviewShowingAnswer = false;
  rememberReviewSession();
}

function beginNextReviewGroup() {
  reviewQueue.forEach(id => reviewCycleSeenIds.add(id)); buildReviewQueue(false); renderVocabulary();
}

function quizQuestionSet() {
  const sessionWords = reviewQueue.map(id => data.vocabulary.find(word => word.id === id)).filter(word => word?.front && word?.back);
  const pool = activeWordListWords().filter(word => word.front && word.back);
  if (sessionWords.length < 1 || pool.length < 3) return [];
  return sessionWords.flatMap((word, index) => {
    const direction = index % 2 ? 'back-to-front' : 'front-to-back';
    const answerFor = item => direction === 'front-to-back' ? item.back : item.front;
    const correct = answerFor(word); const seen = new Set([correct.trim().toLocaleLowerCase()]);
    const distractors = [];
    for (let offset = 1; offset <= pool.length * 2 && distractors.length < 2; offset += 1) {
      const candidate = pool[(pool.indexOf(word) + offset + index) % pool.length];
      if (!candidate || candidate.id === word.id) continue;
      const answer = answerFor(candidate); const key = answer.trim().toLocaleLowerCase();
      if (!answer || seen.has(key)) continue;
      seen.add(key); distractors.push(answer);
    }
    if (distractors.length < 2) return [];
    const answers = [correct, ...distractors]; const shift = index % answers.length;
    return [{ wordId: word.id, direction, prompt: direction === 'front-to-back' ? word.front : word.back, correct, options: [...answers.slice(shift), ...answers.slice(0, shift)] }];
  });
}

function startReviewQuiz() {
  reviewQuizQuestions = quizQuestionSet(); reviewQuizIndex = 0; reviewQuizCorrect = 0; reviewQuizAnswered = false;
  reviewSessionComplete = true; reviewPhase = reviewQuizQuestions.length ? 'quiz' : 'complete';
  rememberReviewSession();
}

function saveQuizHistory() {
  data.english.quizHistory ||= [];
  data.english.quizHistory.push({ id: crypto.randomUUID(), wordListId: data.english.activeWordListId || 'all', wordIds: [...reviewQueue], total: reviewQuizQuestions.length, correct: reviewQuizCorrect, completedAt: new Date().toISOString() });
  if (data.english.quizHistory.length > 2000) data.english.quizHistory = data.english.quizHistory.slice(-2000);
  addActivity('word', `完成单词小测：${reviewQuizCorrect} / ${reviewQuizQuestions.length}`, `${reviewQueue.length} 个单词的分组复习`);
}

function renderReviewQuiz() {
  const panel = document.querySelector('#review-quiz'); const memory = document.querySelector('#review-memory-panel'); const choice = document.querySelector('#review-group-choice');
  const inQuiz = reviewPhase === 'quiz' || reviewPhase === 'complete'; const inChoice = reviewPhase === 'choice'; memory.hidden = inQuiz || inChoice; panel.hidden = !inQuiz; choice.hidden = !inChoice;
  if (inChoice) {
    document.querySelector('#review-choice-count').textContent = reviewQueue.length; document.querySelector('#review-phase-label').textContent = '本组结算'; document.querySelector('#review-progress-label').textContent = `本组 ${reviewQueue.length} 个单词已看完`; document.querySelector('#review-rail-progress').style.width = '100%'; return;
  }
  if (!inQuiz) return;
  const phaseLabel = document.querySelector('#review-phase-label'); const next = document.querySelector('#review-quiz-next'); const feedback = document.querySelector('#review-quiz-feedback');
  if (reviewPhase === 'complete') {
    panel.classList.add('complete'); phaseLabel.textContent = '本组完成'; document.querySelector('#review-quiz-progress').textContent = 'DONE'; document.querySelector('#review-quiz-direction').textContent = reviewQuizQuestions.length ? '小测结果' : '本组已记录';
    document.querySelector('#review-quiz-question').textContent = reviewQuizQuestions.length ? `${reviewQuizCorrect} / ${reviewQuizQuestions.length}` : '需要至少 3 个带释义的单词才能生成三选一';
    document.querySelector('#review-quiz-options').innerHTML = ''; feedback.hidden = false; feedback.textContent = reviewQuizQuestions.length ? `正确率 ${Math.round(reviewQuizCorrect / reviewQuizQuestions.length * 100)}%，结果已保存在本机。` : '单词记忆进度已保存；补充释义或增加词汇后，下组会自动进入小测。'; next.hidden = false; next.textContent = '开始下一组';
    document.querySelector('#review-progress-label').textContent = `本组 ${reviewQueue.length} 个单词已完成`; document.querySelector('#review-rail-progress').style.width = '100%'; return;
  }
  panel.classList.remove('complete'); phaseLabel.textContent = '三选一小测'; const question = reviewQuizQuestions[reviewQuizIndex];
  document.querySelector('#review-quiz-progress').textContent = `${reviewQuizIndex + 1} / ${reviewQuizQuestions.length}`;
  document.querySelector('#review-quiz-direction').textContent = question.direction === 'front-to-back' ? '看英文，选中文' : '看中文，选英文';
  document.querySelector('#review-quiz-question').textContent = question.prompt;
  document.querySelector('#review-quiz-options').innerHTML = question.options.map((option, index) => `<button type="button" data-quiz-option="${index}" data-key="${String.fromCharCode(65 + index)}">${escapeHtml(option)}</button>`).join('');
  feedback.hidden = true; feedback.textContent = ''; next.hidden = true; next.textContent = reviewQuizIndex === reviewQuizQuestions.length - 1 ? '查看结果' : '下一题';
  document.querySelector('#review-progress-label').textContent = `小测 ${reviewQuizIndex + 1} / ${reviewQuizQuestions.length}`; document.querySelector('#review-rail-progress').style.width = `${reviewQuizIndex / Math.max(1, reviewQuizQuestions.length) * 100}%`;
}

function renderReviewCard() {
  const card = document.querySelector('#review-card');
  const reveal = document.querySelector('#review-reveal');
  const ratings = document.querySelector('#rating-row');
  const speak = document.querySelector('#review-speak');
  const favorite = document.querySelector('#review-favorite');
  const word = currentReviewWord();
  const answer = document.querySelector('#review-answer');
  renderReviewQuiz();
  if (reviewPhase !== 'memory') return;
  document.querySelector('#review-memory-panel').hidden = false;
  if (!word) {
    const activeWords = activeWordListWords();
    const cycleFinished = activeWords.length && reviewCycleSeenIds.size > 0;
    card.classList.add('empty');
    document.querySelector('#review-index').textContent = 'MEMORY · CLEAR';
    document.querySelector('#review-word').textContent = activeWords.length ? (cycleFinished ? '当前浏览批次已完成' : '今天没有到期单词') : '当前词库还是空的';
    document.querySelector('#review-hint').textContent = activeWords.length ? (cycleFinished ? '跳过测验的单词不会标记为已掌握。可以点击下方从全部词汇重新开始。' : '记忆已经保存。下一批单词会在合适的时间回来。') : '手动添加，或将书中的候选词收进这个词库。';
    answer.hidden = true;
    speak.disabled = true;
    favorite.disabled = true; favorite.textContent = '☆'; favorite.classList.remove('active');
    reveal.disabled = true;
    reveal.hidden = false;
    ratings.hidden = true;
    document.querySelector('#review-progress-label').textContent = activeWords.length ? (cycleFinished ? '当前批次已浏览完' : '本轮已完成') : '等待添加单词';
    document.querySelector('#review-phase-label').textContent = '记忆阶段';
    document.querySelector('#review-rail-progress').style.width = reviewSessionComplete ? '100%' : '0%';
    document.querySelector('#review-previous').disabled = true; document.querySelector('#review-next').disabled = true;
    return;
  }
  const alreadyRated = Boolean(reviewSessionRatings[word.id]);
  card.classList.remove('empty'); card.classList.toggle('reviewed', alreadyRated);
  speak.disabled = false;
  favorite.disabled = false; favorite.textContent = word.favorite ? '★' : '☆'; favorite.classList.toggle('active', Boolean(word.favorite)); favorite.title = word.favorite ? '取消收藏；收藏词会优先进入复习' : '收藏；收藏词会优先进入复习'; favorite.setAttribute('aria-label', word.favorite ? '取消收藏当前单词' : '收藏当前单词');
  document.querySelector('#review-index').textContent = `WORD ${reviewSessionIndex + 1} / ${reviewSessionTotal}${alreadyRated ? ' · 已记录' : ''}`;
  document.querySelector('#review-word').textContent = word.front;
  document.querySelector('#review-hint').textContent = reviewShowingAnswer ? '根据刚才回想的真实情况选择，不用追求一次记牢。' : '先在心里说出释义，再翻面确认。';
  answer.textContent = word.back || '还没有填写释义';
  answer.hidden = !reviewShowingAnswer;
  reveal.disabled = false; reveal.textContent = alreadyRated ? '查看释义' : '显示释义';
  reveal.hidden = reviewShowingAnswer;
  ratings.hidden = !reviewShowingAnswer;
  ratings.querySelectorAll('button').forEach(button => { button.disabled = alreadyRated; button.classList.toggle('selected', reviewSessionRatings[word.id] === button.dataset.rating); });
  const done = reviewCompleted;
  const total = Math.max(1, reviewSessionTotal);
  const seen = reviewSessionSeenIds.size;
  document.querySelector('#review-progress-label').textContent = `第 ${reviewSessionIndex + 1} / ${total} 个 · 已看 ${seen} 个 · 已记录 ${done} 个`;
  document.querySelector('#review-phase-label').textContent = '记忆阶段';
  document.querySelector('#review-rail-progress').style.width = `${Math.min(100, (seen / total) * 100)}%`;
  document.querySelector('#review-previous').disabled = reviewSessionIndex <= 0;
  const nextButton = document.querySelector('#review-next'); nextButton.disabled = false; nextButton.innerHTML = reviewSessionIndex >= reviewQueue.length - 1 ? '完成本组<span>→</span>' : '下一个<span>→</span>';
  if (currentPage === 'vocabulary' && data.settings.autoPronounce && lastAutoSpokenWordId !== word.id) {
    lastAutoSpokenWordId = word.id;
    setTimeout(() => speakVocabularyWord(word), 80);
  }
}

function renderVocabulary() {
  document.querySelector('#english-word-count').textContent = data.vocabulary.length;
  document.querySelector('#english-book-count').textContent = data.english.books.length;
  document.querySelector('#english-article-count').textContent = data.english.articles.length;
  document.querySelector('#english-sentence-count').textContent = data.english.sentences.length;
  document.querySelectorAll('[data-english-tab]').forEach(button => button.classList.toggle('active', button.dataset.englishTab === englishTab));
  document.querySelectorAll('[data-english-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.englishPanel === englishTab));
  renderWordListControls();
  document.querySelector('#review-group-size').value = String(data.settings.reviewGroupSize || 10);
  const activeListId = data.english.activeWordListId || 'all';
  const activeWords = data.vocabulary.filter(word => activeListId === 'all' || (word.libraryIds || ['list_default']).includes(activeListId));
  const due = activeWords.filter(word => VocabularyCore.isDue(word)).length;
  document.querySelector('#vocab-due-count').textContent = due;
  document.querySelector('#vocab-total').textContent = activeWords.length;
  document.querySelector('#vocab-reviewed-today').textContent = reviewedTodayCount();
  document.querySelector('#vocab-mastered').textContent = activeWords.filter(word => word.mastery >= 80).length;
  document.querySelector('#vocab-streak').textContent = reviewStreak();
  document.querySelector('#favorite-word-count').textContent = activeWords.filter(word => word.favorite).length;
  document.querySelector('#favorite-word-filter').setAttribute('aria-pressed', String(favoriteWordsOnly));
  if (!reviewQueue.length && !reviewSessionComplete && due) buildReviewQueue(false);
  renderReviewCard();

  const query = document.querySelector('#vocab-search').value.trim().toLocaleLowerCase();
  const words = data.vocabulary.filter(word => (activeListId === 'all' || (word.libraryIds || ['list_default']).includes(activeListId)) && (!favoriteWordsOnly || word.favorite) && (!query || `${word.front} ${word.back}`.toLocaleLowerCase().includes(query)));
  const list = document.querySelector('#vocab-list');
  list.innerHTML = words.length ? words.map(word => {
    const level = word.mastery >= 80 ? 'mastered' : word.repetitions ? 'learning' : 'new';
    const label = level === 'mastered' ? '已掌握' : level === 'learning' ? '学习中' : '新词';
    return `<div class="vocab-row"><button class="favorite-word-button ${word.favorite ? 'active' : ''}" data-favorite-word="${word.id}" title="${word.favorite ? '取消收藏' : '收藏单词'}" aria-label="${word.favorite ? '取消收藏' : '收藏单词'}">${word.favorite ? '★' : '☆'}</button><strong class="word-front-cell">${escapeHtml(word.front)}</strong><span class="word-back-cell">${escapeHtml(word.back || '未填写释义')}</span><div class="mastery-cell"><i><b style="width:${word.mastery}%"></b></i><small class="${level}">${label} · ${word.mastery}%</small></div><span class="word-due-cell">${formatDue(word.dueAt)}</span><button class="table-audio-button" data-speak-word="${word.id}" title="仅朗读英文：${escapeHtml(word.front)}" aria-label="仅朗读英文 ${escapeHtml(word.front)}">▶</button><button class="delete-button" data-delete-word="${word.id}" title="删除单词">×</button></div>`;
  }).join('') : `<div class="empty-state"><div><span class="empty-mark">Aa</span>${query ? '没有找到匹配的单词' : '导入后，单词和记忆进度会出现在这里'}</div></div>`;
  if (englishTab === 'articles') renderEnglishArticles();
  if (englishTab === 'books') renderBookShelf();
  if (englishTab === 'sentences') renderEnglishSentences();
  if (englishTab === 'ai') renderAiPackage();
}

function renderWordListControls() {
  const lists = data.english.wordLists || [];
  const options = [{ id: 'all', name: `全部词库 · ${data.vocabulary.length}` }, ...lists.map(list => ({ ...list, name: `${list.name} · ${data.vocabulary.filter(word => (word.libraryIds || ['list_default']).includes(list.id)).length}` }))];
  const selects = [document.querySelector('#word-list-filter'), document.querySelector('#learning-import-word-list'), document.querySelector('#english-word-library'), document.querySelector('#book-target-word-list')].filter(Boolean);
  selects.forEach(select => {
    const current = select.id === 'word-list-filter' ? (data.english.activeWordListId || 'all') : (select.value || (data.english.activeWordListId !== 'all' ? data.english.activeWordListId : 'list_default'));
    const source = select.id === 'word-list-filter' ? options : lists;
    select.innerHTML = source.map(list => `<option value="${list.id}">${escapeHtml(list.name)}</option>`).join('');
    select.value = source.some(item => item.id === current) ? current : source[0]?.id || '';
  });
}

async function importVocabularyText(text, sourceName, requestedListId) {
  const parsed = VocabularyCore.parseVocabularyText(text);
  const listId = requestedListId || (data.english.activeWordListId !== 'all' ? data.english.activeWordListId : 'list_default');
  const existing = new Map(data.vocabulary.map(word => [word.front.toLocaleLowerCase(), word]));
  const now = Date.now();
  let added = 0;
  let linked = 0;
  for (const entry of parsed) {
    const key = entry.front.toLocaleLowerCase();
    if (existing.has(key)) {
      const word = existing.get(key); word.libraryIds ||= ['list_default'];
      if (!word.back && entry.back) word.back = entry.back;
      if (!word.libraryIds.includes(listId)) { word.libraryIds.push(listId); linked += 1; }
      continue;
    }
    const word = VocabularyCore.normalizeWord({ ...entry, id: crypto.randomUUID(), libraryIds: [listId] }, now + added);
    data.vocabulary.push(word); existing.set(key, word);
    added += 1;
  }
  buildReviewQueue(false);
  await persist(added || linked ? `已新增 ${added} 个单词，${linked} 个加入当前词库` : '没有发现可新增的单词');
  document.querySelector('#import-result').textContent = `${sourceName || '粘贴内容'}：识别 ${parsed.length} 行，新增 ${added} 个，已有词加入当前词库 ${linked} 个。`;
  renderVocabulary();
}

function setEnglishTab(tab) {
  englishTab = ['words', 'books', 'articles', 'sentences', 'ai'].includes(tab) ? tab : 'words';
  data.english.activeTab = englishTab;
  document.querySelectorAll('[data-english-tab]').forEach(button => button.classList.toggle('active', button.dataset.englishTab === englishTab));
  document.querySelectorAll('[data-english-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.englishPanel === englishTab));
  document.querySelector('#top-add').title = englishTab === 'books' ? '导入原版书' : englishTab === 'articles' ? '收藏文章' : englishTab === 'sentences' ? '收藏句子' : englishTab === 'ai' ? '生成学习指令' : '导入单词';
  if (englishTab === 'books') renderBookShelf();
  if (englishTab === 'articles') renderEnglishArticles();
  if (englishTab === 'sentences') renderEnglishSentences();
  if (englishTab === 'ai') renderAiPackage();
}

function activeBook() {
  return data.english.books.find(book => book.id === data.english.selectedBookId);
}

function activeBookChapter(book = activeBook()) {
  if (!book) return null;
  return book.chapters.find(chapter => chapter.id === book.selectedChapterId) || book.chapters[0] || null;
}

const bookStopWords = new Set(`about above after again against almost along already also although always among another any are because become been before being below between both but came can cannot could did does doing done down during each either else enough especially even ever every few first for from further get gets getting give given had has have having here herself him himself his how however into its itself just know last least less like likely made make many may might more most much must near need neither never next not now often once one only other our ours ourselves out over own perhaps rather really same second several she should since some still such take than that the their theirs them themselves then there therefore these they thing think this those through too toward under until upon use used using very was were what when where whether which while who whom whose why will with within without would you your yours yourself yourselves`.split(/\s+/));

function analyzeChapterVocabulary(chapter) {
  if (!chapter?.text) return [];
  const known = new Set(data.vocabulary.map(word => word.front.toLocaleLowerCase())); const counts = new Map(); const samples = new Map();
  const source = chapter.text; const tokens = source.match(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g) || [];
  tokens.forEach(token => {
    const word = token.toLocaleLowerCase().replace(/[’']/g, "'");
    if (word.length < 4 || word.length > 32 || bookStopWords.has(word) || known.has(word) || /^(?:chapter|copyright|contents|edition|published)$/.test(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
    if (!samples.has(word)) samples.set(word, sentenceAround(source, token));
  });
  return [...counts.entries()].map(([word, count]) => ({ word, count, context: samples.get(word) || '', selected: count >= 2 || word.length >= 8 })).sort((a, b) => (b.count * 2 + Math.min(b.word.length, 12)) - (a.count * 2 + Math.min(a.word.length, 12))).slice(0, 80);
}

function renderBookCandidates(chapter) {
  const candidates = chapter?.wordCandidates || [];
  document.querySelector('#book-candidate-count').textContent = candidates.length;
  document.querySelector('#book-word-candidates').innerHTML = candidates.length ? candidates.map(candidate => `<label class="book-word-candidate"><input type="checkbox" data-book-candidate="${escapeHtml(candidate.word)}" ${candidate.selected ? 'checked' : ''}><span><strong>${escapeHtml(candidate.word)}</strong><small>${escapeHtml(candidate.context || '等待生成语境')}</small></span><em>×${candidate.count}</em></label>`).join('') : '<div class="empty-state"><div>点击“分析本章”<br>筛出尚未收藏的候选词</div></div>';
}

function renderBookShelf() {
  const books = data.english.books || []; const query = document.querySelector('#book-search').value.trim().toLocaleLowerCase();
  const linkedFolder = data.settings.localBookFolder || '';
  document.querySelector('#local-shelf-link').dataset.state = linkedFolder ? 'linked' : 'empty';
  document.querySelector('#local-shelf-path').textContent = linkedFolder ? `正在监看：${linkedFolder}` : '关联后，新放入该文件夹的书会自动出现在这里；源文件不会被移动或删除。';
  document.querySelector('#sync-local-books').disabled = !linkedFolder;
  const filtered = books.filter(book => !query || `${book.title} ${book.author || ''} ${book.originalName || ''}`.toLocaleLowerCase().includes(query));
  if (!activeBook() && books.length) data.english.selectedBookId = books[0].id;
  const accents = ['#526457', '#9a6847', '#6e6685', '#8c5e59', '#55727a'];
  document.querySelector('#book-list').innerHTML = filtered.length ? filtered.map((book, index) => `<button class="book-list-item ${book.id === data.english.selectedBookId ? 'active' : ''}" data-book-id="${book.id}" type="button" style="--book-accent:${accents[index % accents.length]}"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author || book.originalName || '未知作者')}</small><em>${escapeHtml(book.format || 'BOOK')} · ${book.conversionRequired ? '等待转换' : `${book.chapters.length} 章`} · ${Math.round(book.progress || 0)}%</em></button>`).join('') : '<div class="empty-state"><div><span class="empty-mark">▥</span>还没有原版书<br>直接把文件拖到上方</div></div>';
  const book = activeBook(); const empty = document.querySelector('#book-reader-empty'); const content = document.querySelector('#book-reader-content');
  empty.hidden = Boolean(book); content.hidden = !book; if (!book) return;
  const chapter = activeBookChapter(book); document.querySelector('#book-reader-title').textContent = book.title;
  document.querySelector('#book-reader-meta').textContent = [book.author, book.format, book.pageCount ? `${book.pageCount} 页` : '', `${book.chapters.length} 章`].filter(Boolean).join(' · ');
  document.querySelector('#book-reading-progress').textContent = `${Math.round(book.progress || 0)}%`;
  document.querySelector('#book-chapter-list').innerHTML = book.chapters.length ? book.chapters.map((item, index) => `<button class="${item.id === chapter?.id ? 'active' : ''}" data-book-chapter="${item.id}" type="button">${String(index + 1).padStart(2, '0')} · ${escapeHtml(item.title)}</button>`).join('') : `<div class="empty-state"><div>${escapeHtml(book.conversionHint || book.warning || '没有可阅读章节')}</div></div>`;
  document.querySelector('#book-current-chapter').textContent = chapter?.title || (book.conversionRequired ? '等待格式转换' : '未识别章节');
  const text = document.querySelector('#book-chapter-text'); text.style.setProperty('--reader-font-size', `${bookReaderFontSize}px`);
  text.innerHTML = chapter ? renderAnnotatedText(chapter.text) : escapeHtml(book.conversionHint || book.warning || '没有提取到正文。');
  renderWordListControls(); renderBookCandidates(chapter);
}

function bookVocabularyPrompt() {
  const book = activeBook(); const chapter = activeBookChapter(book); if (!book || !chapter) return '';
  const candidates = (chapter.wordCandidates || []).filter(item => item.selected); const words = candidates.map(item => `${item.word}（出现 ${item.count} 次；语境：${item.context}）`).join('\n');
  return `你是一名具备母语级英语能力的专业语言导师。请从原版书章节中校对并讲解我筛出的候选词。\n\n书名：${book.title}\n章节：${chapter.title}\n\n候选词：\n${words || '尚未选择候选词'}\n\n章节节选：\n${chapter.text.slice(0, 7000)}\n\n请为每个真正值得学习的词提供：\n1. 词元与词性；\n2. 当前语境中的准确中文释义；\n3. 原句中的作用；\n4. 常见搭配与语域；\n5. 一个自然的新例句；\n6. 是否建议加入词库以及理由。\n\n词义体系优先参考 Oxford Learner’s Dictionaries；无法核实时必须明确说明，不得编造。过滤人名、地名、排版残片和过于基础的词。最后输出可复制的 TSV：单词[TAB]中文释义。`;
}

function englishArticleById(id = data.english.selectedArticleId) {
  return data.english.articles.find(article => article.id === id);
}

function renderAnnotatedText(text) {
  const saved = new Set(data.vocabulary.map(word => word.front.toLocaleLowerCase()));
  return String(text || '').split(/([A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*)/g).map(part => {
    if (!/^[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*$/.test(part)) return escapeHtml(part);
    return `<button class="article-token ${saved.has(part.toLocaleLowerCase()) ? 'saved' : ''}" data-article-word="${escapeHtml(part)}" type="button">${escapeHtml(part)}</button>`;
  }).join('');
}

function sentenceAround(text, term) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const index = source.toLocaleLowerCase().indexOf(String(term || '').toLocaleLowerCase());
  if (index < 0) return source.slice(0, 280);
  const leftStops = [...source.slice(0, index).matchAll(/[.!?]\s+/g)];
  const start = leftStops.length ? leftStops[leftStops.length - 1].index + leftStops[leftStops.length - 1][0].length : Math.max(0, index - 120);
  const right = source.slice(index + term.length);
  const stop = right.search(/[.!?](?:\s|$)/);
  const end = stop >= 0 ? index + term.length + stop + 1 : Math.min(source.length, index + term.length + 180);
  return source.slice(start, end).trim();
}

function renderEnglishArticles() {
  const query = document.querySelector('#article-search').value.trim().toLocaleLowerCase();
  const articles = data.english.articles.filter(article => !query || `${article.title} ${article.source} ${(article.tags || []).join(' ')} ${article.note}`.toLocaleLowerCase().includes(query));
  if (!englishArticleById() && data.english.articles.length) data.english.selectedArticleId = data.english.articles[0].id;
  document.querySelector('#article-list').innerHTML = articles.length ? articles.map(article => {
    const readingSet = englishReadingSetForArticle(article); const source = article.source || article.originalName || (article.url ? '网页收藏' : '粘贴内容');
    return `<button class="article-list-item ${article.id === data.english.selectedArticleId ? 'active' : ''}" data-article-id="${article.id}" type="button"><strong>${escapeHtml(article.title)}</strong><small>${escapeHtml(source)}${readingSet ? ` · ${readingSet.questions.length} 道阅读题` : ''}</small><div class="tag-row">${(article.tags || []).slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div></button>`;
  }).join('') : `<div class="empty-state"><div><span class="empty-mark">Aa</span>${query ? '没有找到匹配的学习材料' : '还没有学习材料<br>从网址、文档或片段开始'}</div></div>`;
  const article = englishArticleById();
  const empty = document.querySelector('#reading-empty');
  const content = document.querySelector('#reading-content');
  empty.hidden = Boolean(article); content.hidden = !article;
  if (!article) return;
  document.querySelector('#reading-title').textContent = article.title;
  document.querySelector('#reading-source').textContent = article.source ? `SAVED FROM / ${article.source}` : 'SAVED READING / 阅读收藏';
  document.querySelector('#reading-meta').innerHTML = [...new Set([article.level, ...(article.tags || [])].filter(Boolean))].map(item => `<span>${escapeHtml(item)}</span>`).join('');
  document.querySelector('#reading-note').textContent = article.note || '';
  const body = document.querySelector('#article-body');
  body.classList.toggle('no-copy', !article.body);
  body.innerHTML = article.body ? renderAnnotatedText(article.body) : article.relativePath ? '这份本地材料还没有可用正文。可以打开原文件阅读；如果是扫描页，请截图后通过“导入学习材料”进行图片识别。' : '这篇收藏只有网址，还没有保存正文。点击“打开原网页”阅读；也可以编辑收藏并粘贴想要标注的片段。';
  const sourceButton = document.querySelector('#open-article-source');
  sourceButton.hidden = !article.url && !article.relativePath;
  sourceButton.textContent = article.relativePath ? '打开原文件' : '打开原网页';
  renderEnglishReadingSet(article);
}

function englishReadingSetForArticle(article) {
  return data.english.readingSets?.find(set => set.id === article?.readingSetId || set.articleId === article?.id);
}

function renderEnglishReadingSet(article) {
  const set = englishReadingSetForArticle(article); const panel = document.querySelector('#english-reading-question-panel'); const layout = document.querySelector('.english-reading-set-layout');
  panel.hidden = !set?.questions?.length; layout.classList.toggle('has-questions', Boolean(set?.questions?.length));
  if (!set?.questions?.length) return;
  selectedEnglishQuestionIndex = Math.max(0, Math.min(selectedEnglishQuestionIndex, set.questions.length - 1));
  const question = set.questions[selectedEnglishQuestionIndex];
  document.querySelector('#english-reading-set-type').textContent = MaterialParser.typeLabel(set.materialType);
  document.querySelector('#english-reading-progress').textContent = `${selectedEnglishQuestionIndex + 1} / ${set.questions.length}`;
  document.querySelector('#english-question-nav').innerHTML = set.questions.map((item, index) => `<button class="${index === selectedEnglishQuestionIndex ? 'active' : ''} ${item.checked ? 'done' : ''}" data-english-reading-question="${index}" type="button">${index + 1}</button>`).join('');
  const options = Array.isArray(question.options) ? question.options : parseStructureOptions(question.options || '');
  document.querySelector('#english-reading-question').innerHTML = `<h4>${selectedEnglishQuestionIndex + 1}. ${escapeHtml(question.stem || 'Question')}</h4>${options.length ? `<div class="reading-option-list">${options.map(option => `<button type="button" class="${answerClass({ ...question, answerChecked: question.checked }, option.key)}" data-english-reading-option="${escapeHtml(option.key)}"><b>${escapeHtml(option.key)}</b><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>` : `<textarea class="subjective-answer" data-english-subjective-answer placeholder="Write your answer here…">${escapeHtml(question.userAnswer || '')}</textarea>`}<div class="question-check-row"><button class="button primary" id="check-english-reading-answer" type="button">核对答案</button><button class="button ghost" id="speak-english-question" type="button">朗读题目</button></div>${question.checked ? `<div class="question-feedback ${question.correct ? 'correct' : 'wrong'}"><strong>${question.correct ? 'Correct' : 'Try again'}</strong><br>Answer: ${escapeHtml(question.answer || 'Not provided')}${question.explanation ? `<br>${escapeHtml(question.explanation)}` : ''}</div>` : ''}`;
}

function openEnglishArticleDialog(article) {
  document.querySelector('#english-article-dialog-title').textContent = article ? '编辑文章收藏' : '收藏文章';
  document.querySelector('#english-article-id').value = article?.id || '';
  document.querySelector('#english-article-title').value = article?.title || '';
  document.querySelector('#english-article-source').value = article?.source || '';
  document.querySelector('#english-article-url').value = article?.url || '';
  document.querySelector('#english-article-body').value = article?.body || '';
  document.querySelector('#english-article-tags').value = (article?.tags || []).join(', ');
  document.querySelector('#english-article-level').value = article?.level || '';
  document.querySelector('#english-article-note').value = article?.note || '';
  document.querySelector('#english-article-dialog').showModal();
}

function openEnglishSentenceDialog(sentence = {}, selectedText = '', article = null) {
  const editing = Boolean(sentence.id);
  document.querySelector('#english-sentence-dialog-title').textContent = editing ? '编辑句子卡片' : '收藏句子';
  document.querySelector('#english-sentence-id').value = sentence.id || '';
  document.querySelector('#english-sentence-article-id').value = sentence.articleId || article?.id || '';
  document.querySelector('#english-sentence-text').value = sentence.text || selectedText || '';
  document.querySelector('#english-sentence-translation').value = sentence.translation || '';
  document.querySelector('#english-sentence-source').value = sentence.source || article?.title || '';
  document.querySelector('#english-sentence-tags').value = (sentence.tags || []).join(', ');
  document.querySelector('#english-sentence-note').value = sentence.note || '';
  document.querySelector('#delete-english-sentence').classList.toggle('hidden', !editing);
  document.querySelector('#english-sentence-dialog').showModal();
}

function openEnglishWordDialog(wordValue, article = null, context = '') {
  const cleanWord = String(wordValue || '').trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (!cleanWord) return showToast('没有识别到英文单词或短语');
  const existing = data.vocabulary.find(word => word.front.toLocaleLowerCase() === cleanWord.toLocaleLowerCase());
  document.querySelector('#english-word-title').textContent = cleanWord;
  document.querySelector('#manual-word-field').classList.add('hidden');
  document.querySelector('#english-word-manual').value = '';
  document.querySelector('#english-word-value').value = cleanWord;
  document.querySelector('#english-word-article-id').value = article?.id || '';
  document.querySelector('#english-word-context').textContent = context || article?.title || '单独收藏的词汇';
  document.querySelector('#english-word-meaning').value = existing?.back || '';
  document.querySelector('#english-word-tags').value = (existing?.tags || []).join(', ');
  document.querySelector('#english-word-reason').value = existing?.reason || '';
  renderWordListControls();
  const preferredList = data.english.activeWordListId !== 'all' ? data.english.activeWordListId : (existing?.libraryIds?.[0] || 'list_default');
  document.querySelector('#english-word-library').value = preferredList;
  document.querySelector('#save-english-word').textContent = existing ? '更新词条并追加例句' : '加入词库';
  document.querySelector('#english-word-dialog').showModal();
}

function openManualWordDialog() {
  document.querySelector('#english-word-title').textContent = '添加新词'; document.querySelector('#english-word-value').value = '';
  document.querySelector('#english-word-article-id').value = ''; document.querySelector('#english-word-context').textContent = '手动加入自定义词库';
  document.querySelector('#english-word-meaning').value = ''; document.querySelector('#english-word-tags').value = ''; document.querySelector('#english-word-reason').value = '';
  document.querySelector('#manual-word-field').classList.remove('hidden'); document.querySelector('#english-word-manual').value = '';
  renderWordListControls(); document.querySelector('#english-word-library').value = data.english.activeWordListId !== 'all' ? data.english.activeWordListId : 'list_default';
  document.querySelector('#save-english-word').textContent = '加入词库'; document.querySelector('#english-word-dialog').showModal();
  setTimeout(() => document.querySelector('#english-word-manual').focus(), 0);
}

function renderEnglishSentences() {
  const query = document.querySelector('#sentence-search').value.trim().toLocaleLowerCase();
  const sentences = data.english.sentences.filter(sentence => !query || `${sentence.text} ${sentence.translation} ${sentence.source} ${sentence.note} ${(sentence.tags || []).join(' ')}`.toLocaleLowerCase().includes(query));
  document.querySelector('#sentence-filter-summary').textContent = `${sentences.length} 张卡片`;
  document.querySelector('#sentence-list').innerHTML = sentences.length ? sentences.map(sentence => `<article class="sentence-card"><div class="tag-row">${(sentence.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div><p class="sentence-text">${escapeHtml(sentence.text)}</p><p class="sentence-translation">${escapeHtml(sentence.translation || '还没有填写中文理解')}</p>${sentence.note ? `<div class="sentence-reason">${escapeHtml(sentence.note)}</div>` : ''}<div class="sentence-foot"><span class="sentence-source">${escapeHtml(sentence.source || '单独收藏')}</span><div class="sentence-actions"><button data-speak-sentence="${sentence.id}" title="朗读">▶</button><button data-edit-sentence="${sentence.id}" title="编辑">✎</button></div></div></article>`).join('') : `<article class="surface empty-state"><div><span class="empty-mark">“</span>${query ? '没有找到匹配的句子' : '还没有句子卡片<br>可以手动收藏，也可以从文章中选取'}</div></article>`;
}

function aiMaterials() {
  return [
    ...data.english.articles.map(item => ({ id: `article:${item.id}`, kind: '文章', title: item.title, item })),
    ...data.english.sentences.map(item => ({ id: `sentence:${item.id}`, kind: '句子', title: item.text, item })),
    ...data.vocabulary.map(item => ({ id: `word:${item.id}`, kind: '单词', title: item.front, item }))
  ];
}

function selectedAiMaterialIds() {
  return [...document.querySelectorAll('[data-ai-material]:checked')].map(input => input.value);
}

function buildAiPrompt() {
  const selectedIds = new Set(selectedAiMaterialIds());
  const selected = aiMaterials().filter(material => selectedIds.has(material.id));
  const goals = [...document.querySelectorAll('#ai-goals input:checked')].map(input => input.value);
  const depth = document.querySelector('#ai-prompt-depth').value;
  const depthText = depth === 'brief' ? '简洁讲解：只保留关键结论，但不能牺牲准确性。' : depth === 'academic' ? '学术分析：深入讨论语域、论证方式、细微语义差异与可迁移的写作方法。' : '标准精读：解释充分、层次清楚，并兼顾理解与实际运用。';
  const articles = selected.filter(x => x.kind === '文章').map(({ item }) => {
    const set = englishReadingSetForArticle(item);
    const questions = set?.questions?.length ? `\n阅读题：\n${set.questions.map((question, index) => `${index + 1}. ${question.stem}\n选项：${structureOptionsText(question.options)}\n参考答案：${question.answer || '未填写'}`).join('\n')}` : '';
    return `### ${item.title}\n来源：${item.source || item.url || '未填写'}\n收藏原因：${item.note || '未填写'}\n标签：${(item.tags || []).join('、') || '无'}\n正文：\n${(item.body || '[只收藏了网址，未保存正文]').slice(0, 8000)}${questions}`;
  }).join('\n\n');
  const sentences = selected.filter(x => x.kind === '句子').map(({ item }, index) => `${index + 1}. ${item.text}\n   中文理解：${item.translation || '未填写'}\n   来源：${item.source || '未填写'}\n   收藏原因：${item.note || '未填写'}`).join('\n');
  const words = selected.filter(x => x.kind === '单词').map(({ item }, index) => `${index + 1}. ${item.front}${item.back ? ` — ${item.back}` : ''}\n   标签：${(item.tags || []).join('、') || '无'}\n   收藏原因：${item.reason || '未填写'}\n   语境：${(item.contexts || []).slice(-2).map(context => context.text).filter(Boolean).join(' / ') || '未保存'}`).join('\n');
  return `你是一名具备母语级英语能力的专业语言导师。请根据我提供的文章、重点句子、词汇和学习备注，帮助我进行系统、严谨的英语学习。

教学原则：
- 主要使用中文讲解，英文例句必须自然、地道，并提供必要的中文解释。
- 词义、搭配、语域和用法优先依据 Oxford Learner’s Dictionaries（牛津学习者词典）的释义体系。
- 如果无法核实牛津词典中的具体内容，请明确说明“当前无法核实”，不得编造词典释义、例句或出处。
- 注意区分英式英语与美式英语，并标注正式、非正式、口语、书面语或学术语境。
- 保持学术严谨，不要为了简化而给出不准确的结论。
- 根据文章语境解释词义，不要只罗列脱离上下文的中文翻译。
- 本次讲解深度：${depthText}
- 本次学习目标：${goals.join('、') || '综合学习'}。

请按以下顺序教学：
1. 用中文准确概括文章的核心内容、主要观点和逻辑结构。
2. 拆解重点句子的语法结构，包括句子主干、从句、修饰关系和特殊表达。
3. 解释重点词汇在当前语境中的含义、词性、常见搭配、语域和使用限制。
4. 为每个重点词汇给出三个自然的新例句，尽量覆盖不同语境，并附中文翻译。
5. 根据本次文章和重点表达，为我设计两道仿写题。不要立即公布参考答案。
6. 在给出仿写题后停止讲解，等待我回答。
7. 收到我的回答后，逐句纠正语法、用词和表达问题，说明修改原因，并提供：最小改动版本、自然的母语表达版本，以及适用时更正式或学术的表达版本。
8. 最后总结我本次最需要复习的词汇、语法和表达习惯。

【收藏文章】
${articles || '本次未选择文章'}

【收藏的重点句子】
${sentences || '本次未选择句子'}

【重点词汇与短语】
${words || '本次未选择词汇'}
`;
}

function updateAiPromptPreview() {
  const prompt = buildAiPrompt();
  document.querySelector('#ai-prompt-preview').value = prompt;
  document.querySelector('#ai-prompt-length').textContent = `${prompt.length} 字`;
  document.querySelector('#ai-selected-count').textContent = selectedAiMaterialIds().length;
}

function renderAiPackage() {
  const materials = aiMaterials();
  document.querySelector('#ai-material-list').innerHTML = materials.length ? materials.map((material, index) => `<label class="ai-material-row"><input type="checkbox" data-ai-material value="${material.id}" ${index < 6 ? 'checked' : ''}><b>${material.kind}</b><span>${escapeHtml(material.title)}</span></label>`).join('') : '<div class="empty-state"><div>先收藏文章、句子或单词</div></div>';
  document.querySelector('#ai-website-url').value = data.english.aiWebsiteUrl || 'https://chat.deepseek.com';
  document.querySelector('#ai-prompt-depth').value = data.english.promptDepth || 'standard';
  updateAiPromptPreview();
}

function learningFileLabel(item) {
  if (item.url && !item.relativePath) return 'WEB';
  if (item.parseKind === 'image') return 'IMG';
  return String(item.extension || item.parseKind || 'TEXT').slice(0, 5).toUpperCase();
}

function learningDestinationDomain(destination = document.querySelector('#learning-import-destination')?.value || 'englishArticle') {
  return destination.startsWith('exam') ? 'exam' : 'english';
}

function analyzeLearningItemStructure(item, force = false) {
  if (!item?.text?.trim()) return null;
  const domain = learningDestinationDomain();
  if (!force && item.structure && item.structure.domain === domain) return item.structure;
  item.structure = MaterialParser.analyze(item.text, { domain });
  item.structure.groupTitle = item.title || item.name || item.structure.typeLabel;
  item.structure.questions = item.structure.questions.map(question => ({ id: question.id || crypto.randomUUID(), ...question }));
  return item.structure;
}

function structureOptionsText(options) {
  return (options || []).map(option => `${option.key}. ${option.text}`).join('\n');
}

function parseStructureOptions(value) {
  return String(value || '').split(/\n+/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const match = line.match(/^([A-HＡ-Ｈ])\s*[.．、:：)）]?\s*(.*)$/i);
    const rawKey = match?.[1] || String.fromCharCode(65 + index);
    const key = rawKey.charCodeAt(0) > 127 ? String.fromCharCode(rawKey.charCodeAt(0) - 65248) : rawKey.toUpperCase();
    return { key, text: (match?.[2] || line).trim() };
  });
}

function syncStructureReview() {
  const item = activeLearningImportItem(); if (!item?.structure || document.querySelector('#structure-review-result').hidden) return;
  item.structure.groupTitle = document.querySelector('#structure-group-title').value.trim() || item.title || item.name;
  item.structure.materialType = document.querySelector('#structure-material-type').value;
  item.structure.typeLabel = MaterialParser.typeLabel(item.structure.materialType);
  item.structure.passage = document.querySelector('#structure-passage').value.trim();
  document.querySelectorAll('[data-structure-question]').forEach((card, index) => {
    const question = item.structure.questions.find(entry => entry.id === card.dataset.structureQuestion); if (!question) return;
    question.number = index + 1; question.type = card.querySelector('[data-structure-type]').value;
    question.stem = card.querySelector('[data-structure-stem]').value.trim();
    question.options = parseStructureOptions(card.querySelector('[data-structure-options]').value);
    question.answer = card.querySelector('[data-structure-answer]').value.trim().toUpperCase();
  });
}

function renderStructureReview(item) {
  const panel = document.querySelector('#structure-review-panel');
  const destination = document.querySelector('#learning-import-destination').value;
  const supportsStructure = ['englishArticle', 'examQuestion', 'examMistake', 'examResource'].includes(destination);
  panel.hidden = !supportsStructure;
  if (!supportsStructure || !item) return;
  const structure = analyzeLearningItemStructure(item);
  const empty = document.querySelector('#structure-review-empty'); const result = document.querySelector('#structure-review-result');
  empty.hidden = Boolean(structure); result.hidden = !structure;
  if (!structure) return;
  document.querySelector('#structure-type-badge').textContent = structure.typeLabel;
  document.querySelector('#structure-confidence').textContent = `${structure.confidence}%`;
  document.querySelector('#structure-warning').textContent = structure.warnings.join('；') || '结构稳定，仍建议核对答案';
  document.querySelector('#structure-group-title').value = structure.groupTitle || item.title || item.name || '';
  const typeSelect = document.querySelector('#structure-material-type');
  if ([...typeSelect.options].some(option => option.value === structure.materialType)) typeSelect.value = structure.materialType;
  document.querySelector('#structure-passage').value = structure.passage || '';
  document.querySelector('#structure-question-count').textContent = `${structure.questions.length} 道`;
  document.querySelector('#structure-question-list').innerHTML = structure.questions.length ? structure.questions.map((question, index) => `<article class="structure-question-card" data-structure-question="${question.id}"><header><span>${index + 1}</span><select data-structure-type aria-label="题型"><option value="single" ${question.type === 'single' ? 'selected' : ''}>单选题</option><option value="multiple" ${question.type === 'multiple' ? 'selected' : ''}>多选题</option><option value="judge" ${question.type === 'judge' ? 'selected' : ''}>判断题</option><option value="subjective" ${question.type === 'subjective' ? 'selected' : ''}>主观题</option></select></header><button class="remove-structure-question" data-remove-structure-question="${question.id}" type="button" title="移除子题">×</button><textarea data-structure-stem aria-label="题干" placeholder="题干">${escapeHtml(question.stem || '')}</textarea><div class="structure-question-fields"><textarea data-structure-options aria-label="选项" placeholder="A. 选项一&#10;B. 选项二">${escapeHtml(structureOptionsText(question.options))}</textarea><input data-structure-answer aria-label="答案" value="${escapeHtml(question.answer || '')}" placeholder="答案"></div></article>`).join('') : '<div class="empty-state"><div>没有识别到子题；可以作为普通材料保存，或手动添加子题。</div></div>';
}

function createLearningQueueItem(file = {}) {
  const baseName = String(file.name || file.title || '未命名材料').replace(/\.[^.]+$/, '');
  const item = {
    queueId: crypto.randomUUID(), title: file.title || baseName, source: file.source || file.byline || '',
    tags: Array.isArray(file.tags) ? file.tags : [], note: file.note || '', text: file.text || '', url: file.url || '',
    status: file.error ? 'error' : file.needsOcr ? 'pending' : 'ready', error: file.error || '', warning: file.warning || '',
    ...file
  };
  return item;
}

function activeLearningImportItem() { return learningImportQueue.find(item => item.queueId === activeLearningImportId); }

function syncLearningImportEditor() {
  const item = activeLearningImportItem();
  if (!item || document.querySelector('.import-editor-fields').hidden) return;
  syncStructureReview();
  item.title = document.querySelector('#learning-item-title').value.trim() || item.title;
  item.source = document.querySelector('#learning-item-source').value.trim();
  item.tags = parseTags(document.querySelector('#learning-item-tags').value);
  item.note = document.querySelector('#learning-item-note').value.trim();
  item.text = document.querySelector('#learning-item-text').value;
  if (item.text.trim() && item.status !== 'error') item.status = 'ready';
}

function updateLearningDestinationUi() {
  const destination = document.querySelector('#learning-import-destination').value;
  document.querySelector('#learning-word-list-field').hidden = destination !== 'englishWords';
  const label = destination === 'englishArticle' ? '归档为学习资料' : destination === 'englishWords' ? '导入目标词库' : destination === 'englishSentences' ? '生成句子卡片' : destination === 'examResource' ? '存入考公资料库' : destination === 'examQuestion' ? '放入题库待整理' : '放入错题待整理';
  document.querySelector('#archive-learning-import').textContent = label;
}

function renderLearningImportQueue() {
  renderWordListControls(); updateLearningDestinationUi();
  const list = document.querySelector('#learning-import-list');
  list.innerHTML = learningImportQueue.length ? learningImportQueue.map(item => `<button type="button" class="learning-import-row ${item.queueId === activeLearningImportId ? 'active' : ''}" data-learning-item="${item.queueId}"><i>${learningFileLabel(item)}</i><span><strong>${escapeHtml(item.title || item.name)}</strong><small>${escapeHtml(item.error || item.warning || (item.text ? `已提取 ${item.text.length} 字` : item.needsOcr ? '等待图片识别' : '等待校对'))}</small></span><em class="${item.status}"></em></button>`).join('') : '<div class="empty-state"><div><span class="empty-mark">⇣</span>拖入文件、解析网页或粘贴内容</div></div>';
  const item = activeLearningImportItem();
  document.querySelector('.import-editor-empty').hidden = Boolean(item);
  const fields = document.querySelector('.import-editor-fields'); fields.hidden = !item;
  if (item) {
    document.querySelector('#learning-item-title').value = item.title || item.name || '';
    document.querySelector('#learning-item-source').value = item.source || item.url || '';
    document.querySelector('#learning-item-tags').value = (item.tags || []).join(', ');
    document.querySelector('#learning-item-note').value = item.note || '';
    document.querySelector('#learning-item-text').value = item.text || '';
    document.querySelector('#learning-item-status').textContent = item.error || item.warning || (item.needsOcr && !item.text ? '图片尚未识别' : `正文 ${String(item.text || '').length} 字`);
    document.querySelector('#learning-open-file').hidden = !item.relativePath;
    const ocrButton = document.querySelector('#learning-run-ocr');
    ocrButton.hidden = item.parseKind !== 'image' && !(item.parseKind === 'pdf' && item.needsOcr);
    ocrButton.textContent = item.parseKind === 'pdf' ? '打开 PDF 后截取页面' : '裁剪并识别图片';
  }
  renderStructureReview(item);
  const pending = learningImportQueue.filter(item => item.status === 'pending').length;
  const errors = learningImportQueue.filter(item => item.status === 'error').length;
  document.querySelector('#learning-import-summary').textContent = learningImportQueue.length ? `${learningImportQueue.length} 项材料 · ${pending} 项待识别${errors ? ` · ${errors} 项读取失败` : ''}` : '还没有待整理材料';
}

function openLearningImport(destination = 'englishArticle') {
  document.querySelector('#learning-import-destination').value = destination;
  renderLearningImportQueue();
  document.querySelector('#learning-import-dialog').showModal();
}

function addLearningFiles(files) {
  if (!files?.length) return showToast('没有找到可导入的文件');
  const items = files.map(createLearningQueueItem);
  learningImportQueue.push(...items);
  activeLearningImportId = items[0]?.queueId || activeLearningImportId;
  items.forEach(item => analyzeLearningItemStructure(item));
  renderLearningImportQueue();
}

async function chooseLearningFiles() {
  const files = await window.companion.chooseLearningFiles(learningImportSection()); addLearningFiles(files);
}

function learningImportSection() {
  return document.querySelector('#learning-import-destination').value.startsWith('exam') ? 'exam' : 'english';
}

function filesFromDrop(source) {
  const direct = [...(source?.files || source || [])];
  const fromItems = [...(source?.items || [])].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  const unique = new Map([...direct, ...fromItems].map(file => [`${file.name}|${file.size}|${file.lastModified}`, file]));
  return [...unique.values()];
}

function textPathsFromDrop(dataTransfer) {
  if (!dataTransfer?.getData) return [];
  const lines = [`${dataTransfer.getData('text/uri-list') || ''}\n${dataTransfer.getData('text/plain') || ''}`].flatMap(value => value.split(/\r?\n/)).map(value => value.trim()).filter(value => value && !value.startsWith('#'));
  return lines.flatMap(value => {
    if (/^[a-zA-Z]:[\\/]/.test(value)) return [value];
    if (!/^file:/i.test(value)) return [];
    try {
      let filePath = decodeURIComponent(new URL(value).pathname);
      if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1);
      return [filePath.replaceAll('/', '\\')];
    } catch { return []; }
  });
}

async function virtualFilePayloads(files) {
  const payloads = []; let total = 0;
  for (const file of files.slice(0, 30)) {
    if (!file.size || file.size > 100 * 1024 * 1024 || total + file.size > 300 * 1024 * 1024) continue;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length) continue;
      total += bytes.length;
      payloads.push({ name: file.name || '微信文件', type: file.type || '', lastModified: file.lastModified || 0, bytes });
    } catch { /* 微信没有向 Chromium 暴露文件内容时会落到明确提示 */ }
  }
  return payloads;
}

async function importDroppedLearningFiles(source) {
  const files = filesFromDrop(source);
  const paths = files.map(file => { try { return window.companion.getPathForFile(file); } catch { return ''; } });
  const diskPaths = [...new Set([...paths.filter(Boolean), ...textPathsFromDrop(source)])];
  let importedCount = 0;
  if (diskPaths.length) {
    const imported = await window.companion.importDroppedLearningFiles(diskPaths, learningImportSection());
    importedCount += imported.length; if (imported.length) addLearningFiles(imported);
  }
  const pathlessFiles = files.filter((file, index) => !paths[index]);
  if (pathlessFiles.length) {
    showToast('正在读取微信拖入的文件…');
    const imported = await window.companion.importDroppedLearningFileData(await virtualFilePayloads(pathlessFiles), learningImportSection());
    importedCount += imported.length; if (imported.length) addLearningFiles(imported);
  }
  if (!importedCount) showToast(files.length ? '微信没有提供可读取的文件内容；请先点开下载一次，再直接拖入' : '没有检测到文件；可先在微信中下载，或使用“选择文件”');
  return importedCount;
}

async function importDroppedBookFiles(source) {
  const files = filesFromDrop(source);
  const paths = files.map(file => { try { return window.companion.getPathForFile(file); } catch { return ''; } });
  const diskPaths = [...new Set([...paths.filter(Boolean), ...textPathsFromDrop(source)])];
  const imported = [];
  if (diskPaths.length) imported.push(...await window.companion.importDroppedBookFiles(diskPaths));
  const pathlessFiles = files.filter((file, index) => !paths[index]);
  if (pathlessFiles.length) imported.push(...await window.companion.importDroppedBookFileData(await virtualFilePayloads(pathlessFiles)));
  if (!imported.length) showToast('没有读取到电子书；微信文件请先点开下载一次后再拖入');
  return imported;
}

async function importDroppedExamResourceFiles(source) {
  const files = filesFromDrop(source);
  const paths = files.map(file => { try { return window.companion.getPathForFile(file); } catch { return ''; } });
  const diskPaths = [...new Set([...paths.filter(Boolean), ...textPathsFromDrop(source)])];
  const imported = [];
  if (diskPaths.length) imported.push(...await window.companion.importDroppedExamFiles(diskPaths));
  const pathlessFiles = files.filter((file, index) => !paths[index]);
  if (pathlessFiles.length) imported.push(...await window.companion.importDroppedExamFileData(await virtualFilePayloads(pathlessFiles)));
  if (!imported.length) showToast('没有读取到文件；微信文件请先点开下载一次后再拖入');
  return imported;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}

async function addClipboardImageFile(blob, name = '剪贴板截图.png') {
  const dataUrl = await blobToDataUrl(blob);
  const stored = await window.companion.storeLearningImage(dataUrl, name, learningImportSection());
  if (!stored) return showToast('剪贴板图片过大或格式不支持');
  addLearningFiles([stored]);
}

async function readLearningClipboard() {
  try {
    const entries = await navigator.clipboard.read();
    for (const entry of entries) {
      const imageType = entry.types.find(type => type.startsWith('image/'));
      if (imageType) return addClipboardImageFile(await entry.getType(imageType));
      if (entry.types.includes('text/plain')) {
        const text = await (await entry.getType('text/plain')).text();
        if (text.trim()) { addLearningFiles([{ name: '剪贴板文字.txt', text, parseKind: 'text' }]); return; }
      }
    }
    showToast('剪贴板里没有图片或文字');
  } catch { showToast('请在导入窗口内按 Ctrl+V 粘贴截图或文字'); }
}

function queueSelectionIntoEditor(itemId) {
  syncLearningImportEditor(); activeLearningImportId = itemId; renderLearningImportQueue();
}

function sentencesFromText(text) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return String(text || '').match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)?.map(item => item.trim()).filter(Boolean) || [];
}

function keepEnglishSourceFiles(items, materialType) {
  for (const item of items.filter(entry => entry.relativePath)) {
    data.english.articles.unshift({
      id: crypto.randomUUID(), title: item.title || item.name, source: item.source || '', url: item.url || '', body: item.text || '',
      tags: [...new Set([...(item.tags || []), materialType === 'wordlist' ? '词库源文件' : '句子源文件'])], note: item.note || '', level: '',
      materialType, relativePath: item.relativePath, originalName: item.name || '', needsOcr: Boolean(item.needsOcr && !item.text),
      ocrConfidence: item.ocrConfidence ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
  if (!data.english.selectedArticleId && data.english.articles.length) data.english.selectedArticleId = data.english.articles[0].id;
}

function examCategoryFromMaterialType(type) {
  return ({ exam_data_analysis: '行测/资料分析', exam_verbal: '行测/言语理解', exam_reasoning: '行测/判断推理', exam_quantitative: '行测/数量关系', exam_knowledge: '行测/常识判断', exam_essay: '申论/材料题' })[type] || '';
}

function createEnglishReadingSet(item, articleId) {
  const structure = item.structure;
  if (!structure?.questions?.length || !structure.materialType.startsWith('english_')) return null;
  const set = {
    id: crypto.randomUUID(), articleId, title: structure.groupTitle || item.title || item.name,
    materialType: structure.materialType, passage: structure.passage || item.text || '', confidence: structure.confidence,
    questions: structure.questions.map((question, index) => ({ id: crypto.randomUUID(), number: index + 1, type: question.type || 'single', stem: question.stem || '', options: question.options || [], answer: question.answer || '', explanation: question.explanation || '', selectedAnswer: '', checked: false, correct: null, attempts: [] })),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  data.english.readingSets.unshift(set); return set;
}

function createExamQuestionGroup(exam, item, resource, markMistake = false) {
  const structure = item.structure;
  if (!structure?.questions?.length) return null;
  const groupId = crypto.randomUUID(); const category = examCategoryFromMaterialType(structure.materialType);
  const questionIds = [];
  structure.questions.forEach((question, index) => {
    const id = crypto.randomUUID(); questionIds.push(id);
    exam.questions.unshift({
      id, groupId, type: question.type || 'single', stem: question.stem || '', options: structureOptionsText(question.options), optionList: question.options || [],
      answer: question.answer || '', explanation: question.explanation || '', category, sourceName: item.source || item.title || item.name || '', year: '', target: '',
      tags: item.tags || [], status: question.stem ? 'ready' : 'draft', attachmentId: resource.id, isMistake: markMistake, mistakeEver: markMistake,
      mistakeMastered: false, errorReason: '', reviewCount: 0, correctStreak: 0, userAnswer: '', answerChecked: false, createdAt: new Date().toISOString()
    });
  });
  const group = {
    id: groupId, title: structure.groupTitle || item.title || item.name, materialType: structure.materialType, typeLabel: MaterialParser.typeLabel(structure.materialType),
    passage: structure.passage || '', questionIds, resourceId: resource.id, source: item.source || '', tags: item.tags || [], confidence: structure.confidence,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  exam.questionGroups.unshift(group); return group;
}

async function archiveLearningQueue() {
  syncLearningImportEditor();
  if (!learningImportQueue.length) return showToast('请先加入学习材料');
  const destination = document.querySelector('#learning-import-destination').value;
  const failed = learningImportQueue.filter(item => item.status === 'error');
  if (failed.length) return showToast(`还有 ${failed.length} 项读取失败，请移除后再归档`);
  const usable = learningImportQueue.filter(item => item.status !== 'error');
  if (!usable.length) return showToast('没有可以归档的材料，请检查读取错误');
  if (destination === 'englishWords') {
    const text = usable.map(item => item.text).join('\n');
    if (!text.trim()) return showToast('词库材料还没有可导入的文字');
    await importVocabularyText(text, usable.map(item => item.name || item.title).join('、'), document.querySelector('#learning-import-word-list').value || 'list_default');
    keepEnglishSourceFiles(usable, 'wordlist');
    englishTab = 'words'; data.english.activeTab = 'words';
    await persist('单词已导入，原始文件可在学习资料中管理');
  } else if (destination === 'englishArticle') {
    usable.forEach(item => {
      const articleId = crypto.randomUUID(); const hasQuestions = Boolean(item.structure?.questions?.length && item.structure?.materialType?.startsWith('english_'));
      const article = { id: articleId, title: item.structure?.groupTitle || item.title || item.name, source: item.source || '', url: item.url || '', body: hasQuestions ? (item.structure.passage || item.text || '') : item.text || '', tags: item.tags || [], note: item.note || '', level: '', materialType: hasQuestions ? item.structure.materialType : item.parseKind === 'image' ? 'image' : /试卷|test|exam/i.test(item.title || '') ? 'test' : 'article', relativePath: item.relativePath || null, originalName: item.name || '', needsOcr: Boolean(item.needsOcr && !item.text), ocrConfidence: item.ocrConfidence ?? null, readingSetId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const set = createEnglishReadingSet(item, articleId); if (set) article.readingSetId = set.id;
      data.english.articles.unshift(article);
    });
    data.english.selectedArticleId = data.english.articles[0]?.id || null;
    englishTab = 'articles'; data.english.activeTab = 'articles';
    addActivity('word', `导入英语学习资料 ${usable.length} 份`, usable.map(item => item.title).slice(0, 3).join('、'));
    await persist(`已归档 ${usable.length} 份英语学习资料`);
  } else if (destination === 'englishSentences') {
    let count = 0;
    usable.forEach(item => sentencesFromText(item.text).slice(0, 500).forEach(text => { data.english.sentences.unshift({ id: crypto.randomUUID(), articleId: null, text, translation: '', source: item.source || item.title || '', tags: item.tags || [], note: item.note || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); count += 1; }));
    if (!count) return showToast('没有识别到可以收藏的句子');
    keepEnglishSourceFiles(usable, 'sentence-source');
    englishTab = 'sentences'; data.english.activeTab = 'sentences';
    addActivity('word', `导入英文句子 ${count} 条`, usable.map(item => item.title).slice(0, 3).join('、'));
    await persist(`已生成 ${count} 张句子卡片`);
  } else {
    const exam = ensureExamData();
    usable.forEach(item => {
      const resource = { id: crypto.randomUUID(), type: item.parseKind === 'image' ? 'file' : 'article', title: item.title || item.name, body: item.text || '', source: item.source || item.url || '', topic: '', tags: item.tags || [], note: item.note || '', relativePath: item.relativePath || null, name: item.name || '', extension: item.extension || '', size: item.size || 0, fileUrl: item.fileUrl || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      exam.resources.unshift(resource);
      if (destination === 'examQuestion' || destination === 'examMistake') {
        const group = createExamQuestionGroup(exam, item, resource, destination === 'examMistake');
        if (group) { selectedExamGroupId = group.id; selectedExamGroupQuestionId = group.questionIds[0] || null; }
        else exam.questions.unshift({ id: crypto.randomUUID(), type: 'single', stem: item.text?.trim() || `待整理：${item.title || item.name}`, options: '', optionList: [], answer: '', explanation: '', category: '', sourceName: item.source || item.title || '', year: '', target: '', tags: item.tags || [], status: item.text?.trim() ? 'ready' : 'draft', attachmentId: resource.id, isMistake: destination === 'examMistake', mistakeEver: destination === 'examMistake', mistakeMastered: false, errorReason: '', reviewCount: 0, correctStreak: 0, createdAt: new Date().toISOString() });
      }
    });
    addActivity('file', `智能导入考公材料 ${usable.length} 份`, destination === 'examMistake' ? '已放入错题待整理箱' : destination === 'examQuestion' ? '已放入题库待整理箱' : '已保存到资料库');
    exam.activeTab = destination === 'examMistake' ? 'mistakes' : destination === 'examQuestion' ? 'questions' : 'resources';
    await persist(`已归档 ${usable.length} 份考公材料`);
  }
  learningImportQueue = []; activeLearningImportId = null;
  document.querySelector('#learning-import-dialog').close(); renderAll();
}

function drawOcrCanvas(showCrop = true) {
  const canvas = document.querySelector('#ocr-crop-canvas'); const image = ocrState.image;
  if (!image) return;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!showCrop || !ocrState.crop) return;
  const { x, y, w, h } = ocrState.crop;
  ctx.save(); ctx.fillStyle = 'rgba(45,31,24,.43)'; ctx.fillRect(0, 0, canvas.width, y); ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, canvas.width - x - w, h); ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h); ctx.strokeStyle = '#efce92'; ctx.lineWidth = Math.max(2, canvas.width / 500); ctx.setLineDash([10, 6]); ctx.strokeRect(x, y, w, h); ctx.restore();
}

function setOcrFullCrop() {
  const canvas = document.querySelector('#ocr-crop-canvas'); ocrState.crop = { x: 0, y: 0, w: canvas.width, h: canvas.height }; drawOcrCanvas();
}

function autoDetectOcrCrop() {
  const canvas = document.querySelector('#ocr-crop-canvas'); drawOcrCanvas(false);
  const ctx = canvas.getContext('2d'); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const sample = (x, y) => { const index = (Math.max(0, Math.min(canvas.height - 1, y)) * canvas.width + Math.max(0, Math.min(canvas.width - 1, x))) * 4; return [pixels[index], pixels[index + 1], pixels[index + 2]]; };
  const corners = [sample(2, 2), sample(canvas.width - 3, 2), sample(2, canvas.height - 3), sample(canvas.width - 3, canvas.height - 3)];
  const bg = [0, 1, 2].map(channel => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, found = 0; const step = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) / 500));
  for (let y = 0; y < canvas.height; y += step) for (let x = 0; x < canvas.width; x += step) { const color = sample(x, y); const distance = Math.abs(color[0] - bg[0]) + Math.abs(color[1] - bg[1]) + Math.abs(color[2] - bg[2]); if (distance > 70) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); found += 1; } }
  if (found < 30) return setOcrFullCrop();
  const pad = Math.round(Math.min(canvas.width, canvas.height) * .025); ocrState.crop = { x: Math.max(0, minX - pad), y: Math.max(0, minY - pad), w: Math.min(canvas.width, maxX + pad) - Math.max(0, minX - pad), h: Math.min(canvas.height, maxY + pad) - Math.max(0, minY - pad) }; drawOcrCanvas();
}

function openOcrDialog(item = activeLearningImportItem()) {
  if (!item || item.parseKind !== 'image') return showToast('请选择一张图片');
  const image = new Image(); image.onload = () => {
    const canvas = document.querySelector('#ocr-crop-canvas'); const scale = Math.min(1, 1400 / image.naturalWidth, 900 / image.naturalHeight);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    ocrState = { itemId: item.queueId, image, crop: { x: 0, y: 0, w: canvas.width, h: canvas.height }, drawing: false, start: null };
    document.querySelector('#ocr-result-text').value = item.text || ''; document.querySelector('#ocr-confidence').textContent = item.ocrConfidence != null ? `置信度 ${item.ocrConfidence}%` : '';
    document.querySelector('#ocr-progress-label').textContent = '拖动鼠标框选区域，或使用自动裁剪'; document.querySelector('#ocr-progress-bar').style.width = '0%'; drawOcrCanvas();
    document.querySelector('#ocr-crop-dialog').showModal();
  };
  image.onerror = () => showToast('图片无法打开，可能格式不受支持'); image.src = item.fileUrl;
}

function ocrCroppedDataUrl() {
  const sourceCanvas = document.querySelector('#ocr-crop-canvas'); const crop = ocrState.crop || { x: 0, y: 0, w: sourceCanvas.width, h: sourceCanvas.height }; const image = ocrState.image;
  const scaleX = image.naturalWidth / sourceCanvas.width, scaleY = image.naturalHeight / sourceCanvas.height;
  const output = document.createElement('canvas'); output.width = Math.max(1, Math.round(crop.w * scaleX)); output.height = Math.max(1, Math.round(crop.h * scaleY));
  output.getContext('2d').drawImage(image, crop.x * scaleX, crop.y * scaleY, crop.w * scaleX, crop.h * scaleY, 0, 0, output.width, output.height);
  return output.toDataURL('image/jpeg', .94);
}

function renderModuleManager() {
  const modules = ensureModuleDraft().sort((a, b) => a.order - b.order);
  const manager = document.querySelector('#module-manager');
  manager.innerHTML = modules.map((module, index) => {
    const fallback = moduleDefaults.find(item => item.id === module.id);
    return `<div class="module-row" data-module-id="${module.id}">
      <div class="module-identity"><i>${escapeHtml(fallback?.icon || '□')}</i><span><strong>${escapeHtml(module.defaultName)}</strong><small>${module.locked ? '固定入口' : '原功能保持不变'}</small></span></div>
      <input class="module-name-input" data-module-name="${module.id}" maxlength="18" value="${escapeHtml(module.name)}" aria-label="${escapeHtml(module.defaultName)}显示名称">
      <label class="module-visible"><input type="checkbox" data-module-visible="${module.id}" ${module.visible ? 'checked' : ''} ${module.locked ? 'disabled' : ''}>显示</label>
      <div class="module-order-actions"><button type="button" data-module-move="up" title="上移" ${index === 0 || module.locked || modules[index - 1]?.locked ? 'disabled' : ''}>↑</button><button type="button" data-module-move="down" title="下移" ${index === modules.length - 1 || module.locked || modules[index + 1]?.locked ? 'disabled' : ''}>↓</button></div>
    </div>`;
  }).join('');
  updateModuleDraftActions();
}

function activityTypeLabel(type) {
  return ({ todo: '待办', word: '单词', exam: '考公', file: '资料', note: '补记', pomodoro: '专注' })[type] || '记录';
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  document.querySelector('#calendar-month-title').textContent = `${year}年${month + 1}月`;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() || 7) - 1;
  const start = new Date(year, month, 1 - offset);
  const today = localDayKey();
  const activityMap = new Map();
  (data.activityLog || []).forEach(item => {
    const key = localDayKey(item.occurredAt);
    if (!activityMap.has(key)) activityMap.set(key, []);
    activityMap.get(key).push(item);
  });
  document.querySelector('#calendar-grid').innerHTML = Array.from({ length: 42 }, (_item, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const key = localDayKey(date);
    const items = activityMap.get(key) || [];
    const types = [...new Set(items.map(item => item.type))].slice(0, 4);
    return `<button class="calendar-cell ${date.getMonth() !== month ? 'outside' : ''} ${key === today ? 'today' : ''} ${key === selectedCalendarDay ? 'selected' : ''}" data-calendar-day="${key}"><span class="calendar-number">${date.getDate()}</span>${items.length ? `<span class="calendar-count">${items.length}条</span><span class="calendar-marks">${types.map(type => `<i class="${type === 'exam' || type === 'file' ? 'exam' : type === 'word' ? 'word' : ''}"></i>`).join('')}</span>` : ''}</button>`;
  }).join('');
  const selected = new Date(`${selectedCalendarDay}T12:00:00`);
  const selectedItems = (activityMap.get(selectedCalendarDay) || []).slice().sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  document.querySelector('#calendar-day-title').textContent = `${selected.getMonth() + 1}月${selected.getDate()}日做过什么`;
  document.querySelector('#calendar-day-summary').textContent = selectedItems.length ? `这一天留下了 ${selectedItems.length} 条记录。` : '这一天还没有记录，可以手动补记。';
  document.querySelector('#calendar-day-list').innerHTML = selectedItems.length ? selectedItems.map(item => `<div class="day-activity"><time>${new Date(item.occurredAt).toTimeString().slice(0, 5)} · ${activityTypeLabel(item.type)}</time><strong>${escapeHtml(item.title)}</strong>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ''}</div>`).join('') : '<div class="empty-state"><div><span class="empty-mark">▤</span>这里会保存完成事项、学习与资料整理记录</div></div>';
}

function ensureExamData() {
  data.exam ||= {};
  for (const key of ['resources', 'questionGroups', 'questions', 'attempts', 'targets', 'sources', 'categories', 'tags']) if (!Array.isArray(data.exam[key])) data.exam[key] = [];
  data.exam.activeTab ||= 'resources';
  return data.exam;
}

function parseTags(value) {
  return [...new Set(String(value || '').split(/[,，、]/).map(item => item.trim()).filter(Boolean))];
}
function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function resourceKindLabel(type) {
  return ({ file: '文件', article: '申论文章', excerpt: '优秀片段', idea: '写作思路' })[type] || '资料';
}
function questionTypeLabel(type) {
  return ({ single: '单选', multiple: '多选', judge: '判断', blank: '填空', material: '材料题', subjective: '主观题', essay: '申论题' })[type] || '题目';
}
function detachQuestionFromGroups(exam, questionId) {
  exam.questionGroups = (exam.questionGroups || []).map(group => ({ ...group, questionIds: group.questionIds.filter(id => id !== questionId) })).filter(group => group.questionIds.length);
  if (!exam.questionGroups.some(group => group.id === selectedExamGroupId)) { selectedExamGroupId = exam.questionGroups[0]?.id || null; selectedExamGroupQuestionId = null; }
}

function renderExamResourceCard(resource) {
  const isFile = resource.type === 'file';
  const preview = isFile ? `${resource.extension?.toUpperCase() || 'FILE'} · ${formatBytes(resource.size || 0)}` : (resource.body || '还没有填写正文');
  const meta = [resource.topic, resource.source, ...(resource.tags || [])].filter(Boolean).slice(0, 4);
  return `<article class="resource-card" style="--resource-color:${isFile ? '#8f6245' : resource.type === 'article' ? '#6f4933' : resource.type === 'excerpt' ? '#c08c52' : '#9a7258'}">
    <div class="resource-card-head"><span class="resource-kind">${resourceKindLabel(resource.type)}</span><small>${new Date(resource.createdAt).toLocaleDateString('zh-CN')}</small></div>
    <h3>${escapeHtml(resource.title || resource.name || '未命名资料')}</h3><p>${escapeHtml(preview)}</p>
    <div class="resource-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join('') || '<span>尚未添加标签</span>'}</div>
    <div class="resource-actions">${isFile ? `<button data-open-resource-file="${resource.id}">打开文件</button>` : `<button data-edit-resource="${resource.id}">编辑内容</button><button data-copy-resource="${resource.id}">复制正文</button>`}<button class="danger-link" data-delete-resource="${resource.id}">${isFile ? '删除文件' : '删除资料'}</button></div>
  </article>`;
}

function renderQuestionCard(question, index, mistakeView = false) {
  const source = question.sourceName || (question.attachmentId ? '图片导入' : '手动建立');
  const chips = [question.category, source, question.year, question.examKind, question.region, question.target, ...(question.tags || [])].filter(Boolean).slice(0, 7);
  const mastery = question.mistakeMastered ? '已掌握' : question.isMistake ? '待复刷' : question.status === 'draft' ? '待整理' : '题库';
  return `<article class="question-file-card" data-question-id="${question.id}">
    <div class="question-number">Q${String(index + 1).padStart(2, '0')}</div>
    <div class="question-copy"><h3>${escapeHtml(question.stem || '等待补充题干')}</h3><p>${questionTypeLabel(question.type)} · <span class="question-status ${question.status === 'ready' ? 'ready' : ''}">${escapeHtml(mastery)}</span>${question.answer ? ` · 答案 ${escapeHtml(question.answer)}` : ''}</p><div class="question-chips">${chips.map(item => `<span>${escapeHtml(item)}</span>`).join('')}${question.isMistake ? '<span class="alert">错题</span>' : ''}</div></div>
    <div class="question-actions"><button class="primary-small" data-edit-question="${question.id}">整理/编辑</button>${question.attachmentId ? `<button data-open-question-file="${question.id}">看原图</button>` : ''}${mistakeView ? `<button data-mistake-result="wrong" data-question="${question.id}">再次答错</button><button data-mistake-result="right" data-question="${question.id}">这次答对</button>` : `<button data-toggle-mistake="${question.id}">${question.isMistake ? '移出错题' : '标为错题'}</button>`}<button class="danger-small" data-delete-question-card="${question.id}">删除</button></div>
  </article>`;
}

function normalizedQuestionOptions(question) {
  if (Array.isArray(question.optionList) && question.optionList.length) return question.optionList;
  if (Array.isArray(question.options)) return question.options;
  return parseStructureOptions(question.options || '');
}

function answerClass(question, optionKey) {
  if (!question.answerChecked) return question.userAnswer === optionKey ? 'selected' : '';
  if (String(question.answer || '').includes(optionKey)) return 'correct';
  if (question.userAnswer === optionKey) return 'wrong';
  return '';
}

function renderExamGroupStudio(exam) {
  const groups = exam.questionGroups || []; const studio = document.querySelector('#exam-group-studio');
  studio.hidden = !groups.length; if (!groups.length) return;
  if (!groups.some(group => group.id === selectedExamGroupId)) selectedExamGroupId = groups[0].id;
  const group = groups.find(item => item.id === selectedExamGroupId) || groups[0];
  const questions = group.questionIds.map(id => exam.questions.find(question => question.id === id)).filter(Boolean);
  if (!questions.some(question => question.id === selectedExamGroupQuestionId)) selectedExamGroupQuestionId = questions[0]?.id || null;
  const question = questions.find(item => item.id === selectedExamGroupQuestionId) || questions[0];
  document.querySelector('#exam-group-list').innerHTML = groups.map(item => `<button class="${item.id === group.id ? 'active' : ''}" data-exam-group="${item.id}" type="button"><strong>${escapeHtml(item.title || '未命名材料组')}</strong><small>${escapeHtml(item.typeLabel || MaterialParser.typeLabel(item.materialType))} · ${item.questionIds.length} 题</small></button>`).join('');
  document.querySelector('#exam-group-type').textContent = group.typeLabel || MaterialParser.typeLabel(group.materialType);
  document.querySelector('#exam-group-title').textContent = group.title || '未命名材料组';
  document.querySelector('#exam-group-meta').textContent = `${questions.length} 道子题${group.source ? ` · ${group.source}` : ''}${group.confidence ? ` · 识别置信度 ${group.confidence}%` : ''}`;
  document.querySelector('#exam-group-passage').textContent = group.passage || '这组题没有单独识别出公共材料，内容可能已经包含在各题题干中。';
  const resource = exam.resources.find(item => item.id === group.resourceId);
  document.querySelector('#exam-group-open-source').hidden = !resource?.relativePath;
  const index = Math.max(0, questions.findIndex(item => item.id === question?.id));
  document.querySelector('#exam-group-progress').textContent = `${questions.length ? index + 1 : 0} / ${questions.length}`;
  document.querySelector('#exam-group-question-nav').innerHTML = questions.map((item, questionIndex) => `<button class="${item.id === question?.id ? 'active' : ''} ${item.answerChecked ? 'done' : ''}" data-exam-group-question="${item.id}" type="button">${questionIndex + 1}</button>`).join('');
  const detail = document.querySelector('#exam-group-question-detail');
  if (!question) { detail.innerHTML = '<div class="empty-state"><div>这组材料还没有子题</div></div>'; return; }
  const options = normalizedQuestionOptions(question);
  detail.innerHTML = `<h4>${index + 1}. ${escapeHtml(question.stem || '题干待补充')}</h4>${options.length ? `<div class="group-option-list">${options.map(option => `<button type="button" class="${answerClass(question, option.key)}" data-exam-group-option="${escapeHtml(option.key)}"><b>${escapeHtml(option.key)}</b><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>` : `<textarea class="subjective-answer" data-exam-subjective-answer placeholder="在这里写下作答思路…">${escapeHtml(question.userAnswer || '')}</textarea>`}<div class="question-check-row"><button class="button primary" data-check-exam-group-question="${question.id}" type="button">核对答案</button><button class="button ghost" data-toggle-mistake="${question.id}" type="button">${question.isMistake ? '移出错题' : '标为错题'}</button></div>${question.answerChecked ? `<div class="question-feedback ${question.correct ? 'correct' : 'wrong'}"><strong>${question.correct ? '回答正确' : '需要再看一遍材料'}</strong><br>正确答案：${escapeHtml(question.answer || '尚未录入')}${question.explanation ? `<br>${escapeHtml(question.explanation)}` : ''}</div>` : ''}`;
}

function generateExamMarkdown(scope = 'all') {
  const exam = ensureExamData();
  const mistakes = exam.questions.filter(item => item.isMistake || item.mistakeEver);
  const active = mistakes.filter(item => !item.mistakeMastered);
  const attempts = exam.attempts || [];
  const reviewAttempts = attempts.filter(item => item.mode === 'mistake-review');
  const repeatWrong = reviewAttempts.filter(item => item.correct === false).length;
  const reasonCounts = {};
  mistakes.forEach(item => { if (item.errorReason) reasonCounts[item.errorReason] = (reasonCounts[item.errorReason] || 0) + 1; });
  const categories = {};
  exam.questions.forEach(item => { const key = item.category || '未分类'; categories[key] = categories[key] || { total: 0, mistakes: 0 }; categories[key].total += 1; if (item.isMistake && !item.mistakeMastered) categories[key].mistakes += 1; });
  const lines = [
    '# 考公学习与错题分析档案', '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, '',
    '## 数据总览', '', `- 题库总量：${exam.questions.length} 道`, `- 资料数量：${exam.resources.length} 条`, `- 历史累计错题：${mistakes.length} 道`, `- 当前待消化：${active.length} 道`, `- 错题消化率：${mistakes.length ? Math.round((mistakes.length - active.length) / mistakes.length * 100) : 0}%`, `- 复刷再错率：${reviewAttempts.length ? Math.round(repeatWrong / reviewAttempts.length * 100) : 0}%`, '',
    '## 分类情况', '', ...Object.entries(categories).sort((a, b) => b[1].mistakes - a[1].mistakes).map(([name, item]) => `- ${name}：${item.total} 道，待消化错题 ${item.mistakes} 道`), '',
    '## 错误原因', '', ...(Object.keys(reasonCounts).length ? Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `- ${name}：${count} 道`) : ['- 尚未记录错误原因']), '',
    '## 尚未掌握的错题', ''
  ];
  active.forEach((item, index) => {
    const group = exam.questionGroups.find(entry => entry.id === item.groupId);
    lines.push(`### ${index + 1}. ${item.category || '未分类'} · ${questionTypeLabel(item.type)}`, '', `- 题源：${item.sourceName || '未填写'}${item.year ? `（${item.year}）` : ''}`, `- 所属材料组：${group?.title || '单独题目'}`, `- 考试范围：${[item.examKind, item.region, item.target].filter(Boolean).join(' · ') || '未填写'}`, `- 标签：${(item.tags || []).join('、') || '无'}`, `- 错误原因：${item.errorReason || '未填写'}`, `- 复刷次数：${item.reviewCount || 0}`, '', ...(group?.passage ? ['公共材料：', group.passage.slice(0, 1800), ''] : []), item.stem || '题干待整理', '', `- 正确答案：${item.answer || '未填写'}`, `- 解析：${item.explanation || '未填写'}`, '');
  });
  lines.push('## 请 AI 帮我分析', '', '请根据以上数据和错题，识别我的主要薄弱分类、常见错误模式与时间分配问题；给出下一阶段可执行的复习优先级、每日练习量和复刷计划。不要只复述统计数字。');
  if (scope === 'preview') return lines.slice(0, 30).join('\n');
  return lines.join('\n');
}

function renderExam() {
  const exam = ensureExamData();
  const activeTab = exam.activeTab || 'resources';
  document.querySelectorAll('[data-exam-tab]').forEach(button => button.classList.toggle('active', button.dataset.examTab === activeTab));
  document.querySelectorAll('[data-exam-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.examPanel === activeTab));
  const mistakes = exam.questions.filter(question => question.isMistake || question.mistakeEver);
  const activeMistakes = mistakes.filter(question => !question.mistakeMastered);
  const attempts = exam.attempts.filter(item => item.mode === 'mistake-review');
  const wrongAttempts = attempts.filter(item => item.correct === false).length;
  const mastery = mistakes.length ? Math.round((mistakes.length - activeMistakes.length) / mistakes.length * 100) : 0;
  document.querySelector('#exam-resource-count').textContent = exam.resources.length;
  document.querySelector('#exam-question-count').textContent = exam.questions.length;
  document.querySelector('#exam-mistake-count').textContent = activeMistakes.length;
  document.querySelector('#exam-hero-question-count').textContent = exam.questions.length;
  document.querySelector('#exam-hero-mastery').style.width = `${mastery}%`;
  document.querySelector('#exam-hero-mastery-label').textContent = mistakes.length ? `错题消化 ${mastery}%` : '还没有复刷记录';
  document.querySelector('#exam-storage-size').textContent = formatBytes(exam.resources.filter(item => item.type === 'file').reduce((sum, item) => sum + Number(item.size || 0), 0));
  renderExamGroupStudio(exam);

  const resourceQuery = document.querySelector('#exam-resource-search').value.trim().toLocaleLowerCase();
  const resources = exam.resources.filter(item => (examResourceFilter === 'all' || item.type === examResourceFilter) && (!resourceQuery || `${item.title || item.name} ${item.body || ''} ${item.source || ''} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(resourceQuery)));
  document.querySelector('#exam-resource-list').innerHTML = resources.length ? resources.map(renderExamResourceCard).join('') : '<div class="empty-state"><div><span class="empty-mark">⌁</span>把第一份资料拖进来，或保存一段申论素材</div></div>';

  const categorySelect = document.querySelector('#exam-question-category');
  const previousCategory = categorySelect.value || 'all';
  const categories = [...new Set([...exam.categories, ...exam.questions.map(item => item.category).filter(Boolean)])].sort();
  categorySelect.innerHTML = '<option value="all">全部分类</option>' + categories.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  categorySelect.value = categories.includes(previousCategory) ? previousCategory : 'all';
  document.querySelector('#exam-category-options').innerHTML = categories.map(item => `<option value="${escapeHtml(item)}"></option>`).join('');
  const questionQuery = document.querySelector('#exam-question-search').value.trim().toLocaleLowerCase();
  const questions = exam.questions.filter(item => (categorySelect.value === 'all' || item.category === categorySelect.value) && (!questionQuery || `${item.stem} ${item.sourceName || ''} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(questionQuery)));
  document.querySelector('#exam-question-list').innerHTML = questions.length ? questions.map((item, index) => renderQuestionCard(item, index, false)).join('') : '<div class="empty-state"><div><span class="empty-mark">Q</span>这里会显示题库和等待整理的图片题目</div></div>';
  document.querySelector('#exam-mistake-list').innerHTML = activeMistakes.length ? activeMistakes.map((item, index) => renderQuestionCard(item, index, true)).join('') : '<div class="empty-state"><div><span class="empty-mark">✓</span>目前没有待消化错题</div></div>';
  document.querySelector('#mistake-total').textContent = mistakes.length;
  document.querySelector('#mistake-active').textContent = activeMistakes.length;
  document.querySelector('#mistake-digestion').textContent = `${mastery}%`;
  document.querySelector('#mistake-repeat-rate').textContent = `${attempts.length ? Math.round(wrongAttempts / attempts.length * 100) : 0}%`;

  const categoryStats = {};
  exam.questions.forEach(item => { const key = item.category || '未分类'; categoryStats[key] ||= { total: 0, weak: 0 }; categoryStats[key].total += 1; if (item.isMistake && !item.mistakeMastered) categoryStats[key].weak += 1; });
  document.querySelector('#exam-category-analysis').innerHTML = Object.keys(categoryStats).length ? Object.entries(categoryStats).sort((a, b) => b[1].weak - a[1].weak).slice(0, 8).map(([name, item]) => { const score = item.total ? Math.round((item.total - item.weak) / item.total * 100) : 0; return `<div><div class="analysis-bar-head"><strong>${escapeHtml(name)}</strong><span>${item.weak} 道待消化 · ${score}%</span></div><div class="analysis-track"><i style="width:${score}%"></i></div></div>`; }).join('') : '<div class="empty-state"><div>整理题目后会出现分类表现</div></div>';
  const reasons = {};
  mistakes.forEach(item => { if (item.errorReason) reasons[item.errorReason] = (reasons[item.errorReason] || 0) + 1; });
  document.querySelector('#exam-reason-analysis').innerHTML = Object.keys(reasons).length ? Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<span>${escapeHtml(name)} · ${count}</span>`).join('') : '<div class="empty-state"><div>给错题填写错误原因后会在这里汇总</div></div>';
  document.querySelector('#exam-analysis-preview').textContent = generateExamMarkdown('preview');
}

async function importExamFiles(files, destination) {
  if (!files?.length) return showToast('没有找到可导入的文件');
  const exam = ensureExamData();
  files.forEach(file => {
    const resource = { ...file, type: 'file', title: file.name, createdAt: file.importedAt || new Date().toISOString(), tags: [], destination };
    exam.resources.push(resource);
    if (destination === 'question' || destination === 'mistake') {
      exam.questions.push({ id: crypto.randomUUID(), type: 'single', stem: `待整理：${file.name}`, options: '', answer: '', explanation: '', category: '', sourceName: '', year: '', target: '', tags: [], status: 'draft', attachmentId: resource.id, isMistake: destination === 'mistake', mistakeEver: destination === 'mistake', mistakeMastered: false, errorReason: '', reviewCount: 0, correctStreak: 0, createdAt: new Date().toISOString() });
    }
  });
  addActivity('file', `导入考公资料 ${files.length} 份`, destination === 'mistake' ? '已放入错题待整理箱' : destination === 'question' ? '已放入题库待整理箱' : '已保存到资料库');
  await persist(`已导入 ${files.length} 个文件`);
  renderExam(); renderCalendar();
}

function ensureFinalExamData() {
  data.finalExam ||= {};
  for (const key of ['sources', 'questions', 'attempts']) if (!Array.isArray(data.finalExam[key])) data.finalExam[key] = [];
  data.finalExam.activeSourceId ||= 'all'; data.finalExam.activeChapter ||= 'all'; data.finalExam.activeType ||= 'all';
  data.finalExam.activeTab ||= 'practice'; data.finalExam.sessionSize = Math.max(5, Math.min(20, Number(data.finalExam.sessionSize) || 10));
  finalExamTab = data.finalExam.activeTab;
  return data.finalExam;
}

function repairFinalExamQuestionModes() {
  const finals = ensureFinalExamData(); const removedIds = new Set(); let changed = false;
  finals.questions = finals.questions.filter(question => {
    const invalid = question.origin === 'generated' && /^根据原文完成填空[：:]\s*____$/.test(String(question.prompt || '').trim());
    if (invalid) { removedIds.add(question.id); changed = true; return false; }
    return true;
  }).map(question => {
    if (question.origin !== 'generated') return question;
    const responseMode = question.type === 'term' || question.type === 'list-cloze' || (question.type === 'cloze' && String(question.answer || '').length <= 18) ? 'fill' : 'choice';
    if (question.responseMode === responseMode && (responseMode !== 'fill' || !question.options?.length)) return question;
    changed = true;
    return responseMode === 'fill' ? { ...question, responseMode, options: [], correctKey: '' } : { ...question, responseMode };
  });
  if (removedIds.size) {
    finals.attempts = finals.attempts.filter(item => !removedIds.has(item.questionId)); finals.session = null;
  }
  finals.sources.forEach(source => { const count = finals.questions.filter(item => item.sourceId === source.id).length; if (source.questionCount !== count) { source.questionCount = count; changed = true; } });
  return changed;
}

function finalQuestionTypeLabel(type) {
  return ({ cloze: '原文挖空', term: '名词解释', 'list-cloze': '简答拆项', choice: '原题选择' })[type] || '复习题';
}

function finalSourceFor(question, finals = ensureFinalExamData()) {
  return finals.sources.find(source => source.id === question.sourceId);
}

function finalFilteredQuestions(finals = ensureFinalExamData()) {
  const sourceId = document.querySelector('#final-source-filter')?.value || finals.activeSourceId || 'all';
  const chapter = document.querySelector('#final-chapter-filter')?.value || finals.activeChapter || 'all';
  const type = document.querySelector('#final-type-filter')?.value || finals.activeType || 'all';
  return finals.questions.filter(question => (sourceId === 'all' || question.sourceId === sourceId) && (chapter === 'all' || question.chapter === chapter) && (type === 'all' || question.type === type));
}

function finalOptionMarkup(question, session) {
  if (question.responseMode === 'fill') return `<div class="final-fill-answer"><label for="final-fill-input">填写答案</label><div><input id="final-fill-input" type="text" autocomplete="off" placeholder="在这里输入，再核对原文" value="${escapeHtml(session?.submittedText || '')}" ${session?.answeredKey ? 'disabled' : ''}><button type="button" class="button primary" data-final-check-fill ${session?.answeredKey ? 'disabled' : ''}>核对填空</button></div><small>空格和标点不会影响判定；答案不完全一致时会显示原文。</small></div>`;
  if (!question.options?.length) return `<div class="final-no-options"><strong>这题没有足够的同类干扰项</strong><p>为避免编造答案，先在心里作答，再展开原文核对。</p>${session?.answeredKey ? '' : '<div><button type="button" data-final-self-grade="wrong">没答出来</button><button type="button" data-final-self-grade="right">我答对了</button></div>'}</div>`;
  return `<div class="final-options">${question.options.map(option => {
    const selected = session?.answeredKey === option.key; const correct = option.key === question.correctKey;
    const state = session?.answeredKey ? (correct ? 'correct' : selected ? 'wrong' : '') : '';
    return `<button type="button" data-final-answer="${option.key}" class="${selected ? 'selected' : ''} ${state}" ${session?.answeredKey ? 'disabled' : ''}><b>${option.key}</b><span>${escapeHtml(option.text)}</span></button>`;
  }).join('')}</div>`;
}

function renderFinalPractice(finals) {
  const card = document.querySelector('#final-practice-card'); const session = finals.session;
  document.querySelector('#final-session-progress').textContent = session ? `${Math.min(session.index + 1, session.questionIds.length)} / ${session.questionIds.length}` : '0 / 0';
  document.querySelector('#final-session-correct').textContent = session?.correct || 0;
  document.querySelector('#final-session-wrong').textContent = session?.wrong || 0;
  document.querySelector('#final-session-due').textContent = finals.questions.filter(question => !question.dueAt || new Date(question.dueAt) <= new Date()).length;
  if (!session?.questionIds?.length) {
    card.innerHTML = finals.questions.length
      ? '<div class="final-empty-practice"><span>考</span><h2>准备开始一组复习</h2><p>系统会优先抽取到期题、错题和掌握度较低的题。</p><button class="button primary" data-final-start>开始新一组</button></div>'
      : '<div class="final-empty-practice"><span>＋</span><h2>先导入一份复习资料</h2><p>支持带可复制文字的 PDF 和 UTF-8 TXT。</p><button class="button primary" data-final-import>导入资料</button></div>';
    return;
  }
  if (session.index >= session.questionIds.length) {
    const accuracy = session.questionIds.length ? Math.round((session.correct || 0) / session.questionIds.length * 100) : 0;
    card.innerHTML = `<div class="final-session-complete"><span>本组完成</span><strong>${accuracy}%</strong><h2>${accuracy >= 80 ? '这一组记得很稳' : '错题已经进入下一轮记忆'}</h2><p>答对 ${session.correct || 0} 题，答错 ${session.wrong || 0} 题。记录已经保存，不会从头开始。</p><button class="button primary" data-final-start>再来一组</button></div>`;
    return;
  }
  const question = finals.questions.find(item => item.id === session.questionIds[session.index]);
  if (!question) { session.index += 1; return renderFinalPractice(finals); }
  const source = finalSourceFor(question, finals);
  card.innerHTML = `<div class="final-question-meta"><span>${escapeHtml(finalQuestionTypeLabel(question.type))}</span><span>${escapeHtml(question.chapter || '综合复习')}</span><small>${escapeHtml(source?.title || '导入资料')}</small></div>
    <div class="final-question-number">QUESTION ${String(session.index + 1).padStart(2, '0')}</div>
    <h2 class="final-question-prompt">${escapeHtml(question.prompt)}</h2>
    ${finalOptionMarkup(question, session)}
    ${session.answeredKey ? `<div class="final-feedback ${session.answeredCorrect ? 'right' : 'wrong'}"><strong>${session.answeredCorrect ? '回答正确' : '这题已加入错题本'}</strong><p>正确答案：${question.responseMode === 'choice' || question.type === 'choice' ? `${escapeHtml(question.correctKey)} · ` : ''}${escapeHtml(question.answer)}</p><small>原文依据：${escapeHtml(question.sourceExcerpt || question.answer)}</small></div><button class="button primary final-next" data-final-next>${session.index + 1 >= session.questionIds.length ? '查看本组结果' : '下一题 →'}</button>` : ''}`;
}

function renderFinalQuestionRows(questions, emptyText) {
  return questions.length ? questions.map((question, index) => {
    const source = finalSourceFor(question); const due = !question.dueAt || new Date(question.dueAt) <= new Date();
    return `<article class="final-question-row"><span class="final-row-number">${String(index + 1).padStart(2, '0')}</span><div><div class="final-row-tags"><i>${escapeHtml(finalQuestionTypeLabel(question.type))}</i><i>${escapeHtml(question.chapter || '综合复习')}</i>${question.isMistake ? '<i class="alert">待复习错题</i>' : question.mistakeEver ? '<i class="done">历史错题</i>' : ''}</div><h3>${escapeHtml(question.prompt)}</h3><p>答案：${escapeHtml(question.answer)} · 掌握度 ${question.mastery || 0}% · ${due ? '已到复习时间' : `下次 ${formatDateTime(question.dueAt)}`}</p><small>${escapeHtml(source?.title || '导入资料')}</small></div><button type="button" data-final-delete-question="${question.id}">删除</button></article>`;
  }).join('') : `<div class="empty-state"><div><span class="empty-mark">考</span>${escapeHtml(emptyText)}</div></div>`;
}

function renderFinalExam() {
  const finals = ensureFinalExamData(); finalExamTab = finals.activeTab || finalExamTab || 'practice';
  document.querySelectorAll('[data-final-tab]').forEach(button => button.classList.toggle('active', button.dataset.finalTab === finalExamTab));
  document.querySelectorAll('[data-final-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.finalPanel === finalExamTab));
  const sourceSelect = document.querySelector('#final-source-filter'); const previousSource = finals.activeSourceId || 'all';
  sourceSelect.innerHTML = '<option value="all">全部资料</option>' + finals.sources.map(source => `<option value="${source.id}">${escapeHtml(source.title)} · ${source.questionCount || 0}题</option>`).join('');
  sourceSelect.value = finals.sources.some(item => item.id === previousSource) ? previousSource : 'all'; finals.activeSourceId = sourceSelect.value;
  const scoped = finals.questions.filter(question => finals.activeSourceId === 'all' || question.sourceId === finals.activeSourceId);
  const chapters = [...new Set(scoped.map(question => question.chapter).filter(Boolean))]; const chapterSelect = document.querySelector('#final-chapter-filter');
  chapterSelect.innerHTML = '<option value="all">全部章节</option>' + chapters.map(chapter => `<option value="${escapeHtml(chapter)}">${escapeHtml(chapter)}</option>`).join('');
  chapterSelect.value = chapters.includes(finals.activeChapter) ? finals.activeChapter : 'all'; finals.activeChapter = chapterSelect.value;
  document.querySelector('#final-type-filter').value = finals.activeType || 'all'; document.querySelector('#final-session-size').value = String(finals.sessionSize || 10);
  const due = finals.questions.filter(question => !question.dueAt || new Date(question.dueAt) <= new Date()).length;
  const mistakes = finals.questions.filter(question => question.isMistake); const everWrong = finals.questions.filter(question => question.mistakeEver);
  const attempts = finals.attempts; const correct = attempts.filter(item => item.correct).length;
  const average = finals.questions.length ? Math.round(finals.questions.reduce((sum, item) => sum + (item.mastery || 0), 0) / finals.questions.length) : 0;
  document.querySelector('#final-due-count').textContent = due; document.querySelector('#final-mastery-ring').style.width = `${average}%`;
  document.querySelector('#final-bank-count').textContent = finals.questions.length; document.querySelector('#final-mistake-count').textContent = mistakes.length;
  document.querySelector('#final-ever-wrong').textContent = everWrong.length; document.querySelector('#final-active-wrong').textContent = mistakes.length; document.querySelector('#final-mastered-wrong').textContent = everWrong.filter(item => !item.isMistake).length;
  document.querySelector('#final-accuracy').textContent = `${attempts.length ? Math.round(correct / attempts.length * 100) : 0}%`;
  document.querySelector('#final-attempt-count').textContent = attempts.length; document.querySelector('#final-seen-count').textContent = finals.questions.filter(item => item.seenCount).length;
  document.querySelector('#final-average-mastery').textContent = `${average}%`; document.querySelector('#final-source-count').textContent = finals.sources.length;
  document.querySelector('#final-import-summary').textContent = finals.sources.length ? `已从 ${finals.sources.length} 份资料生成 ${finals.questions.length} 道题；无可靠干扰项时不会强行编造。` : '导入资料后会先生成可核对的题目。';
  document.querySelector('#final-source-list').innerHTML = finals.sources.length ? finals.sources.map(source => `<article class="final-source-card"><span>${source.extension?.toUpperCase() || 'TEXT'}</span><div><h3>${escapeHtml(source.title)}</h3><p>${source.questionCount || 0} 道题 · ${source.chapterCount || 0} 章 · ${formatBytes(source.size || 0)}</p><small>${new Date(source.importedAt || source.createdAt).toLocaleString('zh-CN')}</small></div><div class="final-source-actions">${source.relativePath ? `<button type="button" data-final-open-source="${source.id}">打开原文</button>` : ''}<button type="button" data-final-delete-source="${source.id}">删除资料</button></div></article>`).join('') : '';
  document.querySelector('#final-question-list').innerHTML = renderFinalQuestionRows(finals.questions, '导入 PDF 或 TXT 后，题目会出现在这里');
  document.querySelector('#final-mistake-list').innerHTML = renderFinalQuestionRows(mistakes, '目前没有待复习错题');
  document.querySelector('#final-record-list').innerHTML = attempts.length ? attempts.slice(-30).reverse().map(item => { const question = finals.questions.find(q => q.id === item.questionId); return `<div class="final-record"><span class="${item.correct ? 'right' : 'wrong'}">${item.correct ? '✓' : '×'}</span><div><strong>${escapeHtml(question?.prompt || '已删除的题目')}</strong><small>${new Date(item.attemptedAt).toLocaleString('zh-CN')} · ${item.correct ? '答对' : '答错并记入错题'}</small></div></div>`; }).join('') : '<div class="empty-state"><div>完成第一道题后，这里会留下记录</div></div>';
  renderFinalPractice(finals);
}

async function archiveFinalExamFiles(files) {
  if (!files?.length) return showToast('没有读取到 PDF 或 TXT');
  const finals = ensureFinalExamData(); let addedQuestions = 0; let failed = 0;
  for (const file of files) {
    if (!file.text?.trim()) { failed += 1; continue; }
    const parsed = FinalExamCore.buildQuestionBank(file.text, { title: file.name });
    if (!parsed.questions.length) { failed += 1; continue; }
    const sourceId = crypto.randomUUID();
    finals.sources.unshift({ id: sourceId, title: file.name || parsed.title, relativePath: file.relativePath || '', extension: file.extension || file.parseKind || '', size: file.size || 0, importedAt: file.importedAt || new Date().toISOString(), questionCount: parsed.questions.length, chapterCount: parsed.chapters.length, stats: parsed.stats });
    parsed.questions.forEach((question, index) => finals.questions.push(FinalExamCore.normalizeQuestion({ ...question, id: `${sourceId}_q${index + 1}`, sourceId, createdAt: new Date().toISOString() })));
    addedQuestions += parsed.questions.length;
  }
  if (!addedQuestions) return showToast(failed ? '没有识别到可用文字；扫描版 PDF 请先 OCR' : '没有识别到稳定题目，请检查资料格式');
  finals.activeTab = 'bank'; finalExamTab = 'bank';
  addActivity('exam', `导入期末复习资料 ${files.length - failed} 份`, `生成 ${addedQuestions} 道可追踪题目`);
  await persist(`已生成 ${addedQuestions} 道期末复习题`); renderFinalExam(); renderCalendar();
}

async function importFinalExamFiles() {
  const files = await window.companion.chooseLearningFiles('exam');
  await archiveFinalExamFiles(files);
}

async function importDroppedFinalExamFiles(source) {
  const files = filesFromDrop(source); const paths = files.map(file => { try { return window.companion.getPathForFile(file); } catch { return ''; } });
  const diskPaths = [...new Set([...paths.filter(Boolean), ...textPathsFromDrop(source)])]; const imported = [];
  if (diskPaths.length) imported.push(...await window.companion.importDroppedLearningFiles(diskPaths, 'exam'));
  const pathless = files.filter((file, index) => !paths[index]);
  if (pathless.length) imported.push(...await window.companion.importDroppedLearningFileData(await virtualFilePayloads(pathless), 'exam'));
  await archiveFinalExamFiles(imported);
}

async function startFinalSession(options = {}) {
  const finals = ensureFinalExamData();
  if (options.mistakesOnly) { finals.activeSourceId = 'all'; finals.activeChapter = 'all'; finals.activeType = 'all'; }
  const pool = options.mistakesOnly ? finals.questions.filter(item => item.isMistake) : finalFilteredQuestions(finals);
  if (!pool.length) return showToast(options.mistakesOnly ? '目前没有待复习错题' : '当前范围没有可练习的题目');
  const questionIds = FinalExamCore.makeSession(pool, { size: finals.sessionSize, chapter: 'all', type: 'all' });
  finals.session = { questionIds, index: 0, correct: 0, wrong: 0, answeredKey: '', answeredCorrect: null, startedAt: new Date().toISOString(), mistakesOnly: Boolean(options.mistakesOnly) };
  finals.activeTab = 'practice'; finalExamTab = 'practice';
  await persist(); renderFinalExam();
}

function openExamResourceDialog(resource) {
  document.querySelector('#exam-resource-id').value = resource?.id || '';
  document.querySelector('#exam-resource-dialog-title').textContent = resource ? '编辑文字资料' : '保存申论素材';
  document.querySelector('#exam-resource-type').value = resource?.type || 'article';
  document.querySelector('#exam-resource-title').value = resource?.title || '';
  document.querySelector('#exam-resource-body').value = resource?.body || '';
  document.querySelector('#exam-resource-source').value = resource?.source || '';
  document.querySelector('#exam-resource-topic').value = resource?.topic || '';
  document.querySelector('#exam-resource-tags').value = (resource?.tags || []).join('，');
  document.querySelector('#exam-resource-note').value = resource?.note || '';
  document.querySelector('#delete-exam-resource').classList.toggle('hidden', !resource);
  document.querySelector('#exam-resource-dialog').showModal();
}

function openExamQuestionDialog(question) {
  document.querySelector('#exam-question-id').value = question?.id || '';
  document.querySelector('#exam-question-dialog-title').textContent = question ? '整理题目' : '新建题目';
  document.querySelector('#exam-question-type').value = question?.type || 'single';
  document.querySelector('#exam-question-category-input').value = question?.category || '';
  document.querySelector('#exam-question-status').value = question?.status || 'ready';
  document.querySelector('#exam-question-stem').value = question?.stem || '';
  document.querySelector('#exam-question-options').value = Array.isArray(question?.optionList) && question.optionList.length ? structureOptionsText(question.optionList) : Array.isArray(question?.options) ? structureOptionsText(question.options) : question?.options || '';
  document.querySelector('#exam-question-answer').value = question?.answer || '';
  document.querySelector('#exam-question-source').value = question?.sourceName || '';
  document.querySelector('#exam-question-year').value = question?.year || '';
  document.querySelector('#exam-question-kind').value = question?.examKind || '';
  document.querySelector('#exam-question-region').value = question?.region || '';
  document.querySelector('#exam-question-target').value = question?.target || '';
  document.querySelector('#exam-question-tags').value = (question?.tags || []).join('，');
  document.querySelector('#exam-question-explanation').value = question?.explanation || '';
  document.querySelector('#exam-question-reason').value = question?.errorReason || '';
  document.querySelector('#exam-question-mistake').checked = Boolean(question?.isMistake);
  document.querySelector('#delete-exam-question').classList.toggle('hidden', !question);
  document.querySelector('#exam-question-dialog').showModal();
}

function renderSettings() {
  const settings = data.settings;
  applyTheme(settings);
  renderModuleManager();
  document.querySelector('#setting-pet-visible').checked = Boolean(settings.petVisible);
  document.querySelector('#setting-pet-top').checked = Boolean(settings.petAlwaysOnTop);
  document.querySelector('#quiet-start').value = settings.quietStart;
  document.querySelector('#quiet-end').value = settings.quietEnd;
  document.querySelector('#course-notice').value = settings.courseNoticeMinutes;
  document.querySelector('#focus-minutes').value = settings.focusMinutes;
  document.querySelector('#break-minutes').value = settings.shortBreakMinutes;
  updateScaleControls(settings.petScale);
  document.querySelector('#frame-ms').value = settings.frameMs;
  document.querySelector('#daily-word-goal').value = settings.dailyWordGoal ?? 20;
  document.querySelector('#pronunciation-locale').value = settings.pronunciationLocale || 'en-US';
  document.querySelector('#pronunciation-rate').value = settings.pronunciationRate || 1;
  document.querySelector('#pronunciation-rate-label').textContent = `${Number(settings.pronunciationRate || 1).toFixed(1)}×`;
  document.querySelector('#auto-pronounce').checked = Boolean(settings.autoPronounce);
  document.querySelector('#translation-provider').value = settings.translationProvider || 'baidu';
  document.querySelector('#translation-baidu-auth-mode').value = translationSettingsState?.baiduAuthMode || settings.translationBaiduAuthMode || 'apiKey';
  document.querySelector('#translation-baidu-model').value = translationSettingsState?.baiduModel || settings.translationBaiduModel || 'nmt';
  document.querySelector('#translation-baidu-app-id').value = translationSettingsState?.baiduAppId ?? settings.translationBaiduAppId ?? '';
  document.querySelector('#translation-youdao-app-key').value = translationSettingsState?.youdaoAppKey ?? settings.translationYoudaoAppKey ?? '';
  document.querySelector('#auto-translate-reading').checked = settings.autoTranslateReading !== false;
  updateTranslationProviderFields();
  const translationStatus = document.querySelector('#translation-provider-status');
  if (translationSettingsState?.misplacedBaiduApiKey) {
    translationStatus.textContent = '检测到 SK- 开头的 API Key 被填在 App ID 中；请更换已暴露的 Key，并按页面提示重新填写';
    translationStatus.dataset.state = 'error';
  } else if (translationSettingsState?.configured) {
    translationStatus.textContent = `${translationSettingsState.provider === 'youdao' ? '有道翻译' : '百度翻译'}已配置，可联网翻译`;
    translationStatus.dataset.state = 'ready';
  } else if (translationSettingsState?.movedMisplacedBaiduApiKey) {
    translationStatus.textContent = '已将填错位置的 API Key 移入加密存储；该 Key 已在截图中暴露，建议作废并新建，然后补填真正的 App ID';
    translationStatus.dataset.state = 'error';
  } else {
    translationStatus.textContent = '填写 App ID 和当前鉴权方式的密钥后，点击“保存并测试翻译”';
    translationStatus.dataset.state = 'idle';
  }
  const custom = settings.customTheme || themePresets.latte;
  document.querySelector('#theme-accent').value = custom.accent || themePresets.latte.accent;
  document.querySelector('#theme-canvas').value = custom.canvas || themePresets.latte.canvas;
  document.querySelector('#theme-paper').value = custom.paper || themePresets.latte.paper;
  document.querySelector('#theme-sidebar').value = custom.sidebar || themePresets.latte.sidebar;
  updatePronunciationStatus();
}

function updateTranslationProviderFields() {
  const provider = document.querySelector('#translation-provider').value || 'baidu';
  document.querySelectorAll('[data-provider-fields]').forEach(group => { group.hidden = group.dataset.providerFields !== provider; });
  const baiduAuthMode = document.querySelector('#translation-baidu-auth-mode').value || 'apiKey';
  document.querySelectorAll('[data-baidu-auth-field]').forEach(field => { field.hidden = field.dataset.baiduAuthField !== baiduAuthMode; });
  const baiduSecret = document.querySelector('#translation-baidu-secret');
  const baiduApiKey = document.querySelector('#translation-baidu-api-key');
  const youdaoSecret = document.querySelector('#translation-youdao-secret');
  baiduSecret.placeholder = translationSettingsState?.hasBaiduSecret ? '密钥已加密保存；留空保持不变' : '输入后加密保存在这台电脑';
  baiduApiKey.placeholder = translationSettingsState?.hasBaiduApiKey ? 'API Key 已加密保存；留空保持不变' : '以 SK- 开头，输入后加密保存';
  youdaoSecret.placeholder = translationSettingsState?.hasYoudaoSecret ? '密钥已加密保存；留空保持不变' : '输入后加密保存在这台电脑';
}

async function saveTranslationConfigFromForm(showMessage = true) {
  const baiduAppId = document.querySelector('#translation-baidu-app-id').value.trim();
  if (document.querySelector('#translation-provider').value === 'baidu' && /^sk-/i.test(baiduAppId)) {
    throw new Error('SK- 开头的是 API Key，请填在“百度 API Key”；App ID 请点击“查看 App ID”获取');
  }
  const payload = {
    provider: document.querySelector('#translation-provider').value,
    baiduAuthMode: document.querySelector('#translation-baidu-auth-mode').value,
    baiduModel: document.querySelector('#translation-baidu-model').value,
    baiduAppId,
    youdaoAppKey: document.querySelector('#translation-youdao-app-key').value.trim(),
    autoTranslateReading: document.querySelector('#auto-translate-reading').checked
  };
  const baiduSecret = document.querySelector('#translation-baidu-secret').value;
  const baiduApiKey = document.querySelector('#translation-baidu-api-key').value;
  const youdaoSecret = document.querySelector('#translation-youdao-secret').value;
  if (baiduSecret) payload.baiduSecret = baiduSecret;
  if (baiduApiKey) payload.baiduApiKey = baiduApiKey;
  if (youdaoSecret) payload.youdaoSecret = youdaoSecret;
  translationSettingsState = await window.companion.saveTranslationSettings(payload);
  data.settings.translationProvider = translationSettingsState.provider;
  data.settings.translationBaiduAuthMode = translationSettingsState.baiduAuthMode;
  data.settings.translationBaiduModel = translationSettingsState.baiduModel;
  data.settings.translationBaiduAppId = translationSettingsState.baiduAppId;
  data.settings.translationYoudaoAppKey = translationSettingsState.youdaoAppKey;
  data.settings.autoTranslateReading = translationSettingsState.autoTranslateReading;
  document.querySelector('#translation-baidu-secret').value = '';
  document.querySelector('#translation-baidu-api-key').value = '';
  document.querySelector('#translation-youdao-secret').value = '';
  updateTranslationProviderFields();
  if (showMessage) showToast('在线翻译设置已安全保存');
  return translationSettingsState;
}

function updateScaleControls(rawScale) {
  const scale = Math.round(Math.max(0.2, Math.min(5, Number(rawScale) || 1)) * 100) / 100;
  document.querySelector('#pet-scale').value = scale;
  const range = document.querySelector('#pet-scale-range');
  range.value = scale;
  range.style.setProperty('--scale-progress', `${((scale - 0.2) / 4.8) * 100}%`);
  document.querySelector('#pet-scale-percent').textContent = `${Math.round(scale * 100)}%`;
  document.querySelector('#dashboard-pet').style.setProperty('--pet-scale', scale);
  return scale;
}

function previewPetScale(rawScale) {
  if (rawScale === '' || !Number.isFinite(Number(rawScale))) return;
  const scale = updateScaleControls(rawScale);
  data.settings.petScale = scale;
  window.companion.setPetScale(scale, false);
}

async function commitPetScale(rawScale) {
  const scale = updateScaleControls(rawScale);
  data.settings.petScale = await window.companion.setPetScale(scale, true);
  updateScaleControls(data.settings.petScale);
}

function renderAll() {
  applyModuleSettings(); renderDashboard(); renderCharacters(); renderSchedule(); renderTodos(); renderVocabulary(); renderCalendar(); renderExam(); renderFinalExam(); renderSettings(); renderPomodoro(pomodoroState);
}

function openCourseDialog(course) {
  const editing = Boolean(course);
  document.querySelector('#course-dialog-title').textContent = editing ? '编辑课程' : '添加课程';
  document.querySelector('#course-id').value = course?.id || '';
  document.querySelector('#course-name').value = course?.name || '';
  document.querySelector('#course-weekday').value = course?.weekday || String(new Date().getDay() || 7);
  document.querySelector('#course-color').value = course?.color || '#59598f';
  document.querySelector('#course-start').value = course?.startTime || '08:00';
  document.querySelector('#course-end').value = course?.endTime || '09:40';
  document.querySelector('#course-location').value = course?.location || '';
  document.querySelector('#course-teacher').value = course?.teacher || '';
  document.querySelector('#delete-course').classList.toggle('hidden', !editing);
  document.querySelector('#course-dialog').showModal();
}

function openCharacterDialog(character) {
  const editing = Boolean(character);
  document.querySelector('#character-dialog-title').textContent = editing ? '编辑角色档案' : '添加角色';
  document.querySelector('#character-id').value = character?.id || '';
  document.querySelector('#character-name').value = character?.name || '';
  document.querySelector('#character-identity').value = character?.identity || '';
  document.querySelector('#character-personality').value = character?.personality || '';
  document.querySelector('#character-catchphrase').value = character?.catchphrase || '';
  document.querySelector('#character-accent').value = character?.accent || '#59598f';
  document.querySelector('#character-memory').value = character?.memory?.summary || '';
  document.querySelector('#delete-character').classList.toggle('hidden', !editing || character?.id === 'char_default' || data.characters.length <= 1);
  document.querySelector('#character-dialog').showModal();
}

async function addTodo(title, dueAt, priority) {
  data.todos.push({ id: crypto.randomUUID(), title, dueAt: dueAt ? new Date(dueAt).toISOString() : null, priority, done: false, notified: false, createdAt: new Date().toISOString() });
  await persist('已加入待办清单');
  renderAll();
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
document.querySelector('#final-tabs').addEventListener('click', async event => {
  const button = event.target.closest('[data-final-tab]'); if (!button) return;
  const finals = ensureFinalExamData(); finals.activeTab = button.dataset.finalTab; finalExamTab = finals.activeTab;
  await persist(); renderFinalExam();
});
document.querySelector('#final-import').addEventListener('click', importFinalExamFiles);
document.querySelector('#final-choose-file').addEventListener('click', importFinalExamFiles);
document.querySelector('#final-new-session').addEventListener('click', () => startFinalSession());
document.querySelector('#final-practice-mistakes').addEventListener('click', () => startFinalSession({ mistakesOnly: true }));
document.querySelector('#final-abandon-session').addEventListener('click', async () => {
  const finals = ensureFinalExamData(); finals.session = null; await persist('本组已结束，已完成记录仍然保留'); renderFinalExam();
});
document.querySelectorAll('#final-source-filter, #final-chapter-filter, #final-type-filter, #final-session-size').forEach(control => control.addEventListener('change', async event => {
  const finals = ensureFinalExamData();
  if (event.target.id === 'final-source-filter') { finals.activeSourceId = event.target.value; finals.activeChapter = 'all'; }
  if (event.target.id === 'final-chapter-filter') finals.activeChapter = event.target.value;
  if (event.target.id === 'final-type-filter') finals.activeType = event.target.value;
  if (event.target.id === 'final-session-size') finals.sessionSize = Number(event.target.value) || 10;
  await persist(); renderFinalExam();
}));
document.querySelector('#final-practice-card').addEventListener('click', async event => {
  if (event.target.closest('[data-final-start]')) return startFinalSession();
  if (event.target.closest('[data-final-import]')) return importFinalExamFiles();
  const finals = ensureFinalExamData(); const session = finals.session; if (!session) return;
  const questionIndex = finals.questions.findIndex(item => item.id === session.questionIds[session.index]);
  const question = finals.questions[questionIndex]; if (!question) return;
  const answer = event.target.closest('[data-final-answer]'); const selfGrade = event.target.closest('[data-final-self-grade]'); const fillCheck = event.target.closest('[data-final-check-fill]');
  if ((answer || selfGrade || fillCheck) && !session.answeredKey) {
    const submittedText = fillCheck ? document.querySelector('#final-fill-input')?.value.trim() : '';
    if (fillCheck && !submittedText) return showToast('请先填写答案');
    const correct = fillCheck ? FinalExamCore.gradeFill(question, submittedText) : selfGrade ? selfGrade.dataset.finalSelfGrade === 'right' : FinalExamCore.grade(question, answer.dataset.finalAnswer);
    const updated = FinalExamCore.recordAttempt(question, correct);
    finals.questions[questionIndex] = updated; session.answeredKey = fillCheck ? 'FILL' : selfGrade ? (correct ? 'SELF_RIGHT' : 'SELF_WRONG') : answer.dataset.finalAnswer; session.submittedText = submittedText; session.answeredCorrect = correct;
    session.correct = (session.correct || 0) + (correct ? 1 : 0); session.wrong = (session.wrong || 0) + (correct ? 0 : 1);
    finals.attempts.push({ id: crypto.randomUUID(), questionId: question.id, selectedKey: session.answeredKey, correct, attemptedAt: new Date().toISOString(), sessionStartedAt: session.startedAt });
    addActivity('exam', `${correct ? '答对' : '答错'}期末复习题`, `${question.chapter || '综合复习'} · ${finalQuestionTypeLabel(question.type)}`);
    await persist(correct ? '回答正确，记忆进度已更新' : '已加入错题本，5 分钟后优先再见'); renderFinalExam(); renderCalendar(); return;
  }
  if (event.target.closest('[data-final-next]')) {
    session.index += 1; session.answeredKey = ''; session.submittedText = ''; session.answeredCorrect = null; await persist(); renderFinalExam();
  }
});
document.querySelector('#final-practice-card').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('#final-fill-input')) { event.preventDefault(); document.querySelector('[data-final-check-fill]')?.click(); }
});
document.querySelector('#page-finalExam').addEventListener('click', async event => {
  const openSource = event.target.closest('[data-final-open-source]');
  if (openSource) {
    const source = ensureFinalExamData().sources.find(item => item.id === openSource.dataset.finalOpenSource);
    if (!source?.relativePath) return showToast('这份资料没有可打开的本地副本');
    const result = await window.companion.openLibraryFile(source.relativePath); if (result) showToast(result); return;
  }
  const deleteQuestion = event.target.closest('[data-final-delete-question]');
  if (deleteQuestion) {
    if (!confirm('删除这道复习题及对应作答记录？')) return;
    const finals = ensureFinalExamData(); const id = deleteQuestion.dataset.finalDeleteQuestion;
    finals.questions = finals.questions.filter(item => item.id !== id); finals.attempts = finals.attempts.filter(item => item.questionId !== id);
    if (finals.session) finals.session.questionIds = finals.session.questionIds.filter(item => item !== id);
    await persist('题目已删除'); renderFinalExam(); return;
  }
  const deleteSource = event.target.closest('[data-final-delete-source]');
  if (deleteSource) {
    if (!confirm('删除这份资料、由它生成的题目和练习记录？本地资料副本也会删除。')) return;
    const finals = ensureFinalExamData(); const source = finals.sources.find(item => item.id === deleteSource.dataset.finalDeleteSource); const ids = new Set(finals.questions.filter(item => item.sourceId === source?.id).map(item => item.id));
    finals.sources = finals.sources.filter(item => item.id !== source?.id); finals.questions = finals.questions.filter(item => item.sourceId !== source?.id); finals.attempts = finals.attempts.filter(item => !ids.has(item.questionId)); finals.session = null;
    if (source?.relativePath) await window.companion.deleteLibraryFile(source.relativePath);
    await persist('资料和对应题目已删除'); renderFinalExam();
  }
});
const finalDropzone = document.querySelector('#final-dropzone');
['dragenter', 'dragover'].forEach(type => finalDropzone.addEventListener(type, event => { event.preventDefault(); finalDropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => finalDropzone.addEventListener(type, event => { event.preventDefault(); finalDropzone.classList.remove('dragging'); }));
finalDropzone.addEventListener('drop', event => importDroppedFinalExamFiles(event.dataTransfer));
document.body.addEventListener('click', event => {
  const target = event.target.closest('[data-go]');
  if (target) setPage(target.dataset.go);
});
document.body.addEventListener('keydown', event => {
  const target = event.target.closest('[data-go][role="button"]');
  if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setPage(target.dataset.go); }
});
document.querySelector('#top-add').addEventListener('click', () => {
  if (currentPage === 'ai') return window.AIWorkspace?.newSession();
  if (currentPage === 'schedule') openCourseDialog();
  else if (currentPage === 'characters') openCharacterDialog();
  else if (currentPage === 'vocabulary' && englishTab === 'books') chooseAndArchiveBooks();
  else if (currentPage === 'vocabulary' && englishTab === 'articles') openEnglishArticleDialog();
  else if (currentPage === 'vocabulary' && englishTab === 'sentences') openEnglishSentenceDialog();
  else if (currentPage === 'vocabulary' && englishTab === 'ai') updateAiPromptPreview();
  else if (currentPage === 'vocabulary') document.querySelector('#import-file').click();
  else if (currentPage === 'civilService') document.querySelector('#exam-import').click();
  else if (currentPage === 'finalExam') importFinalExamFiles();
  else setPage('todos');
});
document.querySelector('#dashboard-add-todo').addEventListener('click', () => { setPage('todos'); document.querySelector('#todo-title').focus(); });
document.querySelector('#add-course').addEventListener('click', () => openCourseDialog());
document.querySelector('#add-character').addEventListener('click', () => openCharacterDialog());
document.querySelector('#week-prev').addEventListener('click', () => { weekOffset -= 1; renderSchedule(); });
document.querySelector('#week-next').addEventListener('click', () => { weekOffset += 1; renderSchedule(); });
document.querySelector('#week-today').addEventListener('click', () => { weekOffset = 0; renderSchedule(); });
document.querySelector('#week-grid').addEventListener('click', event => {
  const card = event.target.closest('[data-course-id]');
  if (card) openCourseDialog(data.courses.find(course => course.id === card.dataset.courseId));
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.querySelector('#course-dialog').close()));
document.querySelector('#course-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#course-id').value || crypto.randomUUID();
  const course = {
    id, name: document.querySelector('#course-name').value.trim(), weekday: Number(document.querySelector('#course-weekday').value),
    color: document.querySelector('#course-color').value, startTime: document.querySelector('#course-start').value,
    endTime: document.querySelector('#course-end').value, location: document.querySelector('#course-location').value.trim(), teacher: document.querySelector('#course-teacher').value.trim()
  };
  const index = data.courses.findIndex(item => item.id === id);
  if (index >= 0) data.courses[index] = course; else data.courses.push(course);
  await persist(index >= 0 ? '课程已更新' : '课程已添加');
  document.querySelector('#course-dialog').close(); renderAll();
});
document.querySelector('#delete-course').addEventListener('click', async () => {
  const id = document.querySelector('#course-id').value;
  data.courses = data.courses.filter(course => course.id !== id);
  await persist('课程已删除'); document.querySelector('#course-dialog').close(); renderAll();
});

document.querySelectorAll('[data-close-character]').forEach(button => button.addEventListener('click', () => document.querySelector('#character-dialog').close()));
document.querySelector('#character-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#character-id').value || `char_${crypto.randomUUID()}`;
  const existing = data.characters.find(character => character.id === id);
  const character = {
    id,
    name: document.querySelector('#character-name').value.trim(),
    identity: document.querySelector('#character-identity').value.trim(),
    personality: document.querySelector('#character-personality').value.trim(),
    catchphrase: document.querySelector('#character-catchphrase').value.trim(),
    accent: document.querySelector('#character-accent').value,
    enabled: true,
    memory: { affinity: 0, interactionCount: 0, lastInteractionAt: null, ...(existing?.memory || {}), summary: document.querySelector('#character-memory').value.trim() }
  };
  const index = data.characters.findIndex(item => item.id === id);
  if (index >= 0) data.characters[index] = character; else {
    data.characters.push(character);
    data.settings.stageCharacterIds.push(id);
  }
  await persist(index >= 0 ? '角色档案已更新' : '角色已加入剧场');
  document.querySelector('#character-dialog').close();
  renderAll(); await loadDashboardCharacter();
  if (index < 0) window.companion.openCharacterFolder(id);
});
document.querySelector('#delete-character').addEventListener('click', async () => {
  const id = document.querySelector('#character-id').value;
  if (id === 'char_default' || data.characters.length <= 1) return;
  data.characters = data.characters.filter(character => character.id !== id);
  data.settings.stageCharacterIds = data.settings.stageCharacterIds.filter(characterId => characterId !== id);
  if (data.settings.activeCharacterId === id) data.settings.activeCharacterId = data.characters[0].id;
  if (!data.settings.stageCharacterIds.length) data.settings.stageCharacterIds = [data.settings.activeCharacterId];
  await persist('角色档案已删除；图片文件夹仍保留');
  document.querySelector('#character-dialog').close(); renderAll(); await loadDashboardCharacter();
});
document.querySelector('#character-grid').addEventListener('click', async event => {
  const activeButton = event.target.closest('[data-character-active]');
  const stageButton = event.target.closest('[data-character-stage]');
  const folderButton = event.target.closest('[data-character-folder]');
  const editButton = event.target.closest('[data-character-edit]');
  if (folderButton) return window.companion.openCharacterFolder(folderButton.dataset.characterFolder);
  if (editButton) return openCharacterDialog(data.characters.find(character => character.id === editButton.dataset.characterEdit));
  if (activeButton) {
    data.settings.activeCharacterId = activeButton.dataset.characterActive;
    data.settings.stageMode = 'single';
    if (!data.settings.stageCharacterIds.includes(data.settings.activeCharacterId)) data.settings.stageCharacterIds.push(data.settings.activeCharacterId);
    await persist(`${data.characters.find(character => character.id === data.settings.activeCharacterId)?.name} 已单独上场`);
    renderAll(); await loadDashboardCharacter(); return;
  }
  if (stageButton) {
    const id = stageButton.dataset.characterStage;
    const selected = data.settings.stageCharacterIds.includes(id);
    if (selected && data.settings.stageCharacterIds.length === 1) return showToast('舞台至少保留一位角色');
    if (!selected && data.settings.stageCharacterIds.length >= 3) return showToast('电脑版舞台暂时最多同时显示 3 位角色');
    data.settings.stageCharacterIds = selected ? data.settings.stageCharacterIds.filter(item => item !== id) : [...data.settings.stageCharacterIds, id];
    await persist(selected ? '已移出多人舞台' : '已加入多人舞台'); renderCharacters();
  }
});
document.querySelector('#stage-mode-switch').addEventListener('click', async event => {
  const button = event.target.closest('[data-stage-mode]'); if (!button) return;
  data = await window.companion.toggleStageMode(button.dataset.stageMode); renderCharacters(); await loadDashboardCharacter();
});
document.querySelector('#next-character').addEventListener('click', async () => {
  data = await window.companion.cycleCharacter(); renderAll(); await loadDashboardCharacter();
});

document.querySelector('#todo-form').addEventListener('submit', async event => {
  event.preventDefault();
  const title = document.querySelector('#todo-title').value.trim();
  if (!title) return;
  await addTodo(title, document.querySelector('#todo-due').value, document.querySelector('#todo-priority').value);
  event.target.reset(); document.querySelector('#todo-priority').value = 'medium';
});
document.querySelector('#todo-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  todoFilter = button.dataset.filter;
  document.querySelectorAll('#todo-filters button').forEach(item => item.classList.toggle('active', item === button));
  renderTodos();
});
document.body.addEventListener('change', async event => {
  if (!event.target.matches('[data-todo-check]')) return;
  const todo = data.todos.find(item => item.id === event.target.dataset.todoCheck);
  if (!todo) return;
  todo.done = event.target.checked;
  if (todo.done) addActivity('todo', `完成待办：${todo.title}`, todo.dueAt ? `原定 ${formatDateTime(todo.dueAt)}` : '未设置截止时间');
  await persist(todo.done ? '完成了一项，做得好' : '已恢复到待办'); renderAll();
});
document.querySelector('#todo-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-todo]'); if (!button) return;
  data.todos = data.todos.filter(todo => todo.id !== button.dataset.deleteTodo); await persist('待办已删除'); renderAll();
});

document.querySelector('#import-file').addEventListener('click', async () => {
  const file = await window.companion.importVocabularyFile();
  if (file) await importVocabularyText(file.text, file.name);
});
document.querySelector('#import-paste').addEventListener('click', async () => {
  const text = document.querySelector('#vocab-paste').value;
  if (!text.trim()) return showToast('请先粘贴单词文本');
  await importVocabularyText(text, '粘贴内容');
  document.querySelector('#vocab-paste').value = '';
});
document.querySelector('#review-reveal').addEventListener('click', () => { reviewShowingAnswer = true; rememberReviewSession(); renderReviewCard(); });
document.querySelector('#review-speak').addEventListener('click', () => speakVocabularyWord(currentReviewWord()));
document.querySelector('#review-favorite').addEventListener('click', async () => {
  const word = currentReviewWord();
  if (!word) return;
  word.favorite = !word.favorite;
  await persist(word.favorite ? `已收藏 ${word.front}` : `已取消收藏 ${word.front}`);
  renderVocabulary();
});
document.querySelector('#review-previous').addEventListener('click', () => moveReviewCard(-1));
document.querySelector('#review-next').addEventListener('click', () => moveReviewCard(1));
document.querySelector('#review-group-size').addEventListener('change', async event => {
  data.settings.reviewGroupSize = Math.max(3, Math.min(50, Number(event.target.value) || 10));
  reviewCycleSeenIds.clear(); buildReviewQueue(false); await persist('已设置每组单词数'); renderVocabulary();
});
document.querySelector('#start-review-group').addEventListener('click', beginNextReviewGroup);
document.querySelector('#rating-row').addEventListener('click', async event => {
  const button = event.target.closest('[data-rating]');
  const word = currentReviewWord();
  if (!button || !word || reviewSessionRatings[word.id]) return;
  const updated = VocabularyCore.scheduleReview(word, button.dataset.rating);
  const index = data.vocabulary.findIndex(item => item.id === word.id);
  data.vocabulary[index] = updated;
  data.reviewLog.push({ id: crypto.randomUUID(), wordId: word.id, rating: button.dataset.rating, reviewedAt: updated.lastReviewedAt });
  addActivity('word', `复习单词：${word.front}`, `${word.back || '未填写释义'} · ${button.dataset.rating}` , updated.lastReviewedAt);
  if (data.reviewLog.length > 10000) data.reviewLog = data.reviewLog.slice(-10000);
  reviewSessionRatings[word.id] = button.dataset.rating;
  reviewCompleted = Object.keys(reviewSessionRatings).length;
  reviewShowingAnswer = false;
  if (reviewCompleted >= reviewSessionTotal) {
    openReviewChoice();
  } else {
    const nextIndex = reviewQueue.findIndex((id, candidateIndex) => candidateIndex > reviewSessionIndex && !reviewSessionRatings[id]);
    reviewSessionIndex = nextIndex >= 0 ? nextIndex : reviewQueue.findIndex(id => !reviewSessionRatings[id]);
  }
  rememberReviewSession();
  await persist();
  renderVocabulary();
});
document.querySelector('#start-review-quiz').addEventListener('click', async () => {
  startReviewQuiz();
  if (reviewPhase === 'complete') { saveQuizHistory(); await persist(); }
  renderVocabulary();
});
document.querySelector('#skip-review-quiz').addEventListener('click', () => { showToast('已跳过本组测验'); beginNextReviewGroup(); });
document.querySelector('#return-review-group').addEventListener('click', () => { reviewPhase = 'memory'; reviewSessionComplete = false; reviewSessionIndex = Math.max(0, reviewQueue.length - 1); reviewShowingAnswer = false; rememberReviewSession(); renderReviewCard(); });
document.querySelector('#review-quiz-options').addEventListener('click', async event => {
  const button = event.target.closest('[data-quiz-option]'); if (!button || reviewQuizAnswered || reviewPhase !== 'quiz') return;
  const question = reviewQuizQuestions[reviewQuizIndex]; const selected = question.options[Number(button.dataset.quizOption)]; const correct = selected === question.correct;
  reviewQuizAnswered = true; if (correct) reviewQuizCorrect += 1;
  if (!reviewSessionRatings[question.wordId]) {
    const word = data.vocabulary.find(item => item.id === question.wordId); const rating = correct ? 'good' : 'again'; const updated = VocabularyCore.scheduleReview(word, rating); const wordIndex = data.vocabulary.findIndex(item => item.id === word.id);
    data.vocabulary[wordIndex] = updated; reviewSessionRatings[word.id] = rating; data.reviewLog.push({ id: crypto.randomUUID(), wordId: word.id, rating, reviewedAt: updated.lastReviewedAt }); reviewCompleted = Object.keys(reviewSessionRatings).length;
    addActivity('word', `测验单词：${word.front}`, `${correct ? '答对' : '答错'} · ${word.back}`, updated.lastReviewedAt);
  }
  document.querySelectorAll('[data-quiz-option]').forEach(option => {
    const value = question.options[Number(option.dataset.quizOption)]; option.disabled = true;
    option.classList.toggle('correct', value === question.correct); option.classList.toggle('wrong', option === button && !correct);
  });
  const feedback = document.querySelector('#review-quiz-feedback'); feedback.hidden = false; feedback.textContent = correct ? '答对了。这个词已经建立了双向联系。' : `正确答案：${question.correct}`;
  document.querySelector('#review-quiz-next').hidden = false;
  rememberReviewSession();
  await persist();
});
document.querySelector('#review-quiz-next').addEventListener('click', async () => {
  if (reviewPhase === 'complete') { beginNextReviewGroup(); return; }
  if (!reviewQuizAnswered) return;
  if (reviewQuizIndex < reviewQuizQuestions.length - 1) { reviewQuizIndex += 1; reviewQuizAnswered = false; rememberReviewSession(); renderReviewQuiz(); return; }
  reviewPhase = 'complete'; saveQuizHistory(); rememberReviewSession(); await persist('本组小测已保存'); renderVocabulary();
});
document.querySelector('#review-all').addEventListener('click', () => { reviewCycleSeenIds.clear(); buildReviewQueue(true); renderVocabulary(); });
document.querySelector('#vocab-search').addEventListener('input', renderVocabulary);
document.querySelector('#favorite-word-filter').addEventListener('click', () => {
  favoriteWordsOnly = !favoriteWordsOnly;
  renderVocabulary();
});
document.querySelector('#vocab-list').addEventListener('click', async event => {
  const favoriteButton = event.target.closest('[data-favorite-word]');
  if (favoriteButton) {
    const word = data.vocabulary.find(item => item.id === favoriteButton.dataset.favoriteWord);
    if (!word) return;
    word.favorite = !word.favorite;
    await persist(word.favorite ? `已收藏 ${word.front}` : `已取消收藏 ${word.front}`);
    renderVocabulary();
    return;
  }
  const audioButton = event.target.closest('[data-speak-word]');
  if (audioButton) {
    const word = data.vocabulary.find(item => item.id === audioButton.dataset.speakWord);
    if (word) speakVocabularyWord(word);
    return;
  }
  const button = event.target.closest('[data-delete-word]');
  if (!button) return;
  data.vocabulary = data.vocabulary.filter(word => word.id !== button.dataset.deleteWord);
  reviewQueue = reviewQueue.filter(id => id !== button.dataset.deleteWord);
  await persist('单词已删除');
  renderVocabulary();
});

document.querySelector('#english-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-english-tab]');
  if (button) setEnglishTab(button.dataset.englishTab);
});
document.querySelectorAll('#add-english-article, #add-english-article-mini').forEach(button => button.addEventListener('click', () => openEnglishArticleDialog()));
document.querySelectorAll('[data-close-english-article]').forEach(button => button.addEventListener('click', () => document.querySelector('#english-article-dialog').close()));
document.querySelector('#english-article-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#english-article-id').value || crypto.randomUUID();
  const existing = englishArticleById(id);
  const article = {
    id,
    title: document.querySelector('#english-article-title').value.trim(),
    source: document.querySelector('#english-article-source').value.trim(),
    url: document.querySelector('#english-article-url').value.trim(),
    body: document.querySelector('#english-article-body').value.trim(),
    tags: parseTags(document.querySelector('#english-article-tags').value),
    level: document.querySelector('#english-article-level').value,
    note: document.querySelector('#english-article-note').value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const index = data.english.articles.findIndex(item => item.id === id);
  if (index >= 0) data.english.articles[index] = article; else data.english.articles.unshift(article);
  const readingSet = data.english.readingSets?.find(set => set.articleId === id || set.id === existing?.readingSetId);
  if (readingSet) { article.readingSetId = readingSet.id; readingSet.title = article.title; readingSet.passage = article.body; readingSet.updatedAt = new Date().toISOString(); }
  data.english.selectedArticleId = id;
  if (!existing) addActivity('word', `收藏英文文章：${article.title}`, article.source || article.url || '粘贴内容');
  await persist(existing ? '文章收藏已更新' : '文章已收藏');
  document.querySelector('#english-article-dialog').close(); renderVocabulary();
});
document.querySelector('#article-search').addEventListener('input', renderEnglishArticles);
document.querySelector('#article-list').addEventListener('click', event => {
  const button = event.target.closest('[data-article-id]'); if (!button) return;
  data.english.selectedArticleId = button.dataset.articleId; selectedEnglishQuestionIndex = 0; renderEnglishArticles();
});
document.querySelector('#edit-english-article').addEventListener('click', () => openEnglishArticleDialog(englishArticleById()));
document.querySelector('#delete-english-article').addEventListener('click', async () => {
  const article = englishArticleById(); if (!article) return;
  if (!confirm(`删除文章“${article.title}”？已经收藏的句子和单词会保留。`)) return;
  data.english.articles = data.english.articles.filter(item => item.id !== article.id);
  data.english.readingSets = (data.english.readingSets || []).filter(set => set.articleId !== article.id && set.id !== article.readingSetId);
  data.english.selectedArticleId = data.english.articles[0]?.id || null;
  if (article.relativePath && confirm('是否同时删除资料库中的原文件？\n选择“取消”只删除收藏记录，原文件会保留。')) await window.companion.deleteLibraryFile(article.relativePath);
  await persist('文章已删除；句子和单词仍保留'); renderVocabulary();
});
document.querySelector('#open-article-source').addEventListener('click', async () => {
  const article = englishArticleById(); if (!article) return;
  if (article.relativePath) {
    const result = await window.companion.openLibraryFile(article.relativePath);
    if (result) showToast(result);
    return;
  }
  if (!article.url) return;
  if (!await window.companion.openExternalUrl(article.url)) showToast('网址格式不正确，只能打开 http 或 https 网页');
});
document.querySelector('#article-body').addEventListener('click', event => {
  const button = event.target.closest('[data-article-word]'); if (!button) return;
  const article = englishArticleById();
  openEnglishWordDialog(button.dataset.articleWord, article, sentenceAround(article?.body, button.dataset.articleWord));
});
document.querySelector('#save-selected-sentence').addEventListener('click', () => {
  const selected = window.getSelection().toString().trim();
  if (!selected) return showToast('请先在正文中选中一个句子');
  openEnglishSentenceDialog({}, selected, englishArticleById());
});
document.querySelector('#save-selected-phrase').addEventListener('click', () => {
  const selected = window.getSelection().toString().trim();
  if (!selected) return showToast('请先在正文中选中一个单词或短语');
  if (selected.length > 120) return showToast('短语太长了，建议收藏为句子');
  openEnglishWordDialog(selected, englishArticleById(), sentenceAround(englishArticleById()?.body, selected));
});
document.querySelector('#english-reading-question-panel').addEventListener('click', async event => {
  const article = englishArticleById(); const set = englishReadingSetForArticle(article); if (!set) return;
  const nav = event.target.closest('[data-english-reading-question]');
  if (nav) { selectedEnglishQuestionIndex = Number(nav.dataset.englishReadingQuestion) || 0; renderEnglishReadingSet(article); return; }
  const question = set.questions[selectedEnglishQuestionIndex]; if (!question) return;
  const option = event.target.closest('[data-english-reading-option]');
  if (option) {
    const key = option.dataset.englishReadingOption;
    if (question.type === 'multiple') {
      const selected = new Set(String(question.userAnswer || '').split('').filter(Boolean)); selected.has(key) ? selected.delete(key) : selected.add(key); question.userAnswer = [...selected].sort().join('');
    } else question.userAnswer = key;
    question.checked = false; renderEnglishReadingSet(article); return;
  }
  if (event.target.closest('#speak-english-question')) { speakWord(question.stem); return; }
  if (event.target.closest('#check-english-reading-answer')) {
    const subjective = document.querySelector('[data-english-subjective-answer]'); if (subjective) question.userAnswer = subjective.value.trim();
    if (!question.userAnswer) return showToast('请先作答');
    question.checked = true; question.correct = question.answer ? String(question.userAnswer).toUpperCase() === String(question.answer).toUpperCase() : null;
    question.attempts ||= []; question.attempts.push({ answer: question.userAnswer, correct: question.correct, attemptedAt: new Date().toISOString() });
    addActivity('word', `完成英语阅读子题：${set.title}`, `${selectedEnglishQuestionIndex + 1}/${set.questions.length} · ${question.correct === true ? '正确' : question.correct === false ? '需要复习' : '已作答'}`);
    await persist('英语阅读作答已保存'); renderEnglishReadingSet(article); renderCalendar();
  }
});

document.querySelector('#add-english-sentence').addEventListener('click', () => openEnglishSentenceDialog());
document.querySelectorAll('[data-close-english-sentence]').forEach(button => button.addEventListener('click', () => document.querySelector('#english-sentence-dialog').close()));
document.querySelector('#english-sentence-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#english-sentence-id').value || crypto.randomUUID();
  const existing = data.english.sentences.find(item => item.id === id);
  const sentence = {
    id, articleId: document.querySelector('#english-sentence-article-id').value || null,
    text: document.querySelector('#english-sentence-text').value.trim(),
    translation: document.querySelector('#english-sentence-translation').value.trim(),
    source: document.querySelector('#english-sentence-source').value.trim(),
    tags: parseTags(document.querySelector('#english-sentence-tags').value),
    note: document.querySelector('#english-sentence-note').value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const index = data.english.sentences.findIndex(item => item.id === id);
  if (index >= 0) data.english.sentences[index] = sentence; else data.english.sentences.unshift(sentence);
  if (!existing) addActivity('word', `收藏英文句子：${sentence.text.slice(0, 48)}`, sentence.source || sentence.note || '句子卡片');
  await persist(existing ? '句子卡片已更新' : '句子已收藏');
  document.querySelector('#english-sentence-dialog').close(); renderVocabulary();
});
document.querySelector('#delete-english-sentence').addEventListener('click', async () => {
  const id = document.querySelector('#english-sentence-id').value;
  data.english.sentences = data.english.sentences.filter(item => item.id !== id);
  await persist('句子卡片已删除'); document.querySelector('#english-sentence-dialog').close(); renderVocabulary();
});
document.querySelector('#sentence-search').addEventListener('input', renderEnglishSentences);
document.querySelector('#sentence-list').addEventListener('click', event => {
  const speak = event.target.closest('[data-speak-sentence]');
  if (speak) return speakWord(data.english.sentences.find(item => item.id === speak.dataset.speakSentence)?.text);
  const edit = event.target.closest('[data-edit-sentence]');
  if (edit) openEnglishSentenceDialog(data.english.sentences.find(item => item.id === edit.dataset.editSentence));
});

document.querySelectorAll('[data-close-english-word]').forEach(button => button.addEventListener('click', () => document.querySelector('#english-word-dialog').close()));
document.querySelector('#english-word-speak').addEventListener('click', () => speakWord(document.querySelector('#english-word-value').value || document.querySelector('#english-word-manual').value));
document.querySelector('#english-word-form').addEventListener('submit', async event => {
  event.preventDefault();
  const front = (document.querySelector('#english-word-value').value || document.querySelector('#english-word-manual').value).trim();
  if (!front || !/[A-Za-z]/.test(front)) return showToast('请填写英文单词或短语');
  const articleId = document.querySelector('#english-word-article-id').value || null;
  const article = englishArticleById(articleId) || data.english.books.find(book => book.id === articleId);
  const contextText = document.querySelector('#english-word-context').textContent.trim();
  const existing = data.vocabulary.find(word => word.front.toLocaleLowerCase() === front.toLocaleLowerCase());
  const libraryId = document.querySelector('#english-word-library').value || 'list_default';
  const context = { text: contextText, articleId, articleTitle: article?.title || '', savedAt: new Date().toISOString() };
  if (existing) {
    existing.back = document.querySelector('#english-word-meaning').value.trim() || existing.back;
    existing.tags = [...new Set([...(existing.tags || []), ...parseTags(document.querySelector('#english-word-tags').value)])];
    existing.reason = document.querySelector('#english-word-reason').value.trim() || existing.reason;
    existing.contexts ||= [];
    if (contextText && !existing.contexts.some(item => item.text === contextText && item.articleId === articleId)) existing.contexts.push(context);
    existing.sourceIds = [...new Set([...(existing.sourceIds || []), articleId].filter(Boolean))];
    existing.libraryIds = [...new Set([...(existing.libraryIds || ['list_default']), libraryId])];
  } else {
    data.vocabulary.push(VocabularyCore.normalizeWord({ id: crypto.randomUUID(), front, back: document.querySelector('#english-word-meaning').value.trim(), tags: parseTags(document.querySelector('#english-word-tags').value), reason: document.querySelector('#english-word-reason').value.trim(), contexts: contextText ? [context] : [], sourceIds: articleId ? [articleId] : [], libraryIds: [libraryId] }));
  }
  addActivity('word', `${existing ? '更新' : '收藏'}单词：${front}`, contextText || '英语词库');
  buildReviewQueue(false);
  await persist(existing ? '词条已更新，例句已经保留' : '已加入词库');
  document.querySelector('#english-word-dialog').close(); renderVocabulary();
});

document.querySelector('#ai-goals').addEventListener('change', updateAiPromptPreview);
document.querySelector('#ai-prompt-depth').addEventListener('change', event => { data.english.promptDepth = event.target.value; updateAiPromptPreview(); });
document.querySelector('#ai-material-list').addEventListener('change', updateAiPromptPreview);
document.querySelector('#refresh-ai-prompt').addEventListener('click', updateAiPromptPreview);
document.querySelector('#select-all-ai-materials').addEventListener('click', () => {
  const inputs = [...document.querySelectorAll('[data-ai-material]')];
  const shouldSelect = inputs.some(input => !input.checked); inputs.forEach(input => { input.checked = shouldSelect; }); updateAiPromptPreview();
});
document.querySelector('#copy-ai-prompt').addEventListener('click', async () => { await window.companion.copyText(document.querySelector('#ai-prompt-preview').value); showToast('学习提示词已复制'); });
document.querySelector('#copy-open-ai').addEventListener('click', async () => {
  const url = document.querySelector('#ai-website-url').value.trim() || 'https://chat.deepseek.com';
  data.english.aiWebsiteUrl = url; await persist(); await window.companion.copyText(document.querySelector('#ai-prompt-preview').value);
  if (!await window.companion.openExternalUrl(url)) return showToast('网址格式不正确，只能打开 http 或 https 网页');
  showToast('提示词已复制，请粘贴到刚打开的网页');
});

async function archiveBookImports(files) {
  if (!files?.length) return showToast('没有找到可导入的书籍');
  const imported = files.filter(item => item.book).map(item => item.book); const failed = files.filter(item => item.error && !item.book);
  if (imported.length) {
    data.english.books.push(...imported); data.english.selectedBookId = imported[0].id; englishTab = 'books'; data.english.activeTab = 'books';
    addActivity('file', `导入原版书 ${imported.length} 本`, imported.map(book => book.title).slice(0, 3).join('、'));
    await persist(`已放入书架 ${imported.length} 本${failed.length ? `，${failed.length} 本读取失败` : ''}`); renderVocabulary();
  } else showToast(failed[0]?.error || '没有可加入书架的文件');
  document.querySelector('#book-import-status').textContent = failed.length ? `${failed.length} 本读取失败：${failed[0].error}` : `已完成：${imported.map(book => book.title).join('、')}`;
}

async function chooseAndArchiveBooks() {
  document.querySelector('#book-import-status').textContent = '正在读取书籍并整理章节…';
  await archiveBookImports(await window.companion.chooseBookFiles());
}

['#choose-book-files', '#book-drop-choose', '#book-add-small'].forEach(selector => document.querySelector(selector).addEventListener('click', chooseAndArchiveBooks));
document.querySelector('#choose-local-book-folder').addEventListener('click', async () => {
  document.querySelector('#local-shelf-path').textContent = '正在扫描文件夹并整理新书…';
  const result = await window.companion.chooseLocalBookFolder();
  if (result?.canceled) return renderBookShelf();
  if (!result?.ok) return showToast(result?.error || '本地书库关联失败');
  data = result.data; renderVocabulary();
  showToast(`已关联书库：新增 ${result.imported} 本，已存在 ${result.skipped} 本${result.failed?.length ? `，${result.failed.length} 本读取失败` : ''}`);
});
document.querySelector('#sync-local-books').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true; button.textContent = '同步中…';
  const result = await window.companion.syncLocalBookFolder();
  button.textContent = '立即同步'; button.disabled = false;
  if (!result?.ok) return showToast(result?.error || '同步失败');
  data = result.data; renderVocabulary(); showToast(`扫描 ${result.scanned} 本，新增 ${result.imported} 本`);
});
document.querySelector('#book-search').addEventListener('input', renderBookShelf);
const bookDropZone = document.querySelector('#book-drop-zone');
['dragenter', 'dragover'].forEach(type => bookDropZone.addEventListener(type, event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; bookDropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => bookDropZone.addEventListener(type, event => { event.preventDefault(); bookDropZone.classList.remove('dragging'); }));
bookDropZone.addEventListener('drop', async event => {
  document.querySelector('#book-import-status').textContent = '正在读取书籍并整理章节…';
  await archiveBookImports(await importDroppedBookFiles(event.dataTransfer));
});
document.querySelector('#book-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-book-id]'); if (!button) return;
  data.english.selectedBookId = button.dataset.bookId; await persist(); renderBookShelf();
});
document.querySelector('#book-chapter-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-book-chapter]'); if (!button) return; const book = activeBook();
  book.selectedChapterId = button.dataset.bookChapter; const index = book.chapters.findIndex(chapter => chapter.id === book.selectedChapterId);
  book.progress = Math.max(book.progress || 0, Math.round((index + 1) / Math.max(1, book.chapters.length) * 100)); book.updatedAt = new Date().toISOString();
  await persist(); renderBookShelf();
});
document.querySelector('#book-chapter-text').addEventListener('click', event => {
  const token = event.target.closest('[data-article-word]'); if (!token) return; const book = activeBook(); const chapter = activeBookChapter(book);
  openEnglishWordDialog(token.dataset.articleWord, { id: book.id, title: book.title, body: chapter.text }, sentenceAround(chapter.text, token.dataset.articleWord));
});
document.querySelector('#book-open-source').addEventListener('click', async () => {
  const book = activeBook(); if (!book) return showToast('找不到原文件'); const result = await window.companion.openBookSource(book.id); if (result) showToast(result);
});
document.querySelector('#book-reparse').addEventListener('click', async event => {
  const book = activeBook(); if (!book) return;
  const button = event.currentTarget; button.disabled = true; button.textContent = '整理中…';
  const result = await window.companion.reparseBook(book.id);
  button.disabled = false; button.textContent = '重新整理正文';
  if (!result?.ok) return showToast(result?.error || '正文整理失败');
  data = result.data; renderVocabulary(); showToast('已按新版段落规则重新整理正文');
});
document.querySelector('#book-popout').addEventListener('click', async () => {
  const book = activeBook(); const chapter = activeBookChapter(book);
  if (!book || !chapter) return showToast('请先选择一本有正文的书');
  await window.companion.openBookReader(book.id, chapter.id);
});
document.querySelector('#book-delete').addEventListener('click', async () => {
  const book = activeBook(); if (!book || !confirm(`从书架移除“${book.title}”？${book.sourcePath ? '电脑中的源文件不会被删除，只会清理应用内副本。' : '应用保存的书籍副本会一并删除。'}`)) return;
  if (book.relativePath) await window.companion.deleteLibraryFile(book.relativePath); data.english.books = data.english.books.filter(item => item.id !== book.id); data.english.selectedBookId = data.english.books[0]?.id || null;
  await persist('书籍已从本机书架删除'); renderVocabulary();
});
document.querySelector('#book-font-down').addEventListener('click', () => { bookReaderFontSize = Math.max(11, bookReaderFontSize - 1); renderBookShelf(); });
document.querySelector('#book-font-up').addEventListener('click', () => { bookReaderFontSize = Math.min(22, bookReaderFontSize + 1); renderBookShelf(); });
document.querySelector('#analyze-book-words').addEventListener('click', async () => {
  const chapter = activeBookChapter(); if (!chapter) return showToast('请先选择可阅读章节'); chapter.wordCandidates = analyzeChapterVocabulary(chapter);
  await persist(`已筛出 ${chapter.wordCandidates.length} 个候选词`); renderBookCandidates(chapter);
});
document.querySelector('#book-word-candidates').addEventListener('change', event => {
  const input = event.target.closest('[data-book-candidate]'); if (!input) return; const candidate = activeBookChapter()?.wordCandidates?.find(item => item.word === input.dataset.bookCandidate); if (candidate) candidate.selected = input.checked;
});
document.querySelector('#copy-book-ai-prompt').addEventListener('click', async () => {
  const prompt = bookVocabularyPrompt(); if (!prompt) return showToast('请先选择章节并分析候选词'); await window.companion.copyText(prompt); showToast('AI 词汇分析指令已复制');
});
document.querySelector('#save-book-candidates').addEventListener('click', async () => {
  const book = activeBook(); const chapter = activeBookChapter(book); if (!chapter) return showToast('请先选择章节');
  const candidates = (chapter.wordCandidates || []).filter(item => item.selected); if (!candidates.length) return showToast('请先勾选要加入词库的候选词');
  const listId = document.querySelector('#book-target-word-list').value || 'list_default'; const existing = new Map(data.vocabulary.map(word => [word.front.toLocaleLowerCase(), word])); let added = 0;
  candidates.forEach(candidate => {
    const word = existing.get(candidate.word);
    if (word) word.libraryIds = [...new Set([...(word.libraryIds || ['list_default']), listId])];
    else { data.vocabulary.push(VocabularyCore.normalizeWord({ id: crypto.randomUUID(), front: candidate.word, back: '', tags: ['原版阅读'], reason: `来自《${book.title}》`, contexts: [{ text: candidate.context, articleId: book.id, articleTitle: book.title, savedAt: new Date().toISOString() }], sourceIds: [book.id], libraryIds: [listId] })); added += 1; }
    candidate.saved = true; candidate.selected = false;
  });
  buildReviewQueue(false); await persist(`已把 ${candidates.length} 个词加入目标词库，其中新增 ${added} 个`); renderVocabulary();
});

document.querySelector('#word-list-filter').addEventListener('change', async event => {
  data.english.activeWordListId = event.target.value;
  reviewCycleSeenIds.clear(); buildReviewQueue(false); await persist(); renderVocabulary();
});
document.querySelector('#add-word-manual').addEventListener('click', openManualWordDialog);
document.querySelector('#new-word-list').addEventListener('click', () => {
  const input = document.querySelector('#word-list-name'); input.value = ''; document.querySelector('#word-list-name-preview').textContent = '未命名词库';
  document.querySelector('#word-list-dialog').showModal(); setTimeout(() => input.focus(), 40);
});
document.querySelectorAll('[data-close-word-list]').forEach(button => button.addEventListener('click', () => document.querySelector('#word-list-dialog').close()));
document.querySelector('#word-list-name').addEventListener('input', event => { document.querySelector('#word-list-name-preview').textContent = event.target.value.trim() || '未命名词库'; });
document.querySelector('#word-list-form').addEventListener('submit', async event => {
  event.preventDefault(); const name = document.querySelector('#word-list-name').value.trim().slice(0, 30);
  if (!name) return showToast('请填写词库名称');
  if (data.english.wordLists.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return showToast('已经有同名词库');
  const list = { id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name, createdAt: new Date().toISOString() };
  data.english.wordLists.push(list); data.english.activeWordListId = list.id; reviewCycleSeenIds.clear(); buildReviewQueue(false);
  await persist(`词库“${name}”已创建并切换`); document.querySelector('#word-list-dialog').close(); renderVocabulary();
});
document.querySelector('#manage-word-list').addEventListener('click', async () => {
  const id = data.english.activeWordListId;
  if (!id || id === 'all') return showToast('请先在左侧选择一个词库');
  const list = data.english.wordLists.find(item => item.id === id); if (!list) return;
  const next = prompt(`修改词库名称；输入“删除”可删除这个词库。\n词条本身不会被误删。`, list.name);
  if (!next?.trim()) return;
  if (next.trim() === '删除') {
    if (id === 'list_default') return showToast('默认词库不能删除，可以修改名称');
    if (!confirm(`删除词库“${list.name}”？只会删除分类，单词会保留在默认词库。`)) return;
    data.english.wordLists = data.english.wordLists.filter(item => item.id !== id);
    data.vocabulary.forEach(word => {
      word.libraryIds = (word.libraryIds || ['list_default']).filter(listId => listId !== id);
      if (!word.libraryIds.length) word.libraryIds = ['list_default'];
    });
    data.english.activeWordListId = 'all';
    await persist('词库分类已删除，单词仍保留'); renderVocabulary(); return;
  }
  list.name = next.trim().slice(0, 30); await persist('词库名称已修改'); renderVocabulary();
});
document.querySelector('#import-to-word-list').addEventListener('click', () => openLearningImport('englishWords'));

document.querySelector('#open-learning-import').addEventListener('click', () => openLearningImport('englishArticle'));
document.querySelector('#ai-import-material').addEventListener('click', () => openLearningImport('englishArticle'));
document.querySelector('#exam-smart-import').addEventListener('click', () => openLearningImport('examQuestion'));
document.querySelectorAll('[data-close-learning-import]').forEach(button => button.addEventListener('click', () => {
  syncLearningImportEditor(); document.querySelector('#learning-import-dialog').close();
}));
document.querySelector('#learning-import-destination').addEventListener('change', () => {
  syncLearningImportEditor(); learningImportQueue.forEach(item => analyzeLearningItemStructure(item, true)); renderLearningImportQueue();
});
document.querySelector('#learning-dialog-choose').addEventListener('click', chooseLearningFiles);
document.querySelector('#choose-learning-material').addEventListener('click', async event => {
  event.stopPropagation(); openLearningImport('englishArticle'); await chooseLearningFiles();
});
document.querySelector('#paste-learning-material').addEventListener('click', async event => {
  event.stopPropagation(); openLearningImport('englishArticle'); await readLearningClipboard();
});
document.querySelector('#learning-add-paste').addEventListener('click', () => {
  const text = document.querySelector('#learning-paste-text').value;
  if (!text.trim()) return showToast('请先粘贴文章、单词、句子或题目');
  addLearningFiles([{ name: `粘贴材料-${new Date().toLocaleDateString('zh-CN').replaceAll('/', '-')}.txt`, text: text.trim(), parseKind: 'text' }]);
  document.querySelector('#learning-paste-text').value = '';
});
document.querySelector('#learning-fetch-web').addEventListener('click', async () => {
  const input = document.querySelector('#learning-web-url'); const status = document.querySelector('#learning-web-status'); const button = document.querySelector('#learning-fetch-web');
  const url = input.value.trim(); if (!url) return showToast('请先粘贴网页地址');
  button.disabled = true; status.textContent = '正在读取公开网页并提取正文…';
  const result = await window.companion.fetchWebArticle(url);
  button.disabled = false;
  if (result?.ok) {
    addLearningFiles([{ ...result.article, name: result.article.title, parseKind: 'web', url }]);
    status.textContent = `已提取 ${result.article.text.length} 字，可在待整理箱中校对。`; input.value = '';
    return;
  }
  status.textContent = `解析失败：${result?.error || '网页拒绝访问或正文结构无法识别'}`;
  if (confirm('没有自动取得正文。是否仍把这个网址加入待整理箱，之后可手动补充正文？')) {
    let title = '网页收藏'; try { title = new URL(url).hostname; } catch {}
    addLearningFiles([{ title, name: title, url, source: url, text: '', parseKind: 'web', warning: '只保存了网址，尚未取得正文' }]);
  }
});

for (const zone of [document.querySelector('#material-intake-strip'), document.querySelector('#learning-dialog-dropzone')]) {
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', async event => {
    if (zone.id === 'material-intake-strip') openLearningImport('englishArticle');
    await importDroppedLearningFiles(event.dataTransfer);
  });
}
document.querySelector('#learning-import-dialog').addEventListener('paste', async event => {
  const copiedFiles = filesFromDrop(event.clipboardData).filter(file => /\.[a-z0-9]{1,8}$/i.test(file.name || ''));
  if (copiedFiles.length) { event.preventDefault(); await importDroppedLearningFiles(copiedFiles); return; }
  const image = [...event.clipboardData.items].find(item => item.type.startsWith('image/'));
  if (image) { event.preventDefault(); await addClipboardImageFile(image.getAsFile()); return; }
  if (event.target.matches('input, textarea, [contenteditable="true"]')) return;
  const text = event.clipboardData.getData('text/plain');
  if (text.trim()) { event.preventDefault(); addLearningFiles([{ name: '粘贴文字.txt', text: text.trim(), parseKind: 'text' }]); }
});
document.querySelector('#learning-import-list').addEventListener('click', event => {
  const row = event.target.closest('[data-learning-item]'); if (row) queueSelectionIntoEditor(row.dataset.learningItem);
});
document.querySelectorAll('#learning-item-title, #learning-item-source, #learning-item-tags, #learning-item-note, #learning-item-text').forEach(input => input.addEventListener('input', syncLearningImportEditor));
document.querySelector('#learning-analyze-structure').addEventListener('click', () => {
  syncLearningImportEditor(); const item = activeLearningImportItem(); if (!item?.text?.trim()) return showToast('请先导入或粘贴可识别的文字');
  analyzeLearningItemStructure(item, true); renderStructureReview(item); showToast('已重新识别题型、公共材料和子题');
});
document.querySelector('#structure-add-question').addEventListener('click', () => {
  const item = activeLearningImportItem(); if (!item) return;
  item.structure ||= MaterialParser.analyze(item.text || '', { domain: learningDestinationDomain() });
  item.structure.questions ||= [];
  item.structure.questions.push({ id: crypto.randomUUID(), number: item.structure.questions.length + 1, type: 'single', stem: '', options: [], answer: '', explanation: '', confidence: 1 });
  renderStructureReview(item);
});
document.querySelector('#structure-question-list').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-structure-question]'); if (!button) return;
  const item = activeLearningImportItem(); if (!item?.structure) return;
  item.structure.questions = item.structure.questions.filter(question => question.id !== button.dataset.removeStructureQuestion);
  renderStructureReview(item);
});
document.querySelector('#structure-review-result').addEventListener('input', syncStructureReview);
document.querySelector('#learning-open-file').addEventListener('click', async () => {
  const item = activeLearningImportItem(); if (!item?.relativePath) return;
  const result = await window.companion.openLibraryFile(item.relativePath); if (result) showToast(result);
});
document.querySelector('#learning-run-ocr').addEventListener('click', async () => {
  const item = activeLearningImportItem();
  if (item?.parseKind === 'pdf') {
    const result = await window.companion.openLibraryFile(item.relativePath);
    if (result) return showToast(result);
    showToast('截取需要识别的页面后，回到这里按 Ctrl+V 粘贴截图'); return;
  }
  openOcrDialog(item);
});
document.querySelector('#learning-remove-item').addEventListener('click', async () => {
  const item = activeLearningImportItem(); if (!item) return;
  if (!confirm(`从待整理箱移除“${item.title || item.name}”？${item.relativePath ? '\n刚复制到本地资料库的文件也会删除。' : ''}`)) return;
  if (item.relativePath) await window.companion.deleteLibraryFile(item.relativePath);
  learningImportQueue = learningImportQueue.filter(entry => entry.queueId !== item.queueId);
  activeLearningImportId = learningImportQueue[0]?.queueId || null; renderLearningImportQueue();
});
document.querySelector('#clear-learning-queue').addEventListener('click', async () => {
  if (!learningImportQueue.length || !confirm('清空待整理箱？尚未归档的本地副本也会删除。')) return;
  for (const item of learningImportQueue) if (item.relativePath) await window.companion.deleteLibraryFile(item.relativePath);
  learningImportQueue = []; activeLearningImportId = null; renderLearningImportQueue();
});
document.querySelector('#archive-learning-import').addEventListener('click', archiveLearningQueue);

document.querySelectorAll('[data-close-ocr]').forEach(button => button.addEventListener('click', () => document.querySelector('#ocr-crop-dialog').close()));
document.querySelector('#ocr-full-image').addEventListener('click', setOcrFullCrop);
document.querySelector('#ocr-auto-crop').addEventListener('click', autoDetectOcrCrop);
const ocrCanvas = document.querySelector('#ocr-crop-canvas');
function ocrCanvasPoint(event) {
  const rect = ocrCanvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(ocrCanvas.width, (event.clientX - rect.left) * ocrCanvas.width / rect.width)), y: Math.max(0, Math.min(ocrCanvas.height, (event.clientY - rect.top) * ocrCanvas.height / rect.height)) };
}
ocrCanvas.addEventListener('pointerdown', event => {
  const point = ocrCanvasPoint(event); ocrState.drawing = true; ocrState.start = point; ocrState.crop = { x: point.x, y: point.y, w: 1, h: 1 }; ocrCanvas.setPointerCapture(event.pointerId); drawOcrCanvas();
});
ocrCanvas.addEventListener('pointermove', event => {
  if (!ocrState.drawing || !ocrState.start) return;
  const point = ocrCanvasPoint(event); ocrState.crop = { x: Math.min(point.x, ocrState.start.x), y: Math.min(point.y, ocrState.start.y), w: Math.abs(point.x - ocrState.start.x), h: Math.abs(point.y - ocrState.start.y) }; drawOcrCanvas();
});
ocrCanvas.addEventListener('pointerup', event => {
  if (!ocrState.drawing) return; ocrState.drawing = false;
  if (ocrState.crop.w < 8 || ocrState.crop.h < 8) setOcrFullCrop(); else drawOcrCanvas();
  try { ocrCanvas.releasePointerCapture(event.pointerId); } catch {}
});
document.querySelector('#ocr-recognize').addEventListener('click', async () => {
  if (!ocrState.image) return;
  const button = document.querySelector('#ocr-recognize'); button.disabled = true;
  document.querySelector('#ocr-progress-label').textContent = '正在准备本地识别引擎，首次使用会稍慢…';
  const result = await window.companion.recognizeLearningImage({ dataUrl: ocrCroppedDataUrl() });
  button.disabled = false;
  if (!result?.ok) { document.querySelector('#ocr-progress-label').textContent = result?.error || '识别失败'; return; }
  document.querySelector('#ocr-result-text').value = result.text || '';
  document.querySelector('#ocr-confidence').textContent = `置信度 ${result.confidence}%`;
  document.querySelector('#ocr-progress-label').textContent = '识别完成，请在右侧校对'; document.querySelector('#ocr-progress-bar').style.width = '100%';
});
document.querySelector('#use-ocr-result').addEventListener('click', () => {
  const item = learningImportQueue.find(entry => entry.queueId === ocrState.itemId); if (!item) return;
  item.text = document.querySelector('#ocr-result-text').value.trim();
  const confidence = document.querySelector('#ocr-confidence').textContent.match(/([\d.]+)/); item.ocrConfidence = confidence ? Number(confidence[1]) : null;
  item.needsOcr = !item.text; item.status = item.text ? 'ready' : 'pending'; item.warning = item.text ? '图片文字已识别，请在归档前再次校对' : '图片没有识别到文字';
  document.querySelector('#ocr-crop-dialog').close(); renderLearningImportQueue();
});
window.companion.onOcrProgress(progress => {
  const value = Math.max(0, Math.min(1, Number(progress?.progress) || 0));
  document.querySelector('#ocr-progress-bar').style.width = `${Math.round(value * 100)}%`;
  if (progress?.status) document.querySelector('#ocr-progress-label').textContent = `${progress.status.replaceAll('_', ' ')} · ${Math.round(value * 100)}%`;
});

document.querySelector('#timer-toggle').addEventListener('click', async () => { pomodoroState = await window.companion.pomodoroAction(pomodoroState.running ? 'pause' : 'start'); renderPomodoro(pomodoroState); });
document.querySelector('#timer-reset').addEventListener('click', async () => { pomodoroState = await window.companion.pomodoroAction('reset'); renderPomodoro(pomodoroState); });
document.querySelector('#timer-skip').addEventListener('click', async () => { pomodoroState = await window.companion.pomodoroAction('skip'); renderPomodoro(pomodoroState); });

document.querySelector('#calendar-prev').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); });
document.querySelector('#calendar-next').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); });
document.querySelector('#calendar-today').addEventListener('click', () => { const now = new Date(); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); selectedCalendarDay = localDayKey(now); renderCalendar(); });
document.querySelector('#calendar-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-calendar-day]'); if (!button) return;
  selectedCalendarDay = button.dataset.calendarDay;
  const selected = new Date(`${selectedCalendarDay}T12:00:00`);
  calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
  renderCalendar();
});
document.querySelector('#calendar-note-form').addEventListener('submit', async event => {
  event.preventDefault();
  const note = document.querySelector('#calendar-note').value.trim();
  if (!note) return;
  const now = new Date();
  const occurredAt = new Date(`${selectedCalendarDay}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`).toISOString();
  addActivity('note', note, '用户手动补记', occurredAt);
  document.querySelector('#calendar-note').value = '';
  await persist('已存入这一天'); renderCalendar();
});

document.querySelector('#exam-tabs').addEventListener('click', async event => {
  const button = event.target.closest('[data-exam-tab]'); if (!button) return;
  ensureExamData().activeTab = button.dataset.examTab;
  await persist(); renderExam();
});
document.querySelector('#exam-resource-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-resource-filter]'); if (!button) return;
  examResourceFilter = button.dataset.resourceFilter;
  document.querySelectorAll('[data-resource-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderExam();
});
document.querySelector('#exam-resource-search').addEventListener('input', renderExam);
document.querySelector('#exam-question-search').addEventListener('input', renderExam);
document.querySelector('#exam-question-category').addEventListener('change', renderExam);

async function chooseAndImportExam(destination) {
  if (destination === 'question' || destination === 'mistake') {
    openLearningImport(destination === 'question' ? 'examQuestion' : 'examMistake');
    await chooseLearningFiles();
    return;
  }
  const files = await window.companion.chooseExamFiles();
  await importExamFiles(files, destination);
}
document.querySelector('#exam-import').addEventListener('click', () => chooseAndImportExam('resource'));
document.querySelectorAll('[data-choose-exam]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); chooseAndImportExam(button.dataset.chooseExam); }));
document.querySelectorAll('[data-exam-drop]').forEach(zone => {
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; zone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('dragging'); }));
  zone.addEventListener('drop', async event => {
    if (zone.dataset.examDrop === 'question' || zone.dataset.examDrop === 'mistake') {
      openLearningImport(zone.dataset.examDrop === 'question' ? 'examQuestion' : 'examMistake');
      await importDroppedLearningFiles(event.dataTransfer);
      return;
    }
    const files = await importDroppedExamResourceFiles(event.dataTransfer);
    await importExamFiles(files, zone.dataset.examDrop);
  });
});

document.querySelector('#exam-new-resource').addEventListener('click', () => openExamResourceDialog());
document.querySelector('#exam-add-text-resource').addEventListener('click', () => openExamResourceDialog());
document.querySelectorAll('[data-close-exam-resource]').forEach(button => button.addEventListener('click', () => document.querySelector('#exam-resource-dialog').close()));
document.querySelector('#exam-resource-form').addEventListener('submit', async event => {
  event.preventDefault();
  const exam = ensureExamData();
  const id = document.querySelector('#exam-resource-id').value || crypto.randomUUID();
  const existing = exam.resources.find(item => item.id === id);
  const resource = {
    id, type: document.querySelector('#exam-resource-type').value,
    title: document.querySelector('#exam-resource-title').value.trim(), body: document.querySelector('#exam-resource-body').value.trim(),
    source: document.querySelector('#exam-resource-source').value.trim(), topic: document.querySelector('#exam-resource-topic').value.trim(),
    tags: parseTags(document.querySelector('#exam-resource-tags').value), note: document.querySelector('#exam-resource-note').value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const index = exam.resources.findIndex(item => item.id === id);
  if (index >= 0) exam.resources[index] = resource; else exam.resources.unshift(resource);
  resource.tags.forEach(tag => { if (!exam.tags.includes(tag)) exam.tags.push(tag); });
  if (!existing) addActivity('exam', `保存申论素材：${resource.title}`, `${resourceKindLabel(resource.type)}${resource.topic ? ` · ${resource.topic}` : ''}`);
  await persist(index >= 0 ? '文字资料已更新' : '申论素材已保存');
  document.querySelector('#exam-resource-dialog').close(); renderExam(); renderCalendar();
});
document.querySelector('#delete-exam-resource').addEventListener('click', async () => {
  const id = document.querySelector('#exam-resource-id').value;
  if (!id || !window.confirm('确定删除这条文字资料吗？')) return;
  data.exam.resources = ensureExamData().resources.filter(item => item.id !== id);
  await persist('文字资料已删除'); document.querySelector('#exam-resource-dialog').close(); renderExam();
});
document.querySelector('#exam-resource-list').addEventListener('click', async event => {
  const exam = ensureExamData();
  const edit = event.target.closest('[data-edit-resource]');
  const copy = event.target.closest('[data-copy-resource]');
  const open = event.target.closest('[data-open-resource-file]');
  const remove = event.target.closest('[data-delete-resource]');
  if (edit) return openExamResourceDialog(exam.resources.find(item => item.id === edit.dataset.editResource));
  if (copy) { const resource = exam.resources.find(item => item.id === copy.dataset.copyResource); await window.companion.copyText(resource?.body || ''); return showToast('正文已复制'); }
  if (open) { const resource = exam.resources.find(item => item.id === open.dataset.openResourceFile); const result = await window.companion.openLibraryFile(resource?.relativePath); if (result) showToast(result); return; }
  if (remove) {
    const resource = exam.resources.find(item => item.id === remove.dataset.deleteResource); if (!resource) return;
    const warning = resource.type === 'file' ? `永久删除“${resource.title || resource.name}”并释放 ${formatBytes(resource.size || 0)} 空间？题目中的文字记录仍会保留。` : `删除“${resource.title}”？`;
    if (!window.confirm(warning)) return;
    if (resource.type === 'file') await window.companion.deleteLibraryFile(resource.relativePath);
    exam.resources = exam.resources.filter(item => item.id !== resource.id);
    exam.questions.forEach(item => { if (item.attachmentId === resource.id) item.attachmentId = null; });
    await persist(resource.type === 'file' ? '文件已永久删除' : '资料已删除'); renderExam();
  }
});

document.querySelector('#exam-new-question').addEventListener('click', () => openExamQuestionDialog());
document.querySelector('#exam-add-question').addEventListener('click', () => openExamQuestionDialog());
document.querySelectorAll('[data-close-exam-question]').forEach(button => button.addEventListener('click', () => document.querySelector('#exam-question-dialog').close()));
document.querySelector('#exam-question-form').addEventListener('submit', async event => {
  event.preventDefault();
  const exam = ensureExamData();
  const id = document.querySelector('#exam-question-id').value || crypto.randomUUID();
  const existing = exam.questions.find(item => item.id === id);
  const category = document.querySelector('#exam-question-category-input').value.trim();
  const sourceName = document.querySelector('#exam-question-source').value.trim();
  const target = document.querySelector('#exam-question-target').value.trim();
  const tags = parseTags(document.querySelector('#exam-question-tags').value);
  const marked = document.querySelector('#exam-question-mistake').checked;
  const question = {
    ...(existing || {}), id, type: document.querySelector('#exam-question-type').value, category,
    status: document.querySelector('#exam-question-status').value, stem: document.querySelector('#exam-question-stem').value.trim(),
    options: document.querySelector('#exam-question-options').value.trim(), optionList: parseStructureOptions(document.querySelector('#exam-question-options').value), answer: document.querySelector('#exam-question-answer').value.trim(),
    sourceName, year: document.querySelector('#exam-question-year').value,
    examKind: document.querySelector('#exam-question-kind').value.trim(), region: document.querySelector('#exam-question-region').value.trim(), target, tags,
    explanation: document.querySelector('#exam-question-explanation').value.trim(), errorReason: document.querySelector('#exam-question-reason').value,
    isMistake: marked, mistakeEver: Boolean(existing?.mistakeEver || marked), mistakeMastered: marked ? Boolean(existing?.mistakeMastered) : false,
    attachmentId: existing?.attachmentId || null, reviewCount: existing?.reviewCount || 0, correctStreak: existing?.correctStreak || 0,
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const index = exam.questions.findIndex(item => item.id === id);
  if (index >= 0) exam.questions[index] = question; else exam.questions.unshift(question);
  if (category && !exam.categories.includes(category)) exam.categories.push(category);
  if (sourceName && !exam.sources.includes(sourceName)) exam.sources.push(sourceName);
  if (target && !exam.targets.includes(target)) exam.targets.push(target);
  tags.forEach(tag => { if (!exam.tags.includes(tag)) exam.tags.push(tag); });
  if (!existing) addActivity('exam', `新增题目：${question.stem.slice(0, 40)}`, [category, sourceName].filter(Boolean).join(' · '));
  await persist(index >= 0 ? '题目已更新' : '题目已加入题库'); document.querySelector('#exam-question-dialog').close(); renderExam(); renderCalendar();
});
document.querySelector('#delete-exam-question').addEventListener('click', async () => {
  const id = document.querySelector('#exam-question-id').value;
  if (!id || !window.confirm('确定删除这道题及其练习记录吗？原始附件仍保留在资料库。')) return;
  const exam = ensureExamData(); exam.questions = exam.questions.filter(item => item.id !== id); exam.attempts = exam.attempts.filter(item => item.questionId !== id);
  detachQuestionFromGroups(exam, id);
  await persist('题目已删除'); document.querySelector('#exam-question-dialog').close(); renderExam();
});

async function handleQuestionListClick(event) {
  const exam = ensureExamData();
  const edit = event.target.closest('[data-edit-question]');
  const open = event.target.closest('[data-open-question-file]');
  const toggle = event.target.closest('[data-toggle-mistake]');
  const result = event.target.closest('[data-mistake-result]');
  const remove = event.target.closest('[data-delete-question-card]');
  if (edit) return openExamQuestionDialog(exam.questions.find(item => item.id === edit.dataset.editQuestion));
  if (open) { const question = exam.questions.find(item => item.id === open.dataset.openQuestionFile); const resource = exam.resources.find(item => item.id === question?.attachmentId); const message = await window.companion.openLibraryFile(resource?.relativePath); if (message) showToast(message); return; }
  if (toggle) {
    const question = exam.questions.find(item => item.id === toggle.dataset.toggleMistake); if (!question) return;
    question.isMistake = !question.isMistake; question.mistakeEver ||= question.isMistake; question.mistakeMastered = false; question.correctStreak = 0;
    if (question.isMistake) addActivity('exam', `加入错题：${question.stem.slice(0, 40)}`, question.category || '未分类');
    await persist(question.isMistake ? '已加入错题本' : '已移出当前错题'); renderExam(); renderCalendar(); return;
  }
  if (result) {
    const question = exam.questions.find(item => item.id === result.dataset.question); if (!question) return;
    const correct = result.dataset.mistakeResult === 'right';
    question.reviewCount = (question.reviewCount || 0) + 1;
    question.correctStreak = correct ? (question.correctStreak || 0) + 1 : 0;
    question.isMistake = true; question.mistakeEver = true; question.mistakeMastered = question.correctStreak >= 3;
    exam.attempts.push({ id: crypto.randomUUID(), questionId: question.id, mode: 'mistake-review', correct, attemptedAt: new Date().toISOString() });
    addActivity('exam', `${correct ? '复刷答对' : '复刷再错'}：${question.stem.slice(0, 36)}`, question.mistakeMastered ? '连续答对3次，已标记掌握' : `${question.category || '未分类'} · 连续答对 ${question.correctStreak} 次`);
    await persist(question.mistakeMastered ? '连续答对 3 次，已标记掌握' : correct ? `答对了，再连续答对 ${3 - question.correctStreak} 次即可掌握` : '已记录再次答错'); renderExam(); renderCalendar(); return;
  }
  if (remove) {
    const id = remove.dataset.deleteQuestionCard;
    if (!window.confirm('删除这道题及其练习记录？原始附件仍保留在资料库。')) return;
    exam.questions = exam.questions.filter(item => item.id !== id); exam.attempts = exam.attempts.filter(item => item.questionId !== id);
    detachQuestionFromGroups(exam, id);
    await persist('题目已删除'); renderExam();
  }
}
document.querySelector('#exam-question-list').addEventListener('click', handleQuestionListClick);
document.querySelector('#exam-mistake-list').addEventListener('click', handleQuestionListClick);
document.querySelector('#exam-group-studio').addEventListener('click', async event => {
  const exam = ensureExamData();
  const groupButton = event.target.closest('[data-exam-group]');
  if (groupButton) { selectedExamGroupId = groupButton.dataset.examGroup; selectedExamGroupQuestionId = null; renderExamGroupStudio(exam); return; }
  const questionButton = event.target.closest('[data-exam-group-question]');
  if (questionButton) { selectedExamGroupQuestionId = questionButton.dataset.examGroupQuestion; renderExamGroupStudio(exam); return; }
  const group = exam.questionGroups.find(item => item.id === selectedExamGroupId); if (!group) return;
  const question = exam.questions.find(item => item.id === selectedExamGroupQuestionId) || exam.questions.find(item => group.questionIds.includes(item.id)); if (!question) return;
  const option = event.target.closest('[data-exam-group-option]');
  if (option) {
    const key = option.dataset.examGroupOption;
    if (question.type === 'multiple') { const selected = new Set(String(question.userAnswer || '').split('').filter(Boolean)); selected.has(key) ? selected.delete(key) : selected.add(key); question.userAnswer = [...selected].sort().join(''); }
    else question.userAnswer = key;
    question.answerChecked = false; renderExamGroupStudio(exam); return;
  }
  const toggle = event.target.closest('[data-toggle-mistake]');
  if (toggle) { question.isMistake = !question.isMistake; question.mistakeEver ||= question.isMistake; if (question.isMistake) question.mistakeMastered = false; await persist(question.isMistake ? '已加入错题本' : '已移出当前错题'); renderExam(); return; }
  const check = event.target.closest('[data-check-exam-group-question]');
  if (check) {
    const subjective = document.querySelector('[data-exam-subjective-answer]'); if (subjective) question.userAnswer = subjective.value.trim();
    if (!question.userAnswer) return showToast('请先选择或填写答案');
    question.answerChecked = true; question.correct = question.answer ? String(question.userAnswer).toUpperCase() === String(question.answer).toUpperCase() : null;
    if (question.correct === false) { question.isMistake = true; question.mistakeEver = true; question.mistakeMastered = false; }
    exam.attempts.push({ id: crypto.randomUUID(), questionId: question.id, groupId: group.id, mode: 'group-practice', answer: question.userAnswer, correct: question.correct, attemptedAt: new Date().toISOString() });
    addActivity('exam', `练习材料组：${group.title}`, `${group.questionIds.indexOf(question.id) + 1}/${group.questionIds.length} · ${question.correct === true ? '答对' : question.correct === false ? '答错并加入错题本' : '已作答'}`);
    await persist(question.correct === false ? '答错了，已自动加入错题本' : '作答记录已保存'); renderExam(); renderCalendar();
  }
});
document.querySelector('#exam-group-open-source').addEventListener('click', async () => {
  const exam = ensureExamData(); const group = exam.questionGroups.find(item => item.id === selectedExamGroupId); const resource = exam.resources.find(item => item.id === group?.resourceId);
  if (!resource?.relativePath) return showToast('这组材料没有关联本地原文件');
  const result = await window.companion.openLibraryFile(resource.relativePath); if (result) showToast(result);
});

document.querySelector('#copy-mistake-md').addEventListener('click', async () => { await window.companion.copyText(generateExamMarkdown()); showToast('错题分析 Markdown 已复制'); });
document.querySelector('#copy-exam-analysis').addEventListener('click', async () => { await window.companion.copyText(generateExamMarkdown()); showToast('学习档案 Markdown 已复制'); });
document.querySelector('#export-mistake-md').addEventListener('click', async () => {
  const date = localDayKey(); const file = await window.companion.exportMarkdown(`考公错题分析_${date}.md`, generateExamMarkdown());
  if (file) showToast('Markdown 已导出');
});

document.querySelector('#module-manager').addEventListener('click', event => {
  const button = event.target.closest('[data-module-move]');
  if (!button) return;
  const row = button.closest('[data-module-id]');
  syncModuleDraftFromDom();
  const modules = ensureModuleDraft();
  const index = modules.findIndex(item => item.id === row.dataset.moduleId);
  const target = button.dataset.moduleMove === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= modules.length || modules[index].locked || modules[target].locked) return;
  [modules[index], modules[target]] = [modules[target], modules[index]];
  modules.forEach((item, order) => { item.order = order; });
  moduleDraft = modules; markModuleDraftDirty(); renderModuleManager();
});
document.querySelector('#module-manager').addEventListener('input', event => {
  if (!event.target.matches('[data-module-name], [data-module-visible]')) return;
  syncModuleDraftFromDom(); markModuleDraftDirty();
});
document.querySelector('#restore-module-defaults').addEventListener('click', () => {
  moduleDraft = moduleDefaults.map((item, order) => ({ id: item.id, defaultName: item.name, name: item.name, visible: true, locked: Boolean(item.locked), order }));
  markModuleDraftDirty(); renderModuleManager(); showToast('默认名称与顺序已放入草稿，确定后生效');
});
document.querySelector('#cancel-module-changes').addEventListener('click', () => cancelModuleDraft(true));
document.querySelector('#confirm-module-changes').addEventListener('click', async () => {
  data.settings.modules = syncModuleDraftFromDom().map(item => ({ ...item }));
  await persist('页面名称与侧栏显示已应用');
  moduleDraft = freshModuleDraft(); moduleDraftDirty = false;
  applyModuleSettings(); renderModuleManager();
});

document.querySelector('#save-settings').addEventListener('click', async () => {
  data.settings.modules = syncModuleDraftFromDom().map(item => ({ ...item }));
  data.settings.petVisible = document.querySelector('#setting-pet-visible').checked;
  data.settings.petAlwaysOnTop = document.querySelector('#setting-pet-top').checked;
  data.settings.quietStart = document.querySelector('#quiet-start').value || '22:30';
  data.settings.quietEnd = document.querySelector('#quiet-end').value || '08:00';
  data.settings.courseNoticeMinutes = Number(document.querySelector('#course-notice').value) || 0;
  data.settings.focusMinutes = Number(document.querySelector('#focus-minutes').value) || 25;
  data.settings.shortBreakMinutes = Number(document.querySelector('#break-minutes').value) || 5;
  data.settings.petScale = Number(document.querySelector('#pet-scale').value) || 1;
  data.settings.frameMs = Number(document.querySelector('#frame-ms').value) || 180;
  data.settings.dailyWordGoal = Math.max(0, Math.min(500, Number(document.querySelector('#daily-word-goal').value) || 0));
  data.settings.pronunciationLocale = document.querySelector('#pronunciation-locale').value || 'en-US';
  data.settings.pronunciationRate = Math.max(0.7, Math.min(1.3, Number(document.querySelector('#pronunciation-rate').value) || 1));
  data.settings.autoPronounce = document.querySelector('#auto-pronounce').checked;
  data.settings.translationProvider = document.querySelector('#translation-provider').value || 'baidu';
  data.settings.translationBaiduAuthMode = document.querySelector('#translation-baidu-auth-mode').value || 'apiKey';
  data.settings.translationBaiduModel = document.querySelector('#translation-baidu-model').value || 'nmt';
  data.settings.translationBaiduAppId = document.querySelector('#translation-baidu-app-id').value.trim();
  data.settings.translationYoudaoAppKey = document.querySelector('#translation-youdao-app-key').value.trim();
  data.settings.autoTranslateReading = document.querySelector('#auto-translate-reading').checked;
  await persist('设置已保存');
  await saveTranslationConfigFromForm(false);
  moduleDraft = freshModuleDraft(); moduleDraftDirty = false;
  await window.companion.setPetScale(data.settings.petScale, true);
  applyModuleSettings(); renderAll(); setPage(currentPage);
});
document.querySelector('#translation-provider').addEventListener('change', updateTranslationProviderFields);
document.querySelector('#translation-baidu-auth-mode').addEventListener('change', updateTranslationProviderFields);
document.querySelector('#open-baidu-developer').addEventListener('click', () => window.companion.openExternalUrl('https://fanyi-api.baidu.com/manage/developer'));
document.querySelector('#open-baidu-api-keys').addEventListener('click', () => window.companion.openExternalUrl('https://fanyi-api.baidu.com/manage/apiKey'));
document.querySelector('#open-baidu-services').addEventListener('click', () => window.companion.openExternalUrl('https://fanyi-api.baidu.com/choose'));
document.querySelector('#test-translation-provider').addEventListener('click', async event => {
  const button = event.currentTarget; const status = document.querySelector('#translation-provider-status');
  button.disabled = true; button.textContent = '正在连接…'; status.textContent = '正在连接正式翻译服务'; status.dataset.state = 'idle';
  try {
    await saveTranslationConfigFromForm(false);
    const result = await window.companion.testTranslationProvider();
    if (!result?.ok) throw new Error(result?.error || '连接失败');
    status.textContent = `${result.provider === 'youdao' ? '有道翻译' : '百度翻译'}连接成功 · ${result.latencyMs} ms · ${result.text}`;
    status.dataset.state = 'ready'; showToast('在线翻译可以使用了');
  } catch (error) {
    status.textContent = error.message; status.dataset.state = 'error'; showToast(error.message);
  } finally { button.disabled = false; button.textContent = '保存并测试翻译'; }
});
document.querySelector('#theme-presets').addEventListener('click', event => {
  const button = event.target.closest('[data-theme]');
  if (!button) return;
  data.settings.theme = button.dataset.theme;
  applyTheme(data.settings);
});
document.querySelectorAll('#theme-accent, #theme-canvas, #theme-paper, #theme-sidebar').forEach(input => input.addEventListener('input', () => {
  data.settings.theme = 'custom';
  data.settings.customTheme = {
    accent: document.querySelector('#theme-accent').value,
    canvas: document.querySelector('#theme-canvas').value,
    paper: document.querySelector('#theme-paper').value,
    sidebar: document.querySelector('#theme-sidebar').value
  };
  applyTheme(data.settings);
}));
document.querySelector('#pronunciation-rate').addEventListener('input', event => {
  data.settings.pronunciationRate = Number(event.target.value);
  document.querySelector('#pronunciation-rate-label').textContent = `${Number(event.target.value).toFixed(1)}×`;
});
document.querySelector('#test-pronunciation').addEventListener('click', () => {
  data.settings.pronunciationLocale = document.querySelector('#pronunciation-locale').value;
  data.settings.pronunciationRate = Number(document.querySelector('#pronunciation-rate').value) || 1;
  speakWord('Welcome to your daily vocabulary review.');
});
document.querySelector('#auto-pronounce').addEventListener('change', event => {
  if (event.target.checked && window.speechSynthesis.getVoices().length && !availableEnglishVoices().length) {
    event.target.checked = false;
    data.settings.autoPronounce = false;
    updatePronunciationStatus();
    showToast('需要先安装英文语音包，才能开启自动朗读');
  }
});
document.querySelector('#open-speech-settings').addEventListener('click', () => window.companion.openSpeechSettings());
if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', updatePronunciationStatus);
document.querySelector('#sidebar-toggle').addEventListener('click', async () => {
  data.settings.sidebarCollapsed = !data.settings.sidebarCollapsed;
  document.querySelector('.app-shell').classList.toggle('sidebar-collapsed', data.settings.sidebarCollapsed);
  const toggle = document.querySelector('#sidebar-toggle');
  toggle.textContent = data.settings.sidebarCollapsed ? '›' : '‹';
  toggle.title = data.settings.sidebarCollapsed ? '展开侧栏' : '收起侧栏';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.setAttribute('aria-expanded', String(!data.settings.sidebarCollapsed));
  await persist();
});
document.querySelector('#pet-scale-range').addEventListener('input', event => previewPetScale(event.target.value));
document.querySelector('#pet-scale').addEventListener('input', event => previewPetScale(event.target.value));
document.querySelector('#pet-scale-range').addEventListener('change', event => commitPetScale(event.target.value));
document.querySelector('#pet-scale').addEventListener('change', event => commitPetScale(event.target.value));
document.querySelector('#setting-pet-visible').addEventListener('change', async event => { data.settings.petVisible = event.target.checked; await window.companion.togglePet(event.target.checked); });
document.querySelector('#open-assets').addEventListener('click', () => window.companion.openAssetsFolder());
document.querySelector('#reload-character').addEventListener('click', async () => { await window.companion.reloadCharacter(); await loadDashboardCharacter(); showToast('角色图片已重新载入'); });
document.querySelector('#test-reminder').addEventListener('click', () => window.companion.testReminder());
document.querySelector('#open-codex').addEventListener('click', () => window.companion.openCodex());
document.querySelector('#hide-main').addEventListener('click', () => window.companion.hideMain());
document.querySelector('#quit-app').addEventListener('click', () => window.companion.closeApp());
document.querySelector('#settings-quit').addEventListener('click', () => window.companion.closeApp());
window.companion.onPomodoroTick(renderPomodoro);
window.companion.onPetVisibility(visible => { data.settings.petVisible = visible; document.querySelector('#setting-pet-visible').checked = visible; });
window.companion.onCharactersChanged(async nextData => {
  data = nextData;
  if (currentPage === 'characters') renderCharacters();
  await loadDashboardCharacter();
});
window.companion.onDataChanged(nextData => { data = nextData; if (!moduleDraftDirty) moduleDraft = null; renderAll(); });
window.companion.onPetScaleChanged(scale => {
  data.settings.petScale = scale;
  updateScaleControls(scale);
});
window.companion.onBookImportProgress(progress => {
  const label = document.querySelector('#book-import-status');
  if (label) label.textContent = `正在读取 ${progress.name}：${progress.current} / ${progress.total} 页`;
});

async function init() {
  data = await window.companion.getData();
  translationSettingsState = await window.companion.getTranslationSettings();
  data.settings.translationBaiduAppId = translationSettingsState.baiduAppId;
  data.settings.translationBaiduAuthMode = translationSettingsState.baiduAuthMode;
  data.settings.translationBaiduModel = translationSettingsState.baiduModel;
  data.english = { articles: [], readingSets: [], sentences: [], books: [], quizHistory: [], reviewSession: null, favoriteModelVersion: 0, wordLists: [{ id: 'list_default', name: '默认词库', createdAt: new Date().toISOString() }], activeWordListId: 'all', activeTab: 'words', selectedArticleId: null, selectedBookId: null, aiWebsiteUrl: 'https://chat.deepseek.com', promptDepth: 'standard', ...(data.english || {}) };
  data.english.articles ||= []; data.english.readingSets ||= []; data.english.sentences ||= [];
  data.english.quizHistory ||= []; data.settings.reviewGroupSize = Math.max(3, Math.min(50, Number(data.settings.reviewGroupSize) || 10));
  if (!data.english.wordLists?.length) data.english.wordLists = [{ id: 'list_default', name: '默认词库', createdAt: new Date().toISOString() }];
  if (!Array.isArray(data.english.books)) data.english.books = [];
  englishTab = data.english.activeTab || 'words';
  const vocabularyBeforeNormalization = JSON.stringify((data.vocabulary || []).map(word => ({ front: word.front, back: word.back, favorite: word.favorite })));
  data.vocabulary = (data.vocabulary || []).map(word => VocabularyCore.normalizeWord(word));
  const resetImplicitFavorites = Number(data.english.favoriteModelVersion || 0) < 2;
  if (resetImplicitFavorites) {
    data.vocabulary.forEach(word => { word.favorite = false; });
    data.english.favoriteModelVersion = 2;
  }
  const vocabularyWasRepaired = vocabularyBeforeNormalization !== JSON.stringify(data.vocabulary.map(word => ({ front: word.front, back: word.back, favorite: word.favorite })));
  data.reviewLog = data.reviewLog || [];
  data.characters = data.characters || [];
  const finalExamWasRepaired = repairFinalExamQuestionModes();
  applyTheme(data.settings);
  document.querySelector('.app-shell').classList.toggle('sidebar-collapsed', Boolean(data.settings.sidebarCollapsed));
  const sidebarToggle = document.querySelector('#sidebar-toggle');
  sidebarToggle.textContent = data.settings.sidebarCollapsed ? '›' : '‹';
  sidebarToggle.title = data.settings.sidebarCollapsed ? '展开侧栏' : '收起侧栏';
  sidebarToggle.setAttribute('aria-label', sidebarToggle.title);
  sidebarToggle.setAttribute('aria-expanded', String(!data.settings.sidebarCollapsed));
  pomodoroState = await window.companion.getPomodoro();
  restoreReviewSession();
  if (vocabularyWasRepaired || resetImplicitFavorites || finalExamWasRepaired) data = await window.companion.saveData(data);
  const now = new Date();
  document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  document.querySelector('#todo-due').value = localInputValue(new Date(Date.now() + 60 * 60 * 1000));
  await loadDashboardCharacter();
  renderAll();
}
init();
