// 外壳页面截图：412x915，竖屏触摸。node test/shell-ui.cjs [port]
const p = require('puppeteer-core'), port = process.argv[2] || 8766, sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); });
  await pg.goto(`http://localhost:${port}/index.html`); await sleep(1500);
  const shot = async n => { await sleep(250); await pg.screenshot({ path: `/workspace/shots/shell-${n}.png` }); };
  const act = a => pg.evaluate(a => document.querySelector(`#start [data-act="${a}"]`).click(), a);
  await shot('home');
  // 跑一会儿产生统计
  await act('play'); await pg.evaluate(() => { running = true; speed = 8; setRunUI(); }); await sleep(6000); await shot('game');
  await pg.evaluate(() => $('btnMenu').click()); await act('go:profile'); await shot('profile');
  await act('go:badge'); await pg.evaluate(() => { document.querySelector('[data-t="quad"]').click(); }); await pg.evaluate(() => document.querySelector('[data-k="c2"][data-c="#87bdee"]').click()); await shot('badge'); await act('bsave');
  await act('editName'); await pg.evaluate(() => { document.querySelector('.shDlg input').value = 'TieTie'; document.querySelector('.shDlg [data-r="1"]').click(); });
  await act('go:stats'); await shot('stats'); await act('back');
  await act('go:worlds'); await act('wSave'); await pg.evaluate(() => document.querySelector('.shDlg [data-r="1"]').click()); await shot('worlds');
  await act('wExport'); await shot('export'); await pg.evaluate(() => document.querySelector('.shDlg [data-r="0"]').click()); await act('back');
  await act('go:snippets'); await act('snSave'); await pg.evaluate(() => document.querySelector('.shDlg [data-r="1"]').click()); await shot('snippets'); await act('back'); await act('back');
  await act('go:settings'); await shot('settings'); await act('back');
  await act('go:about'); await shot('about'); await act('back');
  await shot('home-after');
  await act('net'); await shot('net');
  const ov = await pg.evaluate(() => [...document.querySelectorAll('#start *, #net *')].filter(e => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').map(e => e.textContent.slice(0, 20)));
  console.log('stats', await pg.evaluate(() => Stats.get()), 'overflow', ov, 'errors', errs);
  await b.close();
})();
