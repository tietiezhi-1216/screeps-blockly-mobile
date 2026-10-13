// PixiJS 渲染层：外观对照官方 Screeps 客户端。只读视图；静态外形缓存为贴图（每种类型/状态一张），逐帧只做 creep 插值与镜头。
// setView 可以接收引擎快照，也可以直接接收原始 world（会先转换成快照），两者字段一致。
const TS = 16;
const PART_COL = { work: 0xffe56d, carry: 0x777777, move: 0xa9b7c6, attack: 0xf93842, ranged_attack: 0x5d80b2, heal: 0x65fd62, claim: 0xb99cfb, tough: 0xffffff };
const MINERAL_COL = { H: 0xcccccc, O: 0xcccccc, U: 0x50d7f9, L: 0x00f4a2, K: 0x9370ff, Z: 0xf2d28b, X: 0xff7b7b };
const FLAG_COL = [0, 0xf44336, 0x9c27b0, 0x2196f3, 0x00bcd4, 0x4caf50, 0xffeb3b, 0xff9800, 0x795548, 0x9e9e9e, 0xffffff];
const ENERGY = 0xffe56d, RES = 64; // 贴图分辨率：1 格 = 64px
// 尺寸（单位：格，对照官方客户端比例）：creep 半径 .38（身体 .32）· spawn 外径 1 格（核心直径 .7）· extension 半径 .4 · controller ≈1 格
// source .6 方块 · tower 外径 .8 · storage .8×.9 · container .5×.6 · road 线宽 .15 · rampart/墙 整格 · lab 外径 .7 · terminal ≈.9 · 工地环半径 .4
const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
class Renderer {
  constructor(host) {
    this.app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x0a0a0a, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true, powerPreference: 'high-performance' });
    host.appendChild(this.app.view); this.app.view.id = 'world';
    this.world = new PIXI.Container(); this.app.stage.addChild(this.world);
    const L = () => { const c = new PIXI.Container(); this.world.addChild(c); return c; };
    this.bgG = new PIXI.Graphics(); this.world.addChild(this.bgG); this.terrainL = L(); this.miniG = new PIXI.Graphics(); this.roadG = new PIXI.Graphics(); this.world.addChild(this.roadG); this.groundL = L(); this.objL = L(); this.beamG = new PIXI.Graphics(); this.world.addChild(this.beamG); this.creepL = L(); this.topL = L(); this.labelL = L(); this.visG = new PIXI.Graphics(); this.world.addChild(this.visG); this.visT = L(); this.selG = new PIXI.Graphics(); this.world.addChild(this.selG); this.world.addChildAt(this.miniG, 2); this.lod = 'full'; this._bgS = 0;
    this.scale = 1.6; this.cx = 25 * TS; this.cy = 25 * TS; this.view = null; this.roomsVer = -1; this.sprites = new Map(); this.tickAt = performance.now(); this.dt = 500;
    this.texCache = new Map(); this.rooms = []; this.onTap = null; this.selected = null; this.myPid = null; this._roadSig = '';
    this.fps = 60; this._fpsN = 0; this._fpsT = performance.now();
    this.bindInput(); this.app.ticker.add(() => this.frame());
    if (typeof ART !== 'undefined') ART.ready(() => { for (const [k, t] of this.texCache) if (k.startsWith('o:')) { t.destroy(true); this.texCache.delete(k); } for (const s of this.sprites.values()) s.destroy({ children: true }); this.sprites.clear(); this._mvSig = ''; if (this.view) this.setView(this.view, this.dt); });
  }
  reset() { if (this.roomSp) { for (const e of this.roomSp.values()) { e.sp.destroy(); e.tx.destroy(); } this.roomSp.clear(); } this.rooms = []; for (const s of this.sprites.values()) s.destroy({ children: true }); this.sprites.clear(); this.view = null; this.roomsVer = -1; this.selected = null; this.beamG.clear(); this.roadG.clear(); this._roadSig = ''; }
  pause(p) { p ? this.app.ticker.stop() : this.app.ticker.start(); }
  // 房间视图：整房间适配屏幕宽度并居中（官方客户端默认一屏一个房间）
  fitRoom(rx, ry) { const lb = innerWidth > innerHeight ? 56 : 0; this.scale = (innerWidth > innerHeight ? Math.min(innerWidth - lb, innerHeight - 34) : Math.min(innerWidth, innerHeight - 140)) / (ROOM * TS); this.cx = (rx * ROOM + 25) * TS; this.cy = (ry * ROOM + 25) * TS; }
  curRoom() { return [Math.floor(this.cx / TS / ROOM), Math.floor(this.cy / TS / ROOM)]; }
  // 图层开关：grid 网格 / names 房间名 / owner 领地着色
  setOverlay(k, on) {
    this.ov = this.ov || {}; this.ov[k] = on;
    if (k === 'grid') { this.showGrid = on; for (const e of this.rooms) if (e.full) { if (e.sp.texture === e.full) e.sp.texture = this.miniTex(e); e.full.destroy(true); e.full = null; } }
    if (k === 'names') this.labelL.visible = on;
    if (k === 'owner') { this.roomsVer = -1; if (this.view) this.setView(this.view, 1); }
  }
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
  // 平滑进度环（官方 spawn 的 arc）：按半径取足够多的分段，圆头端点
  static ringArc(G, r, w, color, f) { f = Math.max(0, Math.min(1, f)); if (f <= 0) return; const a0 = -Math.PI / 2, a1 = a0 + f * Math.PI * 2, n = Math.max(8, Math.ceil(f * 128));
    G.lineStyle({ width: w, color, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND }); G.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; G.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
  // 官方 creep.metadata：资源圆从中心向外填充，半径 = min(1, 量/容量) × 20/100 格；白=全部资源，红=能量+power，黄=能量（叠放）
  storeCircles(C, st, cap) { if (!C.d) { C.d = [0xffffff, 0xf41f33, 0xffe56d].map(t => { const d = this.sprite(this.disc(), 1, 1); d.tint = t; C.addChild(d); return d; }); }
    const tot = Object.values(st).reduce((a, b) => a + (b || 0), 0), en = st.energy || 0, pw = st.power || 0, v = [tot > en + pw ? tot : 0, pw > 0 ? en + pw : 0, en];
    C.d.forEach((d, i) => { const r = cap ? Math.min(1, v[i] / cap) * TS * .2 : 0; d.visible = r > 0; d.width = d.height = r * 2; }); }
  static poly(g, pts, fill, stroke, lw) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
  ring(mine) { return mine ? '#c5c5c5' : '#e05050'; }
  structTex(type, mine, o) {
    if (typeof ART !== 'undefined') { const a = ART.spec(type, Object.assign({ mine }, o || {})); if (a) return [this.tex('o:' + a.key, a.w, a.h, a.draw), a.w, a.h, a]; }
    const C = Renderer.circle, RR = Renderer.rrect, P = Renderer.poly, ring = this.ring(mine), D = '#181818';
    switch (type) {
      case 'invaderCore': return [this.tex('invCore', 1.4, 1.4, g => { C(g, .62, '#000'); C(g, .55, null, '#d32f2f', .07); const h = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; h.push([Math.cos(a) * .36, Math.sin(a) * .36]); } P(g, h, '#2a0a0a', '#ff5252', .05); C(g, .13, '#ff5252'); }), 1.4]; // 官方 Invader Core：黑底红环 + 六边形核心
      case 'keeperLair': return [this.tex('keeperLair', 1, 1, g => { C(g, .48, '#111'); C(g, .44, null, '#c33', .05); C(g, .2, '#622'); }), 1];
      case 'spawn': return [this.tex('spawn' + mine, 1.4, 1.4, g => { C(g, .5, '#000'); C(g, .45, null, ring, .045); C(g, .41, '#111'); }), 1.4];
      case 'extension': return [this.tex('ext' + mine, .9, .9, g => { C(g, .4, '#000'); C(g, .34, null, ring, .07); C(g, .28, '#111'); }), .9];
      case 'tower': return [this.tex('tower' + mine, 1, 1, g => { C(g, .4, '#000'); C(g, .34, null, ring, .07); C(g, .27, '#111'); }), 1];
      case 'container': return [this.tex('cont', .7, .8, g => { RR(g, -.25, -.3, .5, .6, .05, '#1d1d1d', '#a0a0a0', .06); }), .7, .8];
      case 'storage': return [this.tex('stor' + mine, 1, 1.2, g => { RR(g, -.4, -.45, .8, .9, .12, '#000', ring, .06); RR(g, -.32, -.37, .64, .74, .08, '#111'); }), 1, 1.2];
      case 'link': return [this.tex('link' + mine, 1, 1, g => { P(g, [[0, -.45], [.33, 0], [0, .45], [-.33, 0]], '#000', ring, .07); P(g, [[0, -.32], [.22, 0], [0, .32], [-.22, 0]], '#111'); }), 1];
      case 'extractor': return [this.tex('extr' + mine, 1.4, 1.4, g => { for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * Math.PI / 3); RR(g, -.1, -.66, .2, .18, .03, '#000', ring, .05); g.restore(); } C(g, .5, null, ring, .07); }), 1.4];
      case 'lab': return [this.tex('lab' + mine, 1, 1, g => { C(g, .35, '#000', ring, .06); C(g, .24, '#111'); RR(g, -.24, .16, .48, .16, .04, '#000', ring, .04); }), 1];
      case 'terminal': return [this.tex('term' + mine, 1.2, 1.2, g => { const o = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; o.push([Math.cos(a) * .48, Math.sin(a) * .48]); } P(g, o, '#000', ring, .06); P(g, [[0, -.28], [.28, 0], [0, .28], [-.28, 0]], '#222', '#888', .05); }), 1.2];
      case 'observer': return [this.tex('obs' + mine, 1, 1, g => { C(g, .42, '#000', ring, .07); C(g, .2, '#7fe0ff'); C(g, .09, '#000'); }), 1];
      case 'powerSpawn': return [this.tex('pspawn' + mine, 1.4, 1.4, g => { C(g, .5, '#000'); C(g, .43, null, '#f41f33', .08); C(g, .35, '#111'); }), 1.4];
      case 'nuker': return [this.tex('nuker' + mine, 1.2, 1.6, g => { P(g, [[0, -.75], [.5, .6], [-.5, .6]], '#000', ring, .07); P(g, [[0, -.5], [.3, .45], [-.3, .45]], '#111'); }), 1.2, 1.6];
      case 'factory': return [this.tex('fact' + mine, 1.2, 1.2, g => { const o = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? .44 : .55, a = i * Math.PI / 8; o.push([Math.cos(a) * r, Math.sin(a) * r]); } P(g, o, '#000', ring, .06); C(g, .3, '#111'); }), 1.2];
      case 'constructedWall': return [this.tex('cwall', 1, 1, g => { RR(g, -.5, -.5, 1, 1, .06, '#111', '#4a4a4a', .06); }), 1];
      case 'rampart': return [this.tex('ramp' + mine, 1, 1, g => { RR(g, -.5, -.5, 1, 1, .12, mine ? 'rgba(67,160,71,.38)' : 'rgba(224,80,80,.38)', mine ? '#43a047' : '#e05050', .06); }), 1];
    }
    return [this.tex('unk', 1, 1, g => C(g, .4, '#000', '#888', .07)), 1];
  }
  // 官方 creep：深色圆体；每种身体部件一段弧，弧长 = 数量/50 × 360°；MOVE 在后方（朝向的反面），其余部件在前方居中依次排列；TOUGH 为外圈。
  // 贴图朝上（前方 = 上），渲染时整体旋转到移动方向。中心是主人徽章，携带的能量为徽章外的一圈黄色。
  creepTex(body, mine, color) {
    const key = 'creep4' + body.join(',') + mine + color;
    return this.tex(key, 1, 1, g => {
      const cnt = t => body.filter(b => b === t).length, C = Renderer.circle, PER = Math.PI * 2 / 50;
      if (cnt('tough')) C(g, .47, null, 'rgba(255,255,255,' + Math.min(.9, .45 + cnt('tough') / 20) + ')', .05);
      C(g, .43, '#222', mine ? '#000' : hex(color), .03);
      const arc = (center, span, col) => { if (span <= 0) return; g.beginPath(); g.arc(0, 0, .345, center - span / 2, center + span / 2); g.strokeStyle = hex(col); g.lineWidth = .13; g.lineCap = 'butt'; g.stroke(); };
      arc(Math.PI / 2, cnt('move') * PER, PART_COL.move);
      const front = ['work', 'attack', 'ranged_attack', 'heal', 'claim'].filter(t => cnt(t)), total = front.reduce((a, t) => a + cnt(t), 0) * PER;
      let st = -Math.PI / 2 - total / 2; for (const t of front) { const sp = cnt(t) * PER; arc(st + sp / 2, sp, PART_COL[t]); st += sp; }
      C(g, .32, '#000'); // 官方 creep.metadata：内圈黑底 r=32/100
    });
  }
  // 玩家徽章贴图（官方 ScreepsBadge SVG → 图片），按徽章参数缓存
  badgeTex(b) {
    if (!b || typeof ScreepsBadge === 'undefined') return null; const key = 'badge' + JSON.stringify(b); let t = this.texCache.get(key); if (t) return t;
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N; t = PIXI.Texture.from(cv); this.texCache.set(key, t);
    const svg = ScreepsBadge.svg(b, N), img = new Image();
    img.onload = () => { const g = cv.getContext('2d'); g.save(); g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); g.clip(); g.drawImage(img, 0, 0, N, N); g.restore(); t.baseTexture.update(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
    return t;
  }
  // 主人徽章：每 tick 按当前资料绑定（改徽章 / 新玩家 / 局域网玩家都会实时更新）
  bindBadge(c, b, size) { const k = b ? JSON.stringify(b) : ''; if (c._bk === k) return; const t = this.badgeTex(b);
    if (!t) { if (c.bg) c.bg.visible = false; return; } c._bk = k; if (!c.bg) { c.bg = new PIXI.Sprite(t); c.bg.anchor.set(.5); c.addChild(c.bg); } c.bg.texture = t; c.bg.visible = true; c.bg.width = c.bg.height = size * TS; }
  disc() { return this.tex('disc', 1, 1, g => Renderer.circle(g, .5, '#fff')); }
  // ---------- 地形（官方：平原 #2b2b2b；墙 #111 实心块，相邻墙格融合、外凸角圆滑、内凹角补圆角；沼泽 #292b18 带细描边） ----------
  roomTexture(rx, ry, tiles) {
    const N = ROOM * TS, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    const T = (x, y) => (x < 0 || y < 0 || x >= ROOM || y >= ROOM) ? T_WALL : tiles[y * ROOM + x];
    g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, N, N);
    // 一类地形的融合轮廓：每格画成四个象限，象限外凸（两条正交邻居都不是同类）时为圆角；平原格上两条正交邻居都是该类时补内凹圆角
    const blob = (is, fill, rOut, rIn) => {
      g.fillStyle = fill; g.beginPath(); const h = TS / 2;
      for (let y = 0; y < ROOM; y++) for (let x = 0; x < ROOM; x++) {
        const X = x * TS, Y = y * TS;
        if (is(x, y)) {
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const qx = X + h + (sx < 0 ? -h : 0), qy = Y + h + (sy < 0 ? -h : 0); // 象限左上角
            const convex = !is(x + sx, y) && !is(x, y + sy);
            if (!convex) { g.rect(qx, qy, h, h); continue; }
            const cx = X + h, cy = Y + h, ox = X + h + sx * h, oy = Y + h + sy * h, r = rOut * TS;
            g.moveTo(cx, cy); g.lineTo(ox, cy); g.lineTo(ox, oy - sy * r); g.arcTo(ox, oy, ox - sx * r, oy, r); g.lineTo(cx, oy); g.closePath();
          }
        } else if (rIn) {
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            if (!(is(x + sx, y) && is(x, y + sy) && is(x + sx, y + sy))) continue;
            const ox = X + h + sx * h, oy = Y + h + sy * h, r = rIn * TS; // 内凹角：角上一小块减去四分之一圆
            const a0 = sy > 0 ? Math.PI / 2 : -Math.PI / 2, a1 = sx > 0 ? 0 : Math.PI, d = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            g.moveTo(ox, oy); g.lineTo(ox - sx * r, oy); g.arc(ox - sx * r, oy - sy * r, r, a0, a1, d > Math.PI); g.closePath();
          }
        }
      }
      g.fill();
    };
    const isS = (x, y) => T(x, y) === T_SWAMP;
    blob(isS, '#292b18', .35, 0);
    // 沼泽细描边：沿与非沼泽相邻的边画线
    g.strokeStyle = '#3a3e1d'; g.lineWidth = 1; g.beginPath();
    for (let y = 0; y < ROOM; y++) for (let x = 0; x < ROOM; x++) if (isS(x, y)) {
      const X = x * TS, Y = y * TS; if (!isS(x, y - 1)) { g.moveTo(X + 3, Y + .5); g.lineTo(X + TS - 3, Y + .5); } if (!isS(x, y + 1)) { g.moveTo(X + 3, Y + TS - .5); g.lineTo(X + TS - 3, Y + TS - .5); }
      if (!isS(x - 1, y)) { g.moveTo(X + .5, Y + 3); g.lineTo(X + .5, Y + TS - 3); } if (!isS(x + 1, y)) { g.moveTo(X + TS - .5, Y + 3); g.lineTo(X + TS - .5, Y + TS - 3); }
    }
    g.stroke();
    blob((x, y) => T(x, y) === T_WALL, '#111111', .45, .3);
    if (this.showGrid) { g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1; g.beginPath(); for (let i = 1; i < ROOM; i++) { g.moveTo(i * TS + .5, 0); g.lineTo(i * TS + .5, N); g.moveTo(0, i * TS + .5); g.lineTo(N, i * TS + .5); } g.stroke(); }
    return PIXI.Texture.from(c);
  }
  // 增量：只为新生成/边界变化的房间建精灵；贴图在房间进入视野时再画（frame 中每帧最多 2 张）
  rebuildTerrain(v) {
    if (!this.roomSp) this.roomSp = new Map();
    for (const k in v.rooms) {
      const r = v.rooms[k], own = r.owner && v.players[r.owner], sig = (this.ov && this.ov.owner ? 'o' : '') + (r.owner || '') + (own ? own.name : '') + '|' + r.tiles.slice(0, 50).join('') + r.tiles.slice(2450).join('') + r.tiles.filter((_, i) => i % 50 === 0 || i % 50 === 49).join('');
      let e = this.roomSp.get(k); if (e && e.sig === sig) continue;
      const [rx, ry] = k.split(',').map(Number);
      if (e) { e.full && e.full.destroy(true); e.miniT && e.miniT.destroy(true); e.sp.destroy(); e.tx.destroy(); }
      const sp = new PIXI.Sprite(PIXI.Texture.EMPTY); sp.x = rx * ROOM * TS; sp.y = ry * ROOM * TS; sp.width = sp.height = ROOM * TS; this.terrainL.addChild(sp);
      const tx = new PIXI.Text((r.name || roomNameXY(rx, ry)) + (own ? '  ' + own.name : ''), { fontFamily: 'sans-serif', fontSize: 20, fill: own ? own.color : 0x888888 }); tx.alpha = .6; tx.x = sp.x + 6; tx.y = sp.y + 4; this.labelL.addChild(tx);
      e = { sp, tx, sig, rx, ry, tiles: r.tiles, full: null, miniT: null }; this.roomSp.set(k, e);
    }
    this.rooms = [...this.roomSp.values()]; this.roomsVer = v.roomsVer;
    this.drawOwn(v);
  }
  // 归属层（v1.7.1）：独立的世界坐标 Graphics，不再挂在房间精灵下（旧做法随精灵贴图缩放会被放大到世界外）。自己绿色、他人红色，裁剪在世界范围内
  drawOwn(v) {
    if (!this.ownG) { this.ownG = new PIXI.Graphics(); this.ownG.name = 'ownG'; this.world.addChildAt(this.ownG, this.world.getChildIndex(this.terrainL) + 1); }
    const g = this.ownG; g.clear(); if (!(this.ov && this.ov.owner)) return; const RS = ROOM * TS, S = v.S || this._bgS || 0, b = 3;
    for (const k in v.rooms) { const r = v.rooms[k]; if (!r || !r.owner) continue; const [rx, ry] = k.split(',').map(Number); if (!(rx >= 0 && ry >= 0 && rx < S && ry < S)) continue;
      const c = r.owner === this.myPid ? 0x00ff00 : 0xff0000, x = rx * RS, y = ry * RS;
      g.beginFill(c, .12).drawRect(x, y, RS, RS).endFill(); g.beginFill(c, .6); g.drawRect(x, y, RS, b); g.drawRect(x, y + RS - b, RS, b); g.drawRect(x, y + b, b, RS - 2 * b); g.drawRect(x + RS - b, y + b, b, RS - 2 * b); g.endFill(); }
  }
  // 无视野房间：地形照常显示，上面盖一层暗色（同官方：能看地形，看不到对象）
  drawFog(v) {
    if (!this.fogG) { this.fogG = new PIXI.Graphics(); this.world.addChildAt(this.fogG, this.world.getChildIndex(this.labelL)); }
    const sig = v.vis ? v.S + '|' + v.vis.slice().sort().join(';') : ''; if (sig === this._fogSig) return; this._fogSig = sig; const g = this.fogG; g.clear(); if (!v.vis) return;
    const vs = new Set(v.vis), R = ROOM * TS; g.beginFill(0x000000, .32);
    for (let ry = 0; ry < v.S; ry++) for (let rx = 0; rx < v.S; rx++) if (!vs.has(rx + ',' + ry)) g.drawRect(rx * R, ry * R, R, R);
    g.endFill();
  }
  // 官方地图视图（processor.js mapView）：无视野房间里各玩家 / NPC 对象只显示为色块（Source Keeper、Invader 为红色，Keeper Lair 暗红），不显示对象本身
  drawMapView(v) {
    if (!this.mvG) { this.mvG = new PIXI.Graphics(); this.world.addChildAt(this.mvG, this.world.getChildIndex(this.labelL)); }
    if (!this.mvL) { this.mvL = new PIXI.Container(); this.world.addChildAt(this.mvL, this.world.getChildIndex(this.labelL)); }
    const L = v.mapView || [], full = this.lod === 'full', sig = v.S + '|' + full + '|' + (typeof ART !== 'undefined' && ART.ok) + '|' + L.length + '|' + L.map(p => p[0] * 7 + p[1] * 13 + (p[2] + '').length).reduce((a, b) => (a * 31 + b) | 0, 0); if (sig === this._mvSig) return; this._mvSig = sig;
    const g = this.mvG; g.clear(); this.mvL.removeChildren().forEach(c => c.destroy()); const me = this.myPid, COL = { k: 0x8a1c1c, w: 0x111111, r: 0x5a5a5a, pb: 0xf41f33, p: 0x7fd4ff };
    // 放大到房间时，无视野房间里的 NPC / 中立对象也按官方外观画（Keeper Lair、Source Keeper、Invader、Power Bank、传送门、墙、道路），只有玩家对象仍是色块
    const ART_K = { k: 'keeperLair', pb: 'powerBank', p: 'portal', w: 'constructedWall' };
    for (const [x, y, k] of L) {
      if (full && typeof ART !== 'undefined') {
        if (ART_K[k]) { const [t, w, h] = this.structTex(ART_K[k], false); this.sprite(t, w, h ?? w, this.mvL, x, y); continue; }
        if (k === 'r') { g.beginFill(0x666666).drawCircle((x + .5) * TS, (y + .5) * TS, TS * .075).endFill(); continue; }
        if (k === '__keeper' || k === '__invader') { const c = new PIXI.Container(); c.x = (x + .5) * TS; c.y = (y + .5) * TS; c.addChild(this.sprite(this.creepTex(k === '__keeper' ? KEEPER_BODY : ['attack', 'attack', 'ranged_attack', 'move', 'move', 'move'], false, 0xff0000), 1, 1)); c.addChild(this.sprite(this.tex('o:creepNpc', 1, 1, g2 => g2.drawImage(ART.tint('creep-npc'), -.5, -.5, 1, 1)), 1, 1)); this.mvL.addChild(c); continue; }
      }
      const c = COL[k] ?? (k === me ? 0x4caf50 : 0xe0302f), r = k === 'k' ? TS * .62 : k === 'r' ? TS * .22 : TS * .42; g.beginFill(c, k === 'r' ? .8 : 1).drawRect((x + .5) * TS - r, (y + .5) * TS - r, r * 2, r * 2).endFill(); }
  }
  drawRoads(roads) { // 官方道路：相邻道路之间连线，孤立道路为圆点
    const sig = roads.map(r => r.x + ',' + r.y).sort().join(';'); if (sig === this._roadSig) return; this._roadSig = sig;
    const g = this.roadG, set = new Set(roads.map(r => r.x + ',' + r.y)); g.clear();
    for (const r of roads) {
      const cx = (r.x + .5) * TS, cy = (r.y + .5) * TS; g.lineStyle(0).beginFill(0x666666).drawCircle(cx, cy, TS * .075).endFill();
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) if (set.has((r.x + dx) + ',' + (r.y + dy))) g.lineStyle(TS * .15, 0x666666, 1).moveTo(cx, cy).lineTo(cx + dx * TS, cy + dy * TS);
    }
  }
  // ===== 每 tick 一次 =====
  setView(v, dt) {
    if (v && v.gen !== undefined) { const raw = v; v = worldSnapshot(raw, typeof engine !== 'undefined' && engine && engine.w === raw ? engine.events : [], this.myPid); v.rooms = raw.rooms; } // 原始 world → 快照
    const first = !this.view; this.view = v; this.dt = dt; this.tickAt = performance.now();
    if (v.roomsVer !== this.roomsVer && v.rooms) this.rebuildTerrain(v);
    if (this.lod === 'mini') this.drawMini(v);
    this.drawFog(v); this.drawMapView(v);
    if (first) { const me = v.spawns.find(s => s.owner === this.myPid) || v.spawns[0]; if (me) this.focus(me.x, me.y); }
    const me = this.myPid, mine = o => !o.owner || o.owner === me, col = o => v.players[o]?.color ?? 0xffffff, seen = new Set();
    const ent = (id, make) => { seen.add(id); let s = this.sprites.get(id); if (!s) { s = make(); this.sprites.set(id, s); } return s; };
    const fillDisc = (c, f, r) => { f = Math.max(0, Math.min(1, f || 0)); if (c._f !== f) { c._f = f; c.e.visible = f > 0; c.e.width = c.e.height = TS * 2 * r * Math.sqrt(f); } };
    this.drawRoads(v.structures.filter(s => s.type === 'road'));
    for (const r of v.structures) {
      if (r.type === 'road') continue;
      const m = mine(r), c = ent(r.id + (m ? '' : 'h'), () => {
        const c = new PIXI.Container(), [t, w, h, a] = this.structTex(r.type, m, { cap: r.energyCapacity, npc: r.owner === '__invader' || r.owner === '__keeper' }); c.addChild(this.sprite(t, w, h ?? w)); c.art = a; c.x = (r.x + .5) * TS; c.y = (r.y + .5) * TS;
        if (['extension', 'storage', 'link', 'container', 'terminal', 'powerSpawn', 'factory'].includes(r.type)) {
          const e = r.type === 'storage' || r.type === 'container' ? new PIXI.Sprite(PIXI.Texture.WHITE) : r.type === 'link' ? this.sprite(this.tex('o:linkE', 1, 1, g => g.drawImage(ART.tint('link-energy'), -.5, -.5, 1, 1)), 1, 1) : this.sprite(this.disc(), 1, 1); if (r.type === 'link') e.tint = 0xffffff; else e.anchor.set(.5, r.type === 'storage' || r.type === 'container' ? 1 : .5); e.tint = ENERGY; c.addChild(e); c.e = e; if (r.type === 'link') e.tint = 0xffffff;
        }
        if (r.type === 'tower') { const npc = r.owner === '__invader', tu = this.sprite(this.tex('o:turret' + npc, 1.15, 1.15, g => g.drawImage(ART.tint(npc ? 'tower-rotatable-npc' : 'tower-rotatable'), -.575, -.575, 1.15, 1.15)), 1.15, 1.15); c.addChild(tu); c.turret = tu; } // 官方 tower.metadata：底座 200 + 可旋转炮塔 115
        if (r.type === 'keeperLair' || r.type === 'invaderCore') { c.pr = new PIXI.Graphics(); c.addChild(c.pr); }
        (r.type === 'rampart' ? this.topL : this.objL).addChild(c); return c;
      });
      if (c.e) {
        const f = (r.energy || 0) / (r.energyCapacity || 1);
        if (r.type === 'storage' || r.type === 'container') { const W = r.type === 'storage' ? .56 : .4, H = r.type === 'storage' ? .7 : .5; if (c._f !== f) { c._f = f; c.e.width = W * TS; c.e.height = H * TS * Math.min(1, f); c.e.y = H * TS / 2; c.e.visible = f > 0; } }
        else if (r.type === 'link') { if (c._f !== f) { c._f = f; c.e.visible = f > 0; c.e.width = c.e.height = TS * .5 * f; } } // 官方 link-energy 50，按能量缩放
        else fillDisc(c, f, r.type === 'extension' ? (c.art && c.art.size || .68) * .32 : r.type === 'powerSpawn' ? .38 : .3);
      }
    }
    for (const r of v.structures) if (r.type === 'keeperLair' || r.type === 'invaderCore') { const c = this.sprites.get(r.id + (mine(r) ? '' : 'h')); if (!c || !c.pr) continue; // 官方 keeperLair：守卫刷新倒计时（300 tick）；invaderCore：部署倒计时
      const left = r.type === 'keeperLair' ? r.ticksToSpawn : r.deploy, tot = r.type === 'keeperLair' ? 300 : 5000, k = left ?? ''; if (c._lk === k) continue; c._lk = k; c.pr.clear(); if (left > 0) Renderer.ringArc(c.pr, TS * (r.type === 'keeperLair' ? .55 : .3), TS * .08, 0xff0d39, 1 - left / tot); }
    for (const c of v.controllers || []) { // 官方 Controller：黑色八边形，外圈 8 段亮起表示 RCL，中心为升级进度
      const k = c.level + '|' + (c.owner ? (mine(c) ? 'm' : 'h') : 'n'), s = ent(c.id, () => { const s = new PIXI.Container(); s.x = (c.x + .5) * TS; s.y = (c.y + .5) * TS; const pr = new PIXI.Graphics(); s.pr = pr; this.objL.addChild(s); return s; });
      if (s._k !== k) { s._k = k; if (s.base) s.base.destroy(); const [t, w] = this.structTex('controller', mine(c), { level: c.level, owner: c.owner }); s.base = this.sprite(t, w, w); s.addChildAt(s.base, 0); s.addChild(s.pr); } // 官方 controller.metadata：200 底 + 每级一段 controller-level，中心徽章 r=37
      if (c.owner) this.bindBadge(s, v.players[c.owner]?.badge, .74); if (s.bg) s.setChildIndex(s.pr, s.children.length - 1);
      const p = c.level && c.level < 8 && c.progressTotal ? c.progress / c.progressTotal : 0; if (s._p !== p) { s._p = p; s.pr.clear(); if (p > 0) Renderer.ringArc(s.pr, TS * .4, TS * .06, 0xffffff, p); }
    }
    for (const st of v.sites) { // 官方工地：细圆环 + 进度填充（他人工地红色）
      const m = mine(st), g = ent(st.id, () => { const g = new PIXI.Graphics(); g.x = (st.x + .5) * TS; g.y = (st.y + .5) * TS; this.groundL.addChild(g); return g; });
      if (g._p !== st.progress) { g._p = st.progress; g.clear(); const cc = m ? 0xffffff : 0xff7777; g.lineStyle(TS * .1, cc, .35).drawCircle(0, 0, TS * .2); Renderer.ringArc(g, TS * .2, TS * .1, cc, st.progress / (st.total || 1)); if (!g.ic) { const [t] = this.structTex(st.type, m, { cap: 50 }); g.ic = this.sprite(t, 1, 1); g.ic.alpha = .35; g.ic.scale.set(g.ic.scale.x * .5); g.addChildAt(g.ic, 0); } } // 官方 constructionSite：siteProgress r=20 线宽 10 + 半透明建筑轮廓
    }
    for (const mn of v.minerals || []) { const s = ent(mn.id, () => { const c = new PIXI.Container(); const [t, w] = this.structTex('mineral', true, { mineral: mn.type }); c.addChild(this.sprite(t, w, w)); c.scale.set(.8); c.x = (mn.x + .5) * TS; c.y = (mn.y + .5) * TS; this.objL.addChild(c); return c; }); s.alpha = mn.amount > 0 ? 1 : .4; } // 官方 mineral.metadata：r=54 底色 + 前景描边 + 字母
    for (const r of v.resources || []) { const g = ent(r.id, () => { const c = new PIXI.Container(); c.e = this.sprite(this.disc(), 1, 1); c.e.tint = r.resourceType === 'energy' ? ENERGY : (MINERAL_COL[r.resourceType] ?? 0xffffff); c.addChild(c.e); c.x = (r.x + .5) * TS; c.y = (r.y + .5) * TS; this.groundL.addChild(c); return c; }); fillDisc(g, Math.min(1, .15 + r.amount / 1000), .3); }
    for (const d of v.deposits || []) { // 官方 Deposit：高速公路房间的多边形资源点
      const s = ent(d.id, () => { const [t, w] = this.structTex('deposit', true, { depositType: d.depositType }); return this.sprite(t, w, w, this.objL, d.x, d.y); });
      s.alpha = d.cooldown > 0 ? .6 : 1;
    }
    { // RoomVisual：只画自己的视觉（官方：其他玩家看不到）
      const g = this.visG; g.clear(); this.visT.removeChildren().forEach(t => t.destroy());
      const hx = c => typeof c === 'string' ? parseInt(c.replace('#', '').padEnd(6, '0').slice(0, 6), 16) : (c ?? 0xffffff);
      const mv = (v.visuals || {})[me] || {};
      for (const rn in mv) { const p = parseRoomName(rn); if (!p) continue; const ox = p[0] * ROOM, oy = p[1] * ROOM, X = x => (ox + x + .5) * TS, Y = y => (oy + y + .5) * TS;
        for (const o of mv[rn]) { const st = o.s || {}, op = st.opacity ?? .5;
          if (o.t === 'l') g.lineStyle((st.width ?? .1) * TS, hx(st.color || '#ffffff'), op).moveTo(X(o.x1), Y(o.y1)).lineTo(X(o.x2), Y(o.y2));
          else if (o.t === 'c') { g.lineStyle(st.stroke ? (st.strokeWidth ?? .1) * TS : 0, hx(st.stroke), op); g.beginFill(hx(st.fill || '#ffffff'), op).drawCircle(X(o.x), Y(o.y), (st.radius ?? .15) * TS).endFill(); }
          else if (o.t === 'r') { g.lineStyle(st.stroke ? (st.strokeWidth ?? .1) * TS : 0, hx(st.stroke), op); g.beginFill(hx(st.fill || '#ffffff'), op).drawRect(X(o.x) - TS / 2, Y(o.y) - TS / 2, o.w * TS, o.h * TS).endFill(); }
          else if (o.t === 'p' && o.points.length > 1) { g.lineStyle((st.strokeWidth ?? .1) * TS, hx(st.stroke || '#ffffff'), op); if (st.fill) g.beginFill(hx(st.fill), op); g.moveTo(X(o.points[0][0]), Y(o.points[0][1])); for (const q of o.points.slice(1)) g.lineTo(X(q[0]), Y(q[1])); if (st.fill) g.endFill(); }
          else if (o.t === 't') { const t = new PIXI.Text(o.text, { fontSize: Math.max(8, (parseFloat(st.font) || .7) * TS), fill: hx(st.color || '#ffffff') }); t.anchor.set(st.align === 'left' ? 0 : st.align === 'right' ? 1 : .5, .8); t.alpha = st.opacity ?? 1; t.x = X(o.x); t.y = Y(o.y); this.visT.addChild(t); }
        } }
    }
    for (const n of v.nukes || []) { // 官方核弹：紫色菱形 + 落地倒计时
      const s = ent(n.id, () => { const c = new PIXI.Container(); { const [t] = this.structTex('nuke', true); c.addChild(this.sprite(t, 1, 1)); } c.tl = new PIXI.Text('', { fontSize: 10, fill: 0xe0b0ff }); c.tl.anchor.set(.5, 1.6); c.addChild(c.tl); this.objL.addChild(c); return c; });
      s.tl.text = String(n.timeToLand); s.x = (n.x + .5) * TS; s.y = (n.y + .5) * TS;
    }
    for (const t of v.tombstones || []) { const s = ent(t.id, () => { const [tx] = this.structTex('tombstone', true); return this.sprite(tx, 1, 1, this.groundL, t.x, t.y); }); s.alpha = Math.min(1, .4 + (t.decay || 0) / 15); }
    for (const r of v.ruins || []) ent(r.id, () => { const [tx] = this.structTex('ruin', true); return this.sprite(tx, 1, 1, this.groundL, r.x, r.y); }); // 官方 ruin.svg
    for (const f of v.flags || []) { if (f.owner && f.owner !== me) continue; const k = f.color + '_' + f.secondaryColor, c = ent(f.id, () => { const c = new PIXI.Container(); c.x = (f.x + .5) * TS; c.y = (f.y + .5) * TS; this.topL.addChild(c); return c; }); if (c._k !== k) { c._k = k; c.removeChildren().forEach(x => x.destroy()); const [t, w] = this.structTex('flag', true, f); c.addChild(this.sprite(t, w, w)); } c.x = (f.x + .5) * TS; c.y = (f.y + .5) * TS; } // 官方 flag.metadata：flag + flag-secondary 200，按主/副颜色着色
    for (const so of v.sources) { // 官方能量源：圆角黄色方块，能量越少越暗
      const s = ent(so.id, () => { const c = new PIXI.Container(); const [t] = this.structTex('source', true); c.addChild(this.sprite(t, 1, 1)); c.e = this.sprite(this.tex('o:srcE', .6, .6, g => { g.beginPath(); g.roundRect ? g.roundRect(-.3, -.3, .6, .6, .15) : g.rect(-.3, -.3, .6, .6); g.fillStyle = '#ffe56d'; g.fill(); }), .6, .6); c.addChild(c.e); c.x = (so.x + .5) * TS; c.y = (so.y + .5) * TS; this.objL.addChild(c); return c; });
      { const f = Math.max(0, Math.min(1, so.energy / (so.cap || 1))); if (s._f !== f) { s._f = f; s.e.visible = f > 0; s.e.width = s.e.height = TS * .6 * f; } } // 官方 source.metadata：外框 40（描边 15 #595026）+ 能量块 60×能量比例
    }
    for (const sp of v.spawns) { // 官方：中心是主人徽章，外面一圈能量
      const m = mine(sp), c = ent(sp.id + (m ? '' : 'h'), () => { const c = new PIXI.Container(); const [t, w] = this.structTex('spawn', m); c.addChild(this.sprite(t, w, w)); c.e = this.sprite(this.disc(), 1, 1); c.e.tint = ENERGY; const pr = new PIXI.Graphics(); c.addChild(c.e, pr); c.pr = pr; c.x = (sp.x + .5) * TS; c.y = (sp.y + .5) * TS; this.objL.addChild(c); return c; });
      fillDisc(c, (sp.energy || 0) / (sp.cap || 300), .38); this.bindBadge(c, v.players[sp.owner]?.badge, .76); // 官方 spawn.metadata：徽章 r=38/100 if (c.bg) c.setChildIndex(c.bg, c.children.length - 1);
      const sk = sp.spawning ? sp.spawning.left + '/' + sp.spawning.total : ''; if (c._sk !== sk) { c._sk = sk; c.pr.clear(); if (sp.spawning) Renderer.ringArc(c.pr, TS * .5 - TS * .05, TS * .1, 0xcccccc, (sp.spawning.total - sp.spawning.left) / (sp.spawning.total || 1)); } // 官方 spawn.metadata：r=50 线宽 10 #CCCCCC，从正上方顺时针
    }
    for (const cr of v.creeps) {
      const m = cr.owner === me, c = ent(cr.id, () => { const c = new PIXI.Container(); c.bd = this.sprite(this.creepTex(cr.body, m, col(cr.owner)), 1, 1); c.addChild(c.bd);
        c.e = new PIXI.Container(); c.addChild(c.e); this.creepL.addChild(c); return c; });
      const npc = cr.owner === '__keeper' || cr.owner === '__invader'; if (npc && !c.npc) { c.npc = this.sprite(this.tex('o:creepNpc', 1, 1, g => g.drawImage(ART.tint('creep-npc'), -.5, -.5, 1, 1)), 1, 1); c.addChild(c.npc); } // 官方 creep.metadata：NPC（Source Keeper / Invader）中心是红色 creep-npc 标志，不画徽章和资源
      c.data = cr; if (cr.pc && !c.pcR) { c.pcR = new PIXI.Graphics(); c.pcR.lineStyle(TS * .07, 0xff5555, .95).drawCircle(0, 0, TS * .52); c.pcR.lineStyle(TS * .03, 0xffffff, .8).drawCircle(0, 0, TS * .6); c.addChild(c.pcR); } // Power Creep：外圈红白环
      if (!npc) this.bindBadge(c, v.players[cr.owner]?.badge, .52); if (c.bg && c.children.indexOf(c.bg) > c.children.indexOf(c.e)) c.setChildIndex(c.e, c.children.indexOf(c.bg)); // 官方：徽章 r=26/100，资源圆盖在徽章上
      if (!npc) { const st = cr.store || { energy: cr.energy || 0 }, cap = cr.cap ?? cr.body.filter(b => b === 'carry').length * 50, k = JSON.stringify(st) + cap; if (c._f !== k) { c._f = k; this.storeCircles(c.e, st, cap); } }
      if (cr.px != null && (cr.px !== cr.x || cr.py !== cr.y)) c.tgt = Math.atan2(cr.y - cr.py, cr.x - cr.px) + Math.PI / 2; // 面向移动方向（前方 = 贴图上方）
      else if (cr.face && (cr.face[0] !== cr.x || cr.face[1] !== cr.y)) c.tgt = Math.atan2(cr.face[1] - cr.y, cr.face[0] - cr.x) + Math.PI / 2; // 官方 creepActions：原地动作时正面转向目标
      if ((cr.say || '') !== (c._say || '')) { c._say = cr.say; if (c.say) { c.say.destroy(); c.say = null; } if (cr.say) { c.say = new PIXI.Text(cr.say, { fontSize: 11, fill: 0x111111 }); const bg = new PIXI.Graphics(); bg.beginFill(0xffffff, .9).drawRoundedRect(-c.say.width / 2 - 3, -c.say.height - 3, c.say.width + 6, c.say.height + 2, 3).endFill(); c.say.anchor.set(.5, 1); c.say.y = -2; const w = new PIXI.Container(); w.addChild(bg, c.say); w.y = -TS * .5; c.addChild(w); c.say = w; } }
    }
    for (const [id, s] of this.sprites) if (!seen.has(id)) { s.destroy({ children: true }); this.sprites.delete(id); }
    // 动作线（官方：细线，一个 tick 内淡出）
    const g = this.beamG; g.clear(); const BC = { harvest: ENERGY, transfer: 0xffffff, build: 0xffffff, upgrade: 0xffffff, attack: 0xf93842, heal: 0x65fd62, repair: 0xffffff };
    for (const e of v.events || []) if (BC[e.t] !== undefined) { g.lineStyle(1, BC[e.t], .7).moveTo((e.fx + .5) * TS, (e.fy + .5) * TS).lineTo((e.x + .5) * TS, (e.y + .5) * TS); }
    this.drawSel(); this.onTick && this.onTick();
  }
  select(o, tile) { this.selected = o; this.selTile = tile || null; this.drawSel(); }
  drawSel() { const g = this.selG; g.clear(); const pv = this.preview; if (pv) g.lineStyle(2, pv.ok ? 0x7ee2a0 : 0xff6b6b, 1).beginFill(pv.ok ? 0x7ee2a0 : 0xff6b6b, .25).drawRect(pv.x * TS, pv.y * TS, TS, TS).endFill(); const ts = this.selTile; if (ts) g.lineStyle(2, 0x5973ff, 1).beginFill(0x5973ff, .18).drawRect(ts.x * TS, ts.y * TS, TS, TS).endFill(); const o = this.selected; if (!o || !this.view) return; const cur = this.find(o); if (!cur) return; if (!o.kind || o.kind !== 'creep') g.lineStyle(1.5, 0xffffff, .9).drawRect(cur.x * TS, cur.y * TS, TS, TS); }
  find(o) { const v = this.view; if (!v || !o) return null; const L = { creep: v.creeps, spawn: v.spawns, source: v.sources, site: v.sites, controller: v.controllers, structure: v.structures, nuke: v.nukes || [], mineral: v.minerals || [], resource: v.resources || [], tombstone: v.tombstones || [], ruin: v.ruins || [], flag: v.flags || [] }[o.kind]; return L ? L.find(x => x.id === o.id) : null; }
  // ===== 每帧：creep 线性插值 + 镜头 =====
  frame() {
    const now = performance.now(); this._fpsN++; if (now - this._fpsT > 500) { this.fps = this._fpsN * 1000 / (now - this._fpsT); this._fpsN = 0; this._fpsT = now; }
    const s = this.scale; this.world.scale.set(s); this.world.x = innerWidth / 2 - this.cx * s; this.world.y = innerHeight / 2 - this.cy * s;
    const vx0 = this.cx - innerWidth / 2 / s, vy0 = this.cy - innerHeight / 2 / s, vx1 = this.cx + innerWidth / 2 / s, vy1 = this.cy + innerHeight / 2 / s, RS = ROOM * TS;
    // LOD：房间在屏幕上小于 ~300px 用低精度贴图 + 点；大于 ~380px 用完整细节（带滞回，避免抖动）
    const px = s * RS, lod = this.lod === 'full' ? (px < 260 ? 'mini' : 'full') : (px > 300 ? 'full' : 'mini');
    if (lod !== this.lod) { this.lod = lod; const full = lod === 'full'; for (const L of [this.roadG, this.groundL, this.objL, this.beamG, this.creepL, this.topL, this.selG]) L.visible = full; this.drawMini(this.view); if (this.view) this.drawMapView(this.view); this.onLod && this.onLod(lod); }
    if (this.view && this._bgS !== this.view.S) this.drawBg(this.view.S);
    let built = 0, fulls = 0; const ts = Math.max(1, 11 / (20 * s));
    for (const e of this.rooms) { const vis = !(e.sp.x > vx1 || e.sp.y > vy1 || e.sp.x + RS < vx0 || e.sp.y + RS < vy0); e.sp.visible = vis; e.tx.visible = vis && px > 90 && (!this.ov || this.ov.names !== false);
      if (e.full) fulls++;
      if (!vis) continue; e.tx.scale.set(lod === 'mini' ? ts : 1);
      if (lod === 'mini' || (!e.full && built >= 2)) { const m = this.miniTex(e); if (e.sp.texture !== m) { e.sp.texture = m; e.sp.width = e.sp.height = RS; } continue; }
      if (!e.full) { built++; e.full = this.roomTexture(e.rx, e.ry, e.tiles); }
      if (e.sp.texture !== e.full) { e.sp.texture = e.full; e.sp.width = e.sp.height = RS; }
    }
    if (fulls > 24) for (const e of this.rooms) if (!e.sp.visible && e.full) { if (e.sp.texture === e.full) e.sp.texture = this.miniTex(e); e.full.destroy(true); e.full = null; if (--fulls <= 20) break; }
    // 放大到完整细节时，视野里尚未生成的房间按需生成（每帧最多 1 个）
    if (lod === 'full' && this.onNeedRoom && this.view) { const S = this.view.S; outer: for (let ry = Math.max(0, Math.floor(vy0 / RS)); ry <= Math.min(S - 1, Math.floor(vy1 / RS)); ry++) for (let rx = Math.max(0, Math.floor(vx0 / RS)); rx <= Math.min(S - 1, Math.floor(vx1 / RS)); rx++) if (!this.roomSp?.has(rx + ',' + ry)) { this.onNeedRoom(rx, ry); break outer; } }
    const a = Math.min(1, (now - this.tickAt) / this.dt);
    const fdt = Math.min(100, now - (this._lastF || now)); this._lastF = now;
    for (const c of this.creepL.children) { const d = c.data; if (!d) continue; const px = d.px ?? d.x, py = d.py ?? d.y; c.x = (px + (d.x - px) * a + .5) * TS; c.y = (py + (d.y - py) * a + .5) * TS;
      if (c.tgt != null && c.bd) { let dr = c.tgt - c.bd.rotation; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); c.bd.rotation += Math.abs(dr) < .01 ? dr : dr * Math.min(1, fdt / 90); } } // 平滑转向
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
  zoom(f) { this.scale = Math.min(4, Math.max(0.015, this.scale * f)); }
  fitWorld(S) { const RS = ROOM * TS, L = innerWidth > innerHeight; this.scale = Math.min((innerWidth - (L ? 56 : 0)) / (S * RS), (innerHeight - (L ? 34 : 70)) / (S * RS)) * .96; this.cx = this.cy = S * RS / 2; }
  // 低精度房间：每格 1 像素（墙 #111 / 平原 #2b2b2b / 沼泽 #292b18），缩小时使用并缓存
  miniTex(e) {
    if (e.miniT) return e.miniT; const c = document.createElement('canvas'); c.width = c.height = ROOM; const g = c.getContext('2d'), img = g.createImageData(ROOM, ROOM), d = img.data;
    for (let i = 0; i < ROOM * ROOM; i++) { const t = +e.tiles[i], col = t === T_WALL ? [17, 17, 17] : t === T_SWAMP ? [41, 43, 24] : [43, 43, 43]; d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0); const t = PIXI.Texture.from(c); t.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST; return (e.miniT = t);
  }
  // 世界底图：所有房间（包括未生成）按类型着色
  drawBg(S) {
    const g = this.bgG, RS = ROOM * TS; g.clear(); this._bgS = S;
    for (let ry = 0; ry < S; ry++) for (let rx = 0; rx < S; rx++) { const t = roomType(rx, ry); g.beginFill(t === 'highway' ? 0x1a1a1a : t === 'center' ? 0x24221a : t === 'keeper' ? 0x2a1d1d : 0x202020).drawRect(rx * RS + 8, ry * RS + 8, RS - 16, RS - 16).endFill(); }
  }
  // 缩小视图里的对象：建筑/creep 画成玩家颜色的点，能量源黄点，Controller 白点，房间按所属着色
  drawMini(v) {
    if (this.ownG) this.ownG.visible = this.lod !== 'mini'; const g = this.miniG; g.clear(); if (this.lod !== 'mini' || !v) return; const RS = ROOM * TS, col = id => v.players[id]?.color ?? 0xe05050, dot = (o, c, r) => g.beginFill(c).drawRect((o.x + .5) * TS - r, (o.y + .5) * TS - r, r * 2, r * 2).endFill();
    // 官方地图归属层：自己的房间绿色、他人红色；预定的房间更淡。只画实心填充 + 内描边（不用 lineStyle，避免描边几何越界），严格对齐房间格并限制在世界范围内
    const S = v.S || this._bgS || 0, me = this.myPid, own = {}, om = v.owned || Object.fromEntries(Object.entries(v.rooms || {}).filter(([, r]) => r && r.owner).map(([k, r]) => [k, r.owner])); for (const k in om) own[k] = [om[k], 1];
    for (const c of v.controllers || []) { const rv = c.reservation; const ro = rv && (rv.owner || rv.username); if (!c.owner && ro) { const k = Math.floor(c.x / ROOM) + ',' + Math.floor(c.y / ROOM); if (!own[k]) own[k] = [ro, 0]; } }
    for (const k in own) { const [rx, ry] = k.split(',').map(Number); if (!(rx >= 0 && ry >= 0 && rx < S && ry < S)) continue; const [o, full] = own[k], mineR = o === me, c = mineR ? 0x00ff00 : 0xff0000, x = rx * RS, y = ry * RS, b = TS * 1.5;
      g.beginFill(c, full ? .22 : .1).drawRect(x, y, RS, RS).endFill();
      if (full) { g.beginFill(c, .75); g.drawRect(x, y, RS, b); g.drawRect(x, y + RS - b, RS, b); g.drawRect(x, y + b, b, RS - 2 * b); g.drawRect(x + RS - b, y + b, b, RS - 2 * b); g.endFill(); } }
    for (const s of v.sources) dot(s, 0xffe56d, 22); for (const m of v.minerals || []) dot(m, 0xcccccc, 20);
    for (const c of v.controllers || []) dot(c, c.owner ? col(c.owner) : 0xffffff, 26);
    for (const s of v.structures || []) if (s.type !== 'road') dot(s, s.owner ? col(s.owner) : 0x777777, 14); else dot(s, 0x555555, 8);
    for (const s of v.spawns) dot(s, col(s.owner), 30); for (const c of v.creeps) dot(c, col(c.owner), 18);
  }
}
