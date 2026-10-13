const SAVE_W = 'sbm_world2', SAVE_C = 'sbm_code', $ = id => document.getElementById(id);
const myPid = localStorage.getItem('sbm_pid') || ('p' + Math.random().toString(36).slice(2, 10)); localStorage.setItem('sbm_pid', myPid);
let nick = localStorage.getItem('sbm_nick') || ('玩家' + myPid.slice(1, 4)); $('nick').value = nick;
let mode = 'solo', engine = null, hostS = null, client = null, transport = null;
let running = false, speed = 1, ws = null, code = '';
applyIcons();
const renderer = new Renderer($('stage')); renderer.myPid = myPid;
let showFps = localStorage.getItem('sbm_fps') === '1';
// 控制台：保留最近 500 条，可按文本 / 类型过滤（同官方 Console）
const LOGS = []; let cnFilter = 'all';
const log = (s, cls) => { s = String(s); LOGS.push({ s, cls: cls || (/错误|error|失败/i.test(s) ? 'err' : ''), t: engine ? engine.w.time : client?.view?.time }); if (LOGS.length > 500) LOGS.splice(0, LOGS.length - 500); if (typeof renderConsole === 'function') renderConsole(); };

function myBadge() { try { const b = JSON.parse(localStorage.getItem('sbm_profile') || '{}').badge; return b && typeof b.type === 'number' ? b : null; } catch (e) { return null; } }
function loadEngine() {
  let w = null; try { w = JSON.parse(localStorage.getItem(SAVE_W)); } catch (e) {}
  if (!w || w.v !== 3) w = newWorld();
  engine = new Engine(w); engine.onLog = (pid, s) => { if (pid === myPid) log(s); };
  engine.addPlayer(myPid, nick, true, myBadge()); engine.setCode(myPid, code);
  renderer.reset(); renderer.setView(engine.w, 500 / speed);
  const sp = engine.w.spawns.find(s => s.owner === myPid); if (sp) renderer.fitRoom(Math.floor(sp.x / ROOM), Math.floor(sp.y / ROOM)); else renderer.fitRoom(5, 5);
}
function save() { if (engine && mode !== 'client') localStorage.setItem(SAVE_W, engine.saveData()); }

// 代码编辑器夜间模式（设置里切换，持久化；默认跟随深色界面 = 开）
const DARK_THEME = Blockly.Theme.defineTheme('sbmDark', { name: 'sbmDark', base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#1e1f24', toolboxBackgroundColour: '#25272d', toolboxForegroundColour: '#e6e6e6', flyoutBackgroundColour: '#25272d', flyoutForegroundColour: '#e6e6e6', flyoutOpacity: 1, scrollbarColour: '#555', scrollbarOpacity: 0.6, insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.3, cursorColour: '#d0d0d0' } });
const LIGHT_THEME = Blockly.Theme.defineTheme('sbmLight', { name: 'sbmLight', base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#ffffff', flyoutBackgroundColour: '#eef0f3', flyoutOpacity: 1 } });
function edDark() { return localStorage.getItem('sbm_ed_dark') !== '0'; }
function applyEdTheme() { const d = edDark(); $('editor').classList.toggle('dark', d); if (ws) ws.setTheme(d ? DARK_THEME : LIGHT_THEME); }
window.setEdDark = v => { localStorage.setItem('sbm_ed_dark', v ? '1' : '0'); applyEdTheme(); };
window.edDark = edDark;
function initBlockly() {
  // 竖屏手机：顶部一行（分类 chips + 完成）+ 左侧竖向 flyout（≤45% 宽），默认收起
  ws = Blockly.inject('blocklyDiv', { toolbox: { kind: 'flyoutToolbox', contents: [] }, trashcan: false,
    zoom: { controls: false, wheel: true, pinch: true, startScale: 0.8, minScale: 0.4, maxScale: 2 },
    move: { scrollbars: true, drag: true, wheel: true }, grid: { spacing: 24, length: 2, colour: '#ddd', snap: true },
    renderer: 'zelos', horizontalLayout: false, toolboxPosition: 'start', theme: edDark() ? DARK_THEME : LIGHT_THEME });
  $('editor').classList.toggle('dark', edDark());
  fly = ws.getFlyout();
  // 全屏积木列表：flyout 铺满编辑区，按最宽积木缩放到屏宽，竖向滚动
  fly.getFlyoutScale = () => flyScale;
  const reflow = fly.reflowInternal_.bind(fly);
  fly.reflowInternal_ = function () { reflow(); const W = Math.round($('blocklyDiv').getBoundingClientRect().width);
    if (W > 0 && this.width_ !== W) { this.width_ = W; this.setBackgroundPath(W, this.height_ || 0); this.position(); ws.resize(); } };
  fly.dragAngleRange_ = 0; // 列表内滑动只滚动；长按后才允许拖出
  fly.isScrollable = () => true; // 短列表也不要一碰就拖出
  fly.wouldDelete = () => false; // 全屏列表收起后不能再当删除区（否则拖出的积木被吞）
  fly.getClientRect = (orig => function () { return this.isVisible() ? orig.call(this) : null; })(fly.getClientRect);
  const fsvg = $('blocklyDiv'); let lpT = null, lp0 = null;
  fsvg.addEventListener('pointerdown', e => { if (!fly.isVisible() || !e.target.closest('.blocklyFlyout .blocklyDraggable')) return; lp0 = [e.clientX, e.clientY];
    clearTimeout(lpT); lpT = setTimeout(() => { fly.dragAngleRange_ = 180; lpArmed = true; navigator.vibrate && navigator.vibrate(20); }, 380); }, true);
  fsvg.addEventListener('pointermove', e => { if (lp0 && !lpArmed && Math.hypot(e.clientX - lp0[0], e.clientY - lp0[1]) > 8) { clearTimeout(lpT); lp0 = null; } }, true);
  const lpEnd = () => { clearTimeout(lpT); lp0 = null; setTimeout(() => { fly.dragAngleRange_ = 0; lpArmed = false; }, 0); };
  fsvg.addEventListener('pointerup', lpEnd, true); fsvg.addEventListener('pointercancel', lpEnd, true);
  // 返回按钮：按下与抬起都在按钮上才算（避免打开列表那一下的 click 落到同位置的返回键上）
  { const fb = $('flyBack'); let d = false; fb.addEventListener('pointerdown', () => { d = true; }); fb.addEventListener('pointerup', () => { if (d) closeFlyout(); d = false; }); fb.addEventListener('pointercancel', () => { d = false; }); }
  window.addEventListener('popstate', () => { if (fly && fly.isVisible()) closeFlyout(true); });
  fly.hide(); buildCatBar();
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE_C)); } catch (e) {}
  try { Blockly.serialization.workspaces.load(saved || DEFAULT_WS, ws); } catch (e) { console.warn('旧积木存档不兼容，已恢复默认', e); ws.clear(); Blockly.serialization.workspaces.load(DEFAULT_WS, ws); }
  ws.addChangeListener(e => {
    if (e.type === Blockly.Events.BLOCK_DRAG) { // 从抽屉拖出后自动收起
      if (e.isStart && fly.isVisible()) closeFlyout(); // 长按拖出：列表收起，积木继续跟手
      if (!e.isStart) { const hot = overTrash(); $('edTrash').classList.remove('hot'); const b = ws.getBlockById(e.blockId); if (hot && b) setTimeout(() => b.dispose(true, true), 0); }
    }
    if (!e.isUiEvent) { regen(false); localStorage.setItem(SAVE_C, JSON.stringify(Blockly.serialization.workspaces.save(ws))); }
  });
  // 点击 flyout 里的积木 = 添加到可见区域中心
  fly.getWorkspace().addChangeListener(e => { if (e.type === Blockly.Events.CLICK && e.blockId && fly.isVisible()) setTimeout(() => tapAdd(e.blockId), 0); });
  regen(false);
}
let fly = null, activeCat = null, dragFromFly = false, lastPt = [0, 0], flyScale = 0.7, lpArmed = false;
// 小号工具按钮（32px）：缩放 / 居中 / 垃圾桶（拖到上面删除，点一下删除选中积木）
document.addEventListener('pointermove', e => { lastPt = [e.clientX, e.clientY]; if (ws && ws.isDragging && ws.isDragging()) $('edTrash').classList.toggle('hot', overTrash()); }, true);
function overTrash() { const r = $('edTrash').getBoundingClientRect(); return lastPt[0] >= r.left - 8 && lastPt[0] <= r.right + 8 && lastPt[1] >= r.top - 8 && lastPt[1] <= r.bottom + 8; }
$('edZin').onclick = () => ws.zoomCenter(1); $('edZout').onclick = () => ws.zoomCenter(-1); $('edCenter').onclick = () => ws.scrollCenter();
$('edTrash').onclick = () => { const s = Blockly.getSelected && Blockly.getSelected(); if (s && s.workspace === ws && s.isDeletable()) s.dispose(true, true); };
function buildCatBar() {
  const bar = $('catBar');
  if (bar.children.length) { for (const b of bar.children) b.classList.toggle('on', b.dataset.cat === activeCat); return; }
  for (const c of CATS) {
    const b = document.createElement('button'); b.className = 'cat' + (c.id === activeCat ? ' on' : ''); b.dataset.cat = c.id;
    b.textContent = c.name; b.style.background = c.colour; let d0 = null; // 用 pointer 事件，避免 Blockly 拖拽后浏览器吞掉 click
    b.addEventListener('pointerdown', e => { d0 = [e.clientX, e.clientY]; });
    b.addEventListener('pointerup', e => { if (d0 && Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) < 10) selectCat(c.id); d0 = null; });
    b.addEventListener('pointercancel', () => { d0 = null; }); bar.appendChild(b);
  }
}
function closeFlyout(fromPop) { if (!fly) return; const was = fly.isVisible(); fly.hide(); activeCat = null; buildCatBar(); $('edTabs').classList.remove('flyOpen'); Blockly.svgResize(ws);
  if (was && !fromPop && history.state && history.state.fly) history.back(); }
function selectCat(id) {
  const c = CATS.find(x => x.id === id); if (!c || !ws) return;
  if (activeCat === id && fly.isVisible()) return closeFlyout(); // 再点一次当前分类 = 收起
  activeCat = id; buildCatBar();
  $('edTabs').classList.add('flyOpen'); $('flyTitle').textContent = c.name; Blockly.svgResize(ws);
  if (!(history.state && history.state.fly)) history.pushState({ fly: 1 }, ''); // 安卓返回键 = 返回工作区
  flyScale = 0.8; fly.show(flyoutFor(c));
  // 按最宽积木缩放，保证完整显示
  const W = $('blocklyDiv').getBoundingClientRect().width - 24; let maxW = 0;
  for (const b of fly.getWorkspace().getTopBlocks(false)) maxW = Math.max(maxW, b.getHeightWidth().width);
  const sc = Math.max(0.4, Math.min(0.8, W / (maxW || 1))); if (Math.abs(sc - flyScale) > 0.01) { flyScale = sc; fly.show(flyoutFor(c)); }
  // 抽屉里的字段不可编辑：点任何位置都 = 添加积木（拖出后再编辑）
  for (const b of fly.getWorkspace().getAllBlocks(false)) for (const inp of b.inputList) for (const f of inp.fieldRow) if (f.setEnabled) f.setEnabled(false);
  fly.scrollToStart && fly.scrollToStart();
  Blockly.svgResize(ws);
}
function tapAdd(blockId) {
  const src = fly.getWorkspace().getBlockById(blockId); if (!src) return;
  const root = src.getRootBlock(); if (root.isEnabled && !root.isEnabled()) return;
  const state = Blockly.serialization.blocks.save(root, { addCoordinates: false, addNextBlocks: true });
  const v = ws.getMetricsManager().getViewMetrics(true);
  Blockly.Events.setGroup(true);
  const nb = Blockly.serialization.blocks.append(state, ws);
  const hw = nb.getHeightWidth();
  nb.moveBy(v.left + v.width / 2 - hw.width / 2 + (Math.random() * 30 - 15), v.top + v.height / 2 - hw.height / 2 + (Math.random() * 30 - 15));
  Blockly.Events.setGroup(false);
  nb.select && nb.select();
  closeFlyout();
}
function regen(push = true) {
  code = Blockly.JavaScript.workspaceToCode(ws); 
  try { compileUser(code); } catch (e) { log('[错误] 编译失败: ' + e.message); return; }
  if (push) applyCode();
}
function applyCode() { if (mode === 'client') client && client.sendCode(code); else engine && engine.setCode(myPid, code); }

let _snap = null; // 单机/房主也用快照（字段与客户端一致：spawn.energy/cap 等）
function view() { if (mode === 'client') return client?.view; if (!engine) return null; if (!_snap || _snap.time !== engine.w.time || _snap.S !== engine.w.S) _snap = engine.snapshot(); return _snap; }
const chip = (ic, html) => `<span class="chip${ic === 'bolt' ? ' en' : ''}"><span class="ic">${icon(ic)}</span>${html}</span>`;
const chipX = (ic, html) => chip(ic, html).replace('class="chip', 'class="chip xl');
function stats() {
  const v = view(); let H;
  if (!v) H = chip('plug-connected', mode === 'client' ? '等待房主…' : '');
  else {
    const re = roomEnergy(v), n = v.creeps.filter(c => c.owner === myPid).length, np = Object.keys(v.players).length;
    H = chip(mode === 'solo' ? 'device-gamepad-2' : mode === 'host' ? 'home' : 'wifi', mode === 'client' ? '客户端' : running ? '运行' : '暂停') + chip('refresh', `<b>${v.time}</b>`) + chip('bolt', `<b>${re ? re[0] + '/' + re[1] : '-'}</b>`) + chip('bug', `<b>${n}</b>`) + chipX('users', `${np}`) + chipX('map', `${v.S}×${v.S}`);
  }
  if (showFps) H += chip('gauge', `${renderer.fps.toFixed(0)} fps · ${tickMs.toFixed(1)}ms`);
  const need = !!(v && v.players[myPid]?.needsSpawn); $('rbSpawn').classList.toggle('hidden', !need || build.type === 'spawn1');
  if (need && !wm.auto && $('start').classList.contains('hidden') && $('wmap').classList.contains('hidden') && !build.on) openWorldMap(true);
  updateRoomNav(v);
  if (H !== stats._h) $('hud').innerHTML = stats._h = H;
}
let tickMs = 0, hudT = 0;
let acc = 0, lastT = performance.now();
function loop(t) {
  const dt = t - lastT; lastT = t;
  if (mode !== 'client' && running && engine) {
    acc += dt; const step = 500 / speed; let n = 0;
    while (acc >= step && n < 8) { const t0 = performance.now(); engine.tick(); tickMs = tickMs * .9 + (performance.now() - t0) * .1; renderer.setView(engine.w, step); hostS && hostS.afterTick(step); acc -= step; n++; if (engine.w.time % 50 === 0) save(); }
    if (acc > step * 8) acc = 0; // 设备太慢时丢弃积压，避免卡顿
  }
  if (t - hudT > 250) { hudT = t; stats(); } requestAnimationFrame(loop);
}
function setLabel(btn, ic, text) { const b = $(btn); b.querySelector('.ic').innerHTML = icon(ic); b.querySelector('.lb').textContent = text; }
function setRunUI() { setLabel('btnRun', running && mode !== 'client' ? 'player-pause' : 'player-play', mode === 'client' ? '房主控制' : running ? '暂停' : '运行'); $('btnRun').classList.toggle('on', running && mode !== 'client'); $('btnRun').disabled = mode === 'client'; $('btnSpeed').disabled = mode === 'client'; }
$('btnRun').onclick = () => { running = !running; setRunUI(); if (!running) save(); };
// 运行速度：立即作用于主循环（每 tick 间隔 = 500ms / 速度），并保存到设置，下次进入游戏沿用
function setSpeed(v, persist = true) {
  speed = [1, 2, 4, 8].includes(+v) ? +v : 1; acc = 0; setLabel('btnSpeed', 'player-track-next', speed + 'x'); $('btnRun').dataset.speed = speed + 'x';
  if (persist) try { const s = JSON.parse(localStorage.getItem('sbm_settings') || '{}'); s.speed = speed; localStorage.setItem('sbm_settings', JSON.stringify(s)); } catch (e) {}
}
window.setSpeed = setSpeed;
// 左侧工具栏收起/展开
(function barToggle() { const t = document.createElement('button'); t.id = 'barTog'; const set = m => { document.body.classList.toggle('barMin', m); t.textContent = m ? '›' : '‹'; localStorage.setItem('sbm_barMin', m ? '1' : ''); }; t.onclick = () => set(!document.body.classList.contains('barMin')); document.body.appendChild(t); set(!!localStorage.getItem('sbm_barMin')); })();
$('btnSpeed').onclick = () => setSpeed(speed >= 8 ? 1 : speed * 2);
// 底栏精简：速度并入「运行」长按弹出菜单
(function runSpeedPopup() {
  const pop = document.createElement('div'); pop.id = 'speedPop'; pop.className = 'hidden';
  pop.innerHTML = [1, 2, 4, 8].map(v => `<button data-v="${v}">${v}x</button>`).join(''); document.body.appendChild(pop);
  const sync = () => pop.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === speed));
  pop.onclick = e => { const b = e.target.closest('button'); if (!b) return; setSpeed(b.dataset.v); pop.classList.add('hidden'); };
  const r = $('btnRun'); let t = null, fired = false;
  r.addEventListener('pointerdown', () => { fired = false; t = setTimeout(() => { fired = true; sync(); pop.classList.remove('hidden'); }, 450); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(k => r.addEventListener(k, () => clearTimeout(t)));
  r.addEventListener('click', e => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  r.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerdown', e => { if (!pop.contains(e.target) && e.target.closest('#btnRun') == null) pop.classList.add('hidden'); });
  window.openSpeedPop = () => { sync(); pop.classList.remove('hidden'); };
})();
$('btnLog').onclick = () => $('panel').classList.contains('hidden') ? (infoRoom = null, openPanel(panelTab)) : $('panel').classList.add('hidden');
$('btnCode').onclick = () => { $('editor').classList.remove('hidden'); renderer.pause(true); Blockly.svgResize(ws); };
$('edClose').onclick = () => { $('editor').classList.add('hidden'); renderer.pause(false); regen(true); log('[代码] 已应用'); };
$('btnMenu').onclick = () => $('menu').classList.remove('hidden');
$('mClose').onclick = () => $('menu').classList.add('hidden');
$('mSave').onclick = () => { save(); alert('已保存'); };
$('mReset').onclick = () => { if (mode === 'client') return alert('客户端不能重置房主的世界'); if (confirm('确定重置整个世界？（代码会保留）')) { localStorage.removeItem(SAVE_W); const peers = hostS ? Object.keys(engine.w.players) : []; loadEngine(); if (hostS) { hostS.e = engine; rebindHost(); } $('menu').classList.add('hidden'); } };
$('mResetCode').onclick = () => { if (confirm('恢复默认积木程序？')) { ws.clear(); Blockly.serialization.workspaces.load(DEFAULT_WS, ws); regen(true); } };
$('mIntro').onclick = () => { $('menu').classList.add('hidden'); $('intro').classList.remove('hidden'); };
$('introOk').onclick = () => { $('intro').classList.add('hidden'); localStorage.setItem('sbm_intro', '1'); };
$('mUpdate').onclick = () => checkUpdate(true);
function fpsUI() { setLabel('mFps', 'gauge', '显示 FPS：' + (showFps ? '开' : '关')); }
$('mFps').onclick = () => { showFps = !showFps; localStorage.setItem('sbm_fps', showFps ? '1' : '0'); fpsUI(); stats._h = ''; }; fpsUI();
// 开始界面
$('startVer').textContent = 'v' + (window.APP_VERSION || 'dev');
const hideStart = () => $('start').classList.add('hidden');
$('sPlay').onclick = () => { hideStart(); if (!localStorage.getItem('sbm_intro')) $('intro').classList.remove('hidden'); };
$('sNet').onclick = () => { hideStart(); $('net').classList.remove('hidden'); };
$('sSet').onclick = () => { hideStart(); $('menu').classList.remove('hidden'); };

$('ver').textContent = '版本 ' + (window.APP_VERSION || 'dev');

// ===== 联机 =====
function netStatus(s) { $('netStatus').textContent = s; }
$('btnNet').onclick = () => $('net').classList.remove('hidden');
$('nClose').onclick = () => $('net').classList.add('hidden');
$('nick').onchange = () => { nick = $('nick').value.trim() || nick; localStorage.setItem('sbm_nick', nick); if (engine?.w.players[myPid]) engine.w.players[myPid].name = nick; };
function rebindHost() { const old = hostS; hostS = new HostSession(engine, transport, myPid); hostS.onLocalLog = log; hostS.onPeers = () => showHostInfo(); if (old) old.clients.forEach((c, id) => hostS.clients.set(id, c)); }
let hostIps = [];
function showHostInfo() {
  const peers = hostS ? hostS.peerNames() : []; netStatus(`房主中 · 端口 ${LAN_PORT} · 已连接 ${peers.length}${peers.length ? '：' + peers.join('、') : ''}`);
  const is192 = ip => /^192\.168\./.test(ip), tag = ip => is192(ip) ? 'WiFi/热点' : /^10\./.test(ip) ? '局域网/移动网络' : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? '虚拟网卡' : '';
  const sorted = hostIps.slice().sort((a, b) => is192(b) - is192(a));
  $('ipList').innerHTML = sorted.map(ip => `<div class="ipItem"><span class="ic">${icon('wifi')}</span><span class="lb">${ip}:${LAN_PORT}</span><span class="tag">${tag(ip)}</span></div>`).join('');
}
async function stopNet() { $('ipList').innerHTML = ''; if (client) { client.close(); client = null; } if (transport) { await transport.plugin.stop(); } hostS = null; }
$('nHost').onclick = async () => {
  transport = transport || nativeTransport(); if (!transport) return alert('开房需要在安卓 App 中运行（浏览器版只能单机/加入）');
  await stopNet(); if (mode === 'client') { mode = 'solo'; loadEngine(); }
  try { const r = await transport.plugin.start({ port: LAN_PORT, name: nick }); hostIps = r.ips || []; } catch (e) { return alert('开房失败：' + e.message); }
  mode = 'host'; rebindHost(); showHostInfo(); setRunUI(); log('[联机] 已开房，其他手机在同一 WiFi/热点下点“搜索”或输入 IP 加入');
};
$('nScan').onclick = async () => {
  const P = lanPlugin(); if (!P) return alert('搜索需要安卓 App；也可手动输入 IP');
  $('hosts').textContent = '搜索中…'; try { const r = await P.discover({ timeout: 3500 }); $('hosts').textContent = r.hosts.length ? '' : '没找到（可手动输入 IP）';
    for (const h of r.hosts) { const b = document.createElement('button'); b.innerHTML = `<span class="ic">${icon('login')}</span><span class="lb">加入 ${h.name}（${h.ip}）</span>`; b.onclick = () => join(h.ip + ':' + h.port); $('hosts').appendChild(b); } } catch (e) { $('hosts').textContent = '搜索失败：' + e.message; }
};
$('nJoin').onclick = () => { const ip = $('ip').value.trim(); if (ip) { localStorage.setItem('sbm_lastip', ip); join(ip.includes(':') ? ip : ip + ':' + LAN_PORT); } };
$('ip').value = localStorage.getItem('sbm_lastip') || '';
async function join(addr) {
  if (mode !== 'client') save(); await stopNet(); running = false;
  mode = 'client'; engine = null; renderer.reset();
  client = new ClientSession('ws://' + addr, myPid, nick); client.code = code; client.badge = myBadge();
  client.onTick = v => renderer.setView(v, v.dt || 500); client.onLog = log;
  client.onStatus = s => { netStatus(`客户端 ${addr} · ${s}`); log('[联机] ' + s); };
  setRunUI(); netStatus('连接中 ' + addr); $('net').classList.add('hidden');
}
$('nSolo').onclick = async () => { await stopNet(); mode = 'solo'; running = false; loadEngine(); setRunUI(); netStatus('当前：单机'); };

// 检查器：点选对象，按 tick 刷新
let sel = null;
const PARTC = { work: '#ffe56d', carry: '#777', move: '#a9b7c6' };
const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const findIn = (v, o) => { if (!v || !o) return null; const L = { creep: v.creeps, spawn: v.spawns, source: v.sources, site: v.sites, controller: v.controllers, structure: v.structures, mineral: v.minerals, resource: v.resources, tombstone: v.tombstones }[o.kind]; return L ? L.find(x => x.id === o.id) : null; };
function renderInspect() {
  if (!sel) return; const v = view(), o = findIn(v, sel); if (!v || !o) { $('inspect').classList.add('hidden'); return; }
  const pn = id => esc(v.players[id]?.name || id || '-'); let t = '', b = kv('位置', `x ${((o.x % 50) + 50) % 50}, y ${((o.y % 50) + 50) % 50} · ${roomName(o.x, o.y)}`);
  if (sel.kind === 'creep') { t = 'Creep ' + esc(o.name); const cap = o.body.filter(p => p === 'carry').length * 50;
    b += kv('所属', pn(o.owner)) + kv('身体', `<span class="body">${o.body.map(p => `<span class="part" style="background:${PARTC[p]}"></span>`).join('')}</span>`) + kv('hits', `${o.hits ?? o.body.length * 100} / ${o.body.length * 100}`) + kv('能量', `${o.energy} / ${cap}`) + kv('ticksToLive', o.ttl);
    if (mode !== 'client' && o.owner === myPid) b += `<pre class="mem">Memory ${esc(JSON.stringify(engine.w.memory[myPid].creeps[o.name] || {}, null, 1))}</pre>`; }
  else if (sel.kind === 'spawn') { t = 'StructureSpawn ' + esc(o.name); b += kv('所属', pn(o.owner)) + kv('hits', '5000 / 5000') + kv('能量', `${o.energy} / ${o.cap}`) + kv('生产', o.spawning ? `${esc(o.spawning.name)}（剩 ${o.spawning.left} tick）` : '空闲'); }
  else if (sel.kind === 'source') { t = 'Source'; b += kv('能量', `${o.energy} / ${o.cap}`) + kv('再生', '每 300 tick'); }
  else if (sel.kind === 'controller') { t = 'StructureController'; b += kv('所属', o.owner ? pn(o.owner) : '未占领') + kv('等级 RCL', o.level) + kv('进度', `${o.progress} / ${o.progressTotal}`) + kv('降级倒计时', o.ticksToDowngrade || '-'); }
  else if (sel.kind === 'structure') { t = 'Structure ' + esc(o.type); b += kv('所属', pn(o.owner)) + kv('hits', `${o.hits} / ${o.hitsMax}`) + (o.energyCapacity != null ? kv('能量', `${o.energy||0} / ${o.energyCapacity}`) : ''); }
  else if (sel.kind === 'site') { t = 'ConstructionSite'; b += kv('类型', o.type) + kv('所属', pn(o.owner)) + kv('进度', `${o.progress} / ${o.total}`); }
  else if (sel.kind === 'mineral') { t = 'Mineral ' + esc(o.type); b += kv('mineralType', esc(o.type)) + kv('mineralAmount', o.amount); }
  else if (sel.kind === 'resource') { t = 'Resource'; b += kv('resourceType', esc(o.resourceType)) + kv('amount', o.amount); }
  else if (sel.kind === 'tombstone') { t = 'Tombstone ' + esc(o.creepName || ''); b += kv('所属', pn(o.owner)) + kv('能量', o.energy) + kv('ticksToDecay', o.decay); }
  $('insTitle').innerHTML = t; $('insBody').innerHTML = b; $('inspect').classList.remove('hidden');
}
renderer.onTap = (x, y) => {
  if (renderer.lod === 'mini') return showRoomInfo(Math.floor(x / ROOM), Math.floor(y / ROOM));
  if (build.on) return build.type === 'spawn1' ? spawnTap(x, y) : buildTap(x, y);
  const v = view(); if (!v) return; const f = a => a.find(o => o.x === x && o.y === y);
  const c = f(v.creeps), sp = f(v.spawns), s = f(v.sources), st = f(v.sites), mi = f(v.minerals || []), rs = f(v.resources || []), tb = f(v.tombstones || []);
  const ctrl = (v.controllers||[]).find(o => o.x === x && o.y === y), stt = (v.structures||[]).find(o => o.x === x && o.y === y);
  sel = c ? { kind: 'creep', id: c.id } : sp ? { kind: 'spawn', id: sp.id } : ctrl ? { kind: 'controller', id: ctrl.id } : stt ? { kind: 'structure', id: stt.id } : s ? { kind: 'source', id: s.id } : st ? { kind: 'site', id: st.id } : rs ? { kind: 'resource', id: rs.id } : tb ? { kind: 'tombstone', id: tb.id } : mi ? { kind: 'mineral', id: mi.id } : null;
  renderer.select(sel); if (sel) renderInspect(); else { $('inspect').classList.add('hidden'); showRoomInfo(Math.floor(x / ROOM), Math.floor(y / ROOM)); }
};
$('insClose').onclick = () => { sel = null; renderer.select(null); $('inspect').classList.add('hidden'); };
renderer.onTick = () => renderInspect();
// 状态栏：不覆盖网页
(function boot() { const host = $('editor'); host.classList.remove('hidden'); host.style.visibility = 'hidden'; initBlockly(); host.classList.add('hidden'); host.style.visibility = ''; loadEngine(); setRunUI(); })();
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
requestAnimationFrame(loop);
setTimeout(() => checkUpdate(false), 2000);
const qj = new URLSearchParams(location.search).get('join'); if (qj) join(qj);
if (new URLSearchParams(location.search).get('run')) { hideStart(); running = true; setSpeed(4, false); setRunUI(); }
if (qj) hideStart();

// ===== 手动建造（同官方客户端）：选建筑 → 点格子预览 → 放置；点自己的工地可移除 =====
const ST_ZH = { spawn: 'Spawn', extension: '扩展', road: '道路', constructedWall: '墙', rampart: '城墙', link: '链路', storage: '仓库', tower: '防御塔', observer: '观察者', powerSpawn: '能量中心', extractor: '采矿机', lab: '实验室', terminal: '终端', container: '容器', nuker: '核弹', factory: '工厂' };
const ERR_ZH = { '-1': '不是你的房间', '-3': '名字已存在', '-7': '位置无效', '-8': '工地数量已达上限', '-10': '参数无效', '-14': 'RCL 不足或房间不归你', '-15': 'GCL 不足' };
const build = { on: false, type: null, at: null };
function toastMsg(m) { let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('on'); clearTimeout(toastMsg._t); toastMsg._t = setTimeout(() => t.classList.remove('on'), 1800); }
function myRoomCtx() { const w = engine.w, sp = w.spawns.find(s => s.owner === myPid); if (!sp) return null; const k = roomKey(sp.x, sp.y), c = ctrlOfRoom(w, k); return { k, lvl: c && c.owner === myPid ? c.level : 0 }; }
function openBuildPicker() {
  if (mode === 'client') return toastMsg('联机客户端暂不支持手动建造');
  if (!engine) return; const r = myRoomCtx(); $('bpTitle').textContent = r ? `建造 · RCL ${r.lvl}` : '建造';
  const w = engine.w; let h = '';
  for (const t of Object.keys(ST_ZH)) { if (!SC.CONTROLLER_STRUCTURES[t]) continue; const lim = r ? SC.CONTROLLER_STRUCTURES[t][r.lvl] || 0 : 0; if (!lim) continue;
    const used = r ? countStruct(w, myPid, t, r.k) : 0;
    h += `<button data-t="${t}" ${used >= lim ? 'disabled' : ''}><span class="n">${ST_ZH[t]}</span><span class="d">${used}/${lim > 1000 ? '∞' : lim} · ${SC.CONSTRUCTION_COST[t]} 能量</span></button>`; }
  h += `<button data-t="flag"><span class="n">旗帜</span><span class="d">标记位置</span></button>`;
  $('bpList').innerHTML = h; $('bpList').querySelectorAll('button').forEach(b => b.onclick = () => startBuild(b.dataset.t));
  $('buildPick').classList.remove('hidden'); $('inspect').classList.add('hidden');
}
function startBuild(t) { build.on = true; build.type = t; build.at = null; $('buildPick').classList.add('hidden'); $('buildBar').classList.remove('hidden'); $('bbOk').disabled = true; $('bbOk').textContent = '放置'; $('bbMsg').textContent = `点地图选择${t === 'flag' ? '旗帜' : ST_ZH[t]}的位置`; $('btnBuild').classList.add('on'); }
function endBuild() { build.on = false; build.at = null; renderer.preview = null; renderer.drawSel(); $('buildBar').classList.add('hidden'); $('btnBuild').classList.remove('on'); }
function apiPos(A, x, y) { return new A.RoomPosition(x % ROOM, y % ROOM, roomName(x, y)); }
function buildTap(x, y) {
  const w = engine.w, site = w.sites.find(s => s.x === x && s.y === y && s.owner === myPid);
  if (site) { build.at = { x, y, remove: site.id }; renderer.preview = { x, y, ok: false }; $('bbMsg').textContent = `移除${ST_ZH[site.type] || site.type}工地？`; $('bbOk').textContent = '移除'; $('bbOk').disabled = false; renderer.drawSel(); return; }
  if (build.at && build.at.x === x && build.at.y === y && !build.at.remove) return confirmBuild();
  const ok = +engine.tile(x, y) !== T_WALL || build.type === 'road' || build.type === 'flag';
  build.at = { x, y }; renderer.preview = { x, y, ok }; renderer.drawSel();
  $('bbOk').textContent = '放置'; $('bbOk').disabled = false; $('bbMsg').textContent = `${build.type === 'flag' ? '旗帜' : ST_ZH[build.type]} · x ${x % ROOM}, y ${y % ROOM}`;
}
function confirmBuild() {
  const a = build.at; if (!a) return; const A = buildApi(engine, myPid); let r;
  if (a.remove) { const o = A.Game.getObjectById(a.remove); r = o ? o.remove() : -7; if (r === 0) toastMsg('已移除工地'); }
  else if (build.type === 'flag') { r = apiPos(A, a.x, a.y).createFlag(); if (typeof r === 'string') { toastMsg('已放置旗帜 ' + r); r = 0; } }
  else { r = apiPos(A, a.x, a.y).createConstructionSite(build.type); if (r === 0) toastMsg(`已放置${ST_ZH[build.type]}工地`); }
  if (r !== 0) { toastMsg('无法放置：' + (ERR_ZH[r] || ('错误 ' + r))); renderer.preview = { x: a.x, y: a.y, ok: false }; }
  else { renderer.preview = null; renderer.setView(engine.w, 1); }
  build.at = null; $('bbOk').disabled = true; $('bbOk').textContent = '放置'; renderer.drawSel(); save();
  if (r === 0) $('bbMsg').textContent = '继续点地图放置，或退出';
}
$('btnBuild').onclick = () => build.on ? endBuild() : ($('buildPick').classList.contains('hidden') ? openBuildPicker() : $('buildPick').classList.add('hidden'));
$('bpClose').onclick = () => $('buildPick').classList.add('hidden');
$('bbOk').onclick = () => build.type === 'spawn1' ? confirmSpawn() : confirmBuild(); $('bbCancel').onclick = () => { const sp = build.type === 'spawn1'; endBuild(); if (sp) { wm.auto = false; openWorldMap(true); } };

// ===== 世界地图 / 选择出生点（同官方：先选空闲房间，再点格子放 Spawn1） =====
const wm = { sel: null, auto: false, pick: false };
const WM_COL = { free: '#3d4a3a', close: '#5a2b2b', mine: '#6dc1ff', owned: '#c46b6b', highway: '#1d1d1d', center: '#4a4325' };
function wmData() { const v = view(); if (!v) return null; return { S: v.S, owned: v.owned || {}, players: v.players }; }
function drawWorldMap() {
  const d = wmData(), c = $('wmCanvas'); if (!d) return; const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = '#141414'; g.fillRect(0, 0, r.width, r.height);
  const cs = Math.floor(Math.min(r.width - 16, r.height - 16) / d.S * (wm.z || 1)), ox = (r.width - cs * d.S) / 2 + (wm.px || 0), oy = (r.height - cs * d.S) / 2 + (wm.py || 0); wm.geo = { cs, ox, oy, S: d.S };
  for (let ry = 0; ry < d.S; ry++) for (let rx = 0; rx < d.S; rx++) {
    const st = roomStatus(d.S, d.owned, rx, ry, myPid), x = ox + rx * cs, y = oy + ry * cs, o = d.owned[rx + ',' + ry];
    g.fillStyle = st === 'owned' && d.players[o] ? '#' + (d.players[o].color >>> 0).toString(16).padStart(6, '0') : WM_COL[st];
    g.fillRect(x + 1, y + 1, cs - 2, cs - 2);
    if (st === 'close') { g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); for (let i = -cs; i < cs; i += 5) { g.moveTo(x + i, y + cs); g.lineTo(x + i + cs, y); } g.save(); g.rect(x + 1, y + 1, cs - 2, cs - 2); g.clip(); g.stroke(); g.restore(); }
    if (wm.sel && wm.sel[0] === rx && wm.sel[1] === ry) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, cs - 4, cs - 4); g.lineWidth = 1; }
    if (cs >= 30) { g.fillStyle = 'rgba(255,255,255,.5)'; g.font = Math.min(14, cs / 4) + 'px sans-serif'; g.fillText(roomNameXY(rx, ry), x + 3, y + 3 + Math.min(14, cs / 4)); if (o && d.players[o] && cs >= 50) { g.fillStyle = '#fff'; g.fillText(d.players[o].name, x + 3, y + cs - 6); } }
    const [cx, cy] = renderer.curRoom(); if (!wm.pick && cx === rx && cy === ry) { g.strokeStyle = '#5973ff'; g.setLineDash([4, 3]); g.strokeRect(x + 3, y + 3, cs - 6, cs - 6); g.setLineDash([]); }
  }
  const me = Object.keys(d.owned).filter(k => d.owned[k] === myPid).length, free = (() => { let n = 0; for (let ry = 0; ry < d.S; ry++) for (let rx = 0; rx < d.S; rx++) if (roomStatus(d.S, d.owned, rx, ry, myPid) === 'free') n++; return n; })();
  $('wmInfo').textContent = `${d.S}×${d.S} · 空闲 ${free} · 我的 ${me}`;
}
function openWorldMap(pick) {
  wm.pick = !!pick; wm.auto = true; wm.sel = null; $('wmTitle').textContent = pick ? '选择出生房间' : '世界地图'; $('wmClose').style.display = pick ? 'none' : '';
  $('wmGo').disabled = true; $('wmGo').textContent = pick ? '进入房间' : '前往'; $('wmSel').textContent = pick ? '点选一个空闲（绿色）房间' : '点选一个房间';
  wm.z = 1; wm.px = 0; wm.py = 0; wm.last = null; $('wmap').classList.remove('hidden'); requestAnimationFrame(drawWorldMap);
}
window.openWorldMap = openWorldMap;
$('wmClose').onclick = () => $('wmap').classList.add('hidden');
$('wmCanvas').addEventListener('click', e => {
  const G = wm.geo; if (!G) return; const r = $('wmCanvas').getBoundingClientRect(), rx = Math.floor((e.clientX - r.left - G.ox) / G.cs), ry = Math.floor((e.clientY - r.top - G.oy) / G.cs);
  if (rx < 0 || ry < 0 || rx >= G.S || ry >= G.S) return; const d = wmData(), st = roomStatus(d.S, d.owned, rx, ry, myPid);
  const ZH = { free: '空闲，可出生', close: '离其他玩家太近', mine: '我的房间', owned: '已被 ' + (d.players[d.owned[rx + ',' + ry]]?.name || '其他玩家') + ' 占领', highway: '高速公路（无 Controller）', center: '扇区中心（无 Controller）' };
  wm.sel = [rx, ry]; $('wmSel').textContent = `${roomNameXY(rx, ry)} · ${ZH[st]}`; $('wmGo').disabled = wm.pick && st !== 'free'; if (!wm.pick && wm.last && wm.last[0] === rx && wm.last[1] === ry) return $('wmGo').click(); wm.last = [rx, ry]; drawWorldMap();
});
$('wmGo').onclick = () => {
  const [rx, ry] = wm.sel; $('wmap').classList.add('hidden');
  if (mode === 'client') client.gen(rx, ry); else { ensureNear(engine.w, rx, ry, 0); renderer.setView(engine.w, 1); _snap = null; }
  renderer.fitRoom(rx, ry);
  if (!wm.pick) return;
  build.on = true; build.type = 'spawn1'; build.at = null; $('buildBar').classList.remove('hidden'); $('bbOk').disabled = true; $('bbOk').textContent = '放置 Spawn1'; $('bbCancel').textContent = '返回地图';
  $('bbMsg').textContent = `点 ${roomNameXY(rx, ry)} 里的空地放置 Spawn1`; wm.room = [rx, ry];
};
function localSpawnCheck(x, y) {
  if (Math.floor(x / ROOM) !== wm.room[0] || Math.floor(y / ROOM) !== wm.room[1]) return '请在所选房间内放置';
  if (mode !== 'client') return engine.checkSpawnAt(myPid, x, y);
  const rm = client.rooms && client.rooms[wm.room.join(',')]; if (!rm) return '地形加载中…'; const lx = x % ROOM, ly = y % ROOM, T = (a, b) => rm.tiles[b * ROOM + a];
  if (lx < 1 || ly < 1 || lx > 48 || ly > 48) return '不能放在房间边缘'; if (T(lx, ly) === T_WALL) return '不能放在墙上';
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = lx + dx, Y = ly + dy; if ((X === 0 || Y === 0 || X === 49 || Y === 49) && T(X, Y) !== T_WALL) return '不能紧挨出口'; }
  return null;
}
function spawnTap(x, y) {
  const err = localSpawnCheck(x, y); build.at = { x, y }; renderer.preview = { x, y, ok: !err }; renderer.drawSel();
  $('bbMsg').textContent = err ? err : `Spawn1 · x ${x % ROOM}, y ${y % ROOM}`; $('bbOk').disabled = !!err;
}
function spawnDone() { endBuild(); $('bbCancel').textContent = '退出'; wm.auto = false; toastMsg('Spawn1 已放下，Controller 已占领（RCL 1）'); if (!running && mode !== 'client') { running = true; setRunUI(); } }
function confirmSpawn() {
  const a = build.at; if (!a) return;
  if (mode === 'client') { client.onSpawnRes = err => err ? toastMsg('无法放置：' + err) : spawnDone(); client.spawnAt(a.x, a.y); return; }
  const err = engine.placeSpawnAt(myPid, a.x, a.y); if (err) return toastMsg('无法放置：' + err);
  _snap = null; renderer.setView(engine.w, 1); hostS && hostS.pushAll(); save(); spawnDone();
}
window.doRespawn = () => { endBuild(); wm.auto = false; if (mode === 'client') client.respawn(); else { engine.respawn(myPid); _snap = null; renderer.reset(); renderer.setView(engine.w, 1); hostS && hostS.pushAll(); save(); } toastMsg('已重新出生，请选择新的出生点'); };
addEventListener('resize', () => { if (!$('wmap').classList.contains('hidden')) drawWorldMap(); });


// ===== 房间导航（同官方客户端：四边箭头到相邻房间、返回世界地图、顶栏房间名） =====
function roomEnergy(v, kk) { // 当前房间（若是我的）否则我的第一个房间：energyAvailable / energyCapacityAvailable
  const [rx, ry] = renderer.curRoom(), mineIn = k => v.owned && v.owned[k] === myPid; let k = kk || rx + ',' + ry;
  if (!mineIn(k)) { const sp = v.spawns.find(s => s.owner === myPid); if (!sp) return null; k = roomKey(sp.x, sp.y); }
  const inR = o => roomKey(o.x, o.y) === k && o.owner === myPid; let a = 0, c = 0;
  for (const s of v.spawns) if (inR(s)) { a += s.energy || 0; c += s.cap || 300; }
  for (const s of v.structures || []) if (s.type === 'extension' && inR(s)) { a += s.energy || 0; c += s.energyCapacity || 0; }
  return [a, c];
}
function roomTiles(rx, ry) { const k = rx + ',' + ry; return mode === 'client' ? client?.rooms?.[k]?.tiles : engine?.w.rooms[k]?.tiles; }
function edgeOpen(rx, ry, dx, dy) {
  const v = view(); if (!v) return false; const nx = rx + dx, ny = ry + dy; if (nx < 0 || ny < 0 || nx >= v.S || ny >= v.S) return false;
  const t = roomTiles(rx, ry); if (!t) return true;
  for (let i = 1; i < 49; i++) { const x = dx ? (dx > 0 ? 49 : 0) : i, y = dy ? (dy > 0 ? 49 : 0) : i; if (+t[y * ROOM + x] !== T_WALL) return true; }
  return false;
}
function updateRoomNav(v) {
  const [rx, ry] = renderer.curRoom(), o = v && v.owned && v.owned[rx + ',' + ry];
  const lbl = renderer.lod === 'mini' ? `世界 ${v ? v.S + '×' + v.S : ''}` : roomNameXY(rx, ry) + (o ? ' · ' + (o === myPid ? '我的' : (v.players[o]?.name || '')) : '');
  if ($('rbName').textContent !== lbl) $('rbName').textContent = lbl;
}
function gotoRoom(rx, ry) { needRoom(rx, ry); renderer.fitRoom(rx, ry); updateRoomNav(view()); }
const _asked = new Set();
function needRoom(rx, ry) { const k = rx + ',' + ry; if (mode === 'client') { if (!_asked.has(k)) { _asked.add(k); client.gen(rx, ry); } } else if (engine && !engine.w.rooms[k]) { ensureRoom(engine.w, rx, ry); _snap = null; renderer.setView(engine.w, 1); } }
renderer.onNeedRoom = needRoom;
renderer.onLod = () => updateRoomNav(view());
$('rbMap').onclick = () => { const v = view(); if (v) renderer.fitWorld(v.S); };
$('rbHome').onclick = () => { const v = view(), sp = v && v.spawns.find(s => s.owner === myPid); if (sp) gotoRoom(Math.floor(sp.x / ROOM), Math.floor(sp.y / ROOM)); else toastMsg('还没有房间'); };
$('rbSpawn').onclick = () => { wm.auto = false; openWorldMap(true); };

// 世界地图：双指缩放 / 拖动；点房间选择，「前往」进入
(function mapGestures() {
  const c = $('wmCanvas'), pts = new Map(); let d0 = 0, z0 = 1, moved = 0;
  wm.z = 1; wm.px = 0; wm.py = 0;
  c.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = wm.z; } });
  c.addEventListener('pointermove', e => { const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { wm.px += e.clientX - p[0]; wm.py += e.clientY - p[1]; moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; wm.z = Math.max(1, Math.min(5, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / d0)); moved = 99; }
    drawWorldMap(); });
  const up = e => { pts.delete(e.pointerId); }; c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => { wm.z = Math.max(1, Math.min(5, wm.z * (e.deltaY < 0 ? 1.15 : 0.87))); drawWorldMap(); e.preventDefault(); }, { passive: false });
  c.addEventListener('click', e => { if (moved > 10) e.stopImmediatePropagation(); }, true);
})();

// ===== 面板：房间信息 / 控制台 / 内存 / 图层 =====
let panelTab = 'room';
function openPanel(t) {
  panelTab = t; $('panel').classList.remove('hidden'); $('inspect').classList.add('hidden');
  for (const b of document.querySelectorAll('.pnTabs button')) b.classList.toggle('on', b.dataset.pt === t);
  $('pnConsole').classList.toggle('hidden', t !== 'console'); $('pnBody').classList.toggle('hidden', t === 'console');
  renderPanel(true);
}
document.querySelectorAll('.pnTabs button').forEach(b => b.onclick = () => openPanel(b.dataset.pt));
$('pnClose').onclick = () => $('panel').classList.add('hidden');
const kvr = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
let infoRoom = null;
function showRoomInfo(rx, ry) { const v = view(); if (!v || rx < 0 || ry < 0 || rx >= v.S || ry >= v.S) return; infoRoom = [rx, ry]; openPanel('room'); }
// 官方风格房间信息：名称、所属（徽章）、RCL 与进度、能量源、矿物、安全模式、预定、creep/建筑数量、出口
function roomInfoHTML() {
  const v = view(); if (!v) return '<p>无数据</p>'; const [rx, ry] = infoRoom || renderer.curRoom(), k = rx + ',' + ry, inR = o => roomKey(o.x, o.y) === k;
  const t = roomType(rx, ry), o = v.owned && v.owned[k], ctrl = (v.controllers || []).find(inR), srcs = v.sources.filter(inR), mins = (v.minerals || []).filter(inR);
  const tiles = roomTiles(rx, ry), gen = !!tiles;
  const cr = v.creeps.filter(inR), my = cr.filter(c => c.owner === myPid).length, st = (v.structures || []).filter(inR), sites = v.sites.filter(inR), re = o === myPid ? roomEnergy(v, k) : null;
  const cnt = {}; for (const s of st) cnt[s.type] = (cnt[s.type] || 0) + 1; for (const s of v.spawns.filter(inR)) cnt.spawn = (cnt.spawn || 0) + 1;
  const TZ = { normal: '普通房间', highway: '高速公路', center: '扇区中心' };
  const ex = [['上', 0, -1], ['右', 1, 0], ['下', 0, 1], ['左', -1, 0]].filter(([, dx, dy]) => edgeOpen(rx, ry, dx, dy)).map(([n, dx, dy]) => `${n} ${roomNameXY(rx + dx, ry + dy)}`);
  const pc = o && v.players[o], badgeH = o === myPid && window.Shell ? Shell.badge(JSON.parse(localStorage.getItem('sbm_profile') || '{}').badge, 36) : `<span class="pdot" style="background:${pc ? '#' + (pc.color >>> 0).toString(16).padStart(6, '0') : '#444'}"></span>`;
  let h = `<div class="ri"><div class="riHead">${badgeH}<div><div class="riName">${roomNameXY(rx, ry)}</div><div class="riSub">${TZ[t]} · ${o ? esc(pc?.name || o) + (o === myPid ? '（我）' : '') : '无主'}</div></div></div>
    <div class="riBtns"><button class="primary" id="riZoom">放大进入房间</button><button id="riWorld">全图</button></div>`;
  if (!gen) h += `<p class="note">尚未探索：放大进入后生成地形。</p>`;
  if (ctrl) { const p = ctrl.level && ctrl.level < 8 ? ctrl.progress / (ctrl.progressTotal || 1) : ctrl.level ? 1 : 0;
    h += `<h4>Controller</h4>${kvr('等级', ctrl.level ? 'RCL ' + ctrl.level : '未占领')}${ctrl.level ? kvr('升级进度', `${ctrl.progress} / ${ctrl.progressTotal || '-'}`) + `<div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` + kvr('降级倒计时', ctrl.ticksToDowngrade ?? '-') : ''}
      ${kvr('安全模式', ctrl.safeMode ? '生效中（剩 ' + ctrl.safeMode + '）' : '未开启' + (ctrl.safeModeAvailable ? ' · 可用 ' + ctrl.safeModeAvailable : ''))}${kvr('预定', ctrl.reservation ? esc(v.players[ctrl.reservation.username || ctrl.reservation.owner]?.name || '其他玩家') + ' · ' + (ctrl.reservation.ticksToEnd ?? '') : '无')}`; }
  else if (gen) h += `<h4>Controller</h4>${kvr('Controller', '无（' + TZ[t] + '）')}`;
  if (re) h += `<h4>能量</h4>${kvr('energyAvailable', re[0])}${kvr('energyCapacityAvailable', re[1])}`;
  if (gen) h += `<h4>资源</h4>${kvr('能量源', srcs.length + ' 个' + (srcs.length ? '（' + srcs.map(s => s.energy + '/' + s.cap).join('，') + '）' : ''))}${kvr('矿物', mins.length ? mins.map(m => esc(m.type) + ' · ' + m.amount).join('，') : '无')}`;
  if (gen) h += `<h4>单位与建筑</h4>${kvr('creep', `${cr.length}（我的 ${my}，其他 ${cr.length - my}）`)}${kvr('工地', sites.length)}${Object.entries(cnt).map(([a, b]) => kvr(ST_ZH[a] || a, b)).join('') || kvr('建筑', '无')}`;
  h += `<h4>出口</h4>${kvr('相邻房间', ex.length ? ex.join(' · ') : '无')}`;
  h += `<h4>运行</h4>${kvr('Game.time', v.time)}${kvr('本机 tick 耗时', mode === 'client' ? '房主计算' : tickMs.toFixed(2) + ' ms')}${kvr('世界', v.S + '×' + v.S + ' 房间')}</div>`;
  return h;
}
document.addEventListener('click', e => { if (e.target.id === 'riZoom' && infoRoom) { gotoRoom(...infoRoom); $('panel').classList.add('hidden'); } if (e.target.id === 'riWorld') { const v = view(); v && renderer.fitWorld(v.S); } });
function memHTML(o, depth = 0) {
  if (o === null || typeof o !== 'object') return `<span class="mv">${esc(JSON.stringify(o))}</span>`;
  const ks = Object.keys(o); if (!ks.length) return `<span class="mv">${Array.isArray(o) ? '[]' : '{}'}</span>`;
  return ks.slice(0, 200).map(k => { const x = o[k]; return x && typeof x === 'object' && Object.keys(x).length
    ? `<details ${depth < 1 ? 'open' : ''}><summary>${esc(k)} <span style="color:#666">${Array.isArray(x) ? '[' + x.length + ']' : '{' + Object.keys(x).length + '}'}</span></summary>${memHTML(x, depth + 1)}</details>`
    : `<div class="ln"><span class="mk">${esc(k)}</span>: ${memHTML(x, depth + 1)}</div>`; }).join('');
}
function layersHTML() {
  const ov = renderer.ov || {}, row = (k, t) => `<label>${t}<input type="checkbox" data-ov="${k}" ${ov[k] ? 'checked' : ''}></label>`;
  return `<div class="lyr">${row('grid', '房间网格')}${row('names', '房间名称')}${row('owner', '领地着色（按玩家颜色）')}${row('fps', '显示 FPS / tick 耗时')}</div>`;
}
function renderPanel(force) {
  if ($('panel').classList.contains('hidden')) return;
  if (panelTab === 'room') $('pnBody').innerHTML = roomInfoHTML();
  else if (panelTab === 'memory' && force) $('pnBody').innerHTML = mode === 'client' ? '<p>内存在房主上，客户端暂不可查看。</p>' : `<div class="mem">${memHTML(engine.w.memory[myPid] || {})}</div>`;
  else if (panelTab === 'layers' && force) { $('pnBody').innerHTML = layersHTML(); $('pnBody').querySelectorAll('[data-ov]').forEach(i => i.onchange = () => {
    if (i.dataset.ov === 'fps') { $('mFps').click(); return; } renderer.setOverlay(i.dataset.ov, i.checked); localStorage.setItem('sbm_ov', JSON.stringify(renderer.ov)); }); $('pnBody').querySelector('[data-ov="fps"]').checked = showFps; }
  else if (panelTab === 'console') renderConsole();
}
renderer.onTick = () => { renderInspect(); if (panelTab === 'room') renderPanel(false); };
function renderConsole() {
  if ($('panel').classList.contains('hidden') || panelTab !== 'console') return; const q = $('cnFind').value.trim().toLowerCase();
  const L = LOGS.filter(l => (cnFilter === 'all' || (cnFilter === 'err' && l.cls === 'err') || (cnFilter === 'me' && l.cls !== 'sys')) && (!q || l.s.toLowerCase().includes(q))).slice(-300);
  const o = $('cnOut'), atEnd = o.scrollTop + o.clientHeight >= o.scrollHeight - 20;
  o.innerHTML = L.map(l => `<div class="${l.cls}">${l.t != null && !/^\[\d+\]/.test(l.s) ? `<span style="color:#666">[${l.t}]</span> ` : ''}${esc(l.s)}</div>`).join(''); if (atEnd) o.scrollTop = 1e9;
}
$('cnFind').oninput = renderConsole;
document.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { cnFilter = b.dataset.cf; document.querySelectorAll('[data-cf]').forEach(x => x.classList.toggle('on', x === b)); renderConsole(); });
// 控制台输入：在本机世界里以自己的身份执行一行 JS（Game / Memory / RoomPosition / PathFinder 与常量可用）
function runCmd() {
  const src = $('cnCmd').value.trim(); if (!src) return; log('> ' + src, 'cmd');
  if (mode === 'client') return log('客户端不能在房主世界执行命令', 'err');
  try { const A = buildApi(engine, myPid); const f = new Function(...Object.keys(A), `"use strict"; return (${src});`); let r = f(...Object.values(A));
    const seen = new WeakSet(); log(r && typeof r === 'object' ? (JSON.stringify(r, (k, v) => { if (k === 'room' && v && v.name) return '[room ' + v.name + ']'; if (v && typeof v === 'object') { if (seen.has(v)) return '[循环]'; seen.add(v); } return v; }, 1) || String(r)).slice(0, 4000) : String(r), 'res');
    _snap = null; } catch (e) { log(e.message, 'err'); }
  $('cnCmd').value = '';
}
$('cnRun').onclick = runCmd; $('cnCmd').addEventListener('keydown', e => { if (e.key === 'Enter') runCmd(); });
(() => { let ov = {}; try { ov = JSON.parse(localStorage.getItem('sbm_ov')) || {}; } catch (e) {} ov = Object.assign({ names: true }, ov); for (const k in ov) renderer.setOverlay(k, ov[k]); })();
