// 无头测试：从全屏积木列表长按拖出，积木落在手指下并全程跟手（横屏 + 竖屏）
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
const http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '../www'), FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let PORT;
async function run(b, vw, vh) {
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.evaluateOnNewDocument(FS.install, FX); // 离线回放的私服（进游戏需要已连接）
  await pg.goto('http://localhost:' + PORT + '/index.html'); await W(1200); for (let n = 0; n < 50 && !(await pg.evaluate(() => !!sess)); n++) await W(200); await pg.tap('#sPlay'); await W(300);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); $('btnCode').click(); ws.clear(); ws.setScale(1.1); ws.scroll(-137, -59); }); await W(400);
  await pg.evaluate(() => selectCat(CATS[1].id)); await W(600);
  const r = await pg.evaluate(() => { const b = fly.getWorkspace().getTopBlocks(true)[0]; const e = b.getSvgRoot().getBoundingClientRect(); return { x: e.left + 12, y: e.top + 10, ox: 12, oy: 10 }; });
  const s = await pg.target().createCDPSession(); const T = (type, x, y) => s.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await T('touchStart', r.x, r.y); await W(600); const path = []; let maxErr = 0; const N = 12, tx = vw * 0.45, ty = vh * 0.55;
  for (let i = 1; i <= N; i++) { const x = r.x + (tx - r.x) * i / N, y = r.y + (ty - r.y) * i / N; await T('touchMove', x, y); await W(40);
    const q = await pg.evaluate(() => { const s = Blockly.getSelected && Blockly.getSelected(); if (!s || s.workspace !== ws) return null; const e = s.getSvgRoot().getBoundingClientRect(); return [e.left, e.top]; });
    if (q && i > 2) { const err = Math.hypot(q[0] + r.ox - x, q[1] + r.oy - y); maxErr = Math.max(maxErr, err); path.push(Math.round(err)); } }
  await T('touchEnd'); await W(400);
  const fin = await pg.evaluate(() => { const s = Blockly.getSelected && Blockly.getSelected(); if (!s) return null; const e = s.getSvgRoot().getBoundingClientRect(); return [e.left, e.top, fly.isVisible()]; });
  await pg.screenshot({ path: `/workspace/shots180/drag-${vw > vh ? 'landscape' : 'portrait'}.png` }); await pg.close();
  const endErr = fin ? Math.hypot(fin[0] + r.ox - tx, fin[1] + r.oy - ty) : 999;
  return { vw, vh, maxErr: Math.round(maxErr), endErr: Math.round(endErr), path, flyOpen: fin && fin[2] };
}
(async () => { await new Promise(r => srv.listen(0, r)); PORT = srv.address().port; const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const R = [await run(b, 915, 412), await run(b, 412, 915)]; console.log(JSON.stringify(R)); await b.close(); srv.close();
  const bad = R.filter(x => x.maxErr > 30 || x.endErr > 30); if (bad.length) { console.log('FAIL 积木没有跟手'); process.exit(1); } console.log('ok - 拖出积木落在手指下并跟手'); })();
