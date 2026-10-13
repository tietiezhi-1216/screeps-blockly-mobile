// 系列通用的安卓返回键处理（Screeps World / Screeps Arena 共用，无依赖，不碰浏览器 history）
// 规则：返回 = 关掉最上面一层；没有可关的层时回到上一页；已在根页面时第一次按提示「再按一次退出」，2 秒内再按才退出。
//
// 用法：
//   BackStack.init({ exit, isRoot, toBack, toast, interval })   // 一次；自动挂 Capacitor App 的 backButton
//   const off = BackStack.push(() => closeMyPopup());          // 动态层：打开弹窗时压栈，关闭时调用 off()（关掉后会自动出栈）
//   BackStack.layer('名字', 优先级, () => 是否打开, () => 关掉); // 静态层：按优先级从高到低检查，第一个打开的被关掉
//   BackStack.handle()                                          // 手动触发一次返回（测试 / 键盘 Esc 用）
// 处理函数返回 false 表示「这次不算处理」，继续往下找。
(function (G) {
  const dyn = [], layers = [];
  let opt = { interval: 2000, text: '再按一次退出' }, lastRoot = 0;
  const now = () => (G.BackStack && G.BackStack._now ? G.BackStack._now() : Date.now());
  function toast(m) {
    if (opt.toast) return opt.toast(m);
    let t = document.getElementById('bsToast');
    if (!t) { t = document.createElement('div'); t.id = 'bsToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:calc(32px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483647;background:#2b2b2b;color:#e6e6e6;border:1px solid #3a3a3a;border-radius:6px;padding:8px 16px;font-size:14px;pointer-events:none;transition:opacity .15s;opacity:0';
      document.body.appendChild(t); }
    t.textContent = m; t.style.opacity = '1'; clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.opacity = '0'; }, opt.interval);
  }
  function push(close, name) { const e = { close, name }; dyn.push(e); return () => { const i = dyn.indexOf(e); if (i >= 0) dyn.splice(i, 1); }; }
  function layer(name, prio, isOpen, close) { const i = layers.findIndex(l => l.name === name); if (i >= 0) layers.splice(i, 1); layers.push({ name, prio, isOpen, close }); layers.sort((a, b) => b.prio - a.prio); }
  function handle() {
    while (dyn.length) { const e = dyn.pop(); try { if (e.close() !== false) return e.name || 'dyn'; } catch (err) { console.error(err); } }
    for (const l of layers) { let o = false; try { o = l.isOpen(); } catch (e) {} if (o) { try { if (l.close() !== false) return l.name; } catch (e) { console.error(e); return l.name; } } }
    let root = true; try { root = opt.isRoot ? opt.isRoot() : true; } catch (e) {}
    if (!root && opt.toBack) { lastRoot = 0; if (opt.toBack() !== false) return 'page'; }
    const t = now();
    if (lastRoot && t - lastRoot <= opt.interval) { lastRoot = 0; exit(); return 'exit'; }
    lastRoot = t; toast(opt.text); return 'confirm';
  }
  function exit() {
    if (opt.exit) return opt.exit();
    const A = G.Capacitor && G.Capacitor.Plugins && G.Capacitor.Plugins.App; if (A && A.exitApp) A.exitApp();
  }
  function init(o = {}) {
    opt = Object.assign(opt, o);
    if (init.done) return; init.done = true;
    try { const A = G.Capacitor && G.Capacitor.Plugins && G.Capacitor.Plugins.App; if (A && A.addListener) A.addListener('backButton', () => handle()); } catch (e) {}
    if (o.escKey !== false) document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) handle(); });
  }
  G.BackStack = { init, push, layer, handle, toast, _dyn: dyn, _layers: layers, _now: null };
})(typeof window !== 'undefined' ? window : globalThis);
