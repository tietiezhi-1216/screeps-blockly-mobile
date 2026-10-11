const SAVE_W = 'sbm_world', SAVE_C = 'sbm_code';
let world; try { world = JSON.parse(localStorage.getItem(SAVE_W)); } catch (e) {} if (!world || !world.tiles) world = newWorld();
const engine = new Engine(world), renderer = new Renderer(document.getElementById('world'), engine);
const $ = id => document.getElementById(id);
let running = false, speed = 1, userFn = null, ws = null, code = '';
engine.onLog = s => { const l = $('log'); l.textContent += s + '\n'; if (l.textContent.length > 20000) l.textContent = l.textContent.slice(-15000); l.scrollTop = 1e9; };

function initBlockly() {
  ws = Blockly.inject('blocklyDiv', { toolbox: TOOLBOX, trashcan: true, zoom: { controls: true, wheel: true, startScale: 0.75 }, move: { scrollbars: true, drag: true, wheel: true }, renderer: 'zelos' });
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE_C)); } catch (e) {}
  Blockly.serialization.workspaces.load(saved || DEFAULT_WS, ws);
  ws.addChangeListener(e => { if (!e.isUiEvent) { regen(); localStorage.setItem(SAVE_C, JSON.stringify(Blockly.serialization.workspaces.save(ws))); } });
  regen();
}
function regen() { code = Blockly.JavaScript.workspaceToCode(ws); $('jsView').textContent = '// 每个 tick 执行一次（等价于 Screeps 的 module.exports.loop）\n' + code; try { userFn = compileUser(code); } catch (e) { userFn = null; engine.log('❌ 编译失败:', e.message); } }
function save() { localStorage.setItem(SAVE_W, JSON.stringify(engine.w)); }
function stats() { const w = engine.w, sp = w.spawns[0]; $('stats').textContent = `Tick ${w.time} | Spawn 能量 ${sp.energy}/${sp.cap} | Creep ${w.creeps.length} | 工地 ${w.sites.length} | 建筑 ${w.structures.length} ${running ? '▶' : '⏸'}`; }
let acc = 0, lastT = performance.now();
function loop(t) {
  const dt = t - lastT; lastT = t;
  if (running) { acc += dt; const step = 500 / speed; let n = 0; while (acc >= step && n < 20) { engine.tick(userFn); acc -= step; n++; if (engine.w.time % 50 === 0) save(); } if (n === 20) acc = 0; }
  renderer.draw(); stats(); requestAnimationFrame(loop);
}
$('btnRun').onclick = () => { running = !running; $('btnRun').textContent = running ? '⏸ 停止' : '▶ 运行'; $('btnRun').classList.toggle('on', running); if (!running) save(); };
$('btnSpeed').onclick = () => { speed = speed >= 16 ? 1 : speed * 2; $('btnSpeed').textContent = speed + 'x'; };
$('btnLog').onclick = () => $('log').classList.toggle('hidden');
$('btnCode').onclick = () => { $('editor').classList.remove('hidden'); if (!ws) initBlockly(); else Blockly.svgResize(ws); };
$('edClose').onclick = () => { $('editor').classList.add('hidden'); regen(); };
document.querySelectorAll('#edTabs [data-t]').forEach(b => b.onclick = () => { document.querySelectorAll('#edTabs [data-t]').forEach(x => x.classList.toggle('on', x === b)); const js = b.dataset.t === 'js'; $('jsView').classList.toggle('hidden', !js); $('blocklyDiv').classList.toggle('hidden', js); if (!js) Blockly.svgResize(ws); });
$('btnMenu').onclick = () => $('menu').classList.remove('hidden');
$('mClose').onclick = () => $('menu').classList.add('hidden');
$('mSave').onclick = () => { save(); alert('已保存'); };
$('mReset').onclick = () => { if (confirm('确定重置整个世界？（代码会保留）')) { engine.w = newWorld(); save(); $('menu').classList.add('hidden'); } };
$('mResetCode').onclick = () => { if (confirm('恢复默认积木程序？')) { if (!ws) initBlockly(); ws.clear(); Blockly.serialization.workspaces.load(DEFAULT_WS, ws); regen(); } };
$('mUpdate').onclick = () => checkUpdate(true);
$('ver').textContent = '版本 ' + (window.APP_VERSION || 'dev');
renderer.onTap = (x, y) => {
  const w = engine.w, i = $('inspect'), f = a => a.find(o => o.x === x && o.y === y);
  const c = f(w.creeps), s = f(w.sources), sp = f(w.spawns), st = f(w.sites);
  let t = `(${x}, ${y}) 房间 ${roomName(x, y)}`;
  if (c) t += `\nCreep ${c.name}\n身体 ${c.body.join(',')}\n能量 ${c.energy}\n寿命 ${c.ttl}\n记忆 ${JSON.stringify(w.memory.creeps[c.name] || {})}`;
  if (s) t += `\n能量源 ${s.energy}/${s.cap}`; if (sp) t += `\n${sp.name} 能量 ${sp.energy}/${sp.cap}${sp.spawning ? '\n生产中 ' + sp.spawning.name : ''}`;
  if (st) t += `\n工地 ${st.type} ${st.progress}/${st.total}`;
  i.textContent = t; i.classList.remove('hidden'); clearTimeout(i._t); i._t = setTimeout(() => i.classList.add('hidden'), 4000);
};
// 启动时无需打开编辑器也能运行：后台初始化 Blockly 以生成代码
(function bootCode() { const host = $('editor'); host.classList.remove('hidden'); host.style.visibility = 'hidden'; initBlockly(); host.classList.add('hidden'); host.style.visibility = ''; })();
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
requestAnimationFrame(loop);
setTimeout(() => checkUpdate(false), 2000);
