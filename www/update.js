// 应用内更新：检查 GitHub Releases → 原生插件下载（带进度）→ 校验 → 系统安装器
const REPO = 'tietiezhi-1216/screeps-blockly-mobile';
function cmpVer(a, b) { const p = s => String(s).replace(/^v/, '').split('.').map(n => parseInt(n) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }
function nativePlugin(name) { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.registerPlugin ? (nativePlugin[name] = nativePlugin[name] || C.registerPlugin(name)) : null; }
function openUrl(u) { const B = nativePlugin('Browser'); if (B) B.open({ url: u }); else window.open(u, '_system'); }
const fmtMB = n => (n / 1048576).toFixed(1) + ' MB';

const Upd = {
  ui_: null, el: null, rel: null, apk: null, path: null, busy: false, waitingPerm: false,
  ui() {
    if (this.ui_) return this.ui_;
    this.ui_ = UpdateUI.create({ accent: '#5973FF', onUpdate: () => this.path ? this.tryInstall() : this.start(),
      onLater: () => { if (this.busy) { const P = nativePlugin('AppUpdater'); P && P.cancel(); this.busy = false; } } });
    this.el = this.ui_.el;
    const P = nativePlugin('AppUpdater');
    if (P) { P.addListener('progress', e => this.ui_.downloading(e.received, e.total)); P.addListener('resume', () => { if (this.waitingPerm) this.tryInstall(); }); }
    return this.ui_;
  },
  show(rel, apk, cur) { this.rel = rel; this.apk = apk; this.path = null; this.ui().show({ tag: rel.tag_name, current: cur, notes: rel.body || '', size: apk.size }); },
  fail(msg) { this.busy = false; this.ui_.error(String(msg)); },
  async start() {
    const P = nativePlugin('AppUpdater'); if (!P) { this.ui_.info('当前环境不支持应用内安装，请在安卓设备上更新'); return; }
    this.busy = true; this.ui_.downloading(0, this.apk.size);
    const sha = (this.apk.digest || '').startsWith('sha256:') ? this.apk.digest.slice(7) : (((this.rel && this.rel.body) || '').match(/SHA-?256[^0-9a-fA-F]*([0-9a-fA-F]{64})/i) || [])[1]?.toLowerCase() || ''; // GitHub 资产摘要，或发布说明里的 SHA-256
    try { const r = await P.download({ url: this.apk.browser_download_url, size: this.apk.size, sha256: sha }); if (!this.busy) return; this.path = r.path; this.busy = false; this.ui_.install(`下载完成，已校验${sha ? ' SHA-256' : '大小'}`); this.tryInstall(); }
    catch (e) { if (this.busy) this.fail(e.message || String(e)); }
  },
  async tryInstall() {
    const P = nativePlugin('AppUpdater'); this.ui_.install();
    try {
      const { allowed } = await P.canInstall();
      if (!allowed) { this.waitingPerm = true; this.ui_.info('请在设置里允许“安装未知应用”，返回后会自动继续安装'); await P.openInstallSettings(); return; }
      this.waitingPerm = false; await P.install({ path: this.path }); this.ui_.info('已打开系统安装器，按提示点“更新”即可');
    } catch (e) { this.fail(e.message || String(e)); }
  },
};
async function checkUpdate(manual) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json(), cur = window.APP_VERSION || '0.0.0', apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
    if (apk && cmpVer(rel.tag_name, cur) > 0) { window.UPDATE_REL = rel; updBadge(true);
      // 自动检查发现新版本：直接在游戏内弹窗（同一版本「稍后」后本次运行不再打扰，下次启动再提示）
      if (manual || (checkUpdate.shown !== rel.tag_name && !Upd.busy && (!Upd.el || Upd.el.classList.contains('hidden')))) { checkUpdate.shown = rel.tag_name; Upd.show(rel, apk, cur); } return 'new'; }
    else { window.UPDATE_REL = null; updBadge(false); if (manual === true) alert(`已是最新版本（${cur}）`); return 'latest'; }
  } catch (e) { if (manual === true) alert('检查更新失败：' + e.message); return 'fail'; }
}
// 有新版本时在菜单按钮 / 检查更新 / 设置入口上显示蓝点（不打断游戏）
function updBadge(on) {
  for (const id of ['btnMenu']) { const b = document.getElementById(id); if (!b) continue; let d = b.querySelector('.updDot');
    if (on && !d) { d = document.createElement('span'); d.className = 'updDot'; if (getComputedStyle(b).position === 'static') b.style.position = 'relative'; b.appendChild(d); } else if (!on && d) d.remove(); }
}
