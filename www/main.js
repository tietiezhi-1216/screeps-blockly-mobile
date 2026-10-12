const SAVE_W = 'sbm_world2', SAVE_C = 'sbm_code', $ = id => document.getElementById(id);
const myPid = localStorage.getItem('sbm_pid') || ('p' + Math.random().toString(36).slice(2, 10)); localStorage.setItem('sbm_pid', myPid);
let nick = localStorage.getItem('sbm_nick') || ('玩家' + myPid.slice(1, 4)); $('nick').value = nick;
let mode = 'solo', engine = null, hostS = null, client = null, transport = null;
let running = false, speed = 1, ws = null, code = '';
applyIcons();
const renderer = new Renderer($('stage')); renderer.myPid = myPid;
let showFps = localStorage.getItem('sbm_fps') === '1';
const log = s => { const l = $('log'); l.textContent += s + '\n'; if (l.textContent.length > 20000) l.textContent = l.textContent.slice(-15000); l.scrollTop = 1e9; };

function loadEngine() {
  let w = null; try { w = JSON.parse(localStorage.getItem(SAVE_W)); } catch (e) {}
  if (!w || w.v !== 3) w = newWorld();
  engine = new Engine(w); engine.onLog = (pid, s) => { if (pid === myPid) log(s); };
  engine.addPlayer(myPid, nick); engine.setCode(myPid, code);
  renderer.reset(); renderer.setView(engine.w, 500 / speed);
}
function save() { if (engine && mode !== 'client') localStorage.setItem(SAVE_W, engine.saveData()); }

function initBlockly() {
  const first = CATS[0];
  const tb = { kind: 'flyoutToolbox', contents: first.custom ? [{ kind: 'category', custom: first.custom, name: first.name }] : first.blocks.map(t => ({ kind: 'block', type: t })) };
  ws = Blockly.inject('blocklyDiv', { toolbox: tb, trashcan: true, zoom: { controls: true, wheel: true, pinch: true, startScale: 0.85, minScale: 0.4, maxScale: 2.5 }, move: { scrollbars: true, drag: true, wheel: true }, grid: { spacing: 24, length: 2, colour: '#ddd', snap: true }, renderer: 'zelos', horizontalLayout: false, toolboxPosition: 'start' });
  buildCatBar(first.id);
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE_C)); } catch (e) {}
  Blockly.serialization.workspaces.load(saved || DEFAULT_WS, ws);
  ws.addChangeListener(e => { if (!e.isUiEvent) { regen(false); localStorage.setItem(SAVE_C, JSON.stringify(Blockly.serialization.workspaces.save(ws))); } });
  regen(false);
}
let catCollapsed = false, activeCat = null;
function buildCatBar(sel) {
  activeCat = sel || activeCat || CATS[0].id;
  const bar = $('catBar'); bar.innerHTML = '';
  const tog = document.createElement('button'); tog.id = 'catToggle'; tog.textContent = catCollapsed ? '分类 ▾' : '分类 ▴';
  tog.onclick = () => { catCollapsed = !catCollapsed; bar.classList.toggle('collapsed', catCollapsed); tog.textContent = catCollapsed ? '分类 ▾' : '分类 ▴'; Blockly.svgResize(ws); };
  // put toggle in edTabs if missing
  if (!$('catToggle')) { const tabs = $('edTabs'); const t = document.createElement('button'); t.id = 'catToggle'; t.textContent = '分类 ▴'; t.onclick = tog.onclick; tabs.insertBefore(t, tabs.children[2] || null); }
  else $('catToggle').onclick = tog.onclick;
  bar.classList.toggle('collapsed', catCollapsed);
  for (const c of CATS) {
    const b = document.createElement('button'); b.className = 'cat' + (c.id === activeCat ? ' on' : ''); b.textContent = c.name; b.style.background = c.colour;
    b.onclick = () => selectCat(c.id); bar.appendChild(b);
  }
}
function selectCat(id) {
  activeCat = id; const c = CATS.find(x => x.id === id); if (!c || !ws) return;
  catCollapsed = false; buildCatBar(id);
  let contents;
  if (c.custom === 'VARIABLE') contents = [{ kind: 'category', name: c.name, custom: 'VARIABLE' }];
  else if (c.custom === 'PROCEDURE') contents = [{ kind: 'category', name: c.name, custom: 'PROCEDURE' }];
  else contents = c.blocks.map(t => ({ kind: 'block', type: t }));
  // flyoutToolbox can't use category custom easily — inject blocks; for VARIABLE/PROCEDURE use continuous toolbox trick
  if (c.custom) {
    ws.updateToolbox({ kind: 'categoryToolbox', contents: [{ kind: 'category', name: c.name, custom: c.custom, colour: c.colour }] });
  } else {
    ws.updateToolbox({ kind: 'flyoutToolbox', contents });
  }
  Blockly.svgResize(ws);
}
function regen(push = true) {
  code = Blockly.JavaScript.workspaceToCode(ws); $('jsView').textContent = '// 每个 tick 执行一次（等价于 Screeps 的 module.exports.loop）\n' + code;
  try { compileUser(code); } catch (e) { log('[错误] 编译失败: ' + e.message); return; }
  if (push) applyCode();
}
function applyCode() { if (mode === 'client') client && client.sendCode(code); else engine && engine.setCode(myPid, code); }

function view() { return mode === 'client' ? client?.view : engine?.w; }
const chip = (ic, html) => `<span class="chip"><span class="ic">${icon(ic)}</span>${html}</span>`;
function stats() {
  const v = view(); let H;
  if (!v) H = chip('plug-connected', mode === 'client' ? '等待房主…' : '');
  else {
    const sp = v.spawns.find(s => s.owner === myPid), n = v.creeps.filter(c => c.owner === myPid).length, np = Object.keys(v.players).length;
    H = chip(mode === 'solo' ? 'device-gamepad-2' : mode === 'host' ? 'home' : 'wifi', mode === 'client' ? '客户端' : running ? '运行' : '暂停') + chip('refresh', `<b>${v.time}</b>`) + chip('bolt', `<b>${sp ? sp.energy + '/' + sp.cap : '-'}</b>`) + chip('bug', `<b>${n}</b>`) + chip('users', `${np}`) + chip('map', `${v.S}×${v.S}`);
  }
  if (showFps) H += chip('gauge', `${renderer.fps.toFixed(0)} fps · ${tickMs.toFixed(1)}ms`);
  if (H !== stats._h) $('hud').innerHTML = stats._h = H;
}
let tickMs = 0, hudT = 0;
let acc = 0, lastT = performance.now();
function loop(t) {
  const dt = t - lastT; lastT = t;
  if (mode !== 'client' && running && engine) {
    acc += dt; const step = 500 / speed; let n = 0;
    while (acc >= step && n < 4) { const t0 = performance.now(); engine.tick(); tickMs = tickMs * .9 + (performance.now() - t0) * .1; renderer.setView(engine.w, step); hostS && hostS.afterTick(step); acc -= step; n++; if (engine.w.time % 50 === 0) save(); }
    if (n === 4) acc = 0;
  }
  if (t - hudT > 250) { hudT = t; stats(); } requestAnimationFrame(loop);
}
function setLabel(btn, ic, text) { const b = $(btn); b.querySelector('.ic').innerHTML = icon(ic); b.querySelector('.lb').textContent = text; }
function setRunUI() { setLabel('btnRun', running && mode !== 'client' ? 'player-pause' : 'player-play', mode === 'client' ? '房主控制' : running ? '暂停' : '运行'); $('btnRun').classList.toggle('on', running && mode !== 'client'); $('btnRun').disabled = mode === 'client'; $('btnSpeed').disabled = mode === 'client'; }
$('btnRun').onclick = () => { running = !running; setRunUI(); if (!running) save(); };
$('btnSpeed').onclick = () => { speed = speed >= 8 ? 1 : speed * 2; setLabel('btnSpeed', 'player-track-next', speed + 'x'); };
$('btnLog').onclick = () => $('log').classList.toggle('hidden');
$('btnCode').onclick = () => { $('editor').classList.remove('hidden'); renderer.pause(true); Blockly.svgResize(ws); };
$('edClose').onclick = () => { $('editor').classList.add('hidden'); renderer.pause(false); regen(true); log('[代码] 已应用'); };
document.querySelectorAll('#edTabs [data-t]').forEach(b => b.onclick = () => { document.querySelectorAll('#edTabs [data-t]').forEach(x => x.classList.toggle('on', x === b)); const js = b.dataset.t === 'js'; $('jsView').classList.toggle('hidden', !js); $('blocklyDiv').classList.toggle('hidden', js); if (!js) Blockly.svgResize(ws); });
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
  client = new ClientSession('ws://' + addr, myPid, nick); client.code = code;
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
function renderInspect() {
  if (!sel) return; const v = view(), o = renderer.find(sel); if (!v || !o) { $('inspect').classList.add('hidden'); return; }
  const pn = id => esc(v.players[id]?.name || id || '-'); let t = '', b = kv('位置', `${o.x}, ${o.y} · ${roomName(o.x, o.y)}`);
  if (sel.kind === 'creep') { t = 'Creep ' + esc(o.name); const cap = o.body.filter(p => p === 'carry').length * 50;
    b += kv('所属', pn(o.owner)) + kv('身体', `<span class="body">${o.body.map(p => `<span class="part" style="background:${PARTC[p]}"></span>`).join('')}</span>`) + kv('hits', `${o.hits ?? o.body.length * 100} / ${o.body.length * 100}`) + kv('能量', `${o.energy} / ${cap}`) + kv('ticksToLive', o.ttl);
    if (mode !== 'client' && o.owner === myPid) b += `<pre class="mem">Memory ${esc(JSON.stringify(engine.w.memory[myPid].creeps[o.name] || {}, null, 1))}</pre>`; }
  else if (sel.kind === 'spawn') { t = 'StructureSpawn ' + esc(o.name); b += kv('所属', pn(o.owner)) + kv('hits', '5000 / 5000') + kv('能量', `${o.energy} / ${o.cap}`) + kv('生产', o.spawning ? `${esc(o.spawning.name)}（剩 ${o.spawning.left} tick）` : '空闲'); }
  else if (sel.kind === 'source') { t = 'Source'; b += kv('能量', `${o.energy} / ${o.cap}`) + kv('再生', '每 300 tick'); }
  else if (sel.kind === 'controller') { t = 'StructureController'; b += kv('所属', o.owner ? pn(o.owner) : '未占领') + kv('等级 RCL', o.level) + kv('进度', `${o.progress} / ${o.progressTotal}`) + kv('降级倒计时', o.ticksToDowngrade || '-'); }
  else if (sel.kind === 'structure') { t = 'Structure ' + esc(o.type); b += kv('所属', pn(o.owner)) + kv('hits', `${o.hits} / ${o.hitsMax}`) + (o.energyCapacity != null ? kv('能量', `${o.energy||0} / ${o.energyCapacity}`) : ''); }
  else if (sel.kind === 'site') { t = 'ConstructionSite'; b += kv('类型', o.type) + kv('所属', pn(o.owner)) + kv('进度', `${o.progress} / ${o.total}`); }
  $('insTitle').innerHTML = t; $('insBody').innerHTML = b; $('inspect').classList.remove('hidden');
}
renderer.onTap = (x, y) => {
  const v = view(); if (!v) return; const f = a => a.find(o => o.x === x && o.y === y);
  const c = f(v.creeps), sp = f(v.spawns), s = f(v.sources), st = f(v.sites);
  const ctrl = (v.controllers||[]).find(o => o.x === x && o.y === y), stt = (v.structures||[]).find(o => o.x === x && o.y === y);
  sel = c ? { kind: 'creep', id: c.id } : sp ? { kind: 'spawn', id: sp.id } : ctrl ? { kind: 'controller', id: ctrl.id } : stt ? { kind: 'structure', id: stt.id } : s ? { kind: 'source', id: s.id } : st ? { kind: 'site', id: st.id } : null;
  renderer.select(sel); if (sel) renderInspect(); else $('inspect').classList.add('hidden');
};
$('insClose').onclick = () => { sel = null; renderer.select(null); $('inspect').classList.add('hidden'); };
renderer.onTick = () => renderInspect();
// 状态栏：不覆盖网页
(function statusBar() { const C = window.Capacitor; if (!C?.isNativePlatform?.() || !C.registerPlugin) return; const S = C.registerPlugin('StatusBar'); S.setOverlaysWebView({ overlay: false }).catch(() => {}); S.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {}); S.setStyle({ style: 'DARK' }).catch(() => {}); })();
(function boot() { const host = $('editor'); host.classList.remove('hidden'); host.style.visibility = 'hidden'; initBlockly(); host.classList.add('hidden'); host.style.visibility = ''; loadEngine(); setRunUI(); })();
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
requestAnimationFrame(loop);
setTimeout(() => checkUpdate(false), 2000);
const qj = new URLSearchParams(location.search).get('join'); if (qj) join(qj);
if (new URLSearchParams(location.search).get('run')) { hideStart(); running = true; speed = 4; setRunUI(); }
if (qj) hideStart();
