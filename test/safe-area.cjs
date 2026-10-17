// 无头：模拟挖孔/状态栏安全区（竖屏顶部 40px、横屏左侧 40px、横屏顶部 40px、以及 env() 全为 0 的兜底），
// 逐个打开所有全屏页面和浮层，断言标题栏 / 顶部控件没有一个压进安全区；同时在 /workspace/shots-safearea/ 截图
const p = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const ROOT = path.join(__dirname, '../www'), OUT = process.env.OUT || '/workspace/shots-safearea', W = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0, PORT; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
// 场景：ins 为模拟的原生注入值；min 为期望的兜底最小值（env()=0 时也要留的边距）
const SCEN = [
  { tag: 'portrait-top40', vw: 412, vh: 915, ins: { t: 40 }, min: { t: 24 }, shots: true },
  { tag: 'portrait-none', vw: 412, vh: 915, ins: {}, min: { t: 24 } },
  { tag: 'landscape-left40', vw: 915, vh: 412, ins: { l: 40 }, min: { l: 24, r: 24 }, shots: true },
  { tag: 'landscape-top40', vw: 915, vh: 412, ins: { t: 40 }, min: { l: 24, r: 24 } },
];
// 在页面里：收集一组「顶部控件」的矩形，返回所有压进安全区的
const CHECK = (sel, lim) => {
  const bad = [], seen = [];
  for (const root of document.querySelectorAll(sel)) {
    if (!root.getClientRects().length || getComputedStyle(root).visibility === 'hidden') continue;
    const els = [...root.querySelectorAll('button,b,h1,h2,span,a,select,input,.chip')].filter(e => e.getClientRects().length && e.offsetWidth && e.offsetHeight && (e.tagName === 'BUTTON' || e.textContent.trim() || e.classList.contains('chip')));
    for (const e of els) {
      const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue; // 滚出屏外的不算
      seen.push(e);
      const d = { sel, el: (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')) + ' "' + e.textContent.trim().slice(0, 12) + '"', top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
      if (r.top < lim.t - 0.5 || r.left < lim.l - 0.5 || r.right > innerWidth - lim.r + 0.5) bad.push(d);
    }
  }
  return { n: seen.length, bad };
};
// 标题栏底色是否通栏盖住了安全区：栏贴顶（全宽的栏还要贴左右），底色 = --theme-bar，安全区里取样点落在栏上
const COVER = (sel, lim, full) => {
  const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'); if (!e) return { err: '找不到 ' + sel };
  const r = e.getBoundingClientRect(), bg = getComputedStyle(e).backgroundColor, pr = document.createElement('i'); pr.style.cssText = 'position:fixed;color:var(--theme-bar)'; document.body.appendChild(pr); const want = getComputedStyle(pr).color; pr.remove();
  const pts = [[Math.max(1, lim.l / 2), Math.max(1, lim.t / 2)]]; if (full) pts.push([innerWidth / 2, Math.max(1, lim.t / 2)], [innerWidth - Math.max(1, lim.r / 2), Math.max(1, lim.t / 2)]);
  const pe = e.style.pointerEvents; e.style.pointerEvents = 'auto'; // 游戏顶栏本身不接收点击，取样时临时打开
  const miss = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !h || !(h === e || e.contains(h)); }); e.style.pointerEvents = pe;
  const bad = []; if (r.top > 0.5) bad.push('top=' + r.top); if (full && (r.left > 0.5 || r.right < innerWidth - 0.5)) bad.push('l/r=' + r.left + '/' + r.right); if (bg !== want) bad.push('bg ' + bg + '≠' + want); if (miss.length) bad.push('安全区取样点不在栏上 ' + JSON.stringify(miss));
  return { bad, h: Math.round(r.height), bg };
};
async function scen(b, S) {
  const pg = await b.newPage(); await pg.setViewport({ width: S.vw, height: S.vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.evaluateOnNewDocument(FS.install, FX);
  // 和 MainActivity 一样：把挖孔尺寸注入成 --nsat/--nsal/--nsar/--nsab
  await pg.evaluateOnNewDocument(ins => { const set = () => { const s = document.documentElement.style; for (const k of ['t', 'l', 'r', 'b']) s.setProperty('--nsa' + k, (ins[k] || 0) + 'px'); }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); }, S.ins);
  await pg.goto(`http://localhost:${PORT}/index.html`); await W(1200);
  for (let i = 0; i < 50 && !(await pg.evaluate(() => !!sess)); i++) await W(200);
  const lim = { t: Math.max(S.ins.t || 0, S.min.t || 0), l: Math.max(S.ins.l || 0, S.min.l || 0), r: Math.max(S.ins.r || 0, S.min.r || 0) };
  // 截图时只画出模拟的摄像头（黑点）
  const mark = () => pg.evaluate(ins => { let m = document.getElementById('__cut'); if (m) m.remove(); m = document.createElement('div'); m.id = '__cut'; m.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    if (ins.t) m.innerHTML = `<div style="position:absolute;top:${ins.t / 2 - 12}px;left:calc(50% - 12px);width:24px;height:24px;border-radius:50%;background:#000"></div>`;
    if (ins.l) m.innerHTML = `<div style="position:absolute;left:${ins.l / 2 - 12}px;top:calc(50% - 12px);width:24px;height:24px;border-radius:50%;background:#000"></div>`;
    document.body.appendChild(m); }, S.ins);
  const shot = async name => { if (!S.shots) return; await mark(); await pg.screenshot({ path: path.join(OUT, `${name}-${S.tag.split('-')[0]}.png`) }); await pg.evaluate(() => document.getElementById('__cut')?.remove()); };
  const cover = async (what, sel, full = true) => { const r = await pg.evaluate(COVER, sel, lim, full); ok(r && !r.err && !r.bad.length, `${S.tag} ${what} 标题栏底色盖住安全区（${r.bg || r.err}）${r.bad && r.bad.length ? ' ' + r.bad.join('; ') : ''}`); };
  const check = async (what, sel) => { const r = await pg.evaluate(CHECK, sel, lim); ok(r.n > 0 && !r.bad.length, `${S.tag} ${what}：${r.n} 个顶部控件都在安全区外 ${r.bad.length ? JSON.stringify(r.bad.slice(0, 4)) : ''}`); };
  // 1) 壳层页面
  for (const [pgName, label] of [['home', '首页'], ['login', '服务器与账号'], ['settings', '设置'], ['profile', '个人中心'], ['about', '关于'], ['snippets', '代码片段'], ['badge', '徽章']]) {
    await pg.evaluate(n => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); Shell.show(n); }, pgName); await W(250);
    await check(label, pgName === 'home' ? '#start .home' : '#start .shHead'); if (pgName !== 'home') await cover(label, '#start .shHead');
    if (pgName !== 'home') { const t = await pg.evaluate(() => document.querySelector('#start .shHead')?.textContent.trim()); ok(!!t, `${S.tag} ${label} 标题：${t}`); }
    if (['home', 'login', 'settings', 'profile'].includes(pgName)) await shot(pgName);
  }
  // 2) 世界地图 / 选择出生点
  await pg.evaluate(() => { Shell.hide && Shell.hide(); openWorldMap(true); }); await W(1500);
  await check('选择出生点', '#wmap .wmHead'); await cover('选择出生点', '#wmap .wmHead'); await shot('spawn-pick');
  await pg.evaluate(() => { $('wmap').classList.add('hidden'); }); await W(200);
  // 3) 游戏页 HUD + 控制台
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); if (!$('start').classList.contains('hidden')) Shell.hide(); }); await W(400);
  await check('游戏 HUD', '#hud'); await cover('游戏顶栏', '#hud', S.vw < S.vh); if (S.vw > S.vh) await check('房间导航', '#roomBar'); await shot('game');
  await pg.evaluate(() => $('btnLog').click()); await W(500);
  await check('控制台/房间面板', '#panel'); await shot('console');
  await pg.evaluate(() => $('panel').classList.add('hidden'));
  // 4) 积木页 + 历史 / 预览
  await pg.evaluate(() => $('btnCode').click()); await W(600);
  await check('积木页左上操作按钮', '#edTools'); await check('积木页标题栏', '#edHead'); await cover('积木页', '#edHead'); await shot('editor');
  await pg.evaluate(() => $('edHist').click()); await W(300); await check('历史版本', '#histP .hh'); await cover('历史版本', '#histP .hh'); await shot('history');
  await pg.evaluate(() => $('histP').classList.add('hidden')); await pg.evaluate(() => $('edPreview').click()); await W(300); await check('代码预览', '#prevP .hh'); await cover('代码预览', '#prevP .hh');
  await pg.close();
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); PORT = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try { for (const S of SCEN) await scen(b, S); } catch (e) { console.error(e); fails++; }
  await b.close(); srv.close(); if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 安全区：所有全屏页与浮层标题栏都避开挖孔'); process.exit(0);
})();
