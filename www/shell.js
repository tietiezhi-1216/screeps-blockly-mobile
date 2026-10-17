// 应用外壳：首页 / 登录服务器 / 个人中心 / 代码片段 / 设置 / 关于（扁平 Screeps 网页风格）
(() => {
  const S = $('start'), LS = localStorage, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const J = (k, d) => { try { return JSON.parse(LS.getItem(k)) ?? d; } catch (e) { return d; } };
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(n);
  const dt = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const toast = m => { let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1800); };

  // ---- 徽章：官方 Screeps 徽章（type 1–24、param -100..100、flip、color1/2/3 取官方 80 色调色板）----
  const DEF_BADGE = { type: 1, color1: 21, color2: 0, color3: 40, param: 0, flip: false };
  const normBadge = b => (b && typeof b.type === 'number') ? b : Object.assign({}, DEF_BADGE);
  const badge = (b, size = 40) => ScreepsBadge.svg(normBadge(b), size);
  const prof = () => Object.assign({}, J('sbm_profile', {}), { badge: normBadge(J('sbm_profile', {}).badge) });

  // ---- 页面框架 ----
  const pages = {}; let stack = [];
  const head = (title, back = true) => `<header class="shHead">${back ? `<button class="shBack" data-act="back" data-icon="arrow-left"></button>` : ''}<span class="shTitle">${title}</span>${backToGame()}</header>`;
  function show(name, push = true) {
    if (push && stack[stack.length - 1] !== name) stack.push(name);
    S.classList.remove('hidden'); S.innerHTML = pages[name](); S.dataset.page = name; applyIcons(S); S.scrollTop = 0;
  }
  const back = () => { stack.pop(); if (stack.length) show(stack[stack.length - 1], false); else if (startGame.done) startGame(); else show('home'); };
  const backToGame = () => (startGame.done ? `<button class="shToGame" data-act="play" data-icon="player-play"><span class="lb">返回游戏</span></button>` : '');
  const hide = () => { S.classList.add('hidden'); stack = []; };
  S.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; if (a === 'back') back(); else if (a.startsWith('go:')) show(a.slice(3)); else if (acts[a]) acts[a](b); });
  const row = (act, ic, label, val = '', cls = '') => `<button class="shRow ${cls}" data-act="${act}" data-icon="${ic}"><span class="lb">${label}</span><span class="v">${val}</span>${act.startsWith('go:') ? `<span class="ic chev">${icon('chevron-right')}</span>` : ''}</button>`;
  const sec = t => `<div class="shSec">${t}</div>`;

  const online = () => typeof sess !== 'undefined' && !!sess;
  pages.home = () => {
    const p = prof(), c = window.srvCfg ? srvCfg() : null, on = online();
    return `<div class="home"><div class="brand"><img src="art/logo.png" alt=""><div class="bt">Screeps <b>World</b></div></div>
    <button class="pcard" data-act="${on ? 'go:profile' : 'go:login'}">${badge(on ? (sess.me.badge || p.badge) : p.badge, 44)}<div class="pc"><div class="pn">${on ? esc(sess.me.username) : '未登录'}</div><div class="ps">${esc(on ? srvLabel(c) : c ? '上次：' + srvLabel(c) : '连接你的私服或官方服务器')}</div></div><span class="ic chev">${icon('chevron-right')}</span></button>
    <div class="menu">
      <button id="sPlay" class="primary big" data-act="play" data-icon="player-play"><span class="lb">${on ? '进入游戏' : c && (c.password || c.token) ? '连接并进入' : '登录服务器'}</span></button>
      <button class="big" data-act="go:login" data-icon="server"><span class="lb">${on ? '切换服务器' : '服务器与账号'}</span></button>
      <button class="big" data-act="go:profile" data-icon="user"><span class="lb">个人中心</span></button>
      <button id="sSet" class="big" data-act="go:settings" data-icon="settings"><span class="lb">设置</span></button>
      <button class="big" data-act="go:about" data-icon="info-circle"><span class="lb">关于</span></button>
    </div><div id="startVer" class="foot">版本 ${esc(window.APP_VERSION || 'dev')}</div></div>`;
  };

  // 登录：私服（地址 + 用户名/密码，screepsmod-auth）或官方服务器（Auth Token + shard）
  let lk = null, lerr = '', lbusy = false, ldraft = {}; // ldraft：填了但还没连上的表单，出错重绘时保留
  pages.login = () => {
    const c = (window.srvCfg && srvCfg()) || {}; lk = lk || c.kind || 'private'; const P = lk === 'private', d = ldraft[lk] || (c.kind === lk ? c : {}), v = k => esc(d[k] ?? '');
    const f = (id, label, val, type = 'text', ph = '', extra = '') => `<label class="lf"><span>${label}</span><input id="${id}" type="${type}" value="${val}" placeholder="${ph}" autocomplete="off" autocapitalize="off" spellcheck="false" ${extra}></label>`;
    return head('服务器与账号') + `<div class="shBody login">
      <div class="seg2"><button class="${P ? 'on' : ''}" data-act="lkind" data-k="private">私服</button><button class="${P ? '' : 'on'}" data-act="lkind" data-k="official">官方服务器</button></div>
      ${P ? `${f('lHost', '服务器地址', v('host'), 'text', '例如 192.168.1.10:21025 或 https://你的域名')}
        ${f('lUser', '用户名或邮箱', v('username'))}${f('lPass', '密码', v('password'), 'password')}
        ${f('lSrvPw', '服务器密码（没有就留空）', v('serverPassword'), 'password')}
        <p class="note">私服需要安装 screepsmod-auth。第一次用可以点「注册新账号」。</p>`
      : `${f('lToken', 'Auth Token', v('token'), 'password', '在 screeps.com 账号设置 → Auth Tokens 生成')}
        <label class="lf"><span>Shard</span><select id="lShard">${['shard0', 'shard1', 'shard2', 'shard3'].map(x => `<option ${((lk === 'official' && d.shard) || 'shard3') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <p class="note">官方服务器需要你自己的 Screeps 账号（World 需订阅）。Token 有限额：上传代码每天最多 240 次。</p>`}
      ${lerr ? `<p class="lerr">${esc(lerr)}</p>` : ''}
      <button class="primary wide" data-act="login" data-icon="login" ${lbusy ? 'disabled' : ''}><span class="lb">${lbusy ? '连接中…' : '连接'}</span></button>
      ${P ? `<button class="wide" data-act="register" data-icon="user-plus" ${lbusy ? 'disabled' : ''}><span class="lb">注册新账号</span></button>` : ''}
      ${online() ? `<button class="wide danger" data-act="logout" data-icon="logout"><span class="lb">退出登录</span></button>` : ''}
      </div>`;
  };
  const readLogin = () => { const g = id => ($(id) ? $(id).value.trim() : '');
    return lk === 'private' ? { kind: 'private', host: g('lHost'), username: g('lUser'), password: $('lPass') ? $('lPass').value : '', serverPassword: $('lSrvPw') ? $('lSrvPw').value : '' }
      : { kind: 'official', token: g('lToken'), shard: g('lShard') || 'shard3' }; };
  async function doLogin(cfg) {
    ldraft[cfg.kind] = cfg; lbusy = true; lerr = ''; if (S.dataset.page === 'login') show('login', false);
    try { await connectServer(cfg); lbusy = false; ldraft = {}; toast('已连接'); startGame(); }
    catch (e) { lbusy = false; lerr = e.message || String(e); if (S.dataset.page !== 'login') show('login'); else show('login', false); }
  }

  // 个人中心：对照官方网页客户端账户页（徽章 + 名字 + GCL 进度条；概览 / 房间）
  let ptab = 'overview';
  const gclInfo = pts => { const M = SC.GCL_MULTIPLY, P = SC.GCL_POW, lv = Math.floor(Math.pow((pts || 0) / M, 1 / P)) + 1, base = Math.pow(lv - 1, P) * M, next = Math.pow(lv, P) * M; return { lv, cur: (pts || 0) - base, need: next - base }; };
  const myRooms = () => { const v = typeof view === 'function' ? view() : null; if (!v || !sess) return []; return Object.keys(v.owned || {}).filter(k => v.owned[k] === myPid).map(k => { const [rx, ry] = k.split(',').map(Number), mi = sess.mapInfo[k], c = (v.controllers || []).find(c => roomKey(c.x, c.y) === k);
    return { name: roomNameXY(rx, ry), lvl: c ? c.level : (mi && mi.own ? mi.own.level : 0), p: c ? c.progress : 0, t: c ? c.progressTotal : 0, sp: v.spawns.filter(s => s.owner === myPid && roomKey(s.x, s.y) === k).length, cr: v.creeps.filter(x => x.owner === myPid && roomKey(x.x, x.y) === k).length }; }); };
  pages.profile = () => {
    if (!online()) return head('个人中心') + `<div class="shBody"><p class="note">登录服务器后可以看到你的账号、GCL 和房间。</p>${row('go:login', 'login', '登录服务器')}${sec('徽章')}${row('go:badge', 'palette', '徽章')}</div>`;
    const me = sess.me, v = view(), g = gclInfo(me.gcl || 0), rooms = myRooms();
    const tile = (k, n, ic) => `<div class="cell"><div class="k"><span class="ic">${icon(ic)}</span>${k}</div><div class="n">${n}</div></div>`;
    const tabs = [['overview', '概览'], ['rooms', '房间']].map(([k, t]) => `<button class="tab${ptab === k ? ' on' : ''}" data-act="ptab" data-t="${k}">${t}</button>`).join('');
    let body = '';
    if (ptab === 'overview') body = `<div class="grid">${tile('房间', rooms.length, 'home')}${tile('creep', v ? v.creeps.filter(c => c.owner === myPid).length : 0, 'bug')}${tile('最高 RCL', Math.max(0, ...rooms.map(r => r.lvl)), 'trophy')}${tile('CPU', me.cpu ?? '-', 'cpu')}${tile('tick', v ? fmt(v.time) : '-', 'clock')}${tile('服务器', sess.official ? '官方' : '私服', 'server')}</div>
      ${sec('玩家')}${row('go:badge', 'palette', '徽章')}${row('worldMap', 'map', '世界地图')}${row('respawn', 'refresh', '重新出生', '', 'danger')}
      ${sec('更多')}${row('go:snippets', 'code', '代码片段库', J('sbm_snips', []).length + ' 个')}${row('go:login', 'server', '服务器与账号')}${row('go:settings', 'settings', '设置')}`;
    else body = rooms.length ? `<div class="rlist">${rooms.map(r => `<div class="rrow"><div class="rn">${esc(r.name)}</div><div class="rl">RCL <b>${r.lvl}</b></div><div class="rbar"><i style="width:${r.lvl >= 8 ? 100 : Math.round(100 * r.p / (r.t || 1))}%"></i></div><div class="rs">${r.sp} Spawn · ${r.cr} creep</div></div>`).join('')}</div>` : `${row('worldMap', 'map', '世界地图')}`;
    return head('个人中心') + `<div class="shBody acct">
      <div class="acHead">${badge(me.badge || prof().badge, 76)}<div class="pc"><div class="pn">${esc(me.username)}</div>
        <div class="gcl"><span class="gl">GCL <b>${g.lv}</b></span><div class="gbar"><i style="width:${Math.min(100, 100 * g.cur / g.need).toFixed(1)}%"></i></div><span class="gn">${fmt(Math.floor(g.cur))} / ${fmt(Math.ceil(g.need))}</span></div></div></div>
      <div class="tabs">${tabs}</div>${body}</div>`;
  };

  let draft = null;
  pages.badge = () => {
    const b = draft = draft || Object.assign({}, prof().badge), C = ScreepsBadge.colors;
    const sw = k => `<div class="sws pal">${C.map((c, i) => `<button class="sw${b[k] === i ? ' on' : ''}" data-act="bcol" data-k="${k}" data-c="${i}" style="background:${c}"></button>`).join('')}</div>`;
    return head('徽章与颜色') + `<div class="shBody"><div class="bprev">${badge(b, 112)}</div>
      ${sec('图案')}<div class="types">${ScreepsBadge.types.map(t => `<button class="tp${b.type === t ? ' on' : ''}" data-act="btype" data-t="${t}">${badge(Object.assign({}, b, { type: t }), 40)}</button>`).join('')}</div>
      ${sec('变形 ' + b.param)}<input class="bparam" type="range" min="-100" max="100" step="1" value="${b.param}" data-act="none">
      ${ScreepsBadge.flippable(b.type) ? row('bflip', 'edit', '翻转', b.flip ? '开' : '关') : ''}
      ${sec('颜色 1')}${sw('color1')}${sec('颜色 2')}${sw('color2')}${sec('颜色 3')}${sw('color3')}
      <button class="primary wide" data-act="bsave" data-icon="check"><span class="lb">保存徽章</span></button></div>`;
  };
  S.addEventListener('change', e => { if (e.target.classList.contains('bparam') && draft) { draft.param = +e.target.value; const y = S.scrollTop; show('badge', false); S.scrollTop = y; } });

  pages.snippets = () => {
    const L = J('sbm_snips', []);
    return head('代码片段库') + `<div class="shBody">${sec('当前程序')}${row('snSave', 'device-floppy', '把当前积木保存为片段')}${row('snImport', 'file-import', '导入片段 JSON')}
      ${sec('片段 · ' + L.length)}${L.length ? L.map((s, i) => `<div class="item"><div class="it"><div class="in">${esc(s.name)}</div><div class="is">${s.blocks} 个积木 · ${dt(s.ts)}</div></div>
        <button class="sm" data-act="snLoad" data-i="${i}" data-icon="download"></button><button class="sm" data-act="snExport" data-i="${i}" data-icon="file-export"></button><button class="sm danger" data-act="snDel" data-i="${i}" data-icon="trash"></button></div>`).join('') : ''}</div>`;
  };

  const st = () => J('sbm_settings', { speed: 1, sound: false, lang: 'zh' });
  pages.settings = () => {
    return head('设置') + `<div class="shBody">${sec('通用')}${row('none', 'language', '语言', '简体中文', 'static')}
      ${sec('主题')}<div class="thPick">${Object.entries(window.Theme ? Theme.PRESETS : {}).map(([id, t]) => `<button class="${Theme.get() === id ? 'on' : ''}" data-act="theme" data-t="${id}"><i style="background:${t.primary}"></i>${t.name}</button>`).join('')}</div>
      ${sec('服务器')}${row('go:login', 'server', '服务器与账号', esc(window.srvLabel ? srvLabel() : ''))}
      ${sec('代码')}${row('edDark', 'moon', '代码编辑器夜间模式', window.edDark && window.edDark() ? '开' : '关')}${row('resetCode', 'arrow-back-up', '恢复默认积木')}
      ${sec('数据')}${row('respawn', 'refresh', '重新出生', '', 'danger')}${row('clearAll', 'trash', '清除本机数据', '', 'danger')}</div>`;
  };

  pages.about = () => head('关于') + `<div class="shBody"><div class="aboutTop"><img src="art/logo.png" alt=""><div class="bt">Screeps <b>World</b></div></div>
    ${row('none', 'info-circle', '版本', 'V' + esc(window.APP_VERSION || 'dev'), 'static')}
    ${row('chkUpd', 'refresh', '检查更新', window.UPDATE_REL ? '有新版本 ' + esc(window.UPDATE_REL.tag_name) : '')}
    </div>`;

  // ---- 弹窗：输入 / 文本导入导出 ----
  function dialog(title, html, onOk, okText = '确定') {
    const d = document.createElement('div'); d.className = 'shDlg';
    d.innerHTML = `<div class="box"><div class="dt">${title}</div>${html}<div class="btns"><button data-r="0">取消</button><button data-r="1" class="primary">${okText}</button></div></div>`;
    document.body.appendChild(d); const f = d.querySelector('input,textarea'); f && setTimeout(() => f.focus(), 50);
    d.onclick = e => { const r = e.target.closest('[data-r]'); if (!r) return; if (r.dataset.r === '1' && onOk && onOk(d) === false) return; d.remove(); };
  }
  const ask = (title, val, cb) => dialog(title, `<input class="fi" maxlength="24" value="${esc(val)}">`, d => cb(d.querySelector('input').value.trim()));
  const exportText = (name, text) => {
    dialog('导出 · ' + esc(name), `<textarea class="fi ta" readonly>${esc(text)}</textarea>`, () => { navigator.clipboard?.writeText(text).then(() => toast('已复制到剪贴板'), () => {}); }, '复制');
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') + '.json'; if (!window.Capacitor?.isNativePlatform?.()) a.click(); } catch (e) {}
  };
  const importText = (title, cb) => dialog(title, `<textarea class="fi ta" placeholder="粘贴 JSON"></textarea><input type="file" accept=".json,application/json" class="file">`, d => {
    const t = d.querySelector('textarea').value.trim(); if (!t) { toast('请粘贴或选择文件'); return false; }
    try { cb(JSON.parse(t)); } catch (e) { toast('JSON 无效：' + e.message); return false; }
  }, '导入');
  document.addEventListener('change', e => { if (!e.target.matches('.shDlg .file')) return; const f = e.target.files[0]; if (!f) return; f.text().then(t => { e.target.closest('.box').querySelector('textarea').value = t; }); });

  const saveList = (k, L) => LS.setItem(k, JSON.stringify(L));
  const countBlocks = j => { let n = 0; const walk = o => { if (o && typeof o === 'object') { if (o.type && o.id) n++; Object.values(o).forEach(walk); } }; walk(j); return n; };
  function startGame() {
    if (!online()) { const c = window.srvCfg && srvCfg(); if (c && (c.password || c.token)) { if (!lbusy) doLogin(c); show('login'); } else show('login'); return; }
    hide(); startGame.done = 1; }

  const acts = {
    play: startGame,
    lkind(b) { const r = readLogin(); ldraft[r.kind] = r; lk = b.dataset.k; lerr = ''; show('login', false); },
    login() { const c = readLogin(); doLogin(c); },
    async register() { const c = readLogin(); if (!c.host || !c.username || !c.password) { lerr = '注册需要填写服务器地址、用户名和密码'; return show('login', false); }
      if (c.password.length < 8) { lerr = '密码至少 8 位'; return show('login', false); }
      lbusy = true; lerr = ''; show('login', false);
      try { const a = new ScreepsApi(c, { storage: LS }); await a.version(); await a.register(c.username, c.password, /@/.test(c.username) ? c.username : undefined); lbusy = false; toast('注册成功，正在登录'); doLogin(c); }
      catch (e) { lbusy = false; lerr = '注册失败：' + e.message; show('login', false); } },
    logout() { if (!confirm('退出登录？')) return; window.logout(); startGame.done = 0; show('home'); },
    theme(b) { Theme.set(b.dataset.t); const y = S.scrollTop; show('settings', false); S.scrollTop = y; },
    btype(b) { draft.type = +b.dataset.t; const y = S.scrollTop; show('badge', false); S.scrollTop = y; },
    bflip() { draft.flip = !draft.flip; const y = S.scrollTop; show('badge', false); S.scrollTop = y; },
    bcol(b) { draft[b.dataset.k] = +b.dataset.c; const y = S.scrollTop; show('badge', false); S.scrollTop = y; },
    async bsave() { const p = prof(); p.badge = draft; draft = null; saveList('sbm_profile', p);
      // 同步到服务器（官方 POST /api/user/badge，颜色用十六进制）
      if (online()) { const C = ScreepsBadge.colors, hx = i => typeof i === 'string' ? i : C[i] || '#808080', b = { type: p.badge.type, color1: hx(p.badge.color1), color2: hx(p.badge.color2), color3: hx(p.badge.color3), param: p.badge.param, flip: !!p.badge.flip };
        try { await sess.api.post('/api/user/badge', { badge: b }); sess.me.badge = b; if (sess.users[myPid]) sess.users[myPid].badge = b; sess.buildView(); toast('徽章已保存到服务器'); } catch (e) { toast('徽章已保存在本机，同步到服务器失败：' + e.message); } }
      else toast('徽章已保存'); back(); },
    ptab(b) { ptab = b.dataset.t; show('profile', false); },
    worldMap() { if (!online()) return toast('还没连接服务器'); hide(); startGame.done = 1; window.openWorldMap && window.openWorldMap(false); },
    respawn() { if (!online()) return toast('还没连接服务器'); if (!confirm('重新出生？服务器上你的所有 creep、建筑和房间都会被清除，然后在世界地图上重新选择出生点。')) return; window.doRespawn && window.doRespawn(); hide(); },
    snSave() { const j = Blockly.serialization.workspaces.save(ws); ask('片段名称', '我的程序', name => { const L = J('sbm_snips', []); L.unshift({ name: name || '未命名', ts: Date.now(), blocks: countBlocks(j), ws: j }); saveList('sbm_snips', L); toast('已保存'); show('snippets', false); }); },
    snLoad(b) { const s = J('sbm_snips', [])[b.dataset.i]; if (!s || !confirm(`用「${s.name}」替换当前积木？`)) return; window.histPush && histPush('载入片段前', true); ws.clear(); sbmLoadWs(s.ws, ws); regen(false); toast('已载入到编辑器（原程序已存入历史版本），点「上传」生效'); },
    snExport(b) { const s = J('sbm_snips', [])[b.dataset.i]; s && exportText(s.name, JSON.stringify({ kind: 'screeps-blockly-snippet', name: s.name, ws: s.ws })); },
    snDel(b) { const L = J('sbm_snips', []); if (!confirm(`删除「${L[b.dataset.i].name}」？`)) return; L.splice(b.dataset.i, 1); saveList('sbm_snips', L); show('snippets', false); },
    snImport() { importText('导入片段', j => { const w = j.ws || j; if (!w.blocks) throw new Error('不是积木程序'); const L = J('sbm_snips', []); L.unshift({ name: j.name || '导入的片段', ts: Date.now(), blocks: countBlocks(w), ws: w }); saveList('sbm_snips', L); toast('已导入'); show('snippets', false); }); },
    async chkUpd(b) { if (b.dataset.busy) return; const v = b.querySelector('.v'); b.dataset.busy = '1'; b.disabled = true; v.textContent = '检查中…';
      const r = await (window.checkUpdate ? checkUpdate('about') : 'fail'); delete b.dataset.busy; b.disabled = false;
      v.textContent = r === 'new' ? '有新版本 ' + (window.UPDATE_REL ? window.UPDATE_REL.tag_name : '') : r === 'latest' ? '已是最新版本' : '检查失败，请稍后重试'; },
    edDark() { window.setEdDark(!window.edDark()); show('settings', false); },
    intro() { hide(); $('intro').classList.remove('hidden'); },
    resetCode() { $('mResetCode').click(); },
    clearAll() { if (!confirm('清除本机数据？包括积木、片段、服务器账号和个人资料，无法恢复（服务器上的世界不受影响）。')) return; LS.clear(); location.reload(); },
  };
  S.addEventListener('click', e => { const b = e.target.closest('[data-act^="open:"]'); if (b) openUrl(b.dataset.act.slice(5)); });

  // 接管入口：底栏「设置」→ 应用外壳；游戏内菜单保留但不再默认打开
  $('btnMenu').onclick = () => show('home');
  // Android 返回键：菜单内逐级返回，最后回到游戏
  // （安卓返回键统一由 back-stack.js 处理，见 main.js 末尾 initBack）
  setLabel('btnMenu', 'menu-2', '菜单');
  // 硬件返回：子页面回上一页，栈空时回首页（不直接回游戏）
  const hwBack = () => { stack.pop(); if (!stack.length || stack[0] !== 'home') stack.unshift('home'); show(stack[stack.length - 1], false); };
  const closeDlg = () => { const L = document.querySelectorAll('.shDlg'); if (!L.length) return false; L[L.length - 1].remove(); };
  window.Shell = { show, hide, badge, hwBack, closeDlg, dialog, page: () => S.classList.contains('hidden') ? null : S.dataset.page };
  // 启动时如果记住了账号，后台自动连接（失败不打扰，点「连接并进入」会显示原因）
  { const c = window.srvCfg && srvCfg(); if (c && (c.password || c.token) && !new URLSearchParams(location.search).get('nologin')) { lbusy = true; connectServer(c).then(() => { lbusy = false; if (S.dataset.page === 'home' && !S.classList.contains('hidden')) show('home', false); }).catch(e => { lbusy = false; lerr = e.message || String(e); if (S.dataset.page === 'home' && !S.classList.contains('hidden')) show('home', false); }); } }
  if (new URLSearchParams(location.search).get('page')) { stack = ['home']; show(new URLSearchParams(location.search).get('page')); }
  else if (!S.classList.contains('hidden')) show('home');
})();
