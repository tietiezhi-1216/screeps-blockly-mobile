// v1.7 扩展：getEventLog / RoomVisual / Power Creeps / Deposits / Market / OPERATE_FACTORY 等级商品
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); for (const c of e.w.creeps) if (c.owner === 'p1' && c._flushIntents) c._flushIntents(); return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {};
const ctrl = e.w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; ctrl.safeMode = 0; const sp = e.w.spawns[0], rn = roomName(sp.x, sp.y);
const fresh = () => { e._objVer++; e._o = null; };
const mk = (t, dx, dy) => { const s = e.makeStruct(t, 'p1', sp.x + dx, sp.y + dy); e.w.structures.push(s); fresh(); return s; };
const id = s => `Game.getObjectById('${s.id}')`;
// RoomVisual
run(e, `new RoomVisual('${rn}').circle(10,10,{fill:'red'}).line(1,1,5,5).rect(2,2,3,3).poly([[1,1],[2,3]]).text('hi',20,20); Game.rooms['${rn}'].visual.text('x', new RoomPosition(5,5,'${rn}'))`);
const vs = e.w._visuals.p1[rn]; assert(vs.length === 6 && vs[4].text === 'hi' && vs[5].x === 5, 'RoomVisual circle/line/rect/poly/text 记录 ' + vs.length);
assert(run(e, `const v=new RoomVisual('${rn}'); console.log(v.getSize()>0 && v.export().split('\\n').length)`) === 6, 'getSize/export');
assert(run(e, `const v=new RoomVisual('E0S0'); v.import(new RoomVisual('${rn}').export()); const n=v.export().split('\\n').length; v.clear(); console.log(n+':'+v.getSize())`) === '6:2', 'import/clear');
assert(e.snapshot().visuals.p1[rn].length === 6, 'snapshot.visuals 供渲染');
e.tick(); assert(!(e.w._visuals.p1 && e.w._visuals.p1[rn]), '下一 tick 视觉清空');
// getEventLog：上一 tick 的 harvest
const src = e.w.sources.find(s => roomKey(s.x, s.y) === roomKey(sp.x, sp.y)); src.energy = 3000;
const spot = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].map(([a, b]) => [src.x + a, src.y + b]).find(([x, y]) => !e.blocked(x, y));
e.w.creeps.push({ kind: 'creep', id: 'hv', owner: 'p1', name: 'hv', body: ['work', 'carry', 'move'], hits: 300, x: spot[0], y: spot[1], px: spot[0], py: spot[1], store: {}, ttl: 1000, fatigue: 0 }); fresh();
e.setCode('p1', `Game.creeps.hv && Game.creeps.hv.harvest(Game.getObjectById('${src.id}'))`); e.tick(); e.setCode('p1', '');
const lg = JSON.parse(run(e, `console.log(Game.rooms['${rn}'].getEventLog(true))`));
assert(lg.some(x => x.event === SC.EVENT_HARVEST && x.objectId === 'hv' && x.data.targetId === src.id), 'getEventLog(raw) 含 EVENT_HARVEST');
assert(run(e, `console.log(Array.isArray(Game.rooms['${rn}'].getEventLog()))`) === true, 'getEventLog 返回数组');
// Power：processPower → GPL → 创建 power creep
const ps = mk('powerSpawn', -2, 2); ps.store = { energy: 5000, power: 100 }; e.w.players.p1.power = 0;
for (let i = 0; i < 2; i++) { run(e, `${id(ps)}.processPower()`); e.tick(); } e.w.players.p1.power = 1000;
assert(run(e, `console.log(Game.gpl.level)`) === 1, 'GPL：1000 power → level 1');
assert(run(e, `console.log(PowerCreep.create('op', POWER_CLASS.OPERATOR))`) === OK, 'PowerCreep.create');
assert(run(e, `console.log(PowerCreep.create('op2', POWER_CLASS.OPERATOR))`) === ERR_NOT_ENOUGH_RESOURCES, 'GPL 不足 ERR_NOT_ENOUGH_RESOURCES');
e.w.players.p1.power = 4000 * 4;
assert(run(e, `console.log(Game.powerCreeps.op.upgrade(PWR_GENERATE_OPS))`) === OK && run(e, `console.log(Game.powerCreeps.op.level)`) === 1, 'upgrade PWR_GENERATE_OPS');
assert(run(e, `console.log(Game.powerCreeps.op.spawn(${id(ps)}))`) === OK, 'spawn 在 PowerSpawn');
assert(run(e, `console.log(Object.keys(Game.creeps).includes('op'))`) === false && run(e, `console.log(Game.powerCreeps.op.ticksToLive)`) === SC.POWER_CREEP_LIFE_TIME, 'Game.creeps 不含 power creep；TTL 5000');
assert(run(e, `console.log(Game.powerCreeps.op.usePower(PWR_GENERATE_OPS))`) === ERR_INVALID_ARGS, '房间未 enableRoom → ERR_INVALID_ARGS');
const pc = e.w.creeps.find(c => c.pc); pc.x = ctrl.x + 1; pc.y = ctrl.y; if (e.solid(pc.x, pc.y)) { pc.x = ctrl.x; pc.y = ctrl.y + 1; } fresh();
assert(run(e, `console.log(Game.powerCreeps.op.enableRoom(Game.rooms['${rn}'].controller))`) === OK && ctrl.isPowerEnabled, 'enableRoom');
assert(run(e, `console.log(Game.powerCreeps.op.usePower(PWR_GENERATE_OPS))`) === OK && pc.store.ops === 1, 'PWR_GENERATE_OPS +1 ops');
assert(run(e, `console.log(Game.powerCreeps.op.usePower(PWR_GENERATE_OPS))`) === ERR_TIRED, '技能冷却 ERR_TIRED');
// OPERATE_FACTORY → 等级商品
const rec = e.w.powerCreeps[0]; rec.level = 1; rec.powers[SC.PWR_OPERATE_FACTORY] = { level: 1, cooldownTime: 0 }; pc.store.ops = 200;
const fac = mk('factory', pc.x - sp.x + 1, pc.y - sp.y); fresh();
assert(run(e, `console.log(Game.powerCreeps.op.usePower(PWR_OPERATE_FACTORY, ${id(fac)}))`) === OK && fac.level === 1 && fac.effects.length === 1, 'PWR_OPERATE_FACTORY 设置工厂等级 1 + 效果');
const lvl1 = Object.keys(SC.COMMODITIES).find(k => SC.COMMODITIES[k].level === 1); const comp = SC.COMMODITIES[lvl1].components; fac.store = Object.assign({}, comp);
assert(run(e, `console.log(${id(fac)}.produce('${lvl1}'))`) === OK && fac.store[lvl1] >= 1, '等级 1 商品 ' + lvl1 + ' 可生产');
fac.cooldown = 0; fac.effects = []; fac.store = Object.assign({}, comp);
assert(run(e, `console.log(${id(fac)}.produce('${lvl1}'))`) === ERR_BUSY, '无效果 → ERR_BUSY');
// Deposits
const dep = e.spawnDeposits(true); assert(dep && dep.kind === 'deposit', 'deposit 生成于高速公路房间 ' + roomName(dep.x, dep.y));
const dspot = [[1,0],[-1,0],[0,1],[0,-1]].map(([a, b]) => [dep.x + a, dep.y + b]).find(([x, y]) => !e.solid(x, y));
e.w.creeps.push({ kind: 'creep', id: 'dh', owner: 'p1', name: 'dh', body: ['work', 'work', 'carry', 'move'], hits: 400, x: dspot[0], y: dspot[1], px: dspot[0], py: dspot[1], store: {}, ttl: 1000, fatigue: 0 }); fresh();
const vis = e.w.players.p1; // deposit 房间可能不可见：用 getObjectById（扩展可见）
assert(run(e, `console.log(Game.creeps.dh.harvest(Game.getObjectById('${dep.id}')))`) === OK && e.w.creeps.find(c => c.id === 'dh').store[dep.depositType] === 2, 'harvest deposit 每 WORK 1');
assert(dep.lastCooldown === Math.ceil(SC.DEPOSIT_EXHAUST_MULTIPLY * Math.pow(2, SC.DEPOSIT_EXHAUST_POW)) && run(e, `console.log(Game.creeps.dh.harvest(Game.getObjectById('${dep.id}')))`) === ERR_TIRED, '冷却 = ceil(0.001*h^1.2)，冷却中 ERR_TIRED');
e.tick(); e.tick(); assert(run(e, `console.log(Game.getObjectById('${dep.id}').ticksToDecay)`) <= SC.DEPOSIT_DECAY_TIME, 'ticksToDecay');
dep.decayAt = e.w.time + 1; e.tick(); assert(!e.w.deposits.includes(dep), 'deposit 衰减消失');
// Market
e.w.time = 500; e.tick(); const T = mk('terminal', 3, -3); T.store = { energy: 10000, H: 1000 };
const npcBuyH = e.w.market.orders.find(o => o.npc && o.type === 'buy' && o.resourceType === 'H');
assert(npcBuyH, 'NPC 订单存在于十字路口 ' + npcBuyH.roomName);
assert(run(e, `console.log(Game.market.deal('${npcBuyH.id}', 100, '${rn}'))`) === OK && e.w.players.p1.credits > 0 && T.store.H === 900, 'deal 卖给 NPC：得到信用点、扣资源');
T.cooldown = 0; const cr0 = e.w.players.p1.credits;
assert(run(e, `console.log(Game.market.createOrder({type:ORDER_SELL, resourceType:RESOURCE_HYDROGEN, price:1, totalAmount:100, roomName:'${rn}'}))`) === OK && Math.abs(e.w.players.p1.credits - (cr0 - 5)) < 1e-6, 'createOrder 收 5% 手续费');
const myId = run(e, `console.log(Object.keys(Game.market.orders)[0])`);
assert(run(e, `console.log(Game.market.extendOrder('${myId}', 100))`) === OK && run(e, `console.log(Game.market.changeOrderPrice('${myId}', 2))`) === OK, 'extendOrder / changeOrderPrice');
assert(run(e, `console.log(Game.market.getOrderById('${myId}').price)`) === 2 && run(e, `console.log(Game.market.getAllOrders({resourceType:'H', type:'sell'}).length)`) >= 1, 'getOrderById / getAllOrders(filter)');
assert(run(e, `console.log(Game.market.cancelOrder('${myId}'))`) === OK && run(e, `console.log(Game.market.getHistory('H').length)`) === 1, 'cancelOrder / getHistory');
e.w.players.p1.credits = 0; const npcSell = e.w.market.orders.find(o => o.npc && o.type === 'sell');
assert(run(e, `console.log(Game.market.deal('${npcSell.id}', 10, '${rn}'))`) === ERR_NOT_ENOUGH_RESOURCES, '信用点不足 ERR_NOT_ENOUGH_RESOURCES');
console.log('ALL PASS');
