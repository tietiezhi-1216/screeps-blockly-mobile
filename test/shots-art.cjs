// 截图：官方外观——Keeper 房间（无视野 / 有视野）、全建筑基地、建造菜单、旗帜工具（横屏 + 竖屏）
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = process.env.OUT || '/workspace/shots-art/', PORT = process.env.PORT || 8811;
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  for (const [vw, vh, tag] of [[915, 412, 'land'], [412, 915, 'port']]) {
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1500); await pg.evaluate(() => $('sPlay').click()); await W(600);
  const info = await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); } catch (e) {} $('wmap').classList.add('hidden'); running = false;
    const w = engine.w, sp = w.spawns.find(s => s.owner === myPid), rk = roomKey(sp.x, sp.y), [rx, ry] = rk.split(',').map(Number), ox = rx * 50, oy = ry * 50, c = ctrlOfRoom(w, rk); c.level = 8; c.owner = myPid;
    const T = (x, y) => +engine.tile(x, y) !== T_WALL && !w.structures.some(s => s.x === x && s.y === y) && !w.spawns.some(s => s.x === x && s.y === y) && !w.sources.some(s => s.x === x && s.y === y) && !(c.x === x && c.y === y);
    const put = (type, extra = {}) => { for (let r = 2; r < 22; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2) continue; const x = sp.x + dx, y = sp.y + dy; if (x <= ox + 1 || y <= oy + 1 || x >= ox + 48 || y >= oy + 48 || !T(x, y)) continue; const s = Object.assign({ kind: 'structure', id: 'st' + (w.nextId++), type, owner: myPid, x, y, hits: 1000, hitsMax: 1000, store: {} }, extra); w.structures.push(s); return s; } };
    for (const [t, n] of [['extension', 6], ['tower', 2], ['storage', 1], ['link', 2], ['lab', 3], ['terminal', 1], ['factory', 1], ['observer', 1], ['powerSpawn', 1], ['nuker', 1], ['container', 1], ['rampart', 2], ['constructedWall', 2]]) for (let i = 0; i < n; i++) put(t, { store: { energy: [0, 25, 50, 100][i % 4] } });
    for (let i = 0; i < 6; i++) { const x = sp.x - 3 + i, y = sp.y + 1; if (T(x, y)) w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'road', x, y, hits: 5000, hitsMax: 5000 }); }
    const mn = w.minerals.find(m => roomKey(m.x, m.y) === rk); if (mn && T(mn.x, mn.y)) w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'extractor', owner: myPid, x: mn.x, y: mn.y, hits: 500, hitsMax: 500 });
    for (const t of ['spawn', 'tower', 'extension']) { const s = put('road'); if (s) { w.structures.splice(w.structures.indexOf(s), 1); w.sites.push({ kind: 'site', id: 'cs' + (w.nextId++), owner: myPid, x: s.x, y: s.y, type: t, progress: 1500, total: 5000 }); } }
    w.flags.push({ kind: 'flag', id: 'fl' + (w.nextId++), owner: myPid, name: 'Flag1', x: sp.x + 2, y: sp.y - 2, color: 1, secondaryColor: 6 }, { kind: 'flag', id: 'fl' + (w.nextId++), owner: myPid, name: 'Flag2', x: sp.x - 2, y: sp.y - 2, color: 3, secondaryColor: 3 });
    sp.spawning = { name: 'x', needTime: 9, spawnTime: w.time + 4 };
    // Keeper 房间：让每个 lair 都刷出守卫，并给其中一个设倒计时
    const lairs = w.structures.filter(s => s.type === 'keeperLair'), krk = lairs.map(l => roomKey(l.x, l.y)).sort((a, b) => { const d = k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - rx) + Math.abs(y - ry); }; return d(a) - d(b); })[0];
    for (let i = 0; i < 320; i++) engine.tick();
    const kl = w.structures.filter(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === krk); if (kl[0]) kl[0].spawnAt = w.time + 120;
    renderer.setView(engine.w, 1); return { sp: [sp.x, sp.y], rk, krk, keepers: w.creeps.filter(c => c.owner === '__keeper' && roomKey(c.x, c.y) === krk).length };
  });
  await W(1500);
  const room = async (k, name) => { await pg.evaluate(k => { const [x, y] = k.split(',').map(Number); renderer.fitRoom(x, y); }, k); await W(700); await pg.screenshot({ path: O + tag + '-' + name }); };
  const zoomL = async name => { await pg.evaluate(k => { const l = engine.w.structures.find(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === k && s.spawnAt) || engine.w.structures.find(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === k); const kp = engine.w.creeps.find(c => c.owner === '__keeper' && c.lair === l.id) || l; renderer.scale = 3; renderer.cx = ((l.x + kp.x) / 2 + .5) * 16; renderer.cy = ((l.y + kp.y) / 2 + .5) * 16; }, info.krk); await W(700); await pg.screenshot({ path: O + tag + '-' + name }); };
  await room(info.krk, '1-keeper-room-fog.png'); await zoomL('1b-keeper-lair-fog-zoom.png');
  await pg.evaluate(k => { const w = engine.w, [x, y] = k.split(',').map(Number); for (let i = 5; i < 45; i++) if (+engine.tile(x * 50 + i, y * 50 + 25) !== T_WALL) { w.creeps.push({ kind: 'creep', id: 'c' + (w.nextId++), owner: myPid, name: 'scout', body: ['move'], hits: 100, x: x * 50 + i, y: y * 50 + 25, px: x * 50 + i, py: y * 50 + 25, store: {}, ttl: 1000, fatigue: 0 }); break; } renderer.setView(engine.w, 1); }, info.krk); await W(600); // 自己的 creep 进入房间 → 有视野
  await room(info.krk, '2-keeper-room-vision.png'); await zoomL('2b-keeper-lair-vision-zoom.png');
  await pg.evaluate(() => renderer.setView(engine.w, 1)); await W(300);
  await room(info.rk, '3-base-all-structures.png');
  await pg.evaluate((x, y) => { renderer.scale = 3.2; renderer.cx = (x + .5) * 16; renderer.cy = (y + .5) * 16; }, info.sp[0], info.sp[1]); await W(600); await pg.screenshot({ path: O + tag + '-4-base-zoom.png' });
  await pg.evaluate(() => { const c = ctrlOfRoom(engine.w, roomKey(engine.w.spawns.find(s => s.owner === myPid).x, engine.w.spawns.find(s => s.owner === myPid).y)); engine.w.structures = engine.w.structures.filter(s => !(s.owner === myPid && s.type !== 'road' && s.type !== 'rampart' && s.type !== 'constructedWall')); openBuildPicker(); }); await W(600);
  await pg.screenshot({ path: O + tag + '-5-build-menu.png' });
  await pg.evaluate(() => { $('bpClose').click(); $('btnFlag').click(); }); await W(400);
  await pg.evaluate(() => { document.querySelector('#fpC1 .fsw[data-c="5"]').click(); document.querySelector('#fpC2 .fsw[data-c="6"]').click(); }); await W(300);
  await pg.screenshot({ path: O + tag + '-6-flag-tool.png' });
  info.flagBtn = await pg.evaluate(() => { $('fpOk').click(); return { bar: !$('buildBar').classList.contains('hidden'), msg: $('bbMsg').textContent, noFlagInBuild: !$('bpList').innerHTML.includes('旗帜') }; });
  console.log(tag, JSON.stringify(info)); await pg.close(); }
  console.log('errs', JSON.stringify(errs)); await b.close(); })();
