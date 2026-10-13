// creep 朝向：动作成功结算后快照带 face，渲染旋转（Renderer.faceAngle）指向目标；采集原先不记目标（v1.9.2 回归）
const fs = require('fs'), vm = require('vm'), path = require('path'); const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js') + W('engine-npc.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const rs = W('render.js'), fa = rs.match(/static faceAngle\(x, y, tx, ty\) \{ return ([^}]+) \}/); assert(fa, 'render.js 有 Renderer.faceAngle'); const faceAngle = new Function('x', 'y', 'tx', 'ty', 'return ' + fa[1]);
assert(/if \(cr\.face && [^\n]*\n\s*else if \(cr\.px != null/.test(rs), '动作朝向优先于移动方向');
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {}; const w = e.w; e.placeSpawn('p1');
const sp = w.spawns.find(s => s.owner === 'p1'), src = w.sources.slice().sort((a, b) => Math.hypot(a.x - sp.x, a.y - sp.y) - Math.hypot(b.x - sp.x, b.y - sp.y))[0];
for (const [dx, dy] of [[-1, 1], [1, 0], [0, -1]]) {
  w.creeps = w.creeps.filter(c => c.name !== 'h'); const x = src.x + dx, y = src.y + dy; w.creeps.push({ kind: 'creep', id: 'cX' + dx + dy, owner: 'p1', name: 'h', body: ['work', 'carry', 'move'], hits: 300, x, y, px: x, py: y, store: {}, ttl: 1000, fatigue: 0 }); e._o = null; src.energy = 3000;
  e.setCode('p1', `Game.creeps.h.harvest(Game.getObjectById('${src.id}'))`);
  for (let i = 0; i < 3; i++) { e.tick(); const s = e.snapshot('p1').creeps.find(c => c.name === 'h');
    assert(s.face && s.face[0] === src.x && s.face[1] === src.y, `tick ${w.time} 采集后快照 face 指向能量源 (${dx},${dy})`);
    const r = faceAngle(s.x, s.y, s.face[0], s.face[1]), fx = Math.sin(r), fy = -Math.cos(r); // 贴图正面（上方 0,-1）旋转 r 后的方向
    assert(Math.abs(fx - dx * -1 / Math.hypot(dx, dy)) < 1e-9 && Math.abs(fy - dy * -1 / Math.hypot(dx, dy)) < 1e-9, '渲染旋转后正面指向能量源'); }
}
