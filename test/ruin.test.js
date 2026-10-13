// Ruin / Resource 衰减 / Tombstone 衰减 对照官方
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); const sp = e.w.spawns[0]; const ctrl = e.w.controllers.find(c => c.owner === 'p1'); ctrl.safeMode = 0;
const c = e.makeStruct('container', 'p1', sp.x + 2, sp.y + 2); c.store = { energy: 300 }; e.w.structures.push(c); e._objVer++;
e.damage(c, 1e9, 'zz'); const ru = (e.w.ruins || [])[0];
assert(ru && ru.store.energy === 300 && ru.structureType === 'container' && ru.decayAt === e.w.time + SC.RUIN_DECAY, '摧毁建筑留下 Ruin，资源保留，RUIN_DECAY=500');
assert(run(e, `console.log(Game.spawns.Spawn1.room.find(FIND_RUINS).length)`) === 1, 'FIND_RUINS');
assert(run(e, `const r=Game.spawns.Spawn1.room.find(FIND_RUINS)[0]; console.log(r.structure.structureType + ':' + r.store.energy + ':' + r.ticksToDecay)`) === 'container:300:500', 'Ruin.structure / store / ticksToDecay');
ru.decayAt = e.w.time + 1; e.tick(); assert(!e.w.ruins.length && e.w.resources.some(r => r.x === ru.x && r.y === ru.y), 'Ruin 消失时资源掉落地面');
const res = e.w.resources.find(r => r.x === ru.x && r.y === ru.y), a0 = res.amount; e.tick(); assert(res.amount === a0 - Math.ceil(a0 / 1000), '掉落资源每 tick 衰减 ceil(amount/1000)');
assert(SC.TOMBSTONE_DECAY_PER_PART === 5, 'Tombstone 每部件 5 tick');
// 同时动作：同一 tick 两次 harvest 只生效一次
e.tick(); const src = e.w.sources.find(x => roomKey(x.x, x.y) === roomKey(sp.x, sp.y)); src.energy = 3000;
const spot = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].map(([dx, dy]) => [src.x + dx, src.y + dy]).find(([x, y]) => !e.blocked(x, y));
e.w.creeps.push({ kind: 'creep', id: 'cz', owner: 'p1', name: 'z', body: ['work', 'work', 'carry', 'carry', 'move'], hits: 500, x: spot[0], y: spot[1], px: spot[0], py: spot[1], store: {}, ttl: 1000, fatigue: 0, _did: {} }); e._objVer++; e._o = null;
assert(run(e, `const c=Game.creeps.z, s=Game.getObjectById('${src.id}'); c.harvest(s); console.log(c.harvest(s))`) === OK && e.w.creeps.find(c => c.name === 'z').store.energy === 4, '同 tick 两次 harvest 只采一次（4 能量）');
const z = e.w.creeps.find(c => c.name === 'z'); z._did = {};
assert(run(e, `const c=Game.creeps.z; c.harvest(Game.getObjectById('${src.id}')); console.log(c.heal(c))`) === OK && z.store.energy === 8, 'harvest 与 heal 同管线，不重复结算');
console.log('ALL PASS');
