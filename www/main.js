const SAVE_C = 'sbm_code', $ = id => document.getElementById(id);
// 在线：房间由服务器上的官方引擎运行，手机只写代码、看世界、发手动操作
let sess = null, myPid = null, nick = '', ws = null, code = '', lastUploaded = '';
const upKey = () => 'sbm_last_up:' + srvLabel() + ':' + (myPid || '');
applyIcons();
const renderer = new Renderer($('stage'));
let showFps = false;
// 控制台：保留最近 500 条，可按文本 / 类型过滤（同官方 Console）
const LOGS = []; let cnFilter = 'all';
const _ntSeen = new Map();
const log = (s, cls) => { s = String(s); LOGS.push({ s, cls: cls || (/错误|error|失败/i.test(s) ? 'err' : ''), t: sess ? sess.time : null }); if (LOGS.length > 500) LOGS.splice(0, LOGS.length - 500); if (typeof renderConsole === 'function') renderConsole(); };
function myBadge() { try { const b = JSON.parse(localStorage.getItem('sbm_profile') || '{}').badge; return b && typeof b.type === 'number' ? b : null; } catch (e) { return null; } }
// ---- 服务器设置（只存在本机，不写死任何地址或密钥） ----
const SRV_K = 'sbm_server';
function srvCfg() { try { return JSON.parse(localStorage.getItem(SRV_K)) || null; } catch (e) { return null; } }
function srvSave(c) { localStorage.setItem(SRV_K, JSON.stringify(c)); }
function srvLabel(c) { c = c || srvCfg(); if (!c) return '未连接'; return c.kind === 'official' ? '官方服务器 · ' + (c.shard || 'shard0') : '私服 · ' + c.host; }
let connecting = null;
async function connectServer(cfg) {
  if (sess) { try { sess.stop(); } catch (e) {} sess = null; }
  renderer.reset(); LOGS.length = 0;
  const s = new OnlineSession(cfg, { storage: localStorage });
  s.onStatus = m => { netState = m; stats(); };
  s.onLog = (m, cls) => log(m, cls);
  s.onCpu = d => { cpuInfo = d; };
  s.onTick = v => { renderer.myPid = myPid; renderer.setView(v, 1000); };
  connecting = s; netState = '连接中…';
  try { await s.start(); } catch (e) { connecting = null; netState = '未连接'; try { s.stop(); } catch (e2) {} if (window.SBM_DEBUG) console.error(e); throw e; }
  connecting = null; sess = s; myPid = s.me._id; nick = s.me.username; renderer.myPid = myPid;
  srvSave(cfg); lastUploaded = localStorage.getItem(upKey()) || ''; log('[服务器] 已连接 ' + srvLabel(cfg) + '，玩家 ' + nick, 'sys');
  const home = s.home && s.kOf(s.home); if (home) { const [rx, ry] = home.split(',').map(Number); renderer.fitRoom(rx, ry); } else renderer.fitWorld(s.S);
  renderer.setView(s.view, 1);
  return s;
}
window.connectServer = connectServer;
function logout() { if (sess) { try { sess.stop(); } catch (e) {} } sess = null; myPid = null; renderer.reset(); const c = srvCfg(); if (c) { delete c.password; delete c.token; srvSave(c); } }
window.logout = logout;
let netState = '未连接', cpuInfo = null;

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
    move: { scrollbars: true, drag: true, wheel: true }, grid: { spacing: 24, length: 2, colour: '#ddd', snap: false },
    renderer: 'zelos', horizontalLayout: false, toolboxPosition: 'start', theme: edDark() ? DARK_THEME : LIGHT_THEME });
  $('editor').classList.toggle('dark', edDark());
  fly = ws.getFlyout();
  if (Blockly.Tooltip && Blockly.Tooltip.block) Blockly.Tooltip.block(); // 不弹提示框（积木上的中文就是说明）
  // 身份：抽屉里的按钮 + 改动后重新生成代码并保存
  ws.registerButtonCallback('sbmNewRole', () => { closeFlyout(); openRoleEdit(null, () => {}); });
  ws.registerButtonCallback('sbmRoles', () => { closeFlyout(); openRoleManager(); });
  window.sbmRolesChanged = () => { for (const b of ws.getAllBlocks(false)) if (b.onchange) try { b.onchange({}); } catch (e) {} regen(false); localStorage.setItem(SAVE_C, JSON.stringify(Blockly.serialization.workspaces.save(ws))); histTouch(); };
  // 全屏列表覆盖在工作区之上，不占工作区坐标：否则打开/收起列表时工作区原点平移一个屏宽，拖出的积木会跳到右侧、拖动时乱跳
  { const mm = ws.getMetricsManager(), of = mm.getFlyoutMetrics.bind(mm); mm.getFlyoutMetrics = function (own) { const m = of(own); return Object.assign({}, m, { width: 0, height: 0 }); }; }
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
  fly.hide(); buildCatBar();
  { const em = document.createElement('div'); em.id = 'edEmpty'; em.textContent = '点下方分类添加积木'; $('blocklyDiv').appendChild(em);
    const upd = () => em.classList.toggle('hidden', ws.getTopBlocks(false).length > 0); ws.addChangeListener(upd); upd(); }
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE_C)); } catch (e) {}
  try { sbmLoadWs(saved || DEFAULT_WS, ws); } catch (e) { console.warn('旧积木存档不兼容，已恢复默认', e); ws.clear(); sbmLoadWs(DEFAULT_WS, ws); }
  ws.addChangeListener(e => {
    if (e.type === Blockly.Events.BLOCK_DRAG) { // 从抽屉拖出后自动收起
      if (e.isStart && fly.isVisible()) closeFlyout(); // 长按拖出：列表收起，积木继续跟手
      if (!e.isStart) { const hot = overTrash(); $('edTrash').classList.remove('hot'); const b = ws.getBlockById(e.blockId); if (hot && b) setTimeout(() => b.dispose(true, true), 0); }
    }
    if (!e.isUiEvent) { regen(false); localStorage.setItem(SAVE_C, JSON.stringify(Blockly.serialization.workspaces.save(ws))); histTouch(); }
    undoUI();
  });
  // 点击 flyout 里的积木 = 添加到可见区域中心
  fly.getWorkspace().addChangeListener(e => { if (e.type === Blockly.Events.CLICK && e.blockId && fly.isVisible()) setTimeout(() => tapAdd(e.blockId), 0); });
  regen(false); ws.clearUndo(); histPush('启动时'); undoUI();
}
let fly = null, activeCat = null, dragFromFly = false, lastPt = [0, 0], flyScale = 0.7, lpArmed = false;
// 小号工具按钮（32px）：缩放 / 居中 / 垃圾桶（拖到上面删除，点一下删除选中积木）
document.addEventListener('pointermove', e => { lastPt = [e.clientX, e.clientY]; if (ws && ws.isDragging && ws.isDragging()) $('edTrash').classList.toggle('hot', overTrash()); }, true);
function overTrash() { const r = $('edTrash').getBoundingClientRect(); return lastPt[0] >= r.left - 8 && lastPt[0] <= r.right + 8 && lastPt[1] >= r.top - 8 && lastPt[1] <= r.bottom + 8; }
$('edZin').onclick = () => ws.zoomCenter(1); $('edZout').onclick = () => ws.zoomCenter(-1); $('edCenter').onclick = () => ws.scrollCenter();
$('edTrash').onclick = () => { const s = Blockly.getSelected && Blockly.getSelected(); if (!s || s.workspace !== ws || !s.isDeletable()) return; const n = s.getDescendants(false).length; if (n > 1 && !confirm(`删除这组积木（共 ${n} 个）？可以用撤销恢复。`)) return; s.dispose(true, true); };
// ===== 撤销 / 重做 / 历史版本（自动保存；最近 20 个快照，可恢复） =====
const HIST_K = 'sbm_code_hist', HIST_N = 20;
function histList() { try { return JSON.parse(localStorage.getItem(HIST_K)) || []; } catch (e) { return []; } }
function histPush(reason, force) {
  if (!ws) return; const st = JSON.stringify(Blockly.serialization.workspaces.save(ws)), L = histList();
  if (L.length && L[0].st === st) return; if (!force && L.length && Date.now() - L[0].ts < 60000 && L[0].reason === '自动保存') L.shift(); // 连续编辑合并为一条
  L.unshift({ ts: Date.now(), reason, n: ws.getAllBlocks(false).length, st }); while (L.length > HIST_N) L.pop();
  try { localStorage.setItem(HIST_K, JSON.stringify(L)); } catch (e) { L.pop(); try { localStorage.setItem(HIST_K, JSON.stringify(L)); } catch (e2) {} }
}
let _histT = null; function histTouch() { clearTimeout(_histT); _histT = setTimeout(() => histPush('自动保存'), 4000); }
window.histPush = histPush;
function undoUI() { if (!ws) return; $('edUndo').disabled = !ws.getUndoStack().length; $('edRedo').disabled = !ws.getRedoStack().length; }
$('edUndo').onclick = () => { ws.undo(false); undoUI(); }; $('edRedo').onclick = () => { ws.undo(true); undoUI(); };
$('edHist').onclick = () => histShow();
function histShow() {
  histPush('自动保存'); let p = $('histP'); if (!p) { p = document.createElement('div'); p.id = 'histP'; $('editor').appendChild(p); }
  const L = histList(), dt = t => { const d = new Date(t), z = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
  p.innerHTML = `<div class="hh"><button class="ghost" data-a="back" data-icon="arrow-left">返回</button><b>历史版本（最近 ${HIST_N} 个）</b></div><div class="hl">${L.length ? L.map((h, i) => `<div class="hi"><span class="ht">${dt(h.ts)}<span class="hs">${h.reason} · ${h.n} 个积木${i === 0 ? ' · 当前' : ''}</span></span>${i ? `<button data-a="restore" data-i="${i}" data-icon="restore">恢复</button>` : ''}</div>`).join('') : '<p style="color:#8a8f99">还没有历史版本。编辑积木后会自动保存。</p>'}</div>`;
  applyIcons(p); p.classList.remove('hidden');
  p.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'back') return p.classList.add('hidden');
    if (b.dataset.a === 'restore') { const h = histList()[+b.dataset.i]; if (!h || !confirm(`恢复到 ${dt(h.ts)} 的版本？当前版本会先存入历史。`)) return; histPush('恢复前', true);
      Blockly.Events.setGroup(true); ws.clear(); sbmLoadWs(JSON.parse(h.st), ws); Blockly.Events.setGroup(false); regen(true); histPush('已恢复', true); p.classList.add('hidden'); toastMsg && toastMsg('已恢复历史版本'); } };
}
const showAdv = false; // 分类栏只有一层（没有新手 / 高级之分）
function buildCatBar() {
  const bar = $('catBar');
  if (bar.children.length && bar.dataset.adv === String(showAdv)) { for (const b of bar.children) b.classList.toggle('on', b.dataset.cat === activeCat); return; }
  bar.innerHTML = ''; bar.dataset.adv = String(showAdv);
  const mk = (id, name, colour, fn, cls) => { const b = document.createElement('button'); b.className = 'cat' + (cls ? ' ' + cls : '') + (id === activeCat ? ' on' : ''); b.dataset.cat = id;
    b.textContent = name; if (colour) b.style.background = colour; let d0 = null; // 用 pointer 事件，避免 Blockly 拖拽后浏览器吞掉 click
    b.addEventListener('pointerdown', e => { d0 = [e.clientX, e.clientY]; });
    b.addEventListener('pointerup', e => { if (d0 && Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) < 10) fn(); d0 = null; });
    b.addEventListener('pointercancel', () => { d0 = null; }); bar.appendChild(b); };
  for (const c of CATS) mk(c.id, c.name, c.colour, () => selectCat(c.id));
}
// ===== 预览：白话说明 + 生成的代码（只读） =====
$('edPreview').onclick = () => previewShow();
function previewShow(tab) {
  let p = $('prevP'); if (!p) { p = document.createElement('div'); p.id = 'prevP'; $('editor').appendChild(p); }
  tab = tab || p.dataset.tab || 'say'; p.dataset.tab = tab;
  const lines = describeProgram(ws), src = Blockly.JavaScript.workspaceToCode(ws);
  p.innerHTML = `<div class="hh"><button class="pvBack" data-a="back" data-icon="arrow-left">返回</button><b>预览</b><span class="sp"></span><span class="seg"><button data-a="say" class="${tab === 'say' ? 'on' : ''}">说明</button><button data-a="code" class="${tab === 'code' ? 'on' : ''}">代码</button></span></div>
    ${tab === 'say' ? `<div class="pvSay">${lines.map(l => { const m = l.match(/^( *)(.*)$/); return `<div style="padding-left:${m[1].length * 9}px">${m[2].replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`; }).join('')}</div>`
      : (() => { const i = src.indexOf('// ===== 积木助手'), j = i < 0 ? -1 : src.indexOf('\n\n', i); const lib = i < 0 ? '' : src.slice(i, j < 0 ? undefined : j), main = i < 0 ? src : (src.slice(0, i) + (j < 0 ? '' : src.slice(j + 2))).trim();
          return `<div class="pvCode"><pre>${highlightJS(main || '// 还没有积木')}</pre>${lib ? `<details><summary>积木助手函数（自动生成）</summary><pre>${highlightJS(lib)}</pre></details>` : ''}</div>`; })()}`;
  applyIcons(p); p.classList.remove('hidden');
  p.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'back') return p.classList.add('hidden'); if (b.dataset.a === 'say' || b.dataset.a === 'code') previewShow(b.dataset.a); };
}
window.previewShow = previewShow;
function closeFlyout(fromPop) { if (!fly) return; const was = fly.isVisible(); fly.hide(); activeCat = null; buildCatBar(); $('edTabs').classList.remove('flyOpen'); Blockly.svgResize(ws); }
function selectCat(id) {
  const c = CATS.find(x => x.id === id); if (!c || !ws) return;
  if (activeCat === id && fly.isVisible()) return closeFlyout(); // 再点一次当前分类 = 收起
  activeCat = id; buildCatBar();
  $('edTabs').classList.add('flyOpen'); $('flyTitle').textContent = c.name; Blockly.svgResize(ws);
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
  try { new Function('module', 'exports', 'require', code); } catch (e) { log('[错误] 代码有语法错误：' + e.message); return; }
  if (push) applyCode();
}
// 上传：积木生成的 main 模块 → 服务器当前生效的分支（POST /api/user/code）。内容没变不重复上传（官方限额 240 次/天）
let upBusy = false;
async function applyCode(force) {
  if (!sess) { toastMsg('还没连接服务器'); return false; }
  if (!force && code === lastUploaded) { toastMsg('代码没有变化'); return true; }
  if (upBusy) return false; upBusy = true; $('btnRun').classList.add('busy');
  try { const br = await sess.uploadCode(code); lastUploaded = code; try { localStorage.setItem(upKey(), code); } catch (e) {}
    const left = sess.api.rateLeft('POST /api/user/code'); log(`[代码] 已上传到服务器（分支 ${br}）${left !== Infinity ? '，今天还能上传 ' + left + ' 次' : ''}`, 'sys'); toastMsg('代码已上传，下个 tick 生效'); return true; }
  catch (e) { log('[错误] 上传失败：' + e.message, 'err'); toastMsg('上传失败：' + e.message); return false; }
  finally { upBusy = false; $('btnRun').classList.remove('busy'); }
}
function view() { return sess ? sess.view : null; }
const chip = (ic, html) => `<span class="chip${ic === 'bolt' ? ' en' : ''}"><span class="ic">${icon(ic)}</span>${html}</span>`;
const chipX = (ic, html) => chip(ic, html).replace('class="chip', 'class="chip xl');
function stats() {
  const v = view(); let H;
  if (!v) H = chip(connecting ? 'loader-2' : 'plug-connected-x', esc(connecting ? netState : '未连接'));
  else { const re = roomEnergy(v), n = v.creeps.filter(c => c.owner === myPid).length, live = netState === '已连接';
    H = chip(live ? 'cloud' : 'cloud-off', live ? (sess.official ? '官方' : '私服') : esc(netState)) + chip('refresh', `<b>${v.time}</b>`) + chip('bolt', `<b>${re ? re[0] + '/' + re[1] : '-'}</b>`) + chip('bug', `<b>${n}</b>`); }
  const need = !!(v && v.players[myPid]?.needsSpawn); $('rbSpawn').classList.toggle('hidden', !need || build.type === 'spawn1');
  if (need && !wm.auto && $('start').classList.contains('hidden') && $('wmap').classList.contains('hidden') && !build.on) openWorldMap(true);
  updateRoomNav(v);
  if (H !== stats._h) $('hud').innerHTML = stats._h = H;
}
let hudT = 0, watchT = 0;
// 只订阅屏幕上看得到的房间（官方客户端也只看当前房间的实时对象）
function watchRooms() {
  if (!sess) return; const RS = ROOM * TS, s = renderer.scale; if (renderer.lod === 'mini') return sess.watch([]);
  const x0 = renderer.cx - innerWidth / 2 / s, x1 = renderer.cx + innerWidth / 2 / s, y0 = renderer.cy - innerHeight / 2 / s, y1 = renderer.cy + innerHeight / 2 / s, [cx, cy] = renderer.curRoom(), L = [cx + ',' + cy];
  for (let ry = Math.floor(y0 / RS); ry <= Math.floor(y1 / RS); ry++) for (let rx = Math.floor(x0 / RS); rx <= Math.floor(x1 / RS); rx++) { const k = rx + ',' + ry; if (!L.includes(k)) L.push(k); }
  sess.watch(L);
}
function loop(t) {
  if (t - hudT > 250) { hudT = t; stats(); } if (t - watchT > 600) { watchT = t; watchRooms(); } requestAnimationFrame(loop);
}
function setLabel(btn, ic, text) { const b = $(btn); b.querySelector('.ic').innerHTML = icon(ic); b.querySelector('.lb').textContent = text; }
function setRunUI() { setLabel('btnRun', 'cloud-upload', '上传'); }
$('btnRun').onclick = () => { regen(false); applyCode(); };
// 左侧工具栏收起/展开
(function barToggle() { const t = document.createElement('button'); t.id = 'barTog'; const set = m => { document.body.classList.toggle('barMin', m); t.textContent = m ? '›' : '‹'; localStorage.setItem('sbm_barMin', m ? '1' : ''); }; t.onclick = () => set(!document.body.classList.contains('barMin')); document.body.appendChild(t); set(!!localStorage.getItem('sbm_barMin')); })();
$('btnLog').onclick = () => $('panel').classList.contains('hidden') ? (infoRoom = null, openPanel(panelTab)) : $('panel').classList.add('hidden');
$('btnCode').onclick = () => { $('editor').classList.remove('hidden'); renderer.pause(true); Blockly.svgResize(ws); };
$('edClose').onclick = () => { $('editor').classList.add('hidden'); renderer.pause(false); regen(true); };
$('btnMenu').onclick = () => $('menu').classList.remove('hidden');
$('mClose').onclick = () => $('menu').classList.add('hidden');
$('mResetCode').onclick = () => { if (confirm('恢复默认积木程序？当前程序会存入历史版本，可在编辑器里恢复。')) { histPush('恢复默认前', true); ws.clear(); sbmLoadWs(DEFAULT_WS, ws); regen(false); } };
$('mIntro').onclick = () => { $('menu').classList.add('hidden'); $('intro').classList.remove('hidden'); };
$('introOk').onclick = () => { $('intro').classList.add('hidden'); localStorage.setItem('sbm_intro', '1'); };
$('ver').textContent = '版本 ' + (window.APP_VERSION || 'dev');

// 检查器：点选对象，按 tick 刷新
let sel = null;
const PARTC = { work: '#ffe56d', carry: '#777', move: '#a9b7c6' };
const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const KIND_LIST = v => ({ creep: v.creeps, spawn: v.spawns, structure: v.structures, controller: v.controllers || [], source: v.sources, mineral: v.minerals || [], site: v.sites, resource: v.resources || [], tombstone: v.tombstones || [], ruin: v.ruins || [], flag: v.flags || [] });
const findIn = (v, o) => { if (!v || !o) return null; const L = KIND_LIST(v)[o.kind]; return L ? L.find(x => x.id === o.id) : null; };
// 官方客户端的点格子：房间视图下点格子显示坐标、地形和格子上的所有对象；同一格再点一次切到下一个对象，最后回到地形
let tileSel = null; // { x, y, idx }，idx 等于对象数时显示地形
const TERR_ZH = ['平原', '墙', '沼泽'];
function tileObjs(v, x, y) { const out = []; for (const [k, L] of Object.entries(KIND_LIST(v))) for (const o of L || []) if (o.x === x && o.y === y) out.push({ kind: k, id: o.id }); return out; }
function terrainAt(x, y) { const t = roomTiles(Math.floor(x / ROOM), Math.floor(y / ROOM)); if (!t) return null; const c = Number(t[(y % ROOM) * ROOM + (x % ROOM)]); return TERR_ZH[c] || '平原'; }
const STRUCT_EN = { spawn: 'StructureSpawn', extension: 'StructureExtension', road: 'StructureRoad', constructedWall: 'StructureWall', rampart: 'StructureRampart', link: 'StructureLink', storage: 'StructureStorage', tower: 'StructureTower', observer: 'StructureObserver', powerSpawn: 'StructurePowerSpawn', extractor: 'StructureExtractor', lab: 'StructureLab', terminal: 'StructureTerminal', container: 'StructureContainer', nuker: 'StructureNuker', factory: 'StructureFactory', keeperLair: 'StructureKeeperLair', invaderCore: 'StructureInvaderCore', powerBank: 'StructurePowerBank', portal: 'StructurePortal' };
const objLabel = (v, s) => { const o = findIn(v, s); if (!o) return '-'; return ({ creep: () => 'Creep', spawn: () => 'Spawn', structure: () => ST_ZH[o.type] || o.type, controller: () => 'Controller', source: () => 'Source', mineral: () => 'Mineral', site: () => '工地', resource: () => '资源', tombstone: () => '墓碑', ruin: () => '废墟', flag: () => 'Flag' })[s.kind](); };
const storeKV = st => { const e = Object.entries(st || {}).filter(([, n]) => n > 0); return kv('store', e.length ? e.map(([r, n]) => `${esc(r)} ${n}`).join(' · ') : '空'); };
function hideInspect() { sel = null; tileSel = null; renderer.select(null, null); $('inspect').classList.add('hidden'); }
function renderInspect() {
  if (!tileSel) return; const v = view(); if (!v) return hideInspect();
  const { x, y } = tileSel, list = tileObjs(v, x, y); if (tileSel.idx > list.length) tileSel.idx = list.length;
  sel = tileSel.idx < list.length ? list[tileSel.idx] : null; const o = sel && findIn(v, sel);
  const pn = id => esc(v.players[id]?.name || id || '-'); const lx = ((x % 50) + 50) % 50, ly = ((y % 50) + 50) % 50;
  let t = '地形', b = '';
  const tabs = list.length ? `<div class="insTabs">${list.map((s, i) => `<button class="insTab${i === tileSel.idx ? ' on' : ''}" data-i="${i}">${esc(objLabel(v, s))}</button>`).join('')}<button class="insTab${tileSel.idx === list.length ? ' on' : ''}" data-i="${list.length}">地形</button></div>` : '';
  if (!o) { b += kv('地形', terrainAt(x, y) || '加载中'); }
  else if (sel.kind === 'creep') { t = 'Creep ' + esc(o.name);
    b += kv('所属', pn(o.owner)) + kv('hits', `${o.hits ?? o.body.length * 100} / ${o.hitsMax || o.body.length * 100}`) + storeKV(o.store) + kv('容量', o.cap ?? '-') + kv('fatigue', o.fatigue || 0) + kv('ticksToLive', o.ttl) + kv('身体', `<span class="body">${o.body.map(p => `<span class="part" style="background:${PARTC[p.type || p] || '#666'}"></span>`).join('')}</span>`);
    if (o.owner === myPid) b += `<button class="insMem" data-mem="${esc(o.name)}">查看 Memory</button><pre class="mem" id="insMem"></pre>`; }
  else if (sel.kind === 'spawn') { t = 'StructureSpawn ' + esc(o.name); b += kv('所属', pn(o.owner)) + kv('hits', `${o.hits ?? 5000} / ${o.hitsMax ?? 5000}`) + kv('能量', `${o.energy} / ${o.cap}`) + kv('生产', o.spawning ? `${esc(o.spawning.name)}（剩 ${o.spawning.left} tick）` : '空闲'); }
  else if (sel.kind === 'source') { t = 'Source'; b += kv('能量', `${o.energy} / ${o.cap}`) + kv('再生', '每 300 tick'); }
  else if (sel.kind === 'controller') { t = 'StructureController'; b += kv('所属', o.owner ? pn(o.owner) : '未占领') + kv('等级 RCL', o.level) + kv('进度', `${o.progress} / ${o.progressTotal}`) + kv('降级倒计时', o.ticksToDowngrade || '-'); }
  else if (sel.kind === 'structure') { t = STRUCT_EN[o.type] || ('Structure ' + esc(o.type)); b += (o.owner ? kv('所属', pn(o.owner)) : '') + (o.hitsMax ? kv('hits', `${o.hits} / ${o.hitsMax}`) : '') + (o.energyCapacity != null ? kv('能量', `${o.energy || 0} / ${o.energyCapacity}`) : ''); }
  else if (sel.kind === 'site') { t = 'ConstructionSite'; b += kv('类型', esc(ST_ZH[o.type] || o.type)) + kv('所属', pn(o.owner)) + kv('进度', `${o.progress} / ${o.total}`); }
  else if (sel.kind === 'mineral') { t = 'Mineral ' + esc(o.type); b += kv('mineralType', esc(o.type)) + kv('mineralAmount', o.amount); }
  else if (sel.kind === 'resource') { t = 'Resource'; b += kv('resourceType', esc(o.resourceType)) + kv('amount', o.amount); }
  else if (sel.kind === 'tombstone') { t = 'Tombstone ' + esc(o.creepName || ''); b += kv('所属', pn(o.owner)) + storeKV(o.store || { energy: o.energy }) + kv('ticksToDecay', o.decay); }
  else if (sel.kind === 'ruin') { t = 'Ruin'; b += kv('structureType', esc(o.structureType)) + (o.owner ? kv('所属', pn(o.owner)) : '') + storeKV(o.store) + kv('destroyTime', o.destroyTime) + kv('ticksToDecay', o.decay); }
  else if (sel.kind === 'flag') { t = 'Flag ' + esc(o.name); b += kv('color', ART.FLAG_ZH ? ART.FLAG_ZH[o.color] || o.color : o.color) + kv('secondaryColor', ART.FLAG_ZH ? ART.FLAG_ZH[o.secondaryColor] || o.secondaryColor : o.secondaryColor); }
  const act = insAction(o, sel); if (act) b += `<div class="insAct"><button class="insDanger" data-act="${act[0]}">${act[1]}</button></div>`;
  $('insTitle').innerHTML = t; $('insBody').innerHTML = `<div class="insPos">x ${lx}, y ${ly} · ${roomName(x, y)}</div>` + tabs + b; $('inspect').classList.remove('hidden');
  renderer.select(sel, { x, y });
}
// 官方客户端：自己的 creep 可自杀、自己的建筑可摧毁、自己的工地可取消；先确认，再调用官方 API（规则由 API 判定）
function insAction(o, s) { if (!o || !s || !sess || o.owner !== myPid) return null;
  return { creep: ['suicide', '自杀'], spawn: ['destroy', '摧毁'], structure: ['destroy', '摧毁'], site: ['remove', '取消工地'], flag: ['flag', '移除旗帜'] }[s.kind] || null; }
// 官方客户端：自杀 / 摧毁 / 取消工地都是发给服务器的手动指令，下个 tick 由官方引擎按规则执行（例如房间里有敌对 creep 时不能摧毁）
function doInsAction(m) {
  const s = sel; if (!s || !sess) return; const o = findIn(view(), s); if (!o) return;
  const Q = { suicide: ['让这个 creep 自杀？', '自杀'], destroy: ['摧毁这个建筑？', '摧毁'], remove: ['取消这个工地？', '取消工地'], flag: ['移除这面旗帜？', '移除'] }[m];
  Shell.dialog(Q[0], '', () => { (m === 'flag' ? sess.removeFlag(o) : sess.act(m, o)).then(() => toastMsg({ suicide: '已发送自杀指令', destroy: '已发送摧毁指令', remove: '已发送取消指令', flag: '已移除旗帜' }[m] + '，下个 tick 生效'))
    .catch(e => toastMsg('无法执行：' + e.message)); }, Q[1]);
}
$('insBody').addEventListener('click', e => { const ab = e.target.closest('.insDanger'); if (ab) return doInsAction(ab.dataset.act);
  const mb = e.target.closest('.insMem'); if (mb && sess) { const out = $('insMem'); out.textContent = '读取中…'; sess.api.memory('creeps.' + mb.dataset.mem).then(r => decodeMem(r.data)).then(d => { out.textContent = 'Memory ' + JSON.stringify(d ?? {}, null, 1); }).catch(er => { out.textContent = er.message; }); return; } const bt = e.target.closest('.insTab'); if (!bt || !tileSel) return; tileSel.idx = +bt.dataset.i; renderInspect(); });
function tapTile(x, y) {
  const v = view(); if (!v) return;
  if (tileSel && tileSel.x === x && tileSel.y === y && !$('inspect').classList.contains('hidden')) tileSel.idx = (tileSel.idx + 1) % (tileObjs(v, x, y).length + 1);
  else tileSel = { x, y, idx: 0 };
  renderInspect();
}
renderer.onTap = (x, y) => {
  if (renderer.lod === 'mini') { hideInspect(); return showRoomInfo(Math.floor(x / ROOM), Math.floor(y / ROOM)); }
  if (build.on) return build.type === 'spawn1' ? spawnTap(x, y) : buildTap(x, y);
  tapTile(x, y);
};
$('insClose').onclick = () => hideInspect();
renderer.onTick = () => { if (tileSel && !$('inspect').classList.contains('hidden')) renderInspect(); else if (tileSel) { tileSel = null; sel = null; renderer.select(null, null); } };
// 状态栏：不覆盖网页
(function boot() { const host = $('editor'); host.classList.remove('hidden'); host.style.visibility = 'hidden'; initBlockly(); host.classList.add('hidden'); host.style.visibility = ''; setRunUI(); })();
requestAnimationFrame(loop);
// 服务器内存：可能是 "gz:" + base64(gzip)
async function decodeMem(d) {
  if (typeof d !== 'string') return d; if (!d.startsWith('gz:')) { try { return JSON.parse(d); } catch (e) { return d; } }
  const bin = Uint8Array.from(atob(d.slice(3)), c => c.charCodeAt(0)); const st = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  const t = await new Response(st).text(); try { return JSON.parse(t); } catch (e) { return t; }
}
// 自动检查更新：启动 20 秒后检查一次，之后游戏运行期间每 30 分钟检查；发现新版本直接弹窗
setTimeout(() => checkUpdate(false), 20000); setInterval(() => checkUpdate(false), 30 * 60 * 1000);

// ===== 手动建造（同官方客户端）：选建筑 → 点格子预览 → 放置；点自己的工地可移除 =====
const ST_ZH = { spawn: 'Spawn', extension: '扩展', road: '道路', constructedWall: '墙', rampart: '城墙', link: '链路', storage: '仓库', tower: '防御塔', observer: '观察者', powerSpawn: '能量中心', extractor: '采矿机', lab: '实验室', terminal: '终端', container: '容器', nuker: '核弹', factory: '工厂' };
const ERR_ZH = { '-1': '不是你的房间', '-3': '名字已存在', '-7': '位置无效', '-8': '工地数量已达上限', '-10': '参数无效', '-14': 'RCL 不足或房间不归你', '-15': 'GCL 不足' };
const build = { on: false, type: null, at: null };
function toastMsg(m) { let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('on'); clearTimeout(toastMsg._t); toastMsg._t = setTimeout(() => t.classList.remove('on'), 1800); }
// 当前房间（若是我的）或我的第一个房间：RCL 与已有建筑数（只按服务器发来的对象计算，最终由服务器判定）
function myRoomCtx() { const v = view(); if (!v) return null; const [rx, ry] = renderer.curRoom(); let k = rx + ',' + ry;
  const mineC = c => c.owner === myPid; let c = (v.controllers || []).find(c => roomKey(c.x, c.y) === k && mineC(c)); if (!c) { c = (v.controllers || []).find(mineC); if (c) k = roomKey(c.x, c.y); }
  return { k, lvl: c ? c.level : 0 }; }
function countStruct(v, t, k) { const inR = o => roomKey(o.x, o.y) === k && o.owner === myPid; return (t === 'spawn' ? v.spawns.filter(inR).length : v.structures.filter(s => s.type === t && inR(s)).length) + v.sites.filter(s => s.type === t && inR(s)).length; }
function openBuildPicker() {
  const v = view(); if (!v) return toastMsg('还没连接服务器'); const r = myRoomCtx(); $('bpTitle').textContent = r && r.lvl ? `建造 · RCL ${r.lvl}` : '建造';
  let h = '';
  for (const t of Object.keys(ST_ZH)) { if (!SC.CONTROLLER_STRUCTURES[t]) continue; const lim = r ? SC.CONTROLLER_STRUCTURES[t][r.lvl] || 0 : 0; if (!lim) continue;
    const used = r ? countStruct(v, t, r.k) : 0;
    const ic = typeof ART !== 'undefined' ? ART.icon(t, { cap: t === 'extension' ? SC.EXTENSION_ENERGY_CAPACITY[r ? r.lvl : 1] || 50 : 50 }) : '';
    h += `<button data-t="${t}" ${used >= lim ? 'disabled' : ''}>${ic ? `<img class="bi" src="${ic}" alt="">` : '<span class="bi"></span>'}<span class="bt"><span class="n">${ST_ZH[t]}</span><span class="d">${used}/${lim > 1000 ? '∞' : lim} · ${SC.CONSTRUCTION_COST[t]} 能量</span></span></button>`; }
  $('bpList').innerHTML = h || '<p class="note">这个房间不是你的，或还没有 Controller 等级，不能建造</p>'; $('bpList').querySelectorAll('button').forEach(b => b.onclick = () => startBuild(b.dataset.t));
  $('buildPick').classList.remove('hidden'); $('inspect').classList.add('hidden'); $('flagPick').classList.add('hidden');
}
function startBuild(t) { build.on = true; build.type = t; build.at = null; $('buildPick').classList.add('hidden'); $('buildBar').classList.remove('hidden'); $('bbOk').disabled = true; $('bbOk').textContent = '放置'; $('bbMsg').textContent = `点地图选择${t === 'flag' ? '旗帜' : ST_ZH[t]}的位置`; $('btnBuild').classList.toggle('on', t !== 'flag'); $('btnFlag').classList.toggle('on', t === 'flag'); }
function endBuild() { build.on = false; build.at = null; renderer.preview = null; renderer.drawSel(); $('buildBar').classList.add('hidden'); $('btnBuild').classList.remove('on'); $('btnFlag').classList.remove('on'); }
function tileAt(x, y) { const t = roomTiles(Math.floor(x / ROOM), Math.floor(y / ROOM)); return t ? +t[(y % ROOM) * ROOM + (x % ROOM)] : null; }
function buildTap(x, y) {
  const v = view(); if (!v) return; const site = v.sites.find(s => s.x === x && s.y === y && s.owner === myPid);
  if (site && build.type !== 'flag') { build.at = { x, y, remove: site.id, site }; renderer.preview = { x, y, ok: false }; $('bbMsg').textContent = `移除${ST_ZH[site.type] || site.type}工地？`; $('bbOk').textContent = '移除'; $('bbOk').disabled = false; renderer.drawSel(); return; }
  if (build.at && build.at.x === x && build.at.y === y && !build.at.remove) return confirmBuild();
  const ok = tileAt(x, y) !== T_WALL || build.type === 'road' || build.type === 'flag';
  build.at = { x, y }; renderer.preview = { x, y, ok }; renderer.drawSel();
  $('bbOk').textContent = '放置'; $('bbOk').disabled = false; $('bbMsg').textContent = `${build.type === 'flag' ? '旗帜 ' + flagSt.name : ST_ZH[build.type]} · x ${x % ROOM}, y ${y % ROOM}`;
}
async function confirmBuild() {
  const a = build.at; if (!a || !sess) return; $('bbOk').disabled = true;
  try {
    if (a.remove) { await sess.act('remove', a.site); toastMsg('已发送移除工地指令'); }
    else if (build.type === 'flag') { await sess.flag(a.x, a.y, flagSt.name, flagSt.c1, flagSt.c2); toastMsg('已放置旗帜 ' + flagSt.name); flagSt.name = nextFlagName(flagSt.name); }
    else { await sess.build(a.x, a.y, build.type); toastMsg(`已放置${ST_ZH[build.type]}工地`); }
    renderer.preview = null; $('bbMsg').textContent = '继续点地图放置，或退出';
  } catch (e) { toastMsg('无法放置：' + e.message); renderer.preview = { x: a.x, y: a.y, ok: false }; }
  build.at = null; $('bbOk').textContent = '放置'; renderer.drawSel();
}
// ===== 旗帜（同官方客户端：独立工具，名字 + 主/副颜色，点地图放置） =====
const flagSt = { name: 'Flag1', c1: 10, c2: 10 };
function nextFlagName(used) { const v = view(), have = new Set(((v && v.flags) || []).map(f => f.name)); if (used) have.add(used); let i = 1; while (have.has('Flag' + i)) i++; return 'Flag' + i; }
function drawFlagPick() {
  const sw = (k) => ART.FLAG.slice(1).map((c, i) => `<button class="fsw${flagSt[k] === i + 1 ? ' on' : ''}" data-k="${k}" data-c="${i + 1}" style="background:${c}" aria-label="${ART.FLAG_ZH[i + 1]}"></button>`).join('');
  $('fpPrev').src = ART.icon('flag', { color: flagSt.c1, secondaryColor: flagSt.c2 }, 48) || '';
  $('fpC1').innerHTML = sw('c1'); $('fpC2').innerHTML = sw('c2');
  $('flagPick').querySelectorAll('.fsw').forEach(b => b.onclick = () => { flagSt[b.dataset.k] = +b.dataset.c; if (b.dataset.k === 'c1' && !flagSt._c2set) flagSt.c2 = +b.dataset.c; if (b.dataset.k === 'c2') flagSt._c2set = 1; drawFlagPick(); });
}
function openFlagPick() {
  if (!sess) return toastMsg('还没连接服务器'); flagSt.name = nextFlagName(); $('fpName').value = flagSt.name; drawFlagPick();
  $('flagPick').classList.remove('hidden'); $('buildPick').classList.add('hidden'); $('inspect').classList.add('hidden');
}
$('fpName').oninput = () => { flagSt.name = $('fpName').value.trim().slice(0, 100); };
$('fpOk').onclick = () => { flagSt.name = ($('fpName').value.trim() || nextFlagName()).slice(0, 100); if ((view()?.flags || []).some(f => f.name === flagSt.name)) return toastMsg('名字已存在'); $('flagPick').classList.add('hidden'); startBuild('flag'); };
$('fpClose').onclick = () => $('flagPick').classList.add('hidden');
$('btnFlag').onclick = () => build.on && build.type === 'flag' ? endBuild() : ($('flagPick').classList.contains('hidden') ? (build.on && endBuild(), openFlagPick()) : $('flagPick').classList.add('hidden'));
$('btnBuild').onclick = () => build.on ? endBuild() : ($('buildPick').classList.contains('hidden') ? openBuildPicker() : $('buildPick').classList.add('hidden'));
$('bpClose').onclick = () => $('buildPick').classList.add('hidden');
$('bbOk').onclick = () => build.type === 'spawn1' ? confirmSpawn() : confirmBuild(); $('bbCancel').onclick = () => { const sp = build.type === 'spawn1'; endBuild(); if (sp) { wm.auto = false; openWorldMap(true); } };

// ===== 世界地图 / 选择出生点（同官方：先选空闲房间，再点格子放 Spawn1） =====
const wm = { sel: null, auto: false, pick: false };
const WM_COL = { free: '#3d4a3a', close: '#5a2b2b', mine: '#6dc1ff', owned: '#c46b6b', highway: '#1d1d1d', center: '#4a4325', keeper: '#4a2a2a' };
function wmData() { const v = view(); if (!v) return null; return { S: v.S, owned: v.owned || {}, players: v.players }; }
// 世界地图上每个房间都画出地形（官方：地形全世界可见），状态色半透明叠在上面
const _wmT = new Map();
function wmTerrain(rx, ry) {
  const e = renderer.roomSp && renderer.roomSp.get(rx + ',' + ry); if (!e || !e.tiles) return null; const c0 = _wmT.get(rx + ',' + ry); if (c0 && c0.t === e.tiles) return c0.c;
  const c = document.createElement('canvas'); c.width = c.height = 50; const g = c.getContext('2d'), im = g.createImageData(50, 50);
  for (let i = 0; i < 2500; i++) { const t = +e.tiles[i], col = t === T_WALL ? [17, 17, 17] : t === T_SWAMP ? [41, 43, 30] : [43, 43, 43]; im.data.set([col[0], col[1], col[2], 255], i * 4); }
  g.putImageData(im, 0, 0); _wmT.set(rx + ',' + ry, { t: e.tiles, c }); return c;
}
const WM_MK = { source: '#ffe56d', mineral: '#ffffff', controller: '#c8c8c8', lair: '#e5484d', portal: '#6dd3ff' };
let _wmIdx = null, _wmIdxV = null;
function wmIdx(v) { if (_wmIdxV !== v.roomsVer + ':' + (v.sources || []).length + ':' + (v.structures || []).length) { _wmIdx = wmIndex(v); _wmIdxV = v.roomsVer + ':' + (v.sources || []).length + ':' + (v.structures || []).length; } return _wmIdx; }
function drawWorldMap() {
  const d = wmData(), v = view(), c = $('wmCanvas'); if (!d) return; const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = '#141414'; g.fillRect(0, 0, r.width, r.height);
  const cs = Math.floor(Math.min(r.width - 16, r.height - 16) / d.S * (wm.z || 1)), ox = (r.width - cs * d.S) / 2 + (wm.px || 0), oy = (r.height - cs * d.S) / 2 + (wm.py || 0); wm.geo = { cs, ox, oy, S: d.S };
  const idx = wmIdx(v), k = (cs - 2) / 50;
  for (let ry = 0; ry < d.S; ry++) for (let rx = 0; rx < d.S; rx++) {
    const st = roomStatus(d.S, d.owned, rx, ry, myPid), x = ox + rx * cs, y = oy + ry * cs, o = d.owned[rx + ',' + ry];
    if (x > r.width || y > r.height || x + cs < 0 || y + cs < 0) continue;
    const tc = wmTerrain(rx, ry); if (tc) { g.imageSmoothingEnabled = cs < 50; g.drawImage(tc, x + 1, y + 1, cs - 2, cs - 2); } else { g.fillStyle = '#2b2b2b'; g.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
    // 资源标记（官方地图配色：能量源黄、矿物白、Controller 灰、Keeper 巢穴红、传送门青）
    const e = idx.get(rx + ',' + ry), dot = (p, col, rr) => { g.fillStyle = col; g.beginPath(); g.arc(x + 1 + (p.x + .5) * k, y + 1 + (p.y + .5) * k, rr, 0, 7); g.fill(); };
    if (e) { const rr = Math.max(1.5, k * 1.6);
      e.lairs.forEach(p => dot(p, WM_MK.lair, rr)); e.portals.forEach(p => dot(p, WM_MK.portal, rr));
      if (e.controller) { const cc = e.controller.owner && d.players[e.controller.owner] ? '#' + (d.players[e.controller.owner].color >>> 0).toString(16).padStart(6, '0') : WM_MK.controller; g.fillStyle = cc; const q = rr * 1.1; g.fillRect(x + 1 + (e.controller.x + .5) * k - q, y + 1 + (e.controller.y + .5) * k - q, q * 2, q * 2); }
      e.sources.forEach(p => dot(p, WM_MK.source, rr));
      e.minerals.forEach(p => { dot(p, WM_MK.mineral, rr); if (cs >= 70) { g.fillStyle = '#fff'; g.font = `bold ${Math.round(Math.min(12, cs / 8))}px sans-serif`; g.fillText(p.type, x + 1 + (p.x + 1.5) * k + rr, y + 1 + (p.y + .5) * k + 4); } });
    }
    // 只区分能否选择：不可选的房间压暗（扁平，无图例）；他人占领的房间叠一层玩家色
    if (wm.pick ? st !== 'free' : st === 'out') { g.fillStyle = 'rgba(10,10,10,.62)'; g.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
    if ((st === 'owned' || st === 'mine') && d.players[o]) { g.fillStyle = '#' + (d.players[o].color >>> 0).toString(16).padStart(6, '0'); g.globalAlpha = .28; g.fillRect(x + 1, y + 1, cs - 2, cs - 2); g.globalAlpha = 1; }
    if (wm.sel && wm.sel[0] === rx && wm.sel[1] === ry) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, cs - 4, cs - 4); g.lineWidth = 1; }
    const [cx, cy] = renderer.curRoom(); if (!wm.pick && cx === rx && cy === ry) { g.strokeStyle = '#5973ff'; g.setLineDash([4, 3]); g.strokeRect(x + 3, y + 3, cs - 6, cs - 6); g.setLineDash([]); }
  }
  $('wmInfo').textContent = '';
}
function wmShowSel() {
  const bar = document.querySelector('#wmap .wmBar'); if (!wm.sel) { bar.classList.add('hidden'); $('wmGo').disabled = true; return; }
  const [rx, ry] = wm.sel, d = wmData(), st = roomStatus(d.S, d.owned, rx, ry, myPid), ok = wmSelectable(st, wm.pick);
  $('wmSelName').textContent = roomNameXY(rx, ry); $('wmSelSt').textContent = wmStatusText(st, d.players[d.owned[rx + ',' + ry]]?.name); $('wmSelSt').className = ok ? 'ok' : 'no';
  $('wmSelInfo').textContent = wmRoomSummary(wmIdx(view()), rx, ry); $('wmGo').disabled = !ok; bar.classList.remove('hidden');
}
function openWorldMap(pick) {
  wm.pick = !!pick; wm.auto = true; wm.sel = null; $('wmTitle').textContent = pick ? '选择出生房间' : '世界地图'; $('wmClose').style.display = pick ? 'none' : '';
  $('wmGo').textContent = pick ? '进入房间' : '前往'; wmShowSel();
  wm.z = 1; wm.px = 0; wm.py = 0; wm.last = null; $('wmap').classList.remove('hidden'); requestAnimationFrame(drawWorldMap);
}
window.openWorldMap = openWorldMap;
$('wmClose').onclick = () => $('wmap').classList.add('hidden');
$('wmCanvas').addEventListener('click', e => {
  const G = wm.geo; if (!G) return; const r = $('wmCanvas').getBoundingClientRect(), rx = Math.floor((e.clientX - r.left - G.ox) / G.cs), ry = Math.floor((e.clientY - r.top - G.oy) / G.cs);
  if (rx < 0 || ry < 0 || rx >= G.S || ry >= G.S) { wm.sel = null; wmShowSel(); return drawWorldMap(); }
  wm.sel = [rx, ry]; wmShowSel(); if (!wm.pick && wm.last && wm.last[0] === rx && wm.last[1] === ry) return $('wmGo').click(); wm.last = [rx, ry]; drawWorldMap();
});
$('wmGo').onclick = () => {
  if (!wm.sel || $('wmGo').disabled) return; const [rx, ry] = wm.sel; $('wmap').classList.add('hidden');
  sess && sess.ensureTerrain(rx + ',' + ry).catch(e => toastMsg(e.message));
  renderer.fitRoom(rx, ry); watchRooms();
  if (!wm.pick) return;
  build.on = true; build.type = 'spawn1'; build.at = null; $('buildBar').classList.remove('hidden'); $('bbOk').disabled = true; $('bbOk').textContent = '放置 Spawn1'; $('bbCancel').textContent = '返回地图';
  $('bbMsg').textContent = `点 ${roomNameXY(rx, ry)} 里的空地放置 Spawn1`; wm.room = [rx, ry];
};
function localSpawnCheck(x, y) {
  if (Math.floor(x / ROOM) !== wm.room[0] || Math.floor(y / ROOM) !== wm.room[1]) return '请在所选房间内放置';
  const rm = sess && sess.rooms[wm.room.join(',')]; if (!rm) return '地形加载中…'; const lx = x % ROOM, ly = y % ROOM, T = (a, b) => rm.tiles[b * ROOM + a];
  if (lx < 1 || ly < 1 || lx > 48 || ly > 48) return '不能放在房间边缘'; if (T(lx, ly) === T_WALL) return '不能放在墙上';
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = lx + dx, Y = ly + dy; if ((X === 0 || Y === 0 || X === 49 || Y === 49) && T(X, Y) !== T_WALL) return '不能紧挨出口'; }
  return null;
}
function spawnTap(x, y) {
  const err = localSpawnCheck(x, y); build.at = { x, y }; renderer.preview = { x, y, ok: !err }; renderer.drawSel();
  $('bbMsg').textContent = err ? err : `Spawn1 · x ${x % ROOM}, y ${y % ROOM}`; $('bbOk').disabled = !!err;
}
function spawnDone() { endBuild(); $('bbCancel').textContent = '退出'; wm.auto = false; toastMsg('Spawn1 已放下，Controller 已占领（RCL 1）');
  if (code && code !== lastUploaded) applyCode(); }
async function confirmSpawn() {
  const a = build.at; if (!a || !sess) return; $('bbOk').disabled = true;
  try { await sess.placeSpawn(a.x, a.y, 'Spawn1'); spawnDone(); } catch (e) { toastMsg('无法放置：' + e.message); $('bbOk').disabled = false; }
}
window.doRespawn = async () => { if (!sess) return; endBuild(); wm.auto = false; try { await sess.respawn(); renderer.reset(); toastMsg('已重新出生，请选择新的出生点'); } catch (e) { toastMsg('重新出生失败：' + e.message); } };
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
function roomTiles(rx, ry) { return sess?.rooms?.[rx + ',' + ry]?.tiles; }
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
function needRoom(rx, ry) { if (sess) sess.ensureTerrain(rx + ',' + ry).catch(() => {}); }
renderer.onNeedRoom = needRoom;
renderer.onLod = () => { updateRoomNav(view()); const m = renderer.lod === 'mini'; setLabel('btnView', m ? 'home' : 'map', m ? '我的房间' : '全图'); };
// 右侧工具栏「全图 / 我的房间」切换（替代原右上角两个按钮）
$('btnView').onclick = () => { const v = view(); if (!v) return; if (renderer.lod === 'mini') goHome(); else renderer.fitWorld(v.S); };
function goHome() { const v = view(); const k = v && (Object.keys(v.owned || {}).find(k => v.owned[k] === myPid) || (sess && sess.home && sess.kOf(sess.home))); if (k) gotoRoom(...k.split(',').map(Number)); else toastMsg('还没有房间'); };
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
  if (!gen) h += `<p class="note">${sess && sess._statusMap && sess._statusMap[k] && sess._statusMap[k] !== 'normal' ? '这个房间不在服务器的世界里' : '地形加载中…'}</p>`;
  if (ctrl) { const p = ctrl.level && ctrl.level < 8 ? ctrl.progress / (ctrl.progressTotal || 1) : ctrl.level ? 1 : 0;
    h += `<h4>Controller</h4>${kvr('等级', ctrl.level ? 'RCL ' + ctrl.level : '未占领')}${ctrl.level ? kvr('升级进度', `${ctrl.progress} / ${ctrl.progressTotal || '-'}`) + `<div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` + kvr('降级倒计时', ctrl.ticksToDowngrade ?? '-') : ''}
      ${kvr('安全模式', ctrl.safeMode ? '生效中（剩 ' + ctrl.safeMode + '）' : '未开启' + (ctrl.safeModeAvailable ? ' · 可用 ' + ctrl.safeModeAvailable : ''))}${kvr('预定', ctrl.reservation ? esc(v.players[ctrl.reservation.username || ctrl.reservation.owner]?.name || '其他玩家') + ' · ' + (ctrl.reservation.ticksToEnd ?? '') : '无')}`; }
  else if (gen) h += `<h4>Controller</h4>${kvr('Controller', '无（' + TZ[t] + '）')}`;
  if (re) h += `<h4>能量</h4>${kvr('energyAvailable', re[0])}${kvr('energyCapacityAvailable', re[1])}`;
  if (gen) h += `<h4>资源</h4>${kvr('能量源', srcs.length + ' 个' + (srcs.length ? '（' + srcs.map(s => s.energy + '/' + s.cap).join('，') + '）' : ''))}${kvr('矿物', mins.length ? mins.map(m => esc(m.type) + ' · ' + m.amount).join('，') : '无')}`;
  if (gen) h += `<h4>单位与建筑</h4>${kvr('creep', `${cr.length}（我的 ${my}，其他 ${cr.length - my}）`)}${kvr('工地', sites.length)}${Object.entries(cnt).map(([a, b]) => kvr(ST_ZH[a] || a, b)).join('') || kvr('建筑', '无')}`;
  h += `<h4>出口</h4>${kvr('相邻房间', ex.length ? ex.join(' · ') : '无')}`;
  h += `<h4>运行</h4>${kvr('Game.time', v.time)}${kvr('服务器', esc(srvLabel()))}${kvr('世界', v.S + '×' + v.S + ' 房间')}</div>`;
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
  return `<div class="lyr">${row('grid', '房间网格')}${row('names', '房间名称')}${row('owner', '领地着色（我的绿 / 他人红）')}</div>`;
}
function renderPanel(force) {
  if ($('panel').classList.contains('hidden')) return;
  if (panelTab === 'room') $('pnBody').innerHTML = roomInfoHTML();
  else if (panelTab === 'memory' && force) { $('pnBody').innerHTML = '<p class="note">读取中…</p>'; if (!sess) $('pnBody').innerHTML = '<p>还没连接服务器</p>';
    else sess.api.memory('').then(r => decodeMem(r.data)).then(d => { if (panelTab === 'memory') $('pnBody').innerHTML = `<div class="mem">${memHTML(d || {})}</div>`; }).catch(e => { $('pnBody').innerHTML = `<p>${esc(e.message)}</p>`; }); }
  else if (panelTab === 'layers' && force) { $('pnBody').innerHTML = layersHTML(); $('pnBody').querySelectorAll('[data-ov]').forEach(i => i.onchange = () => {
    renderer.setOverlay(i.dataset.ov, i.checked); localStorage.setItem('sbm_ov', JSON.stringify(renderer.ov)); }); }
  else if (panelTab === 'console') renderConsole();
  else if (panelTab === 'global') $('pnBody').innerHTML = globalHTML();
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
// 控制台输入：发给服务器在你的账号下执行（POST /api/user/console），结果在下一个 tick 回到控制台
function runCmd() {
  const src = $('cnCmd').value.trim(); if (!src) return; log('> ' + src, 'cmd');
  if (!sess) return log('还没连接服务器', 'err');
  sess.runConsole(src).catch(e => log(e.message, 'err')); $('cnCmd').value = '';
}
$('cnRun').onclick = runCmd; $('cnCmd').addEventListener('keydown', e => { if (e.key === 'Enter') runCmd(); });
(() => { let ov = {}; try { ov = JSON.parse(localStorage.getItem('sbm_ov')) || {}; } catch (e) {} ov = Object.assign({ names: true }, ov); for (const k in ov) renderer.setOverlay(k, ov[k]); })();

// 全局信息：原 HUD 上的性能 / 世界数据集中到这里
function globalHTML() {
  const v = view(), me = sess && sess.me;
  const R = (k, x) => `<div class="gi"><span>${k}</span><b>${x}</b></div>`;
  return `<div class="glob">${R('服务器', esc(srvLabel()))}${R('连接', esc(netState))}${R('玩家', me ? esc(me.username) : '-')}${R('当前 tick', v ? v.time : '-')}${R('CPU 上个 tick', cpuInfo ? cpuInfo.cpu + ' ms' : '-')}${R('Memory 大小', cpuInfo ? (cpuInfo.memory / 1024).toFixed(1) + ' KB' : '-')}${me && me.cpu != null ? R('CPU 上限', me.cpu) : ''}${R('GCL 点数', me ? Math.floor(me.gcl || 0) : '-')}${R('渲染帧率', renderer.fps.toFixed(0) + ' FPS')}${R('显示范围', v ? v.S + '×' + v.S + ' 房间' : '-')}${R('版本', 'V' + (window.APP_VERSION || 'dev'))}</div>`;
}
setInterval(() => { if (!$('panel').classList.contains('hidden') && panelTab === 'global') $('pnBody').innerHTML = globalHTML(); }, 1000);

// ---- 安卓返回键（back-stack.js）：先关最上层，再回上一页；首页两次返回才退出 ----
(function initBack() {
  const vis = id => { const e = $(id); return !!e && !e.classList.contains('hidden'); };
  const inGame = () => !vis('start'), inEd = () => vis('editor');
  const L = (n, p, o, c) => BackStack.layer(n, p, o, c);
  L('update', 100, () => !!(Upd.el && !Upd.el.classList.contains('hidden')), () => Upd.el.querySelector('.uuLater').click());
  L('dialog', 95, () => !!document.querySelector('.shDlg'), () => Shell.closeDlg());
  L('bodyForm', 95, () => !!$('bodyForm'), () => $('bodyForm').remove());
  L('roleEdit', 97, () => !!$('roleEdit'), () => $('roleEdit').querySelector('[data-a="cancel"]').click());
  L('roleMgr', 96, () => !!$('roleMgr') && !$('roleEdit'), () => $('roleMgr').remove());
  L('dropdown', 90, () => (Blockly.DropDownDiv && Blockly.DropDownDiv.isVisible()) || (Blockly.WidgetDiv && Blockly.WidgetDiv.isVisible()),
    () => { Blockly.DropDownDiv && Blockly.DropDownDiv.hideWithoutAnimation(); Blockly.WidgetDiv && Blockly.WidgetDiv.hide(); });
  L('preview', 85, () => inEd() && vis('prevP'), () => $('prevP').classList.add('hidden'));
  L('history', 85, () => inEd() && vis('histP'), () => $('histP').classList.add('hidden'));
  L('flyout', 80, () => inEd() && !!(fly && fly.isVisible()), () => closeFlyout());
  L('editor', 70, inEd, () => $('edClose').click());
  L('intro', 65, () => vis('intro'), () => $('introOk').click());
  L('menu', 65, () => vis('menu'), () => $('mClose').click());
  L('wmap', 60, () => inGame() && vis('wmap'), () => $('wmClose').click());
  L('flagPick', 55, () => inGame() && vis('flagPick'), () => $('fpClose').click());
  L('buildPick', 55, () => inGame() && vis('buildPick'), () => $('bpClose').click());
  L('buildBar', 55, () => inGame() && vis('buildBar'), () => endBuild());
  L('inspect', 50, () => inGame() && vis('inspect'), () => $('insClose').click());
  L('panel', 50, () => inGame() && vis('panel'), () => $('pnClose').click());
  BackStack.init({
    isRoot: () => Shell.page() === 'home',
    toBack: () => { if (Shell.page()) Shell.hwBack(); else Shell.show('home'); }, // 子页面 → 上一页；游戏 → 首页
    toast: m => toastMsg(m),
    exit: () => { const A = window.Capacitor?.Plugins?.App; if (A && A.exitApp) A.exitApp(); else toastMsg('（网页版无法退出应用）'); },
  });
})();
