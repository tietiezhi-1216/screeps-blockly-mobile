const SAVE_W = 'sbm_world2', SAVE_C = 'sbm_code', $ = id => document.getElementById(id);
const myPid = localStorage.getItem('sbm_pid') || ('p' + Math.random().toString(36).slice(2, 10)); localStorage.setItem('sbm_pid', myPid);
let nick = localStorage.getItem('sbm_nick') || ('玩家' + myPid.slice(1, 4)); $('nick').value = nick;
let mode = 'solo', engine = null, hostS = null, client = null, transport = null;
let running = false, speed = 1, ws = null, code = '';
const renderer = new Renderer($('stage')); renderer.myPid = myPid;
const log = s => { const l = $('log'); l.textContent += s + '\n'; if (l.textContent.length > 20000) l.textContent = l.textContent.slice(-15000); l.scrollTop = 1e9; };

function loadEngine() {
  let w = null; try { w = JSON.parse(localStorage.getItem(SAVE_W)); } catch (e) {}
  if (!w || w.v !== 2) w = newWorld();
  engine = new Engine(w); engine.onLog = (pid, s) => { if (pid === myPid) log(s); };
  engine.addPlayer(myPid, nick); engine.setCode(myPid, code);
  renderer.view = null; renderer.setView(engine.w, 500 / speed);
}
function save() { if (engine && mode !== 'client') localStorage.setItem(SAVE_W, engine.saveData()); }

function initBlockly() {
  ws = Blockly.inject('blocklyDiv', { toolbox: TOOLBOX, trashcan: true, zoom: { controls: true, wheel: true, startScale: 0.75 }, move: { scrollbars: true, drag: true, wheel: true }, renderer: 'zelos' });
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE_C)); } catch (e) {}
  Blockly.serialization.workspaces.load(saved || DEFAULT_WS, ws);
  ws.addChangeListener(e => { if (!e.isUiEvent) { regen(false); localStorage.setItem(SAVE_C, JSON.stringify(Blockly.serialization.workspaces.save(ws))); } });
  regen(false);
}
function regen(push = true) {
  code = Blockly.JavaScript.workspaceToCode(ws); $('jsView').textContent = '// 每个 tick 执行一次（等价于 Screeps 的 module.exports.loop）\n' + code;
  try { compileUser(code); } catch (e) { log('❌ 编译失败: ' + e.message); return; }
  if (push) applyCode();
}
function applyCode() { if (mode === 'client') client && client.sendCode(code); else engine && engine.setCode(myPid, code); }

function view() { return mode === 'client' ? client?.view : engine?.w; }
function stats() {
  const v = view(); if (!v) { $('stats').textContent = mode === 'client' ? '等待房主数据…' : ''; return; }
  const sp = v.spawns.find(s => s.owner === myPid), n = v.creeps.filter(c => c.owner === myPid).length, np = Object.keys(v.players).length;
  $('stats').textContent = `Tick ${v.time} | 能量 ${sp ? sp.energy + '/' + sp.cap : '-'} | 我的 creep ${n} | 玩家 ${np} | 世界 ${v.S}×${v.S} | ${mode === 'solo' ? '单机' : mode === 'host' ? '房主' : '客户端'} ${mode === 'client' ? '' : running ? '▶' : '⏸'}`;
}
let acc = 0, lastT = performance.now();
function loop(t) {
  const dt = t - lastT; lastT = t;
  if (mode !== 'client' && running && engine) {
    acc += dt; const step = 500 / speed; let n = 0;
    while (acc >= step && n < 4) { engine.tick(); renderer.setView(engine.w, step); hostS && hostS.afterTick(step); acc -= step; n++; if (engine.w.time % 50 === 0) save(); }
    if (n === 4) acc = 0;
  }
  stats(); requestAnimationFrame(loop);
}
function setRunUI() { $('btnRun').textContent = mode === 'client' ? '房主控制' : running ? '⏸ 停止' : '▶ 运行'; $('btnRun').classList.toggle('on', running && mode !== 'client'); $('btnRun').disabled = mode === 'client'; $('btnSpeed').disabled = mode === 'client'; }
$('btnRun').onclick = () => { running = !running; setRunUI(); if (!running) save(); };
$('btnSpeed').onclick = () => { speed = speed >= 8 ? 1 : speed * 2; $('btnSpeed').textContent = speed + 'x'; };
$('btnLog').onclick = () => $('log').classList.toggle('hidden');
$('btnCode').onclick = () => { $('editor').classList.remove('hidden'); Blockly.svgResize(ws); };
$('edClose').onclick = () => { $('editor').classList.add('hidden'); regen(true); log('✅ 代码已应用'); };
document.querySelectorAll('#edTabs [data-t]').forEach(b => b.onclick = () => { document.querySelectorAll('#edTabs [data-t]').forEach(x => x.classList.toggle('on', x === b)); const js = b.dataset.t === 'js'; $('jsView').classList.toggle('hidden', !js); $('blocklyDiv').classList.toggle('hidden', js); if (!js) Blockly.svgResize(ws); });
$('btnMenu').onclick = () => $('menu').classList.remove('hidden');
$('mClose').onclick = () => $('menu').classList.add('hidden');
$('mSave').onclick = () => { save(); alert('已保存'); };
$('mReset').onclick = () => { if (mode === 'client') return alert('客户端不能重置房主的世界'); if (confirm('确定重置整个世界？（代码会保留）')) { localStorage.removeItem(SAVE_W); const peers = hostS ? Object.keys(engine.w.players) : []; loadEngine(); if (hostS) { hostS.e = engine; rebindHost(); } $('menu').classList.add('hidden'); } };
$('mResetCode').onclick = () => { if (confirm('恢复默认积木程序？')) { ws.clear(); Blockly.serialization.workspaces.load(DEFAULT_WS, ws); regen(true); } };
$('mUpdate').onclick = () => checkUpdate(true);
$('ver').textContent = '版本 ' + (window.APP_VERSION || 'dev');

// ===== 联机 =====
function netStatus(s) { $('netStatus').textContent = s; }
$('btnNet').onclick = () => $('net').classList.remove('hidden');
$('nClose').onclick = () => $('net').classList.add('hidden');
$('nick').onchange = () => { nick = $('nick').value.trim() || nick; localStorage.setItem('sbm_nick', nick); if (engine?.w.players[myPid]) engine.w.players[myPid].name = nick; };
function rebindHost() { const old = hostS; hostS = new HostSession(engine, transport, myPid); hostS.onLocalLog = log; hostS.onPeers = () => netStatus(hostInfo()); if (old) old.clients.forEach((c, id) => hostS.clients.set(id, c)); }
let hostIps = [];
function hostInfo() { return `🏠 房主中  端口 ${LAN_PORT}\n本机 IP：${hostIps.join(' / ') || '未知'}\n已连接：${hostS ? hostS.peerNames().join('、') || '无' : ''}`; }
async function stopNet() { if (client) { client.close(); client = null; } if (transport) { await transport.plugin.stop(); } hostS = null; }
$('nHost').onclick = async () => {
  transport = transport || nativeTransport(); if (!transport) return alert('开房需要在安卓 App 中运行（浏览器版只能单机/加入）');
  await stopNet(); if (mode === 'client') { mode = 'solo'; loadEngine(); }
  try { const r = await transport.plugin.start({ port: LAN_PORT, name: nick }); hostIps = r.ips || []; } catch (e) { return alert('开房失败：' + e.message); }
  mode = 'host'; rebindHost(); netStatus(hostInfo()); setRunUI(); log('🏠 已开房，其他手机在同一 WiFi/热点下点“搜索”或输入 IP 加入');
};
$('nScan').onclick = async () => {
  const P = window.Capacitor?.registerPlugin?.('LanServer'); if (!P || !window.Capacitor.isNativePlatform()) return alert('搜索需要安卓 App；也可手动输入 IP');
  $('hosts').textContent = '搜索中…'; try { const r = await P.discover({ timeout: 3500 }); $('hosts').textContent = r.hosts.length ? '' : '没找到（可手动输入 IP）';
    for (const h of r.hosts) { const b = document.createElement('button'); b.textContent = `加入 ${h.name} (${h.ip})`; b.onclick = () => join(h.ip + ':' + h.port); $('hosts').appendChild(b); } } catch (e) { $('hosts').textContent = '搜索失败：' + e.message; }
};
$('nJoin').onclick = () => { const ip = $('ip').value.trim(); if (ip) { localStorage.setItem('sbm_lastip', ip); join(ip.includes(':') ? ip : ip + ':' + LAN_PORT); } };
$('ip').value = localStorage.getItem('sbm_lastip') || '';
async function join(addr) {
  if (mode !== 'client') save(); await stopNet(); running = false;
  mode = 'client'; engine = null; renderer.view = null; renderer.roomsVer = -1;
  client = new ClientSession('ws://' + addr, myPid, nick); client.code = code;
  client.onTick = v => renderer.setView(v, v.dt || 500); client.onLog = log;
  client.onStatus = s => { netStatus(`📱 客户端：${addr}\n${s}`); log('📡 ' + s); };
  setRunUI(); netStatus('连接中 ' + addr); $('net').classList.add('hidden');
}
$('nSolo').onclick = async () => { await stopNet(); mode = 'solo'; running = false; loadEngine(); setRunUI(); netStatus('当前：单机'); };

renderer.onTap = (x, y) => {
  const v = view(); if (!v) return; const i = $('inspect'), f = a => a.find(o => o.x === x && o.y === y);
  const c = f(v.creeps), s = f(v.sources), sp = f(v.spawns), st = f(v.sites), pn = o => v.players[o]?.name || o;
  let t = `(${x}, ${y}) 房间 ${roomName(x, y)}`;
  if (c) t += `\nCreep ${c.name}（${pn(c.owner)}）\n身体 ${c.body.join(',')}\n能量 ${c.energy}\n寿命 ${c.ttl}` + (mode !== 'client' && c.owner === myPid ? `\n记忆 ${JSON.stringify(engine.w.memory[myPid].creeps[c.name] || {})}` : '');
  if (s) t += `\n能量源 ${s.energy}/${s.cap}`; if (sp) t += `\n${sp.name}（${pn(sp.owner)}）能量 ${sp.energy}/${sp.cap}${sp.spawning ? '\n生产中 ' + sp.spawning.name : ''}`;
  if (st) t += `\n工地 ${st.type} ${st.progress}/${st.total}`;
  i.textContent = t; i.classList.remove('hidden'); clearTimeout(i._t); i._t = setTimeout(() => i.classList.add('hidden'), 4000);
};
(function boot() { const host = $('editor'); host.classList.remove('hidden'); host.style.visibility = 'hidden'; initBlockly(); host.classList.add('hidden'); host.style.visibility = ''; loadEngine(); setRunUI(); })();
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
requestAnimationFrame(loop);
setTimeout(() => checkUpdate(false), 2000);
const qj = new URLSearchParams(location.search).get('join'); if (qj) join(qj);
if (new URLSearchParams(location.search).get('run')) { running = true; speed = 4; setRunUI(); }
