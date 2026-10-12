// 应用外壳：首页 / 个人中心 / 统计 / 存档 / 代码片段 / 设置 / 关于（扁平 Screeps 网页风格）
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
  const head = (title, back = true) => `<header class="shHead">${back ? `<button class="shBack" data-act="back" data-icon="arrow-left"></button>` : ''}<span class="shTitle">${title}</span></header>`;
  function show(name, push = true) {
    if (push && stack[stack.length - 1] !== name) stack.push(name);
    S.classList.remove('hidden'); S.innerHTML = pages[name](); S.dataset.page = name; applyIcons(S); S.scrollTop = 0;
  }
  const back = () => { stack.pop(); stack.length ? show(stack[stack.length - 1], false) : show('home'); };
  const hide = () => { S.classList.add('hidden'); stack = []; };
  S.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; if (a === 'back') back(); else if (a.startsWith('go:')) show(a.slice(3)); else if (acts[a]) acts[a](b); });
  const row = (act, ic, label, val = '', cls = '') => `<button class="shRow ${cls}" data-act="${act}" data-icon="${ic}"><span class="lb">${label}</span><span class="v">${val}</span>${act.startsWith('go:') ? `<span class="ic chev">${icon('chevron-right')}</span>` : ''}</button>`;
  const sec = t => `<div class="shSec">${t}</div>`;

  pages.home = () => {
    const p = prof();
    return `<div class="home"><div class="brand"><img src="art/logo.png" alt=""><div class="bt">Screeps <b>World</b></div></div>
    <button class="pcard" data-act="go:profile">${badge(p.badge, 44)}<div class="pc"><div class="pn">${esc(nick)}</div><div class="ps">RCL ${Stats.get().rclMax} · ${fmt(Stats.get().ticks)} tick</div></div><span class="ic chev">${icon('chevron-right')}</span></button>
    <div class="grid hq">${[['总 tick', Stats.get().ticks], ['creep', Stats.get().creeps], ['能量', Stats.get().energy]].map(([k, v]) => `<div class="cell"><div class="k">${k}</div><div class="n">${fmt(v)}</div></div>`).join('')}</div>
    <div class="menu">
      <button id="sPlay" class="primary big" data-act="play" data-icon="player-play"><span class="lb">开始游戏</span></button>
      <button id="sNet" class="big" data-act="net" data-icon="broadcast"><span class="lb">局域网联机</span></button>
      <button class="big" data-act="go:profile" data-icon="user"><span class="lb">个人中心</span></button>
      <button id="sSet" class="big" data-act="go:settings" data-icon="settings"><span class="lb">设置</span></button>
      <button class="big" data-act="go:about" data-icon="info-circle"><span class="lb">关于</span></button>
    </div><div id="startVer" class="foot">版本 ${esc(window.APP_VERSION || 'dev')} · MIT 开源</div></div>`;
  };

  // 个人中心：对照官方网页客户端账户页（徽章 + 名字 + GCL 进度条；概览 / 房间 / 统计 三个标签）
  let ptab = 'overview';
  const gclInfo = pts => { const M = SC.GCL_MULTIPLY, P = SC.GCL_POW, lv = Math.floor(Math.pow((pts || 0) / M, 1 / P)) + 1, base = Math.pow(lv - 1, P) * M, next = Math.pow(lv, P) * M; return { lv, cur: (pts || 0) - base, need: next - base }; };
  const myRooms = () => { const v = typeof view === 'function' ? view() : null; if (!v) return []; return (v.controllers || []).filter(c => c.owner === myPid).map(c => ({ name: roomName(c.x, c.y), lvl: c.level, p: c.progress, t: c.progressTotal,
    sp: v.spawns.filter(s => s.owner === myPid && roomName(s.x, s.y) === roomName(c.x, c.y)).length, cr: v.creeps.filter(k => k.owner === myPid && roomName(k.x, k.y) === roomName(c.x, c.y)).length })); };
  pages.profile = () => {
    const p = prof(), s = Stats.get(), v = typeof view === 'function' ? view() : null, me = v && v.players[myPid], g = gclInfo(me ? me.gcl : 0), rooms = myRooms();
    const tile = (k, n, ic) => `<div class="cell"><div class="k"><span class="ic">${icon(ic)}</span>${k}</div><div class="n">${n}</div></div>`;
    const tabs = [['overview', '概览'], ['rooms', '房间'], ['stats', '统计']].map(([k, t]) => `<button class="tab${ptab === k ? ' on' : ''}" data-act="ptab" data-t="${k}">${t}</button>`).join('');
    let body = '';
    if (ptab === 'overview') body = `<div class="grid">${tile('房间', rooms.length, 'home')}${tile('creep', v ? v.creeps.filter(c => c.owner === myPid).length : 0, 'bug')}${tile('最高 RCL', Math.max(s.rclMax, ...rooms.map(r => r.lvl), 0), 'trophy')}${tile('世界', v ? v.S + '×' + v.S : '-', 'map')}${tile('总 tick', fmt(s.ticks), 'clock')}${tile('采集能量', fmt(s.energy), 'bolt')}</div>
      ${sec('玩家')}${row('editName', 'edit', '昵称', esc(nick))}${row('go:badge', 'palette', '徽章')}${row('worldMap', 'map', '世界地图')}${row('respawn', 'refresh', '重新出生', '', 'danger')}
      ${sec('更多')}${row('go:worlds', 'world', '存档管理', J('sbm_worlds', []).length + ' 个')}${row('go:snippets', 'code', '代码片段库', J('sbm_snips', []).length + ' 个')}${row('go:settings', 'settings', '设置')}`;
    else if (ptab === 'rooms') body = rooms.length ? `<div class="rlist">${rooms.map(r => `<div class="rrow"><div class="rn">${esc(r.name)}</div><div class="rl">RCL <b>${r.lvl}</b></div><div class="rbar"><i style="width:${r.lvl >= 8 ? 100 : Math.round(100 * r.p / (r.t || 1))}%"></i></div><div class="rs">${r.sp} Spawn · ${r.cr} creep</div></div>`).join('')}</div>`
      : `<p class="note">还没有房间。在世界地图上选择一个空闲房间放下 Spawn。</p>${row('worldMap', 'map', '打开世界地图')}`;
    else body = `<div class="grid">${[['总运行 tick', s.ticks, 'clock'], ['生产 creep', s.creeps, 'bug'], ['采集能量', s.energy, 'bolt'], ['最高 RCL', s.rclMax, 'trophy'], ['建成建筑', s.built, 'building'], ['存档', J('sbm_worlds', []).length, 'world']].map(([k, n, ic]) => tile(k, fmt(n), ic)).join('')}</div>
      <p class="note">统计自 ${dt(s.since)}，只统计本机玩家在本机运行（单机 / 房主）时的数据。</p>${row('statReset', 'eraser', '清零统计', '', 'danger')}`;
    return head('个人中心') + `<div class="shBody acct">
      <div class="acHead">${badge(p.badge, 76)}<div class="pc"><div class="pn">${esc(nick)}</div>
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

  pages.stats = () => {
    const s = Stats.get(), L = [['总运行 tick', s.ticks, 'clock'], ['生产 creep', s.creeps, 'bug'], ['采集能量', s.energy, 'bolt'], ['最高 RCL', s.rclMax, 'trophy'], ['建成建筑', s.built, 'building']];
    return head('详细统计') + `<div class="shBody">${sec('累计数据 · 自 ' + dt(s.since))}${L.map(([k, v, ic]) => row('none', ic, k, `<b>${v}</b>`, 'static')).join('')}
      <p class="note">只统计本机玩家在本机运行（单机 / 房主）时的数据。</p>${row('statReset', 'eraser', '清零统计', '', 'danger')}</div>`;
  };

  pages.worlds = () => {
    const L = J('sbm_worlds', []);
    return head('存档管理') + `<div class="shBody">${sec('当前世界')}${row('wSave', 'device-floppy', '保存当前世界为新存档')}${row('wImport', 'file-import', '导入 JSON 存档')}
      ${sec('已保存 · ' + L.length)}${L.length ? L.map((w, i) => `<div class="item"><div class="it"><div class="in">${esc(w.name)}</div><div class="is">TICK ${w.time} · ${dt(w.ts)}</div></div>
        <button class="sm" data-act="wLoad" data-i="${i}" data-icon="player-play"></button><button class="sm" data-act="wExport" data-i="${i}" data-icon="file-export"></button><button class="sm danger" data-act="wDel" data-i="${i}" data-icon="trash"></button></div>`).join('') : '<p class="note">还没有存档。</p>'}</div>`;
  };

  pages.snippets = () => {
    const L = J('sbm_snips', []);
    return head('代码片段库') + `<div class="shBody">${sec('当前程序')}${row('snSave', 'device-floppy', '把当前积木保存为片段')}${row('snImport', 'file-import', '导入片段 JSON')}
      ${sec('片段 · ' + L.length)}${L.length ? L.map((s, i) => `<div class="item"><div class="it"><div class="in">${esc(s.name)}</div><div class="is">${s.blocks} 个积木 · ${dt(s.ts)}</div></div>
        <button class="sm" data-act="snLoad" data-i="${i}" data-icon="download"></button><button class="sm" data-act="snExport" data-i="${i}" data-icon="file-export"></button><button class="sm danger" data-act="snDel" data-i="${i}" data-icon="trash"></button></div>`).join('') : '<p class="note">还没有片段。</p>'}</div>`;
  };

  const st = () => J('sbm_settings', { speed: 1, sound: false, lang: 'zh' });
  pages.settings = () => {
    const s = st();
    return head('设置') + `<div class="shBody">${sec('通用')}${row('none', 'language', '语言', '简体中文', 'static')}${row('sound', 'volume-off', '音效', s.sound ? '开' : '关')}
      ${sec('游戏')}${row('fps', 'gauge', '显示 FPS', showFps ? '开' : '关')}${row('defSpeed', 'player-track-next', '默认运行速度', s.speed + 'x')}${row('edDark', 'moon', '代码编辑器夜间模式', window.edDark && window.edDark() ? '开' : '关')}${row('speedPick', 'player-track-next', '当前运行速度', speed + 'x')}${row('net', 'broadcast', '局域网联机')}${row('intro', 'help', '新手提示')}${row('resetCode', 'arrow-back-up', '恢复默认积木')}
      ${sec('更新')}${row('update', 'download', '检查更新', 'V' + esc(window.APP_VERSION || 'dev'))}
      ${sec('数据')}${row('saveNow', 'device-floppy', '立即保存世界')}${row('respawn', 'refresh', '重新出生', '', 'danger')}${row('resetWorld', 'refresh', '重置世界', '', 'danger')}${row('clearAll', 'trash', '清除全部数据', '', 'danger')}</div>`;
  };

  pages.about = () => head('关于') + `<div class="shBody"><div class="aboutTop"><img src="art/logo.png" alt=""><div class="bt">Screeps <b>World</b></div><div class="bs">版本 ${esc(window.APP_VERSION || 'dev')}</div></div>
    <p class="note">受 Screeps（screeps.com）启发的非官方开源同人作品：用 Blockly 积木编写 creep 的 JavaScript AI，在开放世界中采集、建造、扩张。</p>
    ${sec('开源')}${row('open:https://github.com/tietiezhi-1216/screeps-blockly-mobile', 'brand-github', '源代码仓库', 'GitHub')}${row('open:https://github.com/tietiezhi-1216/screeps-blockly-mobile/releases', 'download', '版本发布')}${row('open:https://docs.screeps.com/', 'license', 'Screeps 官方文档')}
    ${sec('许可证')}${[['本项目', 'MIT'], ['Blockly', 'Apache-2.0'], ['PixiJS', 'MIT'], ['Capacitor', 'MIT'], ['Tabler Icons', 'MIT']].map(([a, b]) => row('none', 'license', a, b, 'static')).join('')}
    <p class="note">Screeps 是 Screeps 官方的商标，本作与其无关联。</p></div>`;

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
  function startGame() { hide(); const s = st(); if (!startGame.done) { startGame.done = 1; speed = s.speed || 1; setLabel('btnSpeed', 'player-track-next', speed + 'x'); $('btnRun').dataset.speed = speed + 'x'; } if (!LS.getItem('sbm_intro')) $('intro').classList.remove('hidden'); }

  const acts = {
    play: startGame,
    net() { hide(); $('net').classList.remove('hidden'); },
    editName() { ask('修改昵称', nick, v => { if (!v) return; nick = v.slice(0, 16); LS.setItem('sbm_nick', nick); $('nick').value = nick; if (engine?.w.players[myPid]) engine.w.players[myPid].name = nick; show('profile', false); }); },
    btype(b) { draft.type = +b.dataset.t; const y = S.scrollTop; show('badge', false); S.scrollTop = y; },
    bflip() { draft.flip = !draft.flip; const y = S.scrollTop; show('badge', false); S.scrollTop = y; },
    bcol(b) { draft[b.dataset.k] = +b.dataset.c; const y = S.scrollTop; show('badge', false); S.scrollTop = y; },
    bsave() { const p = prof(); p.badge = draft; draft = null; saveList('sbm_profile', p); toast('徽章已保存'); back(); },
    ptab(b) { ptab = b.dataset.t; show('profile', false); },
    worldMap() { hide(); window.openWorldMap && window.openWorldMap(false); },
    respawn() { if (!confirm('重新出生？你的所有 creep、建筑和房间都会被清除，然后在世界地图上重新选择出生点。')) return; window.doRespawn && window.doRespawn(); hide(); },
    statReset() { if (confirm('清零全部统计？')) { Stats.reset(); show('stats', false); } },
    wSave() { if (mode === 'client') return toast('客户端没有本地世界'); save(); ask('存档名称', '世界 ' + dt(Date.now()), name => { const L = J('sbm_worlds', []); L.unshift({ name: name || '未命名', ts: Date.now(), time: engine.w.time, data: engine.saveData() }); try { saveList('sbm_worlds', L); toast('已保存'); } catch (e) { toast('存储空间不足'); } show('worlds', false); }); },
    wLoad(b) { const w = J('sbm_worlds', [])[b.dataset.i]; if (!w || !confirm(`载入「${w.name}」？当前世界未保存的进度会丢失。`)) return; if (mode === 'client') return toast('请先回到单机'); LS.setItem(SAVE_W, w.data); loadEngine(); if (hostS) { hostS.e = engine; rebindHost(); } toast('已载入'); startGame(); },
    wExport(b) { const w = J('sbm_worlds', [])[b.dataset.i]; w && exportText(w.name, JSON.stringify({ kind: 'screeps-world-save', name: w.name, ts: w.ts, world: JSON.parse(w.data) })); },
    wDel(b) { const L = J('sbm_worlds', []); if (!confirm(`删除「${L[b.dataset.i].name}」？`)) return; L.splice(b.dataset.i, 1); saveList('sbm_worlds', L); show('worlds', false); },
    wImport() { importText('导入存档', j => { const w = j.world || j; if (!w || !w.players) throw new Error('不是世界存档'); const L = J('sbm_worlds', []); L.unshift({ name: j.name || '导入的世界', ts: Date.now(), time: w.time || 0, data: JSON.stringify(w) }); saveList('sbm_worlds', L); toast('已导入'); show('worlds', false); }); },
    snSave() { const j = Blockly.serialization.workspaces.save(ws); ask('片段名称', '我的程序', name => { const L = J('sbm_snips', []); L.unshift({ name: name || '未命名', ts: Date.now(), blocks: countBlocks(j), ws: j }); saveList('sbm_snips', L); toast('已保存'); show('snippets', false); }); },
    snLoad(b) { const s = J('sbm_snips', [])[b.dataset.i]; if (!s || !confirm(`用「${s.name}」替换当前积木？`)) return; ws.clear(); Blockly.serialization.workspaces.load(s.ws, ws); regen(true); toast('已载入到编辑器'); },
    snExport(b) { const s = J('sbm_snips', [])[b.dataset.i]; s && exportText(s.name, JSON.stringify({ kind: 'screeps-blockly-snippet', name: s.name, ws: s.ws })); },
    snDel(b) { const L = J('sbm_snips', []); if (!confirm(`删除「${L[b.dataset.i].name}」？`)) return; L.splice(b.dataset.i, 1); saveList('sbm_snips', L); show('snippets', false); },
    snImport() { importText('导入片段', j => { const w = j.ws || j; if (!w.blocks) throw new Error('不是积木程序'); const L = J('sbm_snips', []); L.unshift({ name: j.name || '导入的片段', ts: Date.now(), blocks: countBlocks(w), ws: w }); saveList('sbm_snips', L); toast('已导入'); show('snippets', false); }); },
    sound() { const s = st(); s.sound = !s.sound; saveList('sbm_settings', s); toast('当前版本暂无音效'); show('settings', false); },
    fps() { $('mFps').click(); show('settings', false); },
    defSpeed() { const s = st(); s.speed = s.speed >= 8 ? 1 : s.speed * 2; saveList('sbm_settings', s); show('settings', false); },
    edDark() { window.setEdDark(!window.edDark()); show('settings', false); },
    speedPick() { speed = speed >= 8 ? 1 : speed * 2; setLabel('btnSpeed', 'player-track-next', speed + 'x'); $('btnRun').dataset.speed = speed + 'x'; show('settings', false); },
    intro() { hide(); $('intro').classList.remove('hidden'); },
    resetCode() { $('mResetCode').click(); },
    update() { checkUpdate(true); },
    saveNow() { save(); toast('已保存'); },
    resetWorld() { $('mReset').click(); },
    clearAll() { if (!confirm('清除全部数据？包括世界、积木、存档、片段、统计和个人资料，无法恢复。')) return; const keep = LS.getItem('sbm_pid'); LS.clear(); if (keep) LS.setItem('sbm_pid', keep); location.reload(); },
  };
  S.addEventListener('click', e => { const b = e.target.closest('[data-act^="open:"]'); if (b) openUrl(b.dataset.act.slice(5)); });

  // 接管入口：底栏「设置」→ 应用外壳；游戏内菜单保留但不再默认打开
  $('btnMenu').onclick = () => show('home');
  setLabel('btnMenu', 'menu-2', '菜单');
  window.Shell = { show, hide, badge };
  if (new URLSearchParams(location.search).get('page')) { stack = ['home']; show(new URLSearchParams(location.search).get('page')); }
  else if (!S.classList.contains('hidden')) show('home');
})();
