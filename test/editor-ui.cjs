// 竖屏 412x915 触摸：全屏积木列表（点击添加 / 长按拖出 / 返回 / 安卓返回键）、工作区平移捏合、垃圾桶、夜间模式
const p = require('puppeteer-core');
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('offline test')) : F(u, o); localStorage.setItem('sbm_intro', '1'); localStorage.setItem('sbm_ed_dark', '0'); });
  await pg.goto('http://localhost:8765/index.html'); await W(1500); 
  await pg.evaluate(() => { document.querySelectorAll('#start,#intro').forEach(e => e.style.display = 'none'); document.getElementById('btnCode').click(); });
  await W(400);
  const cdp = await pg.target().createCDPSession();
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const n = () => pg.evaluate(() => ws.getAllBlocks(false).length);
  const vis = () => pg.evaluate(() => fly.isVisible());
  const firstBlock = () => pg.evaluate(() => { const r = fly.getWorkspace().getTopBlocks(true)[0].getSvgRoot().getBoundingClientRect(); return { x: r.x + 30, y: r.y + 14, w: r.width, right: r.right }; });
  const ids = await pg.evaluate(() => CATS.map(c => c.id)); const out = []; let allOk = true;
  for (const id of (process.env.QUICK ? ['game'] : ids)) {
    const open = async () => { if (await vis()) { console.log("STILL OPEN before open", id); await pg.evaluate(() => closeFlyout()); await W(100); } await (await pg.$(`#catBar [data-cat="${id}"]`)).tap(); await W(300); };
    await open();
    const fullW = await pg.evaluate(() => { const r = document.querySelector('.blocklyFlyout').getBoundingClientRect(); return Math.round(r.width); });
    const fit = await pg.evaluate(() => { const W = document.querySelector('.blocklyFlyout').getBoundingClientRect().right; return fly.getWorkspace().getTopBlocks(false).every(b => b.getSvgRoot().getBoundingClientRect().right <= W + 1); });
    if (id === 'creep' || id === 'logic') await pg.screenshot({ path: `/workspace/shots/list-${id}-light.png` });
    // 长按拖出
    let q = await firstBlock(), b0 = await n();
    await T('touchStart', [[q.x, q.y]]); await W(600);
    const tx = 200, ty = 500;
    for (let i = 1; i <= 12; i++) await T('touchMove', [[q.x + (tx - q.x) * i / 12, q.y + (ty - q.y) * i / 12]]);
    const closedDuring = !(await vis());
    await T('touchEnd', []); await W(300);
    const drag = (await n()) - b0;
    // 点击添加
    await open(); q = await firstBlock(); b0 = await n(); await pg.touchscreen.tap(q.x, q.y); await W(300);
    const tap = (await n()) - b0, tapClosed = !(await vis());
    // 在积木上竖向滑动 = 滚动列表，不拖出
    await open(); q = await firstBlock(); b0 = await n(); const sy0 = await pg.evaluate(() => fly.getWorkspace().scrollY);
    await T('touchStart', [[q.x, q.y + 300]]); for (let i = 1; i <= 8; i++) await T('touchMove', [[q.x + i, q.y + 300 - i * 25]]); await T('touchEnd', []); await W(200);
    const swipeNoAdd = (await n()) === b0 && await vis();
    if (!swipeNoAdd) console.log('swipe', id, await n() - b0, await vis());
    // 返回按钮 / 安卓返回键（history.back）
    await open(); await pg.tap('#flyBack'); await W(200); const backBtn = !(await vis());
    await open(); await pg.evaluate(() => history.back()); await W(300); const backKey = !(await vis());
    const ok = fullW > 400 && fit && drag > 0 && closedDuring && swipeNoAdd && tap > 0 && tapClosed && backBtn && backKey; allOk = allOk && ok;
    out.push({ id, fullW, fit, drag, closedDuring, swipeNoAdd, tap, backBtn, backKey, ok });
    if (!(await pg.evaluate(() => !document.getElementById('editor').classList.contains('hidden')))) await pg.evaluate(() => document.getElementById('btnCode').click());
  }
  console.table(out);
  // 平移 / 捏合
  await pg.evaluate(() => { closeFlyout(); ws.setScale(0.8); });
  const empty = await pg.evaluate(() => { for (let y = 860; y > 120; y -= 20) for (let x = 330; x > 40; x -= 20) { const e = document.elementFromPoint(x, y); if (e && e.classList && e.classList.contains('blocklyMainBackground')) return [x, y]; } return null; });
  const s0 = await pg.evaluate(() => [ws.scrollX, ws.scrollY]);
  await T('touchStart', [empty]); for (let i = 1; i <= 10; i++) await T('touchMove', [[empty[0] - i * 8, empty[1] - i * 12]]); await T('touchEnd', []);
  const s1 = await pg.evaluate(() => [ws.scrollX, ws.scrollY, ws.scale]);
  await T('touchStart', [[150, 500], [260, 500]]); for (let i = 1; i <= 10; i++) await T('touchMove', [[150 - i * 6, 500], [260 + i * 6, 500]]); await T('touchEnd', []);
  const s2 = await pg.evaluate(() => ws.scale);
  const pan = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 30, pinch = s2 > s1[2] + 0.05;
  console.log('PAN', pan ? 'OK' : 'FAIL', 'PINCH', pinch ? 'OK' : 'FAIL', s1, s2, empty);
  // 垃圾桶
  await pg.evaluate(() => { ws.setScale(0.8); ws.centerOnBlock(ws.getTopBlocks(true).slice(-1)[0].id); });
  const tb = await pg.evaluate(() => { const b = ws.getTopBlocks(true).map(b => b.getSvgRoot().getBoundingClientRect()).find(r => r.x > 20 && r.x < 300 && r.y > 60 && r.y < 800); const t = document.getElementById('edTrash').getBoundingClientRect(); return b && { x: b.x + 8, y: b.y + 8, tx: t.x + 16, ty: t.y + 16 }; });
  const c0 = await n(); await T('touchStart', [[tb.x, tb.y]]); for (let i = 1; i <= 12; i++) await T('touchMove', [[tb.x + (tb.tx - tb.x) * i / 12, tb.y + (tb.ty - tb.y) * i / 12]]); await T('touchEnd', []); await W(300);
  const trash = (await n()) < c0; console.log('TRASH', trash ? 'OK' : 'FAIL');
  await pg.evaluate(() => { closeFlyout(); ws.setScale(0.7); ws.scrollCenter(); }); await W(200);
  await pg.screenshot({ path: '/workspace/shots/workspace-light.png' });
  // 夜间模式
  await pg.evaluate(() => setEdDark(true)); await W(200);
  const dark = await pg.evaluate(() => ws.getTheme().name + ' ' + getComputedStyle(document.getElementById('editor')).backgroundColor);
  await pg.screenshot({ path: '/workspace/shots/workspace-dark.png' });
  await (await pg.$('#catBar [data-cat="creep"]')).tap(); await W(300); await pg.screenshot({ path: '/workspace/shots/list-creep-dark.png' });
  await (await pg.$('#flyBack')).tap(); await W(200);
  await (await pg.$('#catBar [data-cat="logic"]')).tap(); await W(300); await pg.screenshot({ path: '/workspace/shots/list-logic-dark.png' });
  console.log('DARK', dark, errs);
  const pass = allOk && pan && pinch && trash && /sbmdark/i.test(dark) && !errs.length;
  console.log(pass ? 'EDITOR UI PASS' : 'EDITOR UI FAIL'); await b.close(); process.exit(pass ? 0 : 1);
})();
