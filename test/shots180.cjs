// v1.8.0 截图：右侧工具栏 / 右侧面板 / 精简 HUD / 全局信息 / 关于 / 更新弹窗
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots180/';
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.resolve(new Response(JSON.stringify({ tag_name: 'v9.9.9', body: '测试更新说明\nSHA-256: ' + 'a'.repeat(64), assets: [{ name: 'x.apk', size: 9e6, browser_download_url: 'about:blank' }] }))) : F(u, o); localStorage.setItem('sbm_intro', '1'); });
  await pg.goto('http://localhost:8781/index.html'); await W(1500);
  await pg.evaluate(() => document.documentElement.style.setProperty('--nsal', '32px'));
  await pg.tap('#sPlay'); await W(500);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); engine.placeSpawn(myPid); _snap = null; $('wmap').classList.add('hidden'); const sp = engine.w.spawns.find(s => s.owner === myPid); renderer.setView(engine.w, 300); gotoRoom(Math.floor(sp.x / ROOM), Math.floor(sp.y / ROOM)); });
  await W(1200); await pg.screenshot({ path: O + '1-room-right-toolbar.png' });
  await pg.evaluate(() => { infoRoom = null; openPanel('room'); }); await W(500); await pg.screenshot({ path: O + '2-room-info-right.png' });
  await pg.evaluate(() => openPanel('global')); await W(500); await pg.screenshot({ path: O + '3-global-info.png' });
  await pg.evaluate(() => { $('panel').classList.add('hidden'); $('btnBuild').click(); }); await W(500); await pg.screenshot({ path: O + '4-build-list-right.png' });
  await pg.evaluate(() => { $('buildPick').classList.add('hidden'); $('btnView').click(); }); await W(900); await pg.screenshot({ path: O + '5-world-view.png' });
  console.log(await pg.evaluate(async () => { await checkUpdate(false); return [!!Upd.el, String(window.UPDATE_REL && UPDATE_REL.tag_name), checkUpdate.shown]; })); await W(600); await pg.screenshot({ path: O + '6-update-popup.png' });
  await pg.evaluate(() => { Upd.el.classList.add('hidden'); Shell.show('about'); }); await W(500); await pg.screenshot({ path: O + '7-about.png' });
  await pg.evaluate(() => Shell.show('settings')); await W(500); await pg.screenshot({ path: O + '8-settings.png', fullPage: true });
  console.log(JSON.stringify({ errs })); await b.close();
})();
