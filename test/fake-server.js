// 离线界面测试用的「假私服」：在页面里替换 fetch / WebSocket，回放 test/fixtures/pserver.json（由 record-fixture.cjs 从真实私服录制）。
// 地址固定为 fake.sbm:21025；所有写操作（插旗、工地、自杀、上传代码…）记录在 window.__req 并回 {ok:1}，测试据此检查 App 发出的请求。
// 用法（puppeteer）：await page.evaluateOnNewDocument(require('./fake-server.js').install, fixture)
exports.HOST = 'fake.sbm:21025';
exports.CFG = { kind: 'private', host: 'fake.sbm:21025', username: 'tester', password: 'tester-pass' };
exports.install = function (FX) {
  window.__req = []; const H = FX.http, RF = window.fetch.bind(window);
  const resp = (status, txt) => new Response(txt, { status, headers: { 'Content-Type': 'application/json', 'X-Token': 'FAKE' } });
  window.fetch = async (u, o = {}) => {
    const s = String(u); if (!/^https?:\/\/fake\.sbm(:\d+)?\//.test(s)) return RF(u, o);
    const U = new URL(s), m = (o.method || 'GET').toUpperCase(); let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch (e) {}
    window.__req.push({ m, p: U.pathname, q: Object.fromEntries(U.searchParams), body });
    if (U.pathname === '/api/auth/signin') return body && body.password === 'tester-pass' ? resp(200, '{"ok":1,"token":"FAKE"}') : resp(401, 'Unauthorized');
    let k = m + ' ' + U.pathname; if (U.pathname === '/api/game/room-terrain') k += '?' + U.searchParams.get('room');
    if (H[k] != null) return resp(200, H[k]);
    if (m === 'POST') return resp(200, '{"ok":1}');
    if (U.pathname === '/api/user/code') return resp(200, '{"ok":1,"branch":"default","modules":{}}');
    if (U.pathname === '/api/user/memory') return resp(200, '{"ok":1,"data":{}}');
    return resp(404, 'Not Found');
  };
  const RWS = window.WebSocket;
  window.WebSocket = function (u) { if (!/^wss?:\/\/fake\.sbm/.test(String(u))) return new RWS(u);
    const ws = { readyState: 0, send(d) { const [c] = JSON.parse(d); window.__req.push({ ws: c });
        if (c.startsWith('auth ')) push(['auth ok FAKE']);
        else if (c.startsWith('subscribe ')) { const ch = c.slice(10), L = FX.ws[ch]; if (L) L.forEach((x, i) => setTimeout(() => push([JSON.stringify([ch, x])]), 50 + i * 300)); } },
      close() { ws.readyState = 3; ws.onclose && ws.onclose({}); } };
    const push = a => ws.readyState === 1 && ws.onmessage && ws.onmessage({ data: 'a' + JSON.stringify(a) });
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); ws.onmessage && ws.onmessage({ data: 'o' }); }, 20); return ws; };
  window.WebSocket.OPEN = 1;
  localStorage.setItem('sbm_server', JSON.stringify({ kind: 'private', host: 'fake.sbm:21025', username: 'tester', password: 'tester-pass' }));
};
// Node 里用的同款回放（不开浏览器）：new OnlineSession(CFG, nodeDeps(FX))
exports.nodeDeps = function (FX) {
  const H = FX.http, LS = {}, req = [];
  const resp = (status, t) => ({ status, headers: { get: k => (/x-token/i.test(k) ? 'FAKE' : null) }, text: async () => t });
  const fetch = async (u, o = {}) => { const U = new URL(u), m = (o.method || 'GET').toUpperCase(); let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch (e) {} req.push({ m, p: U.pathname, body });
    if (U.pathname === '/api/auth/signin') return body && body.password === 'tester-pass' ? resp(200, '{"ok":1,"token":"FAKE"}') : resp(401, 'Unauthorized');
    let k = m + ' ' + U.pathname; if (U.pathname === '/api/game/room-terrain') k += '?' + U.searchParams.get('room');
    if (H[k] != null) return resp(200, H[k]); if (m === 'POST') return resp(200, '{"ok":1}'); return resp(404, 'Not Found'); };
  function WebSocket() { const ws = this; ws.readyState = 0;
    const push = a => ws.readyState === 1 && ws.onmessage && ws.onmessage({ data: 'a' + JSON.stringify(a) });
    ws.send = d => { const [c] = JSON.parse(d); if (c.startsWith('auth ')) push(['auth ok FAKE']); else if (c.startsWith('subscribe ')) { const ch = c.slice(10); (FX.ws[ch] || []).forEach((x, i) => setTimeout(() => push([JSON.stringify([ch, x])]), 5 + i * 20)); } };
    ws.close = () => { ws.readyState = 3; ws.onclose && ws.onclose({}); };
    setTimeout(() => { ws.readyState = 1; ws.onmessage && ws.onmessage({ data: 'o' }); }, 5); }
  return { fetch, WebSocket, storage: { getItem: k => LS[k] ?? null, setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } }, req };
};
// ---- 官方服务器回放（test/fixtures/official.json，由 record-official-fixture.cjs 从 screeps.com 只读录制、已脱敏）----
// 地址 https://screeps.com；需要 X-Token；map-stats 按请求的房间从录制的全集里挑；roomMap2 / room 频道按录制回放。
// 官方地图 CDN 的缩略图不走 fetch（<img>），浏览器测试里用 puppeteer 的请求拦截回放：officialCdn(page, FX)。
exports.OFFICIAL_CFG = { kind: 'official', token: 'FAKE-TOKEN', shard: 'shard3' };
function officialHandler(FX, log) {
  return (u, m, body, hdr) => {
    const U = new URL(u); log && log({ m, p: U.pathname, q: Object.fromEntries(U.searchParams), body });
    if (U.pathname !== '/api/version' && !hdr['X-Token'] && !hdr['x-token']) return [401, '{"error":"unauthorized"}'];
    if (U.pathname === '/api/game/map-stats') { const st = {}, us = {}; for (const n of (body && body.rooms) || []) { const s = FX.mapStats.stats[n]; if (s) { st[n] = s; const o = s.own && s.own.user; if (o && FX.mapStats.users[o]) us[o] = FX.mapStats.users[o]; } }
      return [200, JSON.stringify({ ok: 1, stats: st, users: us, gameTime: 1 })]; }
    let k = m + ' ' + U.pathname; if (U.pathname === '/api/game/room-terrain') k += '?' + U.searchParams.get('room');
    const e = FX.http[k]; if (e) return [e.status, e.body];
    if (m === 'POST') return [200, '{"ok":1}'];
    return [404, 'Not Found'];
  };
}
function officialWS(FX, push0) { // 返回 send 处理
  return (c, push) => { if (c.startsWith('auth ')) push(['auth ok']); else if (c.startsWith('subscribe ')) { const ch = c.slice(10); (FX.ws[ch] || []).forEach((x, i) => setTimeout(() => push([JSON.stringify([ch, x])]), 30 + i * 200)); } };
}
exports.installOfficial = function (FX, fns) {
  // 在页面里执行：fns 是 [officialHandler, officialWS] 的源码
  const H = (0, eval)('(' + fns[0] + ')')(FX, x => window.__req.push(x)), WSH = (0, eval)('(' + fns[1] + ')')(FX);
  window.__req = []; const RF = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => { const s = String(u); if (!/^https:\/\/screeps\.com\//.test(s)) return RF(u, o); let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch (e) {}
    const [st, t] = H(s, (o.method || 'GET').toUpperCase(), body, o.headers || {}); return new Response(t, { status: st, headers: { 'Content-Type': 'application/json' } }); };
  const RWS = window.WebSocket;
  window.WebSocket = function (u) { if (!/^wss:\/\/screeps\.com/.test(String(u))) return new RWS(u);
    const ws = { readyState: 0, send(d) { const [c] = JSON.parse(d); window.__req.push({ ws: c }); WSH(c, push); }, close() { ws.readyState = 3; ws.onclose && ws.onclose({}); } };
    const push = a => ws.readyState === 1 && ws.onmessage && ws.onmessage({ data: 'a' + JSON.stringify(a) });
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); ws.onmessage && ws.onmessage({ data: 'o' }); }, 20); return ws; };
  window.WebSocket.OPEN = 1;
  localStorage.setItem('sbm_server', JSON.stringify({ kind: 'official', token: 'FAKE-TOKEN', shard: FX.shard }));
};
exports.officialFns = [officialHandler.toString(), officialWS.toString()];
exports.officialCdn = async function (page, FX, opt = {}) {
  await page.setRequestInterception(true); const hits = [];
  page.on('request', q => { const u = q.url(); const m = /d3os7yery2usni\.cloudfront\.net\/map\/([^/]+)\/([^/.]+)\.png/.exec(u);
    if (!m) return q.continue(); hits.push(m[2]); const b = !opt.fail && FX.png[m[2]];
    return b ? q.respond({ status: 200, contentType: 'image/png', body: Buffer.from(b, 'base64') }) : q.respond({ status: 404, body: '' }); });
  return hits;
};
exports.nodeDepsOfficial = function (FX) {
  const LS = {}, req = [], H = officialHandler(FX, x => req.push(x)), WSH = officialWS(FX);
  const fetch = async (u, o = {}) => { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch (e) {} const [st, t] = H(u, (o.method || 'GET').toUpperCase(), body, o.headers || {});
    return { status: st, headers: { get: () => null }, text: async () => t }; };
  function WebSocket() { const ws = this; ws.readyState = 0; const push = a => ws.readyState === 1 && ws.onmessage && ws.onmessage({ data: 'a' + JSON.stringify(a) });
    ws.send = d => { const [c] = JSON.parse(d); req.push({ ws: c }); WSH(c, push); }; ws.close = () => { ws.readyState = 3; ws.onclose && ws.onclose({}); };
    setTimeout(() => { ws.readyState = 1; ws.onmessage && ws.onmessage({ data: 'o' }); }, 5); }
  return { fetch, WebSocket, storage: { getItem: k => LS[k] ?? null, setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } }, req, LS };
};
