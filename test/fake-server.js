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
