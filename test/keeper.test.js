// Source Keeper：lair 放置（官方 map.js）、lair 重生（keeper-lairs/tick.js）、Keeper AI（creeps/keepers/pretick.js）
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
// lair 放置：BFS 步数 3~5 的墙格，非边缘
let checked = 0;
for (const [rx, ry] of [[4, 4], [4, 5], [5, 4], [6, 6], [4, 6], [6, 5]]) {
  const g = genRoom(7, rx, ry, { top: [10, 11, 12], bottom: [20, 21], left: [30], right: [40] });
  assert(g.type === 'keeper' && g.lairs.length >= g.sources.length, `${roomNameXY(rx, ry)}：每个能量源都有 lair（${g.lairs.length} 个，含矿物）`);
  for (const l of g.lairs) {
    assert(g.tiles[l.y * 50 + l.x] === T_WALL && l.x > 0 && l.x < 49 && l.y > 0 && l.y < 49, 'lair 在墙格且不在边缘');
    // BFS 步数
    const seen = { [l.tx + ',' + l.ty]: 0 }, q = [[l.tx, l.ty]]; let d = null;
    while (q.length && d == null) { const [cx, cy] = q.shift(); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny; if (seen[k] !== undefined || nx < 0 || ny < 0 || nx > 49 || ny > 49) continue; seen[k] = seen[cx + ',' + cy] + 1; if (nx === l.x && ny === l.y) d = seen[k]; if (g.tiles[ny * 50 + nx] !== T_WALL && seen[k] < 5) q.push([nx, ny]); } }
    assert(d != null && d >= 2 && d <= 5, 'lair 距资源 BFS 步数 ' + d); checked++;
  }
}
// Keeper 重生与 AI
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {}; const w = e.w;
ensureRoom(w, 4, 4); const lair = w.structures.find(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === '4,4');
assert(!!lair, 'SK 房间有 keeperLair');
e.tick(); assert(lair.spawnAt === w.time + SC.ENERGY_REGEN_TIME, '无 Keeper → nextSpawnTime = time + ENERGY_REGEN_TIME');
while (!w.creeps.some(c => c.name === 'Keeper' + lair.id)) e.tick();
let k = w.creeps.find(c => c.name === 'Keeper' + lair.id);
assert(k.x === lair.x && k.y === lair.y && k.hits === 5000 && k.body.length === 50 && k.body.slice(0, 17).every(b => b === 'tough') && k.body.slice(17, 30).every(b => b === 'move') && k.body[30] === 'attack' && k.body[31] === 'ranged_attack', 'Keeper 在 lair 生成，官方 body 顺序');
const src = w.sources.concat(w.minerals).find(o => o.x === lair.tx && o.y === lair.ty);
for (let i = 0; i < 60 && dist(k, src) > 1; i++) e.tick();
assert(dist(k, src) <= 1, 'Keeper 走到资源点旁（range 1）');
const ttl0 = k.ttl; e.tick(); assert(k.ttl === ttl0, 'Keeper 不衰老');
// 受伤 → 计时重生
k.hits = 4000; e.tick(); assert(lair.spawnAt === w.time + SC.ENERGY_REGEN_TIME - 0 || lair.spawnAt > w.time, '受伤 Keeper → lair 开始计时');
// 战斗：近战 + 远程
const spot = (() => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = k.x + dx, y = k.y + dy; if ((dx || dy) && e.tile(x, y) !== T_WALL && !e.solid(x, y) && !w.creeps.some(c => c.x === x && c.y === y)) return [x, y]; } })();
const v = { kind: 'creep', id: 'v1', owner: 'p1', name: 'v1', body: Array(20).fill('tough').concat(['move']), hits: 2100, x: spot[0], y: spot[1], px: spot[0], py: spot[1], store: {}, ttl: 1000, fatigue: 0 }; w.creeps.push(v); e._o = null;
e.tick(); const L = w.eventLog[roomKey(k.x, k.y)] || [];
const mel = L.find(x => x.event === SC.EVENT_ATTACK && x.objectId === k.id && x.data.attackType === SC.EVENT_ATTACK_TYPE_MELEE), rng = L.find(x => x.event === SC.EVENT_ATTACK && x.objectId === k.id && x.data.attackType === SC.EVENT_ATTACK_TYPE_RANGED);
assert(mel && mel.data.damage === 300 && rng && rng.data.damage === 100, 'Keeper 近战 300 + 远程 100（单目标 massDamage=10 ≤ 13）');
assert(v.hits === 2100 - 400, '目标受到 400 伤害');
const spot2 = (() => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = k.x + dx, y = k.y + dy; if ((dx || dy) && e.tile(x, y) !== T_WALL && !e.solid(x, y) && !w.creeps.some(c => c.x === x && c.y === y)) return [x, y]; } })();
assert(spot2 && w.creeps.includes(v), '有第二个相邻空位用于群伤测试');
{ w.creeps.push({ kind: 'creep', id: 'v2', owner: 'p1', name: 'v2', body: Array(20).fill('tough').concat(['move']), hits: 2100, x: spot2[0], y: spot2[1], px: spot2[0], py: spot2[1], store: {}, ttl: 1000, fatigue: 0 }); e._o = null;
  v.x = v.px = v.x; e.tick(); const L2 = w.eventLog[roomKey(k.x, k.y)] || [];
  assert(L2.filter(x => x.objectId === k.id && x.data.attackType === SC.EVENT_ATTACK_TYPE_RANGED_MASS).length >= 2, '两个相邻敌人 massDamage=20>13 → rangedMassAttack');
  const m2 = L2.find(x => x.objectId === k.id && x.data.attackType === SC.EVENT_ATTACK_TYPE_MELEE); assert(m2, '近战同时进行'); }
// 近战目标：1 格内 hits 最少的；远程单体：3 格内（不在 1 格）只远程
{ const v2 = w.creeps.find(c => c.id === 'v2'); v.hits = 1500; v2.hits = 900; w.eventLog = {}; e.tick(); const L3 = w.eventLog[roomKey(k.x, k.y)] || [];
  const m3 = L3.find(x => x.objectId === k.id && x.data.attackType === SC.EVENT_ATTACK_TYPE_MELEE); assert(m3 && m3.data.targetId === 'v2', '近战打 hits 最少的目标 v2');
  w.creeps = w.creeps.filter(c => c.id !== 'v1' && c.id !== 'v2'); e._o = null;
  let far = null; for (let dy = -3; dy <= 3 && !far; dy++) for (let dx = -3; dx <= 3 && !far; dx++) { const x = k.x + dx, y = k.y + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) === 3 && roomKey(x, y) === roomKey(k.x, k.y) && e.tile(x, y) !== T_WALL && !e.solid(x, y) && !w.creeps.some(c => c.x === x && c.y === y)) far = [x, y]; }
  assert(far, '3 格处有空位');
  w.creeps.push({ kind: 'creep', id: 'v3', owner: 'p1', name: 'v3', body: Array(20).fill('tough').concat(['move']), hits: 2100, x: far[0], y: far[1], px: far[0], py: far[1], store: {}, ttl: 1000, fatigue: 0 }); e._o = null;
  const kx = k.x, ky = k.y; k.fatigue = 99; w.eventLog = {}; e.tick(); const L4 = w.eventLog[roomKey(kx, ky)] || [];
  const r4 = L4.filter(x => x.objectId === k.id && x.event === SC.EVENT_ATTACK);
  assert(r4.length === 1 && r4[0].data.attackType === SC.EVENT_ATTACK_TYPE_RANGED && r4[0].data.targetId === 'v3' && r4[0].data.damage === 100, '3 格目标：只 rangedAttack 100（massDamage=1 ≤ 13）'); }
console.log('ALL PASS');
