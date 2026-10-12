// 应用内更新：检查 GitHub Releases 最新版本
const REPO = 'tietiezhi-1216/screeps-blockly-mobile';
function cmpVer(a, b) { const p = s => String(s).replace(/^v/, '').split('.').map(n => parseInt(n) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }
async function checkUpdate(manual) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json(), latest = rel.tag_name, cur = window.APP_VERSION || '0.0.0';
    const apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
    if (apk && cmpVer(latest, cur) > 0) {
      if (confirm(`发现新版本 ${latest}（当前 ${cur}）\n\n${(rel.body || '').slice(0, 300)}\n\n是否下载并安装？`)) openUrl(apk.browser_download_url);
    } else if (manual) alert(`已是最新版本（${cur}）`);
  } catch (e) { if (manual) alert('检查更新失败：' + e.message); }
}
function openUrl(u) { const B = window.Capacitor?.isNativePlatform?.() && window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('Browser') : null; if (B) B.open({ url: u }); else window.open(u, '_system'); }
