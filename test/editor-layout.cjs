// 无头：积木页布局（满屏、无滚动条、拖动平移、左上按钮、底部分类、空状态）+ 截图
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 8795, OUT = process.env.OUT || '/workspace/shots-editor'; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
async function run(b, vw, vh, tag) {
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1200); await pg.evaluate(() => $('sPlay').click()); await W(300);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); $('btnCode').click(); }); await W(500);
  const m = await pg.evaluate(() => { const R = e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const sb = [...document.querySelectorAll('.blocklyMainWorkspaceScrollbar')].filter(e => getComputedStyle(e).display !== 'none').length;
    const bs = [...document.querySelectorAll('#edTools button')].filter(b => b.offsetParent).map(R);
    return { blockly: R($('blocklyDiv')), tabs: R($('edTabs')), tools: R($('edTools')), btn: bs[0], gap: bs[1] ? bs[1][1] - bs[0][1] - bs[0][3] : 0, n: bs.length, cat: R(document.querySelector('#catBar .cat')), done: R($('edClose')), sb,
      border: getComputedStyle($('blocklyDiv')).borderTopWidth + '/' + getComputedStyle(document.querySelector('.injectionDiv')).outlineStyle }; });
  console.log(tag, JSON.stringify(m));
  ok(m.blockly[0] === 0 && m.blockly[2] === vw && m.blockly[1] === 0, tag + ' 工作区满屏无边距');
  ok(m.sb === 0, tag + ' 工作区滚动条隐藏'); ok(m.tabs[1] + m.tabs[3] === vh, tag + ' 分类栏在最底部'); ok(m.tools[0] <= 12 && m.tools[1] <= 12, tag + ' 操作按钮在左上');
  await pg.screenshot({ path: `${OUT}/editor-${tag}.png` });
  // 拖动平移
  const s0 = await pg.evaluate(() => [ws.scrollX, ws.scrollY]); const [cx, cy] = await pg.evaluate((vw, vh) => { for (let y = vh * 0.76; y > vh * 0.3; y -= 20) for (let x = vw * 0.73; x > vw * 0.3; x -= 20) { const e = document.elementFromPoint(x, y); if (e && e.classList.contains('blocklyMainBackground') && document.elementFromPoint(x - 90, y - 100)?.classList.contains('blocklyMainBackground')) return [x, y]; } return [vw * 0.6, vh * 0.45]; }, vw, vh);
  const c = await pg.target().createCDPSession(); const T = (type, x, y) => c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const empty = await pg.evaluate(() => { const t = ws.getTopBlocks(false); return t.length ? null : 1; });
  await T('touchStart', cx, cy); for (let i = 1; i <= 8; i++) { await T('touchMove', cx - i * 10, cy - i * 12); await W(30); } await T('touchEnd'); await W(200);
  const s1 = await pg.evaluate(() => [ws.scrollX, ws.scrollY]); ok(Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 20, tag + ' 拖动空白处可平移 @' + [cx, cy] + ' ' + s0 + '→' + s1 + (empty ? '' : ''));
  await pg.evaluate(() => { ws.clear(); }); await W(200);
  const e = await pg.evaluate(() => { const el = $('edEmpty'); return { vis: !el.classList.contains('hidden'), h: el.getBoundingClientRect().height, op: getComputedStyle(el).opacity, t: el.textContent }; });
  ok(e.vis && e.h <= 22, tag + ' 空状态只有一行淡字 ' + JSON.stringify(e)); await pg.screenshot({ path: `${OUT}/editor-${tag}-empty.png` }); await pg.close(); return m;
}
(async () => { for (const [w, h, t] of [[915, 412, 'landscape'], [412, 915, 'portrait']]) { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); await run(b, w, h, t); await b.close(); } if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 积木页布局'); })();
