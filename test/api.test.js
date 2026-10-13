// 官方 API 补全测试：Lab / Observer / Terminal / transfer→controller / drop 参数
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); e.flushIntents('p1'); e.applyHits(); /* 模拟 tick 末伤害/治疗结算 */ return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T');
const ctrl = e.w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; const sp = e.w.spawns[0];
const mk = (t, dx, dy) => { const s = e.makeStruct(t, 'p1', sp.x + dx, sp.y + dy); e.w.structures.push(s); e._objVer++; e._o = null; return s; };
const L0 = mk('lab', 3, 0), L1 = mk('lab', 4, 0), L2 = mk('lab', 5, 0);
L1.store.H = 10; L2.store.O = 10;
const id = s => `Game.getObjectById('${s.id}')`;
assert(run(e, `console.log(${id(L0)}.runReaction(${id(L1)}, ${id(L2)}))`) === OK && L0.store.OH === 5 && L1.store.H === 5 && L0.cooldown === SC.REACTION_TIME.OH, 'runReaction H+O→OH 5 单位，冷却 REACTION_TIME');
assert(run(e, `console.log(${id(L0)}.runReaction(${id(L1)}, ${id(L2)}))`) === ERR_TIRED, '冷却中 ERR_TIRED');
L0.cooldown = 0; L2.store = { energy: 0, U: 10 };
assert(run(e, `console.log(${id(L0)}.runReaction(${id(L1)}, ${id(L2)}))`) === ERR_FULL, 'H+U 产物与已有 OH 不同→ERR_FULL');
const L3 = mk('lab', 3, 1); L3.store = { energy: 0, X: 10 }; L1.store = { energy: 0, Z: 10 };
assert(run(e, `console.log(${id(L0)}.runReaction(${id(L1)}, ${id(L3)}))`) === ERR_INVALID_ARGS, '无效配方 ERR_INVALID_ARGS');
L1.store = { energy: 0 }; L2.store = { energy: 0 };
assert(run(e, `console.log(${id(L0)}.reverseReaction(${id(L1)}, ${id(L2)}))`) === OK && L0.store.OH === 0 && (L1.store.O + L2.store.H === 10 || L1.store.H + L2.store.O === 10), 'reverseReaction OH→O+H');
assert(run(e, `console.log(Game.getObjectById('${L0.id}').mineralCapacity)`) === SC.LAB_MINERAL_CAPACITY, 'lab.mineralCapacity');
const ob = mk('observer', 0, 3), rn = roomName(sp.x, sp.y);
assert(run(e, `console.log(${id(ob)}.observeRoom('${rn}'))`) === OK, 'observeRoom 本房间 OK');
assert(run(e, `console.log(${id(ob)}.observeRoom('foo'))`) === ERR_INVALID_ARGS, 'observeRoom 非法名 ERR_INVALID_ARGS');
const T1 = mk('terminal', 0, 4); T1.store = { energy: 1000 };
assert(run(e, `console.log(${id(T1)}.send(RESOURCE_ENERGY, 100, 'W99N99'))`) === OK && T1.store.energy === 1000, '官方：send 到无 terminal 的合法房间返回 OK（tick 末无效果）');
// transfer 给 controller 不得吞资源
e.tick(); e.tick();
