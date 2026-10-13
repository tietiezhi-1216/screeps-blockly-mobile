// 渲染对照截图：creep 朝向动作目标、spawn 进度环、携带量 0/25/50/100%、混合资源、徽章尺寸
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots-render/';
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto('http://localhost:8796/index.html'); await W(1200); await pg.tap('#sPlay'); await W(500);
  const info = await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); } catch (e) {} $('wmap').classList.add('hidden');
    running = false; const w = engine.w, sp = w.spawns.find(s => s.owner === myPid), src = w.sources.slice().sort((a, b) => Math.hypot(a.x - sp.x, a.y - sp.y) - Math.hypot(b.x - sp.x, b.y - sp.y))[0];
    const free = (x, y) => !w.creeps.some(c => c.x === x && c.y === y);
    const mk = (x, y, body, store, face) => { const c = { kind: 'creep', id: 'c' + (w.nextId++), owner: myPid, name: 't' + w.nextId, body, hits: body.length * 100, x, y, px: x, py: y, store, ttl: 1000, fatigue: 0 }; if (face) c._face = { x: face[0], y: face[1], t: w.time }; w.creeps.push(c); return c; };
    const W2 = ['work', 'work', 'carry', 'carry', 'move', 'move'];
    // 采集：creep 在能量源左/下方，正面（黄色 WORK）朝向能量源
    mk(src.x - 1, src.y + 1, W2, { energy: 50 }, [src.x, src.y]);
    // 攻击：两个 creep 互相面对
    mk(sp.x + 3, sp.y - 3, ['attack', 'attack', 'attack', 'move', 'move'], {}, [sp.x + 5, sp.y - 3]); mk(sp.x + 5, sp.y - 3, ['ranged_attack', 'heal', 'move', 'move'], {}, [sp.x + 3, sp.y - 3]);
    // 携带量 0/25/50/100% 与混合资源（容量 200）
    const C4 = ['carry', 'carry', 'carry', 'carry', 'move'];
    [[{}, 0], [{ energy: 50 }, 1], [{ energy: 100 }, 2], [{ energy: 200 }, 3], [{ energy: 60, power: 40, H: 50 }, 4], [{ U: 100 }, 5]].forEach(([s, i]) => mk(sp.x - 3 + i, sp.y + 3, C4, s));
    sp.spawning = { name: 'x', needTime: 9, spawnTime: w.time + 3 };
    renderer.setView(engine.w, 1); return { sp: [sp.x, sp.y], src: [src.x, src.y] }; });
  await W(1500);
  const shot = async (x, y, sc, name) => { await pg.evaluate((x, y, sc) => { renderer.scale = sc; renderer.cx = (x + .5) * 16; renderer.cy = (y + .5) * 16; }, x, y, sc); await W(400); await pg.screenshot({ path: O + name }); };
  await shot(info.sp[0], info.sp[1], 7, '1-overview.png');
  await shot(info.src[0] - .5, info.src[1] + .5, 14, '2-harvest-facing-source.png');
  await shot(info.sp[0] + 4, info.sp[1] - 3, 14, '3-attack-facing.png');
  await shot(info.sp[0], info.sp[1], 16, '4-spawn-progress-ring.png');
  await pg.evaluate(() => { const sp = engine.w.spawns.find(s => s.owner === myPid); sp.spawning.spawnTime = engine.w.time + 8; renderer.setView(engine.w, 1); }); await W(300);
  await shot(info.sp[0], info.sp[1], 16, '4b-spawn-progress-ring-early.png');
  await shot(info.sp[0] - 0.5, info.sp[1] + 3, 12, '5-carry-0-25-50-100-mixed.png');
  console.log(JSON.stringify({ info, errs })); await b.close(); })();
