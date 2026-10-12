// 在电脑/盒子上运行一个无界面房主：node test/host-server.js [端口]
const fs = require('fs'), vm = require('vm'), path = require('path'); const { WebSocketServer } = require('ws');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8'); vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('net.js'));
const port = +process.argv[2] || 8787, e = new Engine(newWorld(42)); e.addPlayer('bot', '机器人');
e.setCode('bot', `Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE],'b'+Game.time);for(const n in Game.creeps){const c=Game.creeps[n];if(c.store.getFreeCapacity()===0){const s=Game.spawns['Spawn1'];if(c.transfer(s,RESOURCE_ENERGY)===ERR_NOT_IN_RANGE)c.moveTo(s);}else{const s=c.pos.findClosestByPath(FIND_SOURCES);if(s&&c.harvest(s)===ERR_NOT_IN_RANGE)c.moveTo(s);}}`);
const wss = new WebSocketServer({ port }); let nid = 1; const socks = new Map();
const tr = { send: (id, d) => socks.get(id)?.send(d), broadcast: d => socks.forEach(s => s.send(d)) };
wss.on('connection', ws => { const id = nid++; socks.set(id, ws); tr.onConnect(id); ws.on('message', d => tr.onMessage(id, d.toString())); ws.on('close', () => { socks.delete(id); tr.onClose(id); }); });
const h = new HostSession(e, tr, 'bot'); setInterval(() => { e.tick(); h.afterTick(250); }, 250); console.log('host on', port);
