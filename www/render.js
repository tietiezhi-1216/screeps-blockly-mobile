// PixiJS 渲染层（Screeps 风格）。只读“视图”；静态内容缓存为贴图，逐帧只做 creep 线性插值和镜头变换。
const TS = 16;
const PART_COL = { work: 0xffe56d, carry: 0x777777, move: 0xa9b7c6 };
class Renderer {
  constructor(host) {
    this.app = new PIXI.Application({ resizeTo: window, antialias: false, backgroundColor: 0x0a0a0a, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true, powerPreference: 'high-performance' });
    host.appendChild(this.app.view); this.app.view.id = 'world';
    this.world = new PIXI.Container(); this.app.stage.addChild(this.world);
    const L = () => { const c = new PIXI.Container(); this.world.addChild(c); return c; };
    this.terrainL = L(); this.roadL = L(); this.siteL = L(); this.objL = L(); this.beamG = new PIXI.Graphics(); this.world.addChild(this.beamG); this.creepL = L(); this.labelL = L(); this.selG = new PIXI.Graphics(); this.world.addChild(this.selG);
    this.scale = 1.6; this.cx = 25 * TS; this.cy = 25 * TS; this.view = null; this.roomsVer = -1; this.sprites = new Map(); this.tickAt = performance.now(); this.dt = 500;
    this.tex = this.makeTextures(); this.creepTex = new Map(); this.rooms = []; this.onTap = null; this.selected = null; this.myPid = null;
    this.fps = 60; this._fpsN = 0; this._fpsT = performance.now();
    this.bindInput(); this.app.ticker.add(() => this.frame());
  }
  reset() { for (const s of this.sprites.values()) s.destroy({ children: true }); this.sprites.clear(); this.view = null; this.roomsVer = -1; this.selected = null; this.beamG.clear(); }
  pause(p) { p ? this.app.ticker.stop() : this.app.ticker.start(); }
  focus(x, y) { this.cx = (x + .5) * TS; this.cy = (y + .5) * TS; }
  canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return PIXI.Texture.from(c); }
  makeTextures() {
    const R = 64;
    return {
      source: this.canvasTex(R, R, g => { const gr = g.createRadialGradient(32, 32, 6, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,109,.55)'); gr.addColorStop(1, 'rgba(255,230,109,0)'); g.fillStyle = gr; g.fillRect(0, 0, R, R); g.fillStyle = '#ffe56d'; g.fillRect(20, 20, 24, 24); g.strokeStyle = '#a08a2a'; g.lineWidth = 2; g.strokeRect(20, 20, 24, 24); }),
      spawn: this.canvasTex(R, R, g => { g.fillStyle = '#181818'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.strokeStyle = '#cccccc'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.fill(); }),
      ext: this.canvasTex(32, 32, g => { g.fillStyle = '#181818'; g.beginPath(); g.arc(16, 16, 14, 0, 7); g.fill(); g.strokeStyle = '#bbbbbb'; g.lineWidth = 2.5; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.stroke(); }),
      controller: this.canvasTex(64, 64, g => { // 紫/灰六边形风格
        g.fillStyle = 'rgba(140,80,200,.25)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
        g.strokeStyle = '#9b6dff'; g.lineWidth = 3; g.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = 32 + Math.cos(a) * 22, y = 32 + Math.sin(a) * 22; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke();
        g.fillStyle = '#6a4a8a'; g.beginPath(); g.arc(32, 32, 10, 0, 7); g.fill();
      }),
      tower: this.canvasTex(32, 32, g => { g.fillStyle = '#333'; g.fillRect(10, 6, 12, 20); g.strokeStyle = '#c44'; g.lineWidth = 2; g.strokeRect(10, 6, 12, 20); g.fillStyle = '#c44'; g.fillRect(13, 2, 6, 6); }),
      container: this.canvasTex(32, 32, g => { g.fillStyle = '#444'; g.fillRect(6, 10, 20, 14); g.strokeStyle = '#aaa'; g.lineWidth = 2; g.strokeRect(6, 10, 20, 14); }),
      storage: this.canvasTex(32, 32, g => { g.fillStyle = '#2a2a2a'; g.beginPath(); g.moveTo(16, 2); g.lineTo(28, 10); g.lineTo(28, 22); g.lineTo(16, 30); g.lineTo(4, 22); g.lineTo(4, 10); g.closePath(); g.fill(); g.strokeStyle = '#ffe56d'; g.lineWidth = 2; g.stroke(); }),
      wall: this.canvasTex(16, 16, g => { g.fillStyle = '#555'; g.fillRect(1, 1, 14, 14); }),
      rampart: this.canvasTex(16, 16, g => { g.strokeStyle = '#3a8'; g.lineWidth = 2; g.strokeRect(1, 1, 14, 14); }),
      disc: this.canvasTex(R, R, g => { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); }),
    };
  }
  creepTexture(body, color) { // 每种“身体+颜色”只生成一次
    const key = body.join(',') + '|' + color; let t = this.creepTex.get(key); if (t) return t;
    t = this.canvasTex(64, 64, g => {
      g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
      const n = body.length; g.lineWidth = 7;
      body.forEach((p, i) => { g.strokeStyle = '#' + (PART_COL[p] ?? 0xffffff).toString(16).padStart(6, '0'); g.beginPath(); g.arc(32, 32, 23, -Math.PI / 2 + i / n * Math.PI * 2 + .06, -Math.PI / 2 + (i + 1) / n * Math.PI * 2 - .06); g.stroke(); });
      g.fillStyle = '#111'; g.beginPath(); g.arc(32, 32, 18, 0, 7); g.fill();
    });
    this.creepTex.set(key, t); return t;
  }
  roomTexture(rx, ry, tiles) { // Screeps 风格：深灰平原、黑色粗糙山体、绿色沼泽
    const N = ROOM * TS, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const T = (x, y) => (x < 0 || y < 0 || x >= ROOM || y >= ROOM) ? T_WALL : tiles[y * ROOM + x];
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = (px / TS) | 0, y = (py / TS) | 0, t = T(x, y), gx = rx * N + px, gy = ry * N + py, n = hash32(gx, gy, 3) / 4294967296;
      let col;
      if (t === T_WALL) {
        // 边缘粗糙：靠近非墙邻格的像素用噪声决定是否“侵入”
        const fx = (px % TS) / TS, fy = (py % TS) / TS, rough = vnoise(7, gx / 3, gy / 3) * .35;
        const edge = (T(x - 1, y) !== T_WALL && fx < rough) || (T(x + 1, y) !== T_WALL && fx > 1 - rough) || (T(x, y - 1) !== T_WALL && fy < rough) || (T(x, y + 1) !== T_WALL && fy > 1 - rough);
        col = edge ? null : (17 + n * 6);
        if (col !== null) { const i = (py * N + px) * 4; d[i] = d[i + 1] = d[i + 2] = col; d[i + 3] = 255; continue; }
      }
      const i = (py * N + px) * 4, sw = t === T_SWAMP || (t === T_WALL && T(x, y) === T_SWAMP);
      if (t === T_SWAMP) { const v = vnoise(11, gx / 5, gy / 5); d[i] = 35 + v * 10; d[i + 1] = 45 + v * 14; d[i + 2] = 18 + v * 5; }
      else { const v = 41 + n * 5; d[i] = v; d[i + 1] = v; d[i + 2] = v; }
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return PIXI.Texture.from(c);
  }
  rebuildTerrain(v) {
    this.terrainL.removeChildren().forEach(s => s.destroy({ texture: true, baseTexture: true })); this.labelL.removeChildren().forEach(s => s.destroy()); this.rooms = [];
    for (const k in v.rooms) {
      const [rx, ry] = k.split(',').map(Number), r = v.rooms[k], sp = new PIXI.Sprite(this.roomTexture(rx, ry, r.tiles)); sp.x = rx * ROOM * TS; sp.y = ry * ROOM * TS; this.terrainL.addChild(sp);
      const own = r.owner && v.players[r.owner];
      const tx = new PIXI.Text((r.name || roomNameXY(rx, ry)) + (own ? '  ' + own.name : ''), { fontFamily: 'sans-serif', fontSize: 20, fill: own ? own.color : 0x888888 }); tx.alpha = .6; tx.x = sp.x + 6; tx.y = sp.y + 4; this.labelL.addChild(tx);
      this.rooms.push([sp, tx]);
    }
    this.roomsVer = v.roomsVer;
  }
  // ===== 每 tick 一次：更新非移动内容 =====
  setView(v, dt) {
    const first = !this.view; this.view = v; this.dt = dt; this.tickAt = performance.now();
    if (v.roomsVer !== this.roomsVer) this.rebuildTerrain(v);
    if (first) { const me = v.spawns.find(s => s.owner === this.myPid) || v.spawns[0]; if (me) this.focus(me.x, me.y); }
    const col = o => v.players[o]?.color ?? 0xffffff, seen = new Set(), ent = (id, make) => { seen.add(id); let s = this.sprites.get(id); if (!s) { s = make(); this.sprites.set(id, s); } return s; };
    for (const r of v.structures) {
      const id = r.id || ('st' + r.x + ',' + r.y);
      ent(id, () => {
        if (r.type === 'road') { const g = new PIXI.Graphics(); g.beginFill(0x666666).drawCircle((r.x + .5) * TS, (r.y + .5) * TS, TS * .18).endFill(); this.roadL.addChild(g); return g; }
        const tex = r.type === 'tower' ? this.tex.tower : r.type === 'container' ? this.tex.container : r.type === 'storage' ? this.tex.storage : r.type === 'constructedWall' ? this.tex.wall : r.type === 'rampart' ? this.tex.rampart : this.tex.ext;
        const s = new PIXI.Sprite(tex); s.anchor.set(.5); s.width = s.height = (r.type === 'constructedWall' || r.type === 'rampart' ? TS : TS * .9); s.x = (r.x + .5) * TS; s.y = (r.y + .5) * TS; this.objL.addChild(s); return s;
      });
    }
    for (const c of v.controllers || []) {
      const s = ent(c.id, () => { const s = new PIXI.Sprite(this.tex.controller); s.anchor.set(.5); s.width = s.height = TS * 1.3; s.x = (c.x + .5) * TS; s.y = (c.y + .5) * TS; const lbl = new PIXI.Text('', { fontSize: 10, fill: 0xccaaee }); lbl.anchor.set(.5, 0); lbl.y = TS * .55; s.addChild(lbl); s.lbl = lbl; this.objL.addChild(s); return s; });
      s.tint = c.owner ? (v.players[c.owner]?.color ?? 0x9b6dff) : 0x666666; s.lbl.text = c.level > 0 ? ('RCL' + c.level) : '';
    }
    for (const st of v.sites) {
      const g = ent(st.id, () => { const g = new PIXI.Graphics(); this.siteL.addChild(g); return g; });
      if (g._p !== st.progress) { g._p = st.progress; g.clear(); g.lineStyle(1.5, col(st.owner), .8).drawCircle((st.x + .5) * TS, (st.y + .5) * TS, TS * .35); g.lineStyle(0).beginFill(col(st.owner), .7).drawCircle((st.x + .5) * TS, (st.y + .5) * TS, TS * .3 * st.progress / st.total).endFill(); }
    }
    // 矿物（官方：墙上的圆形，字母标识）、掉落资源（黄色小点）、墓碑
    for (const m of v.minerals || []) ent(m.id, () => { const c = new PIXI.Container(); const g = new PIXI.Graphics(); g.beginFill(0x222222).lineStyle(1.5, 0xaaaaaa).drawCircle(0, 0, TS * .55).endFill(); const t = new PIXI.Text(m.type, { fontFamily: 'sans-serif', fontSize: 11, fill: 0xdddddd }); t.anchor.set(.5); c.addChild(g, t); c.x = (m.x + .5) * TS; c.y = (m.y + .5) * TS; this.objL.addChild(c); return c; });
    for (const r of v.resources || []) { const g = ent(r.id, () => { const g = new PIXI.Graphics(); g.x = (r.x + .5) * TS; g.y = (r.y + .5) * TS; this.siteL.addChild(g); return g; }); const rad = Math.min(.45, .12 + Math.sqrt(r.amount) / 60); if (g._r !== rad) { g._r = rad; g.clear(); g.beginFill(r.resourceType === 'energy' ? 0xffe56d : 0xcccccc, .9).drawCircle(0, 0, TS * rad).endFill(); } }
    for (const t of v.tombstones || []) ent(t.id, () => { const g = new PIXI.Graphics(); g.beginFill(0x444444, .9).lineStyle(1, col(t.owner), .8).drawRoundedRect(-TS * .25, -TS * .35, TS * .5, TS * .7, TS * .2).endFill(); g.x = (t.x + .5) * TS; g.y = (t.y + .5) * TS; this.siteL.addChild(g); return g; });
    for (const so of v.sources) { const s = ent(so.id, () => { const s = new PIXI.Sprite(this.tex.source); s.anchor.set(.5); s.width = s.height = TS * 1.5; s.x = (so.x + .5) * TS; s.y = (so.y + .5) * TS; this.objL.addChild(s); return s; }); s.alpha = .3 + .7 * so.energy / so.cap; }
    for (const sp of v.spawns) {
      const c = ent(sp.id, () => { const c = new PIXI.Container(); const b = new PIXI.Sprite(this.tex.spawn); b.anchor.set(.5); b.width = b.height = TS * 1.6; const e = new PIXI.Sprite(this.tex.disc); e.anchor.set(.5); e.tint = 0xffe56d; const pr = new PIXI.Graphics(); c.addChild(b, e, pr); c.e = e; c.pr = pr; c.x = (sp.x + .5) * TS; c.y = (sp.y + .5) * TS; this.objL.addChild(c); return c; });
      const f = sp.energy / sp.cap; c.e.width = c.e.height = TS * 1.0 * Math.sqrt(f);
      const sk = sp.spawning ? sp.spawning.left : -1; if (c._sk !== sk) { c._sk = sk; c.pr.clear(); if (sp.spawning) c.pr.lineStyle(2, col(sp.owner), 1).arc(0, 0, TS * .9, -Math.PI / 2, -Math.PI / 2 + (1 - sp.spawning.left / sp.spawning.total) * Math.PI * 2); }
    }
    for (const cr of v.creeps) {
      const c = ent(cr.id, () => { const c = new PIXI.Container(); const b = new PIXI.Sprite(this.creepTexture(cr.body, col(cr.owner))); b.anchor.set(.5); b.width = b.height = TS * .9; const e = new PIXI.Sprite(this.tex.disc); e.anchor.set(.5); e.tint = 0xffe56d; c.addChild(b, e); c.e = e; this.creepL.addChild(c); return c; });
      c.data = cr; const cap = cr.body.filter(b => b === 'carry').length * 50 || 1; if (c._en !== cr.energy) { c._en = cr.energy; c.e.width = c.e.height = TS * .5 * Math.sqrt(cr.energy / cap); c.e.visible = cr.energy > 0; }
      if ((cr.say || '') !== (c._say || '')) { c._say = cr.say; if (c.say) { c.say.destroy(); c.say = null; } if (cr.say) { c.say = new PIXI.Text(cr.say, { fontSize: 11, fill: 0xffffff, stroke: 0, strokeThickness: 3 }); c.say.anchor.set(.5, 1); c.say.y = -TS * .5; c.addChild(c.say); } }
    }
    for (const [id, s] of this.sprites) if (!seen.has(id)) { s.destroy({ children: true }); this.sprites.delete(id); }
    // 动作光束（每 tick 重画一次，逐帧淡出）
    const g = this.beamG; g.clear(); const BC = { harvest: 0xffe56d, transfer: 0xffffff, build: 0x4fc3f7, upgrade: 0x9b6dff, attack: 0xff4444, heal: 0x66ff66, repair: 0x4fc3f7 };
    for (const e of v.events || []) if (BC[e.t] !== undefined) { g.lineStyle(1.5, BC[e.t], .9).moveTo((e.fx + .5) * TS, (e.fy + .5) * TS).lineTo((e.x + .5) * TS, (e.y + .5) * TS); }
    this.drawSel(); this.onTick && this.onTick();
  }
  select(o) { this.selected = o; this.drawSel(); }
  drawSel() { const g = this.selG; g.clear(); const o = this.selected; if (!o || !this.view) return; const cur = this.find(o); if (!cur) return; if (!o.kind || o.kind !== 'creep') g.lineStyle(1.5, 0xffffff, .9).drawRect(cur.x * TS, cur.y * TS, TS, TS); }
  find(o) { const v = this.view; if (!v || !o) return null; const L = { creep: v.creeps, spawn: v.spawns, source: v.sources, site: v.sites, controller: v.controllers, structure: v.structures, mineral: v.minerals || [], resource: v.resources || [], tombstone: v.tombstones || [] }[o.kind]; return L ? L.find(x => x.id === o.id) : null; }
  // ===== 每帧：creep 线性插值 + 镜头 =====
  frame() {
    const now = performance.now(); this._fpsN++; if (now - this._fpsT > 500) { this.fps = this._fpsN * 1000 / (now - this._fpsT); this._fpsN = 0; this._fpsT = now; }
    const s = this.scale; this.world.scale.set(s); this.world.x = innerWidth / 2 - this.cx * s; this.world.y = innerHeight / 2 - this.cy * s;
    const vx0 = this.cx - innerWidth / 2 / s, vy0 = this.cy - innerHeight / 2 / s, vx1 = this.cx + innerWidth / 2 / s, vy1 = this.cy + innerHeight / 2 / s, RS = ROOM * TS;
    for (const [sp, tx] of this.rooms) sp.visible = tx.visible = !(sp.x > vx1 || sp.y > vy1 || sp.x + RS < vx0 || sp.y + RS < vy0); // 视野外剔除
    const a = Math.min(1, (now - this.tickAt) / this.dt);
    for (const c of this.creepL.children) { const d = c.data; if (!d) continue; const px = d.px ?? d.x, py = d.py ?? d.y; c.x = (px + (d.x - px) * a + .5) * TS; c.y = (py + (d.y - py) * a + .5) * TS; }
    this.beamG.alpha = 1 - a;
    const o = this.selected; if (o && o.kind === 'creep') { const c = this.sprites.get(o.id); this.selG.clear(); if (c) this.selG.lineStyle(1.5, 0xffffff, .9).drawCircle(c.x, c.y, TS * .6); }
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
  zoom(f) { this.scale = Math.min(4, Math.max(0.2, this.scale * f)); }
}
