// 回归：升级者在房间交界处来回横跳（v1.8.2 E1S9 报告）
// 官方 pf.cc astar：出口格上不能沿边线移动，只能直穿到邻房；官方 creeps/tick.js：移动后站在出口格同一 tick 即跨房
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const e = new Engine(newWorld(7)); e.addPlayer('p1', 'T');
const sp = e.w.spawns[0], ox = Math.floor(sp.x / 50) * 50, oy = Math.floor(sp.y / 50) * 50;
// 找一段右侧连续开放的出口（≥6 格）
let y0 = -1; for (let y = 2; y < 40 && y0 < 0; y++) { let ok = true; for (let k = 0; k < 6; k++) for (const dx of [47, 48, 49, 50]) if (e.blocked(ox + dx, oy + y + k)) ok = false; if (ok) y0 = y; }
if (y0 < 0) { console.log('skip - 无开放出口'); process.exit(0); }
// 1) 寻路：沿出口格方向的路径不得在出口格上沿边线走
const from = { x: ox + 49, y: oy + y0 }, to = { x: ox + 49, y: oy + y0 + 5 };
const p = e.findPath(from, to, 0, null, { ignoreCreeps: true });
let prev = from, bad = false; for (const s of p) { const bx = prev.x % 50; if ((bx === 0 || bx === 49) && s.x === prev.x) bad = true; prev = s; }
assert(p.length && !bad, 'findPath 不沿出口格边线移动（官方 pf.cc 门户节点规则）');
const q = e.findPath({ x: ox + 49, y: oy + y0 }, { x: ox + 50, y: oy + y0 + 1 }, 0, null, { ignoreCreeps: true });
assert(!(q.length === 1), '出口格不能斜穿到邻房');
// 2) 走上出口格的同一 tick 就跨房
const c = { kind: 'creep', id: 'cx', owner: 'p1', name: 'x', body: ['move'], hits: 100, x: ox + 48, y: oy + y0, px: ox + 48, py: oy + y0, store: {}, ttl: 100, fatigue: 0 };
e.w.creeps.push(c); e._o = null;
e.fns.p1 = compileUser('Game.creeps.x.move(RIGHT)'); e.tick(); e.fns.p1 = null;
assert(c.x === ox + 50 && c.y === oy + y0, '移动到出口格 x=49 后同一 tick 到邻房 x=0');
// 3) 默认新手升级者：从邻房边缘回到本房控制器，不再来回横跳
const ctrl = e.w.controllers.find(k => k.owner === 'p1');
e.fns.p1 = compileUser(`const k = Game.creeps.x; if (k) k.moveTo(Game.rooms['${roomName(ctrl.x, ctrl.y)}'].controller, { reusePath: 5 });`);
let crossings = 0, last = roomKey(c.x, c.y);
for (let i = 0; i < 150 && dist(c, ctrl) > 1; i++) { e.tick(); const r = roomKey(c.x, c.y); if (r !== last) crossings++; last = r; }
assert(dist(c, ctrl) <= 1 && crossings <= 1, '越界后 moveTo 回到控制器（跨房 ' + crossings + ' 次）');
console.log('exit-path passed');
