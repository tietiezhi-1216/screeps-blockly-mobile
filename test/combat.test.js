// 伤害/治疗 tick 末结算（creeps/tick.js）、TOUGH 强化减伤公式、反击规则（_damage.js）、全部 BOOSTS 生效
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {}; const w = e.w; w.players.p2 = { name: 'F' }; w.memory.p2 = {};
const ctrl = w.controllers.find(c => c.owner === 'p1'); ctrl.safeMode = 0;
const call = code => { const f = compileUser(code); let r; f(Object.assign({}, e.buildApi('p1'), { log: (...a) => { r = a[0]; } })); return r; };
const end = () => { for (const c of w.creeps) if (c.owner === 'p1' && c._flushIntents) c._flushIntents(); e.applyHits(); };
const sp = w.spawns[0]; const spots = []; for (let dx = 3; dx < 20 && spots.length < 6; dx++) { const x = sp.x + dx, y = sp.y + 3; if (!e.solid(x, y) && roomKey(x, y) === roomKey(sp.x, sp.y)) spots.push([x, y]); }
const C = (id, owner, body, i, extra = {}) => { const c = Object.assign({ kind: 'creep', id, owner, name: id, body, hits: body.length * 100, x: spots[i][0], y: spots[i][1], px: 0, py: 0, store: {}, ttl: 1000, fatigue: 0 }, extra); w.creeps.push(c); e._o = null; return c; };
if (spots.length < 3 || spots[1][0] - spots[0][0] !== 1 || spots[2][0] - spots[1][0] !== 1) throw new Error('测试地形不连续');
// 同 tick：先伤害后治疗，再封顶 → 满血被打 30、治疗 12 → 净 -18
const vic = C('vic', 'p2', ['move', 'move', 'move'], 0), att = C('att', 'p1', ['attack', 'move'], 2), hl = C('hl', 'p1', ['heal', 'move'], 1);
vic.owner = 'p1'; att.owner = 'p2'; // 让 p1 的治疗者治疗自己的 vic，p2 的 att 攻击
e.damage(vic, 30, 'p2'); call(`Game.creeps.hl.rangedHeal(Game.creeps.vic)`); end();
assert(vic.hits === 300 - 30 + 4, '满血先扣伤害再加治疗（rangedHeal 4），不会被提前封顶：' + vic.hits);
vic.hits = 300; e.damage(vic, 30, 'p2'); call(`Game.creeps.hl.heal(Game.creeps.vic)`); end(); assert(vic.hits === 282, '近战治疗 12：300-30+12=282');
vic.hits = 300; call(`Game.creeps.hl.heal(Game.creeps.vic)`); end(); assert(vic.hits === 300, '治疗不超过 hitsMax');
vic.hits = 20; e.damage(vic, 30, 'p2'); call(`Game.creeps.hl.heal(Game.creeps.vic)`); end(); e.tick();
assert(w.creeps.includes(vic), '同 tick 致死伤害被治疗抵消则存活（20-30+12>0）');
// TOUGH 强化：官方公式
for (const [b, ratio] of [['GO', 0.7], ['GHO2', 0.5], ['XGHO2', 0.3]]) { const t = { kind: 'creep', id: 't' + b, owner: 'p2', body: ['tough', 'tough', 'move'], boosts: [b, b, null], hits: 300, x: 0, y: 0 }; w.creeps.push(t);
  e.damage(t, 300, 'p1'); e.applyHits(); w.creeps.splice(w.creeps.indexOf(t), 1);
  const he = 100 / ratio, eff1 = Math.min(he, 300), red1 = eff1 * (1 - ratio), rest = 300 - eff1, eff2 = Math.min(he, rest), red2 = eff2 * (1 - ratio), exp = 300 - (300 - Math.round(red1 + red2));
  assert(t.hits === exp, `${b} TOUGH：300 伤害 → 剩 ${t.hits}（官方公式期望 ${exp}）`); }
// 反击：近战才有；攻击者站在 rampart 上无反击
w.creeps = w.creeps.filter(c => !['vic', 'att', 'hl'].includes(c.id)); e._o = null;
const me = C('me', 'p1', ['attack', 'move'], 0), foe = C('foe', 'p2', ['attack', 'attack', 'move'], 1);
call(`Game.creeps.me.attack(Game.getObjectById('foe'))`); end(); assert(me.hits === 200 - 60 && foe.hits === 300 - 30, '近战：反击 60');
me.hits = 200; foe.hits = 300; const rp = e.makeStruct('rampart', 'p1', me.x, me.y); rp.hits = 1e6; w.structures.push(rp); e._objVer++;
call(`Game.creeps.me.attack(Game.getObjectById('foe'))`); end(); assert(me.hits === 200 && foe.hits === 270, '攻击者在 rampart 上：无反击');
w.structures.splice(w.structures.indexOf(rp), 1); e._objVer++;
const rg = C('rg', 'p1', ['ranged_attack', 'move'], 2); rg.x = me.x; rg.y = me.y - 1; if (e.solid(rg.x, rg.y)) { rg.x = foe.x + 1; rg.y = foe.y; } e._o = null; me.hits = 200; foe.hits = 300;
call(`Game.creeps.rg.rangedAttack(Game.getObjectById('foe'))`); end(); assert(rg.hits === 200 && foe.hits === 290, '远程攻击无反击');
// 安全模式：攻击者自己房间安全模式 → 无反击
ctrl.safeMode = w.time + 100; foe.hits = 300; me.hits = 200; call(`Game.creeps.me.attack(Game.getObjectById('foe'))`); end(); assert(me.hits === 200, '己方安全模式房间：无反击'); ctrl.safeMode = 0;
// 全部 BOOSTS：每个动作都乘以对应系数
const BP = (type, b, action) => SC.BOOSTS[type][b][action];
const one = (type, b, action) => { const c = { body: [type], boosts: [b], hits: 100 }; return boostPower(c, type, action); };
let n = 0; for (const type in SC.BOOSTS) for (const b in SC.BOOSTS[type]) for (const action in SC.BOOSTS[type][b]) { if (action === 'damage') continue; assert(one(type, b, action) === BP(type, b, action), `BOOSTS.${type}.${b}.${action} = ${BP(type, b, action)}`); n++; }
assert(n > 30, '覆盖全部 BOOSTS 条目：' + n);
// carry 强化容量、move 强化疲劳
const cb = { kind: 'creep', body: ['carry', 'move'], boosts: ['XKH2O', null], hits: 200 }; assert(storeCap(w, cb) === SC.CARRY_CAPACITY * BP('carry', 'XKH2O', 'capacity'), 'carry 强化容量 ×' + BP('carry', 'XKH2O', 'capacity'));
const mb = { body: ['move'], boosts: ['XZHO2'], hits: 100 }; assert(boostPower(mb, 'move', 'fatigue') === BP('move', 'XZHO2', 'fatigue'), 'move 强化降疲劳 ×' + BP('move', 'XZHO2', 'fatigue'));
console.log('ALL PASS');
