// 建筑/控制器 intent：对照 engine/src/processor.js —— 玩家代码结束后才结算，同名 intent 后者覆盖，塔 heal>repair>attack 互斥，halt 丢弃
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const call = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {};
const w = e.w, ctrl = w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; const sp = w.spawns[0];
const fresh = () => { e._objVer++; e._o = null; };
const used = []; const free = (x0, y0) => { for (let r = 2; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (roomKey(x, y) === roomKey(x0, y0) && x % ROOM > 1 && y % ROOM > 1 && x % ROOM < 48 && y % ROOM < 48 && !e.solid(x, y) && e.tile(x, y) !== T_WALL && !w.creeps.some(c => c.x === x && c.y === y) && !used.some(u => u[0] === x && u[1] === y)) { used.push([x, y]); return [x, y]; } } throw new Error('no free'); };
const mk = (t, owner = 'p1') => { const [x, y] = free(sp.x, sp.y); const s = e.makeStruct(t, owner, x, y); w.structures.push(s); fresh(); return s; };

// spawnCreep：调用时只登记，代码结束后才扣能量；Memory 在调用时写入；同 tick 重名 ERR_NAME_EXISTS
sp.store.energy = 300;
assert(call(e, `console.log(Game.spawns.Spawn1.spawnCreep([WORK,CARRY,MOVE], 'a', {memory:{r:1}}))`) === OK && sp.store.energy === 300 && !sp.spawning, 'spawnCreep 返回 OK 但尚未扣能量/开始孵化');
assert(w.memory.p1.creeps.a.r === 1, 'Memory.creeps 在调用时写入（官方 game/structures.js）');
assert(call(e, `console.log(Game.spawns.Spawn1.spawnCreep([MOVE], 'a'))`) === ERR_NAME_EXISTS, '同 tick 重名 ERR_NAME_EXISTS');
e.flushIntents('p1'); assert(sp.store.energy === 100 && sp.spawning && sp.spawning.name === 'a', '结算后扣 200 能量并开始孵化');
w._spawnedNames = {};

// 塔：heal > repair > attack 互斥，只扣一次能量
const tw = mk('tower'); tw.store = { energy: 1000 }; w.players.p2 = { name: 'F' };
const [fx, fy] = free(tw.x, tw.y), [mx, my] = free(tw.x, tw.y);
const foe = { kind: 'creep', id: 'foe', owner: 'p2', name: 'foe', body: Array(10).fill('tough'), hits: 1000, x: fx, y: fy, px: fx, py: fy, store: {}, ttl: 1000, fatigue: 0 };
const me = { kind: 'creep', id: 'me', owner: 'p1', name: 'me', body: Array(10).fill('move'), hits: 500, x: mx, y: my, px: mx, py: my, store: {}, ttl: 1000, fatigue: 0 };
w.creeps.push(foe, me); fresh();
assert(call(e, `const t = Game.getObjectById('${tw.id}'); console.log(t.attack(Game.getObjectById('foe')) + t.heal(Game.getObjectById('me')))`) === OK, '塔 attack+heal 都返回 OK');
assert(tw.store.energy === 1000, '调用时不扣能量');
e.flushIntents('p1'); e.applyHits();
assert(tw.store.energy === 990 && me.hits > 500 && foe.hits === 1000, '结算：只执行 heal（官方优先级），能量只扣 10');

// link：延迟结算
const l1 = mk('link'), l2 = mk('link'); l1.store = { energy: 400 }; l2.store = { energy: 0 }; l1.cooldown = 0;
assert(call(e, `console.log(Game.getObjectById('${l1.id}').transferEnergy(Game.getObjectById('${l2.id}'), 100))`) === OK && l1.store.energy === 400, 'link.transferEnergy 调用时不生效');
e.flushIntents('p1'); assert(l1.store.energy === 300 && l2.store.energy === 97, '结算后转移（3% 损耗）');

// 同名 intent 后者覆盖
l1.cooldown = 0; call(e, `const l = Game.getObjectById('${l1.id}'), t = Game.getObjectById('${l2.id}'); l.transferEnergy(t, 100); l.transferEnergy(t, 50);`);
e.flushIntents('p1'); assert(l1.store.energy === 250, '同 tick 两次 transferEnergy 只执行最后一次');

// rampart.setPublic / notifyWhenAttacked
const rp = mk('rampart'); rp.isPublic = false;
call(e, `const r = Game.getObjectById('${rp.id}'); r.setPublic(true); r.notifyWhenAttacked(false)`);
assert(!rp.isPublic && rp.notifyAttacked !== false, 'setPublic/notifyWhenAttacked 调用时不生效');
e.flushIntents('p1'); assert(rp.isPublic === true && rp.notifyAttacked === false, '结算后生效');
assert(call(e, `console.log(Game.getObjectById('${rp.id}').notifyWhenAttacked('x'))`) === ERR_INVALID_ARGS, 'notifyWhenAttacked 非布尔 ERR_INVALID_ARGS');
assert(call(e, `console.log(Game.creeps.me.notifyWhenAttacked(false))`) === OK && me.notifyAttacked === false, 'creep.notifyWhenAttacked 设置标志');

// halt：本 tick 建筑 intent 被丢弃
l1.cooldown = 0; const before = l1.store.energy;
e.fns.p1 = compileUser(`Game.getObjectById('${l1.id}').transferEnergy(Game.getObjectById('${l2.id}'), 100); Game.cpu.halt();`);
e.tick(); assert(l1.store.energy === before, 'Game.cpu.halt 丢弃本 tick 的建筑 intent');
console.log('structures: all ok');
let nr = []; for (let i = 0; i < 21; i++) nr.push(call(e, `console.log(Game.notify('m'))`)); // 同一 tick
assert(nr.slice(0, 20).every(x => x === OK) && nr[20] === ERR_FULL, 'Game.notify 每 tick 最多 20 条');
assert(call(e, `console.log(Game.cpu.getHeapStatistics().used_heap_size > 0)`) === true, 'getHeapStatistics 返回真实堆数据');
