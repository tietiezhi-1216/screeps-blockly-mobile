const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots182b/';
async function run(b, vw, vh, tag, ins) { const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto('http://localhost:8795/index.html'); await W(1200); await pg.tap('#sPlay'); await W(500);
  await pg.evaluate((ins) => { for (const k in ins) document.documentElement.style.setProperty(k, ins[k]); document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); _snap = null; } catch (e) {} $('wmap').classList.add('hidden'); $('btnCode').click(); }, ins);
  await W(700); await pg.evaluate(() => { Blockly.svgResize(ws); ws.setScale(0.62); }); await W(300);
  await pg.screenshot({ path: O + tag + '-1-editor.png' });
  await pg.evaluate(() => selectCat('e_act')); await W(500); await pg.screenshot({ path: O + tag + '-2-category.png' });
  const geo = await pg.evaluate(() => { const r = id => { const x = $(id).getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.right), Math.round(x.bottom)]; }; closeFlyout(); return { tabs: r('edTabs'), undo: r('edUndo'), trash: r('edTrash') }; });
  await pg.close(); return { tag, errs, geo };
}
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const R = [await run(b, 915, 412, 'landscape', { '--nsal': '32px', '--nsab': '0px' }), await run(b, 412, 915, 'portrait', { '--nsat': '32px', '--nsab': '24px' })]; console.log(JSON.stringify(R)); await b.close(); })();
