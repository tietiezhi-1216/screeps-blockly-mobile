// 权威模拟引擎（多玩家 + Screeps 官方规则精简）。与渲染完全分离。
const OK = 0, ERR_NOT_OWNER = -1, ERR_NO_PATH = -2, ERR_NAME_EXISTS = -3, ERR_BUSY = -4, ERR_NOT_ENOUGH_ENERGY = -6, ERR_INVALID_TARGET = -7, ERR_FULL = -8, ERR_NOT_IN_RANGE = -9, ERR_TIRED = -11, ERR_NO_BODYPART = -12, ERR_RCL_NOT_ENOUGH = -14;
const PLAYER_COLORS = [0x4fc3f7, 0xff8a65, 0xba68c8, 0x81c784, 0xfff176, 0xf06292, 0x4db6ac, 0xa1887f];
const RESOURCE_ENERGY = 'energy';
function dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function roomName(x, y) { return 'R' + Math.floor(x / ROOM) + '_' + Math.floor(y / ROOM); }
function roomKey(x, y) { return Math.floor(x / ROOM) + ',' + Math.floor(y / ROOM); }

function newWorld(seed = (Date.now() % 1e6) | 0) {
  const w = { v: 3, seed, time: 0, S: 0, rooms: {}, roomsVer: 0, sources: [], controllers: [], spawns: [], creeps: [], sites: [], structures: [], players: {}, memory: {}, nextId: 1 };
  ensureSize(w, 2); return w;
}
function ensureSize(w, S) {
  if (S <= w.S) return false;
  for (let ry = 0; ry < S; ry++) for (let rx = 0; rx < S; rx++) {
    const k = rx + ',' + ry; if (w.rooms[k]) continue;
    const g = genRoom(w.seed, rx, ry); w.rooms[k] = { tiles: g.tiles, owner: null };
    for (const s of g.sources) w.sources.push({ id: 's' + (w.nextId++), x: rx * ROOM + s.x, y: ry * ROOM + s.y, energy: 1500, cap: 1500, regen: 300 });
    // 每间一个 Controller（未占领 level=0）
    const c = g.controller; w.controllers.push({ id: 'ctrl' + (w.nextId++), x: rx * ROOM + c.x, y: ry * ROOM + c.y, level: 0, progress: 0, progressTotal: CONTROLLER_LEVELS[1], ticksToDowngrade: 0, owner: null, safeMode: 0, reservation: null });
  }
  w.S = S;
  for (let ry = 0; ry < S; ry++) for (let rx = 0; rx < S; rx++) applyBorders(w, rx, ry);
  w.roomsVer++; return true;
}
function sizeFor(n) { return Math.max(2, Math.ceil(Math.sqrt(n * 2))); }
function countStruct(w, pid, type, rx, ry) {
  const inRoom = o => Math.floor(o.x / ROOM) === rx && Math.floor(o.y / ROOM) === ry && o.owner === pid;
  let n = w.structures.filter(s => s.type === type && inRoom(s)).length + w.sites.filter(s => s.type === type && inRoom(s)).length;
  if (type === 'spawn') n += w.spawns.filter(s => inRoom(s)).length;
  return n;
}
function rclOf(w, x, y) { const c = w.controllers.find(c => roomKey(c.x, c.y) === roomKey(x, y)); return c && c.owner ? c.level : 0; }
function makeStruct(w, type, owner, x, y) {
  const s = { id: 'st' + (w.nextId++), type, owner, x, y, hits: STRUCT_HITS[type] || 1, hitsMax: STRUCT_HITS[type] || 1 };
  if (STRUCT_ENERGY_CAP[type] != null) { s.energy = STRUCT_ENERGY[type] || 0; s.energyCapacity = STRUCT_ENERGY_CAP[type]; }
  if (type === 'tower') s.store = true;
  return s;
}

class Engine {
  constructor(world) { this._objVer = 0; this.w = world; this.fns = {}; this.onLog = null; this.events = []; for (const pid in world.players) this.setCode(pid, world.players[pid].code || ''); }
  get W() { return this.w.S * ROOM; }
  log(pid, ...a) { const s = `[${this.w.time}] ` + a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' '); this.onLog && this.onLog(pid, s); }
  tile(x, y) { const rm = this.w.rooms[roomKey(x, y)]; if (!rm || x < 0 || y < 0) return T_WALL; return rm.tiles[(y % ROOM) * ROOM + (x % ROOM)]; }
  _grid() {
    const w = this.w, WW = this.W;
    if (this._g && this._gVer === w.roomsVer && this._gObj === this._objVer && this._gW === WW) return this._g;
    const g = new Uint8Array(WW * WW);
    for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number), t = w.rooms[k].tiles; for (let ly = 0; ly < ROOM; ly++) for (let lx = 0; lx < ROOM; lx++) if (t[ly * ROOM + lx] === T_WALL) g[(ry * ROOM + ly) * WW + rx * ROOM + lx] = 1; }
    for (const o of w.sources) g[o.y * WW + o.x] = 1;
    for (const o of w.controllers) g[o.y * WW + o.x] = 1;
    for (const o of w.spawns) g[o.y * WW + o.x] = 1;
    for (const o of w.structures) if (OBSTACLE_STRUCT.has(o.type)) g[o.y * WW + o.x] = 1;
    this._g = g; this._gVer = w.roomsVer; this._gObj = this._objVer; this._gW = WW; return g;
  }
  _occ() { if (!this._o) { this._o = new Map(); for (const c of this.w.creeps) this._o.set(c.y * this.W + c.x, c); } return this._o; }
  solid(x, y) { const WW = this.W; if (x < 0 || y < 0 || x >= WW || y >= WW) return true; return this._grid()[y * WW + x] === 1; }
  blocked(x, y, ignore) { if (this.solid(x, y)) return true; const c = this._occ().get(y * this.W + x); return !!c && c !== ignore; }

  addPlayer(pid, name) {
    const w = this.w; if (w.players[pid]) { w.players[pid].name = name || w.players[pid].name; return w.players[pid]; }
    const n = Object.keys(w.players).length; ensureSize(w, sizeFor(n + 1));
    const p = w.players[pid] = { name: name || pid, color: PLAYER_COLORS[n % PLAYER_COLORS.length], code: '' };
    w.memory[pid] = { creeps: {} }; this.placeSpawn(pid); this.log(pid, p.name, '加入世界'); return p;
  }
  placeSpawn(pid) {
    const w = this.w, owned = Object.entries(w.rooms).filter(([, r]) => r.owner).map(([k]) => k.split(',').map(Number));
    let best = null, bd = -Infinity;
    for (const [k, r] of Object.entries(w.rooms)) {
      if (r.owner) continue; const [rx, ry] = k.split(',').map(Number);
      const d = owned.length ? Math.min(...owned.map(([ox, oy]) => Math.abs(ox - rx) + Math.abs(oy - ry))) : -(Math.abs(rx - (w.S - 1) / 2) + Math.abs(ry - (w.S - 1) / 2));
      if (d > bd) { bd = d; best = [rx, ry, r]; }
    }
    if (!best) { ensureSize(w, w.S + 1); return this.placeSpawn(pid); }
    const [rx, ry, room] = best; room.owner = pid;
    const t = room.tiles; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const Y = 12 + dy, X = 12 + dx; if (Y >= 0 && X >= 0 && Y < ROOM && X < ROOM) t[Y * ROOM + X] = T_PLAIN; }
    w.roomsVer++; this._objVer++;
    // 占领 Controller L1 + Spawn
    const ctrl = w.controllers.find(c => Math.floor(c.x / ROOM) === rx && Math.floor(c.y / ROOM) === ry);
    if (ctrl) { ctrl.owner = pid; ctrl.level = 1; ctrl.progress = 0; ctrl.progressTotal = CONTROLLER_LEVELS[1]; ctrl.ticksToDowngrade = CONTROLLER_DOWNGRADE[1]; }
    const sx = rx * ROOM + 12, sy = ry * ROOM + 12;
    // 若 controller 正好在 spawn 点，挪 spawn
    let x = sx, y = sy; if (ctrl && ctrl.x === x && ctrl.y === y) { for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2]]) { x = sx + dx; y = sy + dy; if (!this.solid(x, y)) break; } }
    w.spawns.push({ id: 'sp' + (w.nextId++), name: 'Spawn1', owner: pid, x, y, energy: 300, cap: 300, hits: 5000, hitsMax: 5000, spawning: null });
  }
  setCode(pid, code) {
    if (!this.w.players[pid]) return; this.w.players[pid].code = code;
    try { this.fns[pid] = code ? compileUser(code) : null; } catch (e) { this.fns[pid] = null; this.log(pid, '编译失败:', e.message); }
  }
  findPath(from, to, range, me) {
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

  tick() {
    const w = this.w; w.time++; this.events = []; this._o = null;
    for (const pid in w.players) { const f = this.fns[pid]; if (!f) continue; const api = this.buildApi(pid); try { f(api.Game, w.memory[pid], api); } catch (e) { this.log(pid, '代码错误:', e.message); } }
    for (const c of w.creeps) {
      const it = c._intent; delete c._intent; c.px = c.x; c.py = c.y;
      if (it && c.fatigue <= 0) {
        if (!this.blocked(it.x, it.y, c)) {
          const o = this._occ(); if (o.get(c.y * this.W + c.x) === c) o.delete(c.y * this.W + c.x);
          c.x = it.x; c.y = it.y; o.set(c.y * this.W + c.x, c);
          const moves = c.body.filter(b => b === 'move').length, weight = c.body.length - moves;
          const road = w.structures.some(s => s.type === 'road' && s.x === c.x && s.y === c.y);
          c.fatigue = road ? 0 : this.tile(c.x, c.y) === T_SWAMP ? 2 : (weight > moves ? 1 : 0);
        } else c._path = null;
      } else if (c.fatigue > 0) c.fatigue--;
      c.ttl--;
    }
    this._o = null; w.creeps = w.creeps.filter(c => { if (c.ttl <= 0) { this.log(c.owner, c.name, '寿终'); this.events.push({ t: 'die', x: c.x, y: c.y }); return false; } return true; });
    for (const pid in w.memory) { const m = w.memory[pid].creeps || {}; for (const n in m) if (!w.creeps.some(c => c.owner === pid && c.name === n)) delete m[n]; }
    for (const s of w.sources) if (w.time % s.regen === 0) s.energy = s.cap;
    // Controller 降级
    for (const c of w.controllers) {
      if (!c.owner || c.level < 1) continue;
      if (c._upgraded) { c.ticksToDowngrade = CONTROLLER_DOWNGRADE[c.level]; delete c._upgraded; }
      else if (--c.ticksToDowngrade <= 0) {
        if (c.level > 1) { c.level--; c.progress = 0; c.progressTotal = CONTROLLER_LEVELS[c.level]; c.ticksToDowngrade = CONTROLLER_DOWNGRADE[c.level]; this.log(c.owner, 'Controller 降级至 RCL', c.level); }
        else { c.level = 0; c.owner = null; c.progress = 0; c.progressTotal = CONTROLLER_LEVELS[1]; c.ticksToDowngrade = 0; this.log(null, 'Controller 失控'); }
      }
    }
    // Spawn 能量上限 = base + extensions（官方每 extension 50，spawn 本身 300）
    for (const sp of w.spawns) {
      const rx = Math.floor(sp.x / ROOM), ry = Math.floor(sp.y / ROOM);
      const extN = w.structures.filter(s => s.type === 'extension' && s.owner === sp.owner && Math.floor(s.x / ROOM) === rx && Math.floor(s.y / ROOM) === ry).length;
      sp.cap = 300 + 50 * extN; if (sp.energy > sp.cap) sp.energy = sp.cap;
      if (w.time % 10 === 0 && sp.energy < Math.min(300, sp.cap)) sp.energy++; // 简化：spawn 缓慢自然回复
      if (sp.spawning && --sp.spawning.left <= 0) {
        const pos = this.freeAround(sp);
        if (pos) { const sc = sp.spawning; this._o = null; w.creeps.push({ id: 'c' + (w.nextId++), owner: sp.owner, name: sc.name, body: sc.body, x: pos.x, y: pos.y, px: sp.x, py: sp.y, energy: 0, ttl: 1500, fatigue: 0 }); w.memory[sp.owner].creeps[sc.name] = sc.memory || {}; this.log(sp.owner, '新 creep:', sc.name); this.events.push({ t: 'spawn', x: pos.x, y: pos.y, fx: sp.x, fy: sp.y }); sp.spawning = null; }
        else sp.spawning.left = 1;
      }
    }
    // Tower 自动？否，需玩家代码调用 attack/heal/repair
    for (const st of w.sites) if (st.progress >= st.total) {
      if (st.type === 'spawn') {
        const n = w.spawns.filter(s => s.owner === st.owner).length;
        w.spawns.push({ id: 'sp' + (w.nextId++), name: 'Spawn' + (n + 1), owner: st.owner, x: st.x, y: st.y, energy: 300, cap: 300, hits: 5000, hitsMax: 5000, spawning: null });
      } else w.structures.push(makeStruct(w, st.type, st.owner, st.x, st.y));
      this.log(st.owner, '建造完成', st.type); this.events.push({ t: 'built', x: st.x, y: st.y }); this._objVer++;
    }
    w.sites = w.sites.filter(s => s.progress < s.total); this._objVer++; this._o = null;
  }
  freeAround(p) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !this.blocked(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy }; return null; }

  buildApi(pid) {
    const E = this, w = this.w, creeps = {}, spawns = {}, ev = this.events;
    const pos = o => ({ x: o.x, y: o.y, roomName: roomName(o.x, o.y),
      getRangeTo: t => dist(o, t.pos || t), inRangeTo: (t, r) => dist(o, t.pos || t) <= r,
      findClosestByRange: type => { let b = null, bd = 1e9; for (const t of E.findList(pid, type, wraps)) { const d = dist(o, t); if (d < bd) { bd = d; b = t; } } return b; },
      findClosestByPath(type) { return this.findClosestByRange(type); },
      find: type => E.findList(pid, type, wraps),
      lookFor(type) {
        if (type === LOOK_STRUCTURES || type === FIND_STRUCTURES) {
          const out = []; for (const s of w.structures) if (s.x === o.x && s.y === o.y) out.push(wraps.structure(s));
          for (const s of w.spawns) if (s.x === o.x && s.y === o.y) out.push(wraps.spawn(s));
          for (const c of w.controllers) if (c.x === o.x && c.y === o.y) out.push(wraps.controller(c));
          return out;
        }
        if (type === 'controller' || type === LOOK_STRUCTURES) { const c = w.controllers.find(c => c.x === o.x && c.y === o.y); return c ? [wraps.controller(c)] : []; }
        return [];
      } });
    const srcW = s => ({ id: s.id, x: s.x, y: s.y, pos: pos(s), energy: s.energy, energyCapacity: s.cap, _raw: s, _kind: 'source' });
    const siteW = s => ({ id: s.id, x: s.x, y: s.y, pos: pos(s), my: s.owner === pid, structureType: s.type, progress: s.progress, progressTotal: s.total, _raw: s, _kind: 'site' });
    const ctrlW = c => ({ id: c.id, x: c.x, y: c.y, pos: pos(c), my: c.owner === pid, owner: c.owner ? { username: w.players[c.owner]?.name } : null, level: c.level, progress: c.progress, progressTotal: c.progressTotal, ticksToDowngrade: c.ticksToDowngrade, structureType: 'controller', _raw: c, _kind: 'controller' });
    const structW = s => ({
      id: s.id, x: s.x, y: s.y, pos: pos(s), my: s.owner === pid, owner: { username: w.players[s.owner]?.name }, structureType: s.type, hits: s.hits, hitsMax: s.hitsMax, _raw: s, _kind: 'structure',
      energy: s.energy, energyCapacity: s.energyCapacity,
      store: s.energyCapacity != null ? { energy: s.energy, getFreeCapacity: () => s.energyCapacity - s.energy, getUsedCapacity: () => s.energy, getCapacity: () => s.energyCapacity } : undefined,
      // Tower API
      attack: (t) => towerAct(s, t, 'attack'), heal: (t) => towerAct(s, t, 'heal'), repair: (t) => towerAct(s, t, 'repair'),
    });
    function towerAct(tower, target, kind) {
      if (tower.owner !== pid || tower.type !== 'tower') return ERR_NOT_OWNER;
      if (!target || !target._raw) return ERR_INVALID_TARGET;
      const d = dist(tower, target._raw || target); if (d > 20) return ERR_NOT_IN_RANGE;
      const cost = 10; if ((tower.energy || 0) < cost) return ERR_NOT_ENOUGH_ENERGY;
      tower.energy -= cost;
      const eff = Math.max(0.1, 1 - Math.max(0, d - 5) / 20); // 简化距离衰减
      if (kind === 'attack') { const raw = target._raw; if (raw.hits != null) { raw.hits -= Math.floor(600 * eff); if (raw.hits <= 0) destroyTarget(raw); } else if (raw.ttl != null && raw.owner !== pid) { raw.ttl -= Math.floor(20 * eff); } }
      else if (kind === 'heal') { const raw = target._raw; if (raw.hits != null && raw.owner === pid) raw.hits = Math.min(raw.hitsMax || raw.hits, raw.hits + Math.floor(400 * eff)); }
      else if (kind === 'repair') { const raw = target._raw; if (raw.hits != null && raw.owner === pid) raw.hits = Math.min(raw.hitsMax || 1, raw.hits + Math.floor(800 * eff)); }
      ev.push({ t: kind, fx: tower.x, fy: tower.y, x: (target._raw || target).x, y: (target._raw || target).y }); return OK;
    }
    function destroyTarget(raw) {
      if (raw.body) { raw.ttl = 0; return; }
      w.structures = w.structures.filter(s => s !== raw); w.spawns = w.spawns.filter(s => s !== raw); E._objVer++;
    }
    const spawnW = sp => ({
      id: sp.id, name: sp.name, x: sp.x, y: sp.y, pos: pos(sp), my: sp.owner === pid, structureType: 'spawn', hits: sp.hits, hitsMax: sp.hitsMax, _raw: sp, _kind: 'spawn',
      energy: sp.energy, energyCapacity: sp.cap, spawning: sp.spawning,
      store: { energy: sp.energy, getFreeCapacity: () => sp.cap - sp.energy, getUsedCapacity: () => sp.energy },
      spawnCreep(body, name, opts = {}) {
        if (sp.owner !== pid) return ERR_NOT_OWNER; if (!Array.isArray(body) || !body.length || body.length > 50) return ERR_INVALID_TARGET;
        if (sp.spawning) return ERR_BUSY; name = String(name || ''); if (!name || w.creeps.some(c => c.owner === pid && c.name === name)) return ERR_NAME_EXISTS;
        const cost = body.reduce((a, b) => a + (BODY_COST[b] ?? 1e9), 0); if (cost > sp.energy) return ERR_NOT_ENOUGH_ENERGY;
        sp.energy -= cost; sp.spawning = { name, body: body.slice(), left: body.length * 3, total: body.length * 3, memory: opts.memory }; return OK;
      } });
    const wraps = { source: srcW, site: siteW, spawn: spawnW, controller: ctrlW, structure: structW, creep: c => creepW(c) };
    const creepW = c => {
      const cap = c.body.filter(b => b === 'carry').length * 50, work = c.body.filter(b => b === 'work').length, mine = c.owner === pid;
      const deny = () => ERR_NOT_OWNER;
      return {
        id: c.id, name: c.name, my: mine, owner: { username: w.players[c.owner]?.name }, body: c.body.map(t => ({ type: t })), ticksToLive: c.ttl, fatigue: c.fatigue, pos: pos(c), x: c.x, y: c.y, hits: c.body.length * 100, hitsMax: c.body.length * 100, _raw: c, _kind: 'creep',
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
          let room; if (t._kind === 'spawn') room = raw.cap - raw.energy;
          else if (t._kind === 'structure' && raw.energyCapacity != null) room = raw.energyCapacity - (raw.energy || 0);
          else if (t._kind === 'creep') room = raw.body.filter(b => b === 'carry').length * 50 - raw.energy;
          else return ERR_INVALID_TARGET;
          const a = Math.min(amt || c.energy, c.energy, room); if (a <= 0) return ERR_FULL;
          if (t._kind === 'spawn') raw.energy += a; else if (t._kind === 'structure') raw.energy = (raw.energy || 0) + a; else raw.energy += a;
          c.energy -= a; ev.push({ t: 'transfer', fx: c.x, fy: c.y, x: raw.x, y: raw.y }); return OK;
        }) : deny,
        build: mine ? (s => { if (!s || s._kind !== 'site') return ERR_INVALID_TARGET; if (dist(c, s) > 3) return ERR_NOT_IN_RANGE; if (!work) return ERR_NO_BODYPART; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY; const a = Math.min(work * 5, c.energy, s._raw.total - s._raw.progress); s._raw.progress += a; c.energy -= a; ev.push({ t: 'build', fx: c.x, fy: c.y, x: s.x, y: s.y }); return OK; }) : deny,
        repair: mine ? (s => { if (!s || (s._kind !== 'structure' && s._kind !== 'spawn')) return ERR_INVALID_TARGET; const raw = s._raw; if (dist(c, raw) > 3) return ERR_NOT_IN_RANGE; if (!work) return ERR_NO_BODYPART; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY; if (raw.hits >= (raw.hitsMax || 1)) return ERR_FULL; const a = Math.min(work * 100, c.energy * 100, (raw.hitsMax || 1) - raw.hits); const e = Math.ceil(a / 100); raw.hits += a; c.energy -= e; ev.push({ t: 'build', fx: c.x, fy: c.y, x: raw.x, y: raw.y }); return OK; }) : deny,
        upgradeController: mine ? (ctrl => {
          if (!ctrl || ctrl._kind !== 'controller') return ERR_INVALID_TARGET; const raw = ctrl._raw;
          if (raw.owner !== pid) return ERR_NOT_OWNER; if (dist(c, raw) > 3) return ERR_NOT_IN_RANGE; if (!work) return ERR_NO_BODYPART; if (c.energy <= 0) return ERR_NOT_ENOUGH_ENERGY;
          if (raw.level >= 8) return ERR_FULL;
          const a = Math.min(work, c.energy); c.energy -= a; raw.progress += a; raw._upgraded = true;
          if (raw.progress >= raw.progressTotal && raw.level < 8) { raw.level++; raw.progress = 0; raw.progressTotal = CONTROLLER_LEVELS[raw.level] || CONTROLLER_LEVELS[7]; raw.ticksToDowngrade = CONTROLLER_DOWNGRADE[raw.level]; E.log(pid, 'Controller 升至 RCL', raw.level); }
          ev.push({ t: 'upgrade', fx: c.x, fy: c.y, x: raw.x, y: raw.y }); return OK;
        }) : deny,
        drop: mine ? (() => { c.energy = 0; return OK; }) : deny,
        suicide: mine ? (() => { c.ttl = 0; return OK; }) : deny,
      };
    };
    for (const sp of w.spawns) if (sp.owner === pid) spawns[sp.name] = spawnW(sp);
    for (const c of w.creeps) if (c.owner === pid) creeps[c.name] = creepW(c);
    // Game.rooms[name].controller
    const rooms = {};
    for (const ctrl of w.controllers) {
      const rn = roomName(ctrl.x, ctrl.y);
      rooms[rn] = rooms[rn] || { name: rn, controller: null, energyAvailable: 0, energyCapacityAvailable: 0 };
      rooms[rn].controller = ctrlW(ctrl);
    }
    for (const sp of w.spawns) if (sp.owner === pid) { const r = rooms[roomName(sp.x, sp.y)]; if (r) { r.energyAvailable += sp.energy; r.energyCapacityAvailable += sp.cap; } }
    for (const s of w.structures) if (s.owner === pid && s.type === 'extension') { const r = rooms[roomName(s.x, s.y)]; if (r) { r.energyAvailable += s.energy || 0; r.energyCapacityAvailable += s.energyCapacity || 50; } }

    const Game = { time: w.time, creeps, spawns, rooms,
      getObjectById: id => {
        for (const [k, l] of [['source', w.sources], ['site', w.sites], ['spawn', w.spawns], ['creep', w.creeps], ['controller', w.controllers], ['structure', w.structures]]) { const o = l.find(o => o.id === id); if (o) return wraps[k](o); } return null;
      },
      createConstructionSite: (x, y, type) => {
        if (!STRUCT_COST[type]) return ERR_INVALID_TARGET; x |= 0; y |= 0;
        const rm = w.rooms[roomKey(x, y)]; if (!rm) return ERR_INVALID_TARGET;
        const ctrl = w.controllers.find(c => roomKey(c.x, c.y) === roomKey(x, y));
        if (!ctrl || ctrl.owner !== pid) return ERR_NOT_OWNER;
        const limit = (CONTROLLER_STRUCTURES[type] || [])[ctrl.level] || 0;
        if (limit === 0) return ERR_RCL_NOT_ENOUGH;
        const rx = Math.floor(x / ROOM), ry = Math.floor(y / ROOM);
        if (countStruct(w, pid, type, rx, ry) >= limit) return ERR_RCL_NOT_ENOUGH;
        if (E.solid(x, y) && !WALKABLE_STRUCT.has(type)) return ERR_INVALID_TARGET;
        if (w.sites.some(s => s.x === x && s.y === y) || w.structures.some(s => s.x === x && s.y === y) || w.spawns.some(s => s.x === x && s.y === y) || w.controllers.some(s => s.x === x && s.y === y) || w.sources.some(s => s.x === x && s.y === y)) return ERR_INVALID_TARGET;
        if (w.sites.filter(s => s.owner === pid).length >= 100) return ERR_FULL;
        w.sites.push({ id: 'cs' + (w.nextId++), owner: pid, x, y, type, progress: 0, total: STRUCT_COST[type] }); return OK;
      } };
    this._creeps = creeps; this._wraps = wraps;
    return { Game, log: (...a) => E.log(pid, ...a) };
  }
  findList(pid, type, wraps) {
    const w = this.w;
    if (type === FIND_SOURCES) return w.sources.filter(s => s.energy > 0).map(wraps.source);
    if (type === FIND_CONSTRUCTION_SITES) return w.sites.filter(s => s.owner === pid).map(wraps.site);
    if (type === FIND_MY_SPAWNS) return w.spawns.filter(s => s.owner === pid).map(wraps.spawn);
    if (type === FIND_MY_CREEPS) return Object.values(this._creeps);
    if (type === FIND_HOSTILE_CREEPS) return w.creeps.filter(c => c.owner !== pid).map(wraps.creep);
    if (type === FIND_MY_STRUCTURES) return w.structures.filter(s => s.owner === pid).map(wraps.structure).concat(w.spawns.filter(s => s.owner === pid).map(wraps.spawn)).concat(w.controllers.filter(c => c.owner === pid).map(wraps.controller));
    if (type === FIND_STRUCTURES) return w.structures.map(wraps.structure).concat(w.spawns.map(wraps.spawn)).concat(w.controllers.map(wraps.controller));
    if (type === FIND_HOSTILE_STRUCTURES) return w.structures.filter(s => s.owner !== pid).map(wraps.structure);
    if (type === 'controller') return w.controllers.filter(c => c.owner === pid).map(wraps.controller);
    return [];
  }
  snapshot() {
    const w = this.w;
    return { time: w.time, S: w.S, roomsVer: w.roomsVer, players: Object.fromEntries(Object.entries(w.players).map(([k, p]) => [k, { name: p.name, color: p.color }])),
      sources: w.sources.map(s => ({ id: s.id, x: s.x, y: s.y, energy: s.energy, cap: s.cap })),
      controllers: w.controllers.map(c => ({ id: c.id, x: c.x, y: c.y, owner: c.owner, level: c.level, progress: c.progress, progressTotal: c.progressTotal, ticksToDowngrade: c.ticksToDowngrade })),
      spawns: w.spawns.map(s => ({ id: s.id, name: s.name, owner: s.owner, x: s.x, y: s.y, energy: s.energy, cap: s.cap, hits: s.hits, hitsMax: s.hitsMax, spawning: s.spawning && { name: s.spawning.name, left: s.spawning.left, total: s.spawning.total } })),
      creeps: w.creeps.map(c => ({ id: c.id, owner: c.owner, name: c.name, body: c.body, x: c.x, y: c.y, px: c.px, py: c.py, energy: c.energy, ttl: c.ttl, hits: c.body.length * 100, say: w.time - (c.sayT || -99) < 5 ? c.say : undefined })),
      sites: w.sites.map(s => ({ id: s.id, owner: s.owner, x: s.x, y: s.y, type: s.type, progress: s.progress, total: s.total })),
      structures: w.structures.map(s => ({ id: s.id, type: s.type, owner: s.owner, x: s.x, y: s.y, hits: s.hits, hitsMax: s.hitsMax, energy: s.energy, energyCapacity: s.energyCapacity })),
      events: this.events };
  }
  roomsData() { return { roomsVer: this.w.roomsVer, S: this.w.S, rooms: Object.fromEntries(Object.entries(this.w.rooms).map(([k, r]) => [k, { tiles: r.tiles.join(''), owner: r.owner }])) }; }
  saveData() { const w = this.w; return JSON.stringify(w, (k, v) => (k === '_path' || k === '_pt' || k === '_intent' || k === '_upgraded') ? undefined : v); }
}

function compileUser(code) {
  const consts = {
    OK, ERR_NOT_OWNER, ERR_NO_PATH, ERR_NOT_IN_RANGE, ERR_NOT_ENOUGH_ENERGY, ERR_BUSY, ERR_FULL, ERR_INVALID_TARGET, ERR_NAME_EXISTS, ERR_TIRED, ERR_NO_BODYPART, ERR_RCL_NOT_ENOUGH,
    FIND_SOURCES, FIND_MY_CREEPS, FIND_CONSTRUCTION_SITES, FIND_MY_SPAWNS, FIND_HOSTILE_CREEPS, FIND_STRUCTURES, FIND_MY_STRUCTURES, FIND_HOSTILE_STRUCTURES,
    LOOK_STRUCTURES, LOOK_CREEPS, LOOK_SOURCES, LOOK_CONSTRUCTION_SITES, RESOURCE_ENERGY,
    WORK: 'work', CARRY: 'carry', MOVE: 'move', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', TOUGH: 'tough',
    STRUCTURE_SPAWN: 'spawn', STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road', STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart',
    STRUCTURE_TOWER: 'tower', STRUCTURE_CONTAINER: 'container', STRUCTURE_STORAGE: 'storage', STRUCTURE_CONTROLLER: 'controller',
    STRUCTURE_LINK: 'link', STRUCTURE_EXTRACTOR: 'extractor', STRUCTURE_LAB: 'lab', STRUCTURE_TERMINAL: 'terminal',
    STRUCTURE_OBSERVER: 'observer', STRUCTURE_POWER_SPAWN: 'powerSpawn', STRUCTURE_NUKER: 'nuker', STRUCTURE_FACTORY: 'factory',
  };
  const names = Object.keys(consts), hidden = ['window', 'document', 'localStorage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Capacitor', 'globalThis', 'self', 'require', 'process', 'setTimeout', 'setInterval'];
  const f = new Function('Game', 'Memory', 'console', '__loopGuard', ...hidden, ...names, '"use strict";\n' + code);
  return (Game, Memory, api) => { let n = 0; const guard = () => { if (++n > 100000) throw new Error('循环次数过多（可能死循环）'); };
    f(Game, Memory, { log: api.log }, guard, ...hidden.map(() => undefined), ...names.map(k => consts[k])); };
}
if (typeof module !== 'undefined') module.exports = { Engine, newWorld, compileUser, countStruct, rclOf };
