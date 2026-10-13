// Pass 3：PathFinder flee/maxRooms/heuristicWeight；FIND_NUKES；boost 建造能量；spawnCreep 同 tick 重名；createConstructionSite；mineral 再生；intent 优先级；Room.serializePath
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const run = (e, code) => { const f = compileUser(code); let r; const api = e.buildApi('p1'); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); for (const c of e.w.creeps) if (c.owner === 'p1' && c._flushIntents) c._flushIntents(); return r; };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T');
const ctrl = e.w.controllers.find(c => c.owner === 'p1'); ctrl.level = 8; ctrl.safeMode = 0; const sp = e.w.spawns[0];
const fresh = () => { e._objVer++; e._o = null; };
const mk = (t, dx, dy) => { const s = e.makeStruct(t, 'p1', sp.x + dx, sp.y + dy); e.w.structures.push(s); fresh(); return s; };
const id = s => `Game.getObjectById('${s.id}')`;
const rn = roomName(sp.x, sp.y), ox = sp.x - sp.x % 50, oy = sp.y - sp.y % 50;

// PathFinder flee：离开目标 range
const flee = JSON.parse(run(e, `const r=PathFinder.search(new RoomPosition(25,25,'${rn}'),{pos:new RoomPosition(25,25,'${rn}'),range:3},{flee:true,maxOps:500});console.log(JSON.stringify({len:r.path.length,inc:r.incomplete,last:r.path[r.path.length-1]}))`));
assert(flee.len > 0 && flee.last && Math.max(Math.abs(flee.last.x - 25), Math.abs(flee.last.y - 25)) === 3 && !flee.inc, 'PathFinder flee 终点恰在 range（官方 pf.cc：dist ≥ range 即到达）: ' + JSON.stringify(flee));
const mr = JSON.parse(run(e, `const r=PathFinder.search(new RoomPosition(10,10,'${rn}'),{pos:new RoomPosition(40,40,'${rn}'),range:0},{maxRooms:1,maxOps:200,heuristicWeight:1.5});console.log(JSON.stringify({ops:r.ops,hw:1.5}))`));
assert(typeof mr.ops === 'number', 'PathFinder maxRooms/heuristicWeight 可运行 ops=' + mr.ops);

// FIND_NUKES + 脚本可见
e.w.zones = {}; const nk = mk('nuker', -4, -4); nk.store = { energy: SC.NUKER_ENERGY_CAPACITY, G: SC.NUKER_GHODIUM_CAPACITY }; fresh();
assert(run(e, `console.log(${id(nk)}.launchNuke(new RoomPosition(25,25,'${rn}')))`) === OK, 'launchNuke');
assert(run(e, `console.log(Game.rooms['${rn}'].find(FIND_NUKES).length)`) === 1, 'FIND_NUKES');
assert(run(e, `const n=Game.rooms['${rn}'].find(FIND_NUKES)[0];console.log(n.timeToLand+':'+n.launchRoomName)`) === (SC.NUKE_LAND_TIME + ':' + rn), 'nuke.timeToLand / launchRoomName');
assert(e.snapshot('p1').nukes.length === 1, 'snapshot 含 nukes（供渲染）');

// boost build：能量按未强化量扣
const site = { kind: 'site', id: 'csB', owner: 'p1', x: sp.x + 2, y: sp.y + 2, type: 'road', progress: 0, total: 300 }; e.w.sites.push(site);
e.w.creeps.push({ kind: 'creep', id: 'cb', owner: 'p1', name: 'bldr', body: ['work', 'work', 'carry', 'carry', 'move'], boosts: ['LH', 'LH', null, null, null], hits: 500, x: site.x, y: site.y, px: site.x, py: site.y, store: { energy: 100 }, ttl: 1000, fatigue: 0 });
fresh();
const en0 = 100; run(e, `Game.creeps.bldr.build(Game.getObjectById('csB'))`);
const bldr = e.w.creeps.find(c => c.name === 'bldr');
assert(bldr.store.energy === en0 - 10 && site.progress === 15, 'LH 强化建造：扣 10 能量（未强化 2×5），进度 +15（×1.5）实际 e=' + bldr.store.energy + ' p=' + site.progress);

// RCL8 upgrade 上限按未强化量
ctrl.level = 8; ctrl.progress = 0; bldr.store.energy = 100; bldr.x = ctrl.x + 1; bldr.y = ctrl.y; if (e.solid(bldr.x, bldr.y)) { bldr.x = ctrl.x; bldr.y = ctrl.y + 1; }
bldr.boosts = ['XGH2O', null, null, null, null]; bldr.body = ['work', 'carry', 'move', 'move', 'move']; fresh();
ctrl._upCnt = 0; ctrl._upTick = e.w.time;
run(e, `Game.creeps.bldr.upgradeController(Game.creeps.bldr.room.controller)`);
assert(ctrl._upCnt === 1 && bldr.store.energy === 99, 'RCL8：未强化量计入上限/扣能量（1），强化只加 GCL');

// spawnCreep 同 tick 重名
sp.store.energy = 1000; sp.spawning = null; e.w.creeps = e.w.creeps.filter(c => c.name !== 'dup');
e.w.structures.push(e.makeStruct('spawn', 'p1', sp.x + 6, sp.y)); // 第二 spawn 不便，直接两次同 spawn：第二次应 BUSY
// 用 dryRun 无法测同 tick 名；模拟两个 spawn
const sp2 = e.makeSpawn('p1', 'Spawn2', sp.x + 5, sp.y, 300); e.w.spawns.push(sp2); fresh();
w_spawned = null;
assert(run(e, `console.log(Game.spawns.Spawn1.spawnCreep([MOVE], 'dup'))`) === OK, 'spawn1 dup');
assert(run(e, `console.log(Game.spawns.Spawn2.spawnCreep([MOVE], 'dup'))`) === ERR_NAME_EXISTS, '同 tick 另一 spawn 同名 ERR_NAME_EXISTS');

// createConstructionSite：上限 100、敌对房间 NOT_OWNER、返回码
assert(SC.MAX_CONSTRUCTION_SITES === 100, 'MAX_CONSTRUCTION_SITES=100');
const enemy = e.w.controllers.find(c => !c.owner && c !== ctrl);
if (enemy) {
  enemy.owner = 'p2'; e.w.rooms[roomKey(enemy.x, enemy.y)].owner = 'p2';
  let spot = null; const eo = enemy.x - enemy.x % 50, eoy = enemy.y - enemy.y % 50;
  for (let y = 10; y < 40 && !spot; y++) for (let x = 10; x < 40 && !spot; x++) if (e.tile(eo + x, eoy + y) !== T_WALL) spot = [x, y];
  assert(spot && run(e, `console.log(new RoomPosition(${spot[0]},${spot[1]},'${roomName(enemy.x, enemy.y)}').createConstructionSite(STRUCTURE_ROAD))`) === ERR_NOT_OWNER, '敌对房间 createConstructionSite ERR_NOT_OWNER');
}
assert(run(e, `console.log(new RoomPosition(0,0,'${rn}').createConstructionSite(STRUCTURE_ROAD))`) === ERR_INVALID_TARGET, '出口/边缘 ERR_INVALID_TARGET');
assert(run(e, `console.log(new RoomPosition(10,10,'${rn}').createConstructionSite('nope'))`) === ERR_INVALID_ARGS, '非法类型 ERR_INVALID_ARGS');

// mineral density / regen
const min = e.w.minerals[0]; assert(min && min.density >= 1 && SC.MINERAL_DENSITY[min.density] > 0, 'mineral.density 有效');
min.amount = 0; min.regenAt = null; e.tickSources(); // tickSources also does minerals
// force via tick
min.amount = 0; min.regenAt = e.w.time + 1;
for (let i = 0; i < 3; i++) e.tick();
assert(min.amount === SC.MINERAL_DENSITY[min.density], '矿物耗尽后 MINERAL_REGEN_TIME 再生到 MINERAL_DENSITY[density]');

// intent 优先级：harvest 然后 attack → 只执行 attack（harvest 被挡）
e.addPlayer('p2', 'E'); const foe = { kind: 'creep', id: 'foe', owner: 'p2', name: 'foe', body: ['attack', 'move'], hits: 200, x: bldr.x + 1, y: bldr.y, px: 0, py: 0, store: {}, ttl: 1000, fatigue: 0, spawning: false };
bldr.body = ['work', 'attack', 'move', 'carry', 'move']; bldr.boosts = []; bldr.hits = 500; bldr.store = { energy: 0 }; fresh();
// place next to source and foe
const src = e.w.sources.find(s => roomKey(s.x, s.y) === roomKey(sp.x, sp.y));
const spot = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => [src.x+dx,src.y+dy]).find(([x,y]) => !e.blocked(x,y));
bldr.x = spot[0]; bldr.y = spot[1]; foe.x = spot[0]; foe.y = spot[1]; // same tile? need adj for attack range 1 - put foe adjacent
foe.x = bldr.x + (bldr.x === src.x ? 1 : 0); foe.y = bldr.y + (bldr.x === src.x ? 0 : 1);
if (e.blocked(foe.x, foe.y)) { foe.x = bldr.x; foe.y = bldr.y; } // attack self not allowed; put on same? attack needs adjacent
// ensure adjacent
for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1]]) { const x = bldr.x+dx, y = bldr.y+dy; if (!e.solid(x,y)) { foe.x=x; foe.y=y; break; } }
e.w.creeps.push(foe); fresh();
const eSrc = src.energy, eFoe = foe.hits;
run(e, `const c=Game.creeps.bldr; c.harvest(Game.getObjectById('${src.id}')); c.attack(Game.getObjectById('foe'));`);
assert(src.energy === eSrc && foe.hits < eFoe, 'intent 优先级：attack 挡住 harvest（源未减、敌人受伤）');

// Room.serializePath
const ser = run(e, `const p=[{x:10,y:15,dx:1,dy:0,direction:RIGHT},{x:11,y:15,dx:1,dy:0,direction:RIGHT}]; const s=Room.serializePath(p); const d=Room.deserializePath(s); console.log(s+':'+d[0].x+','+d[0].y+':'+d.length)`);
assert(String(ser).startsWith('1015') && String(ser).includes(':10,15:2'), 'Room.serializePath/deserializePath 官方格式: ' + ser);

console.log('ALL PASS');
