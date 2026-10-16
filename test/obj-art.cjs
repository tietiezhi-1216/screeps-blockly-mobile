// 无头测试：官方对象贴图（www/art/obj/*.png）全部加载成功；任何一张加载失败时测试失败（并验证失败时有后备图形、Keeper 仍可见）；
// 服务器推来的 Source Keeper 房间（test/fixtures/pserver.json 录自真实私服）里 Keeper / Lair / 能量源 / 矿物都画出来（手机尺寸 412×915、DPR 2.6）。SHOTS=目录 时保存截图
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const W = ms => new Promise(r => setTimeout(r, ms)), ROOT = process.env.ROOT || path.join(__dirname, '../www'), SHOTS = process.env.SHOTS;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
const NAMES = (fs.readFileSync(path.join(ROOT, 'obj-art.js'), 'utf8').match(/const NAMES = \[([^\]]+)\]/) || [, ''])[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
(async () => {
  ok(NAMES.length > 30, '贴图清单 ' + NAMES.length + ' 张'); for (const k of NAMES) { const f = path.join(ROOT, 'art/obj', k + '.png'); if (!fs.existsSync(f) || fs.statSync(f).size < 200) ok(false, '缺少贴图文件 art/obj/' + k + '.png'); }
  await new Promise(r => srv.listen(0, r)); const BASE = 'http://localhost:' + srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const open = async (block) => { const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true }); pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
    if (block) { await pg.setRequestInterception(true); pg.on('request', r => r.url().includes('/art/obj/' + block + '.png') ? r.abort() : r.continue()); }
    await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
    await pg.evaluateOnNewDocument(FS.install, FX);
    await pg.goto(BASE + '/index.html'); await pg.waitForFunction(() => typeof ART !== 'undefined' && ART.ok, { timeout: 15000 }); return pg; };
  const npcVisible = pg => pg.evaluate(() => { const t = renderer.texCache.get('npcCreep'); if (!t) return { n: 0, a: 0 }; const c = t.baseTexture.resource.source, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i];
    let n = 0; const walk = o => { if (o.texture === t && o.worldVisible) n++; (o.children || []).forEach(walk); }; walk(renderer.app.stage); return { n, a }; });
  // 1. 全部贴图加载成功
  { const pg = await open(); const r = await pg.evaluate(() => ({ failed: ART.failed.slice(), bad: ART.NAMES.filter(k => !ART.usable(k)) }));
    ok(r.failed.length === 0 && r.bad.length === 0, '所有对象贴图加载成功' + (r.failed.length ? '，失败：' + r.failed.join(',') : '') + (r.bad.length ? '，不可用：' + r.bad.join(',') : ''));
    // 2. 连服务器 → 放大到 Source Keeper 房间（对象全部来自服务器推送）
    for (let n = 0; n < 50 && !(await pg.evaluate(() => !!sess)); n++) await W(200);
    await pg.evaluate(() => $('sPlay').click()); await W(600);
    const L = await pg.evaluate(name => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); const [qx, qy] = parseRoomName(name); return { rk: qx + ',' + qy, qx, qy }; }, FX.keeper);
    const shot = async (sc, x, y, name) => { await pg.evaluate((sc, x, y) => { renderer.scale = sc; renderer.cx = (x + .5) * TS; renderer.cy = (y + .5) * TS; renderer.frame(); watchRooms(); }, sc, x, y); await W(2500); if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); };
    await shot(.58, L.qx * 50 + 24.5, L.qy * 50 + 24.5, 'keeper-room-phone');
    const r2 = await pg.evaluate(rk => { const v = view(), inR = o => roomKey(o.x, o.y) === rk, sp = id => { const s = renderer.sprites.get(id) || renderer.sprites.get(id + 'h'); return !!(s && s.worldVisible); };
      const ks = v.creeps.filter(c => c.owner === '__keeper' && inR(c)), lairs = v.structures.filter(s => s.type === 'keeperLair' && inR(s)), srcs = v.sources.filter(inR), mins = v.minerals.filter(inR);
      return { k: ks.length, kv: ks.filter(c => sp(c.id)).length, l: lairs.length, lv: lairs.filter(s => sp(s.id)).length, s: srcs.length, sv: srcs.filter(s => sp(s.id)).length, m: mins.length, mv: mins.filter(s => sp(s.id)).length, lod: renderer.lod }; }, L.rk);
    ok(r2.lod === 'full', '手机竖屏整间房显示时用完整细节');
    ok(r2.k > 0 && r2.kv === r2.k && r2.l > 0 && r2.lv === r2.l && r2.s > 0 && r2.sv === r2.s && r2.mv === r2.m, `Keeper ${r2.kv}/${r2.k}、Lair ${r2.lv}/${r2.l}、能量源 ${r2.sv}/${r2.s}、矿物 ${r2.mv}/${r2.m} 都画出来`);
    const nv = await npcVisible(pg); ok(nv.n >= r2.k && nv.a > 1000, 'Keeper 贴图不透明且在画面上（' + nv.n + ' 个）');
    await pg.close(); }
  // 3. 自检：一张贴图加载失败时必须被检测到，且对象改画后备图形（Keeper 不依赖贴图）
  { const pg = await open('lab'); const r = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.translate(32, 32); g.scale(30, 30); ART.spec('lab', {}).draw(g); const d = g.getImageData(0, 0, 64, 64).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return { failed: ART.failed.slice(), a }; });
    ok(r.failed.length === 1 && r.failed[0] === 'lab', '贴图加载失败会被检测到（' + r.failed.join(',') + '）'); ok(r.a > 1000, '贴图失败时画后备图形，对象不会看不见'); await pg.close(); }
  await b.close(); srv.close(); if (fails) { console.error(fails + ' FAIL'); process.exit(1); } console.log('ALL PASS'); })().catch(e => { console.error(e); process.exit(1); });
