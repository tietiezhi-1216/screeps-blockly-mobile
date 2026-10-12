// 引擎性能基准：N 名玩家、每人若干 creep，测平均 tick 耗时
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8'); vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js'));
const code = `Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE],'c'+Game.time);for(const n in Game.creeps){const c=Game.creeps[n];if(c.store.getFreeCapacity()===0){const s=Game.spawns['Spawn1'];if(c.transfer(s,RESOURCE_ENERGY)===ERR_NOT_IN_RANGE)c.moveTo(s);}else{const s=c.pos.findClosestByPath(FIND_SOURCES);if(s&&c.harvest(s)===ERR_NOT_IN_RANGE)c.moveTo(s);}}`;
const e = new Engine(newWorld(42)); for (let i = 0; i < 4; i++) { e.addPlayer('p' + i, 'P' + i); e.setCode('p' + i, code); }
for (let i = 0; i < 300; i++) e.tick();
const t0 = performance.now(), N = 500; for (let i = 0; i < N; i++) e.tick(); const dt = (performance.now() - t0) / N;
console.log(`creeps=${e.w.creeps.length} world=${e.w.S}x${e.w.S} avg tick=${dt.toFixed(2)} ms`);
