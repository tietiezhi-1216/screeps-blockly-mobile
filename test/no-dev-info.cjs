// 无头测试：玩家界面不出现开发者信息（哈希/校验/GitHub/提交号）；更新说明过滤；截图到 /workspace/shots-clean
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const W = ms => new Promise(r => setTimeout(r, ms)), ROOT = path.join(__dirname, '../www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
const DEV = /sha-?256|\.sha256|校验|哈希|github|commit|开源|star|[0-9a-f]{40}/i;
const NOTES = '## 新内容\n\n- 返回键逐层后退\n- 编辑器满屏\n\n## 校验\n\nSHA-256 `' + 'a'.repeat(64) + '`\n\n- 附带 .sha256 文件\n\n## 修复\n\n- 出生房间 undefined\n\nSHA-256: ' + 'b'.repeat(64) + '\n源码见 https://github.com/x/y';
const SHOTS = '/workspace/shots-clean'; fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [tag, vw, vh] of [['portrait', 412, 915], ['landscape', 915, 412]]) {
    const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
    await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); });
    await pg.setRequestInterception(true);
    pg.on('request', r => r.url().includes('api.github.com') ? r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ tag_name: 'v9.9.9', body: NOTES, assets: [{ name: 'x.apk', size: 3500000, digest: 'sha256:' + 'a'.repeat(64), browser_download_url: 'https://example.invalid/x.apk' }] }) }) : r.continue());
    await pg.goto(`http://localhost:${port}/index.html`); await W(2500);
    // 关于页
    await pg.evaluate(() => document.querySelector('[data-act="go:about"]').click()); await W(500);
    const about = await pg.evaluate(() => document.getElementById('start').innerText);
    ok(!DEV.test(about) && /版本/.test(about) && /检查更新/.test(about), tag + ' 关于页只有版本和检查更新：' + about.replace(/\s+/g, ' ').slice(0, 80));
    await pg.screenshot({ path: `${SHOTS}/about-${tag}.png` });
    for (const pgName of ['home', 'profile', 'settings', 'help', 'stats', 'saves', 'snippets']) {
      const t = await pg.evaluate(n => { try { Shell.show ? Shell.show(n) : 0; } catch (e) {} return document.getElementById('start').innerText; }, pgName);
      ok(!DEV.test(t), tag + ' 页面 ' + pgName + ' 无开发者信息');
    }
    // 更新弹窗
    await pg.evaluate(() => checkUpdate(true)); await W(800);
    const notes = await pg.evaluate(() => document.querySelector('#upd, .uu:not(.hidden)').innerText);
    ok(!DEV.test(notes), tag + ' 更新弹窗不显示哈希/校验/GitHub');
    ok(/返回键逐层后退/.test(notes) && /出生房间 undefined/.test(notes) && !/附带/.test(notes), tag + ' 正常说明保留、校验小节整节去掉');
    await pg.screenshot({ path: `${SHOTS}/update-${tag}.png` });
    await pg.close();
  }
  { // 下载 / 安装失败：只给玩家固定提示，不出现 e.message、HTTP 码
    const pg = await b.newPage(); await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); window.__mode = 'dl';
      window.Capacitor = { isNativePlatform: () => true, registerPlugin: n => window.Capacitor.Plugins[n] || null, Plugins: { AppUpdater: { addListener() {}, download: () => window.__mode === 'dl' ? Promise.reject(new Error('HTTP 404 Not Found')) : Promise.resolve({ path: '/x.apk' }), canInstall: () => Promise.resolve({ allowed: true }), install: () => Promise.reject(new Error('java.lang.SecurityException 500')) } } }; });
    await pg.goto(`http://localhost:${port}/index.html`); await W(1500);
    const run = () => pg.evaluate(async () => { const C = window.Capacitor = window.Capacitor || {}; C.isNativePlatform = () => true; C.registerPlugin = () => null; nativePlugin.AppUpdater = { addListener() {}, download: () => window.__mode === 'dl' ? Promise.reject(new Error('HTTP 404 Not Found')) : Promise.resolve({ path: '/x.apk' }), canInstall: () => Promise.resolve({ allowed: true }), install: () => Promise.reject(new Error('java.lang.SecurityException 500')) }; Upd.show({ tag_name: 'v9.9.9', body: 'x', assets: [] }, { name: 'x.apk', size: 1, browser_download_url: 'http://localhost/x.apk', digest: 'sha256:' + 'a'.repeat(64) }, '1.0.0'); await Upd.start(); await new Promise(r => setTimeout(r, 200)); return Upd.el.innerText; });
    let t = await run(); ok(/下载失败，请检查网络后重试/.test(t) && !/404|HTTP|Not Found/.test(t), '下载失败只提示「下载失败，请检查网络后重试」');
    await pg.evaluate(() => { window.__mode = 'ok'; }); t = await run(); ok(/无法安装，请重试/.test(t) && !/Exception|500/.test(t), '安装失败只提示「无法安装，请重试」');
    const src = fs.readFileSync(path.join(ROOT, 'update.js'), 'utf8'); ok(!/(fail|alert|error|info)\((e\.message|String\(e\)|`[^`]*\$\{e)/.test(src), 'update.js 不把 e.message 显示给玩家');
    await pg.close(); }
  await b.close(); srv.close(); console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
