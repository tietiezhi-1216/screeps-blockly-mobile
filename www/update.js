// 应用内更新：检查 GitHub Releases → 原生插件下载（带进度）→ 校验 → 系统安装器
const REPO = 'tietiezhi-1216/screeps-blockly-mobile';
function cmpVer(a, b) { const p = s => String(s).replace(/^v/, '').split('.').map(n => parseInt(n) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }
function nativePlugin(name) { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.registerPlugin ? (nativePlugin[name] = nativePlugin[name] || C.registerPlugin(name)) : null; }
function openUrl(u) { const B = nativePlugin('Browser'); if (B) B.open({ url: u }); else window.open(u, '_system'); }
const fmtMB = n => (n / 1048576).toFixed(1) + ' MB';

const Upd = {
  el: null, rel: null, apk: null, path: null, busy: false, waitingPerm: false,
  ui() {
    if (this.el) return this.el;
    const d = document.createElement('div'); d.id = 'upd'; d.className = 'panel hidden'; d.style.zIndex = 60;
    d.innerHTML = `<h3 id="updTitle" style="margin:0;text-align:center"></h3><div id="updNotes" style="font-size:13px;white-space:pre-wrap;max-height:30vh;overflow:auto;color:#ccc"></div>
      <div id="updBarWrap" class="hidden" style="background:#111;border-radius:8px;height:18px;overflow:hidden"><div id="updBar" style="height:100%;width:0;background:linear-gradient(90deg,#2e8b57,#7bd88f);transition:width .15s"></div></div>
      <div id="updMsg" style="text-align:center;font-size:13px;color:#9f9;min-height:1em"></div>
      <button id="updGo">立即更新</button><button id="updLink" class="hidden" style="background:#555">用浏览器下载</button><button id="updLater" style="background:#444">稍后</button>`;
    document.body.appendChild(d); this.el = d;
    d.querySelector('#updGo').onclick = () => this.start();
    d.querySelector('#updLater').onclick = () => { if (this.busy) { const P = nativePlugin('AppUpdater'); P && P.cancel(); } d.classList.add('hidden'); };
    d.querySelector('#updLink').onclick = () => openUrl(this.apk.browser_download_url);
    const P = nativePlugin('AppUpdater');
    if (P) {
      P.addListener('progress', e => this.progress(e.received, e.total));
      P.addListener('resume', () => { if (this.waitingPerm) this.tryInstall(); });
    }
    return d;
  },
  $(id) { return this.el.querySelector('#' + id); },
  show(rel, apk, cur) {
    this.rel = rel; this.apk = apk; this.path = null; this.ui();
    this.$('updTitle').textContent = `发现新版本 ${rel.tag_name}（当前 ${cur}）`;
    this.$('updNotes').textContent = (rel.body || '').slice(0, 800);
    this.$('updMsg').textContent = `安装包 ${fmtMB(apk.size)}`; this.$('updBarWrap').classList.add('hidden');
    this.$('updGo').textContent = '立即更新'; this.$('updGo').disabled = false;
    this.$('updLink').classList.toggle('hidden', !!nativePlugin('AppUpdater'));
    this.el.classList.remove('hidden');
  },
  progress(got, total) { const p = total > 0 ? Math.min(100, got / total * 100) : 0; this.$('updBar').style.width = p.toFixed(1) + '%'; this.$('updMsg').textContent = `下载中 ${fmtMB(got)} / ${total > 0 ? fmtMB(total) : '?'}（${p.toFixed(0)}%）`; },
  fail(msg) { this.busy = false; this.$('updMsg').textContent = '' + msg; this.$('updGo').textContent = '重试'; this.$('updGo').disabled = false; this.$('updLink').classList.remove('hidden'); },
  async start() {
    const P = nativePlugin('AppUpdater'); if (!P) return openUrl(this.apk.browser_download_url);
    if (this.path) return this.tryInstall();
    this.busy = true; this.$('updGo').disabled = true; this.$('updLink').classList.add('hidden'); this.$('updBarWrap').classList.remove('hidden'); this.progress(0, this.apk.size);
    const sha = (this.apk.digest || '').startsWith('sha256:') ? this.apk.digest.slice(7) : (((this.rel && this.rel.body) || '').match(/SHA-?256[^0-9a-fA-F]*([0-9a-fA-F]{64})/i) || [])[1]?.toLowerCase() || ''; // GitHub 资产摘要，或发布说明里的 SHA-256
    try { const r = await P.download({ url: this.apk.browser_download_url, size: this.apk.size, sha256: sha }); this.path = r.path; this.busy = false; this.$('updMsg').textContent = `下载完成，已校验${sha ? ' SHA-256' : '大小'}`; this.tryInstall(); }
    catch (e) { this.fail(e.message || String(e)); }
  },
  async tryInstall() {
    const P = nativePlugin('AppUpdater'); this.$('updGo').disabled = false; this.$('updGo').textContent = '安装';
    try {
      const { allowed } = await P.canInstall();
      if (!allowed) { this.waitingPerm = true; this.$('updMsg').textContent = '请在设置里允许“安装未知应用”，返回后会自动继续安装'; await P.openInstallSettings(); return; }
      this.waitingPerm = false; await P.install({ path: this.path }); this.$('updMsg').textContent = '已打开系统安装器，按提示点“更新”即可';
    } catch (e) { this.fail(e.message || String(e)); }
  },
};
async function checkUpdate(manual) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json(), cur = window.APP_VERSION || '0.0.0', apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
    if (apk && cmpVer(rel.tag_name, cur) > 0) Upd.show(rel, apk, cur);
    else if (manual) alert(`已是最新版本（${cur}）`);
  } catch (e) { if (manual) alert('检查更新失败：' + e.message); }
}
