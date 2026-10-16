// 无头测试（连 test/fake-server.js 回放的私服）：房间视图点格子（官方客户端同款）——坐标/地形/对象列表、同格再点循环、高亮、自杀/摧毁/取消工地、返回键
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
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
  await pg.evaluateOnNewDocument(FS.install, FX);
  await pg.goto(`http://localhost:${port}/index.html`); await W(1500); for (let n = 0; n < 50 && !(await pg.evaluate(() => !!sess)); n++) await W(200);
  await pg.tap('#sPlay'); await W(500);
  const E = (f, ...a) => pg.evaluate(f, ...a), back = () => E(() => window.__l.forEach(f => f({ canGoBack: false }))).then(() => W(150));
  // 服务器推送的房间增量（和真实私服同一条代码路径：OnlineSession._room → mergeDelta）
  const delta = objs => E(o => { const k = sess.kOf(sess.home); sess._room(k, { objects: o, gameTime: sess.time + 1 }); sess.buildView(); }, objs);
  await E(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); });
  for (let n = 0; n < 30 && !(await E(() => view().creeps.some(c => c.owner === myPid))); n++) await W(200);
  await W(2500); // 等回放的房间增量推完，免得之后的推送把测试里删掉的对象又加回来
  const info = await E(() => { const v = view(), sp = v.spawns.find(s => s.owner === myPid), cr = v.creeps.find(c => c.owner === myPid && !c.spawning); return { sp: sp && [sp.x, sp.y, sp.id], cr: cr && [cr.x, cr.y, cr.id] }; });
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
  await delta({ rtest: { _id: 'rtest', type: 'energy', room: FX.home, x: info.sp[0] % 50, y: info.sp[1] % 50, resourceType: 'energy', energy: 25 } }); await W(100);
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st();
  ok(s.title.startsWith('StructureSpawn') && s.tabs.length === 3 && s.on === 'Spawn', '叠放格子先显示第一个对象（Spawn），列出全部：' + s.tabs.join('/'));
  ok(/hits/.test(s.body) && s.act === 'destroy', 'Spawn 详情含 hits，自己的建筑有「摧毁」');
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/inspect-portrait-spawn.png' });
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.title === 'Resource' && /amount25/.test(s.body.replace(/\s/g, '')) && !s.act, '同格再点：切到资源（无操作按钮）');
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.title === '地形', '再点：回到地形');
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.title.startsWith('StructureSpawn'), '再点：循环回第一个');
  await E(() => document.querySelector('.insDanger').click()); s = await st(); ok(s.dlg === 1, '摧毁先弹确认框');
  await back(); s = await st(); ok(s.dlg === 0 && s.ins, '返回键先关确认框，详情还在');
  // creep：自杀 → 发给服务器（add-object-intent suicide），服务器推送 creep 删除 + 墓碑
  await E(id => { const c = view().creeps.find(c => c.id === id); renderer.onTap(c.x, c.y); }, info.cr[2]); s = await st();
  ok(s.title.startsWith('Creep') && /ticksToLive/.test(s.body) && /store/.test(s.body) && s.act === 'suicide', 'creep 详情（所属/hits/store/ticksToLive/身体）+「自杀」');
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/inspect-portrait-creep.png' });
  await E(() => document.querySelector('.insDanger').click()); await E(() => document.querySelector('.shDlg [data-r="1"]').click()); await W(200);
  let rq = await E(() => __req.filter(r => r.p === '/api/game/add-object-intent').pop());
  ok(rq && rq.body.name === 'suicide' && rq.body._id === info.cr[2] && rq.body.room === FX.home, '确认后向服务器发送 creep.suicide：' + JSON.stringify(rq && rq.body));
  await delta({ [info.cr[2]]: null, tb1: { _id: 'tb1', type: 'tombstone', room: FX.home, x: info.cr[0] % 50, y: info.cr[1] % 50, deathTime: 1, ticksToDecay: 10, store: {}, creepName: 'x' } }); await W(150);
  await E(([x, y]) => renderer.onTap(x, y), info.cr); s = await st();
  ok(await E(id => !view().creeps.some(c => c.id === id), info.cr[2]) && (s.tabs.includes('墓碑') || /Tombstone/.test(s.title)) , '服务器推送后 creep 消失，同格显示墓碑');
  // 工地：取消 → removeConstructionSite intent
  const site = [info.sp[0] + 3, info.sp[1] + 2];
  await delta({ cs1: { _id: 'cs1', type: 'constructionSite', room: FX.home, x: site[0] % 50, y: site[1] % 50, structureType: 'road', user: await E(() => myPid), progress: 0, progressTotal: 300 } }); await W(150);
  await E(([x, y]) => renderer.onTap(x, y), site); s = await st(); ok(s.title === 'ConstructionSite' && s.act === 'remove', '自己的工地有「取消工地」');
  await E(() => document.querySelector('.insDanger').click()); await E(() => document.querySelector('.shDlg [data-r="1"]').click()); await W(200);
  rq = await E(() => __req.filter(r => r.p === '/api/game/add-object-intent').pop());
  ok(rq && rq.body._id === 'room' && rq.body.name === 'removeConstructionSite' && rq.body.intent[0].id === 'cs1', '向服务器发送 removeConstructionSite：' + JSON.stringify(rq && rq.body));
  // 摧毁 Spawn → destroyStructure intent
  await E(([x, y]) => { tileSel = { x, y, idx: 0 }; renderInspect(); }, info.sp); s = await st();
  if (!s.title.startsWith('StructureSpawn')) await E(([x, y]) => renderer.onTap(x, y), info.sp);
  await E(() => document.querySelector('.insDanger[data-act="destroy"]').click()); s = await st(); ok(s.dlg === 1, '摧毁先弹确认框');
  await back(); s = await st(); ok(s.dlg === 0 && s.ins, '返回键先关确认框，详情还在');
  await E(() => document.querySelector('.insDanger[data-act="destroy"]').click()); await E(() => document.querySelector('.shDlg [data-r="1"]').click()); await W(200);
  rq = await E(() => __req.filter(r => r.p === '/api/game/add-object-intent').pop());
  ok(rq && rq.body.name === 'destroyStructure' && rq.body.intent[0].id === info.sp[2], '向服务器发送 destroyStructure：' + JSON.stringify(rq && rq.body));
  await delta({ [info.sp[2]]: null, ru1: { _id: 'ru1', type: 'ruin', room: FX.home, x: info.sp[0] % 50, y: info.sp[1] % 50, structure: { type: 'spawn', hits: 0, hitsMax: 5000 }, destroyTime: 1, ticksToDecay: 500, store: {} } }); await W(150);
  await E(([x, y]) => renderer.onTap(x, y), info.sp); s = await st(); ok(s.tabs.includes('废墟') || /Ruin/.test(s.title), '服务器推送后格子列表里出现废墟');
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
