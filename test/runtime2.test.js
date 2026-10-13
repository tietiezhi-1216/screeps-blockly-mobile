// 官方运行时环境：原型类全局 / lodash / CommonJS 模块 / global / 无循环上限 / Terminal.send intent / 补全属性
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {}; const w = e.w;
let L = []; e.log = (p, ...a) => L.push(a.map(String).join(' '));
const ctrl = w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; const sp = w.spawns[0];
const fresh = () => { e._objVer++; e._o = null; };
const tickWith = code => { L = []; e.fns.p1 = compileUser(code); e.tick(); return L; };

// 原型类
let out = tickWith(`console.log([typeof Creep, typeof RoomObject, typeof Store, typeof StructureSpawn, typeof OwnedStructure, typeof Structure, typeof StructureTower, typeof Deposit].join(','))`);
assert(out[0] === 'function,function,function,function,function,function,function,function', '原型类是脚本全局');
out = tickWith(`const s = Game.spawns.Spawn1; console.log([s instanceof StructureSpawn, s instanceof OwnedStructure, s instanceof Structure, s instanceof RoomObject, s.store instanceof Store, s instanceof Creep, s.room.controller instanceof StructureController].join(','))`);
assert(out[0] === 'true,true,true,true,true,false,true', 'instanceof 链与官方一致');
out = tickWith(`Structure.prototype.tag = function () { return 'S' + this.structureType; }; Object.defineProperty(RoomObject.prototype, 'rn', { get() { return this.pos.roomName; }, configurable: true });
const s = Game.spawns.Spawn1; console.log(s.tag(), s.rn === s.pos.roomName)`);
assert(out[0] === 'Sspawn true', '原型扩展（方法 + getter）对实例生效');
out = tickWith(`const o = StructureSpawn.prototype.spawnCreep; StructureSpawn.prototype.spawnCreep = function (...a) { console.log('hook'); return o.apply(this, a); }; console.log(Game.spawns.Spawn1.spawnCreep([MOVE], 'hk', { dryRun: true }))`);
assert(out[0] === 'hook' && out[1] === '0', '覆盖原型方法并调用原实现');
out = tickWith(`console.log(new StructureSpawn(Game.spawns.Spawn1.id) === Game.spawns.Spawn1)`); assert(out[0] === 'true', 'new X(id) 返回该对象');
out = tickWith(`try { new PowerCreep(); } catch (e) { console.log('throw'); }`); assert(out[0] === 'throw', 'PowerCreep 不能直接构造');

// lodash
out = tickWith(`console.log(_.VERSION, _.sum([1, 2, 3]), _.filter(Game.spawns, s => s.my).length, require('lodash') === _)`);
assert(out[0] === '3.10.1 6 1 true', 'lodash 3.10.1 全局 `_` 与 require("lodash")');

// 模块系统：顶层每次全局重置执行一次，loop 每 tick
L = []; e.fns.p1 = compileUser(`const u = require('util'); let n = 0; console.log('top'); module.exports.loop = function () { n++; console.log('loop', n, u.twice(n), global.cnt); };`, { util: `global.cnt = (global.cnt || 0) + 1; module.exports.twice = x => x * 2;` });
e.tick(); e.tick(); e.tick();
assert(L.join('|') === 'top|loop 1 2 1|loop 2 4 1|loop 3 6 1', '顶层只跑一次，require 缓存，loop 每 tick：' + L.join('|'));
L = []; e.fns.p1 = compileUser(`require('nope')`); e.tick(); assert(L.some(x => /Unknown module/.test(x)), '未知模块抛错');
// 旧代码（无 loop，积木生成）每 tick 整体执行
L = []; e.fns.p1 = compileUser(`console.log('legacy')`); e.tick(); e.tick(); assert(L.filter(x => x === 'legacy').length === 2, '没有 loop 的代码每 tick 执行');
// global 与未声明赋值
L = []; e.fns.p1 = compileUser(`module.exports.loop = () => { counter = (typeof counter === 'undefined' ? 0 : counter) + 1; console.log(counter, global.counter, typeof window, typeof document, typeof process); }`); e.tick(); e.tick();
assert(L[0] === '1 1 undefined undefined undefined' && L[1] === '2 2 undefined undefined undefined' && typeof globalThis.counter === 'undefined', '未声明赋值落到脚本 global，不泄漏宿主全局');
// halt：全局重置，原型扩展清空
L = []; e.setCode('p1', `if (!global.x) { global.x = 1; Creep.prototype.zz = 1; console.log('init'); Game.cpu.halt(); } console.log('after', typeof Creep.prototype.zz)`); e.tick(); e.tick(); e.setCode('p1', null);
assert(L[0] === 'init' && L[1] === 'init', 'halt 后 global 与原型重建（再次执行顶层）');

// 无循环次数上限，只有 tickLimit
out = tickWith(`let s = 0; for (let i = 0; i < 2000000; i++) { s += i; } console.log(s)`); assert(out[0] === String(1999999000000), '200 万次循环正常完成');
out = tickWith(`let i = 0; while (true) { i++; }`); assert(out.some(x => /CPU time limit/.test(x)), '死循环被 tickLimit 中止');

// Terminal.send：任意合法房间名 OK，tick 末执行；目标房间无 terminal 则什么都不发生
const free = []; for (let dx = -6; dx < 6; dx++) free.push([sp.x + dx, sp.y + 4]);
const mk = (t, i, owner = 'p1') => { const s = e.makeStruct(t, owner, free[i][0], free[i][1]); w.structures.push(s); fresh(); return s; };
const t1 = mk('terminal', 0); t1.store = { energy: 10000, H: 1000 };
const call = code => { let r; const f = compileUser(code); const api = e.buildApi('p1'); f(Object.assign({}, api, { log: x => { r = x; } })); return r; };
assert(call(`console.log(Game.getObjectById('${t1.id}').send(RESOURCE_HYDROGEN, 100, 'W99N99'))`) === OK && t1.store.H === 1000, 'send 到无 terminal 的合法房间返回 OK，不立即扣资源');
e.fns.p1 = null; e.tick(); assert(t1.store.H === 1000 && t1.store.energy === 10000 && !(t1.cooldown > 0), '目标无 terminal：tick 末什么都不发生（官方 market.js）');
assert(call(`console.log(Game.getObjectById('${t1.id}').send(RESOURCE_HYDROGEN, 100, 'xx'))`) === ERR_INVALID_ARGS, '非法房间名 ERR_INVALID_ARGS');
assert(call(`console.log(Game.getObjectById('${t1.id}').send(RESOURCE_HYDROGEN, 5000, 'W1N1'))`) === ERR_NOT_ENOUGH_RESOURCES, '资源不足 ERR_NOT_ENOUGH_RESOURCES');
// 有目标 terminal：扣资源/能量/冷却
const [rx, ry] = [Math.floor(sp.x / ROOM), Math.floor(sp.y / ROOM)], destRoom = roomName((rx + 1) * ROOM + 25, ry * ROOM + 25);
const t2 = e.makeStruct('terminal', 'p2', (rx + 1) * ROOM + 25, ry * ROOM + 25); w.players.p2 = w.players.p2 || { name: 'F' }; t2.store = {}; w.structures.push(t2); fresh();
assert(call(`console.log(Game.getObjectById('${t1.id}').send(RESOURCE_HYDROGEN, 100, '${destRoom}', 'hi<'))`) === OK, 'send 到有 terminal 的房间 OK');
e.tick(); const cost = Math.ceil(100 * (1 - Math.exp(-1 / 30)));
assert(t1.store.H === 900 && t2.store.H === 100 && t1.store.energy === 10000 - cost && t1.cooldown >= SC.TERMINAL_COOLDOWN - 1, 'tick 末转移，能耗 ' + cost + '，冷却 10');
assert(w.transactions.slice(-1)[0].description === 'hi&lt;', '交易描述转义 <');

// 补全属性
const api = e.buildApi('p1'), G = api.Game;
{ const lair = mk('keeperLair', 6, 'p2'); lair.spawnAt = w.time + 7; fresh(); assert(e.buildApi('p1').Game.getObjectById(lair.id).ticksToSpawn === 7, 'KeeperLair.ticksToSpawn'); }
const st = mk('storage', 3); fresh(); const sv = e.buildApi('p1').Game.getObjectById(st.id); assert(sv.storeCapacity === SC.STORAGE_CAPACITY && sv instanceof e.buildApi('p1').StructureStorage, 'storage.storeCapacity（已废弃）');
const pb = mk('powerBank', 4, 'p2'); pb.store = { power: 3000 }; pb.decayAt = w.time + 50; fresh(); const pv = e.buildApi('p1').Game.getObjectById(pb.id); assert(pv.power === 3000 && pv.ticksToDecay === 50, 'PowerBank.power / ticksToDecay');
const wl = mk('constructedWall', 5); wl.decayAt = w.time + 9; fresh(); assert(e.buildApi('p1').Game.getObjectById(wl.id).ticksToLive === 9, 'Wall.ticksToLive（新手墙）');
console.log('runtime2: all ok');
