// 无头：主题系统。默认官方蓝 → 设置里点「青绿」→ 标题栏（含挖孔安全区）、主按钮、工具栏选中、标签、分段、积木页「完成」立刻换色；
// 刷新后仍是所选主题；代码编辑器夜间模式照常切换；换色后页面里不再残留官方蓝。412x915 竖屏 + 顶部 40px 挖孔截图到 /workspace/shots-theme/
const p = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const ROOT = path.join(__dirname, '../www'), OUT = process.env.OUT || '/workspace/shots-theme', W = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0, PORT; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
const BLUE = 'rgb(89, 115, 255)', GREEN = 'rgb(46, 158, 106)';
// 在页面里：取一组元素的计算样式
const ST = (sel, prop) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); return e ? getComputedStyle(e)[prop] : null; };
// 在页面里：安全区（顶部 40px）中线上取样，命中的元素所在标题栏底色
const INSET = (sel) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); if (!e) return null; const pe = e.style.pointerEvents; e.style.pointerEvents = 'auto';
  const hits = [4, innerWidth / 2, innerWidth - 4].map(x => { const h = document.elementFromPoint(x, 20); return !!h && (h === e || e.contains(h)); }); e.style.pointerEvents = pe; return { hits, bg: getComputedStyle(e).backgroundColor, top: e.getBoundingClientRect().top }; };
// 在页面里：所有可见元素里还用着某个颜色的（背景/文字/边框）——用来抓漏改的硬编码主题色
const LEFT = (rgb) => [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && !e.closest('svg,canvas,.thPick,#__cut,.blocklyFlyout,.blocklyWorkspace')).filter(e => { const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.borderTopColor, s.borderBottomColor].some(c => c === rgb) && s.visibility !== 'hidden'; }).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ':' + e.textContent.trim().slice(0, 8)).slice(0, 8);
async function run(b) {
  const S = { ins: { t: 40 } };
  const pg = await b.newPage(); await pg.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.evaluateOnNewDocument(FS.install, FX);
  await pg.evaluateOnNewDocument(ins => { const set = () => { const s = document.documentElement.style; for (const k of ['t', 'l', 'r', 'b']) s.setProperty('--nsa' + k, (ins[k] || 0) + 'px'); }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); }, S.ins);
  const boot = async () => { await pg.goto(`http://localhost:${PORT}/index.html`); await W(1200); for (let i = 0; i < 50 && !(await pg.evaluate(() => !!sess)); i++) await W(200); };
  await boot();
  const mark = () => pg.evaluate(ins => { let m = document.getElementById('__cut'); if (m) m.remove(); m = document.createElement('div'); m.id = '__cut'; m.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    if (ins.t) m.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:${ins.t}px;background:#ff303040"></div><div style="position:absolute;top:${ins.t / 2 - 12}px;left:calc(50% - 12px);width:24px;height:24px;border-radius:50%;background:#000"></div>`;
    if (ins.l) m.innerHTML = `<div style="position:absolute;top:0;bottom:0;left:0;width:${ins.l}px;background:#ff303040"></div><div style="position:absolute;left:${ins.l / 2 - 12}px;top:calc(50% - 12px);width:24px;height:24px;border-radius:50%;background:#000"></div>`;
    document.body.appendChild(m); }, S.ins);
  const shot = async name => { await mark(); await pg.screenshot({ path: path.join(OUT, name + '.png') }); await pg.evaluate(() => document.getElementById('__cut')?.remove()); };
  const st = (sel, prop) => pg.evaluate(ST, sel, prop);
  const inset = async (what, sel, want) => { const r = await pg.evaluate(INSET, sel); ok(r && r.top <= 0.5 && r.hits.every(Boolean) && r.bg === want, `${what} 标题栏通栏盖住顶部安全区，底色 ${r && r.bg}（应为 ${want}）${r ? ' ' + JSON.stringify(r.hits) : ''}`); };
  const shell = n => pg.evaluate(n => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); Shell.show(n); }, n).then(() => W(300));
  const game = () => pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); $('editor').classList.add('hidden'); if (!$('start').classList.contains('hidden')) Shell.hide(); }).then(() => W(400));
  // 一整套页面：检查颜色 + 截图
  async function tour(tag, want) {
    await shell('login'); await inset(`${tag} 服务器与账号`, '#start .shHead', want);
    ok(await st('#start .seg2 button.on', 'backgroundColor') === want, `${tag} 分段选中 = 主题色`);
    ok(await st('#start .primary', 'backgroundColor') === want, `${tag} 主按钮 = 主题色`); await shot(`${tag}-login`);
    await shell('settings'); await inset(`${tag} 设置`, '#start .shHead', want); await shot(`${tag}-settings`);
    await shell('profile'); await inset(`${tag} 个人中心`, '#start .shHead', want); await shot(`${tag}-profile`);
    await pg.evaluate(() => { Shell.hide && Shell.hide(); openWorldMap(true); }); await W(1500); await inset(`${tag} 选择出生点`, '#wmap .wmHead', want); await shot(`${tag}-spawn-pick`);
    await game(); await inset(`${tag} 游戏顶栏`, '#hud', want); await shot(`${tag}-game`);
    await pg.evaluate(() => $('btnLog').click()); await W(500);
    ok(await st('#panel .pnHead', 'backgroundColor') === want, `${tag} 控制台/房间面板标题栏 = 主题色`);
    ok(await st('#bar button.on', 'color') === want, `${tag} 底部工具栏选中图标 = 主题色`);
    await pg.evaluate(() => { const b = [...document.querySelectorAll('.pnTabs button')].find(x => /控制台/.test(x.textContent)); b && b.click(); }); await W(300); ok(await st('.cnFilter button.on', 'backgroundColor') === want, `${tag} 控制台筛选分段选中 = 主题色`); await shot(`${tag}-console`);
    await pg.evaluate(() => $('panel').classList.add('hidden'));
    await pg.evaluate(() => $('btnCode').click()); await W(700); await inset(`${tag} 积木页`, '#edHead', want);
    ok(await st('#edClose', 'backgroundColor') === want, `${tag} 积木页「完成」= 主题色`); await shot(`${tag}-editor`);
    await pg.evaluate(() => $('edPreview').click()); await W(300); await inset(`${tag} 代码预览`, '#prevP .hh', want);
    ok(await st('#prevP .seg button.on', 'backgroundColor') !== null, `${tag} 预览分段存在`); await pg.evaluate(() => $('prevP').classList.add('hidden'));
    await pg.evaluate(() => $('editor').classList.add('hidden'));
  }
  // 1) 默认官方蓝
  ok(await pg.evaluate(() => Theme.get()) === 'blue', '默认主题 = 官方蓝');
  await tour('blue', BLUE);
  // 2) 设置里点「青绿」：立即生效、保存在本机
  await shell('settings'); const n = await pg.evaluate(() => document.querySelectorAll('.thPick [data-act=theme]').length); ok(n >= 5, `设置里有 ${n} 个主题预设`);
  await pg.tap('.thPick [data-t=green]'); await W(300);
  ok(await pg.evaluate(() => localStorage.getItem('sbm_theme')) === 'green', '所选主题保存在本机');
  ok(await st('#start .shHead', 'backgroundColor') === GREEN, '点了立刻生效：设置页标题栏变青绿');
  ok(await pg.evaluate(() => document.querySelector('.thPick button.on')?.dataset.t) === 'green', '主题选择高亮当前项');
  ok(await pg.evaluate(() => document.querySelector('meta[name=theme-color]').content) === '#2E9E6A', '系统状态栏颜色（theme-color）跟着变');
  // 3) 刷新后仍是青绿，全套页面换色
  await boot(); ok(await pg.evaluate(() => Theme.get()) === 'green', '刷新后仍是所选主题');
  await tour('green', GREEN);
  // 4) 换色后不再残留官方蓝
  for (const p of ['login', 'settings', 'profile']) { await shell(p); const l = await pg.evaluate(LEFT, BLUE); ok(!l.length, `青绿主题下 ${p} 页没有残留官方蓝 ${JSON.stringify(l)}`); }
  await game(); await pg.evaluate(() => $('btnLog').click()); await W(400); { const l = await pg.evaluate(LEFT, BLUE); ok(!l.length, `青绿主题下游戏页/面板没有残留官方蓝 ${JSON.stringify(l)}`); } await pg.evaluate(() => $('panel').classList.add('hidden'));
  // 5) 夜间模式照常
  await shell('settings'); const d0 = await pg.evaluate(() => edDark()); await pg.evaluate(() => document.querySelector('[data-act=edDark]').click()); await W(300);
  const d1 = await pg.evaluate(() => [edDark(), $('editor').classList.contains('dark'), Theme.get()]); ok(d1[0] === !d0 && d1[1] === d1[0] && d1[2] === 'green', '夜间模式照常切换且不影响主题 ' + JSON.stringify(d1));
  await pg.evaluate(() => document.querySelector('[data-act=edDark]').click()); await W(200);
  await pg.close();
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); PORT = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try { await run(b); } catch (e) { console.error(e); fails++; }
  await b.close(); srv.close(); if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 主题：标题栏/按钮跟随主题，保存并即时生效'); process.exit(0);
})();
