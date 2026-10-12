// 截图：竖屏 412x915 与横屏 915x412 —— 底栏、运行长按速度菜单、设置页、全屏积木列表（浅/深）、工作区（深）
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  for (const [tag, w, h] of [['portrait', 412, 915], ['landscape', 915, 412]]) {
    const ctx = await b.createBrowserContext(); const pg = await ctx.newPage(); await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
    await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('offline test')) : F(u, o); localStorage.setItem('sbm_intro', '1'); });
    await pg.goto('http://localhost:8765/index.html'); await W(1500); 
    await pg.tap('#sPlay'); await W(500); await pg.evaluate(() => { document.getElementById('introOk')?.click(); document.querySelectorAll('.shDlg').forEach(d => d.remove()); engine.placeSpawn(myPid); _snap = null; $('wmap').classList.add('hidden'); }); await W(300);
    const bar = await pg.evaluate(() => [...document.querySelectorAll('#bar button')].filter(b => b.offsetParent).map(b => b.textContent.trim()));
    await pg.screenshot({ path: `/workspace/shots/${tag}-toolbar.png` });
    const r = await pg.evaluate(() => { const q = document.getElementById('btnRun').getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; });
    const cdp = await pg.target().createCDPSession(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r[0], y: r[1] }] }); await W(700); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await W(200); const pop = await pg.evaluate(() => !document.getElementById('speedPop').classList.contains('hidden'));
    await pg.screenshot({ path: `/workspace/shots/${tag}-speed-popup.png` });
    await pg.tap('#speedPop [data-v="4"]'); await W(100); const sp = await pg.evaluate(() => speed);
    await pg.evaluate(() => Shell.show('settings')); await W(300); await pg.screenshot({ path: `/workspace/shots/${tag}-settings.png` });
    await pg.evaluate(() => { Shell.hide(); setEdDark(false); document.getElementById('btnCode').click(); }); await W(400);
    await pg.evaluate(() => selectCat('creep')); await W(300); await pg.screenshot({ path: `/workspace/shots/${tag}-list-light.png` });
    await pg.evaluate(() => { closeFlyout(); setEdDark(true); selectCat('logic'); }); await W(300); await pg.screenshot({ path: `/workspace/shots/${tag}-list-dark.png` });
    await pg.evaluate(() => { closeFlyout(); ws.setScale(0.7); ws.scrollCenter(); }); await W(300); await pg.screenshot({ path: `/workspace/shots/${tag}-workspace-dark.png` });
    console.log(tag, JSON.stringify({ bar, speedPopup: pop, speedAfterPick: sp }));
    await ctx.close();
  }
  console.log('errors', errs); await b.close();
})();
