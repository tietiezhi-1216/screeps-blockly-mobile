// 主题色：所有标题栏 / 主按钮 / 选中态都用 CSS 主题变量（DESIGN.md「主题变量」），这里只负责切换预设并保存在本机。
//   --theme-primary      主色（主按钮、选中的标签/分段/开关、工具栏选中图标、进度条）
//   --theme-primary-dn   主色按下
//   --theme-primary-a    主色淡底（工具栏选中按钮底色、聚焦描边）
//   --theme-on-primary   主色上的文字/图标
//   --theme-bar          标题栏（含上方状态栏/挖孔安全区）底色
//   --theme-on-bar       标题栏文字/图标
// Arena 那款只需换一套同名变量即可对齐。
(function (root) {
  const PRESETS = {
    blue: { name: '官方蓝', primary: '#5973FF' },
    green: { name: '青绿', primary: '#2E9E6A' },
    purple: { name: '紫色', primary: '#8B5CF6' },
    orange: { name: '橙色', primary: '#E8772E' },
    red: { name: '红色', primary: '#E5484D' },
  };
  const KEY = 'sbm_theme', DEF = 'blue';
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const shade = (h, f) => '#' + hex(h).map(c => Math.max(0, Math.min(255, Math.round(c * f)))).map(c => c.toString(16).padStart(2, '0')).join('');
  function vars(id) { const p = PRESETS[id] || PRESETS[DEF], [r, g, b] = hex(p.primary);
    return { '--theme-primary': p.primary, '--theme-primary-dn': shade(p.primary, .84), '--theme-primary-a': `rgba(${r},${g},${b},.14)`, '--theme-on-primary': '#ffffff', '--theme-bar': p.primary, '--theme-on-bar': '#ffffff' }; }
  function get() { let t = null; try { t = root.localStorage && localStorage.getItem(KEY); } catch (e) {} return PRESETS[t] ? t : DEF; }
  // 状态栏：覆盖在页面上（透明）+ 浅色图标，挖孔/状态栏那一条由标题栏的安全区内边距用主题色填满
  function statusBar(v) {
    const C = root.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
    const SB = (C.Plugins && C.Plugins.StatusBar) || (C.registerPlugin && C.registerPlugin('StatusBar')); if (!SB) return;
    try { SB.setOverlaysWebView && SB.setOverlaysWebView({ overlay: true }); SB.setStyle && SB.setStyle({ style: 'DARK' }); SB.setBackgroundColor && SB.setBackgroundColor({ color: v['--theme-bar'] }); } catch (e) {}
  }
  function apply(id) {
    const v = vars(id), s = document.documentElement.style; for (const k in v) s.setProperty(k, v[k]);
    document.documentElement.dataset.theme = id; const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', v['--theme-bar']);
    statusBar(v); try { root.dispatchEvent(new CustomEvent('themechange', { detail: { id, vars: v } })); } catch (e) {}
  }
  function set(id) { if (!PRESETS[id]) return; try { localStorage.setItem(KEY, id); } catch (e) {} apply(id); }
  const color = (k = '--theme-primary') => (getComputedStyle(document.documentElement).getPropertyValue(k) || '').trim() || PRESETS[DEF].primary;
  root.Theme = { PRESETS, get, set, apply, vars, color };
  if (typeof document !== 'undefined') apply(get());
})(typeof window !== 'undefined' ? window : globalThis);
