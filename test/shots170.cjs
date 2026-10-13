// v1.7.0 截图：RoomVisual / Deposit / Power Creep
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('offline')) : F(u, o); localStorage.setItem('sbm_intro', '1'); });
  await pg.goto('http://localhost:8765/index.html'); await W(1500);
  await pg.tap('#sPlay'); await W(500);
  const info = await pg.evaluate(() => { document.getElementById('introOk')?.click(); document.querySelectorAll('.shDlg').forEach(d => d.remove()); engine.placeSpawn(myPid); _snap = null; $('wmap').classList.add('hidden');
    const w = engine.w, sp = w.spawns.find(s => s.owner === myPid), rx = Math.floor(sp.x / ROOM), ry = Math.floor(sp.y / ROOM);
    w.deposits = w.deposits || []; w.deposits.push({ kind: 'deposit', id: 'dpX', x: sp.x + 3, y: sp.y - 2, depositType: 'silicon', harvested: 0, cooldownTime: 0, lastCooldown: 0, decayAt: w.time + 5000 });
    w.deposits.push({ kind: 'deposit', id: 'dpY', x: sp.x + 5, y: sp.y - 2, depositType: 'mist', harvested: 0, cooldownTime: 0, lastCooldown: 0, decayAt: w.time + 5000 });
    const c0 = w.creeps.find(c => c.owner === myPid);
    const pc = { ...(c0 || {}), id: 'pcX', name: 'Operator1', owner: myPid, x: sp.x - 2, y: sp.y + 2, body: Array(10).fill(0).map((_, i) => ({ type: i < 2 ? 'carry' : 'move', hits: 100 })), hits: 1000, hitsMax: 1000, store: {}, pc: 'pcRec1', level: 1, fatigue: 0, ttl: 5000, ticksToLive: 5000 };
    w.creeps.push(pc);
    const rn = roomNameXY(rx, ry); w._visuals = { [myPid]: { [rn]: [
      { t: 'c', x: sp.x % ROOM, y: sp.y % ROOM, s: { radius: 2, fill: '#00ff00', opacity: .25 } },
      { t: 'l', x1: sp.x % ROOM, y1: sp.y % ROOM, x2: sp.x % ROOM + 3, y2: sp.y % ROOM - 2, s: { color: '#ffff00', width: .15, opacity: .9 } },
      { t: 'r', x: sp.x % ROOM - 4, y: sp.y % ROOM - 4, w: 8, h: 8, s: { stroke: '#ff00ff', strokeWidth: .1, fill: '#ff00ff', opacity: .08 } },
      { t: 'p', points: [[2, 2], [8, 4], [5, 9], [12, 12]], s: { stroke: '#00ffff', strokeWidth: .2, opacity: .8 } },
      { t: 't', text: 'RoomVisual 你好', x: sp.x % ROOM, y: sp.y % ROOM - 5, s: { color: '#ffffff', font: .8, opacity: 1 } }] } };
    renderer.setView(engine.w, 300); renderer.fitRoom(rx, ry); return { rn, n: (engine.w.creeps || []).length };
  });
  await W(1500); await pg.screenshot({ path: '/workspace/shots170/roomvisual-deposit-powercreep.png' });
  const p2 = await pg.evaluate(() => { const pc = engine.w.creeps.find(c => c.id === 'pcX'); renderer.scale *= 2.2; renderer.cx = (pc.x + 3) * TS; renderer.cy = (pc.y - 1) * TS; renderer.setView(engine.w, 300); return !!pc; }); await W(1200);
  await pg.screenshot({ path: '/workspace/shots170/zoom-deposit-powercreep.png' });
  console.log(JSON.stringify({ info, p2, errs })); await b.close();
})();
