// 官方视野规则：地形全可见；对象只在有视野的房间可见；Observer 下一 tick 提供视野
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const e = new Engine(newWorld(42)); e.addPlayer('a', 'A'); e.addPlayer('b', 'B');
assert(Object.keys(e.w.rooms).length === e.w.S * e.w.S, '所有房间地形已生成');
const ka = e.visibleRooms('a'), kb = e.visibleRooms('b');
const sa = e.w.spawns.find(s => s.owner === 'a'), sb = e.w.spawns.find(s => s.owner === 'b');
assert(sa && sb && ka.has(roomKey(sa.x, sa.y)) && !ka.has(roomKey(sb.x, sb.y)), 'A 只看得到自己的房间');
const snapA = e.snapshot('a');
assert(snapA.spawns.every(s => s.owner === 'a'), 'A 的快照里没有 B 的 Spawn');
assert(snapA.sources.length === e.w.sources.length && snapA.controllers.length === e.w.controllers.length, '能量源/Controller 位置始终可见');
e.setCode('a', `Memory.R = Object.keys(Game.rooms); Memory.X = Game.getObjectById('${sb.id}') === null;`);
e.tick();
const M = () => e.w.memory.a; assert(M().R && M().R.length === ka.size && M().X === true, 'Game.rooms 与 getObjectById 遵守视野');
// observer
const rx = Math.floor(sa.x / ROOM), ry = Math.floor(sa.y / ROOM), ctrl = e.w.controllers.find(c => c.owner === 'a'); ctrl.level = 8;
e.w.structures.push({ kind: 'structure', id: 'obs1', type: 'observer', owner: 'a', x: sa.x + 2, y: sa.y + 2, hits: 500, hitsMax: 500 });
const target = roomNameXY(Math.floor(sb.x / ROOM), Math.floor(sb.y / ROOM));
e.setCode('a', `Memory.OR = Game.getObjectById('obs1').observeRoom('${target}'); Memory.R2 = Object.keys(Game.rooms);`);
e.tick(); assert(M().OR === 0 && !M().R2.includes(target), 'observeRoom 返回 OK，本 tick 还不可见');
e.tick(); assert(M().R2.includes(target), '下一 tick 被观察房间进入 Game.rooms');
assert(e.snapshot('a').spawns.some(s => s.owner === 'b'), '观察期间渲染快照能看到 B 的 Spawn');
