// 官方外观对照：Source Keeper 房间（Keeper、Lair、能量源、矿物）+ creep 采集时正面朝向能量源。BASE=http://localhost:端口 OUT=前缀
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.BASE || 'http://localhost:8821', OUT = process.env.OUT || '/workspace/shots-npcart/after-';
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = []; const res = {};
  for (const [vw, vh, tag] of [[915, 412, 'land'], [412, 915, 'port']]) {
    const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
    await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
    await pg.goto(BASE + '/index.html'); await W(1500); await pg.evaluate(() => $('sPlay').click()); await W(800);
    const info = await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); } catch (e) {} $('wmap') && $('wmap').classList.add('hidden');
      running = false; const w = engine.w; let lair;
      for (let rx = 0; rx < 11 && !lair; rx++) for (let ry = 0; ry < 11 && !lair; ry++) { ensureRoom(w, rx, ry); lair = w.structures.find(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === rx + ',' + ry); }
      const sp = w.spawns.find(s => s.owner === myPid), src = w.sources.slice().sort((a, b) => Math.hypot(a.x - sp.x, a.y - sp.y) - Math.hypot(b.x - sp.x, b.y - sp.y))[0];
      // 真实流程：玩家代码 harvest → intent 结算 → 快照 face → 渲染旋转
      let hx, hy; for (const [dx, dy] of [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [1, 0], [-1, 0], [0, -1]]) { const x = src.x + dx, y = src.y + dy; if (engine.walkable ? engine.walkable(x, y) : true) { hx = x; hy = y; break; } }
      const c = { kind: 'creep', id: 'cFace', owner: myPid, name: 'face', body: ['work', 'work', 'work', 'carry', 'move', 'move'], hits: 600, x: hx, y: hy, px: hx, py: hy, store: {}, ttl: 1400, fatigue: 0 }; w.creeps.push(c); engine._o = null;
      engine.setCode(myPid, "const c=Game.creeps.face; if(c){const s=Game.getObjectById('" + src.id + "'); c.harvest(s);}");
      for (let i = 0; i < 420; i++) engine.tick();
      renderer.setView(engine.w, 500); return { lair: [lair.x, lair.y], src: [src.x, src.y], h: [hx, hy] }; });
    await W(1500);
    const shot = async (x, y, sc, name) => { await pg.evaluate((x, y, sc) => { renderer.scale = sc; renderer.cx = (x + .5) * 16; renderer.cy = (y + .5) * 16; }, x, y, sc); await W(1200); await pg.screenshot({ path: OUT + name + '-' + tag + '.png' }); };
    const rx = Math.floor(info.lair[0] / 50) * 50, ry = Math.floor(info.lair[1] / 50) * 50;
    await shot(rx + 24.5, ry + 24.5, vw > vh ? 1.6 : 1.4, 'keeper-room');
    await shot(info.lair[0], info.lair[1], 6, 'keeper-lair');
    await shot((info.src[0] + info.h[0]) / 2, (info.src[1] + info.h[1]) / 2, 12, 'harvest-facing');
    res[tag] = await pg.evaluate(h => { const c = renderer.sprites.get('cFace'), d = c && c.data; if (!c) return null; const want = !Renderer.faceAngle ? null : Renderer.faceAngle(d.x, d.y, d.face ? d.face[0] : NaN, d.face ? d.face[1] : NaN); return { face: d.face, rot: c.bd.rotation, want, h }; }, info.h); res[tag].src = info.src;
    await pg.close(); }
  console.log(JSON.stringify(res)); if (errs.length) console.log('ERR', errs.slice(0, 3)); await b.close();
  if (process.env.ASSERT) { for (const k in res) { const r = res[k]; const exp = Math.atan2(r.src[1] - r.h[1], r.src[0] - r.h[0]) + Math.PI / 2, d = Math.atan2(Math.sin(r.rot - exp), Math.cos(r.rot - exp));
    if (!r.face || Math.abs(d) > .05) { console.error('FAIL 渲染朝向未指向能量源', k, r); process.exit(1); } console.log('ok - 采集时 creep 正面（贴图上方）旋转后指向能量源', k); } }
})();
