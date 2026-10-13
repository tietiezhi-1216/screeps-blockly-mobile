// 新手积木截图：默认程序 / 分类列表 / 身体部件表单 / 预览说明 / 预览代码 / 高级（横屏 + 竖屏）
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots-blocks/';
const PORT = process.env.PORT || 8790;
async function run(b, vw, vh, tag) { const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1200); await pg.tap('#sPlay'); await W(500);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); _snap = null; } catch (e) {} $('wmap').classList.add('hidden'); $('btnCode').click(); });
  await W(600); await pg.evaluate(() => { ws.setScale(0.62); ws.scroll(20, 20); }); await W(300);
  await pg.screenshot({ path: O + tag + '-1-starter.png' });
  await pg.evaluate(() => selectCat('e_act')); await W(500); await pg.screenshot({ path: O + tag + '-2-actions.png' });
  await pg.evaluate(() => selectCat('e_spawn')); await W(500); await pg.screenshot({ path: O + tag + '-3-spawn-cat.png' });
  await pg.evaluate(() => { closeFlyout(); const k = ws.getAllBlocks(false).find(b => b.type === 'e_keep'); k.getField('BODY').showEditor_(); }); await W(300);
  await pg.evaluate(() => { document.querySelector('#bodyForm .bfP[data-p="work"]').click(); document.querySelector('#bodyForm .bfP[data-p="move"]').click(); }); await W(200);
  await pg.screenshot({ path: O + tag + '-4-body-form.png' });
  await pg.evaluate(() => document.querySelector('#bodyForm [data-a="ok"]').click()); await W(200);
  await pg.evaluate(() => { const k = ws.getAllBlocks(false).find(b => b.type === 'e_keep'); const f = k.getField('SP'); f.showEditor_(); }); await W(400);
  await pg.screenshot({ path: O + tag + '-5-spawn-dropdown.png' });
  await pg.evaluate(() => { Blockly.DropDownDiv.hideWithoutAnimation(); Blockly.WidgetDiv.hide(); previewShow('say'); }); await W(300); await pg.screenshot({ path: O + tag + '-6-preview-summary.png' });
  await pg.evaluate(() => previewShow('code')); await W(300); await pg.screenshot({ path: O + tag + '-7-preview-code.png' });
  await pg.evaluate(() => { $('prevP').classList.add('hidden'); setAdv(true); selectCat('creep'); }); await W(500); await pg.screenshot({ path: O + tag + '-8-advanced.png' });
  const body = await pg.evaluate(() => ws.getAllBlocks(false).find(b => b.type === 'e_keep').getFieldValue('BODY'));
  await pg.close(); return { tag, errs, body };
}
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const R = [await run(b, 915, 412, 'landscape'), await run(b, 412, 915, 'portrait')]; console.log(JSON.stringify(R)); await b.close(); })();
