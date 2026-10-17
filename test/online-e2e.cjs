// 真实私服端到端：登录 → 选出生房间放 Spawn → 上传积木生成的 main.js → 订阅房间，看到 creep 出生并移动
// 需要本机或 SBM_SERVER 指向的私服（screepers/screeps-launcher + screepsmod-auth）。用法：
//   SBM_SERVER=127.0.0.1:21025 SBM_USER=tester SBM_PASS=xxxx node test/online-e2e.cjs
const WebSocket = require('ws');
const { ScreepsApi, mergeDelta, decodeTerrain } = require('../www/screeps-api.js');
const HOST = process.env.SBM_SERVER || '127.0.0.1:21025', USER = process.env.SBM_USER || 'e2e' + Date.now().toString(36).slice(-5), PASS = process.env.SBM_PASS || 'e2e-pass-123';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const api = new ScreepsApi({ kind: 'private', host: HOST, username: USER, password: PASS }, { fetch, WebSocket });
  const ver = await api.version(); ok(ver.ok === 1, 'version ' + ver.protocol);
  try { await api.register(USER, PASS); console.log('registered', USER); } catch (e) { console.log('register:', e.message); }
  // 错误密码：中文错误
  const bad = new ScreepsApi({ kind: 'private', host: HOST, username: USER, password: 'wrong' }, { fetch, WebSocket });
  let be = null; try { await bad.login(); } catch (e) { be = e; } ok(be && /用户名或密码不对/.test(be.message), '错误密码提示：' + (be && be.message));
  const me = await api.login(); ok(me._id && me.username === USER, 'login ' + me.username);
  const ws = await api.worldSize(); ok(ws.width > 0, 'world-size ' + ws.width);
  let st = await api.worldStatus(); console.log('world-status', st.status);
  let room;
  if (st.status !== 'normal') {
    // 找一个可出生的房间：map-stats 状态 normal、没人占、有 controller
    const half = ws.width / 2, names = []; for (let y = -half; y < half; y++) for (let x = -half; x < half; x++) names.push((x < 0 ? 'W' + (-x - 1) : 'E' + x) + (y < 0 ? 'N' + (-y - 1) : 'S' + y));
    const ms = await api.mapStats(names); const cand = names.filter(n => ms.stats[n] && ms.stats[n].status === 'normal' && !ms.stats[n].own);
    ok(cand.length > 0, '可出生房间 ' + cand.length);
    for (const n of cand) { const t = decodeTerrain((await api.terrain(n)).terrain[0].terrain);
      // 在房间中部找一块 3x3 平地
      let spot = null; for (let y = 15; y < 35 && !spot; y++) for (let x = 15; x < 35 && !spot; x++) { let f = true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t[(y + dy) * 50 + x + dx] !== 0) f = false; if (f) spot = [x, y]; }
      if (!spot) continue; try { await api.placeSpawn(n, spot[0], spot[1], 'Spawn1'); room = n; console.log('spawn placed', n, spot); break; } catch (e) { console.log('place-spawn', n, e.message); } }
    ok(room, '放置 Spawn1');
  }
  st = await api.worldStatus(); ok(st.status === 'normal', 'world-status normal');
  if (!room) { const r = await api.get('/api/user/rooms', { id: me._id }); room = r.shards ? Object.values(r.shards)[0][0] : r.rooms[0]; }
  // 积木生成的程序结构（module.exports.loop）
  const main = `module.exports.loop = function () {
  for (const n in Memory.creeps) if (!Game.creeps[n]) delete Memory.creeps[n];
  const sp = Object.values(Game.spawns)[0];
  if (sp && !sp.spawning && Object.keys(Game.creeps).length < 2) sp.spawnCreep([WORK, CARRY, MOVE], 'w' + Game.time);
  for (const c of Object.values(Game.creeps)) { const s = c.pos.findClosestByRange(FIND_SOURCES); if (c.harvest(s) === ERR_NOT_IN_RANGE) c.moveTo(s); }
  console.log('tick ' + Game.time + ' creeps ' + Object.keys(Game.creeps).length);
};`;
  const br = await api.branches(); const active = (br.list.find(b => b.activeWorld) || { branch: 'default' }).branch;
  const up = await api.codeSet(active, { main }); ok(up.ok === 1, '上传代码到分支 ' + active);
  const back = await api.codeGet(active); ok(back.modules.main === main, '代码读回一致');
  await api.connect(); ok(true, 'websocket auth');
  const objs = {}; let lastCreeps = {}, seenMove = false, logs = 0;
  api.subscribe(api.roomChannel(room), d => { mergeDelta(objs, d.objects || {});
    const cr = Object.values(objs).filter(o => o.type === 'creep' && o.user === me._id);
    for (const c of cr) { const p = lastCreeps[c._id]; if (p && (p.x !== c.x || p.y !== c.y)) seenMove = true; lastCreeps[c._id] = { x: c.x, y: c.y }; } });
  api.subscribe(`user:${me._id}/console`, d => { if (d.messages && d.messages.log.length) logs++; });
  for (let i = 0; i < 120 && !seenMove; i++) await sleep(1000);
  for (let i = 0; i < 20 && !logs; i++) await sleep(1000); // 控制台消息每 tick 推一次，creep 先动了也要再等一会儿
  const crs = Object.values(objs).filter(o => o.type === 'creep' && o.user === me._id);
  ok(Object.values(objs).some(o => o.type === 'spawn' && o.user === me._id), '房间订阅里有自己的 Spawn');
  ok(crs.length > 0, 'creep 出生：' + crs.map(c => c.name).join(','));
  ok(seenMove, 'creep 在房间订阅里移动');
  ok(logs > 0, '控制台订阅收到 console.log');
  api.close(); console.log('E2E PASS', USER, room); process.exit(0);
})().catch(e => { console.error('FAIL', e.message, e.raw || ''); process.exit(1); });
