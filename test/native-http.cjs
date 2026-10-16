// 安卓 App 里连私服走原生 HTTP（CapacitorHttp）：私服后端不发 CORS 头，WebView 里的 fetch 会被拦。
// 伪造 Capacitor 原生桥（与安卓 WebView 注入的 native-bridge.js 接口一致），回放 test/fixtures/pserver.json，验证登录/读地图都走原生插件、不走 fetch。
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json'), ROOT = path.join(__dirname, '../www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915 }); pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
  await pg.evaluateOnNewDocument(FS.install, FX); // 只用它的 WebSocket 回放；HTTP 由下面的原生桥回答
  await pg.evaluateOnNewDocument(H => {
    localStorage.setItem('sbm_intro', '1'); window.__native = []; window.androidBridge = { postMessage() {} };
    const m = n => n.map(x => ({ name: x, rtype: 'promise' }));
    window.Capacitor = { platform: 'android', isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: () => true, Plugins: {},
      PluginHeaders: [{ name: 'CapacitorHttp', methods: m(['request', 'get', 'post']) }, { name: 'App', methods: m(['exitApp', 'getInfo']).concat([{ name: 'addListener', rtype: 'callback' }]) }],
      nativePromise: async (pl, me, o) => { window.__native.push({ pl, me, o });
        if (pl !== 'CapacitorHttp') return {};
        const U = new URL(o.url); if (U.hostname === 'api.github.com') throw new Error('offline');
        if (U.pathname === '/api/auth/signin') return o.data && o.data.password === 'tester-pass' ? { status: 200, headers: { 'Content-Type': 'application/json', 'X-Token': 'FAKE' }, data: '{"ok":1,"token":"FAKE"}' } : { status: 401, headers: {}, data: 'Unauthorized' };
        let k = o.method + ' ' + U.pathname; if (U.pathname === '/api/game/room-terrain') k += '?' + U.searchParams.get('room');
        return H[k] != null ? { status: 200, headers: { 'content-type': 'application/json', 'x-token': 'FAKE' }, data: H[k] } : { status: o.method === 'POST' ? 200 : 404, headers: {}, data: o.method === 'POST' ? '{"ok":1}' : 'Not Found' }; },
      nativeCallback: () => 'cb1', toNative: () => {}, fromNative: () => {} };
  }, FX.http);
  await pg.goto(`http://localhost:${srv.address().port}/index.html`);
  for (let n = 0; n < 50 && !(await pg.evaluate(() => !!sess)); n++) await new Promise(r => setTimeout(r, 200));
  const r = await pg.evaluate(() => ({ on: !!sess, me: sess && sess.me.username, nat: __native.filter(c => c.pl === 'CapacitorHttp').map(c => c.o.method + ' ' + new URL(c.o.url).pathname), web: __req.filter(q => q.p).map(q => q.p) }));
  ok(r.on && r.me === FX.user, '在原生环境里自动连上私服：' + r.me);
  ok(r.nat.includes('POST /api/auth/signin') && r.nat.includes('GET /api/auth/me') && r.nat.some(x => /map-stats/.test(x)), '登录、读地图走原生 HTTP（' + r.nat.length + ' 次）');
  ok(r.web.length === 0, 'WebView fetch 没有直接访问私服（不受 CORS 影响）' + (r.web.length ? '：' + r.web.join(',') : ''));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../capacitor.config.json'), 'utf8'));
  ok(cfg.android && cfg.android.allowMixedContent === true, '允许 https 页面里连 http 私服（allowMixedContent）');
  await b.close(); srv.close(); console.log(fails ? fails + ' FAIL' : 'ok - native-http'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
