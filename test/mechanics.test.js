// 官方机制对照：Memory 序列化、CPU bucket/generatePixel、首房安全模式、出口格跨房、地图 API
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { const f = compileUser(code); let r; f(Object.assign({}, e.buildApi('p1'), { log: (...a) => { r = a[0]; } })); return r; };
const e = new Engine(newWorld(7)); e.addPlayer('p1', 'T');
const ctrl = e.w.controllers.find(c => c.owner === 'p1');
assert(ctrl.safeMode > e.w.time && ctrl.safeMode - e.w.time === SC.SAFE_MODE_DURATION, '首个房间自动开启安全模式 20000 tick');
// Memory：tick 末 JSON 序列化
e.setCode ? null : null;
e.fns.p1 = api => { api.Memory.fn = () => 1; api.Memory.d = new Date(0); api.Memory.n = 5; };
e.tick(); const m = e.w.memory.p1;
assert(!('fn' in m) && m.n === 5 && typeof m.d === 'string', 'Memory 每 tick JSON 序列化（函数丢弃，Date→字符串）');
e.fns.p1 = api => { const a = {}; a.self = a; api.Memory.loop = a; };
e.tick(); assert(e.w.memory.p1.n === 5 && !('loop' in e.w.memory.p1), '循环引用：序列化失败时保留上一 tick Memory');
e.fns.p1 = null;
// CPU
assert(run(e, 'console.log(Game.cpu.bucket)') <= 10000 && run(e, 'console.log(Game.cpu.tickLimit)') <= 500, 'Game.cpu.bucket/tickLimit');
e.w.players.p1.bucket = 10000;
assert(run(e, 'console.log(Game.cpu.generatePixel())') === OK && e.w.players.p1.pixels === 1, 'bucket 满 10000 时 generatePixel OK');
e.tick(); assert(e.w.players.p1.bucket < 100, 'generatePixel 扣除 10000 bucket: ' + e.w.players.p1.bucket);
assert(run(e, 'console.log(Game.cpu.generatePixel())') === ERR_NOT_ENOUGH_RESOURCES, 'bucket 不足 ERR_NOT_ENOUGH_RESOURCES');
// 地图 API
const rn = roomName(ctrl.x, ctrl.y);
assert(run(e, `console.log(JSON.stringify(Game.map.describeExits('${rn}')))`).length > 2, 'describeExits 返回出口');
assert(typeof run(e, `console.log(Game.map.getRoomTerrain('${rn}').get(0,0))`) === 'number', 'getRoomTerrain 任意房间可读');
assert(run(e, `console.log(Game.map.getRoomStatus('${rn}').status)`) === 'novice', 'getRoomStatus（出生区为 novice）');
// 出口格：站在边缘 → 下一 tick 出现在相邻房间对侧边缘
const sp = e.w.spawns[0], ox = Math.floor(sp.x / 50) * 50, oy = Math.floor(sp.y / 50) * 50;
let ey = -1; for (let y = 1; y < 49; y++) if (!e.blocked(ox + 49, oy + y) && !e.blocked(ox + 50, oy + y)) { ey = y; break; }
if (ey >= 0) {
  const c = { kind: 'creep', id: 'cx', owner: 'p1', name: 'x', body: ['move'], hits: 100, x: ox + 49, y: oy + ey, px: ox + 49, py: oy + ey, store: {}, ttl: 100, fatigue: 0 };
  e.w.creeps.push(c); e._occCache = null; e.tick();
  assert(c.x === ox + 50 && c.y === oy + ey, '出口格 x=49 → 下一 tick 到相邻房间 x=0');
} else console.log('skip - 无开放出口');
// Source Keeper 房间
assert(roomType(4, 4) === 'keeper' && roomType(6, 5) === 'keeper' && roomType(5, 5) === 'center' && roomType(3, 4) === 'normal', '扇区 4~6 为 Keeper 房间，(5,5) 为中心');
ensureRoom(e.w, 4, 4); const kk = '4,4';
const lairs = e.w.structures.filter(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === kk), ksrc = e.w.sources.filter(s => roomKey(s.x, s.y) === kk);
assert(ksrc.length >= 3 && lairs.length >= 3 && !e.w.controllers.some(c => roomKey(c.x, c.y) === kk), 'Keeper 房间：3 能量源、每个能量源/矿物一个 Lair、无 Controller (lairs=' + lairs.length + ')');
assert(e.checkSpawnAt('p1', 4 * 50 + 25, 4 * 50 + 25) !== null, 'Keeper 房间不能出生');
e.fns.p1 = null; for (let i = 0; i < 301; i++) e.tick();
assert(ksrc.every(s => s.cap === 4000), 'Keeper 房间能量源容量 4000');
const keepers = e.w.creeps.filter(c => c.owner === '__keeper');
assert(keepers.length === lairs.length && keepers[0].body.length === 50 && keepers[0].hits === 5000, 'Lair 300 tick 后生成 Keeper（50 部件 5000 hits）');
// 新手区
assert(run(e, `console.log(Game.map.getRoomStatus('${rn}').status)`) === 'novice', '出生房间所在区域为 novice');
const z = e.w.zones[Math.floor(sp.x / 50) + ',' + Math.floor(sp.y / 50)]; assert(z && z.status === 'novice', 'zones 记录');
// tickLimit
e.w.players.p1.bucket = 30; e.fns.p1 = compileUser('let i = 0; while (true) { i++; }'); e.w.logs = e.w.logs || [];
const t0 = Date.now(); e.tick(); assert(Date.now() - t0 < 2000, '死循环在 tickLimit 内被中止 (' + (Date.now() - t0) + 'ms)');
// Game.resources.pixel
assert(run(e, 'console.log(Game.resources.pixel)') === 1, 'Game.resources.pixel');
// RawMemory segments
e.fns.p1 = compileUser('RawMemory.setActiveSegments([3]);'); e.tick();
e.fns.p1 = compileUser('RawMemory.segments[3] = "hello";'); e.tick();
assert(e.w.segments.p1[3] === 'hello', 'RawMemory.segments 写入保存');
assert(run(e, 'console.log(RawMemory.segments[3])') === 'hello', '下一 tick 可读激活的段');
assert((() => { try { run(e, 'RawMemory.setActiveSegments([1,2,3,4,5,6,7,8,9,10,11])'); return false; } catch (x) { return true; } })(), '激活段超过 10 个报错');
console.log('mechanics passed');
