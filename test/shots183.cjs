// 关于页截图：初始 / 检查中 / 已是最新 / 有新版本弹窗
const NOTES = require('fs').readFileSync('/workspace/rel182/notes.md', 'utf8');
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots183/';
async function run(b, vw, vh, tag, mode) { const errs = []; const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument((mode, NOTES) => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => { if (!String(u).includes('api.github.com')) return F(u, o);
    return new Promise(r => setTimeout(() => r(new Response(JSON.stringify({ tag_name: mode === 'new' ? 'v9.9.9' : 'v0.0.1', body: NOTES, assets: [{ name: 'a.apk', browser_download_url: 'x', size: 9123456 }] }), { status: 200 })), 1500)); }; }, mode, NOTES);
  await pg.goto('http://localhost:8781/index.html'); await W(1200);
  await pg.evaluate(() => document.querySelector('[data-act="go:about"]').click()); await W(400);
  if (mode === 'latest') await pg.screenshot({ path: O + tag + '-1-about.png' });
  await pg.evaluate(() => document.querySelector('[data-act="chkUpd"]').click()); await W(500);
  if (mode === 'latest') await pg.screenshot({ path: O + tag + '-2-checking.png' });
  await W(1500); await pg.screenshot({ path: O + tag + (mode === 'latest' ? '-3-latest.png' : '-4-new-popup.png') });
  if (mode === 'new') { await pg.evaluate(() => Upd.ui_.downloading(3.4 * 1048576, 9123456)); await pg.screenshot({ path: O + tag + '-5-downloading.png' });
    await pg.evaluate(() => Upd.ui_.install('下载完成，已校验 SHA-256')); await pg.screenshot({ path: O + tag + '-6-install.png' });
    await pg.evaluate(() => Upd.ui_.error('下载失败：网络连接中断')); await pg.screenshot({ path: O + tag + '-7-error.png' }); await pg.evaluate(() => Upd.ui_.hide()); }
  const v = await pg.evaluate(() => document.querySelector('[data-act="chkUpd"] .v').textContent); await pg.close(); return { tag, mode, v, errs };
}
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = [];
  for (const [w, h, t] of [[412, 915, 'portrait'], [915, 412, 'landscape']]) for (const m of ['latest', 'new']) R.push(await run(b, w, h, t, m));
  console.log(JSON.stringify(R)); await b.close(); })();
