// 权威模拟引擎（多玩家，Screeps 风格 API 精简实现）。与渲染完全分离，也可在 Node 中运行。
const OK = 0, ERR_NOT_OWNER = -1, ERR_NO_PATH = -2, ERR_NAME_EXISTS = -3, ERR_BUSY = -4, ERR_NOT_ENOUGH_ENERGY = -6, ERR_INVALID_TARGET = -7, ERR_FULL = -8, ERR_NOT_IN_RANGE = -9, ERR_TIRED = -11, ERR_NO_BODYPART = -12;
const BODY_COST = { work: 100, carry: 50, move: 50 };
const FIND_SOURCES = 1, FIND_MY_CREEPS = 2, FIND_CONSTRUCTION_SITES = 3, FIND_MY_SPAWNS = 4, FIND_HOSTILE_CREEPS = 6;
const RESOURCE_ENERGY = 'energy';
const STRUCT_COST = { extension: 300, road: 50 };
const PLAYER_COLORS = [0x4fc3f7, 0xff8a65, 0xba68c8, 0x81c784, 0xfff176, 0xf06292, 0x4db6ac, 0xa1887f];
function dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function roomName(x, y) { return 'R' + Math.floor(x / ROOM) + '_' + Math.floor(y / ROOM); }

function newWorld(seed = (Date.now() % 1e6) | 0) {
  const w = { v: 2, seed, time: 0, S: 0, rooms: {}, roomsVer: 0, sources: [], spawns: [], creeps: [], sites: [], structures: [], players: {}, memory: {}, nextId: 1 };
  ensureSize(w, 2); return w;
}
// 动态扩张：世界是 S×S 个房间，玩家越多 S 越大
function ensureSize(w, S) {
  if (S <= w.S) return false;
  const added = [];
  for (let ry = 0; ry < S; ry++) for (let rx = 0; rx < S; rx++) {
    const k = rx + ',' + ry; if (w.rooms[k]) continue;
    const g = genRoom(w.seed, rx, ry); w.rooms[k] = { tiles: g.tiles, owner: null };
    for (const s of g.sources) w.sources.push({ id: 's' + (w.nextId++), x: rx * ROOM + s.x, y: ry * ROOM + s.y, energy: 1500, cap: 1500, regen: 300 });
    added.push([rx, ry]);
  }
  w.S = S;
  for (let ry = 0; ry < S; ry++) for (let rx = 0; rx < S; rx++) applyBorders(w, rx, ry);
  w.roomsVer++; return true;
}
function sizeFor(n) { return Math.max(2, Math.ceil(Math.sqrt(n * 2))); }

class Engine {
  constructor(world) { this._objVer = 0; this.w = world; this.fns = {}; this.onLog = null; this.events = []; for (const pid in world.players) this.setCode(pid, world.players[pid].code || ''); }
  get W() { return this.w.S * ROOM; }
  log(pid, ...a) { const s = `[${this.w.time}] ` + a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' '); this.onLog && this.onLog(pid, s); }
  tile(x, y) { const rm = this.w.rooms[Math.floor(x / ROOM) + ',' + Math.floor(y / ROOM)]; if (!rm || x < 0 || y < 0) return T_WALL; return rm.tiles[(y % ROOM) * ROOM + (x % ROOM)]; }
  // 网格缓存：静态障碍（地形+能量源+spawn+extension）和 creep 占位，避免每格线性扫描
  _grid() {
    const w = this.w, WW = this.W;
    if (this._g && this._gVer === w.roomsVer && this._gObj === this._objVer && this._gW === WW) return this._g;
    const g = new Uint8Array(WW * WW);
    for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number), t = w.rooms[k].tiles; for (let ly = 0; ly < ROOM; ly++) for (let lx = 0; lx < ROOM; lx++) if (t[ly * ROOM + lx] === T_WALL) g[(ry * ROOM + ly) * WW + rx * ROOM + lx] = 1; }
    for (const o of w.sources) g[o.y * WW + o.x] = 1; for (const o of w.spawns) g[o.y * WW + o.x] = 1;
    for (const o of w.structures) if (o.type === 'extension') g[o.y * WW + o.x] = 1;
    this._g = g; this._gVer = w.roomsVer; this._gObj = this._objVer; this._gW = WW; return g;
  }
  _occ() { if (!this._o) { this._o = new Map(); for (const c of this.w.creeps) this._o.set(c.y * this.W + c.x, c); } return this._o; }
  solid(x, y) { const WW = this.W; if (x < 0 || y < 0 || x >= WW || y >= WW) return true; return this._grid()[y * WW + x] === 1; }
  blocked(x, y, ignore) { if (this.solid(x, y)) return true; const c = this._occ().get(y * this.W + x); return !!c && c !== ignore; }
  // ===== 玩家管理 =====
  addPlayer(pid, name) {
    const w = this.w; if (w.players[pid]) { w.players[pid].name = name || w.players[pid].name; return w.players[pid]; }
    const n = Object.keys(w.players).length; ensureSize(w, sizeFor(n + 1));
    const p = w.players[pid] = { name: name || pid, color: PLAYER_COLORS[n % PLAYER_COLORS.length], code: '' };
    w.memory[pid] = { creeps: {} };
    this.placeSpawn(pid); this.log(pid, '', p.name, '加入世界'); return p;
  }
  placeSpawn(pid) { // 公平出生点：选离其他玩家最远的空房间
    const w = this.w, owned = Object.entries(w.rooms).filter(([, r]) => r.owner).map(([k]) => k.split(',').map(Number));
    let best = null, bd = -Infinity;
    for (const [k, r] of Object.entries(w.rooms)) {
      if (r.owner) continue; const [rx, ry] = k.split(',').map(Number);
      const d = owned.length ? Math.min(...owned.map(([ox, oy]) => Math.abs(ox - rx) + Math.abs(oy - ry))) : -(Math.abs(rx - (w.S - 1) / 2) + Math.abs(ry - (w.S - 1) / 2));
      if (d > bd) { bd = d; best = [rx, ry, r]; }
    }
    if (!best) { ensureSize(w, w.S + 1); return this.placeSpawn(pid); }
    const [rx, ry, room] = best; room.owner = pid;
    const t = room.tiles; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t[(12 + dy) * ROOM + 12 + dx] = T_PLAIN;
    w.roomsVer++;
    this._objVer++; w.spawns.push({ id: 'sp' + (w.nextId++), name: 'Spawn1', owner: pid, x: rx * ROOM + 12, y: ry * ROOM + 12, energy: 300, cap: 300, spawning: null });
  }
  setCode(pid, code) {
    if (!this.w.players[pid]) return; this.w.players[pid].code = code;
    try { this.fns[pid] = code ? compileUser(code) : null; } catch (e) { this.fns[pid] = null; this.log(pid, '编译失败:', e.message); }
  }
  findPath(from, to, range, me) { // BFS（静态障碍 + 起点相邻 creep）
    const WW = this.W, N = WW * WW, g = this._grid();
    if (!this._prev || this._prev.length !== N) { this._prev = new Int32Array(N); this._stamp = new Uint32Array(N); this._q = new Int32Array(N); this._st = 0; }
    const prev = this._prev, stamp = this._stamp, q = this._q, st = ++this._st;
    const start = from.y * WW + from.x; let head = 0, tail = 0, end = -1; q[tail++] = start; stamp[start] = st; prev[start] = start;
    while (head < tail && head < 8000) {
      const k = q[head++], x = k % WW, y = (k / WW) | 0;
      if (Math.max(Math.abs(x - to.x), Math.abs(y - to.y)) <= range) { end = k; break; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= WW || ny >= WW) continue; const nk = ny * WW + nx;
        if (stamp[nk] === st || g[nk]) continue;
        if (head === 1 && this.blocked(nx, ny, me)) continue;
        stamp[nk] = st; prev[nk] = k; q[tail++] = nk;
      }
    }
    if (end < 0) return [];
    const path = []; for (let k = end; k !== prev[k]; k = prev[k]) path.push({ x: k % WW, y: (k / WW) | 0 });
    return path.reverse();
  }
  // ===== 一个 tick =====
  tick() {
    const w = this.w; w.time++; this.events = []; this._o = null;
    for (const pid in w.players) { const f = this.fns[pid]; if (!f) continue; const api = this.buildApi(pid); try { f(api.Game, w.memory[pid], api); } catch (e) { this.log(pid, '代码错误:', e.message); } }
    for (const c of w.creeps) {
      const it = c._intent; delete c._intent; c.px = c.x; c.py = c.y;
      if (it && c.fatigue <= 0) { if (!this.blocked(it.x, it.y, c)) { const o = this._occ(); if (o.get(c.y * this.W + c.x) === c) o.delete(c.y * this.W + c.x); c.x = it.x; c.y = it.y; o.set(c.y * this.W + c.x, c); const moves = c.body.filter(b => b === 'move').length, weight = c.body.length - moves; const road = w.structures.some(s => s.type === 'road' && s.x === c.x && s.y === c.y); c.fatigue = road ? 0 : this.tile(c.x, c.y) === T_SWAMP ? 2 : (weight > moves ? 1 : 0); } else c._path = null; }
      else if (c.fatigue > 0) c.fatigue--;
      c.ttl--;
    }
    this._o = null; w.creeps = w.creeps.filter(c => { if (c.ttl <= 0) { this.log(c.owner, '', c.name, '寿终'); this.events.push({ t: 'die', x: c.x, y: c.y }); return false; } return true; });
    for (const pid in w.memory) { const m = w.memory[pid].creeps || {}; for (const n in m) if (!w.creeps.some(c => c.owner === pid && c.name === n)) delete m[n]; }
    for (const s of w.sources) if (w.time % s.regen === 0) s.energy = s.cap;
    for (const sp of w.spawns) {
      sp.cap = 300 + 50 * w.structures.filter(s => s.type === 'extension' && s.owner === sp.owner).length;
      if (w.time % 3 === 0 && sp.energy < 300) sp.energy++;
      if (sp.spawning && --sp.spawning.left <= 0) {
        const pos = this.freeAround(sp);
        if (pos) { const sc = sp.spawning; this._o = null; w.creeps.push({ id: 'c' + (w.nextId++), owner: sp.owner, name: sc.name, body: sc.body, x: pos.x, y: pos.y, px: sp.x, py: sp.y, energy: 0, ttl: 1500, fatigue: 0 }); w.memory[sp.owner].creeps[sc.name] = sc.memory || {}; this.log(sp.owner, '新 creep:', sc.name); this.events.push({ t: 'spawn', x: pos.x, y: pos.y, fx: sp.x, fy: sp.y }); sp.spawning = null; }
        else sp.spawning.left = 1;
      }
    }
    for (const st of w.sites) if (st.progress >= st.total) { w.structures.push({ type: st.type, x: st.x, y: st.y, owner: st.owner }); this.log(st.owner, '建造完成', st.type); this.events.push({ t: 'built', x: st.x, y: st.y }); }
    w.sites = w.sites.filter(s => s.progress < s.total); this._objVer++; this._o = null;
  }
  freeAround(p) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !this.blocked(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy }; return null; }
  buildApi(pid) {
    const E = this, w = this.w, creeps = {}, spawns = {}, ev = this.events;
    const pos = o => ({ x: o.x, y: o.y, roomName: roomName(o.x, o.y),
      getRangeTo: t => dist(o, t.pos || t), inRangeTo: (t, r) => dist(o, t.pos || t) <= r,
      findClosestByRange: type => { let b = null, bd = 1e9; for (const t of E.findList(pid, type, wraps)) { const d = dist(o, t); if (d < bd) { bd = d; b = t; } } return b; },
      findClosestByPath(type) { return this.findClosestByRange(type); },
      find: type => E.findList(pid, type, wraps) });
    const srcW = s => ({ id: s.id, x: s.x, y: s.y, pos: pos(s), energy: s.energy, energyCapacity: s.cap, _raw: s, _kind: 'source' });
    const siteW = s => ({ id: s.id, x: s.x, y: s.y, pos: pos(s), my: s.owner === pid, structureType: s.type, progress: s.progress, progressTotal: s.total, _raw: s, _kind: 'site' });
    const spawnW = sp => ({ id: sp.id, name: sp.name, x: sp.x, y: sp.y, pos: pos(sp), my: sp.owner === pid, _raw: sp, _kind: 'spawn', energy: sp.energy, energyCapacity: sp.cap, spawning: sp.spawning,
      store: { energy: sp.energy, getFreeCapacity: () => sp.cap - sp.energy, getUsedCapacity: () => sp.energy },
      spawnCreep(body, name, opts = {}) {
        if (sp.owner !== pid) return ERR_NOT_OWNER; if (!Array.isArray(body) || !body.length || body.length > 20) return ERR_INVALID_TARGET;
        if (sp.spawning) return ERR_BUSY; name = String(name || ''); if (!name || w.creeps.some(c => c.owner === pid && c.name === name)) return ERR_NAME_EXISTS;
        const cost = body.reduce((a, b) => a + (BODY_COST[b] ?? 1e9), 0); if (cost > sp.energy) return ERR_NOT_ENOUGH_ENERGY;
        sp.energy -= cost; sp.spawning = { name, body: body.slice(), left: body.length * 3, total: body.length * 3, memory: opts.memory }; return OK;
      } });
    const wraps = { source: srcW, site: siteW, spawn: spawnW, creep: c => creepW(c) };
    const creepW = c => {
      const cap = c.body.filter(b => b === 'carry').length * 50, work = c.body.filter(b => b === 'work').length, mine = c.owner === pid;
      const deny = () => ERR_NOT_OWNER;
      return {
        id: c.id, name: c.name, my: mine, owner: { username: w.players[c.owner]?.name }, body: c.body.map(t => ({ type: t })), ticksToLive: c.ttl, fatigue: c.fatigue, pos: pos(c), x: c.x, y: c.y, _raw: c, _kind: 'creep',
        get memory() { if (!mine) return {}; const m = w.memory[pid].creeps; return (m[c.name] = m[c.name] || {}); }, set memory(v) { if (mine) w.memory[pid].creeps[c.name] = v; },
        store: { energy: c.energy, getFreeCapacity: () => cap - c.energy, getUsedCapacity: () => c.energy, getCapacity: () => cap }, carryCapacity: cap,
        say: mine ? (t => { c.say = String(t).slice(0, 10); c.sayT = w.time; }) : deny,
        moveTo: mine ? function (t, y) {
          const tg = typeof t === 'number' ? { x: t, y } : (t && (t.pos || t)); if (!tg) return ERR_INVALID_TARGET; if (c.fatigue > 0) return ERR_TIRED; if (dist(c, tg) === 0) return OK;
          const range = typeof t === 'number' ? 0 : 1; if (dist(c, tg) <= range) return OK;
          if (!c._path || !c._path.length || c._pt?.x !== tg.x || c._pt?.y !== tg.y || dist(c, c._path[0]) !== 1 || E.blocked(c._path[0].x, c._path[0].y, c)) { c._path = E.findPath(c, tg, range, c); c._pt = { x: tg.x, y: tg.y }; }
          if (!c._path.length) return ERR_NO_PATH; c._intent = c._path.shift(); return OK;
        } : deny,
        harvest: mine ? (s => { if (!s || s._kind !== 'source') return ERR_INVALID_TARGET; if (dist(c, s) > 1) return ERR_NOT_IN_RANGE; if (!work) return ERR_NO_BODYPART; if (s._raw.energy <= 0) return ERR_NOT_ENOUGH_ENERGY; if (c.energy >= cap) return ERR_FULL; const a = Math.min(work * 2, s._raw.energy, cap - c.energy); s._raw.energy -= a; c.energy += a; ev.push({ t: 'harvest', fx: s.x, fy: s.y, x: c.x, y: c.y }); return OK; }) : deny,
        transfer: mine ? ((t, res = 'energy', amt) => {
          if (!t || !t._raw) return ERR_INVALID_TARGET; const raw = t._raw; if (dist(c, raw) > 1) return ERR_NOT_IN_RANGE; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY;
          let room; if (t._kind === 'spawn') room = raw.cap - raw.energy; else if (t._kind === 'creep') room = raw.body.filter(b => b === 'carry').length * 50 - raw.energy; else return ERR_INVALID_TARGET;
          const a = Math.min(amt || c.energy, c.energy, room); if (a <= 0) return ERR_FULL; raw.energy += a; c.energy -= a; ev.push({ t: 'transfer', fx: c.x, fy: c.y, x: raw.x, y: raw.y }); return OK;
        }) : deny,
        build: mine ? (s => { if (!s || s._kind !== 'site') return ERR_INVALID_TARGET; if (dist(c, s) > 3) return ERR_NOT_IN_RANGE; if (!work) return ERR_NO_BODYPART; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY; const a = Math.min(work * 5, c.energy, s._raw.total - s._raw.progress); s._raw.progress += a; c.energy -= a; ev.push({ t: 'build', fx: c.x, fy: c.y, x: s.x, y: s.y }); return OK; }) : deny,
        drop: mine ? (() => { c.energy = 0; return OK; }) : deny,
        suicide: mine ? (() => { c.ttl = 0; return OK; }) : deny,
      };
    };
    for (const sp of w.spawns) if (sp.owner === pid) spawns[sp.name] = spawnW(sp);
    for (const c of w.creeps) if (c.owner === pid) creeps[c.name] = creepW(c);
    const Game = { time: w.time, creeps, spawns, rooms: {},
      getObjectById: id => { for (const [k, l] of [['source', w.sources], ['site', w.sites], ['spawn', w.spawns], ['creep', w.creeps]]) { const o = l.find(o => o.id === id); if (o) return wraps[k](o); } return null; },
      createConstructionSite: (x, y, type) => {
        if (!STRUCT_COST[type]) return ERR_INVALID_TARGET; x |= 0; y |= 0;
        const rm = w.rooms[Math.floor(x / ROOM) + ',' + Math.floor(y / ROOM)]; if (!rm || (rm.owner && rm.owner !== pid)) return ERR_NOT_OWNER;
        if (E.solid(x, y) || w.sites.some(s => s.x === x && s.y === y) || w.structures.some(s => s.x === x && s.y === y)) return ERR_INVALID_TARGET;
        if (w.sites.filter(s => s.owner === pid).length >= 20) return ERR_FULL;
        w.sites.push({ id: 'cs' + (w.nextId++), owner: pid, x, y, type, progress: 0, total: STRUCT_COST[type] }); return OK; } };
    this._creeps = creeps;
    return { Game, log: (...a) => E.log(pid, ...a) };
  }
  findList(pid, type, wraps) {
    const w = this.w;
    if (type === FIND_SOURCES) return w.sources.filter(s => s.energy > 0).map(wraps.source);
    if (type === FIND_CONSTRUCTION_SITES) return w.sites.filter(s => s.owner === pid).map(wraps.site);
    if (type === FIND_MY_SPAWNS) return w.spawns.filter(s => s.owner === pid).map(wraps.spawn);
    if (type === FIND_MY_CREEPS) return Object.values(this._creeps);
    if (type === FIND_HOSTILE_CREEPS) return w.creeps.filter(c => c.owner !== pid).map(wraps.creep);
    return [];
  }
  // 发给客户端的动态快照（地形单独、按版本发送）
  snapshot() {
    const w = this.w;
    return { time: w.time, S: w.S, roomsVer: w.roomsVer, players: Object.fromEntries(Object.entries(w.players).map(([k, p]) => [k, { name: p.name, color: p.color }])),
      sources: w.sources.map(s => ({ id: s.id, x: s.x, y: s.y, energy: s.energy, cap: s.cap })),
      spawns: w.spawns.map(s => ({ id: s.id, name: s.name, owner: s.owner, x: s.x, y: s.y, energy: s.energy, cap: s.cap, spawning: s.spawning && { name: s.spawning.name, left: s.spawning.left, total: s.spawning.total } })),
      creeps: w.creeps.map(c => ({ hits: c.body.length * 100, id: c.id, owner: c.owner, name: c.name, body: c.body, x: c.x, y: c.y, px: c.px, py: c.py, energy: c.energy, ttl: c.ttl, say: w.time - (c.sayT || -99) < 5 ? c.say : undefined })),
      sites: w.sites.map(s => ({ id: s.id, owner: s.owner, x: s.x, y: s.y, type: s.type, progress: s.progress, total: s.total })),
      structures: w.structures, events: this.events };
  }
  roomsData() { return { roomsVer: this.w.roomsVer, S: this.w.S, rooms: Object.fromEntries(Object.entries(this.w.rooms).map(([k, r]) => [k, { tiles: r.tiles.join(''), owner: r.owner }])) }; }
  saveData() { const w = this.w; return JSON.stringify(w, (k, v) => (k === '_path' || k === '_pt' || k === '_intent') ? undefined : v); }
}

function compileUser(code) {
  const consts = { OK, ERR_NOT_OWNER, ERR_NO_PATH, ERR_NOT_IN_RANGE, ERR_NOT_ENOUGH_ENERGY, ERR_BUSY, ERR_FULL, ERR_INVALID_TARGET, ERR_NAME_EXISTS, ERR_TIRED, ERR_NO_BODYPART, FIND_SOURCES, FIND_MY_CREEPS, FIND_CONSTRUCTION_SITES, FIND_MY_SPAWNS, FIND_HOSTILE_CREEPS, RESOURCE_ENERGY, WORK: 'work', CARRY: 'carry', MOVE: 'move', STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road' };
  const names = Object.keys(consts), hidden = ['window', 'document', 'localStorage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Capacitor', 'globalThis', 'self', 'require', 'process', 'setTimeout', 'setInterval'];
  const f = new Function('Game', 'Memory', 'console', '__loopGuard', ...hidden, ...names, '"use strict";\n' + code);
  return (Game, Memory, api) => { let n = 0; const guard = () => { if (++n > 100000) throw new Error('循环次数过多（可能死循环）'); };
    f(Game, Memory, { log: api.log }, guard, ...hidden.map(() => undefined), ...names.map(k => consts[k])); };
}
if (typeof module !== 'undefined') module.exports = { Engine, newWorld, compileUser };
