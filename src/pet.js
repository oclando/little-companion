const character = document.querySelector('#character');
const bubble = document.querySelector('#bubble');
const bubbleText = document.querySelector('#bubble-text');
const petStatus = document.querySelector('#pet-status');
let last = null;
let dragging = false;
let moved = 0;
let dragFrame = 0;
let pendingDragPoint = null;
let currentScale = 1;
let bubbleTimer;
let frameTimers = [];
let spineViews = [];
let loadGeneration = 0;

function showBubble(text, duration = 9000) {
  bubbleText.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, duration);
}

async function loadCharacter() {
  frameTimers.forEach(clearTimeout); frameTimers = [];
  spineViews.forEach(view => view.destroy()); spineViews = [];
  const generation = ++loadGeneration;
  const { settings, characters = [] } = await window.companion.getData();
  const enabled = characters.filter(item => item.enabled !== false);
  const activeId = settings.activeCharacterId || enabled[0]?.id || 'char_default';
  const stageIds = settings.stageMode === 'multi'
    ? (settings.stageCharacterIds || []).filter(id => enabled.some(item => item.id === id)).slice(0, 3)
    : [activeId];
  const ids = stageIds.length ? stageIds : [activeId];
  const assets = await Promise.all(ids.map(id => window.companion.getCharacter(id)));
  currentScale = Number(settings.petScale) || 1;
  character.style.setProperty('--pet-scale', currentScale);
  character.classList.toggle('multi', ids.length > 1);
  character.classList.toggle('count-3', ids.length >= 3);
  character.replaceChildren();
  assets.forEach((asset, assetIndex) => {
    if (asset.type === 'spine') {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', enabled.find(item => item.id === ids[assetIndex])?.name || 'Spine 桌宠角色');
      character.append(canvas);
      const view = new window.SpinePetRenderer(canvas, asset);
      spineViews.push(view);
      view.initialize().catch(error => {
        if (generation !== loadGeneration) return;
        view.destroy();
        const image = new Image();
        image.draggable = false;
        image.alt = canvas.getAttribute('aria-label');
        image.src = asset.src;
        canvas.replaceWith(image);
        showBubble(`骨骼角色加载失败：${error.message}`, 5000);
      });
      return;
    }
    const image = new Image();
    image.draggable = false;
    image.alt = enabled.find(item => item.id === ids[assetIndex])?.name || '桌宠角色';
    character.append(image);
    if (asset.type !== 'frames') { image.src = `${asset.src}?v=${Date.now()}`; return; }
    let frame = 0;
    const draw = () => {
      image.src = `${asset.frames[frame]}?v=${Date.now()}`;
      frame = (frame + 1) % asset.frames.length;
      frameTimers[assetIndex] = setTimeout(draw, Math.max(40, settings.frameMs || 180));
    };
    draw();
  });
}

character.addEventListener('pointerdown', event => {
  dragging = true; moved = 0; last = { x: event.screenX, y: event.screenY };
  window.companion.startDrag(last);
  character.setPointerCapture(event.pointerId);
});
character.addEventListener('pointermove', event => {
  if (!dragging) return;
  const current = { x: event.screenX, y: event.screenY };
  moved += Math.abs(current.x - last.x) + Math.abs(current.y - last.y);
  last = current; pendingDragPoint = current;
  if (!dragFrame) dragFrame = requestAnimationFrame(() => {
    dragFrame = 0;
    if (pendingDragPoint) window.companion.dragTo(pendingDragPoint);
  });
});
function finishDrag() {
  dragging = false; pendingDragPoint = null; cancelAnimationFrame(dragFrame); dragFrame = 0;
  window.companion.endDrag();
  if (moved < 6) window.companion.openPanel();
}
character.addEventListener('pointerup', finishDrag);
character.addEventListener('pointercancel', () => { dragging = false; pendingDragPoint = null; cancelAnimationFrame(dragFrame); dragFrame = 0; window.companion.endDrag(); });
character.addEventListener('wheel', async event => {
  event.preventDefault();
  const step = event.shiftKey ? 0.05 : 0.1;
  currentScale = Math.round(Math.max(0.2, Math.min(5, currentScale + (event.deltaY < 0 ? step : -step))) * 100) / 100;
  character.style.setProperty('--pet-scale', currentScale);
  await window.companion.setPetScale(currentScale, true);
  showBubble(`人物大小 ${Math.round(currentScale * 100)}%`, 1200);
}, { passive: false });

document.querySelector('#open-panel').addEventListener('click', event => { event.stopPropagation(); window.companion.openPanel(); });
document.querySelector('#open-ai-chat').addEventListener('click', event => { event.stopPropagation(); window.companion.openAIChat(); });
document.querySelector('#cycle-character').addEventListener('click', async event => { event.stopPropagation(); await window.companion.cycleCharacter(); });
document.querySelector('#toggle-stage').addEventListener('click', async event => { event.stopPropagation(); await window.companion.toggleStageMode(); });
document.querySelector('#open-codex').addEventListener('click', event => { event.stopPropagation(); window.companion.openCodex(); });
document.querySelector('#hide-pet').addEventListener('click', event => { event.stopPropagation(); window.companion.togglePet(false); });
document.querySelector('#close-app').addEventListener('click', event => { event.stopPropagation(); window.companion.closeApp(); });
document.querySelector('#dismiss').addEventListener('click', () => { bubble.hidden = true; });
window.companion.onDue(item => showBubble(item.title));
window.companion.onCharacterReload(loadCharacter);
window.companion.onPetScaleChanged(scale => { currentScale = scale; character.style.setProperty('--pet-scale', scale); });
window.companion.onPomodoroTick(state => {
  petStatus.hidden = !state.running;
  const minutes = String(Math.floor(state.remaining / 60)).padStart(2, '0');
  const seconds = String(state.remaining % 60).padStart(2, '0');
  document.querySelector('#pet-time').textContent = `${minutes}:${seconds}`;
  petStatus.lastElementChild.textContent = state.mode === 'focus' ? '专注中' : '休息中';
});
loadCharacter();
