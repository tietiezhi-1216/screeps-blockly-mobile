// 无头：积木页布局（满屏、无滚动条、拖动平移、左上按钮、底部分类、空状态）+ 截图
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
const http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '../www'), FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
// 自带静态服务器（以前用固定端口，容易连到别的目录的旧版本）
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let PORT; const OUT = process.env.OUT || '/workspace/shots-editor'; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
async function run(b, vw, vh, tag) {
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.evaluateOnNewDocument(FS.install, FX); // 离线回放的私服（进游戏需要已连接）
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1200); for (let n = 0; n < 50 && !(await pg.evaluate(() => !!sess)); n++) await W(200); await pg.evaluate(() => $('sPlay').click()); await W(300);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); $('btnCode').click(); }); await W(500);
  const m = await pg.evaluate(() => { const R = e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const sb = [...document.querySelectorAll('.blocklyMainWorkspaceScrollbar')].filter(e => getComputedStyle(e).display !== 'none').length;
    const bs = [...document.querySelectorAll('#edTools button')].filter(b => b.offsetParent).map(R);
    const pr = document.createElement('div'); pr.style.cssText = 'position:fixed;top:var(--sfT);left:var(--sfL)'; document.body.appendChild(pr); const pb = pr.getBoundingClientRect(); pr.remove(); const sf = { t: Math.round(pb.top), l: Math.round(pb.left) };
    return { sf, head: R($('edHead')), blockly: R($('blocklyDiv')), tabs: R($('edTabs')), tools: R($('edTools')), btn: bs[0], gap: bs[1] ? bs[1][1] - bs[0][1] - bs[0][3] : 0, n: bs.length, cat: R(document.querySelector('#catBar .cat')), done: R($('edClose')), sb,
      border: getComputedStyle($('blocklyDiv')).borderTopWidth + '/' + getComputedStyle(document.querySelector('.injectionDiv')).outlineStyle }; });
  console.log(tag, JSON.stringify(m));
  ok(m.head[1] === 0 && m.head[0] === 0 && m.head[2] === vw && m.head[3] >= 44 + m.sf.t - 1, tag + ' 顶部主题色标题栏通栏（含安全区）'); ok(m.blockly[0] === 0 && m.blockly[2] === vw && m.blockly[1] === m.head[1] + m.head[3], tag + ' 工作区紧接标题栏、左右无边距');
  ok(m.sb === 0, tag + ' 工作区滚动条隐藏'); ok(m.tabs[1] + m.tabs[3] === vh, tag + ' 分类栏在最底部'); ok(m.tools[0] <= 8 + m.sf.l + 4 && m.tools[1] >= m.blockly[1] && m.tools[1] <= m.blockly[1] + 8 + 4, tag + ' 操作按钮在左上（避开顶部/左侧安全区）' + JSON.stringify(m.sf));
  const cr = await pg.evaluate(() => { const cb = $('catBar').getBoundingClientRect(), clip = r => r.left >= cb.left && r.right <= cb.right ? r : { left: Math.max(r.left, cb.left), right: Math.min(r.right, cb.right), bottom: r.bottom }; // 分类多时分类栏可横向滑动，只算看得见的部分
    const bs = [...document.querySelectorAll('#edTabs button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).map(r => r.left >= cb.right || r.right <= cb.left ? clip({ left: cb.left, right: cb.left, bottom: r.bottom }) : clip(r)), cs = getComputedStyle($('edTabs'));
    return { l: Math.min(...bs.map(r => r.left)), r: Math.max(...bs.map(r => r.right)), pb: parseFloat(cs.paddingBottom), bot: Math.max(...bs.map(r => r.bottom)) }; });
  ok(cr.l >= 16 && cr.r <= vw - 16 && cr.pb >= 12 && cr.bot <= vh - 12, tag + ' 分类栏两端避开圆角、底部抬离手势区 ' + JSON.stringify(cr));
  await pg.screenshot({ path: `${OUT}/editor-${tag}.png` });
  // 拖动平移
  // 入门程序较长：在整个可见区域里找一块空白
  const s0 = await pg.evaluate(() => [ws.scrollX, ws.scrollY]); const [cx, cy] = await pg.evaluate((vw, vh) => { for (let y = vh * 0.76; y > vh * 0.3; y -= 20) for (let x = vw * 0.9; x > vw * 0.3; x -= 20) { const e = document.elementFromPoint(x, y); if (e && e.classList.contains('blocklyMainBackground') && document.elementFromPoint(x - 90, y - 100)?.classList.contains('blocklyMainBackground')) return [x, y]; } return [vw * 0.6, vh * 0.45]; }, vw, vh);
  const c = await pg.target().createCDPSession(); const T = (type, x, y) => c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const empty = await pg.evaluate(() => { const t = ws.getTopBlocks(false); return t.length ? null : 1; });
  await T('touchStart', cx, cy); for (let i = 1; i <= 8; i++) { await T('touchMove', cx - i * 10, cy - i * 12); await W(30); } await T('touchEnd'); await W(200);
  const s1 = await pg.evaluate(() => [ws.scrollX, ws.scrollY]); ok(Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 20, tag + ' 拖动空白处可平移 @' + [cx, cy] + ' ' + s0 + '→' + s1 + (empty ? '' : ''));
  await pg.evaluate(() => { ws.clear(); }); await W(200);
  const e = await pg.evaluate(() => { const el = $('edEmpty'); return { vis: !el.classList.contains('hidden'), h: el.getBoundingClientRect().height, op: getComputedStyle(el).opacity, t: el.textContent }; });
  ok(e.vis && e.h <= 22, tag + ' 空状态只有一行淡字 ' + JSON.stringify(e)); await pg.screenshot({ path: `${OUT}/editor-${tag}-empty.png` }); await pg.close(); return m;
}
(async () => { await new Promise(r => srv.listen(0, '127.0.0.1', r)); PORT = srv.address().port; for (const [w, h, t] of [[915, 412, 'landscape'], [412, 915, 'portrait']]) { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); await run(b, w, h, t); await b.close(); } srv.close(); if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 积木页布局'); })();
