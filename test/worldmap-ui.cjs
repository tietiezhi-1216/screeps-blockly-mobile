// 无头：世界地图界面（选择出生房间 / 游戏内世界地图），官方服务器回放 + 私服回放，412×915 截图到 /workspace/shots-worldmap/
// 断言：视野里每个房间都画了地形缩略图（不再是纯色方块）；不画文字（无图例、无房间号）；放大后有资源标记；拖动懒加载；选中显示状态
const p = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const FS = require('./fake-server.js'), OFX = require('./fixtures/official.json'), PFX = require('./fixtures/pserver.json');
const ROOT = path.join(__dirname, '../www'), OUT = process.env.OUT || '/workspace/shots-worldmap', W = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0, PORT; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
// 截图像素分析（截图是 data: URL，画到画布上不受跨域限制）：每个房间格子里颜色的种类数
async function roomCells(pg) {
  const shot = await pg.screenshot({ encoding: 'base64' });
  return pg.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = img.width / innerWidth, G = wm.geo, cr = $('wmCanvas').getBoundingClientRect(), out = [];
    for (const n of visibleRooms(G, cr.width, cr.height, 0)) { const [X, Y] = parseRealName(n); if (!wm.data.inBounds(X, Y)) continue; const x = cr.left + G.ox + X * G.cs, y = cr.top + G.oy + Y * G.cs;
      if (x < cr.left || y < cr.top || x + G.cs > cr.right || y + G.cs > cr.bottom) continue; // 只看完整在画面里的
      const d = g.getImageData(Math.round((x + 2) * k), Math.round((y + 2) * k), Math.max(1, Math.round((G.cs - 4) * k)), Math.max(1, Math.round((G.cs - 4) * k))).data, cols = new Set(); let yel = 0;
      for (let i = 0; i < d.length; i += 4) { cols.add(d[i] >> 3 << 10 | d[i + 1] >> 3 << 5 | d[i + 2] >> 3); if (d[i] > 100 && d[i + 1] > 85 && d[i + 2] < d[i] * 0.6 && Math.abs(d[i] - d[i + 1]) < 50) yel++; }
      out.push({ n, cols: cols.size, yel, st: wm.data.status(n, myPid) }); }
    return out; }, shot);
}
async function boot(b, kind, vw = 412, vh = 915) {
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o);
    window.__ft = 0; const T = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (...a) { if (this.canvas && this.canvas.id === 'wmCanvas') window.__ft++; return T.apply(this, a); }; });
  let cdn = null;
  if (kind === 'official') { await pg.evaluateOnNewDocument(FS.installOfficial, OFX, FS.officialFns); cdn = await FS.officialCdn(pg, OFX); }
  else await pg.evaluateOnNewDocument(FS.install, PFX);
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1000);
  for (let i = 0; i < 60 && !(await pg.evaluate(() => !!sess && !!sess.me)); i++) await W(200);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); if (window.Shell && Shell.hide) Shell.hide(); });
  return { pg, cdn };
}
const reqs = (pg, p0) => pg.evaluate(p => window.__req.filter(r => r.p === p), p0);
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); PORT = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    // ===== 官方：选择出生房间 =====
    { const { pg, cdn } = await boot(b, 'official');
      await pg.evaluate(() => openWorldMap(true)); await W(1500);
      const t = await pg.evaluate(() => $('wmTitle').textContent); ok(t === '选择出生房间', '标题：' + t);
      const inFx = c => !!OFX.png[c.n]; let cells = (await roomCells(pg)).filter(inFx); const textured = cells.filter(c => c.cols >= 2);
      ok(cells.length >= 80 && textured.length >= cells.length * 0.95, `官方：视野内 ${cells.length} 间房，${textured.length} 间画出了地形（不再是纯色方块）`);
      ok(cdn.length >= cells.length, `地形来自官方地图 CDN 缩略图（${cdn.length} 张）`);
      ok((await pg.evaluate(() => window.__ft)) === 0, '地图上不画任何文字（无图例、无房间号）');
      const ms = await reqs(pg, '/api/game/map-stats'); ok(ms.length >= 1 && ms.every(r => r.body.statName === 'owner0' && r.body.shard === 'shard3'), `map-stats ${ms.length} 次（owner0 + shard3）`);
      await pg.screenshot({ path: path.join(OUT, 'official-pick.png') });
      // 选中：可出生 / 被占领
      const sel = async st => pg.evaluate(st => { const n = visibleRooms(wm.geo, innerWidth, innerHeight, 0).find(q => wm.data.status(q, myPid) === st); if (!n) return null; const [X, Y] = parseRealName(n), r = $('wmCanvas').getBoundingClientRect();
        $('wmCanvas').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + wm.geo.ox + (X + .5) * wm.geo.cs, clientY: r.top + wm.geo.oy + (Y + .5) * wm.geo.cs })); return { n, name: $('wmSelName').textContent, st: $('wmSelSt').textContent, go: !$('wmGo').disabled }; }, st);
      const f = await sel('free'); ok(f && f.name === f.n && /可出生/.test(f.st) && f.go, `选中可出生房间：${f && f.name} ${f && f.st}`);
      const o = await sel('owned'); ok(o && /已被 .+ 占领/.test(o.st) && !o.go, `选中被占领房间：${o && o.name} ${o && o.st}`);
      const rs = await sel('reserved'); ok(rs && /预定/.test(rs.st) && !rs.go, `选中被预定房间：${rs && rs.name} ${rs && rs.st}`);
      await pg.screenshot({ path: path.join(OUT, 'official-select.png') });
      // 放大：订阅 roomMap2，画能量源等标记
      await pg.evaluate(() => { wm.cs = wm.fit * 2.6; wm.sel = null; wmShowSel(); drawWorldMap(); }); await W(1800); await pg.evaluate(() => drawWorldMap()); await W(300);
      const sub = await pg.evaluate(() => wm.data.subs.size); ok(sub > 0 && sub <= 49, `放大后订阅视野内 roomMap2（${sub} 个）`);
      cells = (await roomCells(pg)).filter(inFx); const hasS = c => { const d = OFX.ws['roomMap2:shard3/' + c.n]; return d && d[0] && (d[0].s || []).length; }; cells = cells.filter(hasS); const yel = cells.filter(c => c.yel > 0).length; ok(cells.length >= 5 && yel >= cells.length * 0.9, `放大后 ${yel}/${cells.length} 间房画出了能量源（黄点）`);
      await pg.screenshot({ path: path.join(OUT, 'official-zoom.png') });
      // 拖动：新进视野的房间才请求
      const ms0 = (await reqs(pg, '/api/game/map-stats')).length, c0 = cdn.length;
      await await pg.evaluate(() => { wm.cs = wm.fit; drawWorldMap(); return [wm.cx, wm.cy]; }); await W(400);
      const c = await pg.evaluate(() => { const r = $('wmCanvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await pg.touchscreen.touchStart(c[0], c[1]); for (let i = 1; i <= 10; i++) { await pg.touchscreen.touchMove(c[0] - i * 30, c[1] - i * 20); await W(16); } await pg.touchscreen.touchEnd(); await W(12000);
      const ms1 = (await reqs(pg, '/api/game/map-stats')).slice(ms0); ok(ms1.length >= 1 && ms1.length <= 2, `拖动后补 ${ms1.length} 次 map-stats（${ms1.reduce((a, r) => a + r.body.rooms.length, 0)} 间新房）`);
      ok(cdn.length > c0, `拖动后懒加载新缩略图 ${cdn.length - c0} 张`);
      cells = (await roomCells(pg)).filter(inFx); ok(cells.filter(c => c.cols >= 2).length >= cells.length * 0.95, `拖动后视野内 ${cells.length} 间房都有地形`);
      await pg.screenshot({ path: path.join(OUT, 'official-pan.png') });
      await pg.evaluate(() => $('wmClose').click()); await W(200);
      ok((await pg.evaluate(() => wm.data.subs.size)) === 0, '关闭地图后退订 roomMap2');
      // 游戏内世界地图（同一套绘制）
      await pg.evaluate(() => openWorldMap(false)); await W(1200);
      cells = (await roomCells(pg)).filter(inFx); ok((await pg.evaluate(() => $('wmTitle').textContent)) === '世界地图' && cells.filter(c => c.cols >= 2).length >= cells.length * 0.95, `游戏内世界地图：${cells.length} 间房都有地形`);
      await pg.screenshot({ path: path.join(OUT, 'official-worldmap.png') });
      await pg.close(); }
    // ===== 私服 =====
    { const { pg } = await boot(b, 'private');
      await pg.evaluate(() => openWorldMap(true)); await W(1200);
      const cells = await roomCells(pg); ok(cells.length >= 30 && cells.filter(c => c.cols >= 2).length === cells.length, `私服：${cells.length} 间房都有地形 ${JSON.stringify(cells.filter(c => c.cols < 2))}`);
      ok((await pg.evaluate(() => window.__ft)) === 0, '私服地图也不画文字');
      await pg.screenshot({ path: path.join(OUT, 'private-pick.png') });
      await pg.evaluate(() => { wm.cs = wm.fit * 2.5; const [X, Y] = parseRealName(sess.home); wm.cx = X + .5; wm.cy = Y + .5; drawWorldMap(); }); await W(1500); await pg.evaluate(() => drawWorldMap()); await W(300);
      await pg.screenshot({ path: path.join(OUT, 'private-zoom.png') });
      await pg.close(); }
  } catch (e) { console.error(e); fails++; }
  await b.close(); srv.close(); if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 世界地图界面'); process.exit(0);
})();
