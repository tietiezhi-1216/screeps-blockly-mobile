// 从官方服务器（screeps.com）录一份世界地图的离线夹具：test/fixtures/official.json（测试用 fake-server.js 的官方模式回放）。
// 只做只读请求，严格省着用限额（整个录制约 15 次 HTTP）：
//   start（version / auth/me / world-size / world-status / user/rooms / map-stats / 家的地形 / time）
//   + 视野外一圈的 map-stats 1 次 + 几间房的 room-terrain（测 CDN 失败退回）+ roomMap2 订阅（走 WebSocket，不占 HTTP 限额）
//   + 官方地图 CDN 的房间缩略图（公开静态文件）。
// Token 只从环境变量读（source ~/.secrets/screeps-official.env），不写进夹具：自己的 id / 用户名替换成 me0000 / tester。
//   ( . ~/.secrets/screeps-official.env; SCREEPS_TOKEN=$SCREEPS_TOKEN SHARD=shard3 node test/record-official-fixture.cjs )
const WebSocket = require('ws'), fs = require('fs'), path = require('path');
const { OnlineSession } = require('../www/online.js'), { WorldMap, visibleRooms } = require('../www/worldmap.js'), G = require('../www/geo.js');
const TOKEN = process.env.SCREEPS_TOKEN, SHARD = process.env.SHARD || 'shard3', R = 9;
if (!TOKEN) { console.error('需要 SCREEPS_TOKEN（source ~/.secrets/screeps-official.env）'); process.exit(1); }
const http = {}, ws = {}, LS = {}, stats = {}, users = {}; let n = 0, ME = null;
const get = async (u, o, k = 4) => { for (let i = 0; ; i++) try { return await fetch(u, o); } catch (e) { if (i >= k) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); } };
const rec = async (u, o = {}) => { n++; const r = await get(u, o); const t = await r.text(); const U = new URL(u), m = (o.method || 'GET');
  let key = m + ' ' + U.pathname; if (U.pathname === '/api/game/room-terrain') key += '?' + U.searchParams.get('room');
  if (U.pathname === '/api/game/map-stats') { try { const j = JSON.parse(t); Object.assign(stats, j.stats || {}); Object.assign(users, j.users || {}); } catch (e) {} }
  else http[key] = { status: r.status, body: t };
  return { status: r.status, headers: { get: k => r.headers.get(k) }, text: async () => t }; };
class RecWS extends WebSocket { constructor(u) { super(u); this.addEventListener('message', ev => { const d = String(ev.data); if (d[0] !== 'a') return;
  for (const m of JSON.parse(d.slice(1))) { try { const j = JSON.parse(m); if (Array.isArray(j) && /^(roomMap2|room):/.test(j[0])) (ws[j[0]] = ws[j[0]] || []).push(j[1]); } catch (e) {} } }); } }
(async () => {
  const store = { getItem: k => LS[k] ?? null, setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
  const s = new OnlineSession({ kind: 'official', token: TOKEN, shard: SHARD }, { fetch: rec, WebSocket: RecWS, storage: store });
  await s.start(); ME = s.me; console.log('start ok, home', s.home, 'needsSpawn', s.needsSpawn, 'worldW', s.worldW, 'http', n);
  const home = s.home || 'W5N5', [hx, hy] = G.parseRealName(home);
  const M = new WorldMap(s, { storage: store, Image: null, debounce: 50, minGap: 0 }), names = [];
  for (let y = hy - R; y <= hy + R; y++) for (let x = hx - R; x <= hx + R; x++) names.push(G.nameOfReal(x, y));
  // roomMap2：中心 7×7（官方客户端放大时就是订阅视野里每个房间）
  M._tq = []; M.view(names, false); await new Promise(r => setTimeout(r, 4000)); // map-stats 一次补齐视野外
  const near = names.filter(q => { const [x, y] = G.parseRealName(q); return Math.abs(x - hx) <= 3 && Math.abs(y - hy) <= 3; });
  M.want = near; M.wantObj = true; M._syncSubs(); await new Promise(r => setTimeout(r, 9000)); M.close();
  // 少量 room-terrain（CDN 失败时的退回路径）
  for (const q of near.slice(0, 5)) { if (!http['GET /api/game/room-terrain?' + q]) await rec(`https://screeps.com/api/game/room-terrain?room=${q}&encoded=1&shard=${SHARD}`, { headers: { 'X-Token': TOKEN } }); }
  s.stop();
  const png = {}; for (let i = 0; i < names.length; i += 4) await Promise.all(names.slice(i, i + 4).map(async q => { const r = await get(`https://d3os7yery2usni.cloudfront.net/map/${SHARD}/${q}.png`); if (r.ok) png[q] = Buffer.from(await r.arrayBuffer()).toString('base64'); }));
  // 脱敏：自己的 id / 用户名 / 邮箱等全部替换；auth/me 只保留界面要用的字段
  const myId = String(ME._id), myName = String(ME.username), SAFE = t => t.split(myId).join('me0000').split(myName).join('tester').split(TOKEN).join('FAKE');
  try { const j = JSON.parse(http['GET /api/auth/me'].body); http['GET /api/auth/me'].body = JSON.stringify({ ok: 1, _id: j._id, username: j.username, badge: j.badge, gcl: j.gcl, cpu: j.cpu, power: j.power }); } catch (e) {}
  for (const k in http) http[k].body = SAFE(http[k].body);
  for (const k in ws) ws[k] = ws[k].slice(0, 3);
  const out = JSON.parse(SAFE(JSON.stringify({ note: `录自官方服务器 ${SHARD}（只读接口；自己的账号信息已替换）`, shard: SHARD, home, worldW: s.worldW, at: Date.now(), http, mapStats: { stats, users }, ws })));
  out.png = png; const txt = JSON.stringify(out); if (txt.includes(TOKEN) || txt.includes(myId)) throw new Error('脱敏失败');
  fs.writeFileSync(path.join(__dirname, 'fixtures/official.json'), txt);
  console.log('http calls', n, 'stats', Object.keys(stats).length, 'users', Object.keys(users).length, 'ws', Object.keys(ws).length, 'png', Object.keys(png).length, (txt.length / 1024).toFixed(0) + 'KB');
  process.exit(0);
})().catch(e => { console.error(String(e && e.message || e).split(TOKEN).join('***')); process.exit(1); });
