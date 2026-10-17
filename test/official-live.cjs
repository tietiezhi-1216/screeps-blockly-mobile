// 连真实官方服务器（screeps.com）的端到端检查：世界地图 / 选择出生房间 / 房间画面，手机尺寸截图到 /workspace/shots-official/。
// 只读：页面里拦下除 map-stats 以外的所有写请求（POST），绝不放 Spawn、不改代码/内存/旗帜。
// 可选：CODE_TEST=1 时把 App 生成的积木代码上传到一个新分支 blockly-test（不存在才建；不动生效分支和已有分支）。
// 浏览器里关掉同源检查（App 里官方请求走原生 HTTP，不受 CORS 限制）。
// Token 只从环境变量读，不打印、不截图：( . ~/.secrets/screeps-official.env; export SCREEPS_TOKEN; SHARDS=shard3 node test/official-live.cjs )
const p = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const TOKEN = process.env.SCREEPS_TOKEN, SHARDS = (process.env.SHARDS || 'shard3').split(','), OUT = process.env.OUT || '/workspace/shots-official';
if (!TOKEN) { console.error('需要 SCREEPS_TOKEN'); process.exit(1); }
const ROOT = path.join(__dirname, '../www'), W = ms => new Promise(r => setTimeout(r, ms)), hide = s => String(s).split(TOKEN).join('***');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log(hide((c ? 'ok - ' : 'FAIL - ') + m)); if (!c) fails++; };
async function cells(pg) { const shot = await pg.screenshot({ encoding: 'base64' });
  return pg.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = img.width / innerWidth, G = wm.geo, cr = $('wmCanvas').getBoundingClientRect(), out = [];
    for (const n of visibleRooms(G, cr.width, cr.height, 0)) { const [X, Y] = parseRealName(n); if (!wm.data.inBounds(X, Y)) continue; const x = cr.left + G.ox + X * G.cs, y = cr.top + G.oy + Y * G.cs; if (x < cr.left || y < cr.top || x + G.cs > cr.right || y + G.cs > cr.bottom) continue;
      const d = g.getImageData(Math.round((x + 2) * k), Math.round((y + 2) * k), Math.max(1, Math.round((G.cs - 4) * k)), Math.max(1, Math.round((G.cs - 4) * k))).data, cols = new Set(); let yel = 0;
      for (let i = 0; i < d.length; i += 4) { cols.add(d[i] >> 3 << 10 | d[i + 1] >> 3 << 5 | d[i + 2] >> 3); if (d[i] > 100 && d[i + 1] > 85 && d[i + 2] < d[i] * 0.6 && Math.abs(d[i] - d[i + 1]) < 50) yel++; }
      out.push({ n, cols: cols.size, yel, st: wm.data.status(n, myPid), out: wm.data.stat(n) === null }); } return out; }, shot); }
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const PORT = srv.address().port;
  const prof = fs.mkdtempSync('/tmp/sbm-live-'), b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-web-security', '--user-data-dir=' + prof] }); let gen = null;
  for (const shard of SHARDS) {
    const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.evaluateOnNewDocument((tok, shard) => { localStorage.setItem('sbm_intro', '1'); localStorage.setItem('sbm_server', JSON.stringify({ kind: 'official', token: tok, shard }));
      window.__blocked = []; window.__calls = []; const F = window.fetch.bind(window);
      window.fetch = (u, o = {}) => { const s = String(u), m = (o.method || 'GET').toUpperCase(); if (s.includes('api.github.com')) return Promise.reject(new Error('x'));
        if (/screeps\.com\/api\//.test(s)) { const path = new URL(s).pathname; window.__calls.push(m + ' ' + path); if (m !== 'GET' && path !== '/api/game/map-stats') { window.__blocked.push(m + ' ' + path); return Promise.resolve(new Response('{"error":"blocked by test"}', { status: 403 })); } }
        return F(u, o); }; }, TOKEN, shard);
    pg.on('console', m => /error|错误|fail/i.test(m.text()) && console.log('# console', hide(m.text()).slice(0, 300))); pg.on('pageerror', e => console.log('# pageerror', hide(e.message)));
    await pg.goto(`http://localhost:${PORT}/index.html`); for (let i = 0; i < 100 && !(await pg.evaluate(() => !!(sess && sess.me && sess.S))); i++) await W(200);
    if (!(await pg.evaluate(() => !!(sess && sess.me)))) { ok(false, `${shard}：连不上 ` + JSON.stringify(await pg.evaluate(() => ({ calls: window.__calls, err: (document.querySelector('.lerr') || {}).textContent, page: window.Shell && Shell.page(), txt: document.body.innerText.slice(0, 300) })))); await pg.close(); continue; }
    const info = await pg.evaluate(() => ({ home: sess.home, S: sess.S, W: sess.worldW, needsSpawn: sess.needsSpawn }));
    ok(info.S === 11 && info.W > 0, `${shard}：已连接，世界 ${info.W}×${info.W}，出生参考房间 ${info.home}，需要出生=${info.needsSpawn}`);
    await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); if (window.Shell && Shell.hide) Shell.hide(); openWorldMap(true); }); await W(7000);
    let c = await cells(pg), inW = c.filter(x => !x.out), tex = inW.filter(x => x.cols >= 2);
    ok(inW.length > 50 && tex.length >= inW.length * 0.95, `${shard} 选择出生房间：视野内 ${inW.length} 间房，${tex.length} 间画出地形；可出生 ${c.filter(x => x.st === 'free').length}、占领 ${c.filter(x => x.st === 'owned').length}、预定 ${c.filter(x => x.st === 'reserved').length}`);
    await pg.screenshot({ path: path.join(OUT, `${shard}-pick.png`) });
    await pg.evaluate(() => { wm.cs = wm.fit * 2.6; drawWorldMap(); }); await W(6000); await pg.evaluate(() => drawWorldMap()); await W(400);
    c = await cells(pg); const withS = c.filter(x => x.yel > 0).length; ok(withS >= c.filter(x => x.st !== 'highway' && !x.out).length * 0.6, `${shard} 放大：${withS}/${c.length} 间房画出能量源（roomMap2，订阅 ${await pg.evaluate(() => wm.data.subs.size)} 个）`);
    await pg.screenshot({ path: path.join(OUT, `${shard}-pick-zoom.png`) });
    // 选中一间可出生的房间（只看，不放 Spawn）
    const sel = await pg.evaluate(() => { const n = visibleRooms(wm.geo, innerWidth, innerHeight, 0).find(q => wm.data.status(q, myPid) === 'free'); if (!n) return null; wm.sel = n; wmShowSel(); drawWorldMap(); return { n, st: $('wmSelSt').textContent, info: $('wmSelInfo').textContent }; });
    ok(sel && /可出生/.test(sel.st), `${shard} 选中 ${sel && sel.n}：${sel && sel.st} · ${sel && sel.info}`); await W(300);
    await pg.screenshot({ path: path.join(OUT, `${shard}-pick-select.png`) });
    // 房间画面：挑窗口里一间被占领的房间，用游戏内世界地图「前往」（只订阅 room: 频道）
    await pg.evaluate(() => { $('wmClose').style.display = ''; wmClose(); openWorldMap(false); }); await W(2500);
    const tgt = await pg.evaluate(() => { const L = Object.keys(sess.mapInfo).filter(k => sess.mapInfo[k] && sess.mapInfo[k].own && sess.mapInfo[k].own.level >= 4).map(k => sess.nameOf(k)); return L[0] || null; });
    await pg.screenshot({ path: path.join(OUT, `${shard}-worldmap.png`) });
    if (tgt) { await pg.evaluate(n => { wm.sel = n; wmShowSel(); $('wmGo').click(); }, tgt); await W(9000);
      const v = await pg.evaluate(() => { const v = view(); return v ? { st: v.structures.length, cr: v.creeps.length, src: v.sources.length, ctl: v.controllers.length } : null; });
      ok(v && v.st > 0 && v.src > 0 && v.ctl > 0, `${shard} 房间画面 ${tgt}：建筑 ${v && v.st}、creep ${v && v.cr}、能量源 ${v && v.src}`);
      await pg.screenshot({ path: path.join(OUT, `${shard}-room.png`) }); }
    if (!gen) gen = await pg.evaluate(() => Blockly.JavaScript.workspaceToCode(ws));
    const calls = await pg.evaluate(() => window.__calls), blocked = await pg.evaluate(() => window.__blocked);
    const cnt = k => calls.filter(x => x === k).length;
    ok(!blocked.length, `${shard}：没有任何写请求（被拦 ${blocked.length}）`);
    console.log(`# ${shard} HTTP ${calls.length} 次：map-stats ${cnt('POST /api/game/map-stats')}、room-terrain ${cnt('GET /api/game/room-terrain')}`);
    await pg.close(); await W(3000);
  }
  await b.close(); srv.close(); fs.rmSync(prof, { recursive: true, force: true }); // 浏览器资料里有 Token，用完就删
  if (process.env.CODE_TEST && gen) { // 积木代码上传到新分支 blockly-test（不动生效分支、已有分支）
    const { ScreepsApi } = require('../www/screeps-api.js'), api = new ScreepsApi({ kind: 'official', token: TOKEN, shard: SHARDS[0] }, { fetch });
    const b0 = await api.branches(), names = (b0.list || []).map(x => x.branch), act = JSON.stringify((b0.list || []).filter(x => x.branch !== 'blockly-test').map(x => [x.branch, !!x.activeWorld, !!x.activeSim]));
    if (names.includes('blockly-test') && !process.env.CODE_TEST_REUSE) ok(false, '已经有 blockly-test 分支，跳过（不改已有分支）');
    else { const main = '// screeps-blockly 上传测试（App 生成的代码）\n' + gen; if (!names.includes('blockly-test')) { const src = ((b0.list || []).find(x => x.activeWorld) || b0.list[0]).branch; await api.cloneBranch(src, 'blockly-test'); console.log('# 新建分支 blockly-test（从 ' + src + ' 复制，原分支不变）'); }
      await api.codeSet('blockly-test', { main });
      const back = await api.codeGet('blockly-test'), b1 = await api.branches(), act1 = JSON.stringify((b1.list || []).filter(x => x.branch !== 'blockly-test').map(x => [x.branch, !!x.activeWorld, !!x.activeSim]));
      ok(back.modules && back.modules.main === main, `积木代码上传到新分支 blockly-test 并读回一致（${main.length} 字节）`);
      ok(act1 === act, '生效分支和已有分支都没变'); }
  }
  if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 官方服务器端到端'); process.exit(0);
})().catch(e => { console.error(hide(e && e.stack || e)); process.exit(1); });
