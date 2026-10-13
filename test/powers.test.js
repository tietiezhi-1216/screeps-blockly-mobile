// Power Creep 全部技能：对照 engine/src/game/power-creeps.js（调用校验）+ processor/intents/power-creeps/usePower.js（tick 末生效）+ 各结构处理器
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const call = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); return r; };
const flush = e => { for (const c of e.w.creeps) if (c.owner === 'p1' && c._flushIntents) c._flushIntents(); };
const run = (e, code) => { const r = call(e, code); flush(e); return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {};
const w = e.w, ctrl = w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; ctrl.safeMode = 0; const sp = w.spawns[0], rn = roomName(sp.x, sp.y);
const fresh = () => { e._objVer++; e._o = null; };
const used = []; const free = (x0, y0, r0 = 1) => { for (let r = r0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (roomKey(x, y) === roomKey(x0, y0) && x % ROOM > 1 && y % ROOM > 1 && x % ROOM < 48 && y % ROOM < 48 && !e.solid(x, y) && e.tile(x, y) !== T_WALL && !w.creeps.some(c => c.x === x && c.y === y) && !used.some(u => u[0] === x && u[1] === y)) { used.push([x, y]); return [x, y]; } } };
const mk = (t, x, y, owner = 'p1') => { const s = e.makeStruct(t, owner, x, y); w.structures.push(s); fresh(); return s; };
const P = SC.POWER_INFO, L5 = n => P[n].effect[4];

// 创建并召唤 Operator
w.players.p1.power = 1e9; const ps = mk('powerSpawn', ...free(sp.x, sp.y, 2)); ps.store = { energy: 5000, power: 100 };
assert(run(e, `console.log(PowerCreep.create('op', POWER_CLASS.OPERATOR))`) === OK, 'PowerCreep.create');
const rec = w.powerCreeps[0]; rec.level = 25; for (const k in P) rec.powers[k] = { level: 5, cooldownTime: 0 };
assert(run(e, `console.log(Game.powerCreeps.op.spawn(Game.getObjectById('${ps.id}')))`) === OK, 'spawn');
let pc = w.creeps.find(c => c.pc === rec.id); pc.x = ps.x; pc.y = ps.y; const ppos = free(ps.x, ps.y); pc.x = ppos[0]; pc.y = ppos[1]; used.push(ppos); pc.store = { ops: 1000 }; fresh();
const reset = () => { for (const k in rec.powers) rec.powers[k].cooldownTime = 0; pc.store.ops = 1000; };
const use = (pw, id) => { reset(); return run(e, `console.log(Game.powerCreeps.op.usePower(${pw}${id ? `, Game.getObjectById('${id}')` : ''}))`); };
const eff = (o, pw) => (o.effects || []).find(f => f.power === pw && f.endTime > w.time);
const near = t => mk(t, ...free(pc.x, pc.y));

// 通用规则
assert(use(SC.PWR_GENERATE_OPS) === ERR_INVALID_ARGS, '房间未 enableRoom → ERR_INVALID_ARGS');
const cpos = free(ctrl.x, ctrl.y); const keep = [pc.x, pc.y]; pc.x = cpos[0]; pc.y = cpos[1]; fresh();
assert(call(e, `console.log(Game.powerCreeps.op.enableRoom(Game.getObjectById('${ctrl.id}')))`) === OK && !ctrl.isPowerEnabled, 'enableRoom 当 tick 只登记');
flush(e);
assert(ctrl.isPowerEnabled === true, 'enableRoom tick 末生效');
pc.x = keep[0]; pc.y = keep[1]; fresh();
reset(); assert(call(e, `console.log(Game.powerCreeps.op.usePower(PWR_GENERATE_OPS))`) === OK && pc.store.ops === 1000, 'usePower 当 tick 不生效（intent）');
flush(e); assert(pc.store.ops === 1000 + L5(SC.PWR_GENERATE_OPS), 'PWR_GENERATE_OPS +' + L5(SC.PWR_GENERATE_OPS) + '（tick 末）');
assert(rec.powers[SC.PWR_GENERATE_OPS].cooldownTime === w.time + P[SC.PWR_GENERATE_OPS].cooldown, '冷却 = cooldown');
assert(run(e, `console.log(Game.powerCreeps.op.usePower(PWR_GENERATE_OPS))`) === ERR_TIRED, '冷却中 ERR_TIRED');
reset(); pc.store.ops = 0; assert(run(e, `console.log(Game.powerCreeps.op.usePower(PWR_OPERATE_SPAWN, Game.getObjectById('${sp.id}')))`) === ERR_NOT_ENOUGH_RESOURCES, 'ops 不足 ERR_NOT_ENOUGH_RESOURCES');
delete rec.powers[SC.PWR_SHIELD]; assert(use(SC.PWR_SHIELD) === ERR_NO_BODYPART, '未学技能 ERR_NO_BODYPART'); rec.powers[SC.PWR_SHIELD] = { level: 5, cooldownTime: 0 };
assert(use(SC.PWR_OPERATE_SPAWN) === ERR_INVALID_TARGET, '有 range 的技能无目标 ERR_INVALID_TARGET');
assert(call(e, `console.log(typeof Game.powerCreeps.op.harvest + typeof Game.powerCreeps.op.attack + typeof Game.powerCreeps.op.transfer)`) === 'undefinedundefinedfunction', 'PowerCreep 无 harvest/attack，有 transfer');

// OPERATE_SPAWN：spawn 需距离 3 内
const spD = dist(sp, pc); const near3 = spD <= 3;
const farSpot = (() => { for (let r = 4; r < 20; r++) for (let dx = -r; dx <= r; dx++) { const x = sp.x + dx, y = sp.y + r; if (roomKey(x, y) === roomKey(sp.x, sp.y) && !e.solid(x, y) && e.tile(x, y) !== T_WALL) return [x, y]; } })();
const save = [pc.x, pc.y]; pc.x = farSpot[0]; pc.y = farSpot[1]; fresh();
assert(use(SC.PWR_OPERATE_SPAWN, sp.id) === ERR_NOT_IN_RANGE, '超出 range → ERR_NOT_IN_RANGE');
const sn = free(sp.x, sp.y); pc.x = sn[0]; pc.y = sn[1]; fresh();
assert(use(SC.PWR_OPERATE_SPAWN, sp.id) === OK && pc.store.ops === 1000 - P[SC.PWR_OPERATE_SPAWN].ops && eff(sp, SC.PWR_OPERATE_SPAWN).endTime === w.time + P[SC.PWR_OPERATE_SPAWN].duration, 'PWR_OPERATE_SPAWN：扣 ops、效果持续 duration');
sp.store.energy = 300; for (const x of w.structures) if (x.type === 'extension') x.store.energy = 0;
run(e, `Game.spawns['${sp.name}'].spawnCreep([WORK,CARRY,MOVE],'fast')`);
assert(sp.spawning && sp.spawning.needTime === Math.ceil(9 * L5(SC.PWR_OPERATE_SPAWN)), 'OPERATE_SPAWN 孵化时间 ×' + L5(SC.PWR_OPERATE_SPAWN));
// ERR_FULL：已有更高等级效果
rec.powers[SC.PWR_OPERATE_SPAWN].level = 1; assert(use(SC.PWR_OPERATE_SPAWN, sp.id) === ERR_FULL, '目标已有更高等级效果 → ERR_FULL'); rec.powers[SC.PWR_OPERATE_SPAWN].level = 5;
// DISRUPT_SPAWN
assert(use(SC.PWR_DISRUPT_SPAWN, sp.id) === OK && eff(sp, SC.PWR_DISRUPT_SPAWN), 'PWR_DISRUPT_SPAWN 效果');
const st0 = sp.spawning.spawnTime; e.tick(); assert(sp.spawning && sp.spawning.spawnTime === st0 + 1, 'DISRUPT_SPAWN：孵化暂停（spawnTime+1）');
sp.effects = []; pc.x = save[0]; pc.y = save[1]; fresh();
// 错误类型目标：返回 OK 但处理器静默忽略，不扣 ops、不进冷却
const ext0 = near('extension');
assert(use(SC.PWR_OPERATE_TOWER, ext0.id) === OK && !eff(ext0, SC.PWR_OPERATE_TOWER) && pc.store.ops === 1000 && !rec.powers[SC.PWR_OPERATE_TOWER].cooldownTime, '错误目标类型：OK 但静默无效（与官方处理器一致）');

// 塔：OPERATE_TOWER / DISRUPT_TOWER
const tw = near('tower'); tw.store = { energy: 1000 }; w.players.p2 = { name: 'F' };
const fpos = free(tw.x, tw.y); const foe = { kind: 'creep', id: 'foe', owner: 'p2', name: 'foe', body: Array(50).fill('tough'), hits: 5000, x: fpos[0], y: fpos[1], px: fpos[0], py: fpos[1], store: {}, ttl: 1000, fatigue: 0 }; w.creeps.push(foe); fresh();
const towerDmg = () => { w._elog = []; tw._acted = -1; tw.store.energy = 1000; run(e, `Game.getObjectById('${tw.id}').attack(Game.getObjectById('foe'))`); const ev = w._elog.find(x => x.e.event === SC.EVENT_ATTACK); return ev && ev.e.data.damage; };
const base = towerDmg();
use(SC.PWR_OPERATE_TOWER, tw.id); assert(towerDmg() === Math.floor(base * L5(SC.PWR_OPERATE_TOWER)), 'OPERATE_TOWER 伤害 ×' + L5(SC.PWR_OPERATE_TOWER));
use(SC.PWR_DISRUPT_TOWER, tw.id); assert(towerDmg() === Math.floor(base * L5(SC.PWR_OPERATE_TOWER) * L5(SC.PWR_DISRUPT_TOWER)), 'DISRUPT_TOWER 再 ×' + L5(SC.PWR_DISRUPT_TOWER) + '（先 operate 后 disrupt）');
assert(eff(tw, SC.PWR_DISRUPT_TOWER).endTime === w.time + P[SC.PWR_DISRUPT_TOWER].duration, 'DISRUPT_TOWER duration');
w.creeps.splice(w.creeps.indexOf(foe), 1); fresh();

// STORAGE
const sto = near('storage'); use(SC.PWR_OPERATE_STORAGE, sto.id);
assert(storeCap(w, sto, 'energy') === SC.STORAGE_CAPACITY + L5(SC.PWR_OPERATE_STORAGE), 'OPERATE_STORAGE 容量 +' + L5(SC.PWR_OPERATE_STORAGE));
assert(run(e, `console.log(Game.getObjectById('${sto.id}').store.getCapacity())`) === SC.STORAGE_CAPACITY + L5(SC.PWR_OPERATE_STORAGE), 'store.getCapacity() 反映 OPERATE_STORAGE');
// LAB
const lab = near('lab'), l1 = mk('lab', ...free(lab.x, lab.y)), l2 = mk('lab', ...free(lab.x, lab.y)); l1.store = { energy: 0, H: 100 }; l2.store = { energy: 0, O: 100 }; lab.store = { energy: 0 };
if (dist(l1, lab) <= 2 && dist(l2, lab) <= 2) { use(SC.PWR_OPERATE_LAB, lab.id); run(e, `Game.getObjectById('${lab.id}').runReaction(Game.getObjectById('${l1.id}'), Game.getObjectById('${l2.id}'))`);
  assert(lab.store.OH === SC.LAB_REACTION_AMOUNT + L5(SC.PWR_OPERATE_LAB), 'OPERATE_LAB 产量 ' + lab.store.OH); }
// EXTENSION：按与目标距离填充本房间 extension
for (const x of w.structures) if (x.type === 'extension') x.store.energy = 0;
sto.store = { energy: 100000 }; const exts = w.structures.filter(x => x.type === 'extension' && roomKey(x.x, x.y) === roomKey(pc.x, pc.y)); const capSum = exts.reduce((a, x) => a + storeCap(w, x, 'energy'), 0);
use(SC.PWR_OPERATE_EXTENSION, sto.id); const filled = exts.reduce((a, x) => a + (x.store.energy || 0), 0);
assert(filled === Math.min(100000, Math.floor(L5(SC.PWR_OPERATE_EXTENSION) * capSum)) && sto.store.energy === 100000 - filled, 'OPERATE_EXTENSION 从 storage 填充 extension ' + filled);
// OBSERVER
const ob = near('observer'); const OR = SC.OBSERVER_RANGE; SC.OBSERVER_RANGE = 0; // 世界只有 11×11：把常量临时调成 0 来验证“无限距离”
assert(run(e, `console.log(Game.getObjectById('${ob.id}').observeRoom('${roomNameXY((Math.floor(sp.x / ROOM) + 1) % w.S, Math.floor(sp.y / ROOM))}'))`) === ERR_NOT_IN_RANGE, '无效果：超出 OBSERVER_RANGE');
use(SC.PWR_OPERATE_OBSERVER, ob.id); assert(run(e, `console.log(Game.getObjectById('${ob.id}').observeRoom('${roomNameXY((Math.floor(sp.x / ROOM) + 1) % w.S, Math.floor(sp.y / ROOM))}'))`) === OK, 'OPERATE_OBSERVER：无限距离');
assert(eff(ob, SC.PWR_OPERATE_OBSERVER).endTime === w.time + P[SC.PWR_OPERATE_OBSERVER].duration[4], 'OPERATE_OBSERVER duration 按等级数组');
SC.OBSERVER_RANGE = OR;
// TERMINAL
const term = near('terminal'); term.store = { energy: 100000, H: 10000 };
const ox = Math.floor(sp.x / ROOM), oy = Math.floor(sp.y / ROOM), dx = ox + 5 < w.S ? ox + 5 : ox - 5; ensureRoom(w, dx, oy);
const t2 = e.makeStruct('terminal', 'p1', dx * ROOM + 25, oy * ROOM + 25); w.structures.push(t2); fresh();
const sendCost = () => { term.cooldown = 0; term.store.energy = 100000; run(e, `Game.getObjectById('${term.id}').send('H', 1000, '${roomNameXY(dx, oy)}')`); return 100000 - term.store.energy; };
const c0 = sendCost(); use(SC.PWR_OPERATE_TERMINAL, term.id); const c1 = sendCost();
assert(c1 === Math.ceil(c0 * L5(SC.PWR_OPERATE_TERMINAL)) && term.cooldown === Math.round(SC.TERMINAL_COOLDOWN * L5(SC.PWR_OPERATE_TERMINAL)), 'OPERATE_TERMINAL 费用/冷却 ×' + L5(SC.PWR_OPERATE_TERMINAL));
const wd = { kind: 'creep', id: 'wd', owner: 'p1', name: 'wd', body: ['carry', 'move'], hits: 200, x: 0, y: 0, store: {}, ttl: 1000, fatigue: 0 }; const wp = free(term.x, term.y); wd.x = wd.px = wp[0]; wd.y = wd.py = wp[1]; w.creeps.push(wd); fresh();
assert(use(SC.PWR_DISRUPT_TERMINAL, term.id) === OK && pc.store.ops === 1000 - P[SC.PWR_DISRUPT_TERMINAL].ops[4], 'DISRUPT_TERMINAL ops 按等级数组 ' + P[SC.PWR_DISRUPT_TERMINAL].ops[4]);
assert(run(e, `console.log(Game.creeps.wd.withdraw(Game.getObjectById('${term.id}'), 'H'))`) === ERR_INVALID_TARGET, 'DISRUPT_TERMINAL：withdraw → ERR_INVALID_TARGET');
sto.store.energy = 100; for (const x of exts) x.store.energy = 0; term.store.energy = 5000; use(SC.PWR_OPERATE_EXTENSION, term.id);
assert(exts.every(x => !x.store.energy), 'DISRUPT_TERMINAL 中的 terminal 不能作为 OPERATE_EXTENSION 来源');
// SOURCE
const src = w.sources.find(s => roomKey(s.x, s.y) === roomKey(sp.x, sp.y)); const sv = free(src.x, src.y, 2); pc.x = sv[0]; pc.y = sv[1]; fresh();
if (dist(src, pc) <= 3) {
  src.energy = 0; src.regenAt = w.time + 100; use(SC.PWR_DISRUPT_SOURCE, src.id); const ra = src.regenAt; e.tick(); assert(src.regenAt === ra + 1, 'DISRUPT_SOURCE：再生推迟');
  src.effects = []; src.energy = 0; src.regenAt = w.time + 300; use(SC.PWR_REGEN_SOURCE, src.id); const re = eff(src, SC.PWR_REGEN_SOURCE); let gained = 0;
  for (let i = 0; i < P[SC.PWR_REGEN_SOURCE].period + 1; i++) { const b = src.energy; e.tick(); gained += src.energy - b; }
  assert(gained === L5(SC.PWR_REGEN_SOURCE), 'REGEN_SOURCE 每 ' + P[SC.PWR_REGEN_SOURCE].period + ' tick +' + L5(SC.PWR_REGEN_SOURCE));
}
// MINERAL
const mn = w.minerals.find(m => roomKey(m.x, m.y) === roomKey(sp.x, sp.y));
if (mn) { const mv = free(mn.x, mn.y, 2); pc.x = mv[0]; pc.y = mv[1]; fresh(); mn.amount = 0;
  use(SC.PWR_REGEN_MINERAL, mn.id); assert(!eff(mn, SC.PWR_REGEN_MINERAL), 'REGEN_MINERAL：矿量为 0 时无效');
  mn.amount = 1000; mn.regenAt = null; use(SC.PWR_REGEN_MINERAL, mn.id); let g = 0; for (let i = 0; i < P[SC.PWR_REGEN_MINERAL].period + 1; i++) { const b = mn.amount; e.tick(); g += mn.amount - b; }
  assert(g === L5(SC.PWR_REGEN_MINERAL), 'REGEN_MINERAL 每 period +' + L5(SC.PWR_REGEN_MINERAL)); }
// CONTROLLER
const cv = free(ctrl.x, ctrl.y, 2); pc.x = cv[0]; pc.y = cv[1]; fresh(); rec.powers[SC.PWR_OPERATE_CONTROLLER].level = 1; use(SC.PWR_OPERATE_CONTROLLER, ctrl.id); // 等级 1：+10 → 上限 25（< 40 WORK）
const ups = free(ctrl.x, ctrl.y); w.creeps.push({ kind: 'creep', id: 'up', owner: 'p1', name: 'up', body: Array(40).fill('work').concat(Array(10).fill('carry')), hits: 5000, x: ups[0], y: ups[1], px: ups[0], py: ups[1], store: { energy: 500 }, ttl: 1000, fatigue: 0 }); fresh();
ctrl._upCnt = 0; run(e, `Game.creeps.up.upgradeController(Game.getObjectById('${ctrl.id}'))`);
assert(500 - w.creeps.find(c => c.id === 'up').store.energy === SC.CONTROLLER_MAX_UPGRADE_PER_TICK + P[SC.PWR_OPERATE_CONTROLLER].effect[0], 'OPERATE_CONTROLLER：RCL8 上限 +' + P[SC.PWR_OPERATE_CONTROLLER].effect[0]);
// POWER
pc.x = save[0]; pc.y = save[1]; fresh(); if (dist(ps, pc) <= 3) { use(SC.PWR_OPERATE_POWER, ps.id); ps.store = { energy: 5000, power: 100 }; const g0 = w.players.p1.power; ps._pp = -1;
  run(e, `Game.getObjectById('${ps.id}').processPower()`); assert(w.players.p1.power - g0 === 1 + L5(SC.PWR_OPERATE_POWER) && ps.store.energy === 5000 - (1 + L5(SC.PWR_OPERATE_POWER)) * SC.POWER_SPAWN_ENERGY_RATIO, 'OPERATE_POWER 每 tick 处理 ' + (1 + L5(SC.PWR_OPERATE_POWER))); }
// FORTIFY
const wall = near('constructedWall'); wall.hits = 1000; use(SC.PWR_FORTIFY, wall.id);
assert(eff(wall, SC.PWR_FORTIFY).endTime === w.time + P[SC.PWR_FORTIFY].duration[4], 'FORTIFY duration[level]');
e.damage(wall, 500, 'p2'); assert(wall.hits === 1000, 'FORTIFY：墙不受伤害');
const dm = { kind: 'creep', id: 'dm', owner: 'p1', name: 'dm', body: ['work', 'attack', 'move'], hits: 300, x: 0, y: 0, store: {}, ttl: 1000, fatigue: 0 }; const dp = free(wall.x, wall.y); dm.x = dm.px = dp[0]; dm.y = dm.py = dp[1]; w.creeps.push(dm); fresh();
assert(run(e, `console.log(Game.creeps.dm.dismantle(Game.getObjectById('${wall.id}')))`) === ERR_INVALID_TARGET && run(e, `console.log(Game.creeps.dm.attack(Game.getObjectById('${wall.id}')))`) === ERR_INVALID_TARGET, 'FORTIFY：dismantle/attack → ERR_INVALID_TARGET');
// SHIELD
const before = w.structures.length; assert(use(SC.PWR_SHIELD) === OK, 'SHIELD 无需目标');
const sh = w.structures.find(s => s.type === 'rampart' && s.x === pc.x && s.y === pc.y);
assert(sh && sh.hits === L5(SC.PWR_SHIELD) && sh.hitsMax === 0 && pc.store.ops === 1000 && eff(sh, SC.PWR_SHIELD), 'SHIELD：脚下临时 rampart，hits=' + L5(SC.PWR_SHIELD) + '，不耗 ops');
const sEnd = sh.shield; while (w.time < sEnd + 1) e.tick(); assert(!w.structures.includes(sh), 'SHIELD rampart 到期移除');
// FACTORY
const fac = near('factory'); use(SC.PWR_OPERATE_FACTORY, fac.id); assert(fac.level === 5 && eff(fac, SC.PWR_OPERATE_FACTORY), 'OPERATE_FACTORY 设定工厂等级 5');
rec.powers[SC.PWR_OPERATE_FACTORY].level = 3; fac.effects = []; assert(use(SC.PWR_OPERATE_FACTORY, fac.id) === OK && !eff(fac, SC.PWR_OPERATE_FACTORY), '工厂等级不符：静默无效');
// 事件日志
w._elog = []; use(SC.PWR_GENERATE_OPS); assert(w._elog.some(x => x.e.event === SC.EVENT_POWER && x.e.data.power === SC.PWR_GENERATE_OPS), 'EVENT_POWER');
// renew
const pcRaw = w.creeps.find(c => c.pc === rec.id); const rv = free(ps.x, ps.y); pcRaw.x = rv[0]; pcRaw.y = rv[1]; pcRaw.ttl = 100; fresh();
assert(call(e, `console.log(Game.powerCreeps.op.renew(Game.getObjectById('${ps.id}')))`) === OK && pcRaw.ttl === 100, 'renew 当 tick 只登记'); flush(e);
assert(pcRaw.ttl === SC.POWER_CREEP_LIFE_TIME, 'renew tick 末 TTL 回满');
console.log('ALL PASS');
