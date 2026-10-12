// 伪造原生桥 + GitHub API，验证应用内更新的 JS 流程：进度 → 无权限 → 打开设置 → 返回后安装；以及失败重试
const p = require('puppeteer-core');
async function run(scenario) {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 860 });
  await pg.evaluateOnNewDocument(sc => {
    window.__calls = []; window.androidBridge = { postMessage() {} }; const cbs = {}; let dlCount = 0, perm = false;
    const m = n => n.map(x => ({ name: x, rtype: 'promise' })), L = [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }];
    window.__emit = (ev, d) => (cbs[ev] || []).forEach(f => f(d, null));
    window.Capacitor = { platform: 'android', isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {},
      PluginHeaders: [{ name: 'AppUpdater', methods: m(['download', 'cancel', 'canInstall', 'openInstallSettings', 'install']).concat(L) }, { name: 'LanServer', methods: m(['start']).concat(L) }, { name: 'Browser', methods: m(['open']) }],
      nativeCallback: (pl, me, o, cb) => { (cbs[o.eventName] = cbs[o.eventName] || []).push(cb); return 'cb'; },
      nativePromise: (pl, me, o) => { window.__calls.push(pl + '.' + me + (me === 'download' ? JSON.stringify(o) : ''));
        if (me === 'download') { dlCount++; if (sc === 'fail' && dlCount === 1) return Promise.reject(new Error('下载失败：HTTP 500'));
          return new Promise(res => { let g = 0; const t = setInterval(() => { g += 1000000; window.__emit('progress', { received: Math.min(g, 3500000), total: 3500000 }); if (g >= 3500000) { clearInterval(t); res({ path: '/cache/updates/update.apk', size: 3500000, sha256: 'ab' }); } }, 100); }); }
        if (me === 'canInstall') return Promise.resolve({ allowed: perm });
        if (me === 'openInstallSettings') { setTimeout(() => { perm = true; window.__emit('resume', {}); }, 300); return Promise.resolve(); }
        return Promise.resolve({}); } };
    localStorage.setItem('sbm_intro', '1');
  }, scenario);
  await pg.setRequestInterception(true);
  pg.on('request', r => r.url().includes('api.github.com') ? r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ tag_name: 'v9.9.9', body: '测试版本', assets: [{ name: 'x.apk', size: 3500000, digest: 'sha256:ab', browser_download_url: 'https://github.com/x/releases/download/v9.9.9/x.apk' }] }) }) : r.continue());
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto('http://localhost:8765/index.html'); await new Promise(r => setTimeout(r, 3000));
  const visible = await pg.$eval('#upd', e => !e.classList.contains('hidden'));
  await pg.click('#updGo'); await new Promise(r => setTimeout(r, 200)); await pg.screenshot({ path: `/tmp/upd-${scenario}-1.png` });
  if (scenario === 'fail') { await new Promise(r => setTimeout(r, 300)); const msg = await pg.$eval('#updMsg', e => e.textContent), link = await pg.$eval('#updLink', e => !e.classList.contains('hidden')); console.log(scenario, 'after fail:', msg, 'fallback link shown:', link); await pg.screenshot({ path: '/tmp/upd-fail-2.png' }); await pg.click('#updGo'); }
  await new Promise(r => setTimeout(r, 1500));
  const res = await pg.evaluate(() => ({ calls: window.__calls, msg: document.querySelector('#updMsg').textContent }));
  await pg.screenshot({ path: `/tmp/upd-${scenario}-end.png` }); await b.close();
  const order = res.calls.map(c => c.split('{')[0]).join(' > ');
  const ok = visible && /AppUpdater.canInstall > AppUpdater.openInstallSettings > AppUpdater.canInstall > AppUpdater.install$/.test(order) && res.calls.some(c => c.includes('"sha256":"ab"') && c.includes('"size":3500000'));
  console.log(scenario, 'dialog:', visible, '\n  calls:', order, '\n  msg:', res.msg, '\n ', ok ? 'PASS' : 'FAIL'); return ok;
}
(async () => { const a = await run('ok'), c = await run('fail'); process.exit(a && c ? 0 : 1); })();
