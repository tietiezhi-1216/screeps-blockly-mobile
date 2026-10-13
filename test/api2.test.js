// 第二轮官方 API 对照：boost 效果、unboost、spawnCreep 顺序、Nuker/PowerSpawn/Factory、terminal 描述/交易、PathFinder CostMatrix、dismantle 安全模式
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T');
const ctrl = e.w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; const sp = e.w.spawns[0]; ctrl.safeMode = 0;
const fresh = () => { e._objVer++; e._o = null; };
const mk = (t, dx, dy) => { const s = e.makeStruct(t, 'p1', sp.x + dx, sp.y + dy); e.w.structures.push(s); fresh(); return s; };
const id = s => `Game.getObjectById('${s.id}')`;
// spawnCreep 官方顺序：无名 → ERR_INVALID_ARGS 早于 BUSY；同名 → NAME_EXISTS
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([WORK], ''))`) === ERR_INVALID_ARGS, 'spawnCreep 空名 ERR_INVALID_ARGS');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([WORK,CARRY,MOVE], 'b'))`) === OK, 'spawnCreep OK');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep(['bad'], 'b'))`) === ERR_NAME_EXISTS, '同名优先 ERR_NAME_EXISTS（早于 body 校验）');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep(['bad'], 'c'))`) === ERR_BUSY, '生产中 ERR_BUSY 早于 body 校验');
for (let i = 0; i < 10; i++) e.tick();
const b = e.w.creeps.find(c => c.name === 'b'); fresh();
// boost：lab 中 UO（work harvest ×3）
const L = mk('lab', b.x - sp.x + 1, b.y - sp.y); L.store = { energy: 100, UO: 60 }; fresh();
assert(run(e, `console.log(${id(L)}.boostCreep(Game.creeps.b))`) === OK && b.boosts[0] === 'UO' && L.store.UO === 30 && L.store.energy === 80, 'boostCreep 每部件 30 矿物 + 20 能量');
const { boostPower } = { boostPower: (c, t, a) => vm.runInThisContext('boostPower')(c, t, a) };
assert(boostPower(b, 'work', 'harvest') === 3, 'UO 强化后采集倍率 ×3');
assert(run(e, `console.log(${id(L)}.unboostCreep(Game.creeps.b))`) === OK && !b.boosts.some(Boolean) && L.cooldown > 0, 'unboostCreep OK，lab 进入冷却');
assert(run(e, `console.log(${id(L)}.unboostCreep(Game.creeps.b))`) === ERR_TIRED, 'unboostCreep 冷却中 ERR_TIRED（官方先查冷却再查强化）');
L.cooldown = 0; assert(run(e, `console.log(${id(L)}.unboostCreep(Game.creeps.b))`) === ERR_NOT_FOUND, '无强化 ERR_NOT_FOUND');
// TOUGH 强化减伤
const t = { kind: 'creep', body: ['tough', 'move'], boosts: ['GO', null], hits: 200, x: 1, y: 1 };
e.damage(t, 100, 'zz'); assert(t.hits === 200 - 70, 'GO 强化 TOUGH：100 伤害只扣 70，实际 ' + (200 - t.hits));
// PowerSpawn
const ps = mk('powerSpawn', 0, -3); ps.store = { energy: 100, power: 2 }; fresh();
assert(run(e, `console.log(${id(ps)}.processPower())`) === OK && ps.store.power === 1 && ps.store.energy === 50, 'processPower 1 power + 50 energy');
ps.store.power = 0; assert(run(e, `console.log(${id(ps)}.processPower())`) === ERR_NOT_ENOUGH_RESOURCES, 'processPower 不足 ERR_NOT_ENOUGH_RESOURCES');
// Factory
const f = mk('factory', -3, 0); f.store = { energy: 200, H: 500 }; fresh();
assert(run(e, `console.log(${id(f)}.produce('foo'))`) === ERR_INVALID_ARGS, 'produce 非法 ERR_INVALID_ARGS');
assert(run(e, `console.log(${id(f)}.produce(RESOURCE_REDUCTANT))`) === OK && f.store.reductant === 100 && f.store.H === 0 && f.cooldown === SC.COMMODITIES.reductant.cooldown, 'produce reductant：500 H + 200 能量 → 100');
assert(run(e, `console.log(${id(f)}.produce('reductant'))`) === ERR_TIRED, 'produce 冷却 ERR_TIRED');
// Nuker
const nk = mk('nuker', -3, -3); fresh();
assert(run(e, `console.log(${id(nk)}.launchNuke(new RoomPosition(25,25,'${roomName(sp.x, sp.y)}')))`) === ERR_INVALID_TARGET, '新手区内 launchNuke ERR_INVALID_TARGET'); e.w.zones = {};
assert(run(e, `console.log(${id(nk)}.launchNuke(new RoomPosition(25,25,'${roomName(sp.x, sp.y)}')))`) === ERR_NOT_ENOUGH_RESOURCES, 'launchNuke 未装满 ERR_NOT_ENOUGH_RESOURCES');
assert(run(e, `console.log(${id(nk)}.launchNuke({x:1,y:1}))`) === ERR_INVALID_ARGS, 'launchNuke 非 RoomPosition ERR_INVALID_ARGS');
nk.store = { energy: SC.NUKER_ENERGY_CAPACITY, G: SC.NUKER_GHODIUM_CAPACITY };
const tx = sp.x - sp.x % 50 + 25, ty = sp.y - sp.y % 50 + 25;
assert(run(e, `console.log(${id(nk)}.launchNuke(new RoomPosition(25,25,'${roomName(sp.x, sp.y)}')))`) === OK && e.w.nukes.length === 1 && e.w.nukes[0].landTime === e.w.time + SC.NUKE_LAND_TIME && nk.cooldown === SC.NUKER_COOLDOWN, 'launchNuke OK：50000 tick 落地，冷却 NUKER_COOLDOWN');
const ext = e.makeStruct('extension', 'p1', tx + 1, ty); e.w.structures.push(ext); e.w.nukes[0].landTime = e.w.time + 1; e.tick();
assert(!e.w.nukes.length && !e.w.structures.includes(ext) && !e.w.creeps.some(c => roomKey(c.x, c.y) === roomKey(tx, ty)) && ctrl.upgradeBlocked > e.w.time, '核弹落地：2 格内建筑被毁、房间 creep 全灭、Controller 禁升级');
// Terminal 描述与交易记录
const T1 = mk('terminal', 4, 4); T1.store = { energy: 5000 }; const other = e.w.controllers.find(c => !c.owner && Math.abs(roomKey(c.x, c.y).split(',')[0] - roomKey(sp.x, sp.y).split(',')[0]) <= 3);
const T2 = e.makeStruct('terminal', 'p1', other.x - 1, other.y); e.w.structures.push(T2); T2.store = {}; fresh();
const dest = roomName(T2.x, T2.y), cost = run(e, `console.log(Game.market.calcTransactionCost(1000, '${roomName(sp.x, sp.y)}', '${dest}'))`);
assert(run(e, `console.log(${id(T1)}.send(RESOURCE_ENERGY, 1000, '${dest}', 'hi'))`) === OK && T1.store.energy === 4000 - cost && T2.store.energy === 1000, 'terminal.send 扣 calcTransactionCost 能量');
assert(run(e, `console.log(Game.market.outgoingTransactions[0].description)`) === 'hi', 'Game.market.outgoingTransactions 记录 description');
// PathFinder：roomCallback CostMatrix 255 阻挡
const ox = sp.x - sp.x % 50, oy = sp.y - sp.y % 50, rn = roomName(sp.x, sp.y);
const r1 = run(e, `const r = PathFinder.search(new RoomPosition(10,10,'${rn}'), {pos:new RoomPosition(12,10,'${rn}'), range:0}); console.log(JSON.stringify(r))`);
const r2 = run(e, `const r = PathFinder.search(new RoomPosition(10,10,'${rn}'), {pos:new RoomPosition(12,10,'${rn}'), range:0}, {roomCallback: n => { const m = new PathFinder.CostMatrix(); for (let y=0;y<50;y++) m.set(11,y,255); return m; }}); console.log(JSON.stringify(r))`);
const p1 = JSON.parse(r1), p2 = JSON.parse(r2);
assert(p2.incomplete || !p2.path.some(p => p.x === 11), 'CostMatrix 255 列不可通行（' + r2.slice(0, 80) + '）');
assert(typeof p1.ops === 'number' && p1.ops > 0, 'PathFinder.search 返回真实 ops');
// dismantle 在他人安全模式房间：官方返回 ERR_NO_BODYPART（engine/src/game/creeps.js）
console.log('ALL PASS');
