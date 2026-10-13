// 系列通用的应用内更新弹窗组件（Screeps World / Screeps Arena 共用，规范见 screeps-design/UPDATE-UI.md）
// 用法：const ui = UpdateUI.create({ accent: '#5973FF', onUpdate, onLater });
//   ui.show({ tag, current, notes, size }) / ui.downloading(got, total) / ui.install(msg) / ui.error(msg) / ui.info(msg) / ui.hide()
// 不依赖任何框架；发布说明按 Markdown 安全渲染（先转义再加标记，链接只显示文字，不打开浏览器）
(function (G) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtMB = n => (n / 1048576).toFixed(1) + ' MB';
  function inline(s) {
    const codes = []; s = esc(s).replace(/`([^`]+)`/g, (m, c) => (codes.push(c), '\u0000' + (codes.length - 1) + '\u0000'));
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/&lt;(https?:[^&]+)&gt;/g, '$1')
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, a, b) => '<b>' + (a || b) + '</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + codes[i] + '</code>');
  }
  function md(src) {
    const out = []; let list = null, para = [], code = null;
    const flushP = () => { if (para.length) out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; };
    const flushL = () => { if (list) out.push(`<${list.t}>` + list.items.map(x => '<li>' + inline(x) + '</li>').join('') + `</${list.t}>`); list = null; };
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      if (code) { if (/^\s*```/.test(raw)) { out.push('<pre>' + esc(code.join('\n')) + '</pre>'); code = null; } else code.push(raw); continue; }
      if (/^\s*```/.test(raw)) { flushP(); flushL(); code = []; continue; }
      const line = raw.trimEnd(); let m;
      if (!line.trim()) { flushP(); flushL(); continue; }
      if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*$/))) { flushP(); flushL(); out.push(`<h${Math.min(6, m[1].length + 2)}>` + inline(m[2]) + `</h${Math.min(6, m[1].length + 2)}>`); continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushP(); flushL(); out.push('<hr>'); continue; }
      if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) { flushP(); const t = /\d/.test(m[1]) ? 'ol' : 'ul'; if (list && list.t !== t) flushL(); if (!list) list = { t, items: [] }; list.items.push(m[2]); continue; }
      if ((m = line.match(/^\s*>\s?(.*)$/))) { flushP(); flushL(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
      if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      flushL(); para.push(line.trim());
    }
    if (code) out.push('<pre>' + esc(code.join('\n')) + '</pre>'); flushP(); flushL(); return out.join('');
  }
  function create(o = {}) {
    const d = document.createElement('div'); d.className = 'uu hidden'; d.setAttribute('role', 'dialog');
    if (o.accent) d.style.setProperty('--uu-acc', o.accent);
    d.innerHTML = `<div class="uuBox"><div class="uuTitle"></div><div class="uuCur"></div><div class="uuNotes"></div>
      <div class="uuFoot"><div class="uuBar hidden"><i></i></div><div class="uuMsg"></div><div class="uuBtns"><button class="uuLater">稍后</button><button class="uuGo">立即更新</button></div></div></div>`;
    (o.parent || document.body).appendChild(d);
    const q = s => d.querySelector(s), go = q('.uuGo'), later = q('.uuLater'), bar = q('.uuBar'), msg = q('.uuMsg');
    let state = 'idle';
    go.onclick = () => { if (!go.disabled && o.onUpdate) o.onUpdate(state); };
    later.onclick = () => { o.onLater && o.onLater(state); ui.hide(); };
    const set = (s, label, dis) => { state = s; d.dataset.state = s; go.textContent = label; go.disabled = !!dis; };
    const ui = {
      el: d, md, get state() { return state; },
      show({ tag, current, notes, size }) { q('.uuTitle').textContent = `发现新版本 ${tag}`; q('.uuCur').textContent = `当前版本 ${current}` + (size ? ` · 安装包 ${fmtMB(size)}` : '');
        q('.uuNotes').innerHTML = md(notes); q('.uuNotes').scrollTop = 0; bar.classList.add('hidden'); msg.textContent = ''; later.textContent = '稍后'; set('ready', '立即更新'); d.classList.remove('hidden'); },
      downloading(got, total) { const p = total > 0 ? Math.min(100, got / total * 100) : 0; bar.classList.remove('hidden'); bar.firstChild.style.width = p.toFixed(1) + '%';
        msg.textContent = `${fmtMB(got)} / ${total > 0 ? fmtMB(total) : '?'}（${p.toFixed(0)}%）`; later.textContent = '取消'; set('downloading', '下载中…', true); },
      install(m) { bar.firstChild.style.width = '100%'; if (m != null) msg.textContent = m; later.textContent = '稍后'; set('install', '安装'); },
      error(m) { msg.textContent = m || '更新失败'; later.textContent = '稍后'; set('error', '重试'); },
      info(m) { msg.textContent = m; },
      hide() { d.classList.add('hidden'); },
    };
    return ui;
  }
  G.UpdateUI = { create, md };
})(window);
