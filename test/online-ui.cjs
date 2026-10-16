// 真机前的界面联调：用无头 Chrome 打开 App，连到真实私服（SBM_SERVER / SBM_USER / SBM_PASS），
// 走一遍 登录页 → 进入游戏 → 房间视图 → 全图 → 上传代码 → 插旗/拆旗 → 放工地/移除，并截图到 SBM_SHOTS（默认 /workspace/shots-online）。
// 私服没有 CORS 头（App 里走原生 HTTP），桌面 Chrome 测试时用 --disable-web-security 模拟。
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const W = ms => new Promise(r => setTimeout(r, ms)), ROOT = path.join(__dirname, '../www');
const SRV = process.env.SBM_SERVER, USER = process.env.SBM_USER, PASS = process.env.SBM_PASS, SHOTS = process.env.SBM_SHOTS || '/workspace/shots-online';
if (!SRV || !USER || !PASS) { console.log('skip - 未设置 SBM_SERVER / SBM_USER / SBM_PASS'); process.exit(0); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
const until = async (pg, fn, ms = 15000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await pg.evaluate(fn, arg).catch(() => null); if (v) return v; await W(300); } return null; };
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-web-security', '--user-data-dir=/tmp/sbm-ui-' + process.pid] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto(`http://localhost:${port}/index.html`); await W(1200);
  // 1) 登录页
  await pg.evaluate(() => Shell.show('login')); await W(300);
  ok(await pg.evaluate(() => !!document.getElementById('lHost') && !!document.getElementById('lUser')), '登录页有服务器地址和账号输入框');
  ok(await pg.evaluate(() => document.getElementById('lHost').value === ''), '没有写死的服务器地址');
  await pg.type('#lHost', SRV); await pg.type('#lUser', USER); await pg.type('#lPass', 'wrong-password-x');
  await pg.evaluate(() => document.querySelector('[data-act="login"]').click());
  const bad = await until(pg, () => document.querySelector('.lerr')?.textContent);
  ok(bad && /用户名或密码不对/.test(bad), '密码错误给出中文提示：' + bad);
  await pg.evaluate(() => { document.getElementById('lPass').value = ''; }); await pg.type('#lPass', PASS);
  await pg.screenshot({ path: path.join(SHOTS, 'login.png') });
  await pg.evaluate(() => document.querySelector('[data-act="login"]').click());
  ok(await until(pg, () => !!sess && Shell.page() === null, 30000), '登录成功并进入游戏');
  ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('sbm_server')).host.length > 0), '记住了服务器设置');
  // 2) 房间视图：等到实时数据里有自己的 spawn / creep
  const vv = await until(pg, () => { const v = view(); return v && v.spawns.some(s => s.owner === myPid) && v.creeps.length ? { sp: v.spawns.filter(s => s.owner === myPid).length, cr: v.creeps.length } : null; }, 20000);
  ok(vv, '房间里看到自己的 spawn 和 creep：' + JSON.stringify(vv));
  const t0 = await pg.evaluate(() => view().time); await W(2500); const t1 = await pg.evaluate(() => view().time);
  ok(t1 > t0, `游戏时间在走（${t0} → ${t1}）`);
  // creep 位置随 tick 变化（服务器在跑代码）
  const pos0 = await pg.evaluate(() => JSON.stringify(view().creeps.map(c => [c.id, c.x, c.y, c.store, c.hits, c.ttl ?? c.ticksToLive]))); await W(4000);
  const pos1 = await pg.evaluate(() => JSON.stringify(view().creeps.map(c => [c.id, c.x, c.y, c.store, c.hits, c.ttl ?? c.ticksToLive])));
  ok(pos0 !== pos1, 'creep 状态在实时更新'); if (pos0 === pos1) console.log(pos0);
  await pg.evaluate(() => { const s = view().spawns.find(s => s.owner === myPid); renderer.fitRoom(Math.floor(s.x / 50), Math.floor(s.y / 50)); }); await W(800);
  await pg.screenshot({ path: path.join(SHOTS, 'room.png') });
  await pg.evaluate(() => { const s = view().spawns.find(s => s.owner === myPid); renderer.scale *= 2.6; renderer.cx = (s.x + 3.5) * TS; renderer.cy = (s.y + 4) * TS; renderer.frame(); }); await W(1500);
  await pg.screenshot({ path: path.join(SHOTS, 'room-zoom.png') });
  // 3) 上传代码
  await pg.evaluate(() => { $('btnRun').click(); });
  const up = await until(pg, () => LOGS.find(l => /已上传到服务器|上传失败/.test(l.s))?.s); ok(up && /已上传/.test(up), '点上传把积木代码传到服务器：' + up);
  // 上传后服务器上的代码就是积木生成的 main.js
  const same = await pg.evaluate(async () => { const r = await sess.api.codeGet(); const m = r.modules || {}; return m.main === code; });
  ok(same, '服务器上的 main 模块和积木生成的一致');
  const n0 = await pg.evaluate(() => LOGS.length); await W(6000);
  const errs = await pg.evaluate(n => LOGS.slice(n).filter(l => l.cls === 'err').map(l => l.s), n0);
  ok(!errs.length, '积木代码在服务器上运行没有报错' + (errs.length ? '：' + errs.slice(0, 3).join(' / ') : ''));
  // 4) 插旗 / 拆旗（经过服务器）
  const fl = await pg.evaluate(async () => { const s = view().spawns.find(s => s.owner === myPid); const k = Math.floor(s.x / 50) + ',' + Math.floor(s.y / 50), T = sess.rooms[k];
    for (let d = 2; d < 8; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const x = s.x + dx, y = s.y + dy; if (T && T[(y % 50) * 50 + (x % 50)] & 1) continue; try { await sess.flag(x, y, 'UiTest', 1, 1); return { x, y }; } catch (e) { } } return null; });
  ok(fl, '服务器接受插旗');
  const seen = fl && await until(pg, () => view().flags.find(f => f.name === 'UiTest'), 8000);
  ok(seen, '旗帜出现在房间里');
  if (seen) { await pg.evaluate(f => sess.removeFlag(f), seen); ok(await until(pg, () => !view().flags.find(f => f.name === 'UiTest'), 8000), '拆旗后旗帜消失'); }
  // 5) 放工地 / 移除
  const site = await pg.evaluate(async () => { const s = view().spawns.find(s => s.owner === myPid); const k = Math.floor(s.x / 50) + ',' + Math.floor(s.y / 50), T = sess.rooms[k];
    for (let d = 3; d < 9; d++) for (const [dx, dy] of [[d, d], [-d, d], [d, -d], [-d, -d]]) { const x = s.x + dx, y = s.y + dy; if (T && T[(y % 50) * 50 + (x % 50)] & 1) continue; try { await sess.build(x, y, 'road'); return { x, y }; } catch (e) { } } return null; });
  ok(site, '服务器接受放置道路工地');
  const st = site && await until(pg, s => view().sites.find(o => o.x === s.x && o.y === s.y), 8000, site);
  ok(st, '工地出现在房间里');
  if (st) { await pg.evaluate(o => sess.act('remove', o), st); ok(await until(pg, s => !view().sites.find(o => o.x === s.x && o.y === s.y), 8000, site), '移除工地后消失'); }
  // creep 自杀（服务器 add-object-intent）→ creep 从房间里消失
  const victim = await pg.evaluate(() => { const c = view().creeps.find(c => c.owner === myPid && !c.spawning); return c && { id: c.id, x: c.x, y: c.y }; });
  if (victim) { await pg.evaluate(o => sess.act('suicide', o), victim); ok(await until(pg, id => !view().creeps.some(c => c.id === id), 10000, victim.id), 'creep 自杀后从房间里消失'); }
  // 6) 全图
  await pg.evaluate(() => $('btnView').click()); await W(1500);
  ok(await pg.evaluate(() => renderer.lod !== 'full' || !$('wmap').classList.contains('hidden')), '打开全图');
  await pg.screenshot({ path: path.join(SHOTS, 'map.png') });
  // 7) 新玩家：在 App 里注册 → 自动弹出「选择出生房间」→ 选房间 → 点空地放 Spawn1（全部经过服务器）
  await pg.evaluate(() => { logout(); localStorage.removeItem('sbm_server'); Shell.show('login'); }); await W(400);
  const nu = 'ui' + Date.now().toString(36).slice(-6), np = 'ui-pass-' + Math.random().toString(36).slice(2, 8);
  await pg.type('#lHost', SRV); await pg.type('#lUser', nu); await pg.type('#lPass', np);
  await pg.evaluate(() => document.querySelector('[data-act="register"]').click());
  ok(await until(pg, () => !!sess && sess.me && Shell.page() === null, 30000), `注册新账号 ${nu} 并登录`);
  ok(await until(pg, () => !$('wmap').classList.contains('hidden') && $('wmTitle').textContent === '选择出生房间', 10000), '新玩家自动打开「选择出生房间」');
  await W(800); await pg.screenshot({ path: path.join(SHOTS, 'spawn-pick.png') });
  // 由地图自己的规则决定能不能出生（wmShowSel 会禁用不可出生房间的按钮）
  const room = await pg.evaluate(() => { for (const k in sess.mapInfo) { const m = sess.mapInfo[k]; if (!m || m.status !== 'normal' || m.own) continue;
      wm.sel = k.split(',').map(Number); wmShowSel(); if (!$('wmGo').disabled) { $('wmGo').click(); return k; } } return null; });
  ok(room, '选中一个可出生的房间：' + room);
  const tile = room && await until(pg, k => { if (!sess.rooms[k]) return null; const [rx, ry] = k.split(',').map(Number); for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) { const X = rx * 50 + x, Y = ry * 50 + y; if (!localSpawnCheck(X, Y)) return { X, Y }; } return null; }, 10000, room);
  ok(tile, '在房间里找到能放 Spawn 的空地');
  if (tile) { await pg.evaluate(t => { spawnTap(t.X, t.Y); $('bbOk').click(); }, tile);
    ok(await until(pg, () => view() && view().spawns.some(s => s.owner === myPid), 20000), 'Spawn1 出现在房间里（服务器已放置）'); }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} 项失败` : '\n全部通过'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
