// Canvas 渲染 + 触摸平移/双指缩放
class Renderer {
  constructor(canvas, engine) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.e = engine;
    this.scale = 14; this.cx = (ROOM + 12.5); this.cy = (ROOM + 12.5); this.onTap = null;
    this.resize(); addEventListener('resize', () => this.resize()); this.bindInput();
  }
  resize() { const d = devicePixelRatio || 1; this.dpr = d; this.c.width = innerWidth * d; this.c.height = innerHeight * d; }
  toWorld(px, py) { return { x: (px - innerWidth / 2) / this.scale + this.cx, y: (py - innerHeight / 2) / this.scale + this.cy }; }
  bindInput() {
    const pts = new Map(); let last = null, moved = 0;
    this.c.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; this.c.setPointerCapture(e.pointerId); });
    this.c.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId);
      if (pts.size === 1) { this.cx -= (e.clientX - p.x) / this.scale; this.cy -= (e.clientY - p.y) / this.scale; moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (last) this.zoom(d / last); last = d; moved = 99; }
    });
    const up = e => { if (pts.size === 1 && moved < 8 && this.onTap) { const w = this.toWorld(e.clientX, e.clientY); this.onTap(Math.floor(w.x), Math.floor(w.y)); } pts.delete(e.pointerId); last = null; };
    this.c.addEventListener('pointerup', up); this.c.addEventListener('pointercancel', up);
    this.c.addEventListener('wheel', e => { this.zoom(e.deltaY < 0 ? 1.1 : 0.9); e.preventDefault(); }, { passive: false });
  }
  zoom(f) { this.scale = Math.min(60, Math.max(3, this.scale * f)); }
  draw() {
    const { ctx } = this, w = this.e.w, s = this.scale; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.translate(innerWidth / 2 - this.cx * s, innerHeight / 2 - this.cy * s);
    const tl = this.toWorld(0, 0), br = this.toWorld(innerWidth, innerHeight);
    const x0 = Math.max(0, Math.floor(tl.x)), y0 = Math.max(0, Math.floor(tl.y)), x1 = Math.min(W - 1, Math.ceil(br.x)), y1 = Math.min(H - 1, Math.ceil(br.y));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = w.tiles[y * W + x]; ctx.fillStyle = t === T_WALL ? '#0b0b0b' : t === T_SWAMP ? '#232b17' : '#2b2b2b'; ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5); }
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; for (let i = 0; i <= RW; i++) { ctx.beginPath(); ctx.moveTo(i * ROOM * s, 0); ctx.lineTo(i * ROOM * s, H * s); ctx.stroke(); } for (let i = 0; i <= RH; i++) { ctx.beginPath(); ctx.moveTo(0, i * ROOM * s); ctx.lineTo(W * s, i * ROOM * s); ctx.stroke(); }
    if (s > 6) { ctx.fillStyle = '#777'; ctx.font = `${Math.max(10, s)}px sans-serif`; for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) ctx.fillText('W' + rx + 'N' + ry, (rx * ROOM + 1) * s, (ry * ROOM + 1.8) * s); }
    for (const r of w.structures) { if (r.type === 'road') { ctx.fillStyle = '#555'; ctx.fillRect((r.x + .3) * s, (r.y + .3) * s, s * .4, s * .4); } else { ctx.fillStyle = '#e6c84c'; ctx.beginPath(); ctx.arc((r.x + .5) * s, (r.y + .5) * s, s * .35, 0, 7); ctx.fill(); } }
    for (const st of w.sites) { ctx.strokeStyle = '#6cf'; ctx.lineWidth = 2; ctx.strokeRect((st.x + .2) * s, (st.y + .2) * s, s * .6, s * .6); ctx.fillStyle = '#6cf'; ctx.fillRect((st.x + .2) * s, (st.y + .8) * s, s * .6 * st.progress / st.total, s * .1); }
    for (const so of w.sources) { const f = so.energy / so.cap; ctx.fillStyle = `rgb(${200 + 55 * f},${200 * f + 40},40)`; ctx.fillRect((so.x + .15) * s, (so.y + .15) * s, s * .7, s * .7); }
    for (const sp of w.spawns) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((sp.x + .5) * s, (sp.y + .5) * s, s * .55, 0, 7); ctx.fill(); ctx.fillStyle = '#e6c84c'; ctx.beginPath(); ctx.arc((sp.x + .5) * s, (sp.y + .5) * s, s * .45 * Math.sqrt(sp.energy / sp.cap), 0, 7); ctx.fill(); }
    for (const c of w.creeps) {
      const cap = Math.max(1, c.body.filter(b => b === 'carry').length * 50);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc((c.x + .5) * s, (c.y + .5) * s, s * .42, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8f8'; ctx.lineWidth = Math.max(1, s * .08); ctx.stroke();
      ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc((c.x + .5) * s, (c.y + .5) * s, s * .28 * Math.sqrt(c.energy / cap), 0, 7); ctx.fill();
      if (c.say && w.time - c.sayT < 5 && s > 8) { ctx.fillStyle = '#fff'; ctx.font = `${s * .7}px sans-serif`; ctx.fillText(c.say, (c.x) * s, (c.y - .2) * s); }
    }
  }
}
