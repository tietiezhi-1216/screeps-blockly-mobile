// 浏览器性能：CPU 降速 6 倍模拟中端手机，测 FPS 和主线程脚本耗时
const p = require('puppeteer-core');
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 860, deviceScaleFactor: 2.75 });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1');
    localStorage.setItem('sbm_code', JSON.stringify({ blocks: { languageVersion: 0, blocks: [] } })); });
  await pg.goto('http://localhost:8765/index.html?run=1&bench=1'); await new Promise(r => setTimeout(r, 1500));
  // 注入一个采集程序让 creep 动起来
  await pg.evaluate(() => { const c = `Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE],'c'+Game.time);for(const n in Game.creeps){const c=Game.creeps[n];if(c.store.getFreeCapacity()===0){const s=Game.spawns['Spawn1'];if(c.transfer(s,RESOURCE_ENERGY)===ERR_NOT_IN_RANGE)c.moveTo(s);}else{const s=c.pos.findClosestByPath(FIND_SOURCES);if(s&&c.harvest(s)===ERR_NOT_IN_RANGE)c.moveTo(s);}}`; engine.setCode(myPid, c); engine.w.spawns.forEach(s => s.energy = 300); for (let i = 0; i < 400; i++) engine.tick(); });
  const cdp = await pg.target().createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const m0 = await pg.metrics();
  const fps = await pg.evaluate(() => new Promise(res => { const ts = []; const f = t => { ts.push(t); if (ts.length < 400 && t - ts[0] < 5000) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]); d.sort((a, b) => a - b); res({ fps: (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000), p50: d[d.length >> 1], p95: d[Math.floor(d.length * .95)], creeps: engine.w.creeps.length }); } }; requestAnimationFrame(f); }));
  const m1 = await pg.metrics();
  console.log(JSON.stringify(fps), 'scriptMs/s=', ((m1.ScriptDuration - m0.ScriptDuration) / ((m1.Timestamp - m0.Timestamp)) * 1000).toFixed(0), 'layoutMs/s=', ((m1.LayoutDuration - m0.LayoutDuration + m1.RecalcStyleDuration - m0.RecalcStyleDuration) / (m1.Timestamp - m0.Timestamp) * 1000).toFixed(0));
  await pg.screenshot({ path: '/tmp/perf.png' }); await b.close();
})();
