// say/suicide/pull/cancelOrder intent 顺序；flee（pf.cc 启发）；RawMemory 段/公共段/外部段/set；Game.cpu unlock/setShardLimits/halt；InterShardMemory；跨 shard 资源市场
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const call = (e, code, pid = 'p1') => { const f = compileUser(code); let r; const api = e.buildApi(pid); f(Object.assign({}, api, { log: (...a) => { r = a[0]; } })); return r; };
const flush = (e, pid = 'p1') => { for (const c of e.w.creeps) if (c.owner === pid && c._flushIntents) c._flushIntents(); for (const it of ((e.w.market || {}).intents || []).splice(0)) it(); };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.addPlayer('p2', 'U'); e.w.zones = {}; const w = e.w;
const sp = w.spawns.find(s => s.owner === 'p1'), rn = roomName(sp.x, sp.y);
const free = (x0, y0) => { for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (roomKey(x, y) === roomKey(x0, y0) && !e.solid(x, y) && !w.creeps.some(c => c.x === x && c.y === y)) return [x, y]; } };
const mkC = (id, body, extra = {}) => { const [x, y] = free(sp.x, sp.y); const c = Object.assign({ kind: 'creep', id, owner: 'p1', name: id, body, hits: body.length * 100, x, y, px: x, py: y, store: {}, ttl: 1000, fatigue: 0 }, extra); w.creeps.push(c); e._o = null; return c; };

// ===== intent 顺序：transfer 先于 suicide；suicide 之后的 intent 不结算 =====
const a = mkC('a', ['carry', 'move'], { store: { energy: 50 } }); const ext = e.makeStruct('extension', 'p1', ...free(a.x, a.y)); w.structures.push(ext); e._objVer++; e._o = null;
if (dist(ext, a) <= 1) {
  assert(call(e, `console.log(Game.creeps.a.suicide() + ',' + Game.creeps.a.transfer(Game.getObjectById('${ext.id}'), RESOURCE_ENERGY))`) === '0,0' && w.creeps.includes(a), 'suicide 当 tick 只登记，creep 仍在');
  flush(e); assert(!w.creeps.includes(a) && ext.store.energy === 50, '官方顺序：transfer 先结算，再 suicide');
}
const b = mkC('b', ['move']); assert(call(e, `console.log(Game.creeps.b.say('hi', true))`) === OK && !b.say, 'say 当 tick 只登记'); flush(e); assert(b.say === 'hi' && b.sayPublic, 'say tick 末结算');
assert(call(e, `Game.creeps.b.say('x'); console.log(Game.creeps.b.cancelOrder('say') + ',' + Game.creeps.b.cancelOrder('harvest'))`) === '0,' + ERR_NOT_FOUND, 'cancelOrder 取消已登记 intent，未登记 → ERR_NOT_FOUND');
flush(e); assert(b.say === 'hi', '被取消的 say 未执行');

// ===== flee =====
const fr = JSON.parse(call(e, `const r = PathFinder.search(new RoomPosition(25,25,'${rn}'), [{pos:new RoomPosition(25,25,'${rn}'), range:5},{pos:new RoomPosition(27,25,'${rn}'), range:4}], {flee:true}); const l=r.path[r.path.length-1]; console.log(JSON.stringify({inc:r.incomplete, x:l&&l.x, y:l&&l.y}))`));
assert(!fr.inc && Math.max(Math.abs(fr.x - 25), Math.abs(fr.y - 25)) >= 5 && Math.max(Math.abs(fr.x - 27), Math.abs(fr.y - 25)) >= 4, '多目标 flee：同时满足所有 range ' + JSON.stringify(fr));
const pl = JSON.parse(call(e, `const r = PathFinder.search(new RoomPosition(25,25,'${rn}'), {pos:new RoomPosition(25,25,'${rn}'), range:5}, {flee:true}); console.log(JSON.stringify({n:r.path.length}))`));
assert(pl.n === 5 || pl.n > 5, 'flee 路径最短（≥5 步）：' + pl.n);

// ===== RawMemory =====
assert(call(e, `try { RawMemory.setActiveSegments([1,2,'x']) } catch (err) { console.log(err.message) }`) === '"x" is not a valid segment ID', 'setActiveSegments 非法 ID 抛官方错误');
assert(call(e, `try { RawMemory.setActiveSegments([0,1,2,3,4,5,6,7,8,9,10]) } catch (err) { console.log(err.message) }`) === 'Only 10 memory segments can be active at the same time', '最多 10 个段');
e.setCode('p1', `RawMemory.setActiveSegments([3]); RawMemory.setPublicSegments([3]); RawMemory.setDefaultPublicSegment(3); if (RawMemory.segments[3] !== undefined) RawMemory.segments[3] = 'pub-data';`); e.tick(); e.tick();
assert(w.segments.p1[3] === 'pub-data', '段在下一 tick 激活并保存');
e.setCode('p2', `RawMemory.setActiveForeignSegment('T')`); e.tick(); e.setCode('p2', '');
assert(call(e, `console.log(JSON.stringify(RawMemory.foreignSegment))`, 'p2') === JSON.stringify({ username: 'T', id: 3, data: 'pub-data' }), 'setActiveForeignSegment(username) 使用对方 defaultPublicSegment');
w.players.p1.publicSegs = []; assert(call(e, `console.log(RawMemory.foreignSegment)`, 'p2') === undefined, '对方未公开 → foreignSegment undefined');
e.setCode('p1', '');
assert(call(e, `try { RawMemory.set(5) } catch (err) { console.log(err.message) }`) === 'Raw memory value is not a string', 'RawMemory.set 非字符串抛错');
e.setCode('p1', `RawMemory.set('{"a":1}')`); e.tick(); e.setCode('p1', '');
assert(call(e, `console.log(Memory.a + ':' + RawMemory.get())`) === '1:{"a":1}', 'RawMemory.set → 下一 tick Memory/RawMemory.get 一致');
e.setCode('p1', `RawMemory.set('not json')`); e.tick(); e.setCode('p1', '');
assert(call(e, `console.log(RawMemory.get())`) === 'not json', 'RawMemory 可保存非 JSON 字符串');

// ===== Game.cpu =====
assert(call(e, `console.log(Game.cpu.unlock())`) === ERR_NOT_ENOUGH_RESOURCES, 'unlock：没有 cpuUnlock → ERR_NOT_ENOUGH_RESOURCES');
w.players.p1.res = { cpuUnlock: 1 }; w.players.p1.gcl = 1e9;
assert(call(e, `console.log(Game.cpu.unlock())`) === OK && w.players.p1.res.cpuUnlock === 0, 'unlock 消耗 1 个 cpuUnlock');
const cs = JSON.parse(call(e, `console.log(JSON.stringify({u:Game.cpu.unlocked, t:Game.cpu.unlockedTime > Date.now(), l:Game.cpu.limit, s:Game.cpu.shardLimits, r:Game.resources.cpuUnlock}))`));
assert(cs.u && cs.t && cs.l === Math.min(300, 20 + 10 * e.gclLevel('p1')) && cs.s.shard0 === cs.l && cs.r === 0, 'unlocked/unlockedTime/limit=10×GCL+20/shardLimits ' + JSON.stringify(cs));
assert(call(e, `console.log(Game.cpu.setShardLimits({shard0: 1}))`) === ERR_INVALID_ARGS && call(e, `console.log(Game.cpu.setShardLimits({shard9: ${cs.l}}))`) === ERR_INVALID_ARGS, 'setShardLimits：总和不符 / 未知 shard → ERR_INVALID_ARGS');
assert(call(e, `console.log(Game.cpu.setShardLimits({shard0: ${cs.l}}))`) === OK && call(e, `console.log(Game.cpu.setShardLimits({shard0: ${cs.l}}))`) === ERR_BUSY, 'setShardLimits OK，12 小时内再次 → ERR_BUSY');
// halt：intents 与 Memory 不提交
const h = mkC('h', ['move']); const hx = h.x;
e.setCode('p1', `Memory.halted = 1; Game.creeps.h.move(${h.x % ROOM < 25 ? 'RIGHT' : 'LEFT'}); Game.cpu.halt(); Memory.after = 1;`); const logN = (e.logs && e.logs.length) || 0; e.tick(); e.setCode('p1', '');
assert(h.x === hx && call(e, `console.log(Memory.halted)`) === undefined, 'Game.cpu.halt：本 tick move 与 Memory 都不提交');
assert(!(w.logs || []).slice(-3).some(l => String(l).includes('代码错误')), 'halt 不记为代码错误');
// generatePixel
w.players.p1.bucket = 10000; assert(call(e, `console.log(Game.cpu.generatePixel())`) === OK && w.players.p1.bucket === 0, 'generatePixel 消耗 10000 bucket');

// ===== InterShardMemory =====
assert(call(e, `InterShardMemory.setLocal('hello'); console.log(InterShardMemory.getLocal() + ',' + InterShardMemory.getRemote('shard0'))`) === 'hello,hello', 'InterShardMemory setLocal/getLocal/getRemote');
assert(call(e, `try { InterShardMemory.getRemote('shard9') } catch (err) { console.log('E') }`) === 'E', 'getRemote 未知 shard 抛错');
assert(call(e, `try { InterShardMemory.setLocal('x'.repeat(102401)) } catch (err) { console.log('E') }`) === 'E', 'setLocal 超过 100KB 抛错');

// ===== 跨 shard 资源市场（无终端）=====
e.tick(); for (let i = 0; i < 2; i++) e.tick(); w.time = 500; e.tick();
const sellPx = w.market.orders.find(o => o.npc && o.resourceType === 'cpuUnlock' && o.type === 'sell');
assert(sellPx && sellPx.roomName === undefined, 'NPC 跨 shard 订单无 roomName');
w.players.p1.credits = 1e6; assert(call(e, `console.log(Game.market.deal('${sellPx.id}', 2))`) === OK, 'deal 跨 shard 资源无需房间');
flush(e); assert(w.players.p1.res.cpuUnlock === 2 && w.players.p1.credits === 1e6 - 2 * sellPx.price, '购买 cpuUnlock → Game.resources');
console.log('ALL PASS');
