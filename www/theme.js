// 配色固定为 Screeps 官方配色（DESIGN.md「配色变量」），不提供换色。
// 界面里的标题栏 / 主按钮 / 选中态只读这组 CSS 变量（Arena 对齐用同名变量）：
//   --theme-primary      主色 #5973FF（主按钮、选中的标签/分段、工具栏选中图标、进度条）
//   --theme-primary-dn   主色按下
//   --theme-primary-a    主色淡底（工具栏选中按钮底色、聚焦描边）
//   --theme-on-primary   主色上的文字/图标
//   --theme-bar          标题栏底色 = 主色；上方状态栏/摄像头挖孔那一条也是这个颜色（同一块底色，无缝无线）
//   --theme-on-bar       标题栏文字/图标
(function (root) {
  const OFFICIAL = { primary: '#5973FF', primaryDn: '#4B61D6', primaryA: 'rgba(89,115,255,.14)', onPrimary: '#ffffff', bar: '#5973FF', onBar: '#ffffff' };
  const VARS = { '--theme-primary': OFFICIAL.primary, '--theme-primary-dn': OFFICIAL.primaryDn, '--theme-primary-a': OFFICIAL.primaryA, '--theme-on-primary': OFFICIAL.onPrimary, '--theme-bar': OFFICIAL.bar, '--theme-on-bar': OFFICIAL.onBar };
  // 原生状态栏：覆盖在页面上，底色和标题栏同色、浅色图标——挖孔那一行与标题栏是同一种颜色
  function statusBar() {
    const C = root.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
    const SB = (C.Plugins && C.Plugins.StatusBar) || (C.registerPlugin && C.registerPlugin('StatusBar')); if (!SB) return;
    try { SB.setOverlaysWebView && SB.setOverlaysWebView({ overlay: true }); SB.setStyle && SB.setStyle({ style: 'DARK' }); SB.setBackgroundColor && SB.setBackgroundColor({ color: OFFICIAL.bar }); } catch (e) {}
  }
  function apply() {
    const s = document.documentElement.style; for (const k in VARS) s.setProperty(k, VARS[k]);
    try { root.localStorage && localStorage.removeItem('sbm_theme'); } catch (e) {} // v2.0.2 曾保存过换色选择，清掉
    statusBar();
  }
  const color = (k = '--theme-primary') => VARS[k] || OFFICIAL.primary;
  root.Theme = { OFFICIAL, VARS, color, apply };
  if (typeof document !== 'undefined') apply();
})(typeof window !== 'undefined' ? window : globalThis);
