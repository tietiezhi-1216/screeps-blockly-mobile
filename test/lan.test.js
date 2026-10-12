// 在 Node 中模拟：房主（真实 WebSocket 服务器）+ 2 个客户端
const fs = require('fs'), vm = require('vm'), path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('net.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const HARV = `var creep;
Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, MOVE], 'c' + Game.time);
for (const n in Game.creeps) { creep = Game.creeps[n];
  if (creep.store.getFreeCapacity() === 0) { const sp = Game.spawns['Spawn1']; if (creep.transfer(sp, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(sp); }
  else { const s = creep.pos.findClosestByPath(FIND_SOURCES); if (s && creep.harvest(s) === ERR_NOT_IN_RANGE) creep.moveTo(s); } }`;
// 地形连通性检查：所有房间中心与能量源互相可达
function connectivity(e) {
  const W = e.W, seen = new Uint8Array(W * W), sp = e.w.spawns[0]; const q = [[sp.x + 1, sp.y]]; seen[sp.y * W + sp.x + 1] = 1;
  while (q.length) { const [x, y] = q.pop(); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= W || seen[Y * W + X] || e.tile(X, Y) === T_WALL) continue; seen[Y * W + X] = 1; q.push([X, Y]); } }
  const centers = Object.keys(e.w.rooms).map(k => k.split(',').map(Number)).map(([rx, ry]) => [rx * ROOM + 12, ry * ROOM + 12]);
  const srcOk = e.w.sources.every(s => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => seen[(s.y + dy) * W + s.x + dx]));
  return centers.every(([x, y]) => seen[y * W + x]) && srcOk;
}
(async () => {
  for (const seed of [1, 7, 42, 1234, 99999]) { const e = new Engine(newWorld(seed)); for (let i = 0; i < 6; i++) e.addPlayer('p' + i, 'P' + i); assert(connectivity(e), `seed ${seed}: ${e.w.S}x${e.w.S} 房间全部连通、能量源可达`); }
  const e = new Engine(newWorld(42)); e.addPlayer('host', '房主'); e.setCode('host', HARV);
  assert(e.w.S === 2, '1 名玩家 → 2x2 房间 (S=' + e.w.S + ')');
  const wss = new WebSocketServer({ port: 18787 }); let nid = 1; const socks = new Map();
  const tr = { send: (id, d) => socks.get(id)?.send(d), broadcast: d => socks.forEach(s => s.send(d)) };
  wss.on('connection', ws => { const id = nid++; socks.set(id, ws); tr.onConnect(id); ws.on('message', d => tr.onMessage(id, d.toString())); ws.on('close', () => { socks.delete(id); tr.onClose(id); }); });
  const host = new HostSession(e, tr, 'host');
  const clients = ['A', 'B'].map(n => { const c = new ClientSession('ws://127.0.0.1:18787', 'cli' + n, '玩家' + n, WebSocket); c.code = HARV; return c; });
  await new Promise(r => setTimeout(r, 500));
  assert(Object.keys(e.w.players).length === 3, '两个客户端加入，房主上共 3 名玩家');
  assert(e.w.S === 3, '玩家数增加 → 世界扩张到 3x3 房间');
  const spawnRooms = e.w.spawns.map(s => roomName(s.x, s.y)); assert(new Set(spawnRooms).size === 3, '每个玩家有自己的 Spawn，且在不同房间: ' + spawnRooms.join(' '));
  for (let i = 0; i < 400; i++) { e.tick(); host.afterTick(50); if (i % 50 === 0) await new Promise(r => setTimeout(r, 5)); }
  await new Promise(r => setTimeout(r, 300));
  const v = clients[0].view;
  assert(v && v.time === e.w.time, `客户端收到同步状态 tick=${v && v.time}`);
  assert(Object.keys(clients[0].rooms).length === 9, '客户端收到 9 个房间地形');
  for (const pid of ['host', 'cliA', 'cliB']) { const n = e.w.creeps.filter(c => c.owner === pid).length, sp = e.w.spawns.find(s => s.owner === pid); assert(n >= 2, `${pid} 的代码在房主上运行：${n} 个 creep，spawn 能量 ${sp.energy}`); }
  assert(v.events !== undefined, '快照带有动画事件');
  clients[1].sendCode(''); await new Promise(r => setTimeout(r, 200)); assert(e.w.players.cliB.code === '', '客户端可在运行中更新代码');
  // 存档 / 读档
  const e2 = new Engine(JSON.parse(e.saveData())); assert(e2.w.creeps.length === e.w.creeps.length && e2.w.controllers.length === e.w.controllers.length, '存档往返正常');
  clients.forEach(c => c.close()); wss.close(); console.log('ALL PASS'); process.exit(0);
})();
