// 运行速度：长按「运行」选择速度后 tick 速率随之变化并保存；从设置可回到游戏
const p = require('puppeteer-core'); const assert = require('assert');
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('offline')) : F(u, o); if (!sessionStorage.getItem('k')) { localStorage.clear(); sessionStorage.setItem('k', 1); } localStorage.setItem('sbm_intro', '1'); });
  await pg.goto('http://localhost:8766/index.html'); await W(1500);
  await pg.tap('#sPlay'); await W(300); await pg.evaluate(() => { engine.placeSpawn(myPid); _snap = null; $('wmap').classList.add('hidden'); running = true; setRunUI(); });
  const rate = async () => { const t0 = await pg.evaluate(() => engine.w.time); await W(2000); return (await pg.evaluate(() => engine.w.time)) - t0; };
  const r1 = await rate();
  // 长按运行 → 弹出 → 选 4x
  const bb = await (await pg.$('#btnRun')).boundingBox(); await pg.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2); await W(600); await pg.touchscreen.touchEnd();
  assert.ok(await pg.evaluate(() => !$('speedPop').classList.contains('hidden')), '长按应弹出速度菜单');
  await pg.tap('#speedPop [data-v="4"]'); await W(100);
  const r4 = await rate(); console.log('ticks/2s @1x', r1, '@4x', r4);
  assert.ok(r4 > r1 * 2.5, '4x 应明显更快');
  assert.strictEqual(JSON.parse(await pg.evaluate(() => localStorage.getItem('sbm_settings'))).speed, 4, '速度应保存');
  // 进入设置后能回到游戏
  await pg.tap('#btnMenu'); await W(200); await pg.tap('#sSet'); await W(200);
  assert.ok(await pg.$('.shToGame'), '设置页应有返回游戏'); await pg.tap('.shBack'); await W(150);
  assert.strictEqual(await pg.evaluate(() => $('sPlay').textContent.trim()), '返回游戏'); await pg.tap('#sPlay'); await W(200);
  assert.ok(await pg.evaluate(() => $('start').classList.contains('hidden')), '返回键应回到游戏');
  await pg.tap('#btnMenu'); await W(200); await pg.tap('#sSet'); await pg.tap('.shToGame'); await W(200);
  assert.ok(await pg.evaluate(() => $('start').classList.contains('hidden') && speed === 4), '返回游戏后速度保持');
  // 重新加载后沿用
  await pg.reload(); await W(1500); await pg.tap('#sPlay'); await W(300);
  assert.strictEqual(await pg.evaluate(() => speed), 4, '重启后沿用保存的速度');
  assert.deepStrictEqual(errs, []); console.log('speed ok'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
