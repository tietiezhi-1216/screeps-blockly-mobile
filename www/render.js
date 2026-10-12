// PixiJS 渲染层：外观对照官方 Screeps 客户端。只读视图；静态外形缓存为贴图（每种类型/状态一张），逐帧只做 creep 插值与镜头。
// setView 可以接收引擎快照，也可以直接接收原始 world（会先转换成快照），两者字段一致。
const TS = 16;
const PART_COL = { work: 0xffe56d, carry: 0x777777, move: 0xa9b7c6, attack: 0xf93842, ranged_attack: 0x5d80b2, heal: 0x65fd62, claim: 0xb99cfb, tough: 0xffffff };
const MINERAL_COL = { H: 0xcccccc, O: 0xcccccc, U: 0x50d7f9, L: 0x00f4a2, K: 0x9370ff, Z: 0xf2d28b, X: 0xff7b7b };
const FLAG_COL = [0, 0xf44336, 0x9c27b0, 0x2196f3, 0x00bcd4, 0x4caf50, 0xffeb3b, 0xff9800, 0x795548, 0x9e9e9e, 0xffffff];
const ENERGY = 0xffe56d, RES = 64; // 贴图分辨率：1 格 = 64px
const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
class Renderer {
  constructor(host) {
    this.app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x0a0a0a, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true, powerPreference: 'high-performance' });
    host.appendChild(this.app.view); this.app.view.id = 'world';
    this.world = new PIXI.Container(); this.app.stage.addChild(this.world);
    const L = () => { const c = new PIXI.Container(); this.world.addChild(c); return c; };
    this.terrainL = L(); this.roadG = new PIXI.Graphics(); this.world.addChild(this.roadG); this.groundL = L(); this.objL = L(); this.beamG = new PIXI.Graphics(); this.world.addChild(this.beamG); this.creepL = L(); this.topL = L(); this.labelL = L(); this.selG = new PIXI.Graphics(); this.world.addChild(this.selG);
    this.scale = 1.6; this.cx = 25 * TS; this.cy = 25 * TS; this.view = null; this.roomsVer = -1; this.sprites = new Map(); this.tickAt = performance.now(); this.dt = 500;
    this.texCache = new Map(); this.rooms = []; this.onTap = null; this.selected = null; this.myPid = null; this._roadSig = '';
    this.fps = 60; this._fpsN = 0; this._fpsT = performance.now();
    this.bindInput(); this.app.ticker.add(() => this.frame());
  }
  reset() { for (const s of this.sprites.values()) s.destroy({ children: true }); this.sprites.clear(); this.view = null; this.roomsVer = -1; this.selected = null; this.beamG.clear(); this.roadG.clear(); this._roadSig = ''; }
  pause(p) { p ? this.app.ticker.stop() : this.app.ticker.start(); }
  focus(x, y) { this.cx = (x + .5) * TS; this.cy = (y + .5) * TS; }
  // 画一张 w×h 格的贴图（坐标系：1 = 1 格，原点在中心），按 key 缓存
  tex(key, w, h, draw) {
    let t = this.texCache.get(key); if (t) return t;
    const c = document.createElement('canvas'); c.width = Math.round(w * RES); c.height = Math.round(h * RES);
    const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.scale(RES, RES); g.lineJoin = 'round'; draw(g);
    t = PIXI.Texture.from(c); this.texCache.set(key, t); return t;
  }
  sprite(t, w, h, layer, x, y) { const s = new PIXI.Sprite(t); s.anchor.set(.5); s.width = w * TS; s.height = h * TS; if (x != null) { s.x = (x + .5) * TS; s.y = (y + .5) * TS; } if (layer) layer.addChild(s); return s; }
  // ---------- 形状（官方客户端外观） ----------
  static circle(g, r, fill, stroke, lw) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
  static rrect(g, x, y, w, h, r, fill, stroke, lw) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
  static poly(g, pts, fill, stroke, lw) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
  ring(mine) { return mine ? '#c5c5c5' : '#e05050'; }
  structTex(type, mine) {
    const C = Renderer.circle, RR = Renderer.rrect, P = Renderer.poly, ring = this.ring(mine), D = '#181818';
    switch (type) {
      case 'spawn': return [this.tex('spawn' + mine, 1.4, 1.4, g => { C(g, .66, '#000'); C(g, .55, null, ring, .12); C(g, .44, '#111'); }), 1.4];
      case 'extension': return [this.tex('ext' + mine, .9, .9, g => { C(g, .4, '#000'); C(g, .33, null, ring, .09); C(g, .27, '#111'); }), .9];
      case 'tower': return [this.tex('tower' + mine, 1, 1, g => { C(g, .45, '#000'); C(g, .38, null, ring, .08); C(g, .3, '#111'); }), 1];
      case 'container': return [this.tex('cont', .7, .8, g => { RR(g, -.3, -.36, .6, .72, .06, '#1d1d1d', '#a0a0a0', .07); }), .7, .8];
      case 'storage': return [this.tex('stor' + mine, 1, 1.2, g => { RR(g, -.42, -.52, .84, 1.04, .14, '#000', ring, .07); RR(g, -.32, -.42, .64, .84, .08, '#111'); }), 1, 1.2];
      case 'link': return [this.tex('link' + mine, 1, 1, g => { P(g, [[0, -.45], [.33, 0], [0, .45], [-.33, 0]], '#000', ring, .07); P(g, [[0, -.32], [.22, 0], [0, .32], [-.22, 0]], '#111'); }), 1];
      case 'extractor': return [this.tex('extr' + mine, 1.4, 1.4, g => { for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * Math.PI / 3); RR(g, -.1, -.66, .2, .18, .03, '#000', ring, .05); g.restore(); } C(g, .5, null, ring, .07); }), 1.4];
      case 'lab': return [this.tex('lab' + mine, 1, 1, g => { C(g, .44, '#000', ring, .07); C(g, .3, '#111'); RR(g, -.3, .2, .6, .2, .05, '#000', ring, .05); }), 1];
      case 'terminal': return [this.tex('term' + mine, 1.2, 1.2, g => { const o = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; o.push([Math.cos(a) * .55, Math.sin(a) * .55]); } P(g, o, '#000', ring, .07); P(g, [[0, -.32], [.32, 0], [0, .32], [-.32, 0]], '#222', '#888', .05); }), 1.2];
      case 'observer': return [this.tex('obs' + mine, 1, 1, g => { C(g, .42, '#000', ring, .07); C(g, .2, '#7fe0ff'); C(g, .09, '#000'); }), 1];
      case 'powerSpawn': return [this.tex('pspawn' + mine, 1.4, 1.4, g => { C(g, .66, '#000'); C(g, .55, null, '#f41f33', .12); C(g, .44, '#111'); }), 1.4];
      case 'nuker': return [this.tex('nuker' + mine, 1.2, 1.6, g => { P(g, [[0, -.75], [.5, .6], [-.5, .6]], '#000', ring, .07); P(g, [[0, -.5], [.3, .45], [-.3, .45]], '#111'); }), 1.2, 1.6];
      case 'factory': return [this.tex('fact' + mine, 1.2, 1.2, g => { const o = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? .44 : .55, a = i * Math.PI / 8; o.push([Math.cos(a) * r, Math.sin(a) * r]); } P(g, o, '#000', ring, .06); C(g, .3, '#111'); }), 1.2];
      case 'constructedWall': return [this.tex('cwall', 1, 1, g => { RR(g, -.5, -.5, 1, 1, .06, '#111', '#4a4a4a', .06); }), 1];
      case 'rampart': return [this.tex('ramp' + mine, 1, 1, g => { RR(g, -.47, -.47, .94, .94, .14, mine ? 'rgba(67,160,71,.38)' : 'rgba(224,80,80,.38)', mine ? '#43a047' : '#e05050', .06); }), 1];
    }
    return [this.tex('unk', 1, 1, g => C(g, .4, '#000', '#888', .07)), 1];
  }
  creepTex(body, mine, color) { // 官方 creep：黑色圆体；MOVE 弧在下方，WORK/ATTACK/... 弧在上方，TOUGH 为外圈；CARRY 体现在中间能量
    const key = 'creep' + body.join(',') + mine + color;
    return this.tex(key, 1, 1, g => {
      const n = body.length || 1, cnt = t => body.filter(b => b === t).length, C = Renderer.circle;
      if (cnt('tough')) C(g, .46, null, 'rgba(255,255,255,' + (0.25 + 0.5 * cnt('tough') / n) + ')', .05);
      C(g, .42, '#202020', mine ? null : hex(color), .04);
      const arc = (center, span, col) => { g.beginPath(); g.arc(0, 0, .34, center - span / 2, center + span / 2); g.strokeStyle = hex(col); g.lineWidth = .1; g.stroke(); };
      const mv = cnt('move'); if (mv) arc(Math.PI / 2, Math.PI * 2 * Math.min(.5, mv / n), PART_COL.move);
      const top = ['work', 'attack', 'ranged_attack', 'heal', 'claim'].filter(t => cnt(t));
      const total = top.reduce((a, t) => a + cnt(t), 0); let start = -Math.PI / 2 - Math.PI * Math.min(.5, total / n);
      for (const t of top) { const span = Math.PI * 2 * Math.min(.5, total / n) * cnt(t) / total; arc(start + span / 2, span, PART_COL[t]); start += span; }
      C(g, .25, '#111');
    });
  }
  disc() { return this.tex('disc', 1, 1, g => Renderer.circle(g, .5, '#fff')); }
  // ---------- 地形（官方配色：平原 #2b2b2b、墙 #111 粗糙边、沼泽 #232f13） ----------
  roomTexture(rx, ry, tiles) {
    const N = ROOM * TS, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const T = (x, y) => (x < 0 || y < 0 || x >= ROOM || y >= ROOM) ? T_WALL : tiles[y * ROOM + x];
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = (px / TS) | 0, y = (py / TS) | 0, t = T(x, y), gx = rx * N + px, gy = ry * N + py, i = (py * N + px) * 4;
      let r, gg, b;
      if (t === T_WALL) {
        const fx = (px % TS) / TS, fy = (py % TS) / TS, rough = vnoise(7, gx / 3, gy / 3) * .4;
        const edge = (T(x - 1, y) !== T_WALL && fx < rough) || (T(x + 1, y) !== T_WALL && fx > 1 - rough) || (T(x, y - 1) !== T_WALL && fy < rough) || (T(x, y + 1) !== T_WALL && fy > 1 - rough);
        if (!edge) { r = gg = b = 17; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; continue; }
      }
      if (t === T_SWAMP) { const v = vnoise(11, gx / 6, gy / 6) * 6; r = 35 + v; gg = 47 + v; b = 19 + v / 2; }
      else { const v = (hash32(gx, gy, 3) / 4294967296) * 3; r = gg = b = 43 + v; }
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
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
  drawRoads(roads) { // 官方道路：相邻道路之间连线，孤立道路为圆点
    const sig = roads.map(r => r.x + ',' + r.y).sort().join(';'); if (sig === this._roadSig) return; this._roadSig = sig;
    const g = this.roadG, set = new Set(roads.map(r => r.x + ',' + r.y)); g.clear();
    for (const r of roads) {
      const cx = (r.x + .5) * TS, cy = (r.y + .5) * TS; g.lineStyle(0).beginFill(0x666666).drawCircle(cx, cy, TS * .14).endFill();
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) if (set.has((r.x + dx) + ',' + (r.y + dy))) g.lineStyle(TS * .28, 0x666666, 1).moveTo(cx, cy).lineTo(cx + dx * TS, cy + dy * TS);
    }
  }
  // ===== 每 tick 一次 =====
  setView(v, dt) {
    if (v && v.gen !== undefined) { const raw = v; v = worldSnapshot(raw, typeof engine !== 'undefined' && engine && engine.w === raw ? engine.events : []); v.rooms = raw.rooms; } // 原始 world → 快照
    const first = !this.view; this.view = v; this.dt = dt; this.tickAt = performance.now();
    if (v.roomsVer !== this.roomsVer && v.rooms) this.rebuildTerrain(v);
    if (first) { const me = v.spawns.find(s => s.owner === this.myPid) || v.spawns[0]; if (me) this.focus(me.x, me.y); }
    const me = this.myPid, mine = o => !o.owner || o.owner === me, col = o => v.players[o]?.color ?? 0xffffff, seen = new Set();
    const ent = (id, make) => { seen.add(id); let s = this.sprites.get(id); if (!s) { s = make(); this.sprites.set(id, s); } return s; };
    const fillDisc = (c, f, r) => { f = Math.max(0, Math.min(1, f || 0)); if (c._f !== f) { c._f = f; c.e.visible = f > 0; c.e.width = c.e.height = TS * 2 * r * Math.sqrt(f); } };
    this.drawRoads(v.structures.filter(s => s.type === 'road'));
    for (const r of v.structures) {
      if (r.type === 'road') continue;
      const m = mine(r), c = ent(r.id + (m ? '' : 'h'), () => {
        const c = new PIXI.Container(), [t, w, h] = this.structTex(r.type, m); c.addChild(this.sprite(t, w, h ?? w)); c.x = (r.x + .5) * TS; c.y = (r.y + .5) * TS;
        if (['extension', 'tower', 'storage', 'link', 'container', 'lab', 'terminal', 'powerSpawn', 'nuker', 'factory'].includes(r.type)) {
          const e = r.type === 'storage' || r.type === 'container' ? new PIXI.Sprite(PIXI.Texture.WHITE) : this.sprite(this.disc(), 1, 1); e.anchor.set(.5, r.type === 'storage' || r.type === 'container' ? 1 : .5); e.tint = ENERGY; c.addChild(e); c.e = e;
        }
        if (r.type === 'tower') { const tu = new PIXI.Graphics(); tu.beginFill(0x111111).lineStyle(TS * .05, m ? 0xc5c5c5 : 0xe05050).drawRect(-TS * .1, -TS * .62, TS * .2, TS * .5).endFill(); c.addChild(tu); c.turret = tu; }
        (r.type === 'rampart' ? this.topL : this.objL).addChild(c); return c;
      });
      if (c.e) {
        const f = (r.energy || 0) / (r.energyCapacity || 1);
        if (r.type === 'storage' || r.type === 'container') { const W = r.type === 'storage' ? .64 : .5, H = r.type === 'storage' ? .84 : .62; if (c._f !== f) { c._f = f; c.e.width = W * TS; c.e.height = H * TS * Math.min(1, f); c.e.y = H * TS / 2; c.e.visible = f > 0; } }
        else fillDisc(c, f, r.type === 'extension' ? .27 : r.type === 'link' ? .2 : .3);
      }
    }
    for (const c of v.controllers || []) { // 官方 Controller：黑色八边形，外圈 8 段亮起表示 RCL，中心为升级进度
      const k = c.level + '|' + (c.owner ? (mine(c) ? 'm' : 'h') : 'n'), s = ent(c.id, () => { const s = new PIXI.Container(); s.x = (c.x + .5) * TS; s.y = (c.y + .5) * TS; const pr = new PIXI.Graphics(); s.pr = pr; this.objL.addChild(s); return s; });
      if (s._k !== k) {
        s._k = k; if (s.base) s.base.destroy(); const lv = c.level, own = c.owner ? (mine(c) ? '#ffffff' : '#e05050') : '#555';
        s.base = this.sprite(this.tex('ctrl' + k, 1.6, 1.6, g => {
          const o = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; o.push([Math.cos(a) * .76, Math.sin(a) * .76]); } Renderer.poly(g, o, '#000', '#333', .04);
          for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(0, 0, .6, -Math.PI / 2 + i * Math.PI / 4 + .06, -Math.PI / 2 + (i + 1) * Math.PI / 4 - .06); g.strokeStyle = i < lv ? own : '#2a2a2a'; g.lineWidth = .16; g.stroke(); }
          Renderer.circle(g, .4, '#0d0d0d', '#444', .04);
        }), 1.6, 1.6); s.addChildAt(s.base, 0); s.addChild(s.pr);
      }
      const p = c.level && c.level < 8 && c.progressTotal ? c.progress / c.progressTotal : c.level === 8 ? 1 : 0; if (s._p !== p) { s._p = p; s.pr.clear(); if (p > 0) s.pr.beginFill(c.owner && mine(c) ? 0xffffff : 0xe05050, .55).drawCircle(0, 0, TS * .36 * Math.sqrt(p)).endFill(); }
    }
    for (const st of v.sites) { // 官方工地：细圆环 + 进度填充（他人工地红色）
      const m = mine(st), g = ent(st.id, () => { const g = new PIXI.Graphics(); g.x = (st.x + .5) * TS; g.y = (st.y + .5) * TS; this.groundL.addChild(g); return g; });
      if (g._p !== st.progress) { g._p = st.progress; g.clear(); const cc = m ? 0xffffff : 0xe05050; g.lineStyle(TS * .06, cc, .55).drawCircle(0, 0, TS * .3); g.lineStyle(0).beginFill(cc, .45).drawCircle(0, 0, TS * .24 * Math.sqrt(st.progress / st.total)).endFill(); }
    }
    for (const mn of v.minerals || []) { const s = ent(mn.id, () => { const c = new PIXI.Container(); c.addChild(this.sprite(this.tex('min' + mn.type, 1.2, 1.2, g => { const cc = hex(MINERAL_COL[mn.type] ?? 0xcccccc); Renderer.circle(g, .5, '#000', cc, .08); g.fillStyle = cc; g.font = 'bold .55px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mn.type, 0, .03); }), 1.2, 1.2)); c.x = (mn.x + .5) * TS; c.y = (mn.y + .5) * TS; this.objL.addChild(c); return c; }); s.alpha = mn.amount > 0 ? 1 : .4; }
    for (const r of v.resources || []) { const g = ent(r.id, () => { const c = new PIXI.Container(); c.e = this.sprite(this.disc(), 1, 1); c.e.tint = r.resourceType === 'energy' ? ENERGY : (MINERAL_COL[r.resourceType] ?? 0xffffff); c.addChild(c.e); c.x = (r.x + .5) * TS; c.y = (r.y + .5) * TS; this.groundL.addChild(c); return c; }); fillDisc(g, Math.min(1, .15 + r.amount / 1000), .3); }
    for (const t of v.tombstones || []) { const s = ent(t.id, () => { const c = new PIXI.Container(); c.addChild(this.sprite(this.tex('tomb', .7, .9, g => { Renderer.rrect(g, -.24, -.34, .48, .66, .2, '#3a3a3a', '#7a7a7a', .05); g.fillStyle = '#7a7a7a'; g.fillRect(-.03, -.22, .06, .3); g.fillRect(-.12, -.14, .24, .06); }), .7, .9)); c.x = (t.x + .5) * TS; c.y = (t.y + .5) * TS; this.groundL.addChild(c); return c; }); s.alpha = Math.min(1, .4 + (t.decay || 0) / 15); }
    for (const f of v.flags || []) { if (f.owner && f.owner !== me) continue; ent(f.id, () => { const c = new PIXI.Container(); c.addChild(this.sprite(this.tex('flag' + f.color + '_' + f.secondaryColor, 1, 1, g => { g.fillStyle = '#ddd'; g.fillRect(-.3, -.45, .05, .8); Renderer.poly(g, [[-.25, -.45], [.35, -.3], [-.25, -.12]], hex(FLAG_COL[f.color] || 0xffffff)); Renderer.poly(g, [[-.25, -.34], [.1, -.29], [-.25, -.22]], hex(FLAG_COL[f.secondaryColor] || 0xffffff)); }), 1, 1)); c.x = (f.x + .5) * TS; c.y = (f.y + .5) * TS; this.topL.addChild(c); return c; }); }
    for (const so of v.sources) { // 官方能量源：圆角黄色方块，能量越少越暗
      const s = ent(so.id, () => this.sprite(this.tex('src', 1, 1, g => Renderer.rrect(g, -.36, -.36, .72, .72, .16, '#ffe56d', '#5a4f1c', .05)), 1, 1, this.objL, so.x, so.y));
      s.alpha = .35 + .65 * (so.energy / (so.cap || 1));
    }
    for (const sp of v.spawns) {
      const m = mine(sp), c = ent(sp.id + (m ? '' : 'h'), () => { const c = new PIXI.Container(); const [t, w] = this.structTex('spawn', m); c.addChild(this.sprite(t, w, w)); c.e = this.sprite(this.disc(), 1, 1); c.e.tint = ENERGY; const pr = new PIXI.Graphics(); c.addChild(c.e, pr); c.pr = pr; c.x = (sp.x + .5) * TS; c.y = (sp.y + .5) * TS; this.objL.addChild(c); return c; });
      fillDisc(c, (sp.energy || 0) / (sp.cap || 300), .42);
      const sk = sp.spawning ? sp.spawning.left : -1; if (c._sk !== sk) { c._sk = sk; c.pr.clear(); if (sp.spawning) c.pr.lineStyle(TS * .1, 0xffffff, .8).arc(0, 0, TS * .55, -Math.PI / 2, -Math.PI / 2 + (1 - sp.spawning.left / sp.spawning.total) * Math.PI * 2); }
    }
    for (const cr of v.creeps) {
      const m = cr.owner === me, c = ent(cr.id, () => { const c = new PIXI.Container(); c.addChild(this.sprite(this.creepTex(cr.body, m, col(cr.owner)), 1, 1)); c.e = this.sprite(this.disc(), 1, 1); c.e.tint = ENERGY; c.addChild(c.e); this.creepL.addChild(c); return c; });
      c.data = cr; const cap = cr.body.filter(b => b === 'carry').length * 50; fillDisc(c, cap ? (cr.energy || 0) / cap : 0, .25);
      if ((cr.say || '') !== (c._say || '')) { c._say = cr.say; if (c.say) { c.say.destroy(); c.say = null; } if (cr.say) { c.say = new PIXI.Text(cr.say, { fontSize: 11, fill: 0x111111 }); const bg = new PIXI.Graphics(); bg.beginFill(0xffffff, .9).drawRoundedRect(-c.say.width / 2 - 3, -c.say.height - 3, c.say.width + 6, c.say.height + 2, 3).endFill(); c.say.anchor.set(.5, 1); c.say.y = -2; const w = new PIXI.Container(); w.addChild(bg, c.say); w.y = -TS * .5; c.addChild(w); c.say = w; } }
    }
    for (const [id, s] of this.sprites) if (!seen.has(id)) { s.destroy({ children: true }); this.sprites.delete(id); }
    // 动作线（官方：细线，一个 tick 内淡出）
    const g = this.beamG; g.clear(); const BC = { harvest: ENERGY, transfer: 0xffffff, build: 0xffffff, upgrade: 0xffffff, attack: 0xf93842, heal: 0x65fd62, repair: 0xffffff };
    for (const e of v.events || []) if (BC[e.t] !== undefined) { g.lineStyle(1, BC[e.t], .7).moveTo((e.fx + .5) * TS, (e.fy + .5) * TS).lineTo((e.x + .5) * TS, (e.y + .5) * TS); }
    this.drawSel(); this.onTick && this.onTick();
  }
  select(o) { this.selected = o; this.drawSel(); }
  drawSel() { const g = this.selG; g.clear(); const pv = this.preview; if (pv) g.lineStyle(2, pv.ok ? 0x7ee2a0 : 0xff6b6b, 1).beginFill(pv.ok ? 0x7ee2a0 : 0xff6b6b, .25).drawRect(pv.x * TS, pv.y * TS, TS, TS).endFill(); const o = this.selected; if (!o || !this.view) return; const cur = this.find(o); if (!cur) return; if (!o.kind || o.kind !== 'creep') g.lineStyle(1.5, 0xffffff, .9).drawRect(cur.x * TS, cur.y * TS, TS, TS); }
  find(o) { const v = this.view; if (!v || !o) return null; const L = { creep: v.creeps, spawn: v.spawns, source: v.sources, site: v.sites, controller: v.controllers, structure: v.structures, mineral: v.minerals || [], resource: v.resources || [], tombstone: v.tombstones || [], flag: v.flags || [] }[o.kind]; return L ? L.find(x => x.id === o.id) : null; }
  // ===== 每帧：creep 线性插值 + 镜头 =====
  frame() {
    const now = performance.now(); this._fpsN++; if (now - this._fpsT > 500) { this.fps = this._fpsN * 1000 / (now - this._fpsT); this._fpsN = 0; this._fpsT = now; }
    const s = this.scale; this.world.scale.set(s); this.world.x = innerWidth / 2 - this.cx * s; this.world.y = innerHeight / 2 - this.cy * s;
    const vx0 = this.cx - innerWidth / 2 / s, vy0 = this.cy - innerHeight / 2 / s, vx1 = this.cx + innerWidth / 2 / s, vy1 = this.cy + innerHeight / 2 / s, RS = ROOM * TS;
    for (const [sp, tx] of this.rooms) sp.visible = tx.visible = !(sp.x > vx1 || sp.y > vy1 || sp.x + RS < vx0 || sp.y + RS < vy0);
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
