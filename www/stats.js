// 玩家统计：包装 Engine.tick，按 tick 前后差异累计本机玩家数据（不改动引擎代码）
// 若引擎 events 中带有 {t:'harvest', pid, amount} / {t:'build', pid}，优先使用。
const Stats = (() => {
  const KEY = 'sbm_stats', pid = () => localStorage.getItem('sbm_pid');
  const def = { ticks: 0, creeps: 0, energy: 0, rclMax: 0, built: 0, since: Date.now() };
  let d; try { d = Object.assign({}, def, JSON.parse(localStorage.getItem(KEY))); } catch (e) { d = Object.assign({}, def); }
  let dirty = 0; const flush = () => { if (dirty) { localStorage.setItem(KEY, JSON.stringify(d)); dirty = 0; } };
  setInterval(flush, 5000); document.addEventListener('visibilitychange', flush);
  const snap = (w, me) => {
    const rk = (x, y) => typeof roomKey === 'function' ? roomKey(x, y) : Math.floor(x / 50) + ',' + Math.floor(y / 50), own = o => o.owner === me, creeps = new Set((w.creeps || []).filter(own).map(c => c.id));
    const st = new Set([...(w.structures || []), ...(w.spawns || [])].filter(own).map(s => s.id));
    const myRooms = new Set((w.controllers || []).filter(own).map(c => rk(c.x, c.y)));
    let src = 0; for (const s of w.sources || []) if (myRooms.has(rk(s.x, s.y))) src += s.energy || 0;
    let rcl = 0; for (const c of w.controllers || []) if (own(c)) rcl = Math.max(rcl, c.level || 0);
    return { creeps, st, src, rcl, srcMap: new Map((w.sources || []).map(s => [s.id, s.energy || 0])) };
  };
  function wrap(E) {
    if (!E || E.prototype._statsWrapped) return; E.prototype._statsWrapped = 1;
    const orig = E.prototype.tick;
    E.prototype.tick = function (...a) {
      const me = pid(), w = this.w, inMine = me && w.players && w.players[me];
      const b = inMine ? snap(w, me) : null; const r = orig.apply(this, a);
      if (!b) return r;
      const n = snap(this.w, me); d.ticks++;
      for (const id of n.creeps) if (!b.creeps.has(id)) d.creeps++;
      const ev = this.events || [], evH = ev.filter(e => e.t === 'harvest' && e.pid === me), evB = ev.filter(e => e.t === 'build' && e.pid === me);
      if (evH.length) d.energy += evH.reduce((s, e) => s + (e.amount || 0), 0);
      if (!evH.length && n.src < b.src && b.src - n.src < 500) d.energy += b.src - n.src; // 源刷新时能量会变大，忽略
      if (evB.length) d.built += evB.length; else for (const id of n.st) if (!b.st.has(id)) d.built++;
      d.rclMax = Math.max(d.rclMax, n.rcl); dirty = 1; return r;
    };
  }
  if (typeof Engine !== 'undefined') wrap(Engine);
  return { get: () => Object.assign({}, d), reset() { d = Object.assign({}, def, { since: Date.now() }); dirty = 1; flush(); }, wrap };
})();
