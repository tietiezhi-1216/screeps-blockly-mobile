// 官方对齐第二轮：完整事件日志 / 市场与 deposit 走 tick 末 intent / Power 全技能 / keeper / 新手区 / RawMemory / Game.cpu / boosts
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
// tick 内跑代码（不结算）：只调用 API，返回 console.log 值
const call = (e, code, pid = 'p1') => { const f = compileUser(code); let r; const api = e.buildApi(pid); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); return r; };
const flush = (e, pid = 'p1') => { for (const c of e.w.creeps) if (c.owner === pid && c._flushIntents) c._flushIntents(); e.applyHits(); /* 模拟 tick 末伤害/治疗结算 */ for (const it of ((e.w.market || {}).intents || []).splice(0)) it(); };
const run = (e, code, pid) => { const r = call(e, code, pid); flush(e, pid); return r; };
const mkE = () => { const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {}; const ctrl = e.w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; ctrl.safeMode = 0; return e; };
let e = mkE(); const sp = e.w.spawns[0], rn = roomName(sp.x, sp.y);
const fresh = () => { e._objVer++; e._o = null; };
const free = (x0, y0, skip = []) => { for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (roomKey(x, y) === roomKey(x0, y0) && !e.solid(x, y) && !e.w.creeps.some(c => c.x === x && c.y === y) && !skip.some(s => s[0] === x && s[1] === y)) return [x, y]; } };
const mkC = (id, body, x, y, owner = 'p1', extra = {}) => { const c = Object.assign({ kind: 'creep', id, owner, name: id, body, hits: body.length * 100, x, y, px: x, py: y, store: {}, ttl: 1000, fatigue: 0 }, extra); e.w.creeps.push(c); fresh(); return c; };
const mk = (t, x, y, owner = 'p1') => { const s = e.makeStruct(t, owner, x, y); e.w.structures.push(s); fresh(); return s; };
const tickWith = (code) => { e.setCode('p1', code); e.tick(); e.setCode('p1', ''); };
const evlog = () => call(e, `console.log(Game.rooms['${rn}'].getEventLog())`);

// ===== 事件日志：完整官方 payload =====
const src = e.w.sources.find(s => roomKey(s.x, s.y) === roomKey(sp.x, sp.y)); src.energy = 3000;
const hs = free(src.x, src.y); const hv = mkC('hv', ['work', 'work', 'carry', 'move'], hs[0], hs[1]);
tickWith(`Game.creeps.hv.harvest(Game.getObjectById('${src.id}'))`);
let L = evlog(); let h = L.find(x => x.event === SC.EVENT_HARVEST);
assert(h && h.objectId === 'hv' && h.data.targetId === src.id && h.data.amount === 4, 'EVENT_HARVEST {objectId, targetId, amount=4}');
const a1 = free(sp.x + 3, sp.y + 3), att = mkC('att', ['attack', 'attack', 'move'], a1[0], a1[1]);
const a2 = [a1[0] + 1, a1[1]]; if (e.solid(a2[0], a2[1])) throw new Error('测试地形');
const foe = mkC('foe', ['attack', 'move', 'move'], a2[0], a2[1], 'p2', { hits: 300 }); e.w.players.p2 = e.w.players.p2 || { name: 'F' };
tickWith(`Game.creeps.att.attack(Game.getObjectById('foe'))`);
L = evlog(); const am = L.find(x => x.event === SC.EVENT_ATTACK && x.objectId === 'att'), hb = L.find(x => x.event === SC.EVENT_ATTACK && x.objectId === 'foe');
assert(am && am.data.targetId === 'foe' && am.data.damage === 60 && am.data.attackType === SC.EVENT_ATTACK_TYPE_MELEE, 'EVENT_ATTACK 近战 damage=60');
assert(hb && hb.data.targetId === 'att' && hb.data.damage === 30 && hb.data.attackType === SC.EVENT_ATTACK_TYPE_HIT_BACK, 'EVENT_ATTACK HIT_BACK 反击');
hv.store = { energy: 50 }; const ext = mk('extension', ...free(hv.x, hv.y));
tickWith(`Game.creeps.hv.transfer(Game.getObjectById('${ext.id}'), RESOURCE_ENERGY, 20)`);
L = evlog(); const tr = L.find(x => x.event === SC.EVENT_TRANSFER);
assert(tr && tr.objectId === 'hv' && tr.data.targetId === ext.id && tr.data.amount === 20 && tr.data.resourceType === 'energy', 'EVENT_TRANSFER {targetId, resourceType, amount}');
hv.store = { energy: 50 }; const sitePos = free(hv.x, hv.y); e.w.sites.push({ kind: 'site', id: 'st1', type: 'road', owner: 'p1', x: sitePos[0], y: sitePos[1], progress: 0, total: 300 }); fresh();
tickWith(`Game.creeps.hv.build(Game.getObjectById('st1'))`);
L = evlog(); const bd = L.find(x => x.event === SC.EVENT_BUILD);
assert(bd && bd.data.targetId === 'st1' && bd.data.amount === 10 && bd.data.energySpent === 10 && bd.data.structureType === 'road' && bd.data.incomplete === true && bd.data.x === sitePos[0] % ROOM, 'EVENT_BUILD 完整字段');
const ctrl = e.w.controllers.find(c => c.owner === 'p1'); const us = free(ctrl.x, ctrl.y); const up = mkC('up', ['work', 'carry', 'move'], us[0], us[1], 'p1', { store: { energy: 50 } });
tickWith(`Game.creeps.up.upgradeController(Game.getObjectById('${ctrl.id}'))`);
L = evlog(); const ug = L.find(x => x.event === SC.EVENT_UPGRADE_CONTROLLER);
assert(ug && ug.objectId === 'up' && ug.data.amount === 1 && ug.data.energySpent === 1, 'EVENT_UPGRADE_CONTROLLER {amount, energySpent}');
// 销毁
foe.hits = 10; tickWith(`Game.creeps.att.attack(Game.getObjectById('foe'))`);
L = evlog(); assert(L.some(x => x.event === SC.EVENT_OBJECT_DESTROYED && x.objectId === 'foe' && x.data.type === 'creep'), 'EVENT_OBJECT_DESTROYED {type:creep}');
// EXIT：移到房间边缘再出门
const rx = Math.floor(sp.x / ROOM), ry = Math.floor(sp.y / ROOM); let ex = null;
for (let y = ry * ROOM + 1; y < ry * ROOM + 49 && !ex; y++) { const x = rx * ROOM + 49; if (e.tile(x, y) !== T_WALL && e.tile(x + 1, y) !== T_WALL && !e.solid(x + 1, y)) ex = [x, y]; }
if (ex) { mkC('ex', ['move'], ex[0], ex[1]); tickWith(`Game.creeps.ex.move(RIGHT)`); L = evlog(); const xe = L.find(x => x.event === SC.EVENT_EXIT);
  assert(xe && xe.objectId === 'ex' && xe.data.room === roomNameXY(rx + 1, ry) && typeof xe.data.x === 'number', 'EVENT_EXIT {room, x, y}'); }
assert(call(e, `console.log(typeof Game.rooms['${rn}'].getEventLog(true))`) === 'string', 'getEventLog(true) 返回 JSON 字符串');

// ===== Market deal 是 tick 末 intent =====
const T = mk('terminal', ...free(sp.x - 3, sp.y - 3)); T.store = { energy: 10000, H: 1000 };
e.w.market = e.w.market || { orders: [], history: [], deals: {} }; e.tick(); // NPC 订单
const buyH = e.w.market.orders.find(o => o.npc && o.type === 'buy' && o.resourceType === 'H');
const r0 = call(e, `console.log(Game.market.deal('${buyH.id}', 100, '${rn}') + ':' + Game.market.credits)`);
assert(r0 === '0:0' && T.store.H === 1000, 'deal 当 tick 只登记 intent：资源/信用点不变');
flush(e); assert(T.store.H === 900 && e.w.players.p1.credits > 0 && T.cooldown === SC.TERMINAL_COOLDOWN, 'tick 末结算 deal');
e.tick(); e.w.players.p1.credits = 1000; T.cooldown = 0;
assert(call(e, `let r=[];for(let i=0;i<11;i++)r.push(Game.market.deal('${buyH.id}', 1, '${rn}'));console.log(r.join(','))`).split(',')[10] === String(ERR_FULL), '每 tick 第 11 笔 deal → ERR_FULL');
e.w.market.intents = []; e.w.market.deals = {};
const bal = e.w.players.p1.credits; call(e, `Game.market.createOrder({type:ORDER_SELL, resourceType:RESOURCE_HYDROGEN, price:1, totalAmount:100, roomName:'${rn}'})`);
assert(e.w.players.p1.credits === bal && !e.w.market.orders.some(o => o.owner === 'p1'), 'createOrder 当 tick 不扣费/不出现');
flush(e); assert(e.w.players.p1.credits === bal - 5 && e.w.market.orders.some(o => o.owner === 'p1'), 'tick 末创建订单，扣 5% 费');

// ===== Deposit harvest 是 tick 末 intent，并受 harvest 优先级约束 =====
const dep = e.spawnDeposits(true); const ds = free(dep.x, dep.y); const dh = mkC('dh', ['work', 'work', 'carry', 'move'], ds[0], ds[1]);
assert(call(e, `console.log(Game.creeps.dh.harvest(Game.getObjectById('${dep.id}')))`) === OK && !dh.store[dep.depositType] && dep.harvested === 0, 'deposit harvest 当 tick 只登记');
flush(e); assert(dh.store[dep.depositType] === 2 && dep.harvested === 2, 'tick 末结算 deposit harvest');
dep.cooldownTime = 0; e.tick();
assert(call(e, `Game.creeps.dh.harvest(Game.getObjectById('${dep.id}')); Game.creeps.dh.harvest(Game.getObjectById('${dep.id}'))`) === undefined, '');
flush(e); assert(dh.store[dep.depositType] === 4, '同 tick 多次 harvest 只结算一次');
module.exports = { mkE };
console.log('ALL PASS');
