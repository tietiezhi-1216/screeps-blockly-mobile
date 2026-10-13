// 选择出生房间截图：未选中 / 选中空闲房间 / 选中 Keeper 房间（E6S6），竖屏+横屏；before/after
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots-spawnpick/';
async function run(b, port, ver, vw, vh, tag) { const errs = []; const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => localStorage.setItem('sbm_intro', '1'));
  await pg.goto(`http://localhost:${port}/index.html`); await W(1200);
  await pg.evaluate(() => { const b = document.getElementById('sPlay'); if (b) b.click(); else hideStart(); }); await W(1500);
  await pg.evaluate(() => { document.getElementById('introOk')?.click(); document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.addPlayer('bot2', '对手'); engine.placeSpawn('bot2'); _snap = null; } catch (e) {} openWorldMap(true); }); await W(800);
  await pg.screenshot({ path: `${O}${ver}-${tag}-1-unselected.png` });
  const tap = async (rx, ry) => { await pg.evaluate((rx, ry) => { const G = wm.geo, r = $('wmCanvas').getBoundingClientRect(); $('wmCanvas').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + G.ox + (rx + .5) * G.cs, clientY: r.top + G.oy + (ry + .5) * G.cs })); }, rx, ry); await W(300); };
  const free = await pg.evaluate(() => { const v = view(); for (let y = 0; y < v.S; y++) for (let x = 0; x < v.S; x++) if (roomStatus(v.S, v.owned, x, y, myPid) === 'free') return [x, y]; });
  await tap(free[0], free[1]); await pg.screenshot({ path: `${O}${ver}-${tag}-2-selected-free.png` });
  await tap(6, 6); await pg.screenshot({ path: `${O}${ver}-${tag}-3-selected-E6S6.png` });
  const info = await pg.evaluate(() => ({ sel: $('wmSel').textContent, go: $('wmGo').disabled }));
  await pg.close(); return { ver, tag, info, errs };
}
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = [];
  for (const [port, ver] of [[8793, 'before'], [8792, 'after']]) for (const [w, h, t] of [[412, 915, 'portrait'], [915, 412, 'landscape']]) R.push(await run(b, port, ver, w, h, t));
  console.log(JSON.stringify(R, null, 1)); await b.close(); })();
