// 权威模拟引擎：按官方 Screeps 规则（常量全部来自 SC = 官方 constants.js）。与渲染完全分离。
// 内部用"全局格坐标"（房间 (rx,ry) 的本地 (x,y) → rx*50+x），对玩家 API 一律暴露官方的房间内坐标 + roomName。
const PLAYER_COLORS = [0x4fc3f7, 0xff8a65, 0xba68c8, 0x81c784, 0xfff176, 0xf06292, 0x4db6ac, 0xa1887f];
const WORLD_GEN = 3; // 地图/存档格式版本（v1.4：懒生成扇区世界 + 玩家自选出生点）
const { OK, ERR_NOT_OWNER, ERR_NO_PATH, ERR_NAME_EXISTS, ERR_BUSY, ERR_NOT_FOUND, ERR_NOT_ENOUGH_ENERGY, ERR_NOT_ENOUGH_RESOURCES, ERR_INVALID_TARGET, ERR_FULL, ERR_NOT_IN_RANGE, ERR_INVALID_ARGS, ERR_TIRED, ERR_NO_BODYPART, ERR_RCL_NOT_ENOUGH, ERR_GCL_NOT_ENOUGH, RESOURCE_ENERGY } = SC;
const OBSTACLES = new Set(SC.OBSTACLE_OBJECT_TYPES);
const DIRS = { 1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1], 6: [-1, 1], 7: [-1, 0], 8: [-1, -1] };
const dirOf = (dx, dy) => { for (const d in DIRS) if (DIRS[d][0] === Math.sign(dx) && DIRS[d][1] === Math.sign(dy)) return +d; return 0; };
function dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function roomKey(x, y) { return Math.floor(x / ROOM) + ',' + Math.floor(y / ROOM); }
function roomName(x, y) { return roomNameXY(Math.floor(x / ROOM), Math.floor(y / ROOM)); }
const sameRoom = (a, b) => roomKey(a.x, a.y) === roomKey(b.x, b.y);
const bodyCost = body => body.reduce((a, b) => a + (SC.BODYPART_COST[b] ?? NaN), 0);
const storeSum = s => { let n = 0; for (const k in s) n += s[k] || 0; return n; };
const RESOURCES = new Set(SC.RESOURCES_ALL);

function newWorld(seed = (Date.now() % 1e6) | 0) {
  const w = { v: 3, gen: WORLD_GEN, seed, time: 0, S: 0, rooms: {}, roomsVer: 0, sources: [], minerals: [], controllers: [], spawns: [], creeps: [], sites: [], structures: [], resources: [], tombstones: [], flags: [], players: {}, memory: {}, nextId: 1 };
  w.S = SECTOR; return w;
}
// 懒生成：世界边界是 S×S 个房间（起始 11×11，一个官方扇区），但房间只在需要时（有对象/邻近/被查看）才生成
function ensureRoom(w, rx, ry) {
  if (rx < 0 || ry < 0 || rx >= w.S || ry >= w.S) return null; const k = rx + ',' + ry; if (w.rooms[k]) return w.rooms[k];
  const g = genRoom(w.seed, rx, ry, roomExits(w.seed, rx, ry));
  const rm = w.rooms[k] = { name: roomNameXY(rx, ry), type: g.type, tiles: g.tiles.slice(), base: g.tiles, owner: null };
  const ox = rx * ROOM, oy = ry * ROOM;
  for (const s of g.sources) w.sources.push({ kind: 'source', id: 's' + (w.nextId++), x: ox + s.x, y: oy + s.y, energy: SC.SOURCE_ENERGY_NEUTRAL_CAPACITY, cap: SC.SOURCE_ENERGY_NEUTRAL_CAPACITY, regenAt: null });
  const c = g.controller; if (c) w.controllers.push({ kind: 'controller', id: 'ctrl' + (w.nextId++), x: ox + c.x, y: oy + c.y, level: 0, progress: 0, downgradeTime: null, owner: null, reservation: null, safeMode: null, safeModeAvailable: 0, safeModeCooldown: null, upgradeBlocked: null, sign: null });
  if (g.mineral) { const m = g.mineral; w.minerals.push({ kind: 'mineral', id: 'm' + (w.nextId++), x: ox + m.x, y: oy + m.y, type: m.type, density: m.density, amount: m.amount, regenAt: null }); }
  applyBorders(w, rx, ry); w.roomsVer++; return rm;
}
function defaultBadge(pid) { const h = hash32(String(pid).split('').reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7), 1, 2); return { type: 1 + h % 24, color1: (h >>> 5) % 80, color2: (h >>> 12) % 80, color3: (h >>> 19) % 80, param: 0, flip: false }; }
function ensureNear(w, rx, ry, r = 1) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) ensureRoom(w, rx + dx, ry + dy); }
function ensureSize(w, S) {
  if (S <= w.S) return false; w.S = S;
  for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number); applyBorders(w, rx, ry); }
  w.roomsVer++; return true;
}
const SECTOR = 11; // 起始世界：一个官方扇区（四周是高速公路，中间 (5,5) 为扇区中心）
// 可选的空闲房间太少时向外扩一个扇区
function freeRooms(w) { const owned = ownedMap(w); let n = 0; for (let ry = 0; ry < w.S; ry++) for (let rx = 0; rx < w.S; rx++) if (roomStatus(w.S, owned, rx, ry, null) === 'free') n++; return n; }
function ownedMap(w) { const o = {}; for (const k in w.rooms) if (w.rooms[k].owner) o[k] = w.rooms[k].owner; return o; }
function maybeExpand(w) { const need = Math.max(12, Object.keys(w.players).length * 4); while (freeRooms(w) < need) ensureSize(w, w.S + 10); }
function ctrlOfRoom(w, k) { return w.controllers.find(c => roomKey(c.x, c.y) === k); }
function rclOf(w, x, y) { const c = ctrlOfRoom(w, roomKey(x, y)); return c && c.owner ? c.level : 0; }
function countStruct(w, pid, type, k) {
  const inRoom = o => roomKey(o.x, o.y) === k && o.owner === pid;
  return w.structures.filter(s => s.type === type && inRoom(s)).length + w.sites.filter(s => s.type === type && inRoom(s)).length + (type === 'spawn' ? w.spawns.filter(inRoom).length : 0);
}
function storeCap(w, o, res) { // 官方 Store.getCapacity
  if (o.kind === 'creep') return activeParts(o, 'carry') * SC.CARRY_CAPACITY;
  if (o.kind === 'spawn') return res === undefined || res === 'energy' ? SC.SPAWN_ENERGY_CAPACITY : null;
  const t = o.type, E = (n) => (res === undefined || res === 'energy') ? n : null;
  if (t === 'extension') return E(SC.EXTENSION_ENERGY_CAPACITY[rclOf(w, o.x, o.y)]);
  if (t === 'tower') return E(SC.TOWER_CAPACITY);
  if (t === 'link') return E(SC.LINK_CAPACITY);
  if (t === 'container') return SC.CONTAINER_CAPACITY;
  if (t === 'storage') return SC.STORAGE_CAPACITY;
  if (t === 'terminal') return SC.TERMINAL_CAPACITY;
  if (t === 'factory') return SC.FACTORY_CAPACITY;
  if (t === 'lab') return res === 'energy' ? SC.LAB_ENERGY_CAPACITY : res === undefined ? null : SC.LAB_MINERAL_CAPACITY;
  if (t === 'powerSpawn') return res === 'energy' ? SC.POWER_SPAWN_ENERGY_CAPACITY : res === 'power' ? SC.POWER_SPAWN_POWER_CAPACITY : null;
  if (t === 'nuker') return res === 'energy' ? SC.NUKER_ENERGY_CAPACITY : res === 'G' ? SC.NUKER_GHODIUM_CAPACITY : null;
  return null;
}
const hasStore = o => o.kind === 'creep' || o.kind === 'spawn' || o.kind === 'tombstone' || (o.kind === 'structure' && o.store);
function freeFor(w, o, res) { const cap = storeCap(w, o, res); if (cap == null) return null; const general = storeCap(w, o, undefined) != null; return cap - (general ? storeSum(o.store) : (o.store[res] || 0)); }
function partHits(c, i) { return Math.max(0, Math.min(100, c.hits - (c.body.length - 1 - i) * 100)); }
function activeParts(c, type) { let n = 0; for (let i = 0; i < c.body.length; i++) if (c.body[i] === type && partHits(c, i) > 0) n++; return n; }

class Engine {
  constructor(world) {
    if (!world || world.gen !== WORLD_GEN) world = newWorld(world && world.seed); // 旧格式存档无法兼容 → 新世界
    this._objVer = 0; this.w = world; this.fns = {}; this.onLog = null; this.events = [];
    for (const pid in world.players) this.setCode(pid, world.players[pid].code || '');
  }
  get W() { return this.w.S * ROOM; }
  log(pid, ...a) { const s = `[${this.w.time}] ` + a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' '); this.onLog && this.onLog(pid, s); }
  tile(x, y) { if (x < 0 || y < 0) return T_WALL; const rm = this.w.rooms[roomKey(x, y)] || ensureRoom(this.w, Math.floor(x / ROOM), Math.floor(y / ROOM)); if (!rm) return T_WALL; return rm.tiles[(y % ROOM) * ROOM + (x % ROOM)]; }
  _grid() { // 0 可走 1 障碍；附加：道路
    const w = this.w, WW = this.W;
    if (this._g && this._gVer === w.roomsVer && this._gObj === this._objVer && this._gW === WW) return this._g;
    const g = new Uint8Array(WW * WW).fill(1), road = new Uint8Array(WW * WW); // 未生成的房间当墙
    for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number), t = w.rooms[k].tiles; for (let ly = 0; ly < ROOM; ly++) for (let lx = 0; lx < ROOM; lx++) { const v = t[ly * ROOM + lx], i = (ry * ROOM + ly) * WW + rx * ROOM + lx; g[i] = v === T_WALL ? 1 : v === T_SWAMP ? 4 : 0; } }
    for (const L of [w.sources, w.controllers, w.spawns, w.minerals]) for (const o of L) g[o.y * WW + o.x] = 1;
    for (const o of w.structures) { if (OBSTACLES.has(o.type)) g[o.y * WW + o.x] = 1; if (o.type === 'road') road[o.y * WW + o.x] = 1; }
    for (const s of w.sites) if (OBSTACLES.has(s.type)) g[s.y * WW + s.x] |= 2; // 自己的工地可走；记号供敌方判断
    this._g = g; this._road = road; this._gVer = w.roomsVer; this._gObj = this._objVer; this._gW = WW; return g;
  }
  _occ() { if (!this._o) { this._o = new Map(); for (const c of this.w.creeps) if (!c.spawning) this._o.set(c.y * this.W + c.x, c); } return this._o; }
  solid(x, y, pid) {
    const WW = this.W; if (x < 0 || y < 0 || x >= WW || y >= WW) return true;
    if (this._grid()[y * WW + x] & 1) return true;
    if (pid !== undefined && this.w.structures.some(s => s.type === 'rampart' && s.x === x && s.y === y && s.owner !== pid && !s.isPublic)) return true;
    return false;
  }
  blocked(x, y, ignore) { if (this.solid(x, y, ignore && ignore.owner)) return true; const c = this._occ().get(y * this.W + x); return !!c && c !== ignore; }

  // manual=true：像官方一样由玩家在世界地图上自己选房间和 Spawn 位置（needsSpawn）；否则自动选（测试/机器人）
  // badge：玩家的官方式徽章（{type,color1..3,param,flip}）；没有时按 pid 生成一个固定的默认徽章
  addPlayer(pid, name, manual = false, badge = null) {
    const w = this.w; if (w.players[pid]) { w.players[pid].name = name || w.players[pid].name; if (badge) w.players[pid].badge = badge; return w.players[pid]; }
    const n = Object.keys(w.players).length;
    const p = w.players[pid] = { name: name || pid, color: PLAYER_COLORS[n % PLAYER_COLORS.length], code: '', gcl: 0, needsSpawn: true, badge: badge || defaultBadge(pid) };
    w.memory[pid] = { creeps: {}, spawns: {}, rooms: {}, flags: {} }; maybeExpand(w);
    if (!manual) this.placeSpawn(pid); this.log(pid, p.name, '加入世界'); return p;
  }
  // 校验出生点（官方规则）：普通房间、无主且不挨着别人的房间、可走格、不在边缘/出口旁、不压在对象上
  checkSpawnAt(pid, x, y) {
    const w = this.w, rx = Math.floor(x / ROOM), ry = Math.floor(y / ROOM);
    if (!w.players[pid]) return '玩家不存在';
    if (!this.needsSpawn(pid)) return '你已经有出生点了';
    const st = roomStatus(w.S, ownedMap(w), rx, ry, pid);
    if (st === 'out') return '超出世界'; if (st === 'highway') return '高速公路房间不能出生'; if (st === 'center') return '扇区中心房间不能出生';
    if (st === 'owned' || st === 'mine') return '房间已被占领'; if (st === 'close') return '离其他玩家太近';
    ensureNear(w, rx, ry, 0); const ctrl = ctrlOfRoom(w, rx + ',' + ry);
    if (!ctrl || ctrl.owner || (ctrl.reservation && ctrl.reservation.owner !== pid)) return '房间不可占领';
    const lx = x - rx * ROOM, ly = y - ry * ROOM;
    if (lx < 1 || ly < 1 || lx > 48 || ly > 48) return '不能放在房间边缘';
    if (this.tile(x, y) === T_WALL) return '不能放在墙上';
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = lx + dx, Y = ly + dy; if ((X === 0 || Y === 0 || X === 49 || Y === 49) && this.tile(x + dx, y + dy) !== T_WALL) return '不能紧挨出口'; }
    if (this.solid(x, y) || this._occ().get(y * this.W + x)) return '该位置被占用';
    let free = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && !this.solid(x + dx, y + dy)) free++;
    if (!free) return '周围没有空位，creep 出不来';
    return null;
  }
  placeSpawnAt(pid, x, y) {
    const err = this.checkSpawnAt(pid, x, y); if (err) return err;
    const w = this.w, rx = Math.floor(x / ROOM), ry = Math.floor(y / ROOM), k = rx + ',' + ry, ctrl = ctrlOfRoom(w, k);
    w.rooms[k].owner = pid; Object.assign(ctrl, { owner: pid, level: 1, progress: 0, downgradeTime: w.time + SC.CONTROLLER_DOWNGRADE[1] + 1, safeModeAvailable: 1, reservation: null });
    for (const s of w.sources) if (roomKey(s.x, s.y) === k) { s.cap = s.energy = SC.SOURCE_ENERGY_CAPACITY; s.regenAt = null; }
    w.spawns.push(this.makeSpawn(pid, 'Spawn1', x, y, SC.SPAWN_ENERGY_START)); w.players[pid].needsSpawn = false;
    ensureNear(w, rx, ry); this._objVer++; w.roomsVer++; maybeExpand(w); this.log(pid, '在', w.rooms[k].name, '放下 Spawn1'); return null;
  }
  // 自动出生：离其他玩家最远的空闲房间，在 Controller 与能量源附近找空地
  placeSpawn(pid, _grew = false) {
    if (!this.needsSpawn(pid)) return false; // 已经有出生点：不再放（以前会一直失败→扩张世界→递归，死循环）
    const w = this.w, owned = ownedMap(w), own = Object.keys(owned).map(k => k.split(',').map(Number)), cands = [];
    for (let ry = 0; ry < w.S; ry++) for (let rx = 0; rx < w.S; rx++) if (roomStatus(w.S, owned, rx, ry, pid) === 'free')
      cands.push({ rx, ry, d: own.length ? Math.min(...own.map(([ox, oy]) => Math.max(Math.abs(ox - rx), Math.abs(oy - ry)))) : -(Math.abs(rx - 2.5) + Math.abs(ry - 2.5)) });
    cands.sort((a, b) => b.d - a.d || a.ry - b.ry || a.rx - b.rx);
    for (const c of cands.slice(0, 20)) {
      ensureRoom(w, c.rx, c.ry); const k = c.rx + ',' + c.ry, ctrl = ctrlOfRoom(w, k), srcs = w.sources.filter(s => roomKey(s.x, s.y) === k); if (!ctrl) continue;
      const tiles = [];
      for (let ly = 4; ly < 46; ly++) for (let lx = 4; lx < 46; lx++) {
        const x = c.rx * ROOM + lx, y = c.ry * ROOM + ly; let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (this.solid(x + dx, y + dy)) ok = false;
        if (ok && dist({ x, y }, ctrl) >= 3) tiles.push({ x, y, sc: dist({ x, y }, ctrl) + srcs.reduce((a, s) => a + dist({ x, y }, s), 0) });
      }
      tiles.sort((a, b) => a.sc - b.sc);
      for (const t of tiles.slice(0, 8)) if (this.findPath(t, ctrl, 1).length && !this.placeSpawnAt(pid, t.x, t.y)) return true;
    }
    if (_grew) return false; // 扩张一次仍放不下就放弃，绝不无限递归
    ensureSize(w, w.S + 10); return this.placeSpawn(pid, true);
  }
  // 需要选出生点：标记为 needsSpawn，或（旧存档）既没有 Spawn 也没有房间
  needsSpawn(pid) { const w = this.w, p = w.players[pid]; if (!p) return false; if (p.needsSpawn) return true;
    if (!w.spawns.some(s => s.owner === pid) && !Object.values(w.rooms).some(r => r.owner === pid)) { p.needsSpawn = true; return true; } return false; }
  // 重新出生（官方 respawn）：清除该玩家的一切，回到选点状态
  respawn(pid) {
    const w = this.w, mine = o => o.owner === pid; if (!w.players[pid]) return;
    w.creeps = w.creeps.filter(c => !mine(c)); w.spawns = w.spawns.filter(s => !mine(s)); w.structures = w.structures.filter(s => !mine(s)); w.sites = w.sites.filter(s => !mine(s)); w.flags = w.flags.filter(f => !mine(f));
    for (const c of w.controllers) if (c.owner === pid) Object.assign(c, { owner: null, level: 0, progress: 0, downgradeTime: null, safeMode: null, safeModeAvailable: 0 });
    for (const c of w.controllers) if (c.reservation && c.reservation.owner === pid) c.reservation = null;
    for (const k in w.rooms) if (w.rooms[k].owner === pid) w.rooms[k].owner = null;
    w.memory[pid] = { creeps: {}, spawns: {}, rooms: {}, flags: {} }; Object.assign(w.players[pid], { needsSpawn: true, gcl: 0 });
    this._o = null; this._objVer++; w.roomsVer++; this.log(pid, '已重新出生，请在世界地图上选择出生点');
  }
  makeSpawn(owner, name, x, y, energy) { return { kind: 'spawn', id: 'sp' + (this.w.nextId++), name, owner, x, y, store: { energy }, hits: SC.SPAWN_HITS, hitsMax: SC.SPAWN_HITS, spawning: null }; }
  makeStruct(type, owner, x, y) {
    const w = this.w, s = { kind: 'structure', id: 'st' + (w.nextId++), type, owner: (type === 'road' || type === 'container' || type === 'constructedWall') ? null : owner, x, y };
    const H = { extension: SC.EXTENSION_HITS, road: SC.ROAD_HITS, constructedWall: SC.WALL_HITS, rampart: SC.RAMPART_HITS, tower: SC.TOWER_HITS, container: SC.CONTAINER_HITS, storage: SC.STORAGE_HITS, link: SC.LINK_HITS, extractor: SC.EXTRACTOR_HITS, lab: SC.LAB_HITS, terminal: SC.TERMINAL_HITS, observer: SC.OBSERVER_HITS, powerSpawn: SC.POWER_SPAWN_HITS, nuker: SC.NUKER_HITS, factory: SC.FACTORY_HITS };
    s.hits = H[type] || 1; s.hitsMax = type === 'constructedWall' ? SC.WALL_HITS_MAX : type === 'rampart' ? SC.RAMPART_HITS_MAX[rclOf(w, x, y)] || SC.RAMPART_HITS_MAX[2] : s.hits;
    if (type === 'road') { const t = this.tile(x, y), m = t === T_SWAMP ? SC.CONSTRUCTION_COST_ROAD_SWAMP_RATIO : t === T_WALL ? SC.CONSTRUCTION_COST_ROAD_WALL_RATIO : 1; s.hits = s.hitsMax = SC.ROAD_HITS * m; s.decayAt = w.time + SC.ROAD_DECAY_TIME; }
    if (type === 'container') s.decayAt = w.time + SC.CONTAINER_DECAY_TIME;
    if (type === 'rampart') s.decayAt = w.time + SC.RAMPART_DECAY_TIME;
    if (storeCap(w, s, 'energy') != null || storeCap(w, s, undefined) != null) s.store = {};
    if (['link', 'tower', 'extractor', 'lab', 'terminal', 'factory', 'nuker'].includes(type)) s.cooldown = 0;
    return s;
  }
  setCode(pid, code) {
    if (!this.w.players[pid]) return; this.w.players[pid].code = code;
    try { this.fns[pid] = code ? compileUser(code) : null; } catch (e) { this.fns[pid] = null; this.log(pid, '编译失败:', e.message); }
  }
  // A*（官方 moveTo 默认代价：道路 1、平原 2、沼泽 10），8 方向；opts.ignoreCreeps
  findPath(from, to, range, me, opts = {}) {
    const WW = this.W, N = WW * WW, g = this._grid(), road = this._road, occ = this._occ();
    const plain = opts.plainCost || (opts.ignoreRoads ? 1 : 2), swamp = opts.swampCost || (opts.ignoreRoads ? 5 : 10);
    if (!this._gs || this._gs.length !== N) { this._gs = new Float64Array(N); this._prev = new Int32Array(N); this._stamp = new Uint32Array(N); this._st = 0; }
    const gs = this._gs, prev = this._prev, stamp = this._stamp, st = ++this._st, pid = me && me.owner;
    const tos = Array.isArray(to) ? to : [to];
    const H = k => { const x = k % WW, y = (k / WW) | 0; let m = Infinity; for (const t of tos) { const d = Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) - range; if (d < m) m = d; } return Math.max(0, m); };
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    if (tos.length === 1 && range <= 1 && dist(from, tos[0]) > range) { // 快速判定：目标周围可站的格子全被占/是墙 → 不必搜索
      const t = tos[0]; let free = false;
      for (let dy = -range; dy <= range && !free; dy++) for (let dx = -range; dx <= range && !free; dx++) { const X = t.x + dx, Y = t.y + dy; if (X < 0 || Y < 0 || X >= WW || Y >= WW || (g[Y * WW + X] & 1)) continue; const c = occ.get(Y * WW + X); if (!c || c === me || opts.ignoreCreeps) free = true; }
      if (!free) return [];
    }
    let hostileRamp = null; for (const s of this.w.structures) if (s.type === 'rampart' && s.owner !== pid && !s.isPublic) (hostileRamp = hostileRamp || new Set()).add(s.y * WW + s.x);
    const start = from.y * WW + from.x; stamp[start] = st; gs[start] = 0; prev[start] = start; push(start, H(start));
    let end = -1, ops = 0, maxOps = opts.maxOps || 4000, bestK = start, bestH = H(start);
    while (heap.length && ops++ < maxOps) {
      const [, k] = pop(), x = k % WW, y = (k / WW) | 0, hk = H(k);
      if (hk === 0) { end = k; break; }
      if (hk < bestH) { bestH = hk; bestK = k; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= WW || ny >= WW) continue; const nk = ny * WW + nx;
        if (g[nk] & 1) continue;
        if (pid !== undefined && (g[nk] & 2) && this.w.sites.some(s => s.x === nx && s.y === ny && s.owner !== pid)) continue;
        if (hostileRamp && hostileRamp.has(nk)) continue;
        if (!opts.ignoreCreeps && occ.has(nk) && occ.get(nk) !== me && Math.max(Math.abs(nx - from.x), Math.abs(ny - from.y)) <= 3) continue;
        const cost = road[nk] && !opts.ignoreRoads ? 1 : (g[nk] & 4) ? swamp : plain, ng = gs[k] + cost;
        if (stamp[nk] === st && gs[nk] <= ng) continue;
        stamp[nk] = st; gs[nk] = ng; prev[nk] = k; push(nk, ng + H(nk) * 1.0001);
      }
    }
    if (end < 0) { if (!opts.partial || bestK === start) return []; end = bestK; } // 官方 PathFinder：到不了时返回到最近点的不完整路径
    const path = []; for (let k = end; k !== prev[k]; k = prev[k]) path.push({ x: k % WW, y: (k / WW) | 0 });
    return path.reverse();
  }

  // ===== 一个 tick：运行代码（动作立即结算）→ 移动 → 寿命/伤亡 → 各类建筑 tick =====
  tick() {
    const w = this.w; w.time++; this.events = []; this._o = null;
    if (!this._near) this._near = new Set();
    for (const c of w.creeps) { const k = roomKey(c.x, c.y); if (!this._near.has(k)) { this._near.add(k); ensureNear(w, Math.floor(c.x / ROOM), Math.floor(c.y / ROOM)); } }
    for (const c of w.creeps) { c._did = {}; c.px = c.x; c.py = c.y; }
    for (const pid in w.players) {
      const f = this.fns[pid]; if (!f) continue; const api = this.buildApi(pid), t0 = Date.now();
      try { f(api); } catch (e) { this.log(pid, '代码错误:', e && e.stack ? String(e.stack).split('\n').slice(0, 2).join(' ') : e); }
      this.cpuUsed = Date.now() - t0;
    }
    this.resolveMoves();
    for (const c of w.creeps) {
      if (c.spawning) continue;
      // 官方：站在出口格上 → 下一 tick 到相邻房间对侧边缘
      const lx = c.x % ROOM, ly = c.y % ROOM; let nx = c.x, ny = c.y;
      if (lx === 0) nx--; else if (lx === ROOM - 1) nx++; else if (ly === 0) ny--; else if (ly === ROOM - 1) ny++;
      if ((nx !== c.x || ny !== c.y) && c._arrived !== w.time && !this.blocked(nx, ny, c)) { const o = this._occ(); o.delete(c.y * this.W + c.x); c.x = nx; c.y = ny; c.px = nx; c.py = ny; o.set(c.y * this.W + c.x, c); c._path = null; }
      c.fatigue = Math.max(0, c.fatigue - activeParts(c, 'move') * 2);
      c.ttl--;
    }
    for (const c of w.creeps.slice()) if (!c.spawning && (c.ttl <= 0 || c.hits <= 0)) this.killCreep(c, SC.CREEP_CORPSE_RATE);
    this.tickSpawns(); this.tickSources(); this.tickControllers(); this.tickStructures(); this.tickGround();
    this._o = null;
  }
  resolveMoves() {
    const w = this.w, movers = w.creeps.filter(c => c._move && !c.spawning); let progress = true;
    while (progress && movers.length) {
      progress = false;
      for (let i = movers.length - 1; i >= 0; i--) {
        const c = movers[i], t = c._move, o = this._occ(), other = o.get(t.y * this.W + t.x);
        if (this.solid(t.x, t.y, c.owner)) { movers.splice(i, 1); c._path = null; continue; }
        const swap = other && other._move && other._move.x === c.x && other._move.y === c.y;
        if (other && other !== c && !swap) continue;
        if (swap) { o.set(c.y * this.W + c.x, other); other.x = c.x; other.y = c.y; this.afterStep(other); movers.splice(movers.indexOf(other), 1); delete other._move; i = Math.min(i, movers.length); }
        else o.delete(c.y * this.W + c.x);
        c.x = t.x; c.y = t.y; o.set(c.y * this.W + c.x, c); this.afterStep(c);
        const j = movers.indexOf(c); if (j >= 0) movers.splice(j, 1); delete c._move; progress = true; break;
      }
    }
    for (const c of movers) { delete c._move; c._path = null; }
  }
  afterStep(c) { // 官方疲劳：每个非 MOVE 部件（空 CARRY 不算）× 地形系数（道路 1 / 平原 2 / 沼泽 10）
    const w = this.w; c._arrived = w.time; delete c._move;
    let carryLoaded = Math.ceil(storeSum(c.store) / SC.CARRY_CAPACITY), weight = 0;
    for (const p of c.body) { if (p === 'move') continue; if (p === 'carry') { if (carryLoaded > 0) { carryLoaded--; weight++; } continue; } weight++; }
    const road = w.structures.find(s => s.type === 'road' && s.x === c.x && s.y === c.y);
    const k = road ? 1 : this.tile(c.x, c.y) === T_SWAMP ? 10 : 2; c.fatigue += weight * k;
    if (road) { road.hits -= SC.ROAD_WEAROUT * c.body.length; if (road.hits <= 0) this.removeStruct(road); }
  }
  killCreep(c, rate) {
    const w = this.w; w.creeps = w.creeps.filter(x => x !== c); this._o = null; this._objVer++;
    const ts = { kind: 'tombstone', id: 'tb' + (w.nextId++), x: c.x, y: c.y, owner: c.owner, creepName: c.name, creepBody: c.body.slice(), deathTime: w.time, decayAt: w.time + c.body.length * SC.TOMBSTONE_DECAY_PER_PART, store: Object.assign({}, c.store) };
    if (rate > 0) { const life = c.body.includes('claim') ? SC.CREEP_CLAIM_LIFE_TIME : SC.CREEP_LIFE_TIME; const e = Math.floor(bodyCost(c.body) * rate * Math.max(0, c.ttl) / life); if (e > 0) ts.store.energy = (ts.store.energy || 0) + e; }
    const cont = w.structures.find(s => s.type === 'container' && s.x === c.x && s.y === c.y);
    if (cont) for (const r in ts.store) { const a = Math.min(ts.store[r], freeFor(w, cont, r)); if (a > 0) { cont.store[r] = (cont.store[r] || 0) + a; ts.store[r] -= a; } }
    w.tombstones.push(ts); this.log(c.owner, c.name, c.ttl <= 0 ? '寿终' : '死亡'); this.events.push({ t: 'die', x: c.x, y: c.y });
  }
  removeStruct(s) { const w = this.w; w.structures = w.structures.filter(x => x !== s); w.spawns = w.spawns.filter(x => x !== s); this._objVer++; if (s.kind === 'spawn') for (const c of w.creeps.filter(c => c.spawning && c.x === s.x && c.y === s.y)) w.creeps.splice(w.creeps.indexOf(c), 1); }
  roomEnergy(k, pid) { const w = this.w, L = w.spawns.filter(s => roomKey(s.x, s.y) === k && s.owner === pid).concat(w.structures.filter(s => s.type === 'extension' && s.owner === pid && roomKey(s.x, s.y) === k && this.isActive(s))); return { list: L, avail: L.reduce((a, s) => a + (s.store.energy || 0), 0), cap: L.reduce((a, s) => a + storeCap(w, s, 'energy'), 0) }; }
  isActive(s) { // 官方 isActive：RCL 降级后超额建筑按离 Controller 距离保留
    const w = this.w, k = roomKey(s.x, s.y), ctrl = ctrlOfRoom(w, k), type = s.kind === 'spawn' ? 'spawn' : s.type;
    if (!SC.CONTROLLER_STRUCTURES[type] || !ctrl) return true; if (!ctrl.owner || ctrl.owner !== s.owner) return false;
    const lim = SC.CONTROLLER_STRUCTURES[type][ctrl.level] || 0, all = (type === 'spawn' ? w.spawns : w.structures.filter(x => x.type === type)).filter(x => roomKey(x.x, x.y) === k);
    if (all.length <= lim) return true; return all.sort((a, b) => dist(a, ctrl) - dist(b, ctrl)).indexOf(s) < lim;
  }
  tickSpawns() {
    const w = this.w;
    for (const sp of w.spawns) {
      const sc = sp.spawning;
      if (sc && w.time >= sc.spawnTime) {
        const cr = w.creeps.find(c => c.spawning && c.owner === sp.owner && c.name === sc.name), dirs = sc.directions && sc.directions.length ? sc.directions : [1, 2, 3, 4, 5, 6, 7, 8];
        let pos = null; for (const d of dirs) { const [dx, dy] = DIRS[d]; if (!this.blocked(sp.x + dx, sp.y + dy)) { pos = { x: sp.x + dx, y: sp.y + dy }; break; } }
        if (!cr) sp.spawning = null;
        else if (pos) { cr.spawning = false; cr.x = cr.px = pos.x; cr.y = cr.py = pos.y; cr.px = sp.x; cr.py = sp.y; cr.ttl = cr.body.includes('claim') ? SC.CREEP_CLAIM_LIFE_TIME : SC.CREEP_LIFE_TIME; this._o = null; sp.spawning = null; this.log(sp.owner, '新 creep:', cr.name); this.events.push({ t: 'spawn', x: pos.x, y: pos.y, fx: sp.x, fy: sp.y }); }
        else sc.spawnTime = w.time + 1;
      }
      const k = roomKey(sp.x, sp.y), ctrl = ctrlOfRoom(w, k);
      if (!ctrl || ctrl.level < 1 || ctrl.owner !== sp.owner || !this.isActive(sp)) continue;
      if (this.roomEnergy(k, sp.owner).avail < SC.SPAWN_ENERGY_CAPACITY && sp.store.energy < SC.SPAWN_ENERGY_CAPACITY) sp.store.energy++;
    }
  }
  tickSources() {
    const w = this.w;
    for (const s of w.sources) {
      const ctrl = ctrlOfRoom(w, roomKey(s.x, s.y)), cap = ctrl && (ctrl.owner || (ctrl.reservation && ctrl.reservation.endTime > w.time)) ? SC.SOURCE_ENERGY_CAPACITY : SC.SOURCE_ENERGY_NEUTRAL_CAPACITY;
      if (cap !== s.cap) { s.cap = cap; s.energy = Math.min(s.energy, cap); }
      if (s.energy < s.cap) { if (!s.regenAt) s.regenAt = w.time + SC.ENERGY_REGEN_TIME; if (w.time >= s.regenAt - 1) { s.energy = s.cap; s.regenAt = null; } }
    }
    for (const m of w.minerals) if (m.amount <= 0) { if (!m.regenAt) m.regenAt = w.time + SC.MINERAL_REGEN_TIME; if (w.time >= m.regenAt) { m.amount = SC.MINERAL_DENSITY[m.density]; m.regenAt = null; } }
  }
  tickControllers() {
    const w = this.w;
    for (const c of w.controllers) {
      if (c.reservation && w.time >= c.reservation.endTime - 1) c.reservation = null;
      if (!c.owner) continue;
      if (!c.downgradeTime) { c.downgradeTime = w.time + SC.CONTROLLER_DOWNGRADE[c.level] + 1; continue; }
      if (c._upgraded) { c.downgradeTime = Math.min(c.downgradeTime + SC.CONTROLLER_DOWNGRADE_RESTORE + 1, w.time + SC.CONTROLLER_DOWNGRADE[c.level] + 1); c._upgraded = 0; continue; }
      while (w.time >= c.downgradeTime - 1 && c.level > 0) {
        c.level--;
        if (c.level === 0) { this.log(c.owner, 'Controller 失控'); const rm = w.rooms[roomKey(c.x, c.y)]; if (rm && rm.owner === c.owner) rm.owner = null; Object.assign(c, { progress: 0, owner: null, downgradeTime: null, upgradeBlocked: null, safeMode: null, safeModeAvailable: 0 }); }
        else { c.downgradeTime += SC.CONTROLLER_DOWNGRADE[c.level] / 2 + 1; c.progress += Math.round(SC.CONTROLLER_LEVELS[c.level] * 0.9); c.safeModeAvailable = 0; this.log(c.owner, 'Controller 降级至 RCL', c.level); }
      }
    }
  }
  tickStructures() {
    const w = this.w;
    for (const s of w.structures.slice()) {
      if (s.cooldown > 0) s.cooldown--;
      if (s.decayAt != null && w.time >= s.decayAt - 1) {
        if (s.type === 'road') { const t = this.tile(s.x, s.y); s.hits -= SC.ROAD_DECAY_AMOUNT * (t === T_SWAMP ? SC.CONSTRUCTION_COST_ROAD_SWAMP_RATIO : t === T_WALL ? SC.CONSTRUCTION_COST_ROAD_WALL_RATIO : 1); s.decayAt = w.time + SC.ROAD_DECAY_TIME; }
        else if (s.type === 'container') { s.hits -= SC.CONTAINER_DECAY; s.decayAt = w.time + (rclOf(w, s.x, s.y) > 0 ? SC.CONTAINER_DECAY_TIME_OWNED : SC.CONTAINER_DECAY_TIME); }
        else if (s.type === 'rampart') { s.hits -= SC.RAMPART_DECAY_AMOUNT; s.decayAt = w.time + SC.RAMPART_DECAY_TIME; }
        if (s.hits <= 0) { if (s.store) for (const r in s.store) this.dropAt(s.x, s.y, r, s.store[r]); this.removeStruct(s); }
      }
      if (s.type === 'rampart') s.hitsMax = SC.RAMPART_HITS_MAX[rclOf(w, s.x, s.y)] || 0;
    }
  }
  tickGround() {
    const w = this.w;
    for (const r of w.resources) r.amount -= Math.ceil(r.amount / SC.ENERGY_DECAY);
    w.resources = w.resources.filter(r => r.amount > 0);
    for (const t of w.tombstones.filter(t => w.time >= t.decayAt)) { for (const r in t.store) this.dropAt(t.x, t.y, r, t.store[r]); w.tombstones.splice(w.tombstones.indexOf(t), 1); }
  }
  dropAt(x, y, res, amount) {
    const w = this.w; if (!(amount > 0)) return;
    const cont = w.structures.find(s => s.type === 'container' && s.x === x && s.y === y);
    if (cont) { const a = Math.min(amount, freeFor(w, cont, res)); if (a > 0) { cont.store[res] = (cont.store[res] || 0) + a; amount -= a; } }
    if (amount <= 0) return;
    const ex = w.resources.find(r => r.x === x && r.y === y && r.resourceType === res);
    if (ex) ex.amount += amount; else w.resources.push({ kind: 'resource', id: 'r' + (w.nextId++), x, y, resourceType: res, amount });
  }
  damage(target, amount, attackerOwner) {
    const w = this.w, ctrl = ctrlOfRoom(w, roomKey(target.x, target.y));
    if (ctrl && ctrl.safeMode > w.time && ctrl.owner !== attackerOwner) return; // 安全模式
    const ramp = w.structures.find(s => s.type === 'rampart' && s.x === target.x && s.y === target.y);
    if (ramp && ramp !== target) target = ramp;
    target.hits -= amount;
    if (target.kind !== 'creep' && target.hits <= 0) { if (target.store) for (const r in target.store) this.dropAt(target.x, target.y, r, target.store[r]); this.removeStruct(target); }
  }
  gclLevel(pid) { const p = this.w.players[pid].gcl || 0; let lv = 1; while (p >= Math.pow(lv, SC.GCL_POW) * SC.GCL_MULTIPLY) lv++; return lv; }

  buildApi(pid) { return buildApi(this, pid); }
  findList(pid, type, k, wrap) { return findList(this, pid, type, k, wrap); }
  snapshot() { return worldSnapshot(this.w, this.events); }
  roomsData() { return roomsDataOf(this.w); }
}
// 快照：渲染/联机用的扁平只读视图（渲染层也可直接传入原始 world）
function worldSnapshot(w, events) {
    const en = s => (s.store && s.store.energy) || 0;
    return { time: w.time, S: w.S, roomsVer: w.roomsVer, players: Object.fromEntries(Object.entries(w.players).map(([k, p]) => [k, { name: p.name, color: p.color, needsSpawn: !!p.needsSpawn, badge: p.badge || defaultBadge(k), gcl: p.gcl || 0 }])), owned: ownedMap(w),
      sources: w.sources.map(s => ({ id: s.id, x: s.x, y: s.y, energy: s.energy, cap: s.cap })),
      minerals: w.minerals.map(m => ({ id: m.id, x: m.x, y: m.y, type: m.type, amount: m.amount })),
      controllers: w.controllers.map(c => ({ id: c.id, x: c.x, y: c.y, owner: c.owner, level: c.level, progress: c.progress, progressTotal: SC.CONTROLLER_LEVELS[c.level] || 0, ticksToDowngrade: c.downgradeTime ? c.downgradeTime - w.time : 0 })),
      spawns: w.spawns.map(s => ({ id: s.id, name: s.name, owner: s.owner, x: s.x, y: s.y, energy: en(s), cap: SC.SPAWN_ENERGY_CAPACITY, hits: s.hits, hitsMax: s.hitsMax, spawning: s.spawning && { name: s.spawning.name, left: s.spawning.spawnTime - w.time, total: s.spawning.needTime } })),
      creeps: w.creeps.filter(c => !c.spawning).map(c => ({ id: c.id, owner: c.owner, name: c.name, body: c.body, x: c.x, y: c.y, px: c.px, py: c.py, energy: storeSum(c.store), ttl: c.ttl, hits: c.hits, hitsMax: c.body.length * 100, fatigue: c.fatigue, say: w.time - (c.sayT || -99) < 2 ? c.say : undefined })),
      sites: w.sites.map(s => ({ id: s.id, owner: s.owner, x: s.x, y: s.y, type: s.type, progress: s.progress, total: s.total })),
      structures: w.structures.map(s => ({ id: s.id, type: s.type, owner: s.owner, x: s.x, y: s.y, hits: s.hits, hitsMax: s.hitsMax, energy: s.store ? en(s) : undefined, energyCapacity: s.store ? storeCap(w, s, 'energy') ?? storeCap(w, s) : undefined })),
      resources: w.resources.map(r => ({ id: r.id, x: r.x, y: r.y, resourceType: r.resourceType, amount: r.amount })),
      tombstones: w.tombstones.map(t => ({ id: t.id, x: t.x, y: t.y, owner: t.owner, creepName: t.creepName, energy: t.store.energy || 0, decay: t.decayAt - w.time })),
      flags: (w.flags || []).map(f => ({ id: f.id, x: f.x, y: f.y, owner: f.owner, name: f.name, color: f.color, secondaryColor: f.secondaryColor })),
      events: events || [] };
}
function roomsDataOf(w) { return { roomsVer: w.roomsVer, S: w.S, rooms: Object.fromEntries(Object.entries(w.rooms).map(([k, r]) => [k, { tiles: r.tiles.join(''), owner: r.owner, name: r.name, type: r.type }])) }; }
Engine.prototype.saveData = function () { const w = this.w; return JSON.stringify(w, (k, v) => (k[0] === '_' ? undefined : v)); };
if (typeof module !== 'undefined') module.exports = { Engine, newWorld, countStruct, rclOf };

// ===================== 玩家 API（官方名称/语义/返回码） =====================
function findList(E, pid, type, k, wrap) {
  const w = E.w, inR = o => k == null || roomKey(o.x, o.y) === k, mine = o => o.owner === pid, W = l => l.filter(inR).map(wrap);
  const hostile = o => o.owner && o.owner !== pid, allStructs = () => w.structures.concat(w.spawns, w.controllers);
  switch (type) {
    case SC.FIND_CREEPS: return W(w.creeps.filter(c => !c.spawning));
    case SC.FIND_MY_CREEPS: return W(w.creeps.filter(c => !c.spawning && mine(c)));
    case SC.FIND_HOSTILE_CREEPS: return W(w.creeps.filter(c => !c.spawning && !mine(c)));
    case SC.FIND_SOURCES_ACTIVE: return W(w.sources.filter(s => s.energy > 0));
    case SC.FIND_SOURCES: return W(w.sources);
    case SC.FIND_DROPPED_RESOURCES: return W(w.resources);
    case SC.FIND_STRUCTURES: return W(allStructs());
    case SC.FIND_MY_STRUCTURES: return W(allStructs().filter(mine));
    case SC.FIND_HOSTILE_STRUCTURES: return W(allStructs().filter(hostile));
    case SC.FIND_FLAGS: return W(w.flags.filter(mine));
    case SC.FIND_CONSTRUCTION_SITES: return W(w.sites);
    case SC.FIND_MY_SPAWNS: return W(w.spawns.filter(mine));
    case SC.FIND_HOSTILE_SPAWNS: return W(w.spawns.filter(hostile));
    case SC.FIND_MY_CONSTRUCTION_SITES: return W(w.sites.filter(mine));
    case SC.FIND_HOSTILE_CONSTRUCTION_SITES: return W(w.sites.filter(hostile));
    case SC.FIND_MINERALS: return W(w.minerals);
    case SC.FIND_TOMBSTONES: return W(w.tombstones);
    case SC.FIND_EXIT_TOP: case SC.FIND_EXIT_RIGHT: case SC.FIND_EXIT_BOTTOM: case SC.FIND_EXIT_LEFT: case SC.FIND_EXIT: {
      if (k == null) return []; const [rx, ry] = k.split(',').map(Number), out = [];
      const add = (lx, ly) => { const x = rx * ROOM + lx, y = ry * ROOM + ly; if (E.tile(x, y) !== T_WALL) out.push(wrap({ kind: 'pos', x, y })); };
      for (let i = 0; i < ROOM; i++) { if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_TOP) add(i, 0); if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_RIGHT) add(49, i); if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_BOTTOM) add(i, 49); if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_LEFT) add(0, i); }
      return out;
    }
    case 'controller': return W(w.controllers.filter(mine)); // 兼容 v1.2 积木
    default: return []; // FIND_NUKES / POWER_CREEPS / DEPOSITS / RUINS 等：本游戏中不存在
  }
}

function buildApi(E, pid) {
  const w = E.w, cache = new Map(), ev = E.events, mem = w.memory[pid];
  const toG = (x, y, rn) => { const p = parseRoomName(rn); return p ? { x: p[0] * ROOM + x, y: p[1] * ROOM + y } : null; };
  const raw = t => t && (t._raw || (t instanceof RoomPosition ? t._g : null));
  const gpos = t => { if (!t) return null; if (t._raw) return t._raw; if (t instanceof RoomPosition) return t._g; if (t.pos instanceof RoomPosition) return t.pos._g; return null; };
  const range = (a, b) => sameRoom(a, b) ? dist(a, b) : Infinity;
  const applyOpts = (list, opts) => { if (opts && opts.filter) { const f = opts.filter; return list.filter(typeof f === 'function' ? f : o => Object.keys(f).every(key => o[key] === f[key])); } return list; };
  const resolveFind = (t, k) => Array.isArray(t) ? t : findList(E, pid, t, k, wrap);

  class RoomPosition {
    constructor(x, y, roomName) { this.x = x; this.y = y; this.roomName = roomName; Object.defineProperty(this, '_g', { value: toG(x, y, roomName), enumerable: false }); }
    _args(a, b, c) { if (typeof a === 'number') return toG(a, b, c || this.roomName); return gpos(a); }
    getRangeTo(a, b) { const g = this._args(a, b); return g ? range(this._g, g) : Infinity; }
    inRangeTo(a, b, c) { if (typeof a === 'number') return this.getRangeTo(a, b) <= c; return this.getRangeTo(a) <= b; }
    isNearTo(a, b) { return this.getRangeTo(a, b) <= 1; }
    isEqualTo(a, b) { return this.getRangeTo(a, b) === 0; }
    getDirectionTo(a, b) { const g = this._args(a, b); return g ? dirOf(g.x - this._g.x, g.y - this._g.y) : 0; }
    findInRange(t, r, opts) { return applyOpts(resolveFind(t, roomKey(this._g.x, this._g.y)).filter(o => range(this._g, gpos(o)) <= r), opts); }
    findClosestByRange(t, opts) { let b = null, bd = Infinity; for (const o of applyOpts(resolveFind(t, roomKey(this._g.x, this._g.y)), opts)) { const d = range(this._g, gpos(o)); if (d < bd) { bd = d; b = o; } } return b; }
    findClosestByPath(t, opts) { // 一次多目标 A*，按实际路径长度取最近
      const list = applyOpts(resolveFind(t, roomKey(this._g.x, this._g.y)), opts).filter(o => sameRoom(this._g, gpos(o))); if (!list.length) return null;
      const near = list.find(o => dist(this._g, gpos(o)) <= 1); if (near) return near;
      const p = E.findPath(this._g, list.map(gpos), 1, undefined, Object.assign({ maxOps: 4000, ignoreCreeps: true }, opts)); if (!p.length) return null;
      const end = p[p.length - 1]; let b = null, bd = Infinity; for (const o of list) { const d = dist(end, gpos(o)); if (d < bd) { bd = d; b = o; } } return b;
    }
    findPathTo(a, b, c) { const g = this._args(a, b), opts = typeof a === 'number' ? c : b; return g ? E.findPath(this._g, g, (opts && opts.range) || 0, undefined, opts || {}).map((p, i, arr) => { const prev = i ? arr[i - 1] : this._g; return { x: p.x % ROOM, y: p.y % ROOM, dx: p.x - prev.x, dy: p.y - prev.y, direction: dirOf(p.x - prev.x, p.y - prev.y) }; }) : []; }
    look() { return lookAt(this._g.x, this._g.y); }
    lookFor(type) { return lookAt(this._g.x, this._g.y).filter(o => o.type === type).map(o => o[type]); }
    createConstructionSite(type, name) { return createSite(this._g.x, this._g.y, type, name); }
    createFlag(name, color, secondaryColor) { return createFlag(this._g, name, color, secondaryColor); }
    find(t, opts) { return Room_find(this._g, t, opts); } // 兼容 v1.2 积木（非官方）
    toJSON() { return { x: this.x, y: this.y, roomName: this.roomName }; }
    toString() { return `[room ${this.roomName} pos ${this.x},${this.y}]`; }
  }
  const Room_find = (g, t, opts) => applyOpts(findList(E, pid, t, roomKey(g.x, g.y), wrap), opts);
  const posOf = o => new RoomPosition(o.x % ROOM, o.y % ROOM, roomName(o.x, o.y));
  const TERRAIN_NAME = ['plain', 'wall', 'swamp'];
  function lookAt(x, y) {
    const out = [], at = o => o.x === x && o.y === y, add = (type, o) => out.push({ type, [type]: wrap(o) });
    for (const c of w.creeps) if (!c.spawning && at(c)) add(SC.LOOK_CREEPS, c);
    for (const o of w.resources) if (at(o)) { add(SC.LOOK_RESOURCES, o); if (o.resourceType === 'energy') add(SC.LOOK_ENERGY, o); }
    for (const o of w.sources) if (at(o)) add(SC.LOOK_SOURCES, o);
    for (const o of w.minerals) if (at(o)) add(SC.LOOK_MINERALS, o);
    for (const o of w.structures.concat(w.spawns, w.controllers)) if (at(o)) add(SC.LOOK_STRUCTURES, o);
    for (const o of w.flags) if (at(o) && o.owner === pid) add(SC.LOOK_FLAGS, o);
    for (const o of w.sites) if (at(o)) add(SC.LOOK_CONSTRUCTION_SITES, o);
    for (const o of w.tombstones) if (at(o)) add(SC.LOOK_TOMBSTONES, o);
    out.push({ type: SC.LOOK_TERRAIN, terrain: TERRAIN_NAME[E.tile(x, y)] });
    return out;
  }
  function makeStore(o) {
    const s = {}; for (const r in o.store) if (o.store[r] > 0) s[r] = o.store[r];
    const P = new Proxy(s, { get: (t, key) => key in t ? t[key] : (RESOURCES.has(key) ? 0 : undefined) });
    const def = (n, f) => Object.defineProperty(s, n, { value: f, enumerable: false });
    def('getCapacity', r => o.kind === 'tombstone' ? null : storeCap(w, o, r));
    def('getUsedCapacity', r => { if (r === undefined) { if (o.kind !== 'tombstone' && storeCap(w, o) == null) return null; return storeSum(o.store); } if (o.kind !== 'tombstone' && storeCap(w, o, r) == null) return 0; return o.store[r] || 0; });
    def('getFreeCapacity', r => o.kind === 'tombstone' ? null : freeFor(w, o, r === undefined && storeCap(w, o) == null ? 'energy' : r));
    return P;
  }

  // ---- 建造 ----
  function createSite(x, y, type, name) {
    if (!SC.CONSTRUCTION_COST[type]) return ERR_INVALID_ARGS;
    const k = roomKey(x, y), rm = w.rooms[k]; if (!rm || x < 0 || y < 0) return ERR_INVALID_ARGS;
    const lx = x % ROOM, ly = y % ROOM;
    if (lx <= 0 || ly <= 0 || lx >= 49 || ly >= 49) return ERR_INVALID_TARGET;
    if (E.tile(x, y) === T_WALL && type !== 'road') return ERR_INVALID_TARGET;
    if (type !== 'road' && type !== 'container' && type !== 'rampart') { // 官方：出口旁一格内不能放其它建筑
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = lx + dx, Y = ly + dy; if ((X === 0 || Y === 0 || X === 49 || Y === 49) && E.tile(x + dx, y + dy) !== T_WALL) return ERR_INVALID_TARGET; }
    }
    if (type === 'extractor' ? !w.minerals.some(m => m.x === x && m.y === y) : (w.minerals.some(m => m.x === x && m.y === y) || w.sources.some(s => s.x === x && s.y === y) || w.controllers.some(s => s.x === x && s.y === y))) return ERR_INVALID_TARGET;
    if (w.sites.some(s => s.x === x && s.y === y)) return ERR_INVALID_TARGET;
    const here = w.structures.filter(s => s.x === x && s.y === y).concat(w.spawns.filter(s => s.x === x && s.y === y));
    if (here.some(s => (s.type || 'spawn') === type || (type !== 'rampart' && OBSTACLES.has(type) && OBSTACLES.has(s.type || 'spawn')) || (type === 'rampart' ? false : (s.type === 'constructedWall')))) return ERR_INVALID_TARGET;
    const ctrl = ctrlOfRoom(w, k);
    if (ctrl && ctrl.owner && ctrl.owner !== pid) return ERR_RCL_NOT_ENOUGH;
    if (ctrl && ctrl.reservation && ctrl.reservation.owner !== pid) return ERR_RCL_NOT_ENOUGH;
    const lvl = ctrl && ctrl.owner === pid ? ctrl.level : 0, lim = SC.CONTROLLER_STRUCTURES[type][lvl] || 0;
    if (countStruct(w, pid, type, k) >= lim) return ERR_RCL_NOT_ENOUGH;
    if (w.sites.filter(s => s.owner === pid).length >= SC.MAX_CONSTRUCTION_SITES) return ERR_FULL;
    let total = SC.CONSTRUCTION_COST[type];
    if (type === 'road') { const t = E.tile(x, y); if (t === T_SWAMP) total *= SC.CONSTRUCTION_COST_ROAD_SWAMP_RATIO; if (t === T_WALL) total *= SC.CONSTRUCTION_COST_ROAD_WALL_RATIO; }
    if (type === 'spawn') { name = name || ('Spawn' + (w.spawns.filter(s => s.owner === pid).length + w.sites.filter(s => s.owner === pid && s.type === 'spawn').length + 1)); if (w.spawns.some(s => s.name === name && s.owner === pid)) return ERR_INVALID_ARGS; }
    w.sites.push({ kind: 'site', id: 'cs' + (w.nextId++), owner: pid, x, y, type, progress: 0, total, name }); E._objVer++; return OK;
  }
  function createFlag(g, name, color = SC.COLOR_WHITE, color2 = color) {
    if (!g) return ERR_INVALID_ARGS; name = name || ('Flag' + (w.flags.filter(f => f.owner === pid).length + 1));
    if (w.flags.some(f => f.owner === pid && f.name === name)) return ERR_NAME_EXISTS;
    if (name.length > 100 || color < 1 || color > 10) return ERR_INVALID_ARGS;
    w.flags.push({ kind: 'flag', id: 'fl' + (w.nextId++), owner: pid, name, x: g.x, y: g.y, color, secondaryColor: color2 }); return name;
  }

  // ---- 包装对象 ----
  function wrap(o) {
    if (!o) return null; let v = cache.get(o); if (v) return v;
    if (o.kind === 'pos') { v = posOf(o); cache.set(o, v); return v; }
    v = { id: o.id, _raw: o, pos: posOf(o), effects: [] };
    Object.defineProperty(v, '_raw', { enumerable: false }); Object.defineProperty(v, 'room', { get: () => room(roomKey(o.x, o.y)), enumerable: false });
    cache.set(o, v); B[o.kind](v, o); return v;
  }
  const owner = o => o.owner ? { username: w.players[o.owner]?.name || o.owner } : undefined;
  const structBase = (v, o, type) => {
    Object.assign(v, { structureType: type, hits: o.hits, hitsMax: o.hitsMax, my: o.owner === pid, owner: owner(o) });
    v.destroy = () => { if (o.owner !== pid && type !== 'road' && type !== 'container' && type !== 'constructedWall') return ERR_NOT_OWNER; const c = ctrlOfRoom(w, roomKey(o.x, o.y)); if (c && c.owner !== pid) return ERR_NOT_OWNER; if (w.creeps.some(c => !c.spawning && c.owner !== pid && sameRoom(c, o))) return ERR_BUSY; E.removeStruct(o); return OK; };
    v.isActive = () => E.isActive(o); v.notifyWhenAttacked = en => typeof en === 'boolean' ? (o.owner === pid ? OK : ERR_NOT_OWNER) : ERR_INVALID_ARGS;
    if (o.store) { v.store = makeStore(o); const ec = storeCap(w, o, 'energy'); v.energy = o.store.energy || 0; v.energyCapacity = ec; }
    if (o.cooldown != null) v.cooldown = o.cooldown;
    if (o.decayAt != null) v.ticksToDecay = o.decayAt - w.time;
  };
  const B = {
    source(v, o) { Object.assign(v, { energy: o.energy, energyCapacity: o.cap, ticksToRegeneration: o.regenAt ? o.regenAt - w.time : undefined }); },
    mineral(v, o) { Object.assign(v, { mineralType: o.type, mineralAmount: o.amount, density: o.density, ticksToRegeneration: o.regenAt ? o.regenAt - w.time : undefined }); },
    resource(v, o) { Object.assign(v, { resourceType: o.resourceType, amount: o.amount }); },
    tombstone(v, o) { Object.assign(v, { deathTime: o.deathTime, ticksToDecay: o.decayAt - w.time, store: makeStore(o), creep: { id: o.id, name: o.creepName, my: o.owner === pid, owner: owner(o), body: o.creepBody.map(t => ({ type: t, hits: 0 })) } }); },
    flag(v, o) { Object.assign(v, { name: o.name, color: o.color, secondaryColor: o.secondaryColor });
      Object.defineProperty(v, 'memory', { get: () => (mem.flags = mem.flags || {}, mem.flags[o.name] = mem.flags[o.name] || {}), set: x => { mem.flags = mem.flags || {}; mem.flags[o.name] = x; } });
      v.remove = () => { w.flags.splice(w.flags.indexOf(o), 1); return OK; }; v.setColor = (c, c2 = c) => { if (c < 1 || c > 10) return ERR_INVALID_ARGS; o.color = c; o.secondaryColor = c2; return OK; };
      v.setPosition = (a, b) => { const g = typeof a === 'number' ? { x: Math.floor(o.x / ROOM) * ROOM + a, y: Math.floor(o.y / ROOM) * ROOM + b } : gpos(a); if (!g) return ERR_INVALID_TARGET; o.x = g.x; o.y = g.y; return OK; }; },
    site(v, o) { Object.assign(v, { my: o.owner === pid, owner: owner(o), progress: o.progress, progressTotal: o.total, structureType: o.type }); v.remove = () => { if (o.owner !== pid) return ERR_NOT_OWNER; w.sites.splice(w.sites.indexOf(o), 1); E._objVer++; return OK; }; },
    controller(v, o) {
      structBase(v, o, 'controller'); delete v.hits; delete v.hitsMax;
      Object.assign(v, { level: o.level, progress: o.level ? o.progress : undefined, progressTotal: o.level ? SC.CONTROLLER_LEVELS[o.level] : undefined, ticksToDowngrade: o.downgradeTime ? o.downgradeTime - w.time : undefined,
        reservation: o.reservation ? { username: w.players[o.reservation.owner]?.name, ticksToEnd: o.reservation.endTime - w.time } : undefined,
        safeMode: o.safeMode > w.time ? o.safeMode - w.time : undefined, safeModeAvailable: o.safeModeAvailable, safeModeCooldown: o.safeModeCooldown > w.time ? o.safeModeCooldown - w.time : undefined,
        upgradeBlocked: o.upgradeBlocked > w.time ? o.upgradeBlocked - w.time : undefined, sign: o.sign || undefined, isPowerEnabled: false });
      v.activateSafeMode = () => { if (o.owner !== pid) return ERR_NOT_OWNER; if (o.safeModeAvailable <= 0) return ERR_NOT_ENOUGH_RESOURCES; if (o.safeModeCooldown > w.time || o.upgradeBlocked > w.time || (o.downgradeTime - w.time) < SC.CONTROLLER_DOWNGRADE[o.level] / 2 - SC.CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD) return ERR_TIRED; if (w.controllers.some(c => c.owner === pid && c.safeMode > w.time)) return ERR_BUSY; o.safeModeAvailable--; o.safeMode = w.time + SC.SAFE_MODE_DURATION; o.safeModeCooldown = w.time + SC.SAFE_MODE_COOLDOWN; return OK; };
      v.unclaim = () => { if (o.owner !== pid) return ERR_NOT_OWNER; const rm = w.rooms[roomKey(o.x, o.y)]; if (rm.owner === pid) rm.owner = null; Object.assign(o, { owner: null, level: 0, progress: 0, downgradeTime: null, safeMode: null, safeModeAvailable: 0 }); return OK; };
    },
    spawn(v, o) {
      structBase(v, o, 'spawn'); o.store = o.store || { energy: 0 }; v.store = makeStore(o); v.energy = o.store.energy || 0; v.energyCapacity = SC.SPAWN_ENERGY_CAPACITY; v.name = o.name;
      Object.defineProperty(v, 'memory', { get: () => (mem.spawns = mem.spawns || {}, mem.spawns[o.name] = mem.spawns[o.name] || {}), set: x => { mem.spawns = mem.spawns || {}; mem.spawns[o.name] = x; } });
      v.spawning = o.spawning ? { name: o.spawning.name, needTime: o.spawning.needTime, remainingTime: o.spawning.spawnTime - w.time, directions: o.spawning.directions, spawn: v,
        cancel: () => { if (o.owner !== pid) return ERR_NOT_OWNER; w.creeps = w.creeps.filter(c => !(c.spawning && c.name === o.spawning.name && c.owner === pid)); o.spawning = null; return OK; },
        setDirections: d => { if (o.owner !== pid) return ERR_NOT_OWNER; if (!Array.isArray(d) || !d.length || d.some(x => !DIRS[x])) return ERR_INVALID_ARGS; o.spawning.directions = d.slice(); return OK; } } : null;
      v.spawnCreep = (body, name, opts = {}) => {
        if (o.owner !== pid) return ERR_NOT_OWNER;
        if (!Array.isArray(body) || !body.length || body.length > SC.MAX_CREEP_SIZE || body.some(b => !SC.BODYPARTS_ALL.includes(b)) || typeof name !== 'string' || !name) return ERR_INVALID_ARGS;
        if (w.creeps.some(c => c.owner === pid && c.name === name)) return ERR_NAME_EXISTS;
        if (o.spawning) return ERR_BUSY;
        if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH;
        const k = roomKey(o.x, o.y), cost = bodyCost(body);
        let srcs = opts.energyStructures ? opts.energyStructures.map(raw).filter(x => x && (x.kind === 'spawn' || x.type === 'extension') && x.owner === pid && roomKey(x.x, x.y) === k) : E.roomEnergy(k, pid).list.slice().sort((a, b) => dist(a, o) - dist(b, o));
        if (srcs.reduce((a, s) => a + (s.store.energy || 0), 0) < cost) return ERR_NOT_ENOUGH_ENERGY;
        if (opts.directions && (!Array.isArray(opts.directions) || opts.directions.some(d => !DIRS[d]))) return ERR_INVALID_ARGS;
        if (opts.dryRun) return OK;
        let left = cost; for (const s of srcs) { const a = Math.min(left, s.store.energy || 0); s.store.energy -= a; left -= a; if (!left) break; }
        const need = body.length * SC.CREEP_SPAWN_TIME;
        o.spawning = { name, needTime: need, spawnTime: w.time + need, directions: opts.directions };
        w.creeps.push({ kind: 'creep', id: 'c' + (w.nextId++), owner: pid, name, body: body.slice(), hits: body.length * 100, x: o.x, y: o.y, px: o.x, py: o.y, store: {}, ttl: 0, fatigue: 0, spawning: true });
        if (opts.memory !== undefined) { mem.creeps = mem.creeps || {}; mem.creeps[name] = opts.memory; }
        return OK;
      };
      v.createCreep = (body, name, memory) => { name = name || ('creep' + w.nextId); const r = v.spawnCreep(body, name, { memory }); return r === OK ? name : r; };
      v.canCreateCreep = (body, name) => v.spawnCreep(body, name || ('x' + w.nextId), { dryRun: true });
      const near = c => { const r = raw(c); if (!r || r.kind !== 'creep') return ERR_INVALID_TARGET; if (o.owner !== pid || r.owner !== pid) return ERR_NOT_OWNER; if (dist(r, o) > 1) return ERR_NOT_IN_RANGE; return r; };
      v.renewCreep = c => { const r = near(c); if (typeof r === 'number') return r; if (o.spawning) return ERR_BUSY; if (r.body.includes('claim')) return ERR_INVALID_TARGET;
        const add = Math.floor(SC.SPAWN_RENEW_RATIO * SC.CREEP_LIFE_TIME / SC.CREEP_SPAWN_TIME / r.body.length), cost = Math.ceil(SC.SPAWN_RENEW_RATIO * bodyCost(r.body) / SC.CREEP_SPAWN_TIME / r.body.length);
        if (r.ttl + add > SC.CREEP_LIFE_TIME) return ERR_FULL; const pool = E.roomEnergy(roomKey(o.x, o.y), pid); if (pool.avail < cost) return ERR_NOT_ENOUGH_ENERGY;
        let left = cost; for (const s of pool.list) { const a = Math.min(left, s.store.energy || 0); s.store.energy -= a; left -= a; } r.ttl += add; return OK; };
      v.recycleCreep = c => { const r = near(c); if (typeof r === 'number') return r; E.killCreep(r, 1); return OK; };
    },
    structure(v, o) {
      structBase(v, o, o.type);
      if (o.type === 'rampart') { v.isPublic = !!o.isPublic; v.setPublic = p => { if (o.owner !== pid) return ERR_NOT_OWNER; o.isPublic = !!p; return OK; }; }
      if (o.type === 'tower') {
        const act = (t, kind) => {
          if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; const r = raw(t);
          if (!r || r.hits == null || !sameRoom(r, o)) return ERR_INVALID_TARGET; if ((o.store.energy || 0) < SC.TOWER_ENERGY_COST) return ERR_NOT_ENOUGH_ENERGY;
          if (o._acted === w.time) return OK; o._acted = w.time;
          const d = dist(r, o), base = kind === 'attack' ? SC.TOWER_POWER_ATTACK : kind === 'heal' ? SC.TOWER_POWER_HEAL : SC.TOWER_POWER_REPAIR;
          let amt = base; if (d > SC.TOWER_OPTIMAL_RANGE) amt -= amt * SC.TOWER_FALLOFF * (Math.min(d, SC.TOWER_FALLOFF_RANGE) - SC.TOWER_OPTIMAL_RANGE) / (SC.TOWER_FALLOFF_RANGE - SC.TOWER_OPTIMAL_RANGE); amt = Math.floor(amt);
          if (kind === 'heal' && r.kind !== 'creep') return ERR_INVALID_TARGET; if (kind === 'repair' && r.kind === 'creep') return ERR_INVALID_TARGET;
          o.store.energy -= SC.TOWER_ENERGY_COST;
          if (kind === 'attack') E.damage(r, amt, pid); else r.hits = Math.min(kind === 'heal' ? r.body.length * 100 : r.hitsMax, r.hits + amt);
          ev.push({ t: kind, fx: o.x, fy: o.y, x: r.x, y: r.y }); return OK;
        };
        v.attack = t => act(t, 'attack'); v.heal = t => act(t, 'heal'); v.repair = t => act(t, 'repair');
      }
      if (o.type === 'link') v.transferEnergy = (t, amount) => {
        if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; const r = raw(t);
        if (!r || r.type !== 'link' || r === o) return ERR_INVALID_TARGET; if (!sameRoom(r, o)) return ERR_NOT_IN_RANGE; if (o.cooldown > 0) return ERR_TIRED;
        amount = amount == null ? o.store.energy || 0 : amount; if (amount < 0) return ERR_INVALID_ARGS; if ((o.store.energy || 0) < amount || !amount) return ERR_NOT_ENOUGH_ENERGY; if (freeFor(w, r, 'energy') < amount) return ERR_FULL;
        o.store.energy -= amount; r.store.energy = (r.store.energy || 0) + amount - Math.ceil(amount * SC.LINK_LOSS_RATIO); o.cooldown = SC.LINK_COOLDOWN * dist(o, r); ev.push({ t: 'transfer', fx: o.x, fy: o.y, x: r.x, y: r.y }); return OK; };
    },
    creep(v, o) {
      const mine = o.owner === pid, cap = activeParts(o, 'carry') * SC.CARRY_CAPACITY;
      Object.assign(v, { name: o.name, my: mine, owner: owner(o), body: o.body.map((t, i) => ({ type: t, hits: partHits(o, i) })), fatigue: o.fatigue, hits: o.hits, hitsMax: o.body.length * 100,
        spawning: !!o.spawning, ticksToLive: o.spawning ? undefined : o.ttl, saying: o.say && w.time - o.sayT <= 1 && (mine || o.sayPublic) ? o.say : undefined, store: makeStore(o), carryCapacity: cap });
      v.carry = v.store;
      Object.defineProperty(v, 'memory', { get: () => { if (!mine) return undefined; mem.creeps = mem.creeps || {}; return (mem.creeps[o.name] = mem.creeps[o.name] || {}); }, set: x => { if (mine) { mem.creeps = mem.creeps || {}; mem.creeps[o.name] = x; } } });
      v.getActiveBodyparts = t => activeParts(o, t);
      const pre = (part) => { if (!mine) return ERR_NOT_OWNER; if (o.spawning) return ERR_BUSY; if (part && !activeParts(o, part)) return ERR_NO_BODYPART; return 0; };
      const used = () => storeSum(o.store);
      v.say = (msg, pub) => { if (!mine) return ERR_NOT_OWNER; if (o.spawning) return ERR_BUSY; o.say = String(msg).slice(0, 10); o.sayT = w.time; o.sayPublic = !!pub; return OK; };
      v.suicide = () => { const e = pre(); if (e) return e; E.killCreep(o, SC.CREEP_CORPSE_RATE); return OK; };
      v.notifyWhenAttacked = en => { const e = pre(); if (e) return e; return typeof en === 'boolean' ? OK : ERR_INVALID_ARGS; };
      v.cancelOrder = n => { if (!mine) return ERR_NOT_OWNER; if (n === 'move' && o._move) { delete o._move; return OK; } if (o._did[n]) { return OK; } return ERR_NOT_FOUND; };
      v.move = d => {
        const e = pre('move'); if (e) return e; if (o.fatigue > 0) return ERR_TIRED;
        if (d && d._raw && d._raw.kind === 'creep') { const r = d._raw; if (dist(r, o) > 1) return ERR_NOT_IN_RANGE; d = dirOf(r.x - o.x, r.y - o.y); }
        if (!DIRS[d]) return ERR_INVALID_ARGS; o._move = { x: o.x + DIRS[d][0], y: o.y + DIRS[d][1] }; return OK;
      };
      v.moveByPath = path => { const e = pre('move'); if (e) return e; if (typeof path === 'string') return ERR_INVALID_ARGS; if (!Array.isArray(path)) return ERR_INVALID_ARGS;
        const lx = o.x % ROOM, ly = o.y % ROOM, rn = roomName(o.x, o.y);
        let i = path.findIndex(p => (p.roomName || rn) === rn && p.x - (p.dx || 0) === lx && p.y - (p.dy || 0) === ly);
        if (i < 0) { i = path.findIndex(p => (p.roomName || rn) === rn && p.x === lx && p.y === ly); if (i < 0 || i + 1 >= path.length) return ERR_NOT_FOUND; i++; }
        const p = path[i]; if (p.direction) return v.move(p.direction); return v.move(dirOf(p.x - lx, p.y - ly)); };
      v.moveTo = (a, b, c) => {
        const e = pre('move'); if (e) return e; let g, opts;
        if (typeof a === 'number') { g = { x: Math.floor(o.x / ROOM) * ROOM + a, y: Math.floor(o.y / ROOM) * ROOM + b }; opts = c || {}; } else { g = gpos(a); opts = b || {}; }
        if (!g) return ERR_INVALID_TARGET; if (o.fatigue > 0) return ERR_TIRED;
        const rng = Math.max(opts.range || 0, E.solid(g.x, g.y) ? 1 : 0); if (dist(o, g) <= rng) return OK;
        const reuse = opts.reusePath == null ? 5 : opts.reusePath;
        if (!o._path || !o._path.length || o._pt.x !== g.x || o._pt.y !== g.y || w.time - o._pT > reuse || dist(o, o._path[0]) !== 1 || E.blocked(o._path[0].x, o._path[0].y, o)) {
          if (opts.noPathFinding) return ERR_NOT_FOUND;
          if (o._failT && w.time - o._failT < 3 && o._pt && o._pt.x === g.x && o._pt.y === g.y) return ERR_NO_PATH; // 寻路失败后短暂缓存，省 CPU
          o._path = E.findPath(o, g, rng, o, Object.assign({ partial: true }, opts)); o._pt = { x: g.x, y: g.y }; o._pT = w.time;
          if (!o._path.length) { o._failT = w.time; return ERR_NO_PATH; } o._failT = 0;
        }
        const nx = o._path.shift(); o._move = { x: nx.x, y: nx.y };
        if (opts.visualizePathStyle) ev.push({ t: 'path', fx: o.x, fy: o.y, x: g.x, y: g.y });
        return OK;
      };
      const tgt = (t, r, kinds) => { const x = raw(t); if (!x || (kinds && !kinds.includes(x.kind === 'structure' ? 'structure' : x.kind))) return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > r) return ERR_NOT_IN_RANGE; return x; };
      v.harvest = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || (x.kind !== 'source' && x.kind !== 'mineral')) return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 1) return ERR_NOT_IN_RANGE;
        const ctrl = ctrlOfRoom(w, roomKey(x.x, x.y)); if (ctrl && ((ctrl.owner && ctrl.owner !== pid) || (ctrl.reservation && ctrl.reservation.owner !== pid))) return ERR_NOT_OWNER;
        if (x.kind === 'source') { if (!x.energy) return ERR_NOT_ENOUGH_RESOURCES; const a = Math.min(x.energy, activeParts(o, 'work') * SC.HARVEST_POWER); x.energy -= a; o.store.energy = (o.store.energy || 0) + a; }
        else { const ex = w.structures.find(s => s.type === 'extractor' && s.x === x.x && s.y === x.y); if (!ex) return ERR_NOT_FOUND; if (ex.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(ex)) return ERR_RCL_NOT_ENOUGH; if (ex.cooldown > 0) return ERR_TIRED; if (!x.amount) return ERR_NOT_ENOUGH_RESOURCES;
          const a = Math.min(x.amount, activeParts(o, 'work') * SC.HARVEST_MINERAL_POWER); x.amount -= a; o.store[x.type] = (o.store[x.type] || 0) + a; ex.cooldown = SC.EXTRACTOR_COOLDOWN; }
        const over = used() - cap; if (over > 0) { const r = x.kind === 'source' ? 'energy' : x.type; o.store[r] -= over; E.dropAt(o.x, o.y, r, over); } // 官方：溢出掉在地上
        ev.push({ t: 'harvest', fx: x.x, fy: x.y, x: o.x, y: o.y }); return OK;
      };
      v.transfer = (t, res, amount) => {
        const e = pre(); if (e) return e; if (!RESOURCES.has(res)) return ERR_INVALID_ARGS; const x = tgt(t, 1); if (typeof x === 'number') return x;
        if (!hasStore(x) || x.kind === 'tombstone' || x === o) return ERR_INVALID_TARGET; if (x.kind === 'creep' && x.spawning) return ERR_INVALID_TARGET;
        const have = o.store[res] || 0; if (amount != null && amount < 0) return ERR_INVALID_ARGS; if (!have || (amount != null && have < amount)) return ERR_NOT_ENOUGH_RESOURCES;
        const free = freeFor(w, x, res); if (free == null) return ERR_INVALID_TARGET; if (free <= 0) return ERR_FULL;
        if (amount != null && amount > free) return ERR_FULL; const a = Math.min(amount ?? have, free);
        o.store[res] -= a; x.store[res] = (x.store[res] || 0) + a; if (x.kind === 'controller') return ERR_INVALID_TARGET;
        ev.push({ t: 'transfer', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK;
      };
      v.withdraw = (t, res, amount) => {
        const e = pre(); if (e) return e; if (!RESOURCES.has(res)) return ERR_INVALID_ARGS; const x = tgt(t, 1); if (typeof x === 'number') return x;
        if (!hasStore(x) || x.kind === 'creep' || x.kind === 'spawn' && false) return ERR_INVALID_TARGET;
        if (x.owner && x.owner !== pid && x.kind !== 'tombstone') return ERR_NOT_OWNER;
        if (x.kind === 'structure' && w.structures.some(s => s.type === 'rampart' && s.x === x.x && s.y === x.y && s.owner !== pid && !s.isPublic)) return ERR_NOT_OWNER;
        const have = x.store[res] || 0; if (amount != null && amount < 0) return ERR_INVALID_ARGS; if (!have || (amount != null && have < amount)) return ERR_NOT_ENOUGH_RESOURCES;
        const free = cap - used(); if (free <= 0 || (amount != null && amount > free)) return ERR_FULL; const a = Math.min(amount ?? have, free);
        x.store[res] -= a; o.store[res] = (o.store[res] || 0) + a; ev.push({ t: 'transfer', fx: x.x, fy: x.y, x: o.x, y: o.y }); return OK;
      };
      v.pickup = t => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['resource']); if (typeof x === 'number') return x; const free = cap - used(); if (free <= 0) return ERR_FULL;
        const a = Math.min(free, x.amount); x.amount -= a; o.store[x.resourceType] = (o.store[x.resourceType] || 0) + a; if (x.amount <= 0) w.resources.splice(w.resources.indexOf(x), 1); return OK; };
      v.drop = (res, amount) => { const e = pre(); if (e) return e; if (!RESOURCES.has(res)) return ERR_INVALID_ARGS; const have = o.store[res] || 0; if (!have || (amount != null && amount > have)) return ERR_NOT_ENOUGH_RESOURCES;
        const a = amount ?? have; o.store[res] -= a; E.dropAt(o.x, o.y, res, a); return OK; };
      v.build = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.kind !== 'site') return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 3) return ERR_NOT_IN_RANGE;
        if (x.owner !== pid) return ERR_NOT_OWNER; if (!(o.store.energy > 0)) return ERR_NOT_ENOUGH_ENERGY;
        if (OBSTACLES.has(x.type) && w.creeps.some(c => !c.spawning && c.x === x.x && c.y === x.y)) return ERR_INVALID_TARGET;
        const a = Math.min(activeParts(o, 'work') * SC.BUILD_POWER, o.store.energy, x.total - x.progress); x.progress += a; o.store.energy -= a;
        ev.push({ t: 'build', fx: o.x, fy: o.y, x: x.x, y: x.y });
        if (x.progress >= x.total) {
          w.sites.splice(w.sites.indexOf(x), 1);
          if (x.type === 'spawn') w.spawns.push(E.makeSpawn(pid, x.name, x.x, x.y, 0)); else w.structures.push(E.makeStruct(x.type, pid, x.x, x.y));
          E._objVer++; E.log(pid, '建造完成', x.type); ev.push({ t: 'built', x: x.x, y: x.y });
        }
        return OK;
      };
      v.repair = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.hits == null || x.kind === 'creep' || x.kind === 'controller') return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 3) return ERR_NOT_IN_RANGE;
        if (!(o.store.energy > 0)) return ERR_NOT_ENOUGH_ENERGY; if (x.hits >= x.hitsMax) return OK;
        const a = Math.min(activeParts(o, 'work') * SC.REPAIR_POWER, Math.floor(o.store.energy / SC.REPAIR_COST), x.hitsMax - x.hits);
        o.store.energy -= Math.max(1, Math.ceil(a * SC.REPAIR_COST)); x.hits += a; ev.push({ t: 'repair', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK;
      };
      v.dismantle = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.kind !== 'structure' && x.kind !== 'spawn') return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 1) return ERR_NOT_IN_RANGE;
        const ctrl = ctrlOfRoom(w, roomKey(x.x, x.y)); if (ctrl && ctrl.safeMode > w.time && ctrl.owner !== pid) return ERR_NO_BODYPART;
        const a = Math.min(activeParts(o, 'work') * SC.DISMANTLE_POWER, x.hits), back = Math.floor(a * SC.DISMANTLE_COST);
        if (back) { o.store.energy = (o.store.energy || 0) + back; const over = used() - cap; if (over > 0) { o.store.energy -= over; E.dropAt(o.x, o.y, 'energy', over); } }
        E.damage(x, a, pid); return OK;
      };
      v.upgradeController = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.kind !== 'controller') return ERR_INVALID_TARGET; if (x.owner !== pid || !x.level) return ERR_NOT_OWNER;
        if (!sameRoom(x, o) || dist(x, o) > 3) return ERR_NOT_IN_RANGE; if (!(o.store.energy > 0)) return ERR_NOT_ENOUGH_RESOURCES; if (x.upgradeBlocked > w.time) return ERR_INVALID_TARGET;
        x._upTick = x._upTick === w.time ? w.time : (x._upCnt = 0, w.time);
        let eff = Math.min(activeParts(o, 'work') * SC.UPGRADE_CONTROLLER_POWER, o.store.energy);
        if (x.level === 8) { eff = Math.min(eff, SC.CONTROLLER_MAX_UPGRADE_PER_TICK - x._upCnt); if (eff <= 0) return OK; }
        x._upCnt += eff; o.store.energy -= eff; x._upgraded = 1; w.players[pid].gcl = (w.players[pid].gcl || 0) + eff;
        if (x.level < 8) {
          const next = SC.CONTROLLER_LEVELS[x.level];
          if (x.progress + eff >= next && x.downgradeTime + SC.CONTROLLER_DOWNGRADE_RESTORE >= w.time + SC.CONTROLLER_DOWNGRADE[x.level]) {
            x.progress = x.progress + eff - next; x.level++; x.downgradeTime = w.time + SC.CONTROLLER_DOWNGRADE[x.level] / 2; if (x.level === 8) x.progress = 0; x.safeModeAvailable = (x.safeModeAvailable || 0) + 1; E.log(pid, 'Controller 升至 RCL', x.level);
          } else x.progress += eff;
        }
        ev.push({ t: 'upgrade', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK;
      };
      v.claimController = t => {
        const e = pre('claim'); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x;
        if (x.owner || (x.reservation && x.reservation.owner !== pid)) return ERR_INVALID_TARGET;
        if (w.controllers.filter(c => c.owner === pid).length >= E.gclLevel(pid)) return ERR_GCL_NOT_ENOUGH;
        Object.assign(x, { owner: pid, level: 1, progress: 0, downgradeTime: null, reservation: null, safeModeAvailable: 0 }); const rm = w.rooms[roomKey(x.x, x.y)]; if (!rm.owner) rm.owner = pid; return OK;
      };
      v.reserveController = t => {
        const e = pre('claim'); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x;
        if (x.owner || (x.reservation && x.reservation.owner !== pid)) return ERR_INVALID_TARGET;
        const end = x.reservation ? x.reservation.endTime : w.time + 1, add = activeParts(o, 'claim') * SC.CONTROLLER_RESERVE;
        if (end - w.time + add > SC.CONTROLLER_RESERVE_MAX) return ERR_FULL; x.reservation = { owner: pid, endTime: end + add }; return OK;
      };
      v.attackController = t => {
        const e = pre('claim'); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x;
        if (!x.owner && !x.reservation) return ERR_INVALID_TARGET; if (x.owner === pid || (x.reservation && x.reservation.owner === pid)) return ERR_INVALID_TARGET; if (x.upgradeBlocked > w.time) return ERR_TIRED;
        const n = activeParts(o, 'claim');
        if (x.reservation) { x.reservation.endTime -= n * SC.CONTROLLER_RESERVE; } else { x.downgradeTime -= n * SC.CONTROLLER_CLAIM_DOWNGRADE; x.upgradeBlocked = w.time + SC.CONTROLLER_ATTACK_BLOCKED_UPGRADE; }
        return OK;
      };
      v.signController = (t, text) => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x; x.sign = text ? { username: w.players[pid].name, text: String(text).slice(0, 100), time: w.time, datetime: Date.now() } : null; return OK; };
      v.generateSafeMode = t => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x; if ((o.store.G || 0) < SC.SAFE_MODE_COST) return ERR_NOT_ENOUGH_RESOURCES; o.store.G -= SC.SAFE_MODE_COST; x.safeModeAvailable++; return OK; };
      const hostileOk = x => x.kind === 'creep' ? x.owner !== pid || true : true;
      v.attack = t => { const e = pre('attack'); if (e) return e; const x = tgt(t, 1, ['creep', 'structure', 'spawn']); if (typeof x === 'number') return x; if (!hostileOk(x) || x.hits == null) return ERR_INVALID_TARGET;
        E.damage(x, activeParts(o, 'attack') * SC.ATTACK_POWER, pid); if (x.kind === 'creep' && activeParts(x, 'attack')) E.damage(o, activeParts(x, 'attack') * SC.ATTACK_POWER, x.owner); ev.push({ t: 'attack', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.rangedAttack = t => { const e = pre('ranged_attack'); if (e) return e; const x = tgt(t, 3, ['creep', 'structure', 'spawn']); if (typeof x === 'number') return x; if (x.hits == null) return ERR_INVALID_TARGET;
        E.damage(x, activeParts(o, 'ranged_attack') * SC.RANGED_ATTACK_POWER, pid); ev.push({ t: 'attack', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.rangedMassAttack = () => { const e = pre('ranged_attack'); if (e) return e; const n = activeParts(o, 'ranged_attack') * SC.RANGED_ATTACK_POWER;
        for (const x of w.creeps.filter(c => !c.spawning && c.owner !== pid && sameRoom(c, o) && dist(c, o) <= 3).concat(w.structures.concat(w.spawns).filter(s => s.owner && s.owner !== pid && sameRoom(s, o) && dist(s, o) <= 3))) E.damage(x, Math.round(n * ({ 0: 1, 1: 1, 2: 0.4, 3: 0.1 })[dist(x, o)]), pid);
        return OK; };
      v.heal = t => { const e = pre('heal'); if (e) return e; const x = tgt(t, 1, ['creep']); if (typeof x === 'number') return x; x.hits = Math.min(x.body.length * 100, x.hits + activeParts(o, 'heal') * SC.HEAL_POWER); ev.push({ t: 'heal', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.rangedHeal = t => { const e = pre('heal'); if (e) return e; const x = tgt(t, 3, ['creep']); if (typeof x === 'number') return x; x.hits = Math.min(x.body.length * 100, x.hits + activeParts(o, 'heal') * SC.RANGED_HEAL_POWER); ev.push({ t: 'heal', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.pull = t => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['creep']); if (typeof x === 'number') return x; if (x === o) return ERR_INVALID_TARGET; o._pulling = x; return OK; };
    },
  };

  // ---- Room ----
  const rooms = new Map();
  class RoomTerrain { constructor(name) { this.roomName = name; const p = parseRoomName(name); this._k = p && p[0] + ',' + p[1]; if (p) ensureRoom(w, p[0], p[1]); if (!w.rooms[this._k]) throw new Error('Could not access room ' + name); }
    get(x, y) { const t = w.rooms[this._k].tiles[y * ROOM + x]; return t === T_WALL ? SC.TERRAIN_MASK_WALL : t === T_SWAMP ? SC.TERRAIN_MASK_SWAMP : 0; }
    getRawBuffer() { const b = new Uint8Array(2500); for (let i = 0; i < 2500; i++) { const t = w.rooms[this._k].tiles[i]; b[i] = t === T_WALL ? 1 : t === T_SWAMP ? 2 : 0; } return b; } }
  const noopVisual = new Proxy({}, { get: (t, k) => k === 'roomName' ? undefined : (() => noopVisual) });
  function room(k) {
    if (rooms.has(k)) return rooms.get(k); const rm = w.rooms[k]; if (!rm) return undefined;
    const [rx, ry] = k.split(',').map(Number), ox = rx * ROOM, oy = ry * ROOM, ctrlRaw = ctrlOfRoom(w, k), en = E.roomEnergy(k, pid);
    const R = { name: rm.name, energyAvailable: en.avail, energyCapacityAvailable: en.cap, visual: noopVisual };
    rooms.set(k, R);
    Object.defineProperty(R, 'controller', { get: () => ctrlRaw ? wrap(ctrlRaw) : undefined });
    Object.defineProperty(R, 'storage', { get: () => wrap(w.structures.find(s => s.type === 'storage' && roomKey(s.x, s.y) === k && s.owner === pid)) || undefined });
    Object.defineProperty(R, 'terminal', { get: () => wrap(w.structures.find(s => s.type === 'terminal' && roomKey(s.x, s.y) === k && s.owner === pid)) || undefined });
    Object.defineProperty(R, 'memory', { get: () => (mem.rooms = mem.rooms || {}, mem.rooms[rm.name] = mem.rooms[rm.name] || {}), set: x => { mem.rooms = mem.rooms || {}; mem.rooms[rm.name] = x; } });
    const G = (a, b) => typeof a === 'number' ? { x: ox + a, y: oy + b } : gpos(a);
    R.find = (type, opts) => applyOpts(findList(E, pid, type, k, wrap), opts);
    R.lookAt = (a, b) => { const g = G(a, b); return g ? lookAt(g.x, g.y) : []; };
    R.lookForAt = (type, a, b) => { const g = G(a, b); return g ? lookAt(g.x, g.y).filter(o => o.type === type).map(o => o[type]) : []; };
    const area = (filterType, top, left, bottom, right, asArray) => {
      const res = asArray ? [] : {};
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const items = lookAt(ox + x, oy + y).filter(o => !filterType || o.type === filterType);
        if (asArray) for (const it of items) res.push(Object.assign({ x, y }, filterType ? { type: it.type, [filterType]: it[filterType] } : it));
        else if (items.length) { res[y] = res[y] || {}; res[y][x] = filterType ? items.map(o => o[filterType]) : items; }
      }
      return res;
    };
    R.lookAtArea = (t, l, b, r, asArray) => area(null, t, l, b, r, asArray);
    R.lookForAtArea = (type, t, l, b, r, asArray) => area(type, t, l, b, r, asArray);
    R.createConstructionSite = (a, b, c, d) => { if (typeof a === 'number') return createSite(ox + a, oy + b, c, d); const g = gpos(a); return g ? createSite(g.x, g.y, b, c) : ERR_INVALID_ARGS; };
    R.createFlag = (a, b, c, d, e) => typeof a === 'number' ? createFlag({ x: ox + a, y: oy + b }, c, d, e) : createFlag(gpos(a), b, c, d);
    R.getTerrain = () => new RoomTerrain(rm.name);
    R.getPositionAt = (x, y) => (x < 0 || y < 0 || x > 49 || y > 49) ? null : new RoomPosition(x, y, rm.name);
    R.findPath = (from, to, opts) => { const f = gpos(from); return f ? new RoomPosition(f.x % ROOM, f.y % ROOM, roomName(f.x, f.y)).findPathTo(to, opts) : []; };
    R.findExitTo = other => { const n = typeof other === 'string' ? other : other.name, p = parseRoomName(n); if (!p) return ERR_INVALID_ARGS; const dx = p[0] - rx, dy = p[1] - ry;
      if (Math.abs(dx) + Math.abs(dy) !== 1) { const route = Game.map.findRoute(rm.name, n); return Array.isArray(route) && route.length ? route[0].exit : ERR_NO_PATH; } return dx > 0 ? SC.FIND_EXIT_RIGHT : dx < 0 ? SC.FIND_EXIT_LEFT : dy > 0 ? SC.FIND_EXIT_BOTTOM : SC.FIND_EXIT_TOP; };
    R.getEventLog = raw => raw ? '[]' : [];
    R.toString = () => `[room ${rm.name}]`;
    return R;
  }

  // ---- Game ----
  const creeps = {}, spawns = {}, structures = {}, sites = {}, flags = {}, vis = new Set();
  for (const c of w.creeps) if (c.owner === pid) { creeps[c.name] = wrap(c); vis.add(roomKey(c.x, c.y)); }
  for (const s of w.spawns) if (s.owner === pid) { spawns[s.name] = wrap(s); structures[s.id] = spawns[s.name]; vis.add(roomKey(s.x, s.y)); }
  for (const s of w.structures) if (s.owner === pid) { structures[s.id] = wrap(s); vis.add(roomKey(s.x, s.y)); }
  for (const c of w.controllers) if (c.owner === pid || (c.reservation && c.reservation.owner === pid)) { if (c.owner === pid) structures[c.id] = wrap(c); vis.add(roomKey(c.x, c.y)); }
  for (const s of w.sites) if (s.owner === pid) sites[s.id] = wrap(s);
  for (const f of w.flags) if (f.owner === pid) { flags[f.name] = wrap(f); vis.add(roomKey(f.x, f.y)); }
  const gameRooms = {}; for (const k of vis) { const r = room(k); if (r) gameRooms[r.name] = r; }
  const gclLv = E.gclLevel(pid), gclP = w.players[pid].gcl || 0, t0 = Date.now();
  const Game = {
    time: w.time, creeps, spawns, structures, constructionSites: sites, flags, rooms: gameRooms, powerCreeps: {}, resources: {},
    shard: { name: 'shard0', type: 'normal', ptr: false },
    gcl: { level: gclLv, progress: gclP - (gclLv > 1 ? Math.pow(gclLv - 1, SC.GCL_POW) * SC.GCL_MULTIPLY : 0), progressTotal: Math.pow(gclLv, SC.GCL_POW) * SC.GCL_MULTIPLY - (gclLv > 1 ? Math.pow(gclLv - 1, SC.GCL_POW) * SC.GCL_MULTIPLY : 0) },
    gpl: { level: 0, progress: 0, progressTotal: SC.POWER_LEVEL_MULTIPLY },
    cpu: { limit: 20, tickLimit: 500, bucket: 10000, shardLimits: { shard0: 20 }, unlocked: true, unlockedTime: undefined, getUsed: () => Date.now() - t0, getHeapStatistics: () => ({}), halt: () => { throw new Error('Game.cpu.halt'); }, setShardLimits: () => ERR_BUSY, unlock: () => ERR_FULL, generatePixel: () => ERR_NOT_ENOUGH_RESOURCES },
    market: { credits: 0, incomingTransactions: [], outgoingTransactions: [], orders: {}, calcTransactionCost: (amount, a, b) => Math.ceil(amount * (1 - Math.exp(-Game.map.getRoomLinearDistance(a, b, true) / 30))), getAllOrders: () => [], getHistory: () => [], getOrderById: () => null, cancelOrder: () => ERR_INVALID_ARGS, changeOrderPrice: () => ERR_INVALID_ARGS, createOrder: () => ERR_NOT_ENOUGH_RESOURCES, deal: () => ERR_NOT_ENOUGH_RESOURCES, extendOrder: () => ERR_INVALID_ARGS },
    getObjectById: id => { for (const L of [w.creeps, w.spawns, w.structures, w.controllers, w.sources, w.minerals, w.sites, w.resources, w.tombstones, w.flags]) { const o = L.find(o => o.id === id); if (o) return wrap(o); } return null; },
    notify: (msg) => { E.log(pid, '[notify]', msg); return OK; },
    map: {
      describeExits: n => { const p = parseRoomName(n); if (p) ensureRoom(w, p[0], p[1]); if (!p || !w.rooms[p[0] + ',' + p[1]]) return null; const out = {}; const t = w.rooms[p[0] + ',' + p[1]].tiles, open = (f) => { for (let i = 0; i < 50; i++) if (f(i) !== T_WALL) return true; return false; };
        if (open(i => t[i])) out[SC.TOP] = roomNameXY(p[0], p[1] - 1); if (open(i => t[i * 50 + 49])) out[SC.RIGHT] = roomNameXY(p[0] + 1, p[1]); if (open(i => t[49 * 50 + i])) out[SC.BOTTOM] = roomNameXY(p[0], p[1] + 1); if (open(i => t[i * 50])) out[SC.LEFT] = roomNameXY(p[0] - 1, p[1]); return out; },
      findRoute: (from, to, opts = {}) => { from = typeof from === 'string' ? from : from.name; to = typeof to === 'string' ? to : to.name; if (from === to) return [];
        const prev = { [from]: null }, q = [from]; while (q.length) { const n = q.shift(); if (n === to) break; const ex = Game.map.describeExits(n) || {}; for (const d in ex) { const m = ex[d]; if (m in prev) continue; if (opts.routeCallback && opts.routeCallback(m, n) === Infinity) continue; prev[m] = { n, exit: +d }; q.push(m); } }
        if (!(to in prev)) return ERR_NO_PATH; const out = []; for (let n = to; prev[n]; n = prev[n].n) out.unshift({ exit: prev[n].exit, room: n }); return out; },
      findExit: (from, to, opts) => { const r = Game.map.findRoute(from, to, opts); return Array.isArray(r) ? (r.length ? r[0].exit : ERR_INVALID_ARGS) : r; },
      getRoomLinearDistance: (a, b, cont) => { const p = parseRoomName(a), q = parseRoomName(b); return p && q ? Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) : Infinity; },
      getRoomTerrain: n => new RoomTerrain(n), getTerrainAt: (a, b, n) => { const pos = typeof a === 'number' ? { x: a, y: b, roomName: n } : a; return ['plain', 'wall', 'swamp'][[0, 1, 2][[0, 1, 2].indexOf(new RoomTerrain(pos.roomName).get(pos.x, pos.y))] ?? 0] || 'plain'; },
      getWorldSize: () => w.S, getRoomStatus: n => { const p = parseRoomName(n); return p && p[0] >= 0 && p[1] >= 0 && p[0] < w.S && p[1] < w.S ? { status: 'normal', timestamp: null } : undefined; },
      isRoomAvailable: n => !!Game.map.getRoomStatus(n), visual: noopVisual,
    },
    createConstructionSite(x, y, type, name) { // 兼容 v1.2 积木（非官方）：坐标按第一个 Spawn 所在房间解释
      const sp = w.spawns.find(s => s.owner === pid); if (!sp) return ERR_INVALID_TARGET; return createSite(Math.floor(sp.x / ROOM) * ROOM + x, Math.floor(sp.y / ROOM) * ROOM + y, type, name);
    },
  };
  Game.map.getTerrainAt = (a, b, n) => { const pos = typeof a === 'number' ? { x: a, y: b, roomName: n } : a; const v = new RoomTerrain(pos.roomName).get(pos.x, pos.y); return v & SC.TERRAIN_MASK_WALL ? 'wall' : v & SC.TERRAIN_MASK_SWAMP ? 'swamp' : 'plain'; };
  const RawMemory = { segments: {}, foreignSegment: undefined, get: () => JSON.stringify(mem), set: s => { const m = JSON.parse(s); for (const k in mem) delete mem[k]; Object.assign(mem, m); }, setActiveSegments: () => undefined, setActiveForeignSegment: () => undefined, setDefaultPublicSegment: () => undefined, setPublicSegments: () => undefined, interShardSegment: '' };
  const Room = function () { throw new Error('Room 不能直接构造'); }; Room.Terrain = RoomTerrain; Room.serializePath = p => JSON.stringify(p); Room.deserializePath = s => JSON.parse(s);
  const PathFinder = { search(origin, goal, opts = {}) { const o = gpos(origin), goals = (Array.isArray(goal) ? goal : [goal]).map(g => ({ g: gpos(g.pos || g) || gpos(g), r: g.range || 0 }));
      let best = null; for (const { g, r } of goals) { if (!g) continue; const p = E.findPath(o, g, r, undefined, Object.assign({ ignoreCreeps: true }, opts)); if (p.length && (!best || p.length < best.length)) best = p; }
      return { path: (best || []).map(p => new RoomPosition(p.x % ROOM, p.y % ROOM, roomName(p.x, p.y))), ops: 0, cost: best ? best.length : 0, incomplete: !best }; },
    CostMatrix: class CostMatrix { constructor() { this._bits = new Uint8Array(2500); } set(x, y, v) { this._bits[y * 50 + x] = v; } get(x, y) { return this._bits[y * 50 + x]; } clone() { const c = new PathFinder.CostMatrix(); c._bits.set(this._bits); return c; } serialize() { return Array.from(this._bits); } static deserialize(d) { const c = new PathFinder.CostMatrix(); c._bits.set(d); return c; } },
    use: () => undefined };
  return { Game, Memory: mem, RawMemory, RoomPosition, Room, PathFinder, log: (...a) => E.log(pid, ...a) };
}

// 用户代码沙箱：官方全局（Game/Memory/RoomPosition/...）+ 全部官方常量
const SC_NAMES = Object.keys(SC).filter(k => /^[A-Z_][A-Z0-9_]*$/.test(k));
function compileUser(code) {
  const hidden = ['window', 'document', 'localStorage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Capacitor', 'globalThis', 'self', 'require', 'process', 'setTimeout', 'setInterval', 'SC'];
  const f = new Function('Game', 'Memory', 'RawMemory', 'RoomPosition', 'Room', 'PathFinder', 'console', '__loopGuard', ...hidden, ...SC_NAMES, '"use strict";\n' + code);
  return (api) => { let n = 0; const guard = () => { if (++n > 100000) throw new Error('循环次数过多（可能死循环）'); };
    f(api.Game, api.Memory, api.RawMemory, api.RoomPosition, api.Room, api.PathFinder, { log: api.log }, guard, ...hidden.map(() => undefined), ...SC_NAMES.map(k => SC[k])); };
}
if (typeof module !== 'undefined') module.exports = { Engine, newWorld, compileUser, countStruct, rclOf };
