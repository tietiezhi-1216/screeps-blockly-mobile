// 竖屏 412x915 触摸：逐个分类打开、拖入、点击添加、收起，截图到 /workspace/shots
const p = require('puppeteer-core');
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); });
  await pg.goto('http://localhost:8765/index.html'); await new Promise(r => setTimeout(r, 1200));
  await pg.evaluate(() => { document.querySelectorAll('#start,#intro').forEach(e => e.style.display = 'none'); document.getElementById('btnCode').click(); });
  await new Promise(r => setTimeout(r, 400));
  await pg.evaluate(()=>{window.__sc=[];const o=selectCat;selectCat=(i)=>{__sc.push(i+':'+fly.isVisible());o(i)};});
  const n = () => pg.evaluate(() => ws.getAllBlocks(false).length);
  const ids = await pg.evaluate(() => CATS.map(c => c.id)); const out = [];
  for (const id of ids) {
    const btn = await pg.$(`#catBar [data-cat="${id}"]`); await btn.tap(); await new Promise(r => setTimeout(r, 300));
    const st = await pg.evaluate(() => { const r = fly.svgGroup_ ? fly.svgGroup_.getBoundingClientRect() : document.querySelector('.blocklyFlyout').getBoundingClientRect(); const bl = fly.getWorkspace().getTopBlocks(false).map(b => { const q = b.getSvgRoot().getBoundingClientRect(); return { x: q.x + 30, y: q.y + 16, w: q.width }; }).filter(q => q.x < 400); return { vis: fly.isVisible(), top: r.top, h: r.height, bl }; });
    await pg.screenshot({ path: `/workspace/shots/cat-${id}.png` });
    const before = await n(); let drag = 'n/a', tap = 'n/a';
    if (st.bl.length) {
      const q = st.bl[0];
      await pg.touchscreen.touchStart(q.x, q.y);
      for (let i = 1; i <= 10; i++) await pg.touchscreen.touchMove(q.x + i * 25, q.y + i * 3);
      await pg.touchscreen.touchEnd(); await new Promise(r => setTimeout(r, 300));
      drag = (await n()) - before; const closed = !(await pg.evaluate(() => fly.isVisible()));
      await btn.tap(); await new Promise(r => setTimeout(r, 300));
      const q2 = (await pg.evaluate(() => fly.getWorkspace().getTopBlocks(false).map(b => { const r = b.getSvgRoot().getBoundingClientRect(); return { x: r.x + 30, y: r.y + 16 }; })))[0];
      const b2 = await n(); const vis2 = await pg.evaluate((x,y)=>fly.isVisible()+':'+(document.elementFromPoint(x,y)||{}).tagName, q2.x, q2.y); await pg.touchscreen.tap(q2.x, q2.y); await new Promise(r => setTimeout(r, 300));
      tap = (await n()) - b2; drag += closed ? ' (closed)' : ' (OPEN)';
      tap += (await pg.evaluate(() => fly.isVisible())) ? ' (OPEN)' : ' (closed)';
    }
    // reopen + tap active chip to close
    await btn.tap(); await new Promise(r => setTimeout(r, 200)); await btn.tap(); await new Promise(r => setTimeout(r, 200));
    const toggled = !(await pg.evaluate(() => fly.isVisible()));
    out.push({ id, flyTop: Math.round(st.top), flyH: Math.round(st.h), drag, tap, toggleClose: toggled });
  }
  // 平移：单指在空白处拖动；缩放：双指捏合（CDP 真实触摸事件）
  const cdp = await pg.target().createCDPSession();
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const empty = await pg.evaluate(() => { for (let y = 860; y > 120; y -= 20) for (let x = 380; x > 40; x -= 20) { const e = document.elementFromPoint(x, y); if (e && e.classList && e.classList.contains('blocklyMainBackground')) return [x, y]; } return null; });
  const s0 = await pg.evaluate(() => [ws.scrollX, ws.scrollY, ws.scale]);
  if (empty) { await T('touchStart', [empty]); for (let i = 1; i <= 10; i++) await T('touchMove', [[empty[0] - i * 8, empty[1] - i * 12]]); await T('touchEnd', []); }
  const s1 = await pg.evaluate(() => [ws.scrollX, ws.scrollY, ws.scale]);
  await T('touchStart', [[150, 500], [260, 500]]); for (let i = 1; i <= 10; i++) await T('touchMove', [[150 - i * 6, 500], [260 + i * 6, 500]]); await T('touchEnd', []);
  const s2 = await pg.evaluate(() => [ws.scrollX, ws.scrollY, ws.scale]);
  const pan = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 30, pinch = s2[2] > s1[2] + 0.05;
  console.log('PAN', pan ? 'OK' : 'FAIL', s0, s1, 'PINCH', pinch ? 'OK' : 'FAIL', s2);
  // 拖到垃圾桶删除
  await pg.evaluate(() => { ws.setScale(0.8); const tbk = ws.getTopBlocks(true).slice(-1)[0]; ws.centerOnBlock(tbk.id); });
  const tb = await pg.evaluate(() => { const b = ws.getTopBlocks(true).map(b => b.getSvgRoot().getBoundingClientRect()).find(r => r.x > 20 && r.x < 300 && r.y > 60 && r.y < 800); const t = document.getElementById('edTrash').getBoundingClientRect(); return b && { x: b.x + 8, y: b.y + 8, tx: t.x + 16, ty: t.y + 16 }; });
  if (tb) { const c0 = await n(); await T('touchStart', [[tb.x, tb.y]]); for (let i = 1; i <= 12; i++) await T('touchMove', [[tb.x + (tb.tx - tb.x) * i / 12, tb.y + (tb.ty - tb.y) * i / 12]]); await T('touchEnd', []); await new Promise(r => setTimeout(r, 300)); console.log('TRASH', (await n()) < c0 ? 'OK' : 'FAIL'); }
  await pg.screenshot({ path: '/workspace/shots/workspace-after.png' });
  await (await pg.$('#catBar [data-cat="creep"]')).tap(); await new Promise(r => setTimeout(r, 300));
  await pg.screenshot({ path: '/workspace/shots/flyout-creep-open.png' });
  await (await pg.$('#catBar [data-cat="creep"]')).tap(); await new Promise(r => setTimeout(r, 300)); await pg.evaluate(() => ws.setScale(0.8)); await pg.screenshot({ path: '/workspace/shots/editor-closed.png' });
  const ui = await pg.evaluate(() => { const g = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }; return { trash: g('#edTrash'), zoomIn: g('#edZin'), flyout: g('.blocklyFlyout') }; });
  console.table(out); console.log(ui, errs); await b.close();
})();
