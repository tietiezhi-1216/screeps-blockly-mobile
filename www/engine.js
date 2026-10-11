// 开放世界模拟引擎（Screeps 风格 API 的精简实现）
const ROOM = 25, RW = 3, RH = 3, W = ROOM * RW, H = ROOM * RH;
const T_PLAIN = 0, T_WALL = 1, T_SWAMP = 2;
const OK = 0, ERR_NOT_OWNER = -1, ERR_BUSY = -4, ERR_NOT_ENOUGH_ENERGY = -6, ERR_INVALID_TARGET = -7, ERR_FULL = -8, ERR_NOT_IN_RANGE = -9, ERR_NAME_EXISTS = -3;
const BODY_COST = { work: 100, carry: 50, move: 50 };
const FIND_SOURCES = 1, FIND_MY_CREEPS = 2, FIND_CONSTRUCTION_SITES = 3, FIND_MY_SPAWNS = 4, FIND_MY_STRUCTURES = 5;
const RESOURCE_ENERGY = 'energy';
const STRUCT_COST = { extension: 300, road: 50, container: 200 };

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function roomName(x, y) { return 'W' + Math.floor(x / ROOM) + 'N' + Math.floor(y / ROOM); }
function dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

function newWorld(seed = Date.now() % 100000) {
  const r = rng(seed), tiles = new Array(W * H).fill(T_PLAIN);
  for (let i = 0; i < 260; i++) { // 随机墙块簇
    let x = Math.floor(r() * W), y = Math.floor(r() * H), n = 3 + Math.floor(r() * 12), t = r() < 0.7 ? T_WALL : T_SWAMP;
    for (let k = 0; k < n; k++) { x = Math.min(W - 1, Math.max(0, x + Math.floor(r() * 3) - 1)); y = Math.min(H - 1, Math.max(0, y + Math.floor(r() * 3) - 1)); tiles[y * W + x] = t; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { // 房间边界墙，中间留出口
    const lx = x % ROOM, ly = y % ROOM;
    if ((lx === 0 || ly === 0) && !((lx === 0 && ly >= 10 && ly <= 14) || (ly === 0 && lx >= 10 && lx <= 14))) tiles[y * W + x] = T_WALL;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tiles[y * W + x] = T_WALL;
  }
  const sources = []; let id = 1;
  for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++) {
    const cnt = 1 + Math.floor(r() * 2) + (rx === 1 && ry === 1 ? 1 : 0);
    for (let k = 0; k < cnt; k++) {
      const x = rx * ROOM + 3 + Math.floor(r() * 19), y = ry * ROOM + 3 + Math.floor(r() * 19);
      clearAround(tiles, x, y); sources.push({ id: 's' + id++, x, y, energy: 1500, cap: 1500, regen: 300 });
    }
  }
  const sx = ROOM + 12, sy = ROOM + 12; clearAround(tiles, sx, sy, 2);
  return { seed, time: 0, tiles, sources, nextId: id,
    spawns: [{ id: 'Spawn1', name: 'Spawn1', x: sx, y: sy, energy: 300, cap: 300, spawning: null, hits: 5000 }],
    creeps: [], sites: [], structures: [], memory: { creeps: {} } };
}
function clearAround(t, x, y, r = 1) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X > 0 && Y > 0 && X < W - 1 && Y < H - 1) t[Y * W + X] = T_PLAIN; } }

class Engine {
  constructor(world) { this.w = world; this.logs = []; this.onLog = null; }
  log(...a) { const s = `[${this.w.time}] ` + a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' '); this.logs.push(s); if (this.logs.length > 200) this.logs.shift(); this.onLog && this.onLog(s); }
  tile(x, y) { return (x < 0 || y < 0 || x >= W || y >= H) ? T_WALL : this.w.tiles[y * W + x]; }
  blocked(x, y, ignore) {
    if (this.tile(x, y) === T_WALL) return true;
    const w = this.w;
    if (w.sources.some(s => s.x === x && s.y === y) || w.spawns.some(s => s.x === x && s.y === y)) return true;
    if (w.structures.some(s => s.type === 'extension' && s.x === x && s.y === y)) return true;
    return w.creeps.some(c => c !== ignore && c.x === x && c.y === y);
  }
  findPath(from, to, range, me) { // BFS 寻路
    const key = (x, y) => y * W + x, prev = new Int32Array(W * H).fill(-1), q = [key(from.x, from.y)]; prev[q[0]] = q[0];
    let head = 0, end = -1;
    while (head < q.length && head < 6000) {
      const k = q[head++], x = k % W, y = (k / W) | 0;
      if (Math.max(Math.abs(x - to.x), Math.abs(y - to.y)) <= range) { end = k; break; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy, nk = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[nk] !== -1) continue;
        if (this.tile(nx, ny) === T_WALL) continue;
        if (this.blocked(nx, ny, me) && !(head < 2 ? false : false)) { if (dist({ x: nx, y: ny }, from) <= 1) continue; if (this.tile(nx, ny) === T_WALL || this.w.sources.some(s => s.x === nx && s.y === ny) || this.w.spawns.some(s => s.x === nx && s.y === ny) || this.w.structures.some(s => s.type === 'extension' && s.x === nx && s.y === ny)) continue; }
        prev[nk] = k; q.push(nk);
      }
    }
    if (end < 0) return [];
    const path = []; for (let k = end; k !== prev[k]; k = prev[k]) path.unshift({ x: k % W, y: (k / W) | 0 });
    return path;
  }
  // ===== 每 tick =====
  tick(userFn) {
    const w = this.w; w.time++;
    const api = this.buildApi();
    if (userFn) { try { userFn(api.Game, w.memory, api); } catch (e) { this.log('❌ 代码错误:', e.message); } }
    // 执行意图
    for (const c of w.creeps) {
      const it = c._intent || {}; delete c._intent;
      if (it.move && c.fatigue <= 0) { const p = it.move; if (!this.blocked(p.x, p.y, c)) { c.x = p.x; c.y = p.y; const moves = c.body.filter(b => b === 'move').length, weight = c.body.length - moves; c.fatigue = this.tile(c.x, c.y) === T_SWAMP ? 2 : (weight > moves ? 1 : 0); if (w.structures.some(s => s.type === 'road' && s.x === c.x && s.y === c.y)) c.fatigue = 0; } }
      else if (c.fatigue > 0) c.fatigue--;
      c.ttl--;
    }
    w.creeps = w.creeps.filter(c => { if (c.ttl <= 0) { this.log('💀', c.name, '寿终'); return false; } return true; });
    for (const n in w.memory.creeps) if (!w.creeps.some(c => c.name === n)) delete w.memory.creeps[n];
    for (const s of w.sources) if (w.time % s.regen === 0) s.energy = s.cap;
    for (const sp of w.spawns) {
      sp.cap = 300 + 50 * w.structures.filter(s => s.type === 'extension').length;
      if (w.time % 3 === 0 && sp.energy < 300) sp.energy++; // 和 Screeps 一样的缓慢自然回复
      if (sp.spawning && --sp.spawning.left <= 0) {
        const pos = this.freeAround(sp); if (pos) { const sc = sp.spawning; w.creeps.push({ name: sc.name, body: sc.body, x: pos.x, y: pos.y, energy: 0, ttl: 1500, fatigue: 0 }); w.memory.creeps[sc.name] = sc.memory || {}; this.log('🐣 新 creep:', sc.name); sp.spawning = null; } else sp.spawning.left = 1;
      }
    }
    for (const st of w.sites) if (st.progress >= st.total) { w.structures.push({ type: st.type, x: st.x, y: st.y }); this.log('🏗 建造完成', st.type); }
    w.sites = w.sites.filter(s => s.progress < s.total);
  }
  freeAround(p) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !this.blocked(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy }; return null; }
  buildApi() {
    const E = this, w = this.w, creeps = {}, spawns = {};
    const pos = (o) => ({ x: o.x, y: o.y, roomName: roomName(o.x, o.y),
      getRangeTo: t => dist(o, t.pos || t), inRangeTo: (t, r) => dist(o, t.pos || t) <= r,
      findClosestByRange: (type) => { const l = E.findList(type, wrap); let b = null, bd = 1e9; for (const t of l) { const d = dist(o, t); if (d < bd) { bd = d; b = t; } } return b; },
      findClosestByPath: (type) => pos(o).findClosestByRange(type) });
    const srcW = s => ({ id: s.id, x: s.x, y: s.y, pos: pos(s), get energy() { return s.energy; }, energyCapacity: s.cap, _raw: s, _kind: 'source' });
    const siteW = s => ({ id: s.id, x: s.x, y: s.y, pos: pos(s), structureType: s.type, progress: s.progress, progressTotal: s.total, _raw: s, _kind: 'site' });
    const spawnW = sp => ({ id: sp.id, name: sp.name, x: sp.x, y: sp.y, pos: pos(sp), _raw: sp, _kind: 'spawn', get energy() { return sp.energy; }, energyCapacity: sp.cap, spawning: sp.spawning,
      store: { get energy() { return sp.energy; }, getFreeCapacity: () => sp.cap - sp.energy, getUsedCapacity: () => sp.energy },
      spawnCreep(body, name, opts = {}) {
        if (!Array.isArray(body) || !body.length) return ERR_INVALID_TARGET;
        if (sp.spawning) return ERR_BUSY; if (w.creeps.some(c => c.name === name) || !name) return ERR_NAME_EXISTS;
        const cost = body.reduce((a, b) => a + (BODY_COST[b] || 0), 0); if (cost > sp.energy) return ERR_NOT_ENOUGH_ENERGY;
        sp.energy -= cost; sp.spawning = { name, body: body.slice(), left: body.length * 3, memory: opts.memory }; return OK;
      } });
    const wrap = (type, raw) => type === 'source' ? srcW(raw) : type === 'site' ? siteW(raw) : type === 'spawn' ? spawnW(raw) : raw;
    for (const sp of w.spawns) spawns[sp.name] = spawnW(sp);
    for (const c of w.creeps) {
      const cap = c.body.filter(b => b === 'carry').length * 50, work = c.body.filter(b => b === 'work').length;
      const me = {
        name: c.name, body: c.body.map(t => ({ type: t })), ticksToLive: c.ttl, fatigue: c.fatigue, pos: pos(c), x: c.x, y: c.y, _raw: c,
        get memory() { return (w.memory.creeps[c.name] = w.memory.creeps[c.name] || {}); }, set memory(v) { w.memory.creeps[c.name] = v; },
        store: { get energy() { return c.energy; }, getFreeCapacity: () => cap - c.energy, getUsedCapacity: () => c.energy, getCapacity: () => cap },
        carryCapacity: cap,
        say(t) { c.say = String(t).slice(0, 10); c.sayT = w.time; },
        moveTo(t, y) {
          const tg = typeof t === 'number' ? { x: t, y } : (t.pos || t); if (c.fatigue > 0) return -11;
          if (dist(c, tg) === 0) return OK;
          if (!c._path || !c._path.length || c._pt?.x !== tg.x || c._pt?.y !== tg.y || dist(c, c._path[0]) !== 1 || E.blocked(c._path[0].x, c._path[0].y, c)) { c._path = E.findPath(c, tg, typeof t === 'number' ? 0 : 1, c); c._pt = { x: tg.x, y: tg.y }; }
          if (!c._path.length) return -2; c._intent = { move: c._path.shift() }; return OK;
        },
        harvest(s) { if (!s || s._kind !== 'source') return ERR_INVALID_TARGET; if (dist(c, s) > 1) return ERR_NOT_IN_RANGE; if (!work) return -12; if (s._raw.energy <= 0) return ERR_NOT_ENOUGH_ENERGY; const a = Math.min(work * 2, s._raw.energy, cap - c.energy); s._raw.energy -= a; c.energy += a; return OK; },
        transfer(t, res = 'energy', amt) {
          if (!t) return ERR_INVALID_TARGET; const raw = t._raw || t; if (dist(c, raw) > 1) return ERR_NOT_IN_RANGE; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY;
          if (t._kind === 'spawn') { const a = Math.min(amt || c.energy, c.energy, raw.cap - raw.energy); if (a <= 0) return ERR_FULL; raw.energy += a; c.energy -= a; return OK; }
          if (raw.body) { const tc = raw.body.filter(b => b === 'carry').length * 50; const a = Math.min(c.energy, tc - raw.energy); if (a <= 0) return ERR_FULL; raw.energy += a; c.energy -= a; return OK; }
          return ERR_INVALID_TARGET;
        },
        build(s) { if (!s || s._kind !== 'site') return ERR_INVALID_TARGET; if (dist(c, s) > 3) return ERR_NOT_IN_RANGE; if (!work) return -12; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY; const a = Math.min(work * 5, c.energy, s._raw.total - s._raw.progress); s._raw.progress += a; c.energy -= a; return OK; },
        drop() { c.energy = 0; return OK; },
        suicide() { c.ttl = 0; return OK; }
      };
      creeps[c.name] = me;
    }
    const Game = { time: w.time, creeps, spawns,
      getObjectById: id => { const s = w.sources.find(s => s.id === id); if (s) return srcW(s); const t = w.sites.find(s => s.id === id); return t ? siteW(t) : null; },
      createConstructionSite: (x, y, type) => {
        if (!STRUCT_COST[type]) return ERR_INVALID_TARGET; if (E.blocked(x, y) && !w.creeps.some(c => c.x === x && c.y === y)) return ERR_INVALID_TARGET;
        if (w.sites.some(s => s.x === x && s.y === y) || w.structures.some(s => s.x === x && s.y === y)) return ERR_INVALID_TARGET;
        if (w.sites.length >= 20) return -8; w.sites.push({ id: 'c' + (w.nextId++), x, y, type, progress: 0, total: STRUCT_COST[type] }); return OK; } };
    Game.rooms = {}; this._api = { Game };
    return { Game, log: (...a) => E.log(...a) };
  }
  findList(type, wrap) {
    const w = this.w;
    if (type === FIND_SOURCES) return w.sources.filter(s => s.energy > 0).map(s => wrap('source', s));
    if (type === FIND_CONSTRUCTION_SITES) return w.sites.map(s => wrap('site', s));
    if (type === FIND_MY_SPAWNS) return w.spawns.map(s => wrap('spawn', s));
    if (type === FIND_MY_CREEPS) return Object.values(this._api.Game.creeps);
    return [];
  }
}

// 把玩家代码编译成每 tick 执行的函数
function compileUser(code) {
  const consts = { OK, ERR_NOT_IN_RANGE, ERR_NOT_ENOUGH_ENERGY, ERR_BUSY, ERR_FULL, ERR_INVALID_TARGET, ERR_NAME_EXISTS, FIND_SOURCES, FIND_MY_CREEPS, FIND_CONSTRUCTION_SITES, FIND_MY_SPAWNS, RESOURCE_ENERGY, WORK: 'work', CARRY: 'carry', MOVE: 'move', STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road', STRUCTURE_CONTAINER: 'container' };
  const names = Object.keys(consts);
  const f = new Function('Game', 'Memory', 'console', '__loopGuard', 'window', 'document', 'localStorage', 'fetch', ...names, '"use strict";\n' + code);
  return (Game, Memory, api) => { let n = 0; const guard = () => { if (++n > 100000) throw new Error('循环次数过多（可能死循环）'); };
    f(Game, Memory, { log: api.log }, guard, undefined, undefined, undefined, undefined, ...names.map(k => consts[k])); };
}
