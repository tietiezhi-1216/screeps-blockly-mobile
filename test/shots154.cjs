// v1.5.4：挖孔安全区（模拟原生注入 --nsal/--nsar）、徽章绑定、creep/spawn 比例
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots154/';
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = []; const out = {};
  const pg = await b.newPage(); await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('offline')) : F(u, o); localStorage.setItem('sbm_intro', '1'); });
  await pg.goto('http://localhost:8765/index.html'); await W(1500);
  await pg.tap('#sPlay'); await W(500);
  await pg.evaluate(() => { document.getElementById('introOk')?.click(); document.querySelectorAll('.shDlg').forEach(d => d.remove()); engine.placeSpawn(myPid); engine.addPlayer('bot2', '对手'); engine.placeSpawn('bot2'); _snap = null; $('wmap').classList.add('hidden');
    const sp = engine.w.spawns.find(s => s.owner === myPid); for (const [i, body] of [['work','carry','move'], ['work','work','carry','move','move'], ['attack','attack','tough','move'], ['ranged_attack','heal','move','move'], ['claim','move']].entries()) engine.w.spawns.find(s=>s.owner===myPid) && engine.spawnCreep ? 0 : 0; });
  // 用官方 API 造几个 creep
  await pg.evaluate(() => { const W_ = engine.w, sp = W_.spawns.find(s => s.owner === myPid); const mk = (body, dx, dy, own) => W_.creeps.push({ id: 'c' + Math.random().toString(36).slice(2), name: 'T' + W_.creeps.length, owner: own || myPid, body, x: sp.x + dx, y: sp.y + dy, hits: body.length * 100, store: { energy: dx * 10 }, energy: dx * 10, fatigue: 0, ticksToLive: 1500, memory: {} });
    try { mk(['work','carry','move'], 2, 0); mk(['work','work','carry','move','move'], 3, 0); mk(['attack','attack','tough','move'], 2, 2); mk(['ranged_attack','heal','move','move'], 3, 2); mk(['carry','carry','move'], 4, 1, 'bot2'); } catch (e) { console.log(e) }
    _snap = null; renderer.setView(engine.w, 1); const [rx, ry] = [Math.floor(sp.x / 50), Math.floor(sp.y / 50)]; renderer.fitRoom(rx, ry); });
  await W(800);
  for (const [tag, l, r] of [['cutout-left', 32, 0], ['cutout-right', 0, 32], ['no-cutout', 0, 0]]) {
    await pg.evaluate((l, r) => { const s = document.documentElement.style; s.setProperty('--nsal', l + 'px'); s.setProperty('--nsar', r + 'px'); }, l, r); await W(300);
    out[tag] = await pg.evaluate(() => { const R = id => { const q = document.getElementById(id).getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right)]; }; const btn = document.querySelector('#bar button').getBoundingClientRect(); const h = document.getElementById('hud'), rb = document.getElementById('roomBar');
      return { firstBtnLeft: Math.round(btn.left), hud: R('hud'), roomBar: R('roomBar'), hudClipped: h.scrollWidth > h.clientWidth + 1, overlap: h.getBoundingClientRect().right > rb.getBoundingClientRect().left, rbName: document.getElementById('rbName').textContent }; });
    await pg.screenshot({ path: O + tag + '.png' });
  }
  // 放大看 creep 与 spawn
  await pg.evaluate(() => { const sp = engine.w.spawns.find(s => s.owner === myPid); const s_ = renderer.sprites.get(sp.id); renderer.scale = 9; renderer.cx = s_.x + 40; renderer.cy = s_.y + 16;  }); await W(600);
  await pg.screenshot({ path: O + 'creep-spawn-zoom.png' });
  await pg.evaluate(() => { const S = engine.w.S; renderer.scale = Math.min(innerWidth, innerHeight) / (S * 50 * 16) * 0.95; renderer.cx = renderer.cy = S * 50 * 16 / 2; }); await W(800);
  await pg.screenshot({ path: O + 'world-ownership.png' });
  await pg.evaluate(() => { renderer.scale *= 4; }); await W(600); await pg.screenshot({ path: O + 'world-ownership-mid.png' });
  out.badges = await pg.evaluate(() => { let n = 0, ok = 0; for (const c of renderer.creepL.children) { n++; if (c.bg && c.bg.visible && c.bg.texture.width > 1) ok++; } return { creeps: n, withBadge: ok }; });
  // 改徽章 → 实时更新
  await pg.evaluate(() => { const p = JSON.parse(localStorage.getItem('sbm_profile') || '{}'); Shell.show('profile'); }); await W(200);
  out.live = await pg.evaluate(() => { const nb = { type: 7, color1: 3, color2: 40, color3: 60, param: 0, flip: false }; const before = renderer.creepL.children[0].bg.texture; engine.w.players[myPid].badge = nb; renderer.setView(engine.w, 1); const after = renderer.creepL.children.find(c => c.data.owner === myPid).bg.texture; return before !== after; });
  await pg.evaluate(() => Shell.hide()); await W(500); await pg.screenshot({ path: O + 'badge-changed.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('errors', errs); await b.close();
})();
