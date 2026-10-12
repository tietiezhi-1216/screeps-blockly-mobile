// 在浏览器里伪造 Capacitor 原生桥（与安卓 WebView 注入的 native-bridge.js 接口一致），验证“开房”走原生插件路径
const p = require('puppeteer-core');
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 860 });
  await pg.evaluateOnNewDocument(() => {
    window.__calls = []; window.androidBridge = { postMessage() {} };
    const m = n => n.map(x => ({ name: x, rtype: 'promise' }));
    window.Capacitor = { platform: 'android', isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: () => true, Plugins: {},
      PluginHeaders: [{ name: 'LanServer', methods: m(['start', 'stop', 'send', 'broadcast', 'kick', 'discover', 'getIps']).concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }]) }, { name: 'Browser', methods: m(['open']) }],
      nativePromise: (pl, me, o) => { window.__calls.push(pl + '.' + me); return Promise.resolve(me === 'start' ? { ips: ['192.168.1.12', '172.19.0.1', '10.1.104.180'], port: 8787 } : me === 'discover' ? { hosts: [{ ip: '192.168.1.9', name: '房主', port: 8787 }] } : {}); },
      nativeCallback: (pl, me) => { window.__calls.push(pl + '.' + me); return 'cb1'; }, toNative: () => {}, fromNative: () => {} };
    window.alert = s => window.__calls.push('ALERT:' + s); window.confirm = () => false;
  });
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto('http://localhost:8765/index.html'); await new Promise(r => setTimeout(r, 2500));
  await pg.screenshot({ path: '/tmp/start.png' }); await pg.click('#sPlay'); await new Promise(r => setTimeout(r, 300));
  await pg.screenshot({ path: '/tmp/intro.png' });
  await pg.click('#introOk'); await pg.evaluate(() => document.getElementById('btnNet').click()); await pg.click('#nHost'); await new Promise(r => setTimeout(r, 500));
  await pg.click('#nScan'); await new Promise(r => setTimeout(r, 500)); await pg.screenshot({ path: '/tmp/net.png' });
  const res = await pg.evaluate(() => ({ calls: window.__calls, mode, status: document.getElementById('netStatus').textContent, hosts: document.getElementById('hosts').textContent }));
  console.log(JSON.stringify(res, null, 1));
  await pg.click('#nClose'); await pg.evaluate(() => { const sp = engine.w.spawns[0]; renderer.onTap(sp.x, sp.y); }); await new Promise(r => setTimeout(r, 300)); await pg.screenshot({ path: '/tmp/hud.png' });
  await pg.click('#btnCode'); await new Promise(r => setTimeout(r, 800)); await pg.screenshot({ path: '/tmp/blockly.png' });
  const cat = await pg.$$('#catBar .cat'); await cat[0].click(); await new Promise(r => setTimeout(r, 600)); await pg.screenshot({ path: '/tmp/flyout.png' });
  const ok = res.mode === 'host' && res.calls.includes('LanServer.start') && res.calls.includes('LanServer.discover') && res.status.includes('房主中') && !res.calls.some(c => c.startsWith('ALERT'));
  console.log(ok ? 'NATIVE PATH OK' : 'NATIVE PATH FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})();
