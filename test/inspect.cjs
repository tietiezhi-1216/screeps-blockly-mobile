// 无头测试：房间视图点格子（官方客户端同款）——坐标/地形/对象列表、同格再点循环、高亮、自杀/摧毁/取消工地、返回键
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const W = ms => new Promise(r => setTimeout(r, ms)), ROOT = path.join(__dirname, '../www'), SHOTS = process.env.SHOTS;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o);
    window.__l = []; window.Capacitor = { Plugins: { App: { addListener: (ev, fn) => { if (ev === 'backButton') window.__l.push(fn); return Promise.resolve({ remove() {} }); }, exitApp() {} } } }; });
  await pg.goto(`http://localhost:${port}/index.html`); await W(1500); await pg.tap('#sPlay'); await W(500);
  const E = (f, ...a) => pg.evaluate(f, ...a), back = () => E(() => window.__l.forEach(f => f({ canGoBack: false }))).then(() => W(150));
  await E(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); } catch (e) {} $('wmap').classList.add('hidden'); running = false; const w = engine.w, sp = w.spawns.find(s => s.owner === myPid); w.creeps.push({ kind: 'creep', id: 'c' + (w.nextId++), owner: myPid, name: 'tester', body: ['work', 'carry', 'move'], hits: 300, x: sp.x + 1, y: sp.y + 1, px: sp.x + 1, py: sp.y + 1, store: { energy: 20 }, ttl: 900, fatigue: 0 }); _snap = null; renderer.setView(engine.w, 1); });
  const info = await E(() => { const sp = engine.w.spawns.find(s => s.owner === myPid), cr = engine.w.creeps.find(c => c.owner === myPid && !c.spawning); return { sp: sp && [sp.x, sp.y], cr: cr && [cr.x, cr.y, cr.id] }; });
  ok(info.sp && info.cr, '有自己的 Spawn 和 creep');
  await E(([x, y]) => { renderer.scale = 4; renderer.cx = (x + .5) * TS; renderer.cy = (y + .5) * TS; renderer.frame(); }, info.sp); await W(200);
  ok(await E(() => renderer.lod === 'full'), '放大到房间视图');
  const st = () => E(() => ({ ins: !$('inspect').classList.contains('hidden'), panel: !$('panel').classList.contains('hidden'), title: $('insTitle').textContent, body: $('insBody').textContent, tabs: [...document.querySelectorAll('.insTab')].map(t => t.textContent), on: document.querySelector('.insTab.on')?.textContent, tile: renderer.selTile, act: document.querySelector('.insDanger')?.dataset.act, dlg: document.querySelectorAll('.shDlg').length }));
  // 空地：地形+坐标，不打开房间信息
  const plain = await E(([sx, sy]) => { for (let d = 3; d < 20; d++) for (const [x, y] of [[sx + d, sy], [sx - d, sy], [sx, sy + d], [sx, sy - d]]) if (tileObjs(view(), x, y).length === 0 && terrainAt(x, y) === '平原') return [x, y]; }, info.sp);
  await E(([x, y]) => renderer.onTap(x, y), plain); let s = await st();
  ok(s.ins && !s.panel, '房间视图点空地：显示格子信息，不打开房间信息'); ok(s.title === '地形' && /平原/.test(s.body) && /x \d+, y \d+ · [EW]\d+[NS]\d+/.test(s.body), '显示坐标、房间名和地形：' + s.body.slice(0, 40));
  ok(s.tile && s.tile.x === plain[0] && s.tile.y === plain[1], '高亮选中的格子');
  const wall = await E(([sx, sy]) => { for (let d = 1; d < 25; d++) for (const [x, y] of [[sx + d, sy], [sx - d, sy], [sx, sy + d], [sx, sy - d]]) if (terrainAt(x, y) === '墙') return [x, y]; }, info.sp);
  await E(([x, y]) => renderer.onTap(x, y), wall); ok(/墙/.test((await st()).body), '墙体格子显示「墙」');
  // 叠放：在 Spawn 格子上放一个掉落资源，再点循环
  await E(([x, y]) => { engine.w.resources.push({ id: 'rtest', kind: 'resource', x, y, resourceType: 'energy', amount: 25 }); _snap = null; }, info.sp);
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st();
  ok(s.title.startsWith('StructureSpawn') && s.tabs.length === 3 && s.on === 'Spawn', '叠放格子先显示第一个对象（Spawn），列出全部：' + s.tabs.join('/'));
  ok(/hits/.test(s.body) && s.act === 'destroy', 'Spawn 详情含 hits，自己的建筑有「摧毁」');
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/inspect-portrait-spawn.png' });
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.title === 'Resource' && /amount25/.test(s.body.replace(/\s/g, '')) && !s.act, '同格再点：切到资源（无操作按钮）');
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.title === '地形', '再点：回到地形');
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.title.startsWith('StructureSpawn'), '再点：循环回第一个');
  // 摧毁：房间有敌对 creep 时官方返回 ERR_BUSY
  await E(() => document.querySelector('.insDanger').click()); s = await st(); ok(s.dlg === 1, '摧毁先弹确认框');
  await back(); s = await st(); ok(s.dlg === 0 && s.ins, '返回键先关确认框，详情还在');
  // creep：自杀 → 留下墓碑
  await E(id => { const c = engine.w.creeps.find(c => c.id === id); renderer.onTap(c.x, c.y); }, info.cr[2]); s = await st();
  ok(s.title.startsWith('Creep') && /ticksToLive/.test(s.body) && /store/.test(s.body) && s.act === 'suicide', 'creep 详情（所属/hits/store/ticksToLive/身体）+「自杀」');
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/inspect-portrait-creep.png' });
  await E(() => document.querySelector('.insDanger').click()); await E(() => document.querySelector('.shDlg [data-r="1"]').click()); await W(100);
  s = await st(); const dead = await E(id => !engine.w.creeps.some(c => c.id === id), info.cr[2]);
  ok(dead && s.title.startsWith('Tombstone'), '确认后 creep.suicide()：creep 消失，同格显示墓碑');
  // 工地：取消
  const site = await E(([sx, sy]) => { const A = buildApi(engine, myPid); for (let d = 2; d < 8; d++) { const x = sx + d, y = sy + 2; if (apiPos(A, x, y).createConstructionSite('road') === 0) { _snap = null; return [x, y]; } } }, info.sp);
  await E(([x, y]) => renderer.onTap(x, y), site); s = await st(); ok(s.title === 'ConstructionSite' && s.act === 'remove', '自己的工地有「取消工地」');
  await E(() => document.querySelector('.insDanger').click()); await E(() => document.querySelector('.shDlg [data-r="1"]').click()); await W(100);
  ok(await E(([x, y]) => !engine.w.sites.some(s => s.x === x && s.y === y), site), 'constructionSite.remove() 生效');
  // 摧毁 Spawn：留下废墟
  await E(([x, y]) => { engine.w.creeps = engine.w.creeps.filter(c => c.owner === myPid || Math.floor(c.x / ROOM) !== Math.floor(x / ROOM) || Math.floor(c.y / ROOM) !== Math.floor(y / ROOM)); _snap = null; renderer.onTap(x, y); }, info.sp);
  s = await st(); if (!s.title.startsWith('StructureSpawn')) { await E(([x, y]) => { tileSel = { x, y, idx: 0 }; renderInspect(); }, info.sp); }
  await E(() => document.querySelector('.insDanger[data-act="destroy"]').click()); await E(() => document.querySelector('.shDlg [data-r="1"]').click()); await W(100);
  ok(await E(([x, y]) => !engine.w.spawns.some(s => s.x === x && s.y === y) && (engine.w.ruins || []).some(r => r.x === x && r.y === y), info.sp), 'structure.destroy()：Spawn 消失并留下废墟');
  s = await st(); ok(s.tabs.includes('废墟'), '格子列表里出现废墟');
  // 返回键关闭格子信息
  await back(); s = await st(); ok(!s.ins && !s.tile, '返回键关闭格子信息并取消高亮');
  // 缩小到缩略图：点房间显示房间信息
  await E(() => { renderer.scale = .3; renderer.frame(); }); await W(100);
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.panel && !s.ins, '缩略图层级点房间：显示房间信息');
  await E(() => $('pnClose').click());
  if (SHOTS) { await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await W(200);
    await E(([x, y]) => { renderer.scale = 4; renderer.cx = (x + .5) * TS; renderer.cy = (y + .5) * TS; renderer.frame(); renderer.onTap(x, y); }, info.sp); await W(200); await pg.screenshot({ path: SHOTS + '/inspect-landscape-ruin.png' }); }
  await b.close(); srv.close();
  if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 房间视图点格子');
})().catch(e => { console.error(e); process.exit(1); });
