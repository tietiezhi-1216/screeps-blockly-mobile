// 新手区/重生区：边界墙（不可摧毁、寻路绕开）、到期拆除、GCL_NOVICE、核弹、安全模式冷却、getRoomStatus
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const call = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); for (const c of e.w.creeps) if (c.owner === 'p1' && c._flushIntents) c._flushIntents(); e.applyHits(); /* 模拟 tick 末伤害/治疗结算 */ return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); const w = e.w;
const sp = w.spawns[0], rx = Math.floor(sp.x / ROOM), ry = Math.floor(sp.y / ROOM), z = e.zoneOf(rx, ry);
assert(z && z.status === 'novice', '首个房间在新手区');
const walls = w.structures.filter(s => s.zoneWall === z.id);
assert(walls.length > 0 && walls.every(s => s.type === 'constructedWall' && s.hits == null), '边界：无 hits 的 constructedWall');
const zr = Object.keys(w.zones).filter(k => w.zones[k].id === z.id);
assert(walls.every(s => { const k = roomKey(s.x, s.y), lx = s.x % ROOM, ly = s.y % ROOM; return zr.includes(k) && (lx === 0 || ly === 0 || lx === ROOM - 1 || ly === ROOM - 1); }), '边界墙只在区内房间的边缘格');
const inner = walls.every(s => { const lx = s.x % ROOM, ly = s.y % ROOM, [X, Y] = roomKey(s.x, s.y).split(',').map(Number), nk = (lx === 0 ? X - 1 : lx === ROOM - 1 ? X + 1 : X) + ',' + (ly === 0 ? Y - 1 : ly === ROOM - 1 ? Y + 1 : Y); return !(w.zones[nk] && w.zones[nk].id === z.id); });
assert(inner, '区内房间之间不放墙');
const wl = walls[0]; { const [X, Y] = roomKey(wl.x, wl.y).split(',').map(Number); for (let i = 10; i < 40; i++) { const x = X * ROOM + i, y = Y * ROOM + 25; if (!e.solid(x, y)) { w.creeps.push({ kind: 'creep', id: 'eye', owner: 'p1', name: 'eye', body: ['move'], hits: 100, x, y, px: x, py: y, store: {}, ttl: 1500, fatigue: 0 }); e._o = null; break; } } } // 给视野
assert(call(e, `console.log(Game.getObjectById('${wl.id}').hits)`) === undefined, 'API：边界墙 hits undefined');
assert(e.solid(wl.x, wl.y), '边界墙阻挡移动/寻路');
// 寻路：从区内到区外没有路径
const out = (() => { for (let X = 0; X < w.S; X++) for (let Y = 0; Y < w.S; Y++) if (!w.zones[X + ',' + Y] && roomType(X, Y) === 'normal' && Math.abs(X - rx) <= 2 && Math.abs(Y - ry) <= 2) return [X, Y]; })();
if (out) { ensureRoom(w, out[0], out[1]); const goal = { x: out[0] * ROOM + 25, y: out[1] * ROOM + 25 };
  const r = call(e, `console.log(PathFinder.search(Game.spawns.Spawn1.pos, {pos: new RoomPosition(25,25,'${roomNameXY(out[0], out[1])}'), range: 3}, {maxOps: 20000}).incomplete)`);
  assert(r === true, 'PathFinder：无法穿出新手区（incomplete）'); }
// GCL_NOVICE
const ctrl = w.controllers.find(c => c.owner === 'p1');
assert(e.isNovice(ctrl), 'isNovice');
// 安全模式冷却：新手区为 null
ctrl.safeMode = 0; ctrl.safeModeAvailable = 1; ctrl.safeModeCooldown = 0; ctrl.downgradeTime = w.time + 20000;
assert(call(e, `console.log(Game.getObjectById('${ctrl.id}').activateSafeMode())`) === OK && ctrl.safeModeCooldown === null, '新手区 activateSafeMode 无冷却');
// claim 上限
for (let i = 0; i < 2; i++) { const c2 = w.controllers.find(c => !c.owner && w.zones[roomKey(c.x, c.y)]); if (c2) c2.owner = 'p1'; }
const tgt = w.controllers.find(c => !c.owner && w.zones[roomKey(c.x, c.y)] && w.zones[roomKey(c.x, c.y)].id === z.id);
if (tgt && w.controllers.filter(c => c.owner === 'p1').length >= 3) { w.players.p1.gcl = 1e12; const sp2 = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].map(([a, b]) => [tgt.x + a, tgt.y + b]).find(([x, y]) => !e.solid(x, y));
  w.creeps.push({ kind: 'creep', id: 'cl', owner: 'p1', name: 'cl', body: ['claim', 'move'], hits: 200, x: sp2[0], y: sp2[1], px: sp2[0], py: sp2[1], store: {}, ttl: 500, fatigue: 0 }); e._o = null;
  assert(call(e, `console.log(Game.creeps.cl.claimController(Game.getObjectById('${tgt.id}')))`) === ERR_FULL, '新手区已有 GCL_NOVICE(3) 个房间 → claim ERR_FULL'); }
// 核弹落在新手区：直接消失
const victim = w.structures.find(s => roomKey(s.x, s.y) === rx + ',' + ry && s.hits != null) || w.spawns[0]; const h0 = victim.hits;
w.nukes = [{ id: 'nk', x: victim.x, y: victim.y, landTime: w.time + 1, launchRoomName: 'E0S0' }]; e.tick();
assert(!w.nukes.length && victim.hits === h0, '核弹落在新手区：移除且无伤害');
// getRoomStatus
assert(call(e, `console.log(Game.map.getRoomStatus('${roomNameXY(rx, ry)}').status)`) === 'novice', 'getRoomStatus = novice');
// 到期：墙拆除
z.until = w.time + 1; for (const k in w.zones) if (w.zones[k].id === z.id) w.zones[k].until = w.time + 1; e.tick(); e.tick();
assert(!w.structures.some(s => s.zoneWall === z.id) && !e.zoneOf(rx, ry), '到期：边界墙拆除');
assert(call(e, `console.log(Game.map.getRoomStatus('${roomNameXY(rx, ry)}').status)`) === 'normal', '到期后 getRoomStatus = normal');
console.log('ALL PASS');
