// 无头：配色固定为 Screeps 官方配色。设置里没有换色选项；v2.0.2 留下的换色记录会被清掉；所有标题栏（含上方挖孔/状态栏那一行）
// 是同一块官方蓝 #5973FF、白字，挖孔行与标题栏之间无缝无线；主按钮/选中态是官方蓝。412x915 竖屏 + 顶部 40px 挖孔（只画黑色摄像头）截图到 /workspace/shots-nocolor/
const p = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const ROOT = path.join(__dirname, '../www'), OUT = process.env.OUT || '/workspace/shots-nocolor', W = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0, PORT; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
const BLUE = 'rgb(89, 115, 255)', WHITE = 'rgb(255, 255, 255)', OLD = ['rgb(46, 158, 106)', 'rgb(139, 92, 246)', 'rgb(232, 119, 46)'];
// 在页面里：取一组元素的计算样式
const ST = (sel, prop) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); return e ? getComputedStyle(e)[prop] : null; };
// 在页面里：安全区（顶部 40px）中线上取样，命中的元素所在标题栏底色
const INSET = (sel) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); if (!e) return null; const pe = e.style.pointerEvents; e.style.pointerEvents = 'auto';
  const hits = [4, innerWidth / 2, innerWidth - 4].map(x => { const h = document.elementFromPoint(x, 20); return !!h && (h === e || e.contains(h)); }); e.style.pointerEvents = pe; return { hits, bg: getComputedStyle(e).backgroundColor, top: e.getBoundingClientRect().top }; };
// 在页面里：所有可见元素里还用着某个颜色的（背景/文字/边框）——用来抓漏改的硬编码主题色
const LEFT = (rgb) => [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && !e.closest('svg,canvas,.thPick,#__cut,.blocklyFlyout,.blocklyWorkspace')).filter(e => { const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.borderTopColor, s.borderBottomColor].some(c => c === rgb) && s.visibility !== 'hidden'; }).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ':' + e.textContent.trim().slice(0, 8)).slice(0, 8);
// 在页面里：从屏幕顶边到标题栏底边逐行取样，每一行都落在同一个标题栏上（挖孔行与标题栏之间无缝），且栏没有边线
const SEAM = (sel) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); if (!e) return null; const pe = e.style.pointerEvents; e.style.pointerEvents = 'auto'; const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  const gaps = []; for (let y = 0; y < r.bottom - 1; y += 2) for (const x of [2, innerWidth / 2, innerWidth - 2]) { const h = document.elementFromPoint(x, y); if (!h || !(h === e || e.contains(h))) gaps.push([x, y]); }
  const b = [s.borderTopWidth, s.borderBottomWidth].map(parseFloat).some(v => v > 0) || /\d/.test(s.boxShadow); e.style.pointerEvents = pe;
  const t = e.querySelector('.shTitle,.chip,span'); return { gaps: gaps.slice(0, 4), border: b, bg: s.backgroundColor, fg: t ? getComputedStyle(t).color : s.color, h: Math.round(r.bottom) }; };
async function run(b) {
  const S = { ins: { t: 40 } };
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('sbm_theme', 'green'); } }); // 模拟 v2.0.2 里选过别的颜色
  await pg.evaluateOnNewDocument(FS.install, FX);
  await pg.evaluateOnNewDocument(ins => { const set = () => { const s = document.documentElement.style; for (const k of ['t', 'l', 'r', 'b']) s.setProperty('--nsa' + k, (ins[k] || 0) + 'px'); }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); }, S.ins);
  const boot = async () => { await pg.goto(`http://localhost:${PORT}/index.html`); await W(1200); for (let i = 0; i < 50 && !(await pg.evaluate(() => !!sess)); i++) await W(200); };
  await boot();
  const mark = () => pg.evaluate(ins => { let m = document.getElementById('__cut'); if (m) m.remove(); m = document.createElement('div'); m.id = '__cut'; m.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    if (ins.t) m.innerHTML = `<div style="position:absolute;top:${ins.t / 2 - 12}px;left:calc(50% - 12px);width:24px;height:24px;border-radius:50%;background:#000"></div>`;
    if (ins.l) m.innerHTML = `<div style="position:absolute;left:${ins.l / 2 - 12}px;top:calc(50% - 12px);width:24px;height:24px;border-radius:50%;background:#000"></div>`;
    document.body.appendChild(m); }, S.ins);
  const shot = async name => { await mark(); await pg.screenshot({ path: path.join(OUT, name + '.png') }); await pg.evaluate(() => document.getElementById('__cut')?.remove()); };
  const st = (sel, prop) => pg.evaluate(ST, sel, prop);
  const seam = async (what, sel) => { const r = await pg.evaluate(SEAM, sel); ok(r && !r.gaps.length && !r.border && r.bg === BLUE && r.fg === WHITE, `${what}：屏幕顶边到标题栏底边（${r && r.h}px）是同一块官方蓝、白字、无缝无线 ${r ? JSON.stringify({ bg: r.bg, fg: r.fg, gaps: r.gaps, border: r.border }) : '找不到'}`); };
  const shell = n => pg.evaluate(n => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); Shell.show(n); }, n).then(() => W(300));
  const game = () => pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); $('editor').classList.add('hidden'); if (!$('start').classList.contains('hidden')) Shell.hide(); }).then(() => W(400));
  const noOld = async what => { const l = []; for (const c of OLD) l.push(...await pg.evaluate(LEFT, c)); ok(!l.length, `${what} 没有非官方配色 ${JSON.stringify(l)}`); };
  // 1) 旧的换色记录被清掉，变量固定为官方配色
  ok(await pg.evaluate(() => localStorage.getItem('sbm_theme')) === null, 'v2.0.2 留下的换色记录已清除');
  ok(await pg.evaluate(() => ['--theme-primary', '--theme-bar', '--theme-on-bar'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim().toUpperCase()).join()) === '#5973FF,#5973FF,#FFFFFF', '配色变量 = 官方蓝 / 白字');
  ok(await pg.evaluate(() => typeof Theme.set === 'undefined' && !Theme.PRESETS), '没有换色接口');
  // 2) 设置里没有「主题」
  await shell('settings'); ok(await pg.evaluate(() => !document.querySelector('.thPick,[data-act=theme]') && !/主题/.test($('start').textContent)), '设置里没有主题/换色选项');
  await seam('设置', '#start .shHead'); await noOld('设置'); await shot('settings');
  await shell('login'); await seam('服务器与账号', '#start .shHead');
  ok(await st('#start .seg2 button.on', 'backgroundColor') === BLUE, '分段选中 = 官方蓝'); ok(await st('#start .primary', 'backgroundColor') === BLUE, '主按钮 = 官方蓝'); await noOld('服务器与账号'); await shot('login');
  await shell('profile'); await seam('个人中心', '#start .shHead');
  await pg.evaluate(() => { Shell.hide && Shell.hide(); openWorldMap(true); }); await W(1500); await seam('选择出生点', '#wmap .wmHead'); await pg.evaluate(() => $('wmap').classList.add('hidden'));
  await game(); await seam('游戏顶栏', '#hud'); await noOld('游戏页'); await shot('game');
  await pg.evaluate(() => $('btnLog').click()); await W(500);
  ok(await st('#panel .pnHead', 'backgroundColor') === BLUE, '控制台/房间面板标题栏 = 官方蓝'); ok(await st('#bar button.on', 'color') === BLUE, '底部工具栏选中图标 = 官方蓝');
  await pg.evaluate(() => $('panel').classList.add('hidden'));
  await pg.evaluate(() => $('btnCode').click()); await W(700); await seam('积木页', '#edHead'); ok(await st('#edClose', 'backgroundColor') === BLUE, '积木页「完成」= 官方蓝'); await shot('editor');
  await pg.evaluate(() => $('editor').classList.add('hidden'));
  // 3) 刷新后仍是官方配色；夜间模式照常
  await boot(); ok(await pg.evaluate(() => localStorage.getItem('sbm_theme') === null && getComputedStyle(document.querySelector('#hud')).backgroundColor) === BLUE, '刷新后仍是官方配色');
  await shell('settings'); const d0 = await pg.evaluate(() => edDark()); await pg.evaluate(() => document.querySelector('[data-act=edDark]').click()); await W(300);
  const d1 = await pg.evaluate(() => [edDark(), $('editor').classList.contains('dark'), getComputedStyle(document.querySelector('#start .shHead')).backgroundColor]); ok(d1[0] === !d0 && d1[1] === d1[0] && d1[2] === 'rgb(89, 115, 255)', '夜间模式照常切换，标题栏仍是官方蓝 ' + JSON.stringify(d1));
  await pg.evaluate(() => document.querySelector('[data-act=edDark]').click()); await W(200);
  await pg.close();
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); PORT = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try { await run(b); } catch (e) { console.error(e); fails++; }
  await b.close(); srv.close(); if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 官方配色：标题栏与挖孔行同一块官方蓝，无换色选项'); process.exit(0);
})();
