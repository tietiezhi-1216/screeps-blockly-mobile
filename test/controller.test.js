// Controller 升级 / RCL 建造限制 自动化测试
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };

const e = new Engine(newWorld(42)); e.addPlayer('p1', 'Tester');
const ctrl = e.w.controllers.find(c => c.owner === 'p1');
assert(ctrl && ctrl.level === 1, '出生房间有 Controller L1');
assert(e.w.spawns.some(s => s.owner === 'p1'), '出生房间有 Spawn');
assert(e.w.controllers.length === e.w.S * e.w.S, '每个房间一个 Controller');

// RCL1 禁止建 extension
let r = e.buildApi('p1').Game.createConstructionSite(e.w.spawns[0].x + 3, e.w.spawns[0].y, 'extension');
assert(r === ERR_RCL_NOT_ENOUGH, 'RCL1 不能建 extension: ' + r);
r = e.buildApi('p1').Game.createConstructionSite(e.w.spawns[0].x + 3, e.w.spawns[0].y, 'road');
assert(r === OK, 'RCL1 可建 road');
r = e.buildApi('p1').Game.createConstructionSite(e.w.spawns[0].x + 4, e.w.spawns[0].y, 'tower');
assert(r === ERR_RCL_NOT_ENOUGH, 'RCL1 不能建 tower');

// 升级到 L2：200 progress
e.w.creeps.push({ id: 'c1', owner: 'p1', name: 'up', body: ['work', 'work', 'carry', 'move'], x: ctrl.x + 1, y: ctrl.y, px: ctrl.x + 1, py: ctrl.y, energy: 200, ttl: 1500, fatigue: 0 });
e.w.memory.p1.creeps.up = {};
e.setCode('p1', `
const c = Game.creeps['up'];
const ctrl = c.pos.findClosestByRange('controller') || Object.values(Game.rooms).map(r=>r.controller).find(x=>x&&x.my);
if (c && ctrl) {
  if (c.store.energy === 0) { /* noop */ }
  else if (c.upgradeController(ctrl) === ERR_NOT_IN_RANGE) c.moveTo(ctrl);
}`);
// 手动能量充足，连续 upgrade
for (let i = 0; i < 120; i++) {
  const cr = e.w.creeps.find(c => c.name === 'up'); if (cr) cr.energy = 50;
  e.tick();
  if (ctrl.level >= 2) break;
}
assert(ctrl.level === 2, '升级后 Controller 达到 L2，progress=' + ctrl.progress + ' level=' + ctrl.level);

// RCL2 可建最多 5 个 extension
const sp = e.w.spawns[0]; let ok = 0;
for (let i = 0; i < 6; i++) {
  // 找空位
  let placed = false;
  for (let dy = -3; dy <= 3 && !placed; dy++) for (let dx = -3; dx <= 3 && !placed; dx++) {
    if (!dx && !dy) continue;
    const x = sp.x + dx, y = sp.y + dy;
    if (e.solid(x, y) || e.w.sites.some(s => s.x === x && s.y === y)) continue;
    const rr = e.buildApi('p1').Game.createConstructionSite(x, y, 'extension');
    if (rr === OK) { ok++; placed = true; }
  }
}
assert(ok === 5, 'RCL2 最多 5 个 extension 工地，实际 ' + ok);
r = e.buildApi('p1').Game.createConstructionSite(sp.x + 5, sp.y + 5, 'extension');
assert(r === ERR_RCL_NOT_ENOUGH, '第 6 个 extension 被拒绝');

// 建造完成一个 extension
const site = e.w.sites.find(s => s.type === 'extension');
assert(!!site, '有 extension 工地');
e.w.creeps.push({ id: 'c2', owner: 'p1', name: 'b', body: ['work', 'work', 'carry', 'move'], x: site.x, y: site.y + 1, px: site.x, py: site.y + 1, energy: 3000, ttl: 1500, fatigue: 0 });
e.w.memory.p1.creeps.b = {};
e.setCode('p1', `const c=Game.creeps['b'];const s=c&&c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);if(c&&s){if(c.build(s)===ERR_NOT_IN_RANGE)c.moveTo(s);}`);
for (let i = 0; i < 400; i++) { const cr = e.w.creeps.find(c => c.name === 'b'); if (cr) cr.energy = 200; e.tick(); if (e.w.structures.some(s => s.type === 'extension')) break; }
assert(e.w.structures.some(s => s.type === 'extension' && s.owner === 'p1'), 'extension 建造完成');
assert(e.w.structures.find(s => s.type === 'extension').energyCapacity === 50, 'extension 能量容量 50');

// Tower 需 RCL3
ctrl.level = 3; ctrl.progressTotal = CONTROLLER_LEVELS[3];
r = (()=>{ for(let dy=-6;dy<=6;dy++) for(let dx=-6;dx<=6;dx++){ const rr=e.buildApi('p1').Game.createConstructionSite(sp.x+dx,sp.y+dy,'tower'); if(rr===OK) return OK;} return ERR_INVALID_TARGET; })();
assert(r === OK, 'RCL3 可建 tower');
r = (()=>{ for(let dy=-6;dy<=6;dy++) for(let dx=-6;dx<=6;dx++){ const rr=e.buildApi('p1').Game.createConstructionSite(sp.x+dx,sp.y+dy,'storage'); if(rr!==ERR_INVALID_TARGET) return rr;} return ERR_RCL_NOT_ENOUGH; })();
assert(r === ERR_RCL_NOT_ENOUGH, 'RCL3 不能建 storage');

console.log('ALL CONTROLLER TESTS PASS');
