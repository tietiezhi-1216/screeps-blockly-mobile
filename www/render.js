// PixiJS 渲染层：只读取“视图”（本地引擎世界或客户端镜像），不修改逻辑
const TS = 16; // 每格像素（纹理分辨率）
class Renderer {
  constructor(host) {
    this.app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x0d0d0f, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true });
    host.appendChild(this.app.view); this.app.view.id = 'world';
    this.world = new PIXI.Container(); this.app.stage.addChild(this.world);
    this.terrainL = new PIXI.Container(); this.structL = new PIXI.Container(); this.objL = new PIXI.Container(); this.creepL = new PIXI.Container(); this.fxL = new PIXI.Container(); this.labelL = new PIXI.Container();
    this.world.addChild(this.terrainL, this.structL, this.objL, this.creepL, this.fxL, this.labelL);
    this.scale = 1.6; this.cx = 37 * TS; this.cy = 37 * TS; this.view = null; this.roomsVer = -1; this.sprites = new Map(); this.particles = []; this.tickAt = performance.now(); this.dt = 500;
    this.tex = this.makeTextures(); this.bindInput(); this.onTap = null;
    this.app.ticker.add(() => this.frame());
  }
  focus(x, y) { this.cx = (x + .5) * TS; this.cy = (y + .5) * TS; }
  // ===== 生成的贴图 =====
  makeTextures() {
    const mk = (draw, w = 32, h = 32) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return PIXI.Texture.from(c); };
    const glow = (g, x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    return {
      source: mk(g => { glow(g, 32, 32, 32, 'rgba(255,220,60,0.55)'); g.translate(32, 32); g.rotate(Math.PI / 4); const gr = g.createLinearGradient(-12, -12, 12, 12); gr.addColorStop(0, '#fff6a8'); gr.addColorStop(.5, '#ffd23c'); gr.addColorStop(1, '#b8860b'); g.fillStyle = gr; g.fillRect(-12, -12, 24, 24); g.strokeStyle = '#7a5a00'; g.lineWidth = 2; g.strokeRect(-12, -12, 24, 24); }, 64, 64),
      spawn: mk(g => { glow(g, 32, 32, 32, 'rgba(255,255,255,0.35)'); g.fillStyle = '#222'; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill(); const gr = g.createRadialGradient(26, 24, 2, 32, 32, 22); gr.addColorStop(0, '#fafafa'); gr.addColorStop(1, '#8a8a8a'); g.strokeStyle = gr; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 19, 0, 7); g.stroke(); }, 64, 64),
      ext: mk(g => { g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill(); g.strokeStyle = '#cfcfcf'; g.lineWidth = 3; g.stroke(); }),
      dot: mk(g => { glow(g, 16, 16, 16, 'rgba(255,255,255,1)'); }),
      ring: mk(g => { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.stroke(); }, 64, 64),
    };
  }
  roomTexture(rx, ry, tiles) {
    const c = document.createElement('canvas'); c.width = c.height = ROOM * TS; const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
    const T = (x, y) => (x < 0 || y < 0 || x >= ROOM || y >= ROOM) ? T_WALL : tiles[y * ROOM + x];
    const height = new Float32Array(ROOM * ROOM); // 山体“高度”= 到最近非墙格的距离
    for (let y = 0; y < ROOM; y++) for (let x = 0; x < ROOM; x++) { if (T(x, y) !== T_WALL) continue; let h = 3; for (let r = 1; r <= 3 && h === 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (T(x + dx, y + dy) !== T_WALL && x + dx >= 0 && y + dy >= 0 && x + dx < ROOM && y + dy < ROOM) h = Math.min(h, r - 1); height[y * ROOM + x] = h; }
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      const x = (px / TS) | 0, y = (py / TS) | 0, t = T(x, y), gx = rx * ROOM * TS + px, gy = ry * ROOM * TS + py, n = hash32(gx, gy, 3) / 4294967296, n2 = vnoiseR(gx / 6, gy / 6);
      let r, gg, b;
      if (t === T_WALL) { // 山体：按高度和朝光方向着色
        const h = height[y * ROOM + x] + (px % TS) / TS * 0 , lit = (T(x - 1, y - 1) !== T_WALL ? 1 : 0) * (1 - ((px % TS) + (py % TS)) / (TS * 1.2));
        const lx = (px % TS) / TS, ly = (py % TS) / TS, edgeN = T(x, y - 1) !== T_WALL ? Math.max(0, 1 - ly * 3) : 0, edgeS = T(x, y + 1) !== T_WALL ? Math.max(0, ly * 3 - 2) : 0; const base = 18 + h * 26 + n2 * 34 + n * 10 + Math.max(0, lit) * 30 + edgeN * 55 - edgeS * 14; r = base * 0.95; gg = base * 0.9; b = base * 1.05;
      } else if (t === T_SWAMP) { const base = 40 + n2 * 25 + n * 10; r = base * .7; gg = base * 1.15; b = base * .45; if (vnoiseR(gx / 3, gy / 3) > .72) { r *= .6; gg *= .75; b *= .9; } }
      else { const base = 78 + n2 * 16 + n * 10; r = base; gg = base * .95; b = base * .82; }
      // 墙脚阴影
      if (t !== T_WALL && (T(x - 1, y) === T_WALL && (px % TS) < 5 || T(x, y - 1) === T_WALL && (py % TS) < 5)) { r *= .6; gg *= .6; b *= .6; }
      const i = (py * c.width + px) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return PIXI.Texture.from(c);
  }
  rebuildTerrain(v) {
    this.terrainL.removeChildren().forEach(s => s.destroy({ texture: true, baseTexture: true })); this.labelL.removeChildren();
    for (const k in v.rooms) {
      const [rx, ry] = k.split(',').map(Number), r = v.rooms[k], sp = new PIXI.Sprite(this.roomTexture(rx, ry, r.tiles)); sp.x = rx * ROOM * TS; sp.y = ry * ROOM * TS; this.terrainL.addChild(sp);
      const own = r.owner && v.players[r.owner];
      const fr = new PIXI.Graphics(); fr.lineStyle(own ? 3 : 1, own ? own.color : 0x444444, own ? .7 : .6); fr.drawRect(sp.x + 1, sp.y + 1, ROOM * TS - 2, ROOM * TS - 2); this.terrainL.addChild(fr);
      const tx = new PIXI.Text('R' + rx + '_' + ry + (own ? ' · ' + own.name : ''), { fontSize: 18, fill: own ? own.color : 0x999999, fontWeight: 'bold', stroke: 0x000000, strokeThickness: 3 }); tx.x = sp.x + TS * 1.2; tx.y = sp.y + TS * 1.1; tx.alpha = .85; this.labelL.addChild(tx);
    }
    this.roomsVer = v.roomsVer;
  }
  // ===== 每 tick 喂入新视图 =====
  setView(v, dt) {
    if (!this.view || this._refocus) { this._refocus = false; const me = v.spawns.find(s => s.owner === this.myPid) || v.spawns[0]; if (me) this.focus(me.x, me.y); }
    this.view = v; this.dt = dt; this.tickAt = performance.now();
    if (v.roomsVer !== this.roomsVer) this.rebuildTerrain(v);
    for (const e of v.events || []) this.effect(e);
  }
  effect(e) {
    const P = (n, col, life, opts = {}) => { for (let i = 0; i < n; i++) this.spawnParticle(Object.assign({ x0: e.fx ?? e.x, y0: e.fy ?? e.y, x1: e.x, y1: e.y, col, life: life * (0.7 + Math.random() * .6), delay: i * 60, arc: (Math.random() - .5) * 1.2 }, opts)); };
    if (e.t === 'harvest') P(2, 0xffd84a, this.dt * .9, { size: .35 });
    else if (e.t === 'transfer') P(4, 0xffe066, this.dt * .9, { size: .4 });
    else if (e.t === 'build') P(3, 0x66ccff, this.dt * .8, { size: .3 });
    else if (e.t === 'spawn') { this.ringFx(e.fx, e.fy, 0xffffff, 700); P(10, 0xffffff, 600, { x0: e.fx, y0: e.fy, x1: null, burst: true, size: .3 }); }
    else if (e.t === 'built') this.ringFx(e.x, e.y, 0x66ccff, 800);
    else if (e.t === 'die') P(8, 0x888888, 800, { x0: e.x, y0: e.y, x1: null, burst: true, size: .4 });
  }
  spawnParticle(p) { const s = new PIXI.Sprite(this.tex.dot); s.anchor.set(.5); s.tint = p.col; s.blendMode = PIXI.BLEND_MODES.ADD; s.alpha = 0; this.fxL.addChild(s); p.s = p.size || .35; if (p.burst) { const a = Math.random() * 7, r = .8 + Math.random(); p.x1 = p.x0 + Math.cos(a) * r; p.y1 = p.y0 + Math.sin(a) * r; } p.sprite = s; p.t0 = performance.now() + (p.delay || 0); this.particles.push(p); }
  ringFx(x, y, col, life) { const s = new PIXI.Sprite(this.tex.ring); s.anchor.set(.5); s.tint = col; s.x = (x + .5) * TS; s.y = (y + .5) * TS; this.fxL.addChild(s); this.particles.push({ ring: true, sprite: s, t0: performance.now(), life }); }
  ent(id, make) { let s = this.sprites.get(id); if (!s) { s = make(); s._new = true; this.sprites.set(id, s); } s._seen = this.frameNo; return s; }
  frame() {
    this.frameNo = (this.frameNo || 0) + 1; const now = performance.now(), v = this.view;
    this.world.scale.set(this.scale); this.world.x = innerWidth / 2 - this.cx * this.scale; this.world.y = innerHeight / 2 - this.cy * this.scale;
    if (v) {
      const a = Math.min(1, (now - this.tickAt) / this.dt), ease = a * a * (3 - 2 * a), pulse = Math.sin(now / 300);
      const col = o => v.players[o]?.color ?? 0xffffff;
      for (const r of v.structures) { const s = this.ent('st' + r.x + ',' + r.y, () => { if (r.type === 'road') { const g = new PIXI.Graphics(); g.beginFill(0x7a7a72, .9).drawRoundedRect(3, 3, TS - 6, TS - 6, 4).endFill(); this.structL.addChild(g); return g; } const sp = new PIXI.Sprite(this.tex.ext); sp.width = sp.height = TS * .8; sp.anchor.set(.5); this.objL.addChild(sp); return sp; }); if (r.type === 'road') { s.x = r.x * TS; s.y = r.y * TS; } else { s.x = (r.x + .5) * TS; s.y = (r.y + .5) * TS; } }
      for (const st of v.sites) { const g = this.ent(st.id, () => { const g = new PIXI.Graphics(); this.structL.addChild(g); return g; }); g.clear(); g.lineStyle(1.5, col(st.owner), .9); g.drawRect(st.x * TS + 3, st.y * TS + 3, TS - 6, TS - 6); g.lineStyle(0); g.beginFill(col(st.owner), .8).drawRect(st.x * TS + 3, st.y * TS + TS - 4, (TS - 6) * st.progress / st.total, 2).endFill(); }
      for (const so of v.sources) { const s = this.ent(so.id, () => { const s = new PIXI.Sprite(this.tex.source); s.anchor.set(.5); s.width = s.height = TS * 1.4; this.objL.addChild(s); return s; }); s.x = (so.x + .5) * TS; s.y = (so.y + .5) * TS; const f = so.energy / so.cap; s.alpha = .35 + .65 * f; s.scale.set((TS * 1.4 / 64) * (0.75 + .25 * f + .03 * pulse)); }
      for (const sp of v.spawns) {
        const c = this.ent(sp.id, () => { const c = new PIXI.Container(); const b = new PIXI.Sprite(this.tex.spawn); b.anchor.set(.5); b.width = b.height = TS * 2; const e = new PIXI.Graphics(); const pr = new PIXI.Graphics(); c.addChild(b, e, pr); c.e = e; c.pr = pr; c.b = b; this.objL.addChild(c); return c; });
        c.x = (sp.x + .5) * TS; c.y = (sp.y + .5) * TS; c.b.tint = col(sp.owner); c.e.clear(); c.e.beginFill(0xffd23c).drawCircle(0, 0, TS * .42 * Math.sqrt(sp.energy / sp.cap)).endFill();
        c.pr.clear(); if (sp.spawning) { const p = 1 - sp.spawning.left / sp.spawning.total; c.pr.lineStyle(2.5, 0xffffff, .9).arc(0, 0, TS * .85, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); c.b.rotation = now / 400; } else c.b.rotation = 0;
      }
      for (const cr of v.creeps) {
        const c = this.ent(cr.id, () => { const c = new PIXI.Container(); const body = new PIXI.Graphics(); const en = new PIXI.Graphics(); c.addChild(body, en); c.en = en; c.body = body;
          const n = cr.body.length, pc = { work: 0xffe56d, carry: 0x777777, move: 0xa9b7c6 };
          body.beginFill(0x000000, .35).drawEllipse(1, TS * .38, TS * .38, TS * .14).endFill(); body.beginFill(0x1c1c1c).drawCircle(0, 0, TS * .42).endFill();
          cr.body.forEach((t, i) => { body.lineStyle(2.2, pc[t] ?? 0xffffff).arc(0, 0, TS * .36, -Math.PI / 2 + i / n * Math.PI * 2 + .08, -Math.PI / 2 + (i + 1) / n * Math.PI * 2 - .08); });
          body.lineStyle(1.5, col(cr.owner)).drawCircle(0, 0, TS * .45);
          c.lbl = new PIXI.Text('', { fontSize: 11, fill: 0xffffff, stroke: 0, strokeThickness: 3 }); c.lbl.anchor.set(.5, 1); c.lbl.y = -TS * .5; c.addChild(c.lbl);
          this.creepL.addChild(c); return c; });
        const px = cr.px ?? cr.x, py = cr.py ?? cr.y; c.x = (px + (cr.x - px) * ease + .5) * TS; c.y = (py + (cr.y - py) * ease + .5) * TS - Math.sin(ease * Math.PI) * 2.5;
        if (c._new) { c.scale.set(.1); c._new = false; } c.scale.set(Math.min(1, c.scale.x + .06));
        const capN = cr.body.filter(b => b === 'carry').length * 50 || 1; c.en.clear(); if (cr.energy > 0) c.en.beginFill(0xffe14d).drawCircle(0, 0, TS * .24 * Math.sqrt(cr.energy / capN)).endFill();
        c.lbl.text = cr.say || '';
      }
      for (const [id, s] of this.sprites) if (s._seen !== this.frameNo) { s.destroy({ children: true }); this.sprites.delete(id); }
    }
    this.particles = this.particles.filter(p => {
      const t = (now - p.t0) / p.life; if (t < 0) return true; if (t >= 1) { p.sprite.destroy(); return false; }
      if (p.ring) { p.sprite.scale.set((.2 + t * 1.6) * TS / 32); p.sprite.alpha = 1 - t; return true; }
      const e = 1 - (1 - t) * (1 - t), mx = (p.x0 + p.x1) / 2 + p.arc * (p.y1 - p.y0) * .5, my = (p.y0 + p.y1) / 2 - p.arc * (p.x1 - p.x0) * .5 - .6;
      const bx = (1 - e) * (1 - e) * p.x0 + 2 * (1 - e) * e * mx + e * e * p.x1, by = (1 - e) * (1 - e) * p.y0 + 2 * (1 - e) * e * my + e * e * p.y1;
      p.sprite.x = (bx + .5) * TS; p.sprite.y = (by + .5) * TS; p.sprite.alpha = Math.sin(t * Math.PI); p.sprite.scale.set(p.s * TS / 32); return true;
    });
  }
  bindInput() {
    const el = this.app.view, pts = new Map(); let last = null, moved = 0;
    el.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId);
      if (pts.size === 1) { this.cx -= (e.clientX - p.x) / this.scale; this.cy -= (e.clientY - p.y) / this.scale; moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (last) this.zoom(d / last); last = d; moved = 99; }
    });
    const up = e => { if (pts.size === 1 && moved < 8 && this.onTap) { const wx = (e.clientX - innerWidth / 2) / this.scale + this.cx, wy = (e.clientY - innerHeight / 2) / this.scale + this.cy; this.onTap(Math.floor(wx / TS), Math.floor(wy / TS)); } pts.delete(e.pointerId); last = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { this.zoom(e.deltaY < 0 ? 1.1 : 0.9); e.preventDefault(); }, { passive: false });
  }
  zoom(f) { this.scale = Math.min(4, Math.max(0.15, this.scale * f)); }
}
function vnoiseR(x, y) { return vnoise(31337, x, y); }
