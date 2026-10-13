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
  w.S = SECTOR; ensureAll(w); return w;
}
function ensureAll(w) { for (let ry = 0; ry < w.S; ry++) for (let rx = 0; rx < w.S; rx++) ensureRoom(w, rx, ry); }
// 官方视野规则：有自己的 creep 或自己拥有的建筑（含 Controller）的房间可见；Observer 在上一 tick 观察的房间可见（预定/旗帜不提供视野）
function visibleRooms(w, pid) {
  const v = new Set(), add = o => v.add(roomKey(o.x, o.y));
  for (const c of w.creeps) if (c.owner === pid) add(c);
  for (const s of w.spawns) if (s.owner === pid) add(s);
  for (const s of w.structures) if (s.owner === pid) add(s);
  for (const c of w.controllers) if (c.owner === pid) add(c);
  const ob = w.observe && w.observe[pid]; if (ob) for (const o of ob) if (o.t === w.time - 1) v.add(o.k);
  return v;
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
  for (const l of g.lairs || []) w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'keeperLair', owner: KEEPER, x: ox + l.x, y: oy + l.y, hits: 1, hitsMax: 1, tx: ox + l.tx, ty: oy + l.ty, spawnAt: null });
  applyBorders(w, rx, ry); w.roomsVer++; return rm;
}
const NOVICE_TICKS = 100000, RESPAWN_TICKS = 50000; // 官方无固定常量：novice/respawn 区由后台按天设置时长，这里取固定 tick 数
const KEEPER = '__keeper'; // 官方 Source Keeper（NPC 玩家）
const KEEPER_BODY = [].concat(Array(17).fill('tough'), Array(13).fill('move'), ...Array(10).fill(['attack', 'ranged_attack'])); // 官方 keeper-lairs/tick.js 顺序：ATTACK/RANGED_ATTACK 交替
function defaultBadge(pid) { const h = hash32(String(pid).split('').reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7), 1, 2); return { type: 1 + h % 24, color1: (h >>> 5) % 80, color2: (h >>> 12) % 80, color3: (h >>> 19) % 80, param: 0, flip: false }; }
function ensureNear(w, rx, ry, r = 1) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) ensureRoom(w, rx + dx, ry + dy); }
function ensureSize(w, S) {
  if (S <= w.S) return false; w.S = S;
  for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number); applyBorders(w, rx, ry); }
  ensureAll(w); w.roomsVer++; return true;
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
  if (o.kind === 'creep') return boostPower(o, 'carry', 'capacity') * SC.CARRY_CAPACITY;
  if (o.kind === 'spawn') return res === undefined || res === 'energy' ? SC.SPAWN_ENERGY_CAPACITY : null;
  const t = o.type, E = (n) => (res === undefined || res === 'energy') ? n : null;
  if (t === 'extension') return E(SC.EXTENSION_ENERGY_CAPACITY[rclOf(w, o.x, o.y)]);
  if (t === 'tower') return E(SC.TOWER_CAPACITY);
  if (t === 'link') return E(SC.LINK_CAPACITY);
  if (t === 'container') return SC.CONTAINER_CAPACITY;
  if (t === 'storage') return SC.STORAGE_CAPACITY + (pwrFx(o, SC.PWR_OPERATE_STORAGE, w.time) || 0); // PWR_OPERATE_STORAGE
  if (t === 'terminal') return SC.TERMINAL_CAPACITY;
  if (t === 'factory') return SC.FACTORY_CAPACITY;
  if (t === 'lab') return res === 'energy' ? SC.LAB_ENERGY_CAPACITY : res === undefined ? null : SC.LAB_MINERAL_CAPACITY;
  if (t === 'powerSpawn') return res === 'energy' ? SC.POWER_SPAWN_ENERGY_CAPACITY : res === 'power' ? SC.POWER_SPAWN_POWER_CAPACITY : null;
  if (t === 'nuker') return res === 'energy' ? SC.NUKER_ENERGY_CAPACITY : res === 'G' ? SC.NUKER_GHODIUM_CAPACITY : null;
  return null;
}
const hasStore = o => o.kind === 'creep' || o.kind === 'spawn' || o.kind === 'tombstone' || o.kind === 'ruin' || (o.kind === 'structure' && o.store);
function freeFor(w, o, res) { const cap = storeCap(w, o, res); if (cap == null) return null; const general = storeCap(w, o, undefined) != null; return cap - (general ? storeSum(o.store) : (o.store[res] || 0)); }
function partHits(c, i) { return Math.max(0, Math.min(100, c.hits - (c.body.length - 1 - i) * 100)); }
// 官方 Power 效果：返回目标上生效中的 POWER_INFO[power].effect[level-1]，无则 null（cmp: '>' 用 endTime > t，'>=' 用 endTime >= t，与官方各处理器一致）
function pwrFx(o, power, t, ge) { const e = o && o.effects && o.effects.find(f => f.power === power && (ge ? f.endTime >= t : f.endTime > t)); const ef = SC.POWER_INFO[power].effect; return e ? (ef ? ef[e.level - 1] : true) : null; }
function boostPower(c, type, action) { let n = 0; for (let i = 0; i < c.body.length; i++) if (c.body[i] === type && partHits(c, i) > 0) { const b = c.boosts && c.boosts[i], m = b && SC.BOOSTS[type] && SC.BOOSTS[type][b] && SC.BOOSTS[type][b][action]; n += m || 1; } return n; } // 官方 BOOSTS 效果
function boostExtra(c, type, action, baseUnits) { // 官方：先按未强化单位数选取最强的 baseUnits 个强化加成
  const extras = [];
  for (let i = 0; i < c.body.length; i++) if (c.body[i] === type && partHits(c, i) > 0) {
    const b = c.boosts && c.boosts[i], m = b && SC.BOOSTS[type] && SC.BOOSTS[type][b] && SC.BOOSTS[type][b][action];
    extras.push(m ? (m - 1) * (type === 'work' && action === 'upgradeController' ? 1 : (action === 'build' || action === 'repair' ? SC[action === 'build' ? 'BUILD_POWER' : 'REPAIR_POWER'] : 1)) : 0);
  }
  extras.sort((a, b) => b - a);
  return extras.slice(0, baseUnits).reduce((a, b) => a + b, 0);
}
function totalReactionTime(r) { const t = SC.REACTION_TIME[r]; if (!t) return 0; for (const a in SC.REACTIONS) for (const b in SC.REACTIONS[a]) if (SC.REACTIONS[a][b] === r) return t + totalReactionTime(a) + totalReactionTime(b); return t; } // 官方 utils.calcTotalReactionsTime
function activeParts(c, type) { let n = 0; for (let i = 0; i < c.body.length; i++) if (c.body[i] === type && partHits(c, i) > 0) n++; return n; }

class Engine {
  constructor(world) {
    if (!world || world.gen !== WORLD_GEN) world = newWorld(world && world.seed); // 旧格式存档无法兼容 → 新世界
    this._objVer = 0; this.w = world; this.fns = {}; this.onLog = null; this.events = [];
    ensureAll(world);
    for (const pid in world.players) { if (!world.players[pid].badge) world.players[pid].badge = defaultBadge(pid); this.setCode(pid, world.players[pid].code || ''); }
  }
  get W() { return this.w.S * ROOM; }
  log(pid, ...a) { const s = `[${this.w.time}] ` + a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' '); this.onLog && this.onLog(pid, s); }
  tile(x, y) { if (x < 0 || y < 0) return T_WALL; const rm = this.w.rooms[roomKey(x, y)] || ensureRoom(this.w, Math.floor(x / ROOM), Math.floor(y / ROOM)); if (!rm) return T_WALL; return rm.tiles[(y % ROOM) * ROOM + (x % ROOM)]; }
  _grid() { // 0 可走 1 障碍；附加：道路
    const w = this.w, WW = this.W;
    if (this._g && this._gVer === w.roomsVer && this._gObj === this._objVer && this._gW === WW) return this._g;
    const g = new Uint8Array(WW * WW).fill(1), road = new Uint8Array(WW * WW); // 未生成的房间当墙
    for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number), t = w.rooms[k].tiles; for (let ly = 0; ly < ROOM; ly++) for (let lx = 0; lx < ROOM; lx++) { const v = t[ly * ROOM + lx], i = (ry * ROOM + ly) * WW + rx * ROOM + lx; g[i] = v === T_WALL ? 1 : v === T_SWAMP ? 4 : 0; } }
    for (const L of [w.sources, w.controllers, w.spawns, w.minerals, w.deposits || []]) for (const o of L) g[o.y * WW + o.x] = 1;
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
    if (st === 'out') return '超出世界'; if (st === 'highway') return '高速公路房间不能出生'; if (st === 'center') return '扇区中心房间不能出生'; if (st === 'keeper') return 'Source Keeper 房间不能出生';
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
    w.rooms[k].owner = pid; Object.assign(ctrl, { owner: pid, level: 1, progress: 0, downgradeTime: w.time + SC.CONTROLLER_DOWNGRADE[1] + 1, safeModeAvailable: 1, safeMode: w.time + SC.SAFE_MODE_DURATION, safeModeCooldown: null, reservation: null });
    for (const s of w.sources) if (roomKey(s.x, s.y) === k) { s.cap = s.energy = SC.SOURCE_ENERGY_CAPACITY; s.regenAt = null; }
    w.spawns.push(this.makeSpawn(pid, 'Spawn1', x, y, SC.SPAWN_ENERGY_START)); w.players[pid].needsSpawn = false;
    { // 首个房间周围 3×3 的普通无主房间划为新手区（重生玩家为重生区）
      const P = w.players[pid], status = P.respawned ? 'respawn' : 'novice', id = 'z' + (w.nextId++), until = w.time + (status === 'novice' ? NOVICE_TICKS : RESPAWN_TICKS); w.zones = w.zones || {};
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = rx + dx, Y = ry + dy, rk = X + ',' + Y; if (X < 0 || Y < 0 || X >= w.S || Y >= w.S || roomType(X, Y) !== 'normal' || this.zoneOf(X, Y) || (rk !== k && w.rooms[rk] && w.rooms[rk].owner)) continue; w.zones[rk] = { id, status, until }; }
      this.zoneWalls(id);
    }
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
    w.memory[pid] = { creeps: {}, spawns: {}, rooms: {}, flags: {} }; Object.assign(w.players[pid], { needsSpawn: true, gcl: 0, respawned: true });
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
  classesFor(pid) { const C = (this._cls = this._cls || {}); return C[pid] || (C[pid] = makeClasses()); }
  setCode(pid, code) { if (this._cls) delete this._cls[pid];
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
    const hw = opts.heuristicWeight == null ? 1.0001 : opts.heuristicWeight, maxCost = opts.maxCost == null ? Infinity : opts.maxCost;
    const H = k => { const x = k % WW, y = (k / WW) | 0;
      if (opts.flee) { let m = 0; for (const t of (opts.fleeGoals || tos.map(t => ({ g: t, r: range })))) { const g = t.g || t, r = t.r != null ? t.r : range; const d = Math.max(Math.abs(x - g.x), Math.abs(y - g.y)); if (d < r) m = Math.max(m, r - d); } return m; } // 官方 pf.cc flee 启发：max(range - dist)，全部 dist ≥ range 即到达
      let m = Infinity; for (const t of tos) { const d = Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) - range; if (d < m) m = d; } return Math.max(0, m); };
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    if (tos.length === 1 && range <= 1 && dist(from, tos[0]) > range) { // 快速判定：目标周围可站的格子全被占/是墙 → 不必搜索
      const t = tos[0]; let free = false;
      for (let dy = -range; dy <= range && !free; dy++) for (let dx = -range; dx <= range && !free; dx++) { const X = t.x + dx, Y = t.y + dy; if (X < 0 || Y < 0 || X >= WW || Y >= WW || (g[Y * WW + X] & 1)) continue; const c = occ.get(Y * WW + X); if (!c || c === me || opts.ignoreCreeps) free = true; }
      if (!free) return [];
    }
    let hostileRamp = null; for (const s of this.w.structures) if (s.type === 'rampart' && s.owner !== pid && !s.isPublic) (hostileRamp = hostileRamp || new Set()).add(s.y * WW + s.x);
    const start = from.y * WW + from.x; stamp[start] = st; gs[start] = 0; prev[start] = start; push(start, H(start));
    if (opts.costCallback && !opts._cm) opts = Object.assign({}, opts, { _cm: (rx, ry) => { const b = new Uint8Array(2500), m = { _bits: b, get: (x, y) => b[y * 50 + x], set: (x, y, v) => { b[y * 50 + x] = v; } }; const r = opts.costCallback(roomNameXY(rx, ry), m); return r && r.get ? r : m; } }); // 官方 findPath/moveTo costCallback
    let end = -1, ops = 0, maxOps = opts.maxOps || 4000, bestK = start, bestH = H(start); const cms = new Map();
    while (heap.length && ops++ < maxOps) {
      const [, k] = pop(), x = k % WW, y = (k / WW) | 0, hk = H(k);
      if (hk === 0) { end = k; break; }
      if (gs[k] + hk > maxCost) break; // 官方：g + h > maxCost 终止
      if (hk < bestH) { bestH = hk; bestK = k; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= WW || ny >= WW) continue; const nk = ny * WW + nx;
        { const bx = x % ROOM, by = y % ROOM; // 官方 pf.cc astar：出口格（门户节点）上不能沿边线走，只能直穿到邻房或退回房内
          if (bx === 0 || bx === ROOM - 1) { if (nx === x || ((nx % ROOM) === (bx ? 0 : ROOM - 1) && (nx / ROOM | 0) !== (x / ROOM | 0) && ny !== y)) continue; }
          else if (by === 0 || by === ROOM - 1) { if (ny === y || ((ny % ROOM) === (by ? 0 : ROOM - 1) && (ny / ROOM | 0) !== (y / ROOM | 0) && nx !== x)) continue; } }
        if (g[nk] & 1) continue;
        if (pid !== undefined && (g[nk] & 2) && this.w.sites.some(s => s.x === nx && s.y === ny && s.owner !== pid)) continue;
        if (hostileRamp && hostileRamp.has(nk)) continue;
        if (!opts.ignoreCreeps && occ.has(nk) && occ.get(nk) !== me && Math.max(Math.abs(nx - from.x), Math.abs(ny - from.y)) <= 3) continue;
        let cost = road[nk] && !opts.ignoreRoads ? 1 : (g[nk] & 4) ? swamp : plain;
        if (opts._cm) { const rk = ((nx / ROOM) | 0) + ',' + ((ny / ROOM) | 0); let m = cms.get(rk); if (m === undefined) { m = opts._cm((nx / ROOM) | 0, (ny / ROOM) | 0); cms.set(rk, m); }
          if (m === false) continue; if (m) { const v = m.get(nx % ROOM, ny % ROOM); if (v === 255) continue; if (v > 0) cost = v; } } // 官方 CostMatrix：0=默认地形，255=不可通行
        const ng = gs[k] + cost;
        if (stamp[nk] === st && gs[nk] <= ng) continue;
        if (ng > maxCost) continue; stamp[nk] = st; gs[nk] = ng; prev[nk] = k; push(nk, ng + H(nk) * hw);
      }
    }
    if (end < 0) { if (!opts.partial || bestK === start) return []; end = bestK; } // 官方 PathFinder：到不了时返回到最近点的不完整路径
    this._lastOps = ops; this._lastCost = gs[end]; this._lastIncomplete = H(end) > 0;
    const path = []; for (let k = end; k !== prev[k]; k = prev[k]) path.push({ x: k % WW, y: (k / WW) | 0 });
    return path.reverse();
  }

  // ===== 一个 tick：运行代码（动作立即结算）→ 移动 → 寿命/伤亡 → 各类建筑 tick =====
  tick() {
    const w = this.w; w.time++; this.events = []; this._o = null;
    if (!this._near) this._near = new Set();
    for (const c of w.creeps) { const k = roomKey(c.x, c.y); if (!this._near.has(k)) { this._near.add(k); ensureNear(w, Math.floor(c.x / ROOM), Math.floor(c.y / ROOM)); } }
    w._spawnedNames = {}; for (const c of w.creeps) { c._did = {}; c._intents = {}; c.px = c.x; c.py = c.y; }
    for (const pid in w.players) {
      const f = this.fns[pid]; if (!f) continue; const api = this.buildApi(pid), t0 = Date.now();
      const P = w.players[pid]; if (P.bucket == null) P.bucket = SC.PIXEL_CPU_COST;
      let halted = false;
      try { f(api); } catch (e) { if (e && e.__halt) halted = true; else this.log(pid, '代码错误:', e && e.stack ? String(e.stack).split('\n').slice(0, 2).join(' ') : e); }
      if (halted) { // 官方 Game.cpu.halt：运行时被销毁，本 tick 登记的 intents / Memory / 段都不提交，下 tick 重新加载代码
        for (const c of w.creeps) if (c.owner === pid) { c._intents = {}; delete c._move; c._path = null; delete c._pulling; }
        for (const r of w.powerCreeps || []) if (r.owner === pid) r._pi = null;
        for (const s of this.sObjs()) if (s.owner === pid) s._sint = null;
        if (w.market && w.market.intents) w.market.intents = w.market.intents.filter(it => it._pid !== pid);
        if (this._memOk && this._memOk[pid] != null) w.memory[pid] = JSON.parse(this._memOk[pid]);
        if (this._cls) delete this._cls[pid]; try { this.fns[pid] = P.code ? compileUser(P.code) : null; } catch (e) {}
        this.cpuUsed = Date.now() - t0; P.bucket = Math.max(0, Math.min(SC.PIXEL_CPU_COST, P.bucket + this.cpuLimit(pid) - this.cpuUsed)); continue; }
      this.flushIntents(pid); // 官方：代码跑完后按优先级结算 intent
      this.cpuUsed = Date.now() - t0;
      if (api.RawMemory) { const segs = api.RawMemory.segments, ks = Object.keys(segs || {}); if (ks.length > 10) this.log(pid, 'RawMemory.segments: 同时最多 10 个'); else { const st = (w.segments = w.segments || {})[pid] = w.segments[pid] || {}; for (const id of ks) { const v = segs[id]; if (typeof v !== 'string' || !(+id >= 0 && +id <= 99)) continue; if (v.length > 100 * 1024) this.log(pid, 'RawMemory 段', id, '超过 100KB，未保存'); else st[id] = v; } } }
      // 官方 CPU：bucket += limit - used（上限 10000）
      P.bucket = Math.max(0, Math.min(SC.PIXEL_CPU_COST, P.bucket + this.cpuLimit(pid) - this.cpuUsed));
      // 官方 Memory：tick 结束时 JSON 序列化；不可序列化的内容（函数/循环引用）不会保存
      if (api.RawMemory && api.RawMemory._rawSet != null) { const v = api.RawMemory._rawSet; (w.rawMemory = w.rawMemory || {})[pid] = v; try { w.memory[pid] = JSON.parse(v || '{}'); } catch (e) { w.memory[pid] = {}; } (this._memOk = this._memOk || {})[pid] = JSON.stringify(w.memory[pid]); } else // 官方：RawMemory.set 后不再序列化 Memory
      { if (w.rawMemory) delete w.rawMemory[pid];
      try { const str = JSON.stringify(w.memory[pid]); if (str.length > 2 * 1024 * 1024) this.log(pid, 'Memory 超过 2MB 限制，未保存'); else { w.memory[pid] = JSON.parse(str); (this._memOk = this._memOk || {})[pid] = str; } } catch (e) { this.log(pid, 'Memory 序列化失败:', String(e && e.message || e)); const ok = this._memOk && this._memOk[pid]; if (ok) w.memory[pid] = JSON.parse(ok); } }
    }
    for (const pid in w.players) if (!this.fns[pid]) this.flushIntents(pid); // 本 tick 内经 API 登记（无脚本玩家，如控制台/测试）的 intent 同样在 tick 末结算
    this.keeperAI(); // 官方：NPC pretick 与玩家 intent 同一 tick 结算
    this.resolveMoves();
    for (const c of w.creeps) {
      if (c.spawning) continue;
      // 官方 processor creeps/tick.js：移动结算后站在出口格上 → 同一 tick 立即到相邻房间对侧边缘
      const lx = c.x % ROOM, ly = c.y % ROOM; let nx = c.x, ny = c.y;
      if (lx === 0) nx--; else if (lx === ROOM - 1) nx++; else if (ly === 0) ny--; else if (ly === ROOM - 1) ny++;
      const za = this.zoneOf(Math.floor(c.x / ROOM), Math.floor(c.y / ROOM)), zb = this.zoneOf(Math.floor(nx / ROOM), Math.floor(ny / ROOM)), zoneOk = (za && za.id) === (zb && zb.id);
      if ((nx !== c.x || ny !== c.y) && c.owner !== KEEPER && c.owner !== (typeof INVADER !== 'undefined' ? INVADER : '__invader') && !this.blocked(nx, ny, c)) { const o = this._occ(); o.delete(c.y * this.W + c.x); c.x = nx; c.y = ny; c.px = nx; c.py = ny; o.set(c.y * this.W + c.x, c); c._path = null; }
      c.fatigue = Math.max(0, c.fatigue - boostPower(c, 'move', 'fatigue') * 2);
      if (!c.noAge) c.ttl--; // Keeper 不衰老（官方无 ageTime）
    }
    this.applyHits();
    for (const c of w.creeps.slice()) if (!c.spawning && (c.ttl <= 0 || c.hits <= 0)) this.killCreep(c, SC.CREEP_CORPSE_RATE);
    this.tickKeepers(); this.tickZones(); this.tickSpawns(); this.tickSources(); this.tickControllers(); this.tickStructures(); this.tickGround();
    this._o = null;
  }
  resolveMoves() {
    const w = this.w; let progress = true;
    for (const c of w.creeps) if (c._move && roomKey(c._move.x, c._move.y) !== roomKey(c.x, c.y)) { delete c._move; c._path = null; } // 官方 move.js：目标超出本房 0~49 → 忽略（跨房只能靠出口格传送）
    const movers = w.creeps.filter(c => c._move && !c.spawning);
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
  ruinOf(s) { // 官方：建筑被摧毁后留下 Ruin（存储保留），RUIN_DECAY tick 后消失并把资源掉在地上
    const w = this.w; w.ruins = w.ruins || []; const type = s.kind === 'spawn' ? 'spawn' : s.type;
    w.ruins.push({ kind: 'ruin', id: 'ru' + (w.nextId++), x: s.x, y: s.y, structureType: type, structureId: s.id, owner: s.owner, destroyTime: w.time, decayAt: w.time + ((SC.RUIN_DECAY_STRUCTURES || {})[type] || SC.RUIN_DECAY), store: Object.assign({}, s.store || {}) });
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
      if (sc && pwrFx(sp, SC.PWR_DISRUPT_SPAWN, w.time) != null) { sc.spawnTime++; continue; } // PWR_DISRUPT_SPAWN：暂停孵化
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
  // 官方 keeper-lairs/tick.js：无 Keeper 或 Keeper 受伤（hits<5000）→ 计时 ENERGY_REGEN_TIME；到点移除旧 Keeper 并在 lair 上生成新的
  tickKeepers() {
    const w = this.w;
    for (const l of w.structures) {
      if (l.type !== 'keeperLair') continue;
      const name = 'Keeper' + l.id, find = () => w.creeps.find(c => c.owner === KEEPER && c.name === name);
      if (!l.spawnAt) { const k = find(); if (!k || k.hits < 5000) l.spawnAt = w.time + SC.ENERGY_REGEN_TIME; }
      if (l.spawnAt && w.time >= l.spawnAt - 1) {
        const old = find(); if (old) { w.creeps.splice(w.creeps.indexOf(old), 1); }
        w.creeps.push({ kind: 'creep', id: 'c' + (w.nextId++), owner: KEEPER, name, body: KEEPER_BODY.slice(), hits: 5000, x: l.x, y: l.y, px: l.x, py: l.y, store: { energy: 0 }, ttl: Infinity, noAge: true, fatigue: 0, lair: l.id });
        l.spawnAt = null; this._o = null; this._objVer++;
      }
    }
  }
  // 官方 creeps/keepers/pretick.js：记住 5 格内的资源点并 moveTo(range 1)；近战打 1 格内 hits 最少的；3 格内按 [10,10,4,1] 估算群伤 >13 用 rangedMassAttack，否则 rangedAttack hits 最少的
  keeperAI() {
    const w = this.w; const npc = o => o === KEEPER || o === (typeof INVADER !== 'undefined' ? INVADER : '__invader');
    for (const k of w.creeps.slice()) {
      if (k.owner !== KEEPER || k.spawning || k.hits <= 0) continue; const rk = roomKey(k.x, k.y);
      const res = w.sources.concat(w.minerals).filter(o => roomKey(o.x, o.y) === rk);
      const foes = w.creeps.filter(c => !c.spawning && !npc(c.owner) && roomKey(c.x, c.y) === rk), melee = foes.filter(c => dist(c, k) <= 1), ranged = foes.filter(c => dist(c, k) <= 3);
      let src = k.memSource && res.find(o => o.id === k.memSource);
      if (!src) { src = res.find(o => dist(k, o) <= 5); if (src) k.memSource = src.id; }
      if (src && dist(src, k) > 1 && !k.fatigue) { if (!k._path || !k._path.length || k._pathTo !== src.id) { k._path = this.findPath(k, src, 1, k, { reusePath: 50 }); k._pathTo = src.id; }
        const nx = k._path && k._path.shift(); if (nx) k._move = { x: nx.x, y: nx.y }; else k._path = null; }
      const minHits = L => L.reduce((a, c) => (!a || c.hits < a.hits ? c : a), null);
      const mt = minHits(melee);
      if (mt) { const dm = boostPower(k, 'attack', 'attack') * SC.ATTACK_POWER; this.elog(k, SC.EVENT_ATTACK, { targetId: mt.id, damage: dm, attackType: SC.EVENT_ATTACK_TYPE_MELEE }); this.damage(mt, dm, KEEPER);
        if (activeParts(mt, 'attack') && !w.structures.some(s => s.type === 'rampart' && s.x === k.x && s.y === k.y)) { const hb = boostPower(mt, 'attack', 'attack') * SC.ATTACK_POWER; this.elog(mt, SC.EVENT_ATTACK, { targetId: k.id, damage: hb, attackType: SC.EVENT_ATTACK_TYPE_HIT_BACK }); this.damage(k, hb, mt.owner); }
        this.events.push({ t: 'attack', fx: k.x, fy: k.y, x: mt.x, y: mt.y }); }
      if (ranged.length) {
        const byR = [10, 10, 4, 1], mass = ranged.reduce((a, c) => a + byR[dist(k, c)], 0), n = boostPower(k, 'ranged_attack', 'rangedAttack') * SC.RANGED_ATTACK_POWER;
        if (mass > 13) { for (const c of ranged) { const dm = Math.round(n * ({ 0: 1, 1: 1, 2: 0.4, 3: 0.1 })[dist(c, k)]); this.elog(k, SC.EVENT_ATTACK, { targetId: c.id, damage: dm, attackType: SC.EVENT_ATTACK_TYPE_RANGED_MASS }); this.damage(c, dm, KEEPER); } }
        else { const rt = minHits(ranged); this.elog(k, SC.EVENT_ATTACK, { targetId: rt.id, damage: n, attackType: SC.EVENT_ATTACK_TYPE_RANGED }); this.damage(rt, n, KEEPER); this.events.push({ t: 'attack', fx: k.x, fy: k.y, x: rt.x, y: rt.y }); }
      }
    }
  }
  // 新手区/重生区（官方 novice/respawn zone）：到期解除；区内外不能穿越
  tickZones() { const w = this.w, z = w.zones || {}; for (const k in z) if (w.time >= z[k].until) delete z[k];
    const live = new Set(Object.values(z).map(q => q.id)), n0 = w.structures.length; // 区域到期（或被移除）→ 拆除对应边界墙
    if (w.structures.some(s => s.zoneWall && !live.has(s.zoneWall))) { w.structures = w.structures.filter(s => !s.zoneWall || live.has(s.zoneWall)); this._objVer++; this._o = null; } }
  // 官方：新手区/重生区与外界之间的出口格上放置无 hits 的 constructedWall（不可摧毁），寻路自然绕开
  zoneWalls(id) { const w = this.w, z = w.zones, rooms = Object.keys(z).filter(k => z[k].id === id);
    for (const k of rooms) { const [rx, ry] = k.split(',').map(Number); if (!w.rooms[k]) ensureRoom(w, rx, ry);
      const edges = [[0, -1, (i) => [i, 0]], [0, 1, (i) => [i, ROOM - 1]], [-1, 0, (i) => [0, i]], [1, 0, (i) => [ROOM - 1, i]]];
      for (const [dx, dy, at] of edges) { const nk = (rx + dx) + ',' + (ry + dy); if (z[nk] && z[nk].id === id) continue;
        for (let i = 0; i < ROOM; i++) { const [lx, ly] = at(i), x = rx * ROOM + lx, y = ry * ROOM + ly; if (this.tile(x, y) === T_WALL || w.structures.some(s => s.x === x && s.y === y && s.zoneWall)) continue;
          w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'constructedWall', owner: null, x, y, zoneWall: id }); } } }
    this._objVer++; this._o = null; this._grid0 = null; }
  isNovice(o) { const z = this.zoneOf(Math.floor(o.x / ROOM), Math.floor(o.y / ROOM)); return !!(z && z.status === 'novice'); }
  zoneOf(rx, ry) { const z = this.w.zones && this.w.zones[rx + ',' + ry]; return z && z.until > this.w.time ? z : null; }
  tickSources() {
    const w = this.w;
    for (const s of w.sources) {
      const ctrl = ctrlOfRoom(w, roomKey(s.x, s.y)); let cap = ctrl && (ctrl.owner || (ctrl.reservation && ctrl.reservation.endTime > w.time)) ? SC.SOURCE_ENERGY_CAPACITY : SC.SOURCE_ENERGY_NEUTRAL_CAPACITY;
      if (!ctrl) cap = SC.SOURCE_ENERGY_KEEPER_CAPACITY; /* 官方 sources/tick.js：房间没有 Controller（SK 房间与扇区正中心）→ 4000 */
      if (cap !== s.cap) { s.cap = cap; s.energy = Math.min(s.energy, cap); }
      if (s.energy < s.cap) { if (!s.regenAt) s.regenAt = w.time + SC.ENERGY_REGEN_TIME;
        if (pwrFx(s, SC.PWR_DISRUPT_SOURCE, w.time) != null) s.regenAt++; // PWR_DISRUPT_SOURCE：推迟再生（sources/tick.js）
        if (w.time >= s.regenAt - 1) { s.energy = s.cap; s.regenAt = null; }
        const rg = (s.effects || []).find(f => f.power === SC.PWR_REGEN_SOURCE && f.endTime > w.time); // PWR_REGEN_SOURCE：每 period 回复 effect，不超过容量
        if (rg && (rg.endTime - w.time - 1) % SC.POWER_INFO[SC.PWR_REGEN_SOURCE].period === 0) s.energy = Math.min(s.cap, s.energy + SC.POWER_INFO[SC.PWR_REGEN_SOURCE].effect[rg.level - 1]); }
    }
    for (const m of w.minerals) { const rg = (m.effects || []).find(f => f.power === SC.PWR_REGEN_MINERAL && f.endTime > w.time); // PWR_REGEN_MINERAL（minerals/tick.js）
      if (rg && !m.regenAt && m.amount && (rg.endTime - w.time - 1) % SC.POWER_INFO[SC.PWR_REGEN_MINERAL].period === 0) m.amount += SC.POWER_INFO[SC.PWR_REGEN_MINERAL].effect[rg.level - 1]; }
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
      if (s.shield && s.shield <= w.time) { this.removeStruct(s); continue; } // PWR_SHIELD 到期移除（ramparts/tick.js）
      if (s.cooldown > 0) s.cooldown--;
      if (s.decayAt != null && w.time >= s.decayAt - 1) {
        if (s.type === 'road') { const t = this.tile(s.x, s.y); s.hits -= SC.ROAD_DECAY_AMOUNT * (t === T_SWAMP ? SC.CONSTRUCTION_COST_ROAD_SWAMP_RATIO : t === T_WALL ? SC.CONSTRUCTION_COST_ROAD_WALL_RATIO : 1); s.decayAt = w.time + SC.ROAD_DECAY_TIME; }
        else if (s.type === 'container') { s.hits -= SC.CONTAINER_DECAY; s.decayAt = w.time + (rclOf(w, s.x, s.y) > 0 ? SC.CONTAINER_DECAY_TIME_OWNED : SC.CONTAINER_DECAY_TIME); }
        else if (s.type === 'rampart' && s.shield) { /* PWR_SHIELD 临时 rampart 不衰减 */ }
        else if (s.type === 'rampart') { s.hits -= SC.RAMPART_DECAY_AMOUNT; s.decayAt = w.time + SC.RAMPART_DECAY_TIME; }
        if (s.hits <= 0) { this.ruinOf(s); this.removeStruct(s); }
      }
      if (s.type === 'rampart') s.hitsMax = SC.RAMPART_HITS_MAX[rclOf(w, s.x, s.y)] || 0;
    }
    if (w.nukes && w.nukes.length) for (const n of w.nukes.slice()) if (w.time >= n.landTime) { // 官方核弹落地：杀死房间内所有 creep、移除工地、2 格内伤害
      const rk = roomKey(n.x, n.y); w.nukes.splice(w.nukes.indexOf(n), 1); if (this.zoneOf(Math.floor(n.x / ROOM), Math.floor(n.y / ROOM))) continue; // 官方 nukes/tick.js：落在新手/重生区直接消失
      for (const c of w.creeps.slice()) if (roomKey(c.x, c.y) === rk) this.killCreep(c, 0);
      w.sites = w.sites.filter(t => roomKey(t.x, t.y) !== rk);
      const hitAt = (x, y, dmg) => { for (const s of [...w.structures, ...w.spawns]) if (s.x === x && s.y === y && s.hits != null) this.elog(n, SC.EVENT_ATTACK, { targetId: s.id, damage: dmg, attackType: SC.EVENT_ATTACK_TYPE_NUKE }); const list = [...w.structures, ...w.spawns].filter(s => s.x === x && s.y === y); const ramp = list.find(s => s.type === 'rampart'); let left = dmg;
        if (ramp) { const a = Math.min(ramp.hits, left); ramp.hits -= a; left -= a; if (ramp.hits <= 0) { this.ruinOf(ramp); this.removeStruct(ramp); } }
        if (left > 0) for (const s of list) if (s !== ramp && s.hits != null) { s.hits -= left; if (s.hits <= 0) { this.ruinOf(s); this.removeStruct(s); } } };
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = n.x + dx, y = n.y + dy; if (roomKey(x, y) !== rk) continue; hitAt(x, y, dx || dy ? SC.NUKE_DAMAGE[2] : SC.NUKE_DAMAGE[0]); }
      const ct = ctrlOfRoom(w, rk); if (ct) { ct.safeMode = 0; ct.upgradeBlocked = w.time + SC.CONTROLLER_NUKE_BLOCKED_UPGRADE; }
      this._objVer++;
    }
  }
  tickGround() {
    const w = this.w;
    for (const r of w.resources) r.amount -= Math.ceil(r.amount / SC.ENERGY_DECAY);
    w.resources = w.resources.filter(r => r.amount > 0);
    if (w.ruins) for (const t of w.ruins.filter(t => w.time >= t.decayAt)) { for (const r in t.store) this.dropAt(t.x, t.y, r, t.store[r]); w.ruins.splice(w.ruins.indexOf(t), 1); }
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
  // 官方事件日志：room.getEventLog() 的条目（engine/src/processor 各 intent 的 eventLog.push）
  elog(o, event, data) { (this.w._elog = this.w._elog || []).push({ k: roomKey(o.x, o.y), e: { event, objectId: o.id, data: data || {} } }); }
  damage(target, amount, attackerOwner) {
    const w = this.w, ctrl = ctrlOfRoom(w, roomKey(target.x, target.y));
    if (ctrl && ctrl.safeMode > w.time && ctrl.owner !== attackerOwner) return; // 安全模式
    if ((target.type === 'constructedWall' || target.type === 'rampart') && (target.effects || []).some(f => f.power === SC.PWR_FORTIFY && f.endTime > w.time)) return; // PWR_FORTIFY：无敌（_damage.js，核弹除外）
    const ramp = w.structures.find(s => s.type === 'rampart' && s.x === target.x && s.y === target.y);
    if (ramp && ramp !== target) target = ramp;
    if (target.kind === 'creep') { target._dmg = (target._dmg || 0) + amount; return; } // 官方 _damage.js：creep 记 _damageToApply，tick 末统一结算
    target.hits -= amount;
    if (target.kind !== 'creep' && target.hits <= 0) { this.ruinOf(target); this.removeStruct(target); }
  }
  sObjs() { const w = this.w; return [].concat(w.spawns || [], w.structures || [], w.controllers || []); }
  // 官方：玩家代码结束后先结算 creep intent，再结算建筑/控制器 intent
  flushIntents(pid) { const w = this.w;
    for (const c of w.creeps.slice()) if (c.owner === pid && c._flushIntents) c._flushIntents();
    for (const s of this.sObjs()) if (s.owner === pid && s._sint && s._flushIntents) s._flushIntents();
  }
  applyHits() { const w = this.w;
    for (const c of w.creeps) if (c._dmg || c._heal) { // 官方 creeps/tick.js：先伤害（强化 TOUGH 减伤）再治疗，最后封顶
      if (c._dmg) { let dmg = c._dmg, reduce = 0, eff = dmg;
        if (c.boosts && c.boosts.some(Boolean)) for (let i = 0; i < c.body.length && eff > 0; i++) { const b = c.boosts[i], br = b && SC.BOOSTS[c.body[i]] && SC.BOOSTS[c.body[i]][b] && SC.BOOSTS[c.body[i]][b].damage; const ratio = br || 1, he = partHits(c, i) / ratio; reduce += Math.min(he, eff) * (1 - ratio); eff -= Math.min(he, eff); }
        c.hits -= dmg - Math.round(reduce); }
      if (c._heal) c.hits += c._heal; c._dmg = 0; c._heal = 0; if (c.hits > c.body.length * 100) c.hits = c.body.length * 100; }
  }
  cpuLimit(pid) { const P = this.w.players[pid]; return P && (P.cpuUnlockedUntil || 0) > Date.now() ? Math.min(300, 20 + 10 * this.gclLevel(pid)) : 20; } // 官方：解锁后 10×GCL+20（≤300）
  gclLevel(pid) { const p = this.w.players[pid].gcl || 0; let lv = 1; while (p >= Math.pow(lv, SC.GCL_POW) * SC.GCL_MULTIPLY) lv++; return lv; }

  buildApi(pid) { return buildApi(this, pid); }
  findList(pid, type, k, wrap) { return findList(this, pid, type, k, wrap); }
  snapshot(pid) { return worldSnapshot(this.w, this.events, pid); }
  visibleRooms(pid) { return visibleRooms(this.w, pid); }
  roomsData() { return roomsDataOf(this.w); }
}
// 快照：渲染/联机用的扁平只读视图（渲染层也可直接传入原始 world）
function worldSnapshot(w0, events, pid) {
    const en = s => (s.store && s.store.energy) || 0;
    // pid 给定时按官方视野过滤：地形/能量源/矿物/Controller 位置始终可见，其他对象只在有视野的房间可见
    let w = w0, vis = null;
    if (pid) { vis = visibleRooms(w0, pid); const F = l => (l || []).filter(o => vis.has(roomKey(o.x, o.y))); w = Object.assign({}, w0, { creeps: F(w0.creeps), spawns: F(w0.spawns), structures: F(w0.structures), sites: F(w0.sites), resources: F(w0.resources), tombstones: F(w0.tombstones), ruins: F(w0.ruins), nukes: F(w0.nukes), flags: (w0.flags || []).filter(f => f.owner === pid || vis.has(roomKey(f.x, f.y))) }); }
    return { time: w.time, S: w.S, roomsVer: w.roomsVer, players: Object.fromEntries(Object.entries(w.players).map(([k, p]) => [k, { name: p.name, color: p.color, needsSpawn: !!p.needsSpawn, badge: p.badge || defaultBadge(k), gcl: p.gcl || 0 }])), owned: ownedMap(w),
      sources: w.sources.map(s => ({ id: s.id, x: s.x, y: s.y, energy: s.energy, cap: s.cap })),
      minerals: w.minerals.map(m => ({ id: m.id, x: m.x, y: m.y, type: m.type, amount: m.amount })),
      controllers: w.controllers.map(c => ({ id: c.id, x: c.x, y: c.y, owner: c.owner, level: c.level, progress: c.progress, progressTotal: SC.CONTROLLER_LEVELS[c.level] || 0, ticksToDowngrade: c.downgradeTime ? c.downgradeTime - w.time : 0 })),
      spawns: w.spawns.map(s => ({ id: s.id, name: s.name, owner: s.owner, x: s.x, y: s.y, energy: en(s), cap: SC.SPAWN_ENERGY_CAPACITY, hits: s.hits, hitsMax: s.hitsMax, spawning: s.spawning && { name: s.spawning.name, left: s.spawning.spawnTime - w.time, total: s.spawning.needTime } })),
      creeps: w.creeps.filter(c => !c.spawning).map(c => ({ id: c.id, owner: c.owner, name: c.name, body: c.body, x: c.x, y: c.y, px: c.px, py: c.py, energy: storeSum(c.store), ttl: c.ttl, hits: c.hits, hitsMax: c.body.length * 100, fatigue: c.fatigue, store: { ...c.store }, cap: c.body.filter(b => (b.type || b) === 'carry').length * SC.CARRY_CAPACITY, face: c._face && c._face.t === w.time ? [c._face.x, c._face.y] : undefined, say: w.time - (c.sayT || -99) < 2 ? c.say : undefined })),
      sites: w.sites.map(s => ({ id: s.id, owner: s.owner, x: s.x, y: s.y, type: s.type, progress: s.progress, total: s.total })),
      structures: w.structures.map(s => ({ id: s.id, type: s.type, owner: s.owner, x: s.x, y: s.y, hits: s.hits, hitsMax: s.hitsMax, energy: s.store ? en(s) : undefined, energyCapacity: s.store ? storeCap(w, s, 'energy') ?? storeCap(w, s) : undefined })),
      resources: w.resources.map(r => ({ id: r.id, x: r.x, y: r.y, resourceType: r.resourceType, amount: r.amount })),
      tombstones: w.tombstones.map(t => ({ id: t.id, x: t.x, y: t.y, owner: t.owner, creepName: t.creepName, energy: t.store.energy || 0, decay: t.decayAt - w.time, store: { ...(t.store || {}) } })),
      ruins: (w.ruins || []).map(r => ({ id: r.id, x: r.x, y: r.y, owner: r.owner, structureType: r.structureType, destroyTime: r.destroyTime, decay: r.decayAt - w.time, store: { ...(r.store || {}) } })),
      nukes: (w.nukes || []).map(n => ({ id: n.id, x: n.x, y: n.y, timeToLand: n.landTime - w.time, launchRoomName: n.launchRoomName })),
      flags: (w.flags || []).map(f => ({ id: f.id, x: f.x, y: f.y, owner: f.owner, name: f.name, color: f.color, secondaryColor: f.secondaryColor })),
      events: (events || []).filter(e => !vis || e.x == null || vis.has(roomKey(e.x, e.y))), vis: vis ? [...vis] : null };
}
function roomsDataOf(w) { return { roomsVer: w.roomsVer, S: w.S, rooms: Object.fromEntries(Object.entries(w.rooms).map(([k, r]) => [k, { tiles: r.tiles.join(''), owner: r.owner, name: r.name, type: r.type }])) }; }
Engine.prototype.saveData = function () { const w = this.w; return JSON.stringify(w, (k, v) => (k[0] === '_' ? undefined : v)); };
if (typeof module !== 'undefined') module.exports = { Engine, newWorld, countStruct, rclOf, visibleRooms, worldSnapshot };

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
    case SC.FIND_RUINS: return W(w.ruins || []);
    case SC.FIND_NUKES: return W(w.nukes || []);
    case SC.FIND_EXIT_TOP: case SC.FIND_EXIT_RIGHT: case SC.FIND_EXIT_BOTTOM: case SC.FIND_EXIT_LEFT: case SC.FIND_EXIT: {
      if (k == null) return []; const [rx, ry] = k.split(',').map(Number), out = [];
      const add = (lx, ly) => { const x = rx * ROOM + lx, y = ry * ROOM + ly; if (E.tile(x, y) !== T_WALL) out.push(wrap({ kind: 'pos', x, y })); };
      for (let i = 0; i < ROOM; i++) { if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_TOP) add(i, 0); if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_RIGHT) add(49, i); if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_BOTTOM) add(i, 49); if (type === SC.FIND_EXIT || type === SC.FIND_EXIT_LEFT) add(0, i); }
      return out;
    }
    case 'controller': return W(w.controllers.filter(mine)); // 兼容 v1.2 积木
    default: return []; // POWER_CREEPS / DEPOSITS 等：本游戏中不存在
  }
}

function buildApi(E, pid) {
  const CLS = E.classesFor ? E.classesFor(pid) : makeClasses();
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
      const orx = (this._g.x / ROOM) | 0, ory = (this._g.y / ROOM) | 0, p = E.findPath(this._g, list.map(gpos), 1, undefined, Object.assign({ maxOps: 4000, ignoreCreeps: true }, opts, opts && (opts.costCallback || opts._cm) ? {} : { _cm: (rx, ry) => rx === orx && ry === ory ? null : false })); if (!p.length) return null; // 官方 findClosestByPath：maxRooms 1
      const end = p[p.length - 1]; let b = null, bd = Infinity; for (const o of list) { const d = dist(end, gpos(o)); if (d < bd) { bd = d; b = o; } } return b;
    }
    findPathTo(a, b, c) { const g = this._args(a, b), opts = typeof a === 'number' ? c : b; const rk = roomKey(this._g.x, this._g.y); return g ? E.findPath(this._g, g, (opts && opts.range) || 0, undefined, opts || {}).filter((p, i, arr) => arr.slice(0, i + 1).every(q => roomKey(q.x, q.y) === rk)).map((p, i, arr) => { const prev = i ? arr[i - 1] : this._g; return { x: p.x % ROOM, y: p.y % ROOM, dx: p.x - prev.x, dy: p.y - prev.y, direction: dirOf(p.x - prev.x, p.y - prev.y) }; }) : []; }
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
    for (const o of (w.ruins || [])) if (at(o)) add(SC.LOOK_RUINS, o);
    for (const o of (w.nukes || [])) if (at(o)) add(SC.LOOK_NUKES, o);
    out.push({ type: SC.LOOK_TERRAIN, terrain: TERRAIN_NAME[E.tile(x, y)] });
    return out;
  }
  function makeStore(o) {
    const s = Object.create(CLS.Store.prototype); for (const r in o.store) if (o.store[r] > 0) s[r] = o.store[r];
    const P = new Proxy(s, { get: (t, key) => key in t ? t[key] : (RESOURCES.has(key) ? 0 : undefined) });
    const def = (n, f) => Object.defineProperty(s, n, { value: f, enumerable: false });
    def('getCapacity', r => (o.kind === 'tombstone' || o.kind === 'ruin') ? null : storeCap(w, o, r));
    def('getUsedCapacity', r => { if (r === undefined) { if (o.kind !== 'tombstone' && o.kind !== 'ruin' && storeCap(w, o) == null) return null; return storeSum(o.store); } if (o.kind !== 'tombstone' && o.kind !== 'ruin' && storeCap(w, o, r) == null) return 0; return o.store[r] || 0; });
    def('getFreeCapacity', r => (o.kind === 'tombstone' || o.kind === 'ruin') ? null : freeFor(w, o, r === undefined && storeCap(w, o) == null ? 'energy' : r));
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
    if (ctrl && ctrl.owner && ctrl.owner !== pid) return ERR_NOT_OWNER;
    if (ctrl && ctrl.reservation && ctrl.reservation.owner !== pid) return ERR_NOT_OWNER;
    const lvl = ctrl && ctrl.owner === pid ? ctrl.level : 0, lim = SC.CONTROLLER_STRUCTURES[type][lvl] || 0;
    if (countStruct(w, pid, type, k) >= lim) return ERR_RCL_NOT_ENOUGH;
    if (w.sites.filter(s => s.owner === pid).length >= SC.MAX_CONSTRUCTION_SITES) return ERR_FULL;
    let total = SC.CONSTRUCTION_COST[type];
    if (type === 'road') { const t = E.tile(x, y); if (t === T_SWAMP) total *= SC.CONSTRUCTION_COST_ROAD_SWAMP_RATIO; if (t === T_WALL) total *= SC.CONSTRUCTION_COST_ROAD_WALL_RATIO; }
    if (type === 'spawn') { name = name || ('Spawn' + (w.spawns.filter(s => s.owner === pid).length + w.sites.filter(s => s.owner === pid && s.type === 'spawn').length + 1)); if (typeof name !== 'string' || name.length > 100 || w.spawns.some(s => s.name === name && s.owner === pid) || w.sites.some(s => s.name === name && s.owner === pid && s.type === 'spawn')) return ERR_INVALID_ARGS; }
    w.sites.push({ kind: 'site', id: 'cs' + (w.nextId++), owner: pid, x, y, type, progress: 0, total, name }); E._objVer++; return OK;
  }
  function createFlag(g, name, color = SC.COLOR_WHITE, color2 = color) {
    if (!g) return ERR_INVALID_ARGS; name = name || ('Flag' + (w.flags.filter(f => f.owner === pid).length + 1));
    if (w.flags.some(f => f.owner === pid && f.name === name)) return ERR_NAME_EXISTS;
    if (name.length > 100 || color < 1 || color > 10) return ERR_INVALID_ARGS;
    w.flags.push({ kind: 'flag', id: 'fl' + (w.nextId++), owner: pid, name, x: g.x, y: g.y, color, secondaryColor: color2 }); return name;
  }

  // ---- 包装对象 ----
  // 官方 processor.js：建筑/控制器 intent 在玩家代码结束后按固定顺序结算；同名 intent 后者覆盖前者
  const S_ORDER = ['cancelSpawning', 'setSpawnDirections', 'spawnCreep', 'renewCreep', 'recycleCreep', 'boostCreep', 'unboostCreep', 'runReaction', 'reverseReaction', 'transferEnergy', 'send', 'launchNuke', 'observeRoom', 'processPower', 'produce', 'setPublic', 'activateSafeMode', 'unclaim', 'heal', 'repair', 'attack', 'destroy', 'notifyWhenAttacked'];
  const S_EXCL = [['heal', 'repair', 'attack'], ['runReaction', 'reverseReaction']]; // 官方：塔 heal>repair>attack 互斥；lab 反应二选一
  function wrapStructIntents(v, o) {
    for (const m of S_ORDER) {
      if (m === 'cancelSpawning' || m === 'setSpawnDirections' || typeof v[m] !== 'function') continue;
      const orig = v[m];
      v[m] = (...a) => {
        if (o._flushing) return orig(...a);
        o._intentOnly = true; let r;
        try { r = orig(...a); } finally { o._intentOnly = false; }
        if (r === OK) (o._sint = o._sint || {})[m] = () => orig(...a);
        return r;
      };
    }
    o._flushIntents = () => {
      const si = o._sint; o._sint = null; if (!si) return;
      for (const g of S_EXCL) { let hit = false; for (const m of g) { if (si[m] && hit) delete si[m]; else if (si[m]) hit = true; } }
      o._flushing = true;
      try { for (const m of S_ORDER) if (si[m]) si[m](); } finally { o._flushing = false; }
    };
  }
  function wrap(o) {
    if (!o) return null; let v = cache.get(o); if (v) return v;
    if (o.kind === 'pos') { v = posOf(o); cache.set(o, v); return v; }
    v = { id: o.id, _raw: o, pos: posOf(o), effects: [] };
    Object.defineProperty(v, '_raw', { enumerable: false }); Object.defineProperty(v, 'room', { get: () => room(roomKey(o.x, o.y)), enumerable: false });
    cache.set(o, v); B[o.kind](v, o); if (o.kind !== 'creep') wrapStructIntents(v, o); const cn = classOf(o); if (cn) toClass(CLS, v, cn); return v;
  }
  const owner = o => o.owner ? { username: (typeof NPC_NAME !== 'undefined' && NPC_NAME[o.owner]) || w.players[o.owner]?.name || o.owner } : undefined; // 官方 NPC 用户名：Invader / Source Keeper
  const structBase = (v, o, type) => {
    Object.assign(v, { structureType: type, hits: o.hits, hitsMax: o.hitsMax, my: o.owner === pid, owner: owner(o) });
    v.destroy = () => { if (o.owner !== pid && type !== 'road' && type !== 'container' && type !== 'constructedWall') return ERR_NOT_OWNER; const c = ctrlOfRoom(w, roomKey(o.x, o.y)); if (c && c.owner !== pid) return ERR_NOT_OWNER; if (w.creeps.some(c => !c.spawning && c.owner !== pid && sameRoom(c, o))) return ERR_BUSY; if (o._intentOnly) return OK; E.ruinOf(o); E.removeStruct(o); return OK; }; // 官方 _destroy：留下 Ruin（存储保留）
    v.isActive = () => E.isActive(o); v.notifyWhenAttacked = en => { if (o.owner !== pid) return ERR_NOT_OWNER; if (typeof en !== 'boolean') return ERR_INVALID_ARGS; if (o._intentOnly) return OK; o.notifyAttacked = en; return OK; };
    if (o.store) { v.store = makeStore(o); const ec = storeCap(w, o, 'energy'); v.energy = o.store.energy || 0; v.energyCapacity = ec; }
    if (o.cooldown != null) v.cooldown = o.cooldown;
    if (o.decayAt != null) v.ticksToDecay = o.decayAt - w.time;
  };
  const B = {
    source(v, o) { Object.assign(v, { energy: o.energy, energyCapacity: o.cap, ticksToRegeneration: o.regenAt ? o.regenAt - w.time : undefined }); },
    mineral(v, o) { Object.assign(v, { mineralType: o.type, mineralAmount: o.amount, density: o.density, ticksToRegeneration: o.regenAt ? o.regenAt - w.time : undefined }); },
    resource(v, o) { Object.assign(v, { resourceType: o.resourceType, amount: o.amount }); },
    nuke(v, o) { Object.assign(v, { timeToLand: o.landTime - w.time, launchRoomName: o.launchRoomName }); },
    ruin(v, o) { Object.assign(v, { destroyTime: o.destroyTime, ticksToDecay: o.decayAt - w.time, store: makeStore(o), structure: { id: o.structureId, structureType: o.structureType, owner: owner(o), my: o.owner === pid } }); },
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
      v.activateSafeMode = () => { if (o.owner !== pid) return ERR_NOT_OWNER; if (o.safeModeAvailable <= 0) return ERR_NOT_ENOUGH_RESOURCES; if (o.safeModeCooldown > w.time || o.upgradeBlocked > w.time || (o.downgradeTime - w.time) < SC.CONTROLLER_DOWNGRADE[o.level] / 2 - SC.CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD) return ERR_TIRED; if (w.controllers.some(c => c.owner === pid && c.safeMode > w.time)) return ERR_BUSY; if (o._intentOnly) return OK; o.safeModeAvailable--; o.safeMode = w.time + SC.SAFE_MODE_DURATION; o.safeModeCooldown = E.isNovice(o) ? null : w.time + SC.SAFE_MODE_COOLDOWN; return OK; }; // 官方 controllers/tick.js：新手区无安全模式冷却
      v.unclaim = () => { if (o.owner !== pid) return ERR_NOT_OWNER; if (o._intentOnly) return OK; const rm = w.rooms[roomKey(o.x, o.y)]; if (rm.owner === pid) rm.owner = null; Object.assign(o, { owner: null, level: 0, progress: 0, downgradeTime: null, safeMode: null, safeModeAvailable: 0, safeModeCooldown: E.isNovice(o) ? null : w.time + SC.SAFE_MODE_COOLDOWN }); return OK; }; // 官方 unclaim.js
    },
    spawn(v, o) {
      structBase(v, o, 'spawn'); o.store = o.store || { energy: 0 }; v.store = makeStore(o); v.energy = o.store.energy || 0; v.energyCapacity = SC.SPAWN_ENERGY_CAPACITY; v.name = o.name;
      Object.defineProperty(v, 'memory', { get: () => (mem.spawns = mem.spawns || {}, mem.spawns[o.name] = mem.spawns[o.name] || {}), set: x => { mem.spawns = mem.spawns || {}; mem.spawns[o.name] = x; } });
      v.spawning = o.spawning ? { name: o.spawning.name, needTime: o.spawning.needTime, remainingTime: o.spawning.spawnTime - w.time, directions: o.spawning.directions, spawn: v,
        cancel: () => { if (o.owner !== pid) return ERR_NOT_OWNER; (o._sint = o._sint || {}).cancelSpawning = () => { if (!o.spawning) return; w.creeps = w.creeps.filter(c => !(c.spawning && c.name === o.spawning.name && c.owner === pid)); o.spawning = null; }; return OK; },
        setDirections: d => { if (o.owner !== pid) return ERR_NOT_OWNER; if (!Array.isArray(d) || !d.length || d.some(x => !DIRS[x])) return ERR_INVALID_ARGS; const dd = d.slice(); (o._sint = o._sint || {}).setSpawnDirections = () => { if (o.spawning) o.spawning.directions = dd; }; return OK; } } : null;
      v.spawnCreep = (body, name, opts = {}) => { // 校验顺序与官方 engine/src/game/structures.js 一致
        if (!name || opts === null || typeof opts !== 'object') return ERR_INVALID_ARGS; name = String(name); if (name.length > 100) return ERR_INVALID_ARGS;
        const created = (w._spawnedNames = w._spawnedNames || {})[pid] || [];
        if (!o._flushing && (w.creeps.some(c => c.owner === pid && c.name === name) || created.includes(name))) return ERR_NAME_EXISTS;
        if (opts.directions !== undefined && (!Array.isArray(opts.directions) || !opts.directions.length || opts.directions.some(d => !DIRS[+d] || +d !== (+d | 0)))) return ERR_INVALID_ARGS;
        if (o.owner !== pid) return ERR_NOT_OWNER;
        if (o.spawning) return ERR_BUSY;
        if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH;
        if (!Array.isArray(body) || !body.length || body.length > SC.MAX_CREEP_SIZE || body.some(b => !SC.BODYPARTS_ALL.includes(b))) return ERR_INVALID_ARGS;
        const k = roomKey(o.x, o.y), cost = bodyCost(body);
        let srcs = opts.energyStructures ? opts.energyStructures.map(raw).filter(x => x && (x.kind === 'spawn' || x.type === 'extension') && x.owner === pid && roomKey(x.x, x.y) === k) : E.roomEnergy(k, pid).list.slice().sort((a, b) => dist(a, o) - dist(b, o));
        if (srcs.reduce((a, s) => a + (s.store.energy || 0), 0) < cost) return ERR_NOT_ENOUGH_ENERGY;
        if (opts.dryRun) return OK;
        if (o._intentOnly) { if (opts.memory !== undefined) { mem.creeps = mem.creeps || {}; mem.creeps[name] = opts.memory; } (w._spawnedNames = w._spawnedNames || {})[pid] = created.concat(name); return OK; } // 官方：Memory 与同 tick 重名在调用时处理
        if (o.spawning || w.creeps.some(c => c.owner === pid && c.name === name)) return ERR_BUSY;
        let left = cost; for (const s of srcs) { const a = Math.min(left, s.store.energy || 0); s.store.energy -= a; left -= a; if (!left) break; }
        let need = body.length * SC.CREEP_SPAWN_TIME; const opS = pwrFx(o, SC.PWR_OPERATE_SPAWN, w.time); if (opS != null) need = Math.ceil(need * opS); // PWR_OPERATE_SPAWN
        o.spawning = { name, needTime: need, spawnTime: w.time + need, directions: opts.directions };
        w.creeps.push({ kind: 'creep', id: 'c' + (w.nextId++), owner: pid, name, body: body.slice(), hits: body.length * 100, x: o.x, y: o.y, px: o.x, py: o.y, store: {}, ttl: 0, fatigue: 0, spawning: true });
        if (opts.memory !== undefined) { mem.creeps = mem.creeps || {}; mem.creeps[name] = opts.memory; }
        (w._spawnedNames = w._spawnedNames || {})[pid] = created.concat(name);
        return OK;
      };
      v.createCreep = (body, name, memory) => { name = name || ('creep' + w.nextId); const r = v.spawnCreep(body, name, { memory }); return r === OK ? name : r; };
      v.canCreateCreep = (body, name) => v.spawnCreep(body, name || ('x' + w.nextId), { dryRun: true });
      const near = c => { const r = raw(c); if (!r || r.kind !== 'creep') return ERR_INVALID_TARGET; if (o.owner !== pid || r.owner !== pid) return ERR_NOT_OWNER; if (dist(r, o) > 1) return ERR_NOT_IN_RANGE; return r; };
      v.renewCreep = c => { const r = near(c); if (typeof r === 'number') return r; if (o.spawning) return ERR_BUSY; if (r.body.includes('claim')) return ERR_INVALID_TARGET;
        const add = Math.floor(SC.SPAWN_RENEW_RATIO * SC.CREEP_LIFE_TIME / SC.CREEP_SPAWN_TIME / r.body.length), cost = Math.ceil(SC.SPAWN_RENEW_RATIO * bodyCost(r.body) / SC.CREEP_SPAWN_TIME / r.body.length);
        if (r.ttl + add > SC.CREEP_LIFE_TIME) return ERR_FULL; const pool = E.roomEnergy(roomKey(o.x, o.y), pid); if (pool.avail < cost) return ERR_NOT_ENOUGH_ENERGY;
        if (o._intentOnly) return OK; let left = cost; for (const s of pool.list) { const a = Math.min(left, s.store.energy || 0); s.store.energy -= a; left -= a; } r.ttl += add; return OK; };
      v.recycleCreep = c => { const r = near(c); if (typeof r === 'number') return r; if (o._intentOnly) return OK; E.killCreep(r, 1); return OK; };
    },
    structure(v, o) {
      structBase(v, o, o.type);
      // 官方 game/structures.js 各类型专有属性
      if (o.type === 'keeperLair') v.ticksToSpawn = o.spawnAt ? o.spawnAt - w.time : undefined;
      if (o.type === 'powerBank') { v.power = (o.store && o.store.power) || o.power || 0; v.ticksToDecay = o.decayAt != null ? o.decayAt - w.time : undefined; }
      if (o.type === 'portal') { v.destination = o.destination ? (o.destination.shard ? { shard: o.destination.shard, room: o.destination.room } : posOf({ x: o.destination.x, y: o.destination.y })) : undefined; v.ticksToDecay = o.decayAt != null ? o.decayAt - w.time : undefined; }
      if (o.type === 'invaderCore') { v.level = o.level; v.ticksToDeploy = o.deployTime ? o.deployTime - w.time : undefined; v.spawning = o.spawning ? { name: o.spawning.name, needTime: o.spawning.needTime, remainingTime: o.spawning.spawnTime - w.time, directions: undefined, spawn: v, cancel: () => ERR_NOT_OWNER, setDirections: () => ERR_NOT_OWNER } : null; } // 官方 StructureInvaderCore：level / spawning / ticksToDeploy
      if (o.type === 'constructedWall') v.ticksToLive = o.decayAt != null ? o.decayAt - w.time : undefined;
      if (o.type === 'container' || o.type === 'storage' || o.type === 'terminal') v.storeCapacity = storeCap(w, o); // 已废弃，等同 store.getCapacity()
      if (o.type === 'rampart') { v.isPublic = !!o.isPublic; v.setPublic = p => { if (o.owner !== pid) return ERR_NOT_OWNER; if (o._intentOnly) return OK; o.isPublic = !!p; return OK; }; }
      if (o.type === 'nuker') { v.ghodium = o.store.G || 0; v.ghodiumCapacity = SC.NUKER_GHODIUM_CAPACITY; v.energy = o.store.energy || 0; v.energyCapacity = SC.NUKER_ENERGY_CAPACITY;
        v.launchNuke = pos => { // 官方 StructureNuker.launchNuke 校验顺序
          if (o.owner !== pid) return ERR_NOT_OWNER; if (!(pos instanceof RoomPosition)) return ERR_INVALID_ARGS;
          const p = parseRoomName(pos.roomName); if (!p) return ERR_INVALID_ARGS; const zf = E.zoneOf ? E.zoneOf(Math.floor(o.x / ROOM), Math.floor(o.y / ROOM)) : null, zt = E.zoneOf ? E.zoneOf(p[0], p[1]) : null; if (zf || zt) return ERR_INVALID_TARGET;
          if (o.cooldown > 0) return ERR_TIRED; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH;
          if (Math.abs(p[0] - Math.floor(o.x / ROOM)) > SC.NUKE_RANGE || Math.abs(p[1] - Math.floor(o.y / ROOM)) > SC.NUKE_RANGE) return ERR_NOT_IN_RANGE;
          if ((o.store.energy || 0) < SC.NUKER_ENERGY_CAPACITY || (o.store.G || 0) < SC.NUKER_GHODIUM_CAPACITY) return ERR_NOT_ENOUGH_RESOURCES;
          if (o._intentOnly) return OK; o.store.energy = 0; o.store.G = 0; o.cooldown = SC.NUKER_COOLDOWN; w.nukes = w.nukes || [];
          w.nukes.push({ kind: 'nuke', id: 'n' + (w.nextId++), x: p[0] * ROOM + pos.x, y: p[1] * ROOM + pos.y, landTime: w.time + SC.NUKE_LAND_TIME, launchRoomName: roomName(o.x, o.y) }); return OK; }; }
      if (o.type === 'powerSpawn') { v.power = o.store.power || 0; v.powerCapacity = SC.POWER_SPAWN_POWER_CAPACITY; v.energy = o.store.energy || 0; v.energyCapacity = SC.POWER_SPAWN_ENERGY_CAPACITY;
        v.processPower = () => { if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; if ((o.store.power || 0) < 1 || (o.store.energy || 0) < SC.POWER_SPAWN_ENERGY_RATIO) return ERR_NOT_ENOUGH_RESOURCES;
          if (o._intentOnly) return OK; let amt = 1; const opP = pwrFx(o, SC.PWR_OPERATE_POWER, w.time, true); if (opP != null) amt = Math.min(o.store.power, amt + opP); // PWR_OPERATE_POWER
          if (o.store.power < amt || o.store.energy < amt * SC.POWER_SPAWN_ENERGY_RATIO) return OK; o.store.power -= amt; o.store.energy -= amt * SC.POWER_SPAWN_ENERGY_RATIO; const pl = w.players[pid]; pl.power = (pl.power || 0) + amt; return OK; }; }
      if (o.type === 'factory') { v.level = o.level;
        v.produce = res => { if (o.owner !== pid) return ERR_NOT_OWNER; if (o.cooldown > 0) return ERR_TIRED; const c = SC.COMMODITIES[res]; if (!c) return ERR_INVALID_ARGS;
          if (c.level && c.level !== o.level) return ERR_INVALID_TARGET; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; if (c.level && !(o.effects || []).some(f => f.power === SC.PWR_OPERATE_FACTORY && f.level === c.level && f.endTime >= w.time)) return ERR_BUSY; // 无 Power Creep：PWR_OPERATE_FACTORY 效果不存在
          if (Object.keys(c.components).some(k => (o.store[k] || 0) < c.components[k])) return ERR_NOT_ENOUGH_RESOURCES;
          const comp = Object.values(c.components).reduce((a, b) => a + b, 0); if (storeSum(o.store) - comp + (c.amount || 1) > SC.FACTORY_CAPACITY) return ERR_FULL;
          if (o._intentOnly) return OK; for (const k in c.components) o.store[k] -= c.components[k]; o.store[res] = (o.store[res] || 0) + (c.amount || 1); o.cooldown = c.cooldown; return OK; }; }
      if (o.type === 'tower') {
        const act = (t, kind) => {
          if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; const r = raw(t);
          if (!r || r.hits == null || !sameRoom(r, o)) return ERR_INVALID_TARGET; if ((o.store.energy || 0) < SC.TOWER_ENERGY_COST) return ERR_NOT_ENOUGH_ENERGY;
          const d = dist(r, o), base = kind === 'attack' ? SC.TOWER_POWER_ATTACK : kind === 'heal' ? SC.TOWER_POWER_HEAL : SC.TOWER_POWER_REPAIR;
          let amt = base; if (d > SC.TOWER_OPTIMAL_RANGE) amt -= amt * SC.TOWER_FALLOFF * (Math.min(d, SC.TOWER_FALLOFF_RANGE) - SC.TOWER_OPTIMAL_RANGE) / (SC.TOWER_FALLOFF_RANGE - SC.TOWER_OPTIMAL_RANGE); for (const pw of [SC.PWR_OPERATE_TOWER, SC.PWR_DISRUPT_TOWER]) { const f = pwrFx(o, pw, w.time); if (f != null) amt *= f; } amt = Math.floor(amt); if (!amt) return OK;
          if (kind === 'heal' && r.kind !== 'creep') return ERR_INVALID_TARGET; if (kind === 'repair' && r.kind === 'creep') return ERR_INVALID_TARGET;
          if (o._intentOnly) return OK; o.store.energy -= SC.TOWER_ENERGY_COST;
          if (kind === 'attack') E.damage(r, amt, pid, 'tower'); else (kind === 'heal' ? (r._heal = (r._heal || 0) + amt) : (r.hits = Math.min(r.hitsMax, r.hits + amt)));
          if (kind === 'attack') E.elog(o, SC.EVENT_ATTACK, { targetId: r.id, damage: amt, attackType: SC.EVENT_ATTACK_TYPE_RANGED }); else if (kind === 'heal') E.elog(o, SC.EVENT_HEAL, { targetId: r.id, amount: amt, healType: SC.EVENT_HEAL_TYPE_RANGED }); else E.elog(o, SC.EVENT_REPAIR, { targetId: r.id, amount: amt, energySpent: SC.TOWER_ENERGY_COST });
          ev.push({ t: kind, fx: o.x, fy: o.y, x: r.x, y: r.y }); return OK;
        };
        v.attack = t => act(t, 'attack'); v.heal = t => act(t, 'heal'); v.repair = t => act(t, 'repair');
      }
      if (o.type === 'observer') v.observeRoom = name => { // 官方：下一 tick 该房间可见；范围 OBSERVER_RANGE，每 tick 一次
        if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; const p = typeof name === 'string' && parseRoomName(name); if (!p || p[0] < 0 || p[1] < 0 || p[0] >= w.S || p[1] >= w.S) return ERR_INVALID_ARGS;
        const rx = Math.floor(o.x / ROOM), ry = Math.floor(o.y / ROOM); if (pwrFx(o, SC.PWR_OPERATE_OBSERVER, w.time) == null && Math.max(Math.abs(p[0] - rx), Math.abs(p[1] - ry)) > SC.OBSERVER_RANGE) return ERR_NOT_IN_RANGE; // PWR_OPERATE_OBSERVER：无限距离
        if (o._intentOnly) return OK; w.observe = w.observe || {}; const L = (w.observe[pid] = (w.observe[pid] || []).filter(x => x.t >= w.time - 1 && !(x.id === o.id && x.t === w.time))); L.push({ id: o.id, k: p[0] + ',' + p[1], t: w.time }); o.observing = name; return OK; };
      if (o.type === 'link') v.transferEnergy = (t, amount) => {
        if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; const r = raw(t);
        if (!r || r.type !== 'link' || r === o) return ERR_INVALID_TARGET; if (!sameRoom(r, o)) return ERR_NOT_IN_RANGE; if (o.cooldown > 0) return ERR_TIRED;
        amount = amount == null ? o.store.energy || 0 : amount; if (amount < 0) return ERR_INVALID_ARGS; if ((o.store.energy || 0) < amount || !amount) return ERR_NOT_ENOUGH_ENERGY; if (freeFor(w, r, 'energy') < amount) return ERR_FULL;
        if (o._intentOnly) return OK; o.store.energy -= amount; r.store.energy = (r.store.energy || 0) + amount - Math.ceil(amount * SC.LINK_LOSS_RATIO); o.cooldown = SC.LINK_COOLDOWN * dist(o, r); E.elog(o, SC.EVENT_TRANSFER, { targetId: r.id, resourceType: 'energy', amount }); ev.push({ t: 'transfer', fx: o.x, fy: o.y, x: r.x, y: r.y }); return OK; };
      const labMin = s => Object.keys(s.store || {}).find(k => k !== 'energy' && s.store[k] > 0);
      if (o.type === 'lab') {
        v.mineralType = labMin(o); v.mineralAmount = v.mineralType ? o.store[v.mineralType] : 0; v.mineralCapacity = SC.LAB_MINERAL_CAPACITY;
        const react = (a, b, rev) => {
          if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; if (o.cooldown > 0) return ERR_TIRED;
          const l1 = raw(a), l2 = raw(b); if (!l1 || !l2 || l1.type !== 'lab' || l2.type !== 'lab' || l1 === o || l2 === o) return ERR_INVALID_TARGET;
          if (!sameRoom(l1, o) || !sameRoom(l2, o) || dist(l1, o) > 2 || dist(l2, o) > 2) return ERR_NOT_IN_RANGE;
          const n = SC.LAB_REACTION_AMOUNT + (pwrFx(o, SC.PWR_OPERATE_LAB, w.time) || 0), m0 = labMin(o), m1 = labMin(l1), m2 = labMin(l2);
          if (!rev) {
            if (!m1 || !m2 || l1.store[m1] < n || l2.store[m2] < n) return ERR_NOT_ENOUGH_RESOURCES;
            const p = SC.REACTIONS[m1] && SC.REACTIONS[m1][m2]; if (!p) return ERR_INVALID_ARGS;
            if ((m0 && m0 !== p) || (o.store[p] || 0) + n > SC.LAB_MINERAL_CAPACITY) return ERR_FULL;
            if (o._intentOnly) return OK; l1.store[m1] -= n; l2.store[m2] -= n; o.store[p] = (o.store[p] || 0) + n; o.cooldown = SC.REACTION_TIME[p] || 0; return OK;
          }
          if (!m0 || o.store[m0] < n) return ERR_NOT_ENOUGH_RESOURCES;
          let pair = null; for (const r1 in SC.REACTIONS) for (const r2 in SC.REACTIONS[r1]) if (SC.REACTIONS[r1][r2] === m0 && !pair) pair = [r1, r2];
          if (!pair) return ERR_INVALID_ARGS;
          if ((m1 && m1 !== pair[0]) || (m2 && m2 !== pair[1]) || (l1.store[pair[0]] || 0) + n > SC.LAB_MINERAL_CAPACITY || (l2.store[pair[1]] || 0) + n > SC.LAB_MINERAL_CAPACITY) return ERR_FULL;
          if (o._intentOnly) return OK; o.store[m0] -= n; l1.store[pair[0]] = (l1.store[pair[0]] || 0) + n; l2.store[pair[1]] = (l2.store[pair[1]] || 0) + n; o.cooldown = SC.REACTION_TIME[m0] || 0; return OK;
        };
        v.runReaction = (a, b) => react(a, b, false); v.reverseReaction = (a, b) => react(a, b, true);
        v.boostCreep = (c, count) => {
          if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH; const r = raw(c); if (!r || r.kind !== 'creep' || r.spawning) return ERR_INVALID_TARGET;
          if (!sameRoom(r, o) || dist(r, o) > 1) return ERR_NOT_IN_RANGE; const m = labMin(o); if (!m) return ERR_NOT_ENOUGH_RESOURCES;
          const part = Object.keys(SC.BOOSTS).find(p => SC.BOOSTS[p][m]); if (!part) return ERR_NOT_FOUND;
          r.boosts = r.boosts || []; let idx = r.body.map((t, i) => i).filter(i => r.body[i] === part && !r.boosts[i]); if (!idx.length) return ERR_NOT_FOUND;
          if (count != null) idx = idx.slice(0, count);
          const can = Math.min(idx.length, Math.floor(o.store[m] / SC.LAB_BOOST_MINERAL), Math.floor((o.store.energy || 0) / SC.LAB_BOOST_ENERGY));
          if (can <= 0) return ERR_NOT_ENOUGH_RESOURCES;
          if (o._intentOnly) return OK; idx.slice(0, can).forEach(i => { r.boosts[i] = m; }); o.store[m] -= can * SC.LAB_BOOST_MINERAL; o.store.energy -= can * SC.LAB_BOOST_ENERGY; return OK;
        };
        v.unboostCreep = c => { // 官方顺序：目标→所有者→RCL→冷却→无强化→距离；返还 LAB_UNBOOST_MINERAL/ENERGY 每部件，冷却按总反应时间
          const r = raw(c); if (!r || r.kind !== 'creep') return ERR_INVALID_TARGET; if (o.owner !== pid || r.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH;
          if (o.cooldown > 0) return ERR_TIRED; if (!r.boosts || !r.boosts.some(Boolean)) return ERR_NOT_FOUND; if (!sameRoom(r, o) || dist(r, o) > 1) return ERR_NOT_IN_RANGE;
          if (o._intentOnly) return OK; const cnt = {}; r.boosts.forEach(m => { if (m) cnt[m] = (cnt[m] || 0) + 1; }); r.boosts = []; let cd = 0;
          for (const m in cnt) { const en = cnt[m] * (SC.LAB_UNBOOST_ENERGY || 0), mi = cnt[m] * SC.LAB_UNBOOST_MINERAL; if (en > 0) E.dropAt(r.x, r.y, 'energy', en); if (mi > 0) E.dropAt(r.x, r.y, m, mi);
            cd += cnt[m] * totalReactionTime(m) * SC.LAB_UNBOOST_MINERAL / SC.LAB_REACTION_AMOUNT; }
          if (cd > 0) o.cooldown = Math.round(cd); return OK;
        };
      }
      if (o.type === 'terminal') v.send = (res, amount, dest, description) => { // 官方 game/structures.js（调用校验）+ global-intents/market.js（tick 末执行）
        const rdist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
        const tcost = (amt, d) => { const c0 = Math.ceil(amt * (1 - Math.exp(-d / 30))), opT = pwrFx(o, SC.PWR_OPERATE_TERMINAL, w.time); return opT != null && opT !== true ? Math.ceil(c0 * opT) : c0; };
        const here = [Math.floor(o.x / ROOM), Math.floor(o.y / ROOM)];
        if (!o._flushing) {
          if (o.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(o)) return ERR_RCL_NOT_ENOUGH;
          if (typeof dest !== 'string' || !/^(W|E)\d+(N|S)\d+$/.test(dest)) return ERR_INVALID_ARGS;
          if (!RESOURCES.has(res)) return ERR_INVALID_ARGS;
          if (!o.store || !o.store[res] || o.store[res] < amount) return ERR_NOT_ENOUGH_RESOURCES;
          if (o.cooldown > 0) return ERR_TIRED;
          const p = parseRoomName(dest), cost = tcost(amount, p ? rdist(here, p) : 0);
          if (res !== 'energy' && (o.store.energy || 0) < cost || res === 'energy' && (o.store.energy || 0) < amount + cost) return ERR_NOT_ENOUGH_RESOURCES;
          if (description && (typeof description !== 'string' || description.length > 100)) return ERR_INVALID_ARGS;
          return OK; // 由 wrapStructIntents 登记 intent
        }
        // tick 末处理（processor/intents/terminal/send.js + global-intents/market.js）
        if (!RESOURCES.has(res) || !amount || !(o.store[res] >= amount) || o.cooldown > 0) return;
        const p = parseRoomName(dest); if (!p) return;
        const t = w.structures.find(s => s.type === 'terminal' && s.owner && Math.floor(s.x / ROOM) === p[0] && Math.floor(s.y / ROOM) === p[1]); if (!t) return; // 目标房间没有有主 terminal：什么都不发生
        let amt = Math.min(amount, Math.max(0, storeCap(w, t) - storeSum(t.store))); if (t === o) amt = Math.min(amt, amount); if (!(amt > 0)) return;
        const cost = tcost(amt, rdist(here, p));
        if (res !== 'energy' && (o.store.energy || 0) < cost || res === 'energy' && (o.store.energy || 0) < amt + cost) return;
        t.store[res] = (t.store[res] || 0) + amt; o.store[res] -= amt; o.store.energy -= cost;
        const opT = pwrFx(o, SC.PWR_OPERATE_TERMINAL, w.time); o.cooldown = opT != null && opT !== true ? Math.round(SC.TERMINAL_COOLDOWN * opT) : SC.TERMINAL_COOLDOWN;
        w.transactions = (w.transactions || []).slice(-99); w.transactions.push({ transactionId: 't' + (w.nextId++), time: w.time, sender: { username: w.players[o.owner]?.name }, recipient: { username: w.players[t.owner]?.name }, _s: o.owner, _r: t.owner, resourceType: res, amount: amt, from: roomName(o.x, o.y), to: dest, description: description ? String(description).replace(/</g, '&lt;') : undefined }); return OK; };
    },
    creep(v, o) {
      const mine = o.owner === pid, cap = boostPower(o, 'carry', 'capacity') * SC.CARRY_CAPACITY;
      Object.assign(v, { name: o.name, my: mine, owner: owner(o), body: o.body.map((t, i) => ({ type: t, hits: partHits(o, i), boost: o.boosts && o.boosts[i] || undefined })), fatigue: o.fatigue, hits: o.hits, hitsMax: o.body.length * 100,
        spawning: !!o.spawning, ticksToLive: o.spawning || o.noAge ? undefined : o.ttl, saying: o.say && w.time - o.sayT <= 1 && (mine || o.sayPublic) ? o.say : undefined, store: makeStore(o), carryCapacity: cap });
      v.carry = v.store;
      Object.defineProperty(v, 'memory', { get: () => { if (!mine) return undefined; mem.creeps = mem.creeps || {}; return (mem.creeps[o.name] = mem.creeps[o.name] || {}); }, set: x => { if (mine) { mem.creeps = mem.creeps || {}; mem.creeps[o.name] = x; } } });
      v.getActiveBodyparts = t => activeParts(o, t);
      const pre = (part) => { if (!mine) return ERR_NOT_OWNER; if (o.spawning) return ERR_BUSY; if (part && !activeParts(o, part)) return ERR_NO_BODYPART; return 0; };
      const used = () => storeSum(o.store);
      v.say = (msg, pub) => { if (!mine) return ERR_NOT_OWNER; if (o.spawning) return ERR_BUSY; if (o._intentOnly) return OK; o.say = String(msg).slice(0, 10); o.sayT = w.time; o.sayPublic = !!pub; return OK; };
      v.suicide = () => { const e = pre(); if (e) return e; if (o._intentOnly) return OK; E.killCreep(o, SC.CREEP_CORPSE_RATE); return OK; };
      v.notifyWhenAttacked = en => { const e = pre(); if (e) return e; if (typeof en !== 'boolean') return ERR_INVALID_ARGS; o.notifyAttacked = en; return OK; };
      v.cancelOrder = n => { if (!mine) return ERR_NOT_OWNER; if (n === 'move' && o._move) { delete o._move; o._path = null; return OK; } if (o._intents && o._intents[n]) { delete o._intents[n]; return OK; } return ERR_NOT_FOUND; }; // 官方 intents.remove
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
          const full = E.findPath(o, g, rng, o, Object.assign({ partial: true }, opts)), rk = roomKey(o.x, o.y), cut = full.findIndex(p => roomKey(p.x, p.y) !== rk);
          o._path = cut < 0 ? full : full.slice(0, cut); o._pt = { x: g.x, y: g.y }; o._pT = w.time; // 官方 room.findPath：路径截断在本房间
          if (!o._path.length) { if (!full.length) o._failT = w.time; return ERR_NO_PATH; } o._failT = 0;
        }
        const nx = o._path.shift(); o._move = { x: nx.x, y: nx.y };
        if (opts.visualizePathStyle) ev.push({ t: 'path', fx: o.x, fy: o.y, x: g.x, y: g.y });
        return OK;
      };
      const tgt = (t, r, kinds) => { const x = raw(t); if (!x || (kinds && !kinds.includes(x.kind === 'structure' ? 'structure' : x.kind))) return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > r) return ERR_NOT_IN_RANGE; if (o.kind === 'creep' && x !== o) o._face = { x: x.x, y: x.y, t: w.time }; return x; }; // 渲染：creep 朝向本 tick 动作目标（官方 creepActions 的 RotateTo）
      v.harvest = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || (x.kind !== 'source' && x.kind !== 'mineral')) return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 1) return ERR_NOT_IN_RANGE;
        const ctrl = ctrlOfRoom(w, roomKey(x.x, x.y)); if (ctrl && ((ctrl.owner && ctrl.owner !== pid) || (ctrl.reservation && ctrl.reservation.owner !== pid))) return ERR_NOT_OWNER;
        if (x.kind === 'source') { if (!x.energy) return ERR_NOT_ENOUGH_RESOURCES; if (o._intentOnly) return OK; const a = Math.min(x.energy, boostPower(o, 'work', 'harvest') * SC.HARVEST_POWER); x.energy -= a; o.store.energy = (o.store.energy || 0) + a; o._ha = a; x.invaderHarvested = (x.invaderHarvested || 0) + a; /* 官方 harvest.js：累计 invaderHarvested，供 Invader 入侵判定 */ }
        else { const ex = w.structures.find(s => s.type === 'extractor' && s.x === x.x && s.y === x.y); if (!ex) return ERR_NOT_FOUND; if (ex.owner !== pid) return ERR_NOT_OWNER; if (!E.isActive(ex)) return ERR_RCL_NOT_ENOUGH; if (ex.cooldown > 0) return ERR_TIRED; if (!x.amount) return ERR_NOT_ENOUGH_RESOURCES; if (o._intentOnly) return OK;
          const a = Math.min(x.amount, boostPower(o, 'work', 'harvest') * SC.HARVEST_MINERAL_POWER); x.amount -= a; o.store[x.type] = (o.store[x.type] || 0) + a; o._ha = a; ex.cooldown = SC.EXTRACTOR_COOLDOWN; }
        const over = used() - cap; if (over > 0) { const r = x.kind === 'source' ? 'energy' : x.type; o.store[r] -= over; E.dropAt(o.x, o.y, r, over); } // 官方：溢出掉在地上
        E.elog(o, SC.EVENT_HARVEST, { targetId: x.id, amount: o._ha }); ev.push({ t: 'harvest', fx: x.x, fy: x.y, x: o.x, y: o.y }); return OK;
      };
      v.transfer = (t, res, amount) => {
        const e = pre(); if (e) return e; if (!RESOURCES.has(res)) return ERR_INVALID_ARGS; const x = tgt(t, 1); if (typeof x === 'number') return x;
        if (!hasStore(x) || x.kind === 'tombstone' || x.kind === 'ruin' || x === o) return ERR_INVALID_TARGET; if (x.kind === 'creep' && x.spawning) return ERR_INVALID_TARGET;
        const have = o.store[res] || 0; if (amount != null && amount < 0) return ERR_INVALID_ARGS; if (!have || (amount != null && have < amount)) return ERR_NOT_ENOUGH_RESOURCES;
        const free = freeFor(w, x, res); if (free == null) return ERR_INVALID_TARGET; if (free <= 0) return ERR_FULL;
        if (amount != null && amount > free) return ERR_FULL; if (x.kind === 'controller') return ERR_INVALID_TARGET; if (o._intentOnly) return OK; const a = Math.min(amount ?? have, free);
        o.store[res] -= a; x.store[res] = (x.store[res] || 0) + a; E.elog(o, SC.EVENT_TRANSFER, { targetId: x.id, resourceType: res, amount: a });
        ev.push({ t: 'transfer', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK;
      };
      v.withdraw = (t, res, amount) => {
        const e = pre(); if (e) return e; if (!RESOURCES.has(res)) return ERR_INVALID_ARGS; const x = tgt(t, 1); if (typeof x === 'number') return x;
        if (x.type === 'terminal' && pwrFx(x, SC.PWR_DISRUPT_TERMINAL, w.time) != null) return ERR_INVALID_TARGET; // PWR_DISRUPT_TERMINAL
        if (!hasStore(x) || x.kind === 'creep' || x.kind === 'spawn' && false) return ERR_INVALID_TARGET;
        if (x.owner && x.owner !== pid && x.kind !== 'tombstone' && x.kind !== 'ruin') return ERR_NOT_OWNER;
        if (x.kind === 'structure' && w.structures.some(s => s.type === 'rampart' && s.x === x.x && s.y === x.y && s.owner !== pid && !s.isPublic)) return ERR_NOT_OWNER;
        const have = x.store[res] || 0; if (amount != null && amount < 0) return ERR_INVALID_ARGS; if (!have || (amount != null && have < amount)) return ERR_NOT_ENOUGH_RESOURCES;
        const free = cap - used(); if (free <= 0 || (amount != null && amount > free)) return ERR_FULL; if (o._intentOnly) return OK; const a = Math.min(amount ?? have, free);
        x.store[res] -= a; o.store[res] = (o.store[res] || 0) + a; E.elog(x, SC.EVENT_TRANSFER, { targetId: o.id, resourceType: res, amount: a }); ev.push({ t: 'transfer', fx: x.x, fy: x.y, x: o.x, y: o.y }); return OK;
      };
      v.pickup = t => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['resource']); if (typeof x === 'number') return x; const free = cap - used(); if (free <= 0) return ERR_FULL; if (o._intentOnly) return OK;
        const a = Math.min(free, x.amount); x.amount -= a; o.store[x.resourceType] = (o.store[x.resourceType] || 0) + a; if (x.amount <= 0) w.resources.splice(w.resources.indexOf(x), 1); return OK; };
      v.drop = (res, amount) => { const e = pre(); if (e) return e; if (!RESOURCES.has(res)) return ERR_INVALID_ARGS; if (amount != null && !(amount > 0)) return ERR_INVALID_ARGS; const have = o.store[res] || 0; if (!have || (amount != null && amount > have)) return ERR_NOT_ENOUGH_RESOURCES;
        if (o._intentOnly) return OK; const a = amount ?? have; o.store[res] -= a; E.dropAt(o.x, o.y, res, a); return OK; };
      v.build = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.kind !== 'site') return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 3) return ERR_NOT_IN_RANGE;
        if (x.owner !== pid) return ERR_NOT_OWNER; if (!(o.store.energy > 0)) return ERR_NOT_ENOUGH_ENERGY;
        if (OBSTACLES.has(x.type) && w.creeps.some(c => !c.spawning && c.x === x.x && c.y === x.y)) return ERR_INVALID_TARGET;
        // 官方：能量按未强化建造量扣除，进度按强化后增加
        const base = Math.min(activeParts(o, 'work') * SC.BUILD_POWER, o.store.energy, x.total - x.progress);
        if (!base) return ERR_NOT_ENOUGH_ENERGY;
        if (o._intentOnly) return OK;
        const boosted = Math.min(Math.floor(base + boostExtra(o, 'work', 'build', base)), x.total - x.progress);
        x.progress += boosted; o.store.energy -= base; E.elog(o, SC.EVENT_BUILD, { targetId: x.id, amount: boosted, energySpent: base, structureType: x.type, x: x.x % ROOM, y: x.y % ROOM, incomplete: x.progress < x.total });
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
        // 官方：能量按未强化修复量 * REPAIR_COST 扣除，hits 按强化后增加
        const base = Math.min(activeParts(o, 'work') * SC.REPAIR_POWER, Math.floor(o.store.energy / SC.REPAIR_COST), x.hitsMax - x.hits);
        if (!base) return ERR_NOT_ENOUGH_ENERGY;
        if (o._intentOnly) return OK;
        const boosted = Math.min(Math.floor(base + boostExtra(o, 'work', 'repair', base)), x.hitsMax - x.hits);
        o.store.energy -= Math.ceil(base * SC.REPAIR_COST); x.hits += boosted; E.elog(o, SC.EVENT_REPAIR, { targetId: x.id, amount: boosted, energySpent: Math.ceil(base * SC.REPAIR_COST) }); ev.push({ t: 'repair', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK;
      };
      v.dismantle = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.kind !== 'structure' && x.kind !== 'spawn' || x.hits == null) return ERR_INVALID_TARGET; if (!sameRoom(x, o) || dist(x, o) > 1) return ERR_NOT_IN_RANGE;
        const ctrl = ctrlOfRoom(w, roomKey(x.x, x.y)); if (ctrl && ctrl.safeMode > w.time && ctrl.owner !== pid) return ERR_NO_BODYPART;
        if ((x.effects || []).some(f => (f.power === SC.PWR_FORTIFY || f.effect === SC.EFFECT_INVULNERABILITY) && f.endTime > w.time)) return ERR_INVALID_TARGET;
        if (o._intentOnly) return OK;
        if ((x.effects || []).some(f => (f.power === SC.PWR_SHIELD || f.power === SC.PWR_FORTIFY || f.effect === SC.EFFECT_INVULNERABILITY) && f.endTime >= w.time)) return OK; // processor dismantle.js
        const a = Math.min(boostPower(o, 'work', 'dismantle') * SC.DISMANTLE_POWER, x.hits), back = Math.floor(a * SC.DISMANTLE_COST);
        if (back) { o.store.energy = (o.store.energy || 0) + back; const over = used() - cap; if (over > 0) { o.store.energy -= over; E.dropAt(o.x, o.y, 'energy', over); } }
        E.elog(o, SC.EVENT_ATTACK, { targetId: x.id, damage: a, attackType: SC.EVENT_ATTACK_TYPE_DISMANTLE }); E.damage(x, a, pid); return OK;
      };
      v.upgradeController = t => {
        const e = pre('work'); if (e) return e; const x = raw(t); if (!x || x.kind !== 'controller') return ERR_INVALID_TARGET; if (x.owner !== pid || !x.level) return ERR_NOT_OWNER;
        if (!sameRoom(x, o) || dist(x, o) > 3) return ERR_NOT_IN_RANGE; if (!(o.store.energy > 0)) return ERR_NOT_ENOUGH_RESOURCES; if (x.upgradeBlocked > w.time) return ERR_INVALID_TARGET;
        x._upTick = x._upTick === w.time ? w.time : (x._upCnt = 0, w.time);
        // 官方：能量与 RCL8 上限按未强化量；GCL/progress 按强化后
        let base = Math.min(activeParts(o, 'work') * SC.UPGRADE_CONTROLLER_POWER, o.store.energy);
        if (x.level === 8) { const lim = SC.CONTROLLER_MAX_UPGRADE_PER_TICK + (pwrFx(x, SC.PWR_OPERATE_CONTROLLER, w.time, true) || 0); base = Math.min(base, lim - x._upCnt); if (base <= 0) return OK; } // PWR_OPERATE_CONTROLLER
        if (o._intentOnly) return OK;
        const eff = Math.floor(base + boostExtra(o, 'work', 'upgradeController', base));
        x._upCnt += base; o.store.energy -= base; x._upgraded = 1; E.elog(o, SC.EVENT_UPGRADE_CONTROLLER, { amount: eff, energySpent: base }); w.players[pid].gcl = (w.players[pid].gcl || 0) + eff;
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
        if (w.controllers.filter(c => c.owner === pid).length >= SC.GCL_NOVICE && E.isNovice(o)) return ERR_FULL; // 官方：新手区最多 GCL_NOVICE 个房间
        if (o._intentOnly) return OK;
        Object.assign(x, { owner: pid, level: 1, progress: 0, downgradeTime: null, reservation: null, safeModeAvailable: 0 }); const rm = w.rooms[roomKey(x.x, x.y)]; if (!rm.owner) rm.owner = pid; return OK;
      };
      v.reserveController = t => {
        const e = pre('claim'); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x;
        if (x.owner || (x.reservation && x.reservation.owner !== pid)) return ERR_INVALID_TARGET;
        const end = x.reservation ? x.reservation.endTime : w.time + 1, add = activeParts(o, 'claim') * SC.CONTROLLER_RESERVE;
        if (end - w.time + add > SC.CONTROLLER_RESERVE_MAX) return ERR_FULL; if (o._intentOnly) return OK; x.reservation = { owner: pid, endTime: end + add }; E.elog(o, SC.EVENT_RESERVE_CONTROLLER, { amount: add }); return OK;
      };
      v.attackController = t => {
        const e = pre('claim'); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x;
        if (!x.owner && !x.reservation) return ERR_INVALID_TARGET; if (x.owner === pid || (x.reservation && x.reservation.owner === pid)) return ERR_INVALID_TARGET; if (x.upgradeBlocked > w.time) return ERR_TIRED; if ((x.effects || []).some(f => f.effect === SC.EFFECT_INVULNERABILITY && f.endTime > w.time)) return ERR_INVALID_TARGET;
        if (o._intentOnly) return OK;
        const n = activeParts(o, 'claim'); E.elog(o, SC.EVENT_ATTACK_CONTROLLER, {});
        if (x.reservation) { x.reservation.endTime -= n * SC.CONTROLLER_RESERVE; } else { x.downgradeTime -= n * SC.CONTROLLER_CLAIM_DOWNGRADE; x.upgradeBlocked = w.time + SC.CONTROLLER_ATTACK_BLOCKED_UPGRADE; }
        return OK;
      };
      v.signController = (t, text) => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x; if (o._intentOnly) return OK; x.sign = text ? { username: w.players[pid].name, text: String(text).slice(0, 100), time: w.time, datetime: Date.now() } : null; return OK; };
      v.generateSafeMode = t => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['controller']); if (typeof x === 'number') return x; if ((o.store.G || 0) < SC.SAFE_MODE_COST) return ERR_NOT_ENOUGH_RESOURCES; if (o._intentOnly) return OK; o.store.G -= SC.SAFE_MODE_COST; x.safeModeAvailable++; return OK; };
      const hostileOk = x => x.kind === 'creep' ? x.owner !== pid || true : true;
      const fortified = x => (x.effects || []).some(f => (f.power === SC.PWR_FORTIFY || f.effect === SC.EFFECT_INVULNERABILITY) && f.endTime > w.time); // 官方 game/creeps.js：attack/rangedAttack/dismantle 对 FORTIFY 目标 ERR_INVALID_TARGET
      v.attack = t => { const e = pre('attack'); if (e) return e; const x = tgt(t, 1, ['creep', 'structure', 'spawn']); if (typeof x === 'number') return x; if (!hostileOk(x) || x.hits == null || fortified(x)) return ERR_INVALID_TARGET;
        if (o._intentOnly) return OK;
        { const dm = boostPower(o, 'attack', 'attack') * SC.ATTACK_POWER; E.elog(o, SC.EVENT_ATTACK, { targetId: x.id, damage: dm, attackType: SC.EVENT_ATTACK_TYPE_MELEE }); E.damage(x, dm, pid); }
        if (x.kind === 'creep' && activeParts(x, 'attack') && !w.structures.some(s => s.type === 'rampart' && s.x === o.x && s.y === o.y) && !(() => { const rc = ctrlOfRoom(w, roomKey(o.x, o.y)); return rc && rc.owner === pid && rc.safeMode > w.time; })()) { const hb = boostPower(x, 'attack', 'attack') * SC.ATTACK_POWER; E.elog(x, SC.EVENT_ATTACK, { targetId: o.id, damage: hb, attackType: SC.EVENT_ATTACK_TYPE_HIT_BACK }); E.damage(o, hb, x.owner); } ev.push({ t: 'attack', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.rangedAttack = t => { const e = pre('ranged_attack'); if (e) return e; const x = tgt(t, 3, ['creep', 'structure', 'spawn']); if (typeof x === 'number') return x; if (x.hits == null || fortified(x)) return ERR_INVALID_TARGET;
        if (o._intentOnly) return OK;
        { const dm = boostPower(o, 'ranged_attack', 'rangedAttack') * SC.RANGED_ATTACK_POWER; E.elog(o, SC.EVENT_ATTACK, { targetId: x.id, damage: dm, attackType: SC.EVENT_ATTACK_TYPE_RANGED }); E.damage(x, dm, pid); } ev.push({ t: 'attack', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.rangedMassAttack = () => { const e = pre('ranged_attack'); if (e) return e; if (o._intentOnly) return OK; const n = boostPower(o, 'ranged_attack', 'rangedMassAttack') * SC.RANGED_ATTACK_POWER;
        for (const x of w.creeps.filter(c => !c.spawning && c.owner !== pid && sameRoom(c, o) && dist(c, o) <= 3).concat(w.structures.concat(w.spawns).filter(s => (s.owner || s.type === 'powerBank') && s.owner !== pid && sameRoom(s, o) && dist(s, o) <= 3))) { if (x.type !== 'rampart' && w.structures.some(r => r.type === 'rampart' && r.x === x.x && r.y === x.y)) continue; if (!x.hits) continue; if ((x.effects || []).some(f => f.endTime >= w.time && (f.power === SC.PWR_FORTIFY || f.effect === SC.EFFECT_INVULNERABILITY))) continue; /* 官方 rangedMassAttack.js */ const dm = Math.round(n * ({ 0: 1, 1: 1, 2: 0.4, 3: 0.1 })[dist(x, o)]); E.elog(o, SC.EVENT_ATTACK, { targetId: x.id, damage: dm, attackType: SC.EVENT_ATTACK_TYPE_RANGED_MASS }); E.damage(x, dm, pid); }
        return OK; };
      v.heal = t => { const e = pre('heal'); if (e) return e; const x = tgt(t, 1, ['creep']); if (typeof x === 'number') return x; if (o._intentOnly) return OK; { const hv = boostPower(o, 'heal', 'heal') * SC.HEAL_POWER; E.elog(o, SC.EVENT_HEAL, { targetId: x.id, amount: hv, healType: SC.EVENT_HEAL_TYPE_MELEE }); x._heal = (x._heal || 0) + hv; /* 官方 _healToApply：tick 末结算 */ } ev.push({ t: 'heal', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.rangedHeal = t => { const e = pre('heal'); if (e) return e; const x = tgt(t, 3, ['creep']); if (typeof x === 'number') return x; if (o._intentOnly) return OK; { const hv = boostPower(o, 'heal', 'rangedHeal') * SC.RANGED_HEAL_POWER; E.elog(o, SC.EVENT_HEAL, { targetId: x.id, amount: hv, healType: SC.EVENT_HEAL_TYPE_RANGED }); x._heal = (x._heal || 0) + hv; /* 官方 _healToApply：tick 末结算 */ } ev.push({ t: 'heal', fx: o.x, fy: o.y, x: x.x, y: x.y }); return OK; };
      v.pull = t => { const e = pre(); if (e) return e; const x = tgt(t, 1, ['creep']); if (typeof x === 'number') return x; if (x === o) return ERR_INVALID_TARGET; if (o._intentOnly) return OK; o._pulling = x; return OK; };
      // 官方同时动作：调用时只校验并登记 intent，tick 末按优先级结算（engine/src/processor/intents/creeps/intents.js）
      // priorities[name] 列出会挡住 name 的更高优先级动作；同一方法每 tick 只保留最后一次成功登记
      const BLOCKED_BY = {
        rangedHeal: ['heal'], attackController: ['rangedHeal', 'heal'], dismantle: ['attackController', 'rangedHeal', 'heal'],
        repair: ['dismantle', 'attackController', 'rangedHeal', 'heal'], build: ['repair', 'dismantle', 'attackController', 'rangedHeal', 'heal'],
        attack: ['build', 'repair', 'dismantle', 'attackController', 'rangedHeal', 'heal'],
        harvest: ['attack', 'build', 'repair', 'dismantle', 'attackController', 'rangedHeal', 'heal'],
        rangedMassAttack: ['build', 'repair', 'rangedHeal'], rangedAttack: ['rangedMassAttack', 'build', 'repair', 'rangedHeal']
      };
      // 官方 creepActions 顺序（move 由全局 movement 统一结算）
      const INTENT_ORDER = ['drop', 'transfer', 'withdraw', 'pickup', 'heal', 'rangedHeal', 'dismantle', 'attack', 'harvest', 'repair', 'build', 'rangedMassAttack', 'rangedAttack', 'say', 'suicide', 'claimController', 'upgradeController', 'reserveController', 'attackController', 'generateSafeMode', 'signController', 'pull'];
      for (const m of INTENT_ORDER) {
        const f = v[m]; if (typeof f !== 'function') continue;
        v[m] = (...a) => {
          if (!mine || o.spawning || o._flushing) return f(...a);
          o._intentOnly = true; let r; try { r = f(...a); } finally { o._intentOnly = false; }
          if (r === OK) { o._intents = o._intents || {}; o._intents[m] = a; }
          return r;
        };
      }
      o._flushIntents = v._flushIntents = () => {
        if (!o._intents) return;
        const intents = o._intents; o._intents = {}; o._flushing = true;
        try {
          for (const m of INTENT_ORDER) {
            if (!intents[m]) continue; if (!w.creeps.includes(o)) break; // suicide 之后不再结算
            const block = BLOCKED_BY[m];
            if (block && block.some(k => intents[k])) continue; // 官方：被更高优先级挡住则跳过
            const f = v[m]; if (typeof f === 'function') f.apply(v, intents[m]);
          }
        } finally { o._flushing = false; }
      };
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
    const R = Object.create(CLS.Room.prototype); Object.assign(R, { name: rm.name, energyAvailable: en.avail, energyCapacityAvailable: en.cap, visual: noopVisual });
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
  for (const k of visibleRooms(w, pid)) vis.add(k);
  for (const c of w.creeps) if (c.owner === pid) { creeps[c.name] = wrap(c); }
  for (const s of w.spawns) if (s.owner === pid) { spawns[s.name] = wrap(s); structures[s.id] = spawns[s.name]; }
  for (const s of w.structures) if (s.owner === pid) { structures[s.id] = wrap(s); }
  for (const c of w.controllers) if (c.owner === pid) structures[c.id] = wrap(c);
  for (const s of w.sites) if (s.owner === pid) sites[s.id] = wrap(s);
  for (const f of w.flags) if (f.owner === pid) flags[f.name] = wrap(f);
  const gameRooms = {}; for (const k of vis) { const r = room(k); if (r) gameRooms[r.name] = r; }
  const gclLv = E.gclLevel(pid), gclP = w.players[pid].gcl || 0, t0 = Date.now();
  const Game = {
    time: w.time, creeps, spawns, structures, constructionSites: sites, flags, rooms: gameRooms, powerCreeps: {}, resources: { pixel: (w.players[pid] && w.players[pid].pixels) || 0 },
    shard: { name: 'shard0', type: 'normal', ptr: false },
    gcl: { level: gclLv, progress: gclP - (gclLv > 1 ? Math.pow(gclLv - 1, SC.GCL_POW) * SC.GCL_MULTIPLY : 0), progressTotal: Math.pow(gclLv, SC.GCL_POW) * SC.GCL_MULTIPLY - (gclLv > 1 ? Math.pow(gclLv - 1, SC.GCL_POW) * SC.GCL_MULTIPLY : 0) },
    gpl: { level: 0, progress: 0, progressTotal: SC.POWER_LEVEL_MULTIPLY },
    cpu: { limit: 20, tickLimit: Math.min(500, (w.players[pid] && w.players[pid].bucket != null ? w.players[pid].bucket : 10000)), bucket: (w.players[pid] && w.players[pid].bucket != null ? w.players[pid].bucket : 10000), shardLimits: { shard0: 20 }, unlocked: true, unlockedTime: undefined, getUsed: () => Date.now() - t0, getHeapStatistics: () => ({}), halt: () => { throw new Error('Game.cpu.halt'); }, setShardLimits: () => ERR_BUSY, unlock: () => ERR_FULL, generatePixel: () => { const P = w.players[pid]; if (!P || (P.bucket != null ? P.bucket : 10000) < SC.PIXEL_CPU_COST) return ERR_NOT_ENOUGH_RESOURCES; P.bucket -= SC.PIXEL_CPU_COST; P.pixels = (P.pixels || 0) + 1; return OK; } },
    market: { credits: 0, get incomingTransactions() { return (w.transactions || []).filter(t => t._r === pid).reverse(); }, get outgoingTransactions() { return (w.transactions || []).filter(t => t._s === pid).reverse(); }, orders: {}, calcTransactionCost: (amount, a, b) => Math.ceil(amount * (1 - Math.exp(-Game.map.getRoomLinearDistance(a, b, true) / 30))), getAllOrders: () => [], getHistory: () => [], getOrderById: () => null, cancelOrder: () => ERR_INVALID_ARGS, changeOrderPrice: () => ERR_INVALID_ARGS, createOrder: () => ERR_NOT_ENOUGH_RESOURCES, deal: () => ERR_NOT_ENOUGH_RESOURCES, extendOrder: () => ERR_INVALID_ARGS },
    getObjectById: id => { for (const L of [w.creeps, w.spawns, w.structures, w.controllers, w.sources, w.minerals, w.sites, w.resources, w.tombstones, w.ruins || [], w.nukes || [], w.flags]) { const o = L.find(o => o.id === id); if (o) return (vis.has(roomKey(o.x, o.y)) || (L === w.sites && o.owner === pid)) ? wrap(o) : null; } return null; },
    notify: (msg, g) => { const P = w.players[pid]; if (P._ntT !== w.time) { P._ntT = w.time; P._nt = 0; } if (P._nt >= 20) return ERR_FULL; P._nt++; if (E.notify) E.notify(pid, String(msg).slice(0, 1000)); else E.log(pid, '[notify]', String(msg).slice(0, 1000)); return OK; }, // 官方：每 tick 最多 20 条，消息 1000 字符
    map: {
      describeExits: n => { const p = parseRoomName(n); if (p) ensureRoom(w, p[0], p[1]); if (!p || !w.rooms[p[0] + ',' + p[1]]) return null; const out = {}; const t = w.rooms[p[0] + ',' + p[1]].tiles, open = (f) => { for (let i = 0; i < 50; i++) if (f(i) !== T_WALL) return true; return false; };
        if (open(i => t[i])) out[SC.TOP] = roomNameXY(p[0], p[1] - 1); if (open(i => t[i * 50 + 49])) out[SC.RIGHT] = roomNameXY(p[0] + 1, p[1]); if (open(i => t[49 * 50 + i])) out[SC.BOTTOM] = roomNameXY(p[0], p[1] + 1); if (open(i => t[i * 50])) out[SC.LEFT] = roomNameXY(p[0] - 1, p[1]); return out; },
      findRoute: (from, to, opts = {}) => { from = typeof from === 'string' ? from : from.name; to = typeof to === 'string' ? to : to.name; if (from === to) return [];
        const prev = { [from]: null }, q = [from]; while (q.length) { const n = q.shift(); if (n === to) break; const ex = Game.map.describeExits(n) || {}; for (const d in ex) { const m = ex[d]; if (m in prev) continue; if (opts.routeCallback && opts.routeCallback(m, n) === Infinity) continue; prev[m] = { n, exit: +d }; q.push(m); } }
        if (!(to in prev)) return ERR_NO_PATH; const out = []; for (let n = to; prev[n]; n = prev[n].n) out.unshift({ exit: prev[n].exit, room: n }); return out; },
      findExit: (from, to, opts) => { const r = Game.map.findRoute(from, to, opts); return Array.isArray(r) ? (r.length ? r[0].exit : ERR_INVALID_ARGS) : r; },
      getRoomLinearDistance: (a, b, cont) => { const p = parseRoomName(a), q = parseRoomName(b); if (!p || !q) return Infinity; let dx = Math.abs(q[0] - p[0]), dy = Math.abs(q[1] - p[1]); if (cont) { const ws = w.S; dx = Math.min(ws - dx, dx); dy = Math.min(ws - dy, dy); } return Math.max(dx, dy); }, // 官方 game/map.js：continuous 时按 worldSize 环绕取较短距离
      getRoomTerrain: n => new RoomTerrain(n), getTerrainAt: (a, b, n) => { const pos = typeof a === 'number' ? { x: a, y: b, roomName: n } : a; return ['plain', 'wall', 'swamp'][[0, 1, 2][[0, 1, 2].indexOf(new RoomTerrain(pos.roomName).get(pos.x, pos.y))] ?? 0] || 'plain'; },
      getWorldSize: () => w.S, getRoomStatus: n => { const p = parseRoomName(n); if (!(p && p[0] >= 0 && p[1] >= 0 && p[0] < w.S && p[1] < w.S)) return undefined; const z = E.zoneOf(p[0], p[1]); return z ? { status: z.status, timestamp: Date.now() + (z.until - w.time) * 1000 } : { status: 'normal', timestamp: null }; },
      isRoomAvailable: n => !!Game.map.getRoomStatus(n), visual: noopVisual,
    },
    createConstructionSite(x, y, type, name) { // 兼容 v1.2 积木（非官方）：坐标按第一个 Spawn 所在房间解释
      const sp = w.spawns.find(s => s.owner === pid); if (!sp) return ERR_INVALID_TARGET; return createSite(Math.floor(sp.x / ROOM) * ROOM + x, Math.floor(sp.y / ROOM) * ROOM + y, type, name);
    },
  };
  Game.map.getTerrainAt = (a, b, n) => { const pos = typeof a === 'number' ? { x: a, y: b, roomName: n } : a; const v = new RoomTerrain(pos.roomName).get(pos.x, pos.y); return v & SC.TERRAIN_MASK_WALL ? 'wall' : v & SC.TERRAIN_MASK_SWAMP ? 'swamp' : 'plain'; };
  const P_ = w.players[pid] || {}, segStore = (w.segments = w.segments || {})[pid] = (w.segments[pid] || {}), segsNow = {}; for (const id of P_.activeSegs || []) segsNow[id] = segStore[id] || '';
  // 官方 driver/lib/runtime/runtime.js 的 RawMemory：段 / 公共段 / 外部段；set 仅接受 ≤2MB 字符串
  const segId = v => { const id = parseInt(v); if (Number.isNaN(id) || id > 99 || id < 0) throw new Error(`"${v}" is not a valid segment ID`); return id; };
  const foreign = (() => { const F = P_.foreignSeg; if (!F) return undefined; const tp = Object.keys(w.players).find(k => w.players[k].name === F.username); if (!tp) return undefined; const T = w.players[tp], id = F.id != null ? F.id : T.defaultPublicSeg;
    if (id == null || !(T.publicSegs || []).includes(id)) return undefined; return { username: F.username, id, data: ((w.segments || {})[tp] || {})[id] || '' }; })();
  const RawMemory = { segments: segsNow, foreignSegment: foreign, interShardSegment: '', _rawSet: null,
    get: () => (RawMemory._rawSet != null ? RawMemory._rawSet : (w.rawMemory && w.rawMemory[pid] != null ? w.rawMemory[pid] : JSON.stringify(mem))),
    set: v => { if (typeof v !== 'string') throw new Error('Raw memory value is not a string'); if (v.length > 2 * 1024 * 1024) throw new Error('Raw memory length exceeded 2 MB limit'); RawMemory._rawSet = v; },
    setActiveSegments: ids => { if (!Array.isArray(ids)) throw new Error(`"${ids}" is not an array`); if (ids.length > 10) throw new Error('Only 10 memory segments can be active at the same time'); const L = ids.map(segId); if (w.players[pid]) w.players[pid].activeSegs = L; },
    setPublicSegments: ids => { if (!Array.isArray(ids)) throw new Error(`"${ids}" is not an array`); const L = ids.map(segId); if (w.players[pid]) w.players[pid].publicSegs = L; },
    setDefaultPublicSegment: id => { const v = id === null ? null : segId(id); if (w.players[pid]) w.players[pid].defaultPublicSeg = v; },
    setActiveForeignSegment: (username, id) => { if (!w.players[pid]) return; if (username === null) { w.players[pid].foreignSeg = null; return; } w.players[pid].foreignSeg = { username, id: id !== undefined ? segId(id) : undefined }; } };
  const Room = CLS.Room; Room.Terrain = RoomTerrain;
  Room.serializePath = path => { // 官方：两位 x + 两位 y + 方向数字串
    if (!Array.isArray(path)) throw new Error('path is not an array');
    if (!path.length) return '';
    let result = (path[0].x < 10 ? '0' : '') + path[0].x + (path[0].y < 10 ? '0' : '') + path[0].y;
    result += String(path[0].direction || 5);
    for (let i = 1; i < path.length; i++) {
      const d = path[i].direction || dirOf(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) || 5;
      result += String(d);
    }
    return result;
  };
  Room.deserializePath = path => {
    path = String(path || ''); const result = []; if (path.length < 5) return result;
    let x = parseInt(path.substring(0, 2), 10), y = parseInt(path.substring(2, 4), 10);
    for (let i = 4; i < path.length; i++) {
      const direction = parseInt(path.charAt(i), 10), d = DIRS[direction] || [0, 0];
      if (i !== 4) { x += d[0]; y += d[1]; }
      result.push({ x, y, dx: d[0], dy: d[1], direction });
    }
    return result;
  };
  const PathFinder = { search(origin, goal, opts = {}) { // 官方 PathFinder.search：plainCost 1 / swampCost 5；flee / maxRooms / heuristicWeight / maxCost
      const o = gpos(origin), goals = (Array.isArray(goal) ? goal : [goal]).map(g => ({ g: gpos(g && g.pos || g) || gpos(g), r: (g && g.range) || 0 })).filter(x => x.g);
      if (!o || !goals.length) return { path: [], ops: 0, cost: 0, incomplete: true };
      const maxRooms = Math.min(64, Math.max(1, opts.maxRooms || 16)), hw = opts.heuristicWeight == null ? 1.2 : opts.heuristicWeight, maxCost = opts.maxCost == null ? Infinity : opts.maxCost;
      const fo = { ignoreCreeps: true, ignoreRoads: true, plainCost: opts.plainCost || 1, swampCost: opts.swampCost || 5, maxOps: opts.maxOps || 2000, partial: true, heuristicWeight: hw, maxCost, maxRooms, flee: !!opts.flee, fleeGoals: goals };
      if (opts.roomCallback) fo._cm = (rx, ry) => { const orx = (o.x / ROOM) | 0, ory = (o.y / ROOM) | 0; if (Math.max(Math.abs(rx - orx), Math.abs(ry - ory)) >= maxRooms) return false; const m = opts.roomCallback(roomNameXY(rx, ry)); return m === false ? false : (m && m.get ? m : null); };
      else fo._cm = (rx, ry) => { const orx = (o.x / ROOM) | 0, ory = (o.y / ROOM) | 0; return Math.max(Math.abs(rx - orx), Math.abs(ry - ory)) >= maxRooms ? false : null; };
      if (opts.flee) {
        const p = E.findPath(o, goals.map(g => g.g), goals[0].r, undefined, fo);
        return { path: p.map(q => new RoomPosition(q.x % ROOM, q.y % ROOM, roomName(q.x, q.y))), ops: E._lastOps || 0, cost: p.length ? E._lastCost : 0, incomplete: !!E._lastIncomplete };
      }
      let best = null, meta = null; for (const { g, r } of goals) { const p = E.findPath(o, g, r, undefined, fo); const m = { ops: E._lastOps || 0, cost: p.length ? E._lastCost : 0, inc: !p.length && dist(o, g) > r ? true : !!E._lastIncomplete };
        if (!best || (!m.inc && meta.inc) || (m.inc === meta.inc && m.cost < meta.cost)) { best = p; meta = m; } }
      return { path: best.map(p => new RoomPosition(p.x % ROOM, p.y % ROOM, roomName(p.x, p.y))), ops: meta.ops, cost: meta.cost, incomplete: meta.inc }; },
    CostMatrix: class CostMatrix { constructor() { this._bits = new Uint8Array(2500); } set(x, y, v) { this._bits[y * 50 + x] = v; } get(x, y) { return this._bits[y * 50 + x]; } clone() { const c = new PathFinder.CostMatrix(); c._bits.set(this._bits); return c; } serialize() { return Array.from(this._bits); } static deserialize(d) { const c = new PathFinder.CostMatrix(); c._bits.set(d); return c; } },
    use: () => undefined };
  CLS._game = Game;
  const log = (...a) => E.log(pid, ...a), api = { Game, Memory: mem, RawMemory, RoomPosition, Room, PathFinder, _cls: CLS, _toClass: (v, n, drop) => toClass(CLS, v, n, drop), log };
  // 脚本全局一览（实际运行时由 compileUser 注入：require/module 为每个模块各自的 CommonJS 对象）
  for (const k of CLASS_NAMES) api[k] = CLS[k];
  Object.assign(api, { _: typeof __lodash !== 'undefined' ? __lodash : undefined, console: { log }, module: { exports: {} } });
  api.require = n => { if (n === 'lodash') return api._; throw new Error(`Unknown module '${n}'`); };
  return api;
}

// 官方原型类（engine/src/game/*.js）：作为用户脚本全局，支持 instanceof 与原型扩展；每次全局重置（重新编译/halt）重建
const CLASS_TREE = { RoomObject: null, Creep: 'RoomObject', PowerCreep: 'RoomObject', Source: 'RoomObject', Mineral: 'RoomObject', Deposit: 'RoomObject', Flag: 'RoomObject', ConstructionSite: 'RoomObject', Resource: 'RoomObject', Tombstone: 'RoomObject', Ruin: 'RoomObject', Nuke: 'RoomObject',
  Structure: 'RoomObject', OwnedStructure: 'Structure', StructureContainer: 'Structure', StructureRoad: 'Structure', StructureWall: 'Structure', StructurePortal: 'Structure',
  StructureController: 'OwnedStructure', StructureSpawn: 'OwnedStructure', StructureExtension: 'OwnedStructure', StructureExtractor: 'OwnedStructure', StructureFactory: 'OwnedStructure', StructureLab: 'OwnedStructure', StructureLink: 'OwnedStructure', StructureNuker: 'OwnedStructure', StructureObserver: 'OwnedStructure', StructurePowerSpawn: 'OwnedStructure', StructureRampart: 'OwnedStructure', StructureStorage: 'OwnedStructure', StructureTerminal: 'OwnedStructure', StructureTower: 'OwnedStructure', StructureKeeperLair: 'OwnedStructure', StructureInvaderCore: 'OwnedStructure', StructurePowerBank: 'OwnedStructure', Store: null };
const CLASS_NAMES = Object.keys(CLASS_TREE);
const TYPE_CLASS = { container: 'StructureContainer', road: 'StructureRoad', constructedWall: 'StructureWall', portal: 'StructurePortal', extension: 'StructureExtension', extractor: 'StructureExtractor', factory: 'StructureFactory', lab: 'StructureLab', link: 'StructureLink', nuker: 'StructureNuker', observer: 'StructureObserver', powerSpawn: 'StructurePowerSpawn', rampart: 'StructureRampart', storage: 'StructureStorage', terminal: 'StructureTerminal', tower: 'StructureTower', keeperLair: 'StructureKeeperLair', invaderCore: 'StructureInvaderCore', powerBank: 'StructurePowerBank', spawn: 'StructureSpawn', controller: 'StructureController' };
const KIND_CLASS = { creep: 'Creep', source: 'Source', mineral: 'Mineral', deposit: 'Deposit', flag: 'Flag', site: 'ConstructionSite', resource: 'Resource', tombstone: 'Tombstone', ruin: 'Ruin', nuke: 'Nuke', spawn: 'StructureSpawn', controller: 'StructureController' };
// 官方方法定义所在的类（dispatcher 放在这里，用户覆盖父类原型即对所有子类生效）
const METHOD_HOME = { destroy: 'Structure', isActive: 'Structure', notifyWhenAttacked: 'Structure' };
function makeClasses() {
  const C = { _game: null };
  for (const n of CLASS_NAMES) {
    const F = ({ [n]: function (id) { if (n === 'PowerCreep') throw new Error('You cannot construct a PowerCreep object directly. Use PowerCreep.create'); const g = C._game, v = g && g.getObjectById(id); if (!v) throw new Error('Could not find an object with ID ' + id); return v; } })[n];
    const par = CLASS_TREE[n]; if (par) { F.prototype = Object.create(C[par].prototype, { constructor: { value: F, writable: true, configurable: true } }); Object.setPrototypeOf(F, C[par]); }
    C[n] = F;
  }
  C.Room = function Room() { throw new Error('Room 不能直接构造'); }; // 官方 Room 原型：instanceof Room / Room.prototype 扩展
  C.StructureSpawn.Spawning = function Spawning() { throw new Error('StructureSpawn.Spawning 不能直接构造'); };
  return C;
}
function classOf(o) { return o.kind === 'structure' ? TYPE_CLASS[o.type] : KIND_CLASS[o.kind]; }
// 把视图对象的方法挪到隐藏表 __m，原型上放转发函数；视图挂到对应类原型上
function toClass(C, v, name, drop) {
  const K = C[name]; if (!K) return v;
  let m = v.__m; if (!m) { m = {}; Object.defineProperty(v, '__m', { value: m, enumerable: false }); }
  for (const k of Object.keys(v)) { const d = Object.getOwnPropertyDescriptor(v, k); if (d && typeof d.value === 'function') { m[k] = d.value; delete v[k]; } }
  if (drop) for (const k of drop) delete m[k];
  for (const k in m) { let H = K; const home = METHOD_HOME[k]; if (home && C[home] && K.prototype instanceof C[home]) H = C[home];
    if (!Object.prototype.hasOwnProperty.call(H.prototype, k)) Object.defineProperty(H.prototype, k, { value: function (...a) { const f = this.__m && this.__m[k]; if (!f) throw new TypeError(k + ' is not a function'); return f.apply(this, a); }, writable: true, configurable: true }); }
  Object.setPrototypeOf(v, K.prototype); return v;
}

// 用户代码沙箱：官方全局（Game/Memory/RoomPosition/...）+ 全部官方常量
const SC_NAMES = Object.keys(SC).filter(k => /^[A-Z_][A-Z0-9_]*$/.test(k));
// 官方运行时：CommonJS 模块（require / module.exports），main 模块顶层代码每次全局重置只执行一次，之后每 tick 调用 module.exports.loop；
// 未导出 loop 的旧代码（含积木生成代码）每 tick 整体重新执行。全局对象 global 在两次全局重置之间保留，未声明的赋值落到 global 上（非严格模式，与官方一致）。
// 没有循环次数上限：只有 Game.cpu.tickLimit（毫秒）会中止本 tick 代码。
const USER_HIDDEN = ['window', 'document', 'localStorage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Capacitor', 'globalThis', 'self', 'process', 'setTimeout', 'setInterval', 'SC', 'Function', 'eval'];
// 用户脚本可见的标准 JS 内置对象；其余宿主全局（浏览器 window.name/top/... 等）对脚本不可见，未声明的读写都落到 global 上
const JS_BUILTINS = new Set(['Object', 'Array', 'Number', 'String', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'Promise', 'Proxy', 'Reflect', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent', 'escape', 'unescape', 'NaN', 'Infinity', 'undefined', 'Intl', 'AggregateError', 'FinalizationRegistry', 'Atomics', 'TextEncoder', 'TextDecoder', 'arguments', 'this']);
const SC_NAMES_SET = new Set(SC_NAMES);
function instrumentLoops(code) { return /__loopGuard\(\)/.test(code) ? code : String(code).replace(/\bwhile\s*\(/g, 'while (__loopGuard(), ').replace(/\b(for\s*\([^()]*\)\s*)\{/g, '$1{ __loopGuard(); '); }
function compileUser(code, modules) {
  const g = Object.create(null), lodash = (typeof __lodash !== 'undefined') ? __lodash : undefined;
  const scope = new Proxy(g, { has: (t, k) => typeof k === 'string' && (k in t || !JS_BUILTINS.has(k)) && !USER_HIDDEN.includes(k) && !SC_NAMES_SET.has(k) && k !== '__loopGuard',
    get: (t, k) => k === Symbol.unscopables ? undefined : t[k], set: (t, k, val) => { t[k] = val; return true; } });
  let n = 0, t0 = 0, lim = 500;
  const guard = () => { if ((++n & 1023) === 0 && Date.now() - t0 > lim) throw new Error('CPU time limit reached（超过 Game.cpu.tickLimit ' + lim + 'ms，本 tick 代码被中止）'); };
  const srcs = Object.assign({}, modules || {}, { main: code }), compiled = {};
  for (const name in srcs) compiled[name] = new Function('__scope', '__loopGuard', ...USER_HIDDEN, ...SC_NAMES, 'with (__scope) { return function (module, exports, require, global) {\n' + instrumentLoops(srcs[name]) + '\n}; }')(scope, guard, ...USER_HIDDEN.map(() => undefined), ...SC_NAMES.map(k => SC[k]));
  const cache = {};
  const req = name => { const k = String(name).replace(/^\.\//, '').replace(/\.js$/, ''); if (k === 'lodash') return lodash; if (cache[k]) return cache[k].exports; if (!compiled[k]) throw new Error(`Unknown module '${name}'`);
    const m = { exports: {} }; cache[k] = m; try { compiled[k].call(m.exports, m, m.exports, req, scope); } catch (e) { delete cache[k]; throw e; } return m.exports; };
  let started = false;
  g.global = scope; g.require = req; g._ = lodash;
  return (api) => {
    n = 0; t0 = Date.now(); lim = (api.Game && api.Game.cpu && api.Game.cpu.tickLimit) || 500;
    Object.assign(g, { Game: api.Game, Memory: api.Memory, RawMemory: api.RawMemory, RoomPosition: api.RoomPosition, Room: api.Room, PathFinder: api.PathFinder, RoomVisual: api.RoomVisual, InterShardMemory: api.InterShardMemory, console: { log: api.log } });
    const C = api._cls; if (C) for (const k of CLASS_NAMES) if (k !== 'PowerCreep') g[k] = C[k];
    g.PowerCreep = api.PowerCreep || (C && C.PowerCreep);
    if (!started) { started = true; req('main'); }
    else if (!(cache.main && typeof cache.main.exports.loop === 'function')) { delete cache.main; req('main'); return; }
    if (cache.main && typeof cache.main.exports.loop === 'function') cache.main.exports.loop();
  };
}
if (typeof module !== 'undefined') module.exports = { Engine, newWorld, compileUser, countStruct, rclOf };

// lodash 3.10.1（官方运行时内置 `_`，MIT 许可，https://lodash.com/license）
var __lodash = (function () { var module = { exports: {} }, exports = module.exports, define; /**
 * @license
 * lodash 3.10.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern -d -o ./index.js`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
(function(){var n,t,r,e=32,u=128,i=256,o=200,f="Expected a function",a="__lodash_placeholder__",c="[object Arguments]",l="[object Array]",s="[object Boolean]",p="[object Date]",h="[object Error]",v="[object Function]",_="[object Map]",g="[object Number]",y="[object Object]",d="[object RegExp]",w="[object Set]",m="[object String]",x="[object WeakMap]",b="[object ArrayBuffer]",A="[object Float32Array]",j="[object Float64Array]",k="[object Int8Array]",I="[object Int16Array]",R="[object Int32Array]",O="[object Uint8Array]",E="[object Uint8ClampedArray]",C="[object Uint16Array]",U="[object Uint32Array]",$=/\b__p \+= '';/g,S=/\b(__p \+=) '' \+/g,W=/(__e\(.*?\)|\b__t\)) \+\n'';/g,F=/&(?:amp|lt|gt|quot|#39|#96);/g,N=/[&<>"'`]/g,T=RegExp(F.source),L=RegExp(N.source),B=/<%-([\s\S]+?)%>/g,z=/<%([\s\S]+?)%>/g,D=/<%=([\s\S]+?)%>/g,q=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,M=/^\w*$/,P=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g,K=/^[:!,]|[\\^$.*+?()[\]{}|\/]|(^[0-9a-fA-Fnrtuvx])|([\n\r\u2028\u2029])/g,V=RegExp(K.source),Y=/[\u0300-\u036f\ufe20-\ufe23]/g,G=/\\(\\)?/g,J=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,X=/\w*$/,Z=/^0[xX]/,H=/^\[object .+?Constructor\]$/,Q=/^\d+$/,nn=/[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g,tn=/($^)/,rn=/['\n\r\u2028\u2029\\]/g,en=(t="[A-Z\\xc0-\\xd6\\xd8-\\xde]",r="[a-z\\xdf-\\xf6\\xf8-\\xff]+",RegExp(t+"+(?="+t+r+")|"+t+"?"+r+"|"+t+"+|[0-9]+","g")),un=["Array","ArrayBuffer","Date","Error","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Math","Number","Object","RegExp","Set","String","_","clearTimeout","isFinite","parseFloat","parseInt","setTimeout","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","WeakMap"],on=-1,fn={};fn[A]=fn[j]=fn[k]=fn[I]=fn[R]=fn[O]=fn[E]=fn[C]=fn[U]=!0,fn[c]=fn[l]=fn[b]=fn[s]=fn[p]=fn[h]=fn[v]=fn[_]=fn[g]=fn[y]=fn[d]=fn[w]=fn[m]=fn[x]=!1;var an={};an[c]=an[l]=an[b]=an[s]=an[p]=an[A]=an[j]=an[k]=an[I]=an[R]=an[g]=an[y]=an[d]=an[m]=an[O]=an[E]=an[C]=an[U]=!0,an[h]=an[v]=an[_]=an[w]=an[x]=!1;var cn={"À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","Ç":"C","ç":"c","Ð":"D","ð":"d","È":"E","É":"E","Ê":"E","Ë":"E","è":"e","é":"e","ê":"e","ë":"e","Ì":"I","Í":"I","Î":"I","Ï":"I","ì":"i","í":"i","î":"i","ï":"i","Ñ":"N","ñ":"n","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o","Ù":"U","Ú":"U","Û":"U","Ü":"U","ù":"u","ú":"u","û":"u","ü":"u","Ý":"Y","ý":"y","ÿ":"y","Æ":"Ae","æ":"ae","Þ":"Th","þ":"th","ß":"ss"},ln={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"},sn={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&#96;":"`"},pn={function:!0,object:!0},hn={0:"x30",1:"x31",2:"x32",3:"x33",4:"x34",5:"x35",6:"x36",7:"x37",8:"x38",9:"x39",A:"x41",B:"x42",C:"x43",D:"x44",E:"x45",F:"x46",a:"x61",b:"x62",c:"x63",d:"x64",e:"x65",f:"x66",n:"x6e",r:"x72",t:"x74",u:"x75",v:"x76",x:"x78"},vn={"\\":"\\","'":"'","\n":"n","\r":"r","\u2028":"u2028","\u2029":"u2029"},_n=pn[typeof exports]&&exports&&!exports.nodeType&&exports,gn=pn[typeof module]&&module&&!module.nodeType&&module,yn=_n&&gn&&"object"==typeof global&&global&&global.Object&&global,dn=pn[typeof self]&&self&&self.Object&&self,wn=pn[typeof window]&&window&&window.Object&&window,mn=gn&&gn.exports===_n&&_n,xn=yn||wn!==(this&&this.window)&&wn||dn||this;function bn(t,r){if(t!==r){var e=null===t,u=t===n,i=t==t,o=null===r,f=r===n,a=r==r;if(t>r&&!o||!i||e&&!f&&a||u&&a)return 1;if(t<r&&!e||!a||o&&!u&&i||f&&i)return-1}return 0}function An(n,t,r){for(var e=n.length,u=r?e:-1;r?u--:++u<e;)if(t(n[u],u,n))return u;return-1}function jn(n,t,r){if(t!=t)return Wn(n,r);for(var e=r-1,u=n.length;++e<u;)if(n[e]===t)return e;return-1}function kn(n){return"function"==typeof n||!1}function In(n){return null==n?"":n+""}function Rn(n,t){for(var r=-1,e=n.length;++r<e&&t.indexOf(n.charAt(r))>-1;);return r}function On(n,t){for(var r=n.length;r--&&t.indexOf(n.charAt(r))>-1;);return r}function En(n,t){return bn(n.criteria,t.criteria)||n.index-t.index}function Cn(n){return cn[n]}function Un(n){return ln[n]}function $n(n,t,r){return t?n=hn[n]:r&&(n=vn[n]),"\\"+n}function Sn(n){return"\\"+vn[n]}function Wn(n,t,r){for(var e=n.length,u=t+(r?0:-1);r?u--:++u<e;){var i=n[u];if(i!=i)return u}return-1}function Fn(n){return!!n&&"object"==typeof n}function Nn(n){return n<=160&&n>=9&&n<=13||32==n||160==n||5760==n||6158==n||n>=8192&&(n<=8202||8232==n||8233==n||8239==n||8287==n||12288==n||65279==n)}function Tn(n,t){for(var r=-1,e=n.length,u=-1,i=[];++r<e;)n[r]===t&&(n[r]=a,i[++u]=r);return i}function Ln(n){for(var t=-1,r=n.length;++t<r&&Nn(n.charCodeAt(t)););return t}function Bn(n){for(var t=n.length;t--&&Nn(n.charCodeAt(t)););return t}function zn(n){return sn[n]}var Dn=function t(r){var _=(r=r?Dn.defaults(xn.Object(),r,Dn.pick(xn,un)):xn).Array,w=r.Date,x=r.Error,cn=r.Function,ln=r.Math,sn=r.Number,pn=r.Object,hn=r.RegExp,vn=r.String,_n=r.TypeError,gn=_.prototype,yn=pn.prototype,dn=vn.prototype,wn=cn.prototype.toString,mn=yn.hasOwnProperty,Nn=0,qn=yn.toString,Mn=xn._,Pn=hn("^"+wn.call(mn).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),Kn=r.ArrayBuffer,Vn=r.clearTimeout,Yn=r.parseFloat,Gn=ln.pow,Jn=yn.propertyIsEnumerable,Xn=oe(r,"Set"),Zn=r.setTimeout,Hn=gn.splice,Qn=r.Uint8Array,nt=oe(r,"WeakMap"),tt=ln.ceil,rt=oe(pn,"create"),et=ln.floor,ut=oe(_,"isArray"),it=r.isFinite,ot=oe(pn,"keys"),ft=ln.max,at=ln.min,ct=oe(w,"now"),lt=r.parseInt,st=ln.random,pt=sn.NEGATIVE_INFINITY,ht=sn.POSITIVE_INFINITY,vt=4294967295,_t=9007199254740991,gt=nt&&new nt,yt={};function dt(n){if(Fn(n)&&!Wu(n)&&!(n instanceof xt)){if(n instanceof mt)return n;if(mn.call(n,"__chain__")&&mn.call(n,"__wrapped__"))return je(n)}return new mt(n)}function wt(){}function mt(n,t,r){this.__wrapped__=n,this.__actions__=r||[],this.__chain__=!!t}function xt(n){this.__wrapped__=n,this.__actions__=[],this.__dir__=1,this.__filtered__=!1,this.__iteratees__=[],this.__takeCount__=ht,this.__views__=[]}function bt(){this.__data__={}}function At(n){var t=n?n.length:0;for(this.data={hash:rt(null),set:new Xn};t--;)this.push(n[t])}function jt(n,t){var r=n.data;return("string"==typeof t||Lu(t)?r.set.has(t):r.hash[t])?0:-1}function kt(n,t){var r=-1,e=n.length;for(t||(t=_(e));++r<e;)t[r]=n[r];return t}function It(n,t){for(var r=-1,e=n.length;++r<e&&!1!==t(n[r],r,n););return n}function Rt(n,t){for(var r=-1,e=n.length;++r<e;)if(!t(n[r],r,n))return!1;return!0}function Ot(n,t){for(var r=-1,e=n.length,u=-1,i=[];++r<e;){var o=n[r];t(o,r,n)&&(i[++u]=o)}return i}function Et(n,t){for(var r=-1,e=n.length,u=_(e);++r<e;)u[r]=t(n[r],r,n);return u}function Ct(n,t){for(var r=-1,e=t.length,u=n.length;++r<e;)n[u+r]=t[r];return n}function Ut(n,t,r,e){var u=-1,i=n.length;for(e&&i&&(r=n[++u]);++u<i;)r=t(r,n[u],u,n);return r}function $t(n,t){for(var r=-1,e=n.length;++r<e;)if(t(n[r],r,n))return!0;return!1}function St(t,r,e,u){return t!==n&&mn.call(u,e)?t:r}function Wt(t,r,e){for(var u=-1,i=ii(r),o=i.length;++u<o;){var f=i[u],a=t[f],c=e(a,r[f],f,t,r);((c==c?c!==a:a==a)||a===n&&!(f in t))&&(t[f]=c)}return t}function Ft(n,t){return null==t?n:Tt(t,ii(t),n)}function Nt(t,r){for(var e=-1,u=null==t,i=!u&&ae(t),o=i?t.length:0,f=r.length,a=_(f);++e<f;){var c=r[e];a[e]=i?ce(c,o)?t[c]:n:u?n:t[c]}return a}function Tt(n,t,r){r||(r={});for(var e=-1,u=t.length;++e<u;){var i=t[e];r[i]=n[i]}return r}function Lt(t,r,e){var u=typeof t;return"function"==u?r===n?t:xr(t,r,e):null==t?ki:"object"==u?ir(t):r===n?Ui(t):or(t,r)}function Bt(t,r,e,u,i,o,f){var a;if(e&&(a=i?e(t,u,i):e(t)),a!==n)return a;if(!Lu(t))return t;var l=Wu(t);if(l){if(a=function(n){var t=n.length,r=new n.constructor(t);t&&"string"==typeof n[0]&&mn.call(n,"index")&&(r.index=n.index,r.input=n.input);return r}(t),!r)return kt(t,a)}else{var h=qn.call(t),_=h==v;if(h!=y&&h!=c&&(!_||i))return an[h]?function(n,t,r){var e=n.constructor;switch(t){case b:return br(n);case s:case p:return new e(+n);case A:case j:case k:case I:case R:case O:case E:case C:case U:var u=n.buffer;return new e(r?br(u):u,n.byteOffset,n.length);case g:case m:return new e(n);case d:var i=new e(n.source,X.exec(n));i.lastIndex=n.lastIndex}return i}(t,h,r):i?t:{};if(a=function(n){var t=n.constructor;"function"==typeof t&&t instanceof t||(t=pn);return new t}(_?{}:t),!r)return Ft(a,t)}o||(o=[]),f||(f=[]);for(var w=o.length;w--;)if(o[w]==t)return f[w];return o.push(t),f.push(a),(l?It:Ht)(t,function(n,u){a[u]=Bt(n,r,e,u,t,o,f)}),a}dt.support={},dt.templateSettings={escape:B,evaluate:z,interpolate:D,variable:"",imports:{_:dt}};var zt=function(){function t(){}return function(r){if(Lu(r)){t.prototype=r;var e=new t;t.prototype=n}return e||{}}}();function Dt(t,r,e){if("function"!=typeof t)throw new _n(f);return Zn(function(){t.apply(n,e)},r)}function qt(n,t){var r=n?n.length:0,e=[];if(!r)return e;var u=-1,i=ee(),f=i==jn,a=f&&t.length>=o?Er(t):null,c=t.length;a&&(i=jt,f=!1,t=a);n:for(;++u<r;){var l=n[u];if(f&&l==l){for(var s=c;s--;)if(t[s]===l)continue n;e.push(l)}else i(t,l,0)<0&&e.push(l)}return e}var Mt=Rr(Ht),Pt=Rr(Qt,!0);function Kt(n,t){var r=!0;return Mt(n,function(n,e,u){return r=!!t(n,e,u)}),r}function Vt(n,t){var r=[];return Mt(n,function(n,e,u){t(n,e,u)&&r.push(n)}),r}function Yt(n,t,r,e){var u;return r(n,function(n,r,i){if(t(n,r,i))return u=e?r:n,!1}),u}function Gt(n,t,r,e){e||(e=[]);for(var u=-1,i=n.length;++u<i;){var o=n[u];Fn(o)&&ae(o)&&(r||Wu(o)||Su(o))?t?Gt(o,t,r,e):Ct(e,o):r||(e[e.length]=o)}return e}var Jt=Or(),Xt=Or(!0);function Zt(n,t){return Jt(n,t,oi)}function Ht(n,t){return Jt(n,t,ii)}function Qt(n,t){return Xt(n,t,ii)}function nr(n,t){for(var r=-1,e=t.length,u=-1,i=[];++r<e;){var o=t[r];Tu(n[o])&&(i[++u]=o)}return i}function tr(t,r,e){if(null!=t){e!==n&&e in be(t)&&(r=[e]);for(var u=0,i=r.length;null!=t&&u<i;)t=t[r[u++]];return u&&u==i?t:n}}function rr(n,t,r,e,u,i){return n===t||(null==n||null==t||!Lu(n)&&!Fn(t)?n!=n&&t!=t:function(n,t,r,e,u,i,o){var f=Wu(n),a=Wu(t),v=l,_=l;f||((v=qn.call(n))==c?v=y:v!=y&&(f=Pu(n)));a||((_=qn.call(t))==c?_=y:_!=y&&(a=Pu(t)));var w=v==y,x=_==y,b=v==_;if(b&&!f&&!w)return function(n,t,r){switch(r){case s:case p:return+n==+t;case h:return n.name==t.name&&n.message==t.message;case g:return n!=+n?t!=+t:n==+t;case d:case m:return n==t+""}return!1}(n,t,v);if(!u){var A=w&&mn.call(n,"__wrapped__"),j=x&&mn.call(t,"__wrapped__");if(A||j)return r(A?n.value():n,j?t.value():t,e,u,i,o)}if(!b)return!1;i||(i=[]),o||(o=[]);var k=i.length;for(;k--;)if(i[k]==n)return o[k]==t;i.push(n),o.push(t);var I=(f?Hr:Qr)(n,t,r,e,u,i,o);return i.pop(),o.pop(),I}(n,t,rr,r,e,u,i))}function er(t,r,e){var u=r.length,i=u,o=!e;if(null==t)return!i;for(t=be(t);u--;){var f=r[u];if(o&&f[2]?f[1]!==t[f[0]]:!(f[0]in t))return!1}for(;++u<i;){var a=(f=r[u])[0],c=t[a],l=f[1];if(o&&f[2]){if(c===n&&!(a in t))return!1}else{var s=e?e(c,l,a):n;if(!(s===n?rr(l,c,e,!0):s))return!1}}return!0}function ur(n,t){var r=-1,e=ae(n)?_(n.length):[];return Mt(n,function(n,u,i){e[++r]=t(n,u,i)}),e}function ir(t){var r=ie(t);if(1==r.length&&r[0][2]){var e=r[0][0],u=r[0][1];return function(t){return null!=t&&(t[e]===u&&(u!==n||e in be(t)))}}return function(n){return er(n,r)}}function or(t,r){var e=Wu(t),u=se(t)&&ve(r),i=t+"";return t=Ae(t),function(o){if(null==o)return!1;var f=i;if(o=be(o),(e||!u)&&!(f in o)){if(null==(o=1==t.length?o:tr(o,sr(t,0,-1))))return!1;f=Se(t),o=be(o)}return o[f]===r?r!==n||f in o:rr(r,o[f],n,!0)}}function fr(t){return function(r){return null==r?n:r[t]}}function ar(n,t){for(var r=n?t.length:0;r--;){var e=t[r];if(e!=u&&ce(e)){var u=e;Hn.call(n,e,1)}}return n}function cr(n,t){return n+et(st()*(t-n+1))}var lr=gt?function(n,t){return gt.set(n,t),n}:ki;function sr(t,r,e){var u=-1,i=t.length;(r=null==r?0:+r||0)<0&&(r=-r>i?0:i+r),(e=e===n||e>i?i:+e||0)<0&&(e+=i),i=r>e?0:e-r>>>0,r>>>=0;for(var o=_(i);++u<i;)o[u]=t[u+r];return o}function pr(n,t){var r;return Mt(n,function(n,e,u){return!(r=t(n,e,u))}),!!r}function hr(n,t){var r=n.length;for(n.sort(t);r--;)n[r]=n[r].value;return n}function vr(n,t,r){var e=ne(),u=-1;return t=Et(t,function(n){return e(n)}),hr(ur(n,function(n){return{criteria:Et(t,function(t){return t(n)}),index:++u,value:n}}),function(n,t){return function(n,t,r){for(var e=-1,u=n.criteria,i=t.criteria,o=u.length,f=r.length;++e<o;){var a=bn(u[e],i[e]);if(a){if(e>=f)return a;var c=r[e];return a*("asc"===c||!0===c?1:-1)}}return n.index-t.index}(n,t,r)})}function _r(n,t){var r=-1,e=ee(),u=n.length,i=e==jn,f=i&&u>=o,a=f?Er():null,c=[];a?(e=jt,i=!1):(f=!1,a=t?[]:c);n:for(;++r<u;){var l=n[r],s=t?t(l,r,n):l;if(i&&l==l){for(var p=a.length;p--;)if(a[p]===s)continue n;t&&a.push(s),c.push(l)}else e(a,s,0)<0&&((t||f)&&a.push(s),c.push(l))}return c}function gr(n,t){for(var r=-1,e=t.length,u=_(e);++r<e;)u[r]=n[t[r]];return u}function yr(n,t,r,e){for(var u=n.length,i=e?u:-1;(e?i--:++i<u)&&t(n[i],i,n););return r?sr(n,e?0:i,e?i+1:u):sr(n,e?i+1:0,e?u:i)}function dr(n,t){var r=n;r instanceof xt&&(r=r.value());for(var e=-1,u=t.length;++e<u;){var i=t[e];r=i.func.apply(i.thisArg,Ct([r],i.args))}return r}function wr(n,t,r){var e=0,u=n?n.length:e;if("number"==typeof t&&t==t&&u<=2147483647){for(;e<u;){var i=e+u>>>1,o=n[i];(r?o<=t:o<t)&&null!==o?e=i+1:u=i}return u}return mr(n,t,ki,r)}function mr(t,r,e,u){r=e(r);for(var i=0,o=t?t.length:0,f=r!=r,a=null===r,c=r===n;i<o;){var l=et((i+o)/2),s=e(t[l]),p=s!==n,h=s==s;if(f)var v=h||u;else v=a?h&&p&&(u||null!=s):c?h&&(u||p):null!=s&&(u?s<=r:s<r);v?i=l+1:o=l}return at(o,4294967294)}function xr(t,r,e){if("function"!=typeof t)return ki;if(r===n)return t;switch(e){case 1:return function(n){return t.call(r,n)};case 3:return function(n,e,u){return t.call(r,n,e,u)};case 4:return function(n,e,u,i){return t.call(r,n,e,u,i)};case 5:return function(n,e,u,i,o){return t.call(r,n,e,u,i,o)}}return function(){return t.apply(r,arguments)}}function br(n){var t=new Kn(n.byteLength);return new Qn(t).set(new Qn(n)),t}function Ar(n,t,r){for(var e=r.length,u=-1,i=ft(n.length-e,0),o=-1,f=t.length,a=_(f+i);++o<f;)a[o]=t[o];for(;++u<e;)a[r[u]]=n[u];for(;i--;)a[o++]=n[u++];return a}function jr(n,t,r){for(var e=-1,u=r.length,i=-1,o=ft(n.length-u,0),f=-1,a=t.length,c=_(o+a);++i<o;)c[i]=n[i];for(var l=i;++f<a;)c[l+f]=t[f];for(;++e<u;)c[l+r[e]]=n[i++];return c}function kr(n,t){return function(r,e,u){var i=t?t():{};if(e=ne(e,u,3),Wu(r))for(var o=-1,f=r.length;++o<f;){var a=r[o];n(i,a,e(a,o,r),r)}else Mt(r,function(t,r,u){n(i,t,e(t,r,u),u)});return i}}function Ir(t){return Uu(function(r,e){var u=-1,i=null==r?0:e.length,o=i>2?e[i-2]:n,f=i>2?e[2]:n,a=i>1?e[i-1]:n;for("function"==typeof o?(o=xr(o,a,5),i-=2):i-=(o="function"==typeof a?a:n)?1:0,f&&le(e[0],e[1],f)&&(o=i<3?n:o,i=1);++u<i;){var c=e[u];c&&t(r,c,o)}return r})}function Rr(n,t){return function(r,e){var u=r?ue(r):0;if(!he(u))return n(r,e);for(var i=t?u:-1,o=be(r);(t?i--:++i<u)&&!1!==e(o[i],i,o););return r}}function Or(n){return function(t,r,e){for(var u=be(t),i=e(t),o=i.length,f=n?o:-1;n?f--:++f<o;){var a=i[f];if(!1===r(u[a],a,u))break}return t}}function Er(n){return rt&&Xn?new At(n):null}function Cr(n){return function(t){for(var r=-1,e=bi(vi(t)),u=e.length,i="";++r<u;)i=n(i,e[r],r);return i}}function Ur(n){return function(){var t=arguments;switch(t.length){case 0:return new n;case 1:return new n(t[0]);case 2:return new n(t[0],t[1]);case 3:return new n(t[0],t[1],t[2]);case 4:return new n(t[0],t[1],t[2],t[3]);case 5:return new n(t[0],t[1],t[2],t[3],t[4]);case 6:return new n(t[0],t[1],t[2],t[3],t[4],t[5]);case 7:return new n(t[0],t[1],t[2],t[3],t[4],t[5],t[6])}var r=zt(n.prototype),e=n.apply(r,t);return Lu(e)?e:r}}function $r(t){return function r(e,u,i){i&&le(e,u,i)&&(u=n);var o=Zr(e,t,n,n,n,n,n,u);return o.placeholder=r.placeholder,o}}function Sr(t,r){return Uu(function(e){var u=e[0];return null==u?u:(e.push(r),t.apply(n,e))})}function Wr(t,r){return function(e,u,i){if(i&&le(e,u,i)&&(u=n),1==(u=ne(u,i,3)).length){var o=function(n,t,r,e){for(var u=-1,i=n.length,o=e,f=o;++u<i;){var a=n[u],c=+t(a);r(c,o)&&(o=c,f=a)}return f}(e=Wu(e)?e:xe(e),u,t,r);if(!e.length||o!==r)return o}return function(n,t,r,e){var u=e,i=u;return Mt(n,function(n,o,f){var a=+t(n,o,f);(r(a,u)||a===e&&a===i)&&(u=a,i=n)}),i}(e,u,t,r)}}function Fr(t,r){return function(e,u,i){if(u=ne(u,i,3),Wu(e)){var o=An(e,u,r);return o>-1?e[o]:n}return Yt(e,u,t)}}function Nr(n){return function(t,r,e){return t&&t.length?An(t,r=ne(r,e,3),n):-1}}function Tr(n){return function(t,r,e){return Yt(t,r=ne(r,e,3),n,!0)}}function Lr(t){return function(){for(var r,e=arguments.length,u=t?e:-1,i=0,a=_(e);t?u--:++u<e;){var c=a[i++]=arguments[u];if("function"!=typeof c)throw new _n(f);!r&&mt.prototype.thru&&"wrapper"==re(c)&&(r=new mt([],!0))}for(u=r?-1:e;++u<e;){var l=re(c=a[u]),s="wrapper"==l?te(c):n;r=s&&pe(s[0])&&424==s[1]&&!s[4].length&&1==s[9]?r[re(s[0])].apply(r,s[3]):1==c.length&&pe(c)?r[l]():r.thru(c)}return function(){var n=arguments,t=n[0];if(r&&1==n.length&&Wu(t)&&t.length>=o)return r.plant(t).value();for(var u=0,i=e?a[u].apply(this,n):t;++u<e;)i=a[u].call(this,i);return i}}}function Br(t,r){return function(e,u,i){return"function"==typeof u&&i===n&&Wu(e)?t(e,u):r(e,xr(u,i,3))}}function zr(t){return function(r,e,u){return"function"==typeof e&&u===n||(e=xr(e,u,3)),t(r,e,oi)}}function Dr(t){return function(r,e,u){return"function"==typeof e&&u===n||(e=xr(e,u,3)),t(r,e)}}function qr(n){return function(t,r,e){var u={};return r=ne(r,e,3),Ht(t,function(t,e,i){var o=r(t,e,i);t=n?t:o,u[e=n?o:e]=t}),u}}function Mr(n){return function(t,r,e){return t=In(t),(n?t:"")+Yr(t,r,e)+(n?"":t)}}function Pr(t){var r=Uu(function(e,u){var i=Tn(u,r.placeholder);return Zr(e,t,n,u,i)});return r}function Kr(t,r){return function(e,u,i,o){var f=arguments.length<3;return"function"==typeof u&&o===n&&Wu(e)?t(e,u,i,f):function(n,t,r,e,u){return u(n,function(n,u,i){r=e?(e=!1,n):t(r,n,u,i)}),r}(e,ne(u,o,4),i,f,r)}}function Vr(t,r,i,o,f,a,c,l,s,p){var h=r&u,v=1&r,g=2&r,y=8&r,d=4&r,w=16&r,m=g?n:Ur(t);return function u(){for(var x=arguments.length,b=x,A=_(x);b--;)A[b]=arguments[b];if(o&&(A=Ar(A,o,f)),a&&(A=jr(A,a,c)),y||w){var j=u.placeholder,k=Tn(A,j);if((x-=k.length)<p){var I=l?kt(l):n,R=ft(p-x,0);r|=y?e:64,r&=~(y?64:e),d||(r&=-4);var O=[t,r,i,y?A:n,y?k:n,y?n:A,y?n:k,I,s,R],E=Vr.apply(n,O);return pe(t)&&we(E,O),E.placeholder=j,E}}var C=v?i:this,U=g?C[t]:t;return l&&(A=function(t,r){var e=t.length,u=at(r.length,e),i=kt(t);for(;u--;){var o=r[u];t[u]=ce(o,e)?i[o]:n}return t}(A,l)),h&&s<A.length&&(A.length=s),this&&this!==xn&&this instanceof u&&(U=m||Ur(t)),U.apply(C,A)}}function Yr(n,t,r){var e=n.length;if(e>=(t=+t)||!it(t))return"";var u=t-e;return di(r=null==r?" ":r+"",tt(u/r.length)).slice(0,u)}function Gr(n,t,r,e){var u=1&t,i=Ur(n);return function t(){for(var o=-1,f=arguments.length,a=-1,c=e.length,l=_(c+f);++a<c;)l[a]=e[a];for(;f--;)l[a++]=arguments[++o];return(this&&this!==xn&&this instanceof t?i:n).apply(u?r:this,l)}}function Jr(t){var r=ln[t];return function(t,e){return(e=e===n?0:+e||0)?(e=Gn(10,e),r(t*e)/e):r(t)}}function Xr(n){return function(t,r,e,u){var i=ne(e);return null==e&&i===Lt?wr(t,r,n):mr(t,r,i(e,u,1),n)}}function Zr(t,r,o,c,l,s,p,h){var v=2&r;if(!v&&"function"!=typeof t)throw new _n(f);var _=c?c.length:0;if(_||(r&=-97,c=l=n),_-=l?l.length:0,64&r){var g=c,y=l;c=l=n}var d=v?n:te(t),w=[t,r,o,c,l,g,y,s,p,h];if(d&&(!function(n,t){var r=n[1],e=t[1],o=r|e,f=o<u,c=e==u&&8==r||e==u&&r==i&&n[7].length<=t[8]||384==e&&8==r;if(!f&&!c)return n;1&e&&(n[2]=t[2],o|=1&r?0:4);var l=t[3];if(l){var s=n[3];n[3]=s?Ar(s,l,t[4]):kt(l),n[4]=s?Tn(n[3],a):kt(t[4])}(l=t[5])&&(s=n[5],n[5]=s?jr(s,l,t[6]):kt(l),n[6]=s?Tn(n[5],a):kt(t[6]));(l=t[7])&&(n[7]=kt(l));e&u&&(n[8]=null==n[8]?t[8]:at(n[8],t[8]));null==n[9]&&(n[9]=t[9]);n[0]=t[0],n[1]=o}(w,d),r=w[1],h=w[9]),w[9]=null==h?v?0:t.length:ft(h-_,0)||0,1==r)var m=function(n,t){var r=Ur(n);return function e(){return(this&&this!==xn&&this instanceof e?r:n).apply(t,arguments)}}(w[0],w[2]);else m=r!=e&&33!=r||w[4].length?Vr.apply(n,w):Gr.apply(n,w);return(d?lr:we)(m,w)}function Hr(t,r,e,u,i,o,f){var a=-1,c=t.length,l=r.length;if(c!=l&&!(i&&l>c))return!1;for(;++a<c;){var s=t[a],p=r[a],h=u?u(i?p:s,i?s:p,a):n;if(h!==n){if(h)continue;return!1}if(i){if(!$t(r,function(n){return s===n||e(s,n,u,i,o,f)}))return!1}else if(s!==p&&!e(s,p,u,i,o,f))return!1}return!0}function Qr(t,r,e,u,i,o,f){var a=ii(t),c=a.length;if(c!=ii(r).length&&!i)return!1;for(var l=c;l--;){var s=a[l];if(!(i?s in r:mn.call(r,s)))return!1}for(var p=i;++l<c;){var h=t[s=a[l]],v=r[s],_=u?u(i?v:h,i?h:v,s):n;if(!(_===n?e(h,v,u,i,o,f):_))return!1;p||(p="constructor"==s)}if(!p){var g=t.constructor,y=r.constructor;if(g!=y&&"constructor"in t&&"constructor"in r&&!("function"==typeof g&&g instanceof g&&"function"==typeof y&&y instanceof y))return!1}return!0}function ne(n,t,r){var e=dt.callback||ji;return e=e===ji?Lt:e,r?e(n,t,r):e}var te=gt?function(n){return gt.get(n)}:Ci;function re(n){for(var t=n.name,r=yt[t],e=r?r.length:0;e--;){var u=r[e],i=u.func;if(null==i||i==n)return u.name}return t}function ee(n,t,r){var e=dt.indexOf||Ue;return e=e===Ue?jn:e,n?e(n,t,r):e}var ue=fr("length");function ie(n){for(var t=li(n),r=t.length;r--;)t[r][2]=ve(t[r][1]);return t}function oe(t,r){var e=null==t?n:t[r];return Bu(e)?e:n}function fe(t,r,e){null==t||se(r,t)||(t=1==(r=Ae(r)).length?t:tr(t,sr(r,0,-1)),r=Se(r));var u=null==t?t:t[r];return null==u?n:u.apply(t,e)}function ae(n){return null!=n&&he(ue(n))}function ce(n,t){return n="number"==typeof n||Q.test(n)?+n:-1,t=null==t?_t:t,n>-1&&n%1==0&&n<t}function le(n,t,r){if(!Lu(r))return!1;var e=typeof t;if("number"==e?ae(r)&&ce(t,r.length):"string"==e&&t in r){var u=r[t];return n==n?n===u:u!=u}return!1}function se(n,t){var r=typeof n;return!!("string"==r&&M.test(n)||"number"==r)||!Wu(n)&&(!q.test(n)||null!=t&&n in be(t))}function pe(n){var t=re(n);if(!(t in xt.prototype))return!1;var r=dt[t];if(n===r)return!0;var e=te(r);return!!e&&n===e[0]}function he(n){return"number"==typeof n&&n>-1&&n%1==0&&n<=_t}function ve(n){return n==n&&!Lu(n)}function _e(n,t){n=be(n);for(var r=-1,e=t.length,u={};++r<e;){var i=t[r];i in n&&(u[i]=n[i])}return u}function ge(n,t){var r={};return Zt(n,function(n,e,u){t(n,e,u)&&(r[e]=n)}),r}var ye,de,we=(ye=0,de=0,function(n,t){var r=vu(),e=16-(r-de);if(de=r,e>0){if(++ye>=150)return n}else ye=0;return lr(n,t)});function me(n){for(var t=oi(n),r=t.length,e=r&&n.length,u=!!e&&he(e)&&(Wu(n)||Su(n)),i=-1,o=[];++i<r;){var f=t[i];(u&&ce(f,e)||mn.call(n,f))&&o.push(f)}return o}function xe(n){return null==n?[]:ae(n)?Lu(n)?n:pn(n):pi(n)}function be(n){return Lu(n)?n:pn(n)}function Ae(n){if(Wu(n))return n;var t=[];return In(n).replace(P,function(n,r,e,u){t.push(e?u.replace(G,"$1"):r||n)}),t}function je(n){return n instanceof xt?n.clone():new mt(n.__wrapped__,n.__chain__,kt(n.__actions__))}var ke=Uu(function(n,t){return Fn(n)&&ae(n)?qt(n,Gt(t,!1,!0)):[]});function Ie(n,t,r){return(n?n.length:0)?((r?le(n,t,r):null==t)&&(t=1),sr(n,t<0?0:t)):[]}function Re(n,t,r){var e=n?n.length:0;return e?((r?le(n,t,r):null==t)&&(t=1),sr(n,0,(t=e-(+t||0))<0?0:t)):[]}var Oe=Nr(),Ee=Nr(!0);function Ce(t){return t?t[0]:n}function Ue(n,t,r){var e=n?n.length:0;if(!e)return-1;if("number"==typeof r)r=r<0?ft(e+r,0):r;else if(r){var u=wr(n,t);return u<e&&(t==t?t===n[u]:n[u]!=n[u])?u:-1}return jn(n,t,r||0)}var $e=Uu(function(n){for(var t=n.length,r=t,e=_(l),u=ee(),i=u==jn,o=[];r--;){var f=n[r]=ae(f=n[r])?f:[];e[r]=i&&f.length>=120?Er(r&&f):null}var a=n[0],c=-1,l=a?a.length:0,s=e[0];n:for(;++c<l;)if(f=a[c],(s?jt(s,f):u(o,f,0))<0){for(r=t;--r;){var p=e[r];if((p?jt(p,f):u(n[r],f,0))<0)continue n}s&&s.push(f),o.push(f)}return o});function Se(t){var r=t?t.length:0;return r?t[r-1]:n}var We=Uu(function(n,t){var r=Nt(n,t=Gt(t));return ar(n,t.sort(bn)),r});function Fe(n){return Ie(n,1)}var Ne=Xr(),Te=Xr(!0),Le=Uu(function(n){return _r(Gt(n,!1,!0))});function Be(t,r,e,u){if(!(t?t.length:0))return[];null!=r&&"boolean"!=typeof r&&(e=le(t,r,u=e)?n:r,r=!1);var i=ne();return null==e&&i===Lt||(e=i(e,u,3)),r&&ee()==jn?function(n,t){for(var r,e=-1,u=n.length,i=-1,o=[];++e<u;){var f=n[e],a=t?t(f,e,n):f;e&&r===a||(r=a,o[++i]=f)}return o}(t,e):_r(t,e)}function ze(n){if(!n||!n.length)return[];var t=-1,r=0;n=Ot(n,function(n){if(ae(n))return r=ft(n.length,r),!0});for(var e=_(r);++t<r;)e[t]=Et(n,fr(t));return e}function De(t,r,e){if(!(t?t.length:0))return[];var u=ze(t);return null==r?u:(r=xr(r,e,4),Et(u,function(t){return Ut(t,r,n,!0)}))}var qe=Uu(function(n,t){return ae(n)?qt(n,t):[]}),Me=Uu(ze);function Pe(n,t){var r=-1,e=n?n.length:0,u={};for(!e||t||Wu(n[0])||(t=[]);++r<e;){var i=n[r];t?u[i]=t[r]:i&&(u[i[0]]=i[1])}return u}var Ke=Uu(function(t){var r=t.length,e=r>2?t[r-2]:n,u=r>1?t[r-1]:n;return r>2&&"function"==typeof e?r-=2:(e=r>1&&"function"==typeof u?(--r,u):n,u=n),t.length=r,De(t,e,u)});function Ve(n){var t=dt(n);return t.__chain__=!0,t}function Ye(n,t,r){return t.call(r,n)}var Ge=Uu(function(n){return n=Gt(n),this.thru(function(t){return function(n,t){for(var r=-1,e=n.length,u=-1,i=t.length,o=_(e+i);++r<e;)o[r]=n[r];for(;++u<i;)o[r++]=t[u];return o}(Wu(t)?t:[be(t)],n)})}),Je=Uu(function(n,t){return Nt(n,Gt(t))}),Xe=kr(function(n,t,r){mn.call(n,r)?++n[r]:n[r]=1});function Ze(t,r,e){var u=Wu(t)?Rt:Kt;return e&&le(t,r,e)&&(r=n),"function"==typeof r&&e===n||(r=ne(r,e,3)),u(t,r)}function He(n,t,r){return(Wu(n)?Ot:Vt)(n,t=ne(t,r,3))}var Qe=Fr(Mt),nu=Fr(Pt,!0),tu=Br(It,Mt),ru=Br(function(n,t){for(var r=n.length;r--&&!1!==t(n[r],r,n););return n},Pt),eu=kr(function(n,t,r){mn.call(n,r)?n[r].push(t):n[r]=[t]});function uu(n,t,r,e){var u=n?ue(n):0;return he(u)||(u=(n=pi(n)).length),r="number"!=typeof r||e&&le(t,r,e)?0:r<0?ft(u+r,0):r||0,"string"==typeof n||!Wu(n)&&Mu(n)?r<=u&&n.indexOf(t,r)>-1:!!u&&ee(n,t,r)>-1}var iu=kr(function(n,t,r){n[r]=t}),ou=Uu(function(t,r,e){var u=-1,i="function"==typeof r,o=se(r),f=ae(t)?_(t.length):[];return Mt(t,function(t){var a=i?r:o&&null!=t?t[r]:n;f[++u]=a?a.apply(t,e):fe(t,r,e)}),f});function fu(n,t,r){return(Wu(n)?Et:ur)(n,t=ne(t,r,3))}var au=kr(function(n,t,r){n[r?0:1].push(t)},function(){return[[],[]]}),cu=Kr(Ut,Mt),lu=Kr(function(n,t,r,e){var u=n.length;for(e&&u&&(r=n[--u]);u--;)r=t(r,n[u],u,n);return r},Pt);function su(t,r,e){if(e?le(t,r,e):null==r)return(u=(t=xe(t)).length)>0?t[cr(0,u-1)]:n;var u,i=-1,o=Vu(t),f=(u=o.length)-1;for(r=at(r<0?0:+r||0,u);++i<r;){var a=cr(i,f),c=o[a];o[a]=o[i],o[i]=c}return o.length=r,o}function pu(t,r,e){var u=Wu(t)?$t:pr;return e&&le(t,r,e)&&(r=n),"function"==typeof r&&e===n||(r=ne(r,e,3)),u(t,r)}var hu=Uu(function(n,t){if(null==n)return[];var r=t[2];return r&&le(t[0],t[1],r)&&(t.length=1),vr(n,Gt(t),[])}),vu=ct||function(){return(new w).getTime()};function _u(t,r){var e;if("function"!=typeof r){if("function"!=typeof t)throw new _n(f);var u=t;t=r,r=u}return function(){return--t>0&&(e=r.apply(this,arguments)),t<=1&&(r=n),e}}var gu=Uu(function(n,t,r){var u=1;if(r.length){var i=Tn(r,gu.placeholder);u|=e}return Zr(n,u,t,r,i)}),yu=Uu(function(n,t){for(var r=-1,e=(t=t.length?Gt(t):ui(n)).length;++r<e;){var u=t[r];n[u]=Zr(n[u],1,n)}return n}),du=Uu(function(n,t,r){var u=3;if(r.length){var i=Tn(r,du.placeholder);u|=e}return Zr(t,u,n,r,i)}),wu=$r(8),mu=$r(16);function xu(t,r,e){var u,i,o,a,c,l,s,p=0,h=!1,v=!0;if("function"!=typeof t)throw new _n(f);if(r=r<0?0:+r||0,!0===e){var _=!0;v=!1}else Lu(e)&&(_=!!e.leading,h="maxWait"in e&&ft(+e.maxWait||0,r),v="trailing"in e?!!e.trailing:v);function g(r,e){e&&Vn(e),i=l=s=n,r&&(p=vu(),o=t.apply(c,u),l||i||(u=c=n))}function y(){var n=r-(vu()-a);n<=0||n>r?g(s,i):l=Zn(y,n)}function d(){g(v,l)}function w(){if(u=arguments,a=vu(),c=this,s=v&&(l||!_),!1===h)var e=_&&!l;else{i||_||(p=a);var f=h-(a-p),g=f<=0||f>h;g?(i&&(i=Vn(i)),p=a,o=t.apply(c,u)):i||(i=Zn(d,f))}return g&&l?l=Vn(l):l||r===h||(l=Zn(y,r)),e&&(g=!0,o=t.apply(c,u)),!g||l||i||(u=c=n),o}return w.cancel=function(){l&&Vn(l),i&&Vn(i),p=0,i=l=s=n},w}var bu=Uu(function(n,t){return Dt(n,1,t)}),Au=Uu(function(n,t,r){return Dt(n,t,r)}),ju=Lr(),ku=Lr(!0);function Iu(n,t){if("function"!=typeof n||t&&"function"!=typeof t)throw new _n(f);var r=function(){var e=arguments,u=t?t.apply(this,e):e[0],i=r.cache;if(i.has(u))return i.get(u);var o=n.apply(this,e);return r.cache=i.set(u,o),o};return r.cache=new Iu.Cache,r}var Ru=Uu(function(n,t){if(t=Gt(t),"function"!=typeof n||!Rt(t,kn))throw new _n(f);var r=t.length;return Uu(function(e){for(var u=at(e.length,r);u--;)e[u]=t[u](e[u]);return n.apply(this,e)})}),Ou=Pr(e),Eu=Pr(64),Cu=Uu(function(t,r){return Zr(t,i,n,n,n,Gt(r))});function Uu(t,r){if("function"!=typeof t)throw new _n(f);return r=ft(r===n?t.length-1:+r||0,0),function(){for(var n=arguments,e=-1,u=ft(n.length-r,0),i=_(u);++e<u;)i[e]=n[r+e];switch(r){case 0:return t.call(this,i);case 1:return t.call(this,n[0],i);case 2:return t.call(this,n[0],n[1],i)}var o=_(r+1);for(e=-1;++e<r;)o[e]=n[e];return o[r]=i,t.apply(this,o)}}function $u(n,t){return n>t}function Su(n){return Fn(n)&&ae(n)&&mn.call(n,"callee")&&!Jn.call(n,"callee")}var Wu=ut||function(n){return Fn(n)&&he(n.length)&&qn.call(n)==l};function Fu(t,r,e,u){var i=(e="function"==typeof e?xr(e,u,3):n)?e(t,r):n;return i===n?rr(t,r,e):!!i}function Nu(n){return Fn(n)&&"string"==typeof n.message&&qn.call(n)==h}function Tu(n){return Lu(n)&&qn.call(n)==v}function Lu(n){var t=typeof n;return!!n&&("object"==t||"function"==t)}function Bu(n){return null!=n&&(Tu(n)?Pn.test(wn.call(n)):Fn(n)&&H.test(n))}function zu(n){return"number"==typeof n||Fn(n)&&qn.call(n)==g}function Du(t){var r,e;return!(!Fn(t)||qn.call(t)!=y||Su(t)||!(mn.call(t,"constructor")||"function"!=typeof(r=t.constructor)||r instanceof r))&&(Zt(t,function(n,t){e=t}),e===n||mn.call(t,e))}function qu(n){return Lu(n)&&qn.call(n)==d}function Mu(n){return"string"==typeof n||Fn(n)&&qn.call(n)==m}function Pu(n){return Fn(n)&&he(n.length)&&!!fn[qn.call(n)]}function Ku(n,t){return n<t}function Vu(n){var t=n?ue(n):0;return he(t)?t?kt(n):[]:pi(n)}function Yu(n){return Tt(n,oi(n))}var Gu=Ir(function t(r,e,u,i,o){if(!Lu(r))return r;var f=ae(e)&&(Wu(e)||Pu(e)),a=f?n:ii(e);return It(a||e,function(c,l){if(a&&(c=e[l=c]),Fn(c))i||(i=[]),o||(o=[]),function(t,r,e,u,i,o,f){var a=o.length,c=r[e];for(;a--;)if(o[a]==c)return void(t[e]=f[a]);var l=t[e],s=i?i(l,c,e,t,r):n,p=s===n;p&&(s=c,ae(c)&&(Wu(c)||Pu(c))?s=Wu(l)?l:ae(l)?kt(l):[]:Du(c)||Su(c)?s=Su(l)?Yu(l):Du(l)?l:{}:p=!1);o.push(c),f.push(s),p?t[e]=u(s,c,i,o,f):(s==s?s!==l:l==l)&&(t[e]=s)}(r,e,l,t,u,i,o);else{var s=r[l],p=u?u(s,c,l,r,e):n,h=p===n;h&&(p=c),p===n&&(!f||l in r)||!h&&(p==p?p===s:s!=s)||(r[l]=p)}}),r}),Ju=Ir(function(n,t,r){return r?Wt(n,t,r):Ft(n,t)}),Xu=Sr(Ju,function(t,r){return t===n?r:t}),Zu=Sr(Gu,function t(r,e){return r===n?e:Gu(r,e,t)}),Hu=Tr(Ht),Qu=Tr(Qt),ni=zr(Jt),ti=zr(Xt),ri=Dr(Ht),ei=Dr(Qt);function ui(n){return nr(n,oi(n))}var ii=ot?function(t){var r=null==t?n:t.constructor;return"function"==typeof r&&r.prototype===t||"function"!=typeof t&&ae(t)?me(t):Lu(t)?ot(t):[]}:me;function oi(n){if(null==n)return[];Lu(n)||(n=pn(n));var t=n.length;t=t&&he(t)&&(Wu(n)||Su(n))&&t||0;for(var r=n.constructor,e=-1,u="function"==typeof r&&r.prototype===n,i=_(t),o=t>0;++e<t;)i[e]=e+"";for(var f in n)o&&ce(f,t)||"constructor"==f&&(u||!mn.call(n,f))||i.push(f);return i}var fi=qr(!0),ai=qr(),ci=Uu(function(n,t){if(null==n)return{};if("function"!=typeof t[0]){t=Et(Gt(t),vn);return _e(n,qt(oi(n),t))}var r=xr(t[0],t[1],3);return ge(n,function(n,t,e){return!r(n,t,e)})});function li(n){n=be(n);for(var t=-1,r=ii(n),e=r.length,u=_(e);++t<e;){var i=r[t];u[t]=[i,n[i]]}return u}var si=Uu(function(n,t){return null==n?{}:"function"==typeof t[0]?ge(n,xr(t[0],t[1],3)):_e(n,Gt(t))});function pi(n){return gr(n,ii(n))}var hi=Cr(function(n,t,r){return t=t.toLowerCase(),n+(r?t.charAt(0).toUpperCase()+t.slice(1):t)});function vi(n){return(n=In(n))&&n.replace(nn,Cn).replace(Y,"")}var _i=Cr(function(n,t,r){return n+(r?"-":"")+t.toLowerCase()}),gi=Mr(),yi=Mr(!0);function di(n,t){var r="";if(n=In(n),(t=+t)<1||!n||!it(t))return r;do{t%2&&(r+=n),t=et(t/2),n+=n}while(t);return r}var wi=Cr(function(n,t,r){return n+(r?"_":"")+t.toLowerCase()}),mi=Cr(function(n,t,r){return n+(r?" ":"")+(t.charAt(0).toUpperCase()+t.slice(1))});function xi(n,t,r){var e=n;return(n=In(n))?(r?le(e,t,r):null==t)?n.slice(Ln(n),Bn(n)+1):(t+="",n.slice(Rn(n,t),On(n,t)+1)):n}function bi(t,r,e){return e&&le(t,r,e)&&(r=n),(t=In(t)).match(r||en)||[]}var Ai=Uu(function(t,r){try{return t.apply(n,r)}catch(n){return Nu(n)?n:new x(n)}});function ji(t,r,e){return e&&le(t,r,e)&&(r=n),Fn(t)?Ii(t):Lt(t,r)}function ki(n){return n}function Ii(n){return ir(Bt(n,!0))}var Ri=Uu(function(n,t){return function(r){return fe(r,n,t)}}),Oi=Uu(function(n,t){return function(r){return fe(n,r,t)}});function Ei(t,r,e){if(null==e){var u=Lu(r),i=u?ii(r):n,o=i&&i.length?nr(r,i):n;(o?o.length:u)||(o=!1,e=r,r=t,t=this)}o||(o=nr(r,ii(r)));var f=!0,a=-1,c=Tu(t),l=o.length;!1===e?f=!1:Lu(e)&&"chain"in e&&(f=e.chain);for(;++a<l;){var s=o[a],p=r[s];t[s]=p,c&&(t.prototype[s]=function(n){return function(){var r=this.__chain__;if(f||r){var e=t(this.__wrapped__);return(e.__actions__=kt(this.__actions__)).push({func:n,args:arguments,thisArg:t}),e.__chain__=r,e}return n.apply(t,Ct([this.value()],arguments))}}(p))}return t}function Ci(){}function Ui(n){return se(n)?fr(n):function(n){var t=n+"";return n=Ae(n),function(r){return tr(r,n,t)}}(n)}var $i,Si=Jr("ceil"),Wi=Jr("floor"),Fi=Wr($u,pt),Ni=Wr(Ku,ht),Ti=Jr("round");return dt.prototype=wt.prototype,mt.prototype=zt(wt.prototype),mt.prototype.constructor=mt,xt.prototype=zt(wt.prototype),xt.prototype.constructor=xt,bt.prototype.delete=function(n){return this.has(n)&&delete this.__data__[n]},bt.prototype.get=function(t){return"__proto__"==t?n:this.__data__[t]},bt.prototype.has=function(n){return"__proto__"!=n&&mn.call(this.__data__,n)},bt.prototype.set=function(n,t){return"__proto__"!=n&&(this.__data__[n]=t),this},At.prototype.push=function(n){var t=this.data;"string"==typeof n||Lu(n)?t.set.add(n):t.hash[n]=!0},Iu.Cache=bt,dt.after=function(n,t){if("function"!=typeof t){if("function"!=typeof n)throw new _n(f);var r=n;n=t,t=r}return n=it(n=+n)?n:0,function(){if(--n<1)return t.apply(this,arguments)}},dt.ary=function(t,r,e){return e&&le(t,r,e)&&(r=n),r=t&&null==r?t.length:ft(+r||0,0),Zr(t,u,n,n,n,n,r)},dt.assign=Ju,dt.at=Je,dt.before=_u,dt.bind=gu,dt.bindAll=yu,dt.bindKey=du,dt.callback=ji,dt.chain=Ve,dt.chunk=function(n,t,r){t=(r?le(n,t,r):null==t)?1:ft(et(t)||1,1);for(var e=0,u=n?n.length:0,i=-1,o=_(tt(u/t));e<u;)o[++i]=sr(n,e,e+=t);return o},dt.compact=function(n){for(var t=-1,r=n?n.length:0,e=-1,u=[];++t<r;){var i=n[t];i&&(u[++e]=i)}return u},dt.constant=function(n){return function(){return n}},dt.countBy=Xe,dt.create=function(t,r,e){var u=zt(t);return e&&le(t,r,e)&&(r=n),r?Ft(u,r):u},dt.curry=wu,dt.curryRight=mu,dt.debounce=xu,dt.defaults=Xu,dt.defaultsDeep=Zu,dt.defer=bu,dt.delay=Au,dt.difference=ke,dt.drop=Ie,dt.dropRight=Re,dt.dropRightWhile=function(n,t,r){return n&&n.length?yr(n,ne(t,r,3),!0,!0):[]},dt.dropWhile=function(n,t,r){return n&&n.length?yr(n,ne(t,r,3),!0):[]},dt.fill=function(t,r,e,u){var i=t?t.length:0;return i?(e&&"number"!=typeof e&&le(t,r,e)&&(e=0,u=i),function(t,r,e,u){var i=t.length;for((e=null==e?0:+e||0)<0&&(e=-e>i?0:i+e),(u=u===n||u>i?i:+u||0)<0&&(u+=i),i=e>u?0:u>>>0,e>>>=0;e<i;)t[e++]=r;return t}(t,r,e,u)):[]},dt.filter=He,dt.flatten=function(n,t,r){var e=n?n.length:0;return r&&le(n,t,r)&&(t=!1),e?Gt(n,t):[]},dt.flattenDeep=function(n){return(n?n.length:0)?Gt(n,!0):[]},dt.flow=ju,dt.flowRight=ku,dt.forEach=tu,dt.forEachRight=ru,dt.forIn=ni,dt.forInRight=ti,dt.forOwn=ri,dt.forOwnRight=ei,dt.functions=ui,dt.groupBy=eu,dt.indexBy=iu,dt.initial=function(n){return Re(n,1)},dt.intersection=$e,dt.invert=function(t,r,e){e&&le(t,r,e)&&(r=n);for(var u=-1,i=ii(t),o=i.length,f={};++u<o;){var a=i[u],c=t[a];r?mn.call(f,c)?f[c].push(a):f[c]=[a]:f[c]=a}return f},dt.invoke=ou,dt.keys=ii,dt.keysIn=oi,dt.map=fu,dt.mapKeys=fi,dt.mapValues=ai,dt.matches=Ii,dt.matchesProperty=function(n,t){return or(n,Bt(t,!0))},dt.memoize=Iu,dt.merge=Gu,dt.method=Ri,dt.methodOf=Oi,dt.mixin=Ei,dt.modArgs=Ru,dt.negate=function(n){if("function"!=typeof n)throw new _n(f);return function(){return!n.apply(this,arguments)}},dt.omit=ci,dt.once=function(n){return _u(2,n)},dt.pairs=li,dt.partial=Ou,dt.partialRight=Eu,dt.partition=au,dt.pick=si,dt.pluck=function(n,t){return fu(n,Ui(t))},dt.property=Ui,dt.propertyOf=function(n){return function(t){return tr(n,Ae(t),t+"")}},dt.pull=function(){var n=arguments,t=n[0];if(!t||!t.length)return t;for(var r=0,e=ee(),u=n.length;++r<u;)for(var i=0,o=n[r];(i=e(t,o,i))>-1;)Hn.call(t,i,1);return t},dt.pullAt=We,dt.range=function(t,r,e){e&&le(t,r,e)&&(r=e=n),t=+t||0,null==r?(r=t,t=0):r=+r||0;for(var u=-1,i=ft(tt((r-t)/((e=null==e?1:+e||0)||1)),0),o=_(i);++u<i;)o[u]=t,t+=e;return o},dt.rearg=Cu,dt.reject=function(n,t,r){var e=Wu(n)?Ot:Vt;return t=ne(t,r,3),e(n,function(n,r,e){return!t(n,r,e)})},dt.remove=function(n,t,r){var e=[];if(!n||!n.length)return e;var u=-1,i=[],o=n.length;for(t=ne(t,r,3);++u<o;){var f=n[u];t(f,u,n)&&(e.push(f),i.push(u))}return ar(n,i),e},dt.rest=Fe,dt.restParam=Uu,dt.set=function(n,t,r){if(null==n)return n;for(var e=t+"",u=-1,i=(t=null!=n[e]||se(t,n)?[e]:Ae(t)).length,o=i-1,f=n;null!=f&&++u<i;){var a=t[u];Lu(f)&&(u==o?f[a]=r:null==f[a]&&(f[a]=ce(t[u+1])?[]:{})),f=f[a]}return n},dt.shuffle=function(n){return su(n,ht)},dt.slice=function(n,t,r){var e=n?n.length:0;return e?(r&&"number"!=typeof r&&le(n,t,r)&&(t=0,r=e),sr(n,t,r)):[]},dt.sortBy=function(t,r,e){if(null==t)return[];e&&le(t,r,e)&&(r=n);var u=-1;r=ne(r,e,3);var i=ur(t,function(n,t,e){return{criteria:r(n,t,e),index:++u,value:n}});return hr(i,En)},dt.sortByAll=hu,dt.sortByOrder=function(t,r,e,u){return null==t?[]:(u&&le(r,e,u)&&(e=n),Wu(r)||(r=null==r?[]:[r]),Wu(e)||(e=null==e?[]:[e]),vr(t,r,e))},dt.spread=function(n){if("function"!=typeof n)throw new _n(f);return function(t){return n.apply(this,t)}},dt.take=function(n,t,r){return(n?n.length:0)?((r?le(n,t,r):null==t)&&(t=1),sr(n,0,t<0?0:t)):[]},dt.takeRight=function(n,t,r){var e=n?n.length:0;return e?((r?le(n,t,r):null==t)&&(t=1),sr(n,(t=e-(+t||0))<0?0:t)):[]},dt.takeRightWhile=function(n,t,r){return n&&n.length?yr(n,ne(t,r,3),!1,!0):[]},dt.takeWhile=function(n,t,r){return n&&n.length?yr(n,ne(t,r,3)):[]},dt.tap=function(n,t,r){return t.call(r,n),n},dt.throttle=function(n,t,r){var e=!0,u=!0;if("function"!=typeof n)throw new _n(f);return!1===r?e=!1:Lu(r)&&(e="leading"in r?!!r.leading:e,u="trailing"in r?!!r.trailing:u),xu(n,t,{leading:e,maxWait:+t,trailing:u})},dt.thru=Ye,dt.times=function(n,t,r){if((n=et(n))<1||!it(n))return[];var e=-1,u=_(at(n,vt));for(t=xr(t,r,1);++e<n;)e<vt?u[e]=t(e):t(e);return u},dt.toArray=Vu,dt.toPlainObject=Yu,dt.transform=function(t,r,e,u){var i=Wu(t)||Pu(t);if(r=ne(r,u,4),null==e)if(i||Lu(t)){var o=t.constructor;e=i?Wu(t)?new o:[]:zt(Tu(o)?o.prototype:n)}else e={};return(i?It:Ht)(t,function(n,t,u){return r(e,n,t,u)}),e},dt.union=Le,dt.uniq=Be,dt.unzip=ze,dt.unzipWith=De,dt.values=pi,dt.valuesIn=function(n){return gr(n,oi(n))},dt.where=function(n,t){return He(n,ir(t))},dt.without=qe,dt.wrap=function(t,r){return Zr(r=null==r?ki:r,e,n,[t],[])},dt.xor=function(){for(var n=-1,t=arguments.length;++n<t;){var r=arguments[n];if(ae(r))var e=e?Ct(qt(e,r),qt(r,e)):r}return e?_r(e):[]},dt.zip=Me,dt.zipObject=Pe,dt.zipWith=Ke,dt.backflow=ku,dt.collect=fu,dt.compose=ku,dt.each=tu,dt.eachRight=ru,dt.extend=Ju,dt.iteratee=ji,dt.methods=ui,dt.object=Pe,dt.select=He,dt.tail=Fe,dt.unique=Be,Ei(dt,dt),dt.add=function(n,t){return(+n||0)+(+t||0)},dt.attempt=Ai,dt.camelCase=hi,dt.capitalize=function(n){return(n=In(n))&&n.charAt(0).toUpperCase()+n.slice(1)},dt.ceil=Si,dt.clone=function(n,t,r,e){return t&&"boolean"!=typeof t&&le(n,t,r)?t=!1:"function"==typeof t&&(e=r,r=t,t=!1),"function"==typeof r?Bt(n,t,xr(r,e,1)):Bt(n,t)},dt.cloneDeep=function(n,t,r){return"function"==typeof t?Bt(n,!0,xr(t,r,1)):Bt(n,!0)},dt.deburr=vi,dt.endsWith=function(t,r,e){r+="";var u=(t=In(t)).length;return e=e===n?u:at(e<0?0:+e||0,u),(e-=r.length)>=0&&t.indexOf(r,e)==e},dt.escape=function(n){return(n=In(n))&&L.test(n)?n.replace(N,Un):n},dt.escapeRegExp=function(n){return(n=In(n))&&V.test(n)?n.replace(K,$n):n||"(?:)"},dt.every=Ze,dt.find=Qe,dt.findIndex=Oe,dt.findKey=Hu,dt.findLast=nu,dt.findLastIndex=Ee,dt.findLastKey=Qu,dt.findWhere=function(n,t){return Qe(n,ir(t))},dt.first=Ce,dt.floor=Wi,dt.get=function(t,r,e){var u=null==t?n:tr(t,Ae(r),r+"");return u===n?e:u},dt.gt=$u,dt.gte=function(n,t){return n>=t},dt.has=function(n,t){if(null==n)return!1;var r=mn.call(n,t);if(!r&&!se(t)){if(null==(n=1==(t=Ae(t)).length?n:tr(n,sr(t,0,-1))))return!1;t=Se(t),r=mn.call(n,t)}return r||he(n.length)&&ce(t,n.length)&&(Wu(n)||Su(n))},dt.identity=ki,dt.includes=uu,dt.indexOf=Ue,dt.inRange=function(t,r,e){return r=+r||0,e===n?(e=r,r=0):e=+e||0,t>=at(r,e)&&t<ft(r,e)},dt.isArguments=Su,dt.isArray=Wu,dt.isBoolean=function(n){return!0===n||!1===n||Fn(n)&&qn.call(n)==s},dt.isDate=function(n){return Fn(n)&&qn.call(n)==p},dt.isElement=function(n){return!!n&&1===n.nodeType&&Fn(n)&&!Du(n)},dt.isEmpty=function(n){return null==n||(ae(n)&&(Wu(n)||Mu(n)||Su(n)||Fn(n)&&Tu(n.splice))?!n.length:!ii(n).length)},dt.isEqual=Fu,dt.isError=Nu,dt.isFinite=function(n){return"number"==typeof n&&it(n)},dt.isFunction=Tu,dt.isMatch=function(t,r,e,u){return e="function"==typeof e?xr(e,u,3):n,er(t,ie(r),e)},dt.isNaN=function(n){return zu(n)&&n!=+n},dt.isNative=Bu,dt.isNull=function(n){return null===n},dt.isNumber=zu,dt.isObject=Lu,dt.isPlainObject=Du,dt.isRegExp=qu,dt.isString=Mu,dt.isTypedArray=Pu,dt.isUndefined=function(t){return t===n},dt.kebabCase=_i,dt.last=Se,dt.lastIndexOf=function(n,t,r){var e=n?n.length:0;if(!e)return-1;var u=e;if("number"==typeof r)u=(r<0?ft(e+r,0):at(r||0,e-1))+1;else if(r){var i=n[u=wr(n,t,!0)-1];return(t==t?t===i:i!=i)?u:-1}if(t!=t)return Wn(n,u,!0);for(;u--;)if(n[u]===t)return u;return-1},dt.lt=Ku,dt.lte=function(n,t){return n<=t},dt.max=Fi,dt.min=Ni,dt.noConflict=function(){return xn._=Mn,this},dt.noop=Ci,dt.now=vu,dt.pad=function(n,t,r){t=+t;var e=(n=In(n)).length;if(e>=t||!it(t))return n;var u=(t-e)/2,i=et(u);return(r=Yr("",tt(u),r)).slice(0,i)+n+r},dt.padLeft=gi,dt.padRight=yi,dt.parseInt=function(n,t,r){return(r?le(n,t,r):null==t)?t=0:t&&(t=+t),n=xi(n),lt(n,t||(Z.test(n)?16:10))},dt.random=function(t,r,e){e&&le(t,r,e)&&(r=e=n);var u=null==t,i=null==r;if(null==e&&(i&&"boolean"==typeof t?(e=t,t=1):"boolean"==typeof r&&(e=r,i=!0)),u&&i&&(r=1,i=!1),t=+t||0,i?(r=t,t=0):r=+r||0,e||t%1||r%1){var o=st();return at(t+o*(r-t+Yn("1e-"+((o+"").length-1))),r)}return cr(t,r)},dt.reduce=cu,dt.reduceRight=lu,dt.repeat=di,dt.result=function(t,r,e){var u=null==t?n:t[r];return u===n&&(null==t||se(r,t)||(u=null==(t=1==(r=Ae(r)).length?t:tr(t,sr(r,0,-1)))?n:t[Se(r)]),u=u===n?e:u),Tu(u)?u.call(t):u},dt.round=Ti,dt.runInContext=t,dt.size=function(n){var t=n?ue(n):0;return he(t)?t:ii(n).length},dt.snakeCase=wi,dt.some=pu,dt.sortedIndex=Ne,dt.sortedLastIndex=Te,dt.startCase=mi,dt.startsWith=function(n,t,r){return n=In(n),r=null==r?0:at(r<0?0:+r||0,n.length),n.lastIndexOf(t,r)==r},dt.sum=function(t,r,e){return e&&le(t,r,e)&&(r=n),1==(r=ne(r,e,3)).length?function(n,t){for(var r=n.length,e=0;r--;)e+=+t(n[r])||0;return e}(Wu(t)?t:xe(t),r):function(n,t){var r=0;return Mt(n,function(n,e,u){r+=+t(n,e,u)||0}),r}(t,r)},dt.template=function(t,r,e){var u=dt.templateSettings;e&&le(t,r,e)&&(r=e=n),t=In(t),r=Wt(Ft({},e||r),u,St);var i,o,f=Wt(Ft({},r.imports),u.imports,St),a=ii(f),c=gr(f,a),l=0,s=r.interpolate||tn,p="__p += '",h=hn((r.escape||tn).source+"|"+s.source+"|"+(s===D?J:tn).source+"|"+(r.evaluate||tn).source+"|$","g"),v="//# sourceURL="+("sourceURL"in r?r.sourceURL:"lodash.templateSources["+ ++on+"]")+"\n";t.replace(h,function(n,r,e,u,f,a){return e||(e=u),p+=t.slice(l,a).replace(rn,Sn),r&&(i=!0,p+="' +\n__e("+r+") +\n'"),f&&(o=!0,p+="';\n"+f+";\n__p += '"),e&&(p+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),l=a+n.length,n}),p+="';\n";var _=r.variable;_||(p="with (obj) {\n"+p+"\n}\n"),p=(o?p.replace($,""):p).replace(S,"$1").replace(W,"$1;"),p="function("+(_||"obj")+") {\n"+(_?"":"obj || (obj = {});\n")+"var __t, __p = ''"+(i?", __e = _.escape":"")+(o?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+p+"return __p\n}";var g=Ai(function(){return cn(a,v+"return "+p).apply(n,c)});if(g.source=p,Nu(g))throw g;return g},dt.trim=xi,dt.trimLeft=function(n,t,r){var e=n;return(n=In(n))?(r?le(e,t,r):null==t)?n.slice(Ln(n)):n.slice(Rn(n,t+"")):n},dt.trimRight=function(n,t,r){var e=n;return(n=In(n))?(r?le(e,t,r):null==t)?n.slice(0,Bn(n)+1):n.slice(0,On(n,t+"")+1):n},dt.trunc=function(t,r,e){e&&le(t,r,e)&&(r=n);var u=30,i="...";if(null!=r)if(Lu(r)){var o="separator"in r?r.separator:o;u="length"in r?+r.length||0:u,i="omission"in r?In(r.omission):i}else u=+r||0;if(u>=(t=In(t)).length)return t;var f=u-i.length;if(f<1)return i;var a=t.slice(0,f);if(null==o)return a+i;if(qu(o)){if(t.slice(f).search(o)){var c,l,s=t.slice(0,f);for(o.global||(o=hn(o.source,(X.exec(o)||"")+"g")),o.lastIndex=0;c=o.exec(s);)l=c.index;a=a.slice(0,null==l?f:l)}}else if(t.indexOf(o,f)!=f){var p=a.lastIndexOf(o);p>-1&&(a=a.slice(0,p))}return a+i},dt.unescape=function(n){return(n=In(n))&&T.test(n)?n.replace(F,zn):n},dt.uniqueId=function(n){var t=++Nn;return In(n)+t},dt.words=bi,dt.all=Ze,dt.any=pu,dt.contains=uu,dt.eq=Fu,dt.detect=Qe,dt.foldl=cu,dt.foldr=lu,dt.head=Ce,dt.include=uu,dt.inject=cu,Ei(dt,($i={},Ht(dt,function(n,t){dt.prototype[t]||($i[t]=n)}),$i),!1),dt.sample=su,dt.prototype.sample=function(n){return this.__chain__||null!=n?this.thru(function(t){return su(t,n)}):su(this.value())},dt.VERSION="3.10.1",It(["bind","bindKey","curry","curryRight","partial","partialRight"],function(n){dt[n].placeholder=dt}),It(["drop","take"],function(n,t){xt.prototype[n]=function(r){var e=this.__filtered__;if(e&&!t)return new xt(this);r=null==r?1:ft(et(r)||0,0);var u=this.clone();return e?u.__takeCount__=at(u.__takeCount__,r):u.__views__.push({size:r,type:n+(u.__dir__<0?"Right":"")}),u},xt.prototype[n+"Right"]=function(t){return this.reverse()[n](t).reverse()}}),It(["filter","map","takeWhile"],function(n,t){var r=t+1,e=2!=r;xt.prototype[n]=function(n,t){var u=this.clone();return u.__iteratees__.push({iteratee:ne(n,t,1),type:r}),u.__filtered__=u.__filtered__||e,u}}),It(["first","last"],function(n,t){var r="take"+(t?"Right":"");xt.prototype[n]=function(){return this[r](1).value()[0]}}),It(["initial","rest"],function(n,t){var r="drop"+(t?"":"Right");xt.prototype[n]=function(){return this.__filtered__?new xt(this):this[r](1)}}),It(["pluck","where"],function(n,t){var r=t?"filter":"map",e=t?ir:Ui;xt.prototype[n]=function(n){return this[r](e(n))}}),xt.prototype.compact=function(){return this.filter(ki)},xt.prototype.reject=function(n,t){return n=ne(n,t,1),this.filter(function(t){return!n(t)})},xt.prototype.slice=function(t,r){t=null==t?0:+t||0;var e=this;return e.__filtered__&&(t>0||r<0)?new xt(e):(t<0?e=e.takeRight(-t):t&&(e=e.drop(t)),r!==n&&(e=(r=+r||0)<0?e.dropRight(-r):e.take(r-t)),e)},xt.prototype.takeRightWhile=function(n,t){return this.reverse().takeWhile(n,t).reverse()},xt.prototype.toArray=function(){return this.take(ht)},Ht(xt.prototype,function(t,r){var e=/^(?:filter|map|reject)|While$/.test(r),u=/^(?:first|last)$/.test(r),i=dt[u?"take"+("last"==r?"Right":""):r];i&&(dt.prototype[r]=function(){var r=u?[1]:arguments,o=this.__chain__,f=this.__wrapped__,a=!!this.__actions__.length,c=f instanceof xt,l=r[0],s=c||Wu(f);s&&e&&"function"==typeof l&&1!=l.length&&(c=s=!1);var p=function(t){return u&&o?i(t,1)[0]:i.apply(n,Ct([t],r))},h={func:Ye,args:[p],thisArg:n},v=c&&!a;if(u&&!o)return v?((f=f.clone()).__actions__.push(h),t.call(f)):i.call(n,this.value())[0];if(!u&&s){f=v?f:new xt(this);var _=t.apply(f,r);return _.__actions__.push(h),new mt(_,o)}return this.thru(p)})}),It(["join","pop","push","replace","shift","sort","splice","split","unshift"],function(n){var t=(/^(?:replace|split)$/.test(n)?dn:gn)[n],r=/^(?:push|sort|unshift)$/.test(n)?"tap":"thru",e=/^(?:join|pop|replace|shift)$/.test(n);dt.prototype[n]=function(){var n=arguments;return e&&!this.__chain__?t.apply(this.value(),n):this[r](function(r){return t.apply(r,n)})}}),Ht(xt.prototype,function(n,t){var r=dt[t];if(r){var e=r.name;(yt[e]||(yt[e]=[])).push({name:t,func:r})}}),yt[Vr(n,2).name]=[{name:"wrapper",func:n}],xt.prototype.clone=function(){var n=new xt(this.__wrapped__);return n.__actions__=kt(this.__actions__),n.__dir__=this.__dir__,n.__filtered__=this.__filtered__,n.__iteratees__=kt(this.__iteratees__),n.__takeCount__=this.__takeCount__,n.__views__=kt(this.__views__),n},xt.prototype.reverse=function(){if(this.__filtered__){var n=new xt(this);n.__dir__=-1,n.__filtered__=!0}else(n=this.clone()).__dir__*=-1;return n},xt.prototype.value=function(){var n=this.__wrapped__.value(),t=this.__dir__,r=Wu(n),e=t<0,u=r?n.length:0,i=function(n,t,r){var e=-1,u=r.length;for(;++e<u;){var i=r[e],o=i.size;switch(i.type){case"drop":n+=o;break;case"dropRight":t-=o;break;case"take":t=at(t,n+o);break;case"takeRight":n=ft(n,t-o)}}return{start:n,end:t}}(0,u,this.__views__),f=i.start,a=i.end,c=a-f,l=e?a:f-1,s=this.__iteratees__,p=s.length,h=0,v=at(c,this.__takeCount__);if(!r||u<o||u==c&&v==c)return dr(e&&r?n.reverse():n,this.__actions__);var _=[];n:for(;c--&&h<v;){for(var g=-1,y=n[l+=t];++g<p;){var d=s[g],w=d.iteratee,m=d.type,x=w(y);if(2==m)y=x;else if(!x){if(1==m)continue n;break n}}_[h++]=y}return _},dt.prototype.chain=function(){return Ve(this)},dt.prototype.commit=function(){return new mt(this.value(),this.__chain__)},dt.prototype.concat=Ge,dt.prototype.plant=function(n){for(var t,r=this;r instanceof wt;){var e=je(r);t?u.__wrapped__=e:t=e;var u=e;r=r.__wrapped__}return u.__wrapped__=n,t},dt.prototype.reverse=function(){var t=this.__wrapped__,r=function(n){return e&&e.__dir__<0?n:n.reverse()};if(t instanceof xt){var e=t;return this.__actions__.length&&(e=new xt(this)),(e=e.reverse()).__actions__.push({func:Ye,args:[r],thisArg:n}),new mt(e,this.__chain__)}return this.thru(r)},dt.prototype.toString=function(){return this.value()+""},dt.prototype.run=dt.prototype.toJSON=dt.prototype.valueOf=dt.prototype.value=function(){return dr(this.__wrapped__,this.__actions__)},dt.prototype.collect=dt.prototype.map,dt.prototype.head=dt.prototype.first,dt.prototype.select=dt.prototype.filter,dt.prototype.tail=dt.prototype.rest,dt}();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(xn._=Dn,define(function(){return Dn})):_n&&gn?mn?(gn.exports=Dn)._=Dn:_n._=Dn:xn._=Dn}).call(this);
; return module.exports; })();
