// 无头测试（连 test/fake-server.js 回放的私服）：安卓返回键（back-stack.js）——逐层关闭、逐级回页、首页两次返回才退出
const http = require('http'), fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const W = ms => new Promise(r => setTimeout(r, ms)), ROOT = path.join(__dirname, '../www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
  await pg.evaluateOnNewDocument(() => {
    localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o);
    window.__exit = 0; window.__listeners = [];
    window.Capacitor = { Plugins: { App: { addListener: (ev, fn) => { if (ev === 'backButton') window.__listeners.push(fn); return Promise.resolve({ remove() {} }); }, exitApp: () => { window.__exit++; } } } };
  });
  await pg.evaluateOnNewDocument(FS.install, FX); // 离线回放的私服（App 只做瘦客户端，进游戏需要已连接）
  await pg.goto(`http://localhost:${port}/index.html`); await W(1200);
  for (let i = 0; i < 50 && !(await pg.evaluate(() => !!sess)); i++) await W(200);
  const E = f => pg.evaluate(f);
  // 模拟一次硬件返回：调用注册到 Capacitor App 的 backButton 监听
  const back = () => E(() => { window.__listeners.forEach(f => f({ canGoBack: false })); }).then(() => W(120));
  const state = () => E(() => { const v = id => !!document.getElementById(id) && !document.getElementById(id).classList.contains('hidden');
    return { page: Shell.page(), editor: v('editor'), fly: !!(fly && fly.isVisible()), panel: v('panel'), inspect: v('inspect'), prev: v('prevP'), body: !!document.getElementById('bodyForm'), dlg: document.querySelectorAll('.shDlg').length, upd: !!(Upd.el && !Upd.el.classList.contains('hidden')), dd: Blockly.DropDownDiv.isVisible(), exit: window.__exit }; });
  ok(await E(() => window.__listeners.length === 1), '注册了唯一一个 Capacitor backButton 监听');
  ok((await state()).page === 'home', '启动在首页');
  // 首页：第一次返回只提示，不退出；2 秒内第二次退出
  await back(); let s = await state(); ok(s.exit === 0 && s.page === 'home', '首页第一次返回不退出');
  ok(await E(() => document.getElementById('toast')?.textContent === '再按一次退出' && document.getElementById('toast').classList.contains('on')), '显示「再按一次退出」提示');
  await back(); ok((await state()).exit === 1, '2 秒内再按一次 → exitApp');
  // 超过 2 秒再按：重新提示，不退出
  await back(); await W(2200); await back(); ok((await state()).exit === 1, '两次间隔超过 2 秒不退出');
  // 设置子页 → 设置 → 首页
  await E(() => { Shell.show('home'); Shell.show('settings'); }); await E(() => Shell.show('badge')); await back(); ok((await state()).page === 'settings', '设置子页面 → 设置');
  await back(); ok((await state()).page === 'home', '设置 → 首页');
  await E(() => Shell.show('about')); await back(); ok((await state()).page === 'home', '关于 → 首页');
  // 弹窗在页面之上：先关弹窗
  await E(() => Shell.show('about')); await E(() => document.querySelector('[data-act="go:x"]')); await E(() => { const d = document.createElement('div'); d.className = 'shDlg'; document.body.appendChild(d); });
  await back(); s = await state(); ok(s.dlg === 0 && s.page === 'about', '输入弹窗先关闭，页面不变'); await back();
  // 进游戏
  await E(() => $('sPlay').click()); await W(500); await E(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); });
  s = await state(); ok(s.page === null, '进入游戏');
  // 右侧面板 → 关闭；游戏 → 首页
  await E(() => $('btnLog').click()); await W(100); ok((await state()).panel, '打开右侧面板'); await back(); s = await state(); ok(!s.panel && s.page === null, '返回关闭右侧面板，仍在游戏');
  await back(); s = await state(); ok(s.page === 'home' && s.exit === 1, '游戏 → 首页（不退出）');
  await E(() => $('sPlay').click()); await W(300); await E(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); $('wmap').classList.add('hidden'); });
  // 编辑器：身体部件表单 > 预览 > 下拉 > 全屏积木列表 > 编辑器
  await E(() => $('btnCode').click()); await W(300);
  await E(() => selectCat(CATS[1].id)); await W(300); ok((await state()).fly, '打开全屏积木列表');
  await E(() => $('edPreview').click()); await W(200); ok((await state()).prev, '打开预览');
  await E(() => openBodyForm('WORK,CARRY,MOVE', () => {})); ok((await state()).body, '打开身体部件表单');
  await back(); s = await state(); ok(!s.body && s.prev && s.fly && s.editor, '返回 1：关身体部件表单');
  await back(); s = await state(); ok(!s.prev && s.fly && s.editor, '返回 2：关预览');
  await E(() => { const blk = ws.getTopBlocks(false).flatMap(b => b.getDescendants(false)).find(b => b.inputList.some(i => i.fieldRow.some(f => f instanceof Blockly.FieldDropdown)));
    const f = blk.inputList.flatMap(i => i.fieldRow).find(f => f instanceof Blockly.FieldDropdown); f.showEditor(); }); await W(200);
  ok((await state()).dd, '打开下拉菜单'); await back(); s = await state(); ok(!s.dd && s.fly, '返回 3：关下拉菜单');
  await back(); s = await state(); ok(!s.fly && s.editor, '返回 4：收起全屏积木列表');
  await back(); s = await state(); ok(!s.editor && s.page === null, '返回 5：编辑器 → 游戏');
  // 更新弹窗在最上层
  { await E(() => { const d = document.createElement('div'); d.className = 'shDlg'; d.innerHTML = '<div class="box">x</div>'; document.body.appendChild(d); Upd.show({ tag_name: 'v9.9.9', body: 'x' }, { size: 1 }, '1.0.0'); window.__later = 0; Upd.el.querySelector('.uuLater').addEventListener('click', () => window.__later++); });
    const r = await E(() => { const b = Upd.el.querySelector('.uuLater').getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; return { x, y, top: Upd.el.contains(document.elementFromPoint(x, y)), last: document.body.lastElementChild === Upd.el || document.body.lastElementChild.id === 'toast', z: getComputedStyle(Upd.el).zIndex }; });
    ok(r.top, '有其他弹窗时更新弹窗在最上层（按钮可点到） z=' + r.z); await pg.touchscreen.tap(r.x, r.y); await W(150);
    ok(await E(() => window.__later === 1 && Upd.el.classList.contains('hidden')), '点「稍后」真的点到了更新弹窗'); await E(() => document.querySelectorAll('.shDlg').forEach(d => d.remove())); }
  await E(() => Upd.show({ tag_name: 'v9.9.9', body: '## 测试' }, { size: 1 }, '1.0.0')); await E(() => $('btnLog').click());
  await back(); s = await state(); ok(!s.upd && s.panel, '更新弹窗最先关闭'); await back(); ok(!(await state()).panel, '再关右侧面板');
  { const h = await E(() => [history.length, JSON.stringify(history.state)]); ok(h[1] === 'null', '没有往浏览器 history 里塞记录 ' + h); }
  await b.close(); srv.close();
  if (fails) { console.log(fails + ' FAIL'); process.exit(1); } console.log('ok - 返回键逐层关闭 / 逐级回页 / 两次退出');
})().catch(e => { console.error(e); process.exit(1); });
