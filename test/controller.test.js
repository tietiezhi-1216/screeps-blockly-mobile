// 官方规则对照测试：常量、地图、采集、移动疲劳、Controller 升级/降级、RCL 建造限制、建造、塔、掉落/墓碑、返回码
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { for (const c of e.w.creeps) c._did = {}; /* 每次 run 视为新 tick 的动作配额 */ const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); e.flushIntents('p1'); e.applyHits(); /* 模拟 tick 末伤害/治疗结算 */ return r; };

assert(SC.BODYPART_COST.work === 100 && SC.HARVEST_POWER === 2 && SC.CREEP_LIFE_TIME === 1500 && SC.ENERGY_REGEN_TIME === 300 && SC.SOURCE_ENERGY_CAPACITY === 3000, '常量取自官方 constants.js');
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'Tester');
const ctrl = e.w.controllers.find(c => c.owner === 'p1'), sp = e.w.spawns[0], rk = roomKey(sp.x, sp.y), ox = Math.floor(sp.x / 50) * 50, oy = Math.floor(sp.y / 50) * 50;
assert(ctrl.level === 1 && sp.store.energy === 300, '出生：Controller RCL1，Spawn1 300 能量');
assert(e.w.sources.every(s => e.tile(s.x, s.y) === T_WALL) && e.tile(ctrl.x, ctrl.y) === T_WALL, '能量源与 Controller 都在墙格上');
assert(/^E\d+S\d+$/.test(roomName(sp.x, sp.y)), '官方房间名 ' + roomName(sp.x, sp.y));
e.tick(); const src = e.w.sources.find(s => roomKey(s.x, s.y) === rk); assert(src.cap === 3000, '已占领房间能量源容量 3000');
assert(e.w.sources.some(s => roomKey(s.x, s.y) !== rk && s.cap === 1500), '无主房间能量源容量 1500');

// API 基本形态
assert(run(e, `console.log(Game.spawns.Spawn1.pos.x + ',' + Game.spawns.Spawn1.pos.roomName)`) === `${sp.x - ox},${roomName(sp.x, sp.y)}`, 'pos 为房间内坐标 + roomName');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([WORK], 'x', {dryRun:true}))`) === OK, 'spawnCreep dryRun');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([WORK,WORK,WORK,CARRY], 'x'))`) === ERR_NOT_ENOUGH_ENERGY, '能量不足 ERR_NOT_ENOUGH_ENERGY');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep(['foo'], 'x'))`) === ERR_INVALID_ARGS, '非法身体 ERR_INVALID_ARGS');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([WORK,CARRY,MOVE], 'h', {memory:{role:'h'}}))`) === OK, 'spawnCreep 成功');
assert(sp.store.energy === 100 && e.w.memory.p1.creeps.h.role === 'h', '扣 200 能量，写入 Memory.creeps');
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([MOVE], 'y'))`) === ERR_BUSY, '生产中 ERR_BUSY');
for (let i = 0; i < 9; i++) e.tick();
const h = e.w.creeps.find(c => c.name === 'h'); assert(h && !h.spawning && h.ttl === 1500, '3 部件 × 3 tick 后出生，ticksToLive 1500');
assert(sp.store.energy > 100, 'Spawn 在房间能量 <300 时每 tick +1: ' + sp.store.energy);

// 采集：2/WORK，range 1
const [ax, ay] = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].map(([dx, dy]) => [src.x + dx, src.y + dy]).find(([x, y]) => !e.blocked(x, y));
e._o = null; h.x = ax; h.y = ay; e._objVer++;
assert(run(e, `const c=Game.creeps.h; console.log(c.harvest(c.pos.findClosestByRange(FIND_SOURCES)))`) === OK && h.store.energy === 2, 'harvest 每 WORK 2 能量');
const far = e.w.sources.find(s => s !== src && roomKey(s.x, s.y) === rk) || e.w.sources.find(s => s !== src);
assert(run(e, `console.log(Game.creeps.h.harvest(Game.getObjectById('${far.id}')))`) !== OK, '远处能量源不能采集');
e.tick(); assert(src.regenAt === e.w.time + 300, src.regenAt + ' ' + e.w.time + ' ' + src.energy + ' 首次被采后 300 tick 再生');

// 移动疲劳：plain 每非 MOVE 部件 2，MOVE 每 tick 减 2
h.store = {}; h.fatigue = 0;
const dir = [1,2,3,4,5,6,7,8].find(d => { const [dx, dy] = DIRS[d]; return !e.blocked(h.x + dx, h.y + dy) && e.tile(h.x + dx, h.y + dy) === T_PLAIN; });
run(e, `Game.creeps.h.move(${dir})`); e.tick();
assert(h.fatigue === 0, h.fatigue + ' ' + dir + ' ' + h.px + ',' + h.py + '->' + h.x + ',' + h.y + ' 1 WORK + 空 CARRY + 1 MOVE 在平原：疲劳 2-2=0');

// Controller 升级（1/WORK/能量），RCL2 需 200
h.x = ctrl.x + 1; h.y = ctrl.y; e._o = null; if (e.blocked(h.x, h.y, h)) { h.x = ctrl.x; h.y = ctrl.y + 1; }
h.x = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].map(([dx,dy]) => [ctrl.x+dx, ctrl.y+dy]).find(([x,y]) => !e.solid(x,y))[0];
h.y = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].map(([dx,dy]) => [ctrl.x+dx, ctrl.y+dy]).find(([x,y]) => !e.solid(x,y))[1];
for (let i = 0; i < 199; i++) { h.store.energy = 50; h._did = {}; run(e, `const c=Game.creeps.h; c.upgradeController(c.room.controller)`); }
assert(ctrl.level === 1 && ctrl.progress === 199, 'progress 每 WORK +1');
h.store.energy = 50; run(e, `const c=Game.creeps.h; c.upgradeController(c.room.controller)`);
assert(ctrl.level === 2 && ctrl.downgradeTime === e.w.time + SC.CONTROLLER_DOWNGRADE[2] / 2, '200 升 RCL2，降级计时为 CONTROLLER_DOWNGRADE[2]/2');

// RCL 限制
const site = (dx, dy, t) => run(e, `console.log(Game.spawns.Spawn1.room.createConstructionSite(${sp.x - ox + dx}, ${sp.y - oy + dy}, '${t}'))`);
const anySite = t => { for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const r = site(dx, dy, t); if (r !== ERR_INVALID_TARGET) return r; } return ERR_INVALID_TARGET; };
assert(anySite('tower') === ERR_RCL_NOT_ENOUGH, 'RCL2 不能建 tower');
let ok = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.abs(dx) + Math.abs(dy) > 1 && site(dx, dy, 'extension') === OK) ok++;
assert(ok === 5, 'RCL2 最多 5 个 extension 工地: ' + ok);
assert(anySite('spawn') === ERR_RCL_NOT_ENOUGH, 'RCL2 只能有 1 个 spawn');
assert(run(e, `console.log(Game.rooms['${roomName(sp.x, sp.y)}'].createConstructionSite(0, 10, STRUCTURE_ROAD))`) === ERR_INVALID_TARGET, '房间边缘不能建');

// 建造：BUILD_POWER 5/WORK，扣同等能量
const st = e.w.sites.find(s => s.type === 'extension'); h.x = st.x; h.y = st.y + 1; if (e.solid(h.x, h.y)) { h.x = st.x + 1; h.y = st.y; } e._o = null;
h.store.energy = 50; run(e, `const c=Game.creeps.h; c.build(c.pos.findClosestByRange(FIND_CONSTRUCTION_SITES))`);
assert(st.progress === 5 && h.store.energy === 45, 'build 每 WORK 5 进度');
st.progress = 2999; h.store.energy = 50; run(e, `const c=Game.creeps.h; c.build(Game.getObjectById('${st.id}'))`);
const ext = e.w.structures.find(s => s.type === 'extension'); assert(ext && ext.hits === 1000 && storeCap(e.w, ext, 'energy') === 50, 'extension 建成：1000 hits，容量 50');
assert(run(e, `console.log(Game.spawns.Spawn1.room.energyCapacityAvailable)`) === 350, 'energyCapacityAvailable = 300 + 50');

// 掉落、腐烂、墓碑
h.store.energy = 40; run(e, `Game.creeps.h.drop(RESOURCE_ENERGY)`); const dr = e.w.resources[0];
assert(dr && dr.amount === 40, 'drop 生成掉落资源'); e.tick(); assert(dr.amount === 39, '掉落资源每 tick 减 ceil(amount/1000)');
h.store.energy = 20; run(e, `Game.creeps.h.suicide()`); const tb = e.w.tombstones[0];
assert(tb && tb.store.energy === 20 + Math.floor(200 * 0.2 * (h.ttl) / 1500) && tb.decayAt - tb.deathTime === 15, '墓碑保留携带物，3 部件 × 5 tick 后消失');

// 塔：射程衰减
ctrl.level = 3; const tw = e.makeStruct('tower', 'p1', ox + 25, oy + 25); tw.store.energy = 1000; e.w.structures.push(tw);
e.w.players.p2 = { name: 'E', color: 0 }; e.w.memory.p2 = {};
const foe = { kind: 'creep', id: 'foe', owner: 'p2', name: 'f', body: Array(50).fill('tough'), hits: 5000, x: ox + 25 + 20, y: oy + 25, px: 0, py: 0, store: {}, ttl: 100, fatigue: 0 }; e.w.creeps.push(foe); e._o = null;
run(e, `Game.getObjectById('${tw.id}').attack(Game.getObjectById('foe'))`);
assert(foe.hits === 5000 - 150 && tw.store.energy === 990, '塔 20 格外伤害 600×(1-0.75)=150，耗能 10');

// 道路：沼泽上成本 ×5
assert(SC.CONSTRUCTION_COST.road * SC.CONSTRUCTION_COST_ROAD_SWAMP_RATIO === 1500, '沼泽道路成本 1500');
console.log('ALL CONTROLLER TESTS PASS');
