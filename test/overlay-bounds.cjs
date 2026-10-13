// v1.7.1：缩小到全图时，所有世界层图形不得超出世界范围（复现归属层被放大的问题）
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('offline')) : F(u, o); localStorage.setItem('sbm_intro', '1'); });
  await pg.goto('http://localhost:8765/index.html'); await W(1500); await pg.tap('#sPlay'); await W(500);
  await pg.evaluate(() => { document.getElementById('introOk')?.click(); document.querySelectorAll('.shDlg').forEach(d => d.remove()); engine.placeSpawn(myPid); _snap = null; $('wmap').classList.add('hidden');
    const w = engine.w, sp = w.spawns.find(s => s.owner === myPid); renderer.setOverlay('owner', true); renderer.setView(w, 300); renderer.fitRoom(Math.floor(sp.x / ROOM), Math.floor(sp.y / ROOM)); renderer.setView(w, 300); });
  await W(1500);
  const r = await pg.evaluate(async () => { const w = engine.w, S = w.S || renderer.view.S, R = ROOM * TS, out = [];
    // 在完整 / 缩略之间来回切换，触发贴图替换
    for (const sc of [renderer.scale, renderer.scale / 20, renderer.scale]) { renderer.scale = sc; renderer.cx = S * R / 2; renderer.cy = S * R / 2; renderer.setView(w, 300); await new Promise(r => setTimeout(r, 600)); }
    renderer.scale = Math.min(innerWidth, innerHeight) / (S * R) * .8; renderer.setView(w, 300); await new Promise(r => setTimeout(r, 800));
    const walk = (o, d) => { if (!o.visible || o === renderer.labelL) return; if (d > 0 && o.getLocalBounds && !(o.children && o.children.length && !(o instanceof PIXI.Graphics))) { const bb = o.getBounds(); const inv = renderer.world.worldTransform; const x0 = (bb.x - inv.tx) / inv.a, y0 = (bb.y - inv.ty) / inv.d, x1 = x0 + bb.width / inv.a, y1 = y0 + bb.height / inv.d; if (bb.width && (x0 < -R * .05 || y0 < -R * .05 || x1 > S * R * 1.001 + 4 || y1 > S * R * 1.001 + 4)) out.push({ n: o.name || o.constructor.name, isG: o instanceof PIXI.Graphics, isS: o instanceof PIXI.Sprite, par: o.parent === renderer.world ? "world:" + renderer.world.getChildIndex(o) : (o.parent && o.parent.name), gd: (o.geometry && o.geometry.graphicsData || []).slice(0,3).map(d => [d.shape.type, d.shape.x, d.shape.y, d.shape.width, d.shape.height, d.fillStyle.color.toString(16), d.fillStyle.alpha, d.lineStyle.width, d.lineStyle.color.toString(16)]), tf: [o.x, o.y, o.scale.x], pchain: (() => { let a = [], q = o.parent; while (q) { a.push((q.constructor.name) + ":" + Object.keys(renderer).filter(k => renderer[k] === q).join("")); q = q.parent; } return a.join(">"); })(), keys: Object.keys(renderer).filter(k => renderer[k] === o || renderer[k] === o.parent).join(), x0, y0, x1, y1 }); } for (const c of o.children || []) walk(c, d + 1); };
    walk(renderer.world, 0); return { S, R, lod: renderer.lod, out: out.slice(0, 10), ownG: !!renderer.ownG };
  });
  await pg.screenshot({ path: '/workspace/shots171/world-zoomed-out.png' });
  console.log(JSON.stringify({ r, errs })); await b.close(); if (r.out.length || errs.length) process.exit(1);
})();
