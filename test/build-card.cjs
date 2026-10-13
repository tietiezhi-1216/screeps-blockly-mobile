// 无头：建造菜单卡片在竖屏/横屏/窄屏、各 RCL 下文字不溢出、无字距、图标 28-32px + 截图
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms));
const http = require('http'), fsx = require('fs'), path = require('path'), ROOT = path.join(__dirname, '../www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fsx.existsSync(f) || fsx.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fsx.createReadStream(f).pipe(r); });
let PORT;
const OUT = process.env.OUT || '/workspace/shots-buildcard'; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
require('fs').mkdirSync(OUT, { recursive: true });
async function run(b, vw, vh, tag) {
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1500); await pg.tap('#sPlay'); await W(800);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); document.getElementById('introOk')?.click(); $('wmap').classList.add('hidden'); if (!engine.w.spawns.find(s => s.owner === myPid)) engine.placeSpawn(myPid); }); await W(300);
  for (let lvl = 1; lvl <= 8; lvl++) {
    const m = await pg.evaluate(L => { const r = myRoomCtx(); const c = ctrlOfRoom(engine.w, r.k); c.level = L; openBuildPicker();
      const out = []; const btns = [...document.querySelectorAll('#bpList button')];
      for (const b of btns) { const R = b.getBoundingClientRect(), cs = getComputedStyle(b);
        const ic = b.querySelector('.bi').getBoundingClientRect();
        const bad = [...b.querySelectorAll('.n,.d')].filter(e => { const r = e.getBoundingClientRect(); return r.right > R.right - 1 || r.left < R.left || r.bottom > R.bottom || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis'; }).map(e => e.textContent);
        const ls = [b, ...b.querySelectorAll('.n,.d')].map(e => getComputedStyle(e).letterSpacing).filter(v => v !== 'normal' && v !== '0px');
        out.push({ t: b.dataset.t, bad, ls, icon: Math.round(ic.width), inPanel: R.right <= document.getElementById('buildPick').getBoundingClientRect().right + 0.5 && R.left >= 0 }); }
      return { n: btns.length, out, rcl: myRoomCtx().lvl }; }, lvl);
    ok(m.rcl === lvl && m.n > 0, `${tag} RCL${lvl}: ${m.n} 张卡片`);
    const over = m.out.filter(o => o.bad.length || !o.inPanel); ok(!over.length, `${tag} RCL${lvl}: 文字不溢出卡片 ${JSON.stringify(over)}`);
    ok(m.out.every(o => !o.ls.length), `${tag} RCL${lvl}: 无字距`);
    ok(m.out.every(o => o.icon >= 28 && o.icon <= 32), `${tag} RCL${lvl}: 图标 28-32px`);
    if (lvl === 8 || lvl === 1) await pg.screenshot({ path: `${OUT}/build-${tag}-rcl${lvl}.png` });
  }
  const fs = await pg.evaluate(() => getComputedStyle(document.querySelector('#bpList .n')).fontSize); ok(fs === '13px', `${tag}: 字号固定 13px (${fs})`);
  await pg.close();
}
(async () => { await new Promise(r => srv.listen(0, r)); PORT = srv.address().port; const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  await run(b, 412, 915, 'portrait'); await run(b, 360, 780, 'narrow360'); await run(b, 915, 412, 'landscape'); await run(b, 780, 360, 'landscape360');
  await b.close(); console.log(fails ? `${fails} FAIL` : 'all ok'); process.exit(fails ? 1 : 0); })();
