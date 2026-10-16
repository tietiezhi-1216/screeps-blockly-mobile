// 从真实私服录一份离线夹具（test/fixtures/pserver.json），给不连服务器的界面测试用（test/fake-server.js 回放）。
//   SBM_SERVER=127.0.0.1:21025 SBM_USER=xxx SBM_PASS=xxx node test/record-fixture.cjs
const WebSocket = require('ws'), fs = require('fs'), path = require('path');
const { OnlineSession } = require('../www/online.js');
const HOST = process.env.SBM_SERVER, USER = process.env.SBM_USER, PASS = process.env.SBM_PASS;
if (!HOST || !USER || !PASS) { console.error('需要 SBM_SERVER / SBM_USER / SBM_PASS'); process.exit(1); }
const http = {}, ws = {}, LS = {};
const rec = async (u, o = {}) => { const r = await fetch(u, o); const t = await r.text(); const U = new URL(u), m = (o.method || 'GET');
  let key = m + ' ' + U.pathname; if (U.pathname === '/api/game/room-terrain') key += '?' + U.searchParams.get('room');
  if (!/signin/.test(key)) http[key] = t.replace(/"token":"[0-9a-f]+"/g, '"token":"FAKE"');
  return { status: r.status, headers: { get: k => r.headers.get(k) }, text: async () => t }; };
class RecWS extends WebSocket { constructor(u) { super(u); this.addEventListener('message', ev => { const d = String(ev.data); if (d[0] !== 'a') return; for (const m of JSON.parse(d.slice(1))) { try { const j = JSON.parse(m); if (Array.isArray(j) && /^room:/.test(j[0])) (ws[j[0]] = ws[j[0]] || []).push(j[1]); } catch (e) {} } }); } }
(async () => {
  global.localStorage = { getItem: k => LS[k] ?? null, setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
  const s = new OnlineSession({ kind: 'private', host: HOST, username: USER, password: PASS }, { fetch: rec, WebSocket: RecWS, storage: global.localStorage });
  await s.start(); const home = s.kOf(s.home), G = require('../www/geo.js');
  const keeper = Object.keys(s.mapInfo).find(k => s.mapInfo[k] && /^W[0-9]*[4-6]N[0-9]*[4-6]$/.test(s.nameOf(k)) && !/5N[0-9]*5$/.test(s.nameOf(k))); // Source Keeper 房间（贴图测试用）
  s.watch([home, keeper].filter(Boolean)); console.log('watch', s.home, keeper && s.nameOf(keeper));
  await new Promise(r => setTimeout(r, 6000)); s.stop();
  for (const k in ws) ws[k] = ws[k].slice(0, 6);
  const out = { note: '录自 screepers/screeps-launcher 私服（screeps 4.x）', user: s.me.username, home: s.home, keeper: keeper && s.nameOf(keeper), http, ws };
  fs.writeFileSync(path.join(__dirname, 'fixtures/pserver.json'), JSON.stringify(out));
  console.log('http', Object.keys(http).length, 'ws', Object.keys(ws).map(k => k + ':' + ws[k].length).join(' '), (fs.statSync(path.join(__dirname, 'fixtures/pserver.json')).size / 1024).toFixed(0) + 'KB');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
