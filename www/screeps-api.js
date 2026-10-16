// 官方 Screeps 服务器客户端（HTTP + SockJS WebSocket）。私服（screepsmod-auth 用户名/密码）与官方服务器（Auth Token）共用。
// 不依赖 DOM：浏览器里用 fetch / WebSocket，Node 测试里注入。
(function (root) {
  const ERR_ZH = {
    'invalid params': '参数无效', 'not authorized': '登录已失效，请重新登录', 'invalid room': '房间不存在', 'invalid position': '位置无效',
    'too many': '工地数量已达上限（100）', 'invalid location': '位置无效', 'already playing': '你已经有房间了', 'blocked': '账号被封禁',
    'invalid object': '对象无效', 'not found': '没有找到', 'room not available': '这个房间不能出生', 'not a novice area': '房间不可用',
    'invalid structure': '建筑类型无效', 'rcl not enough': 'RCL 不足', 'not owned': '不是你的房间', 'safe mode active already': '安全模式已开启',
    'invalid name': '名字无效', 'name exists': '名字已存在', 'out of borders': '房间在世界边界外', 'flag exists': '旗帜名字已存在',
    'registration is automatically disabled': '这个服务器设置了服务器密码，不能在 App 里注册，请找服主开账号', 'registration': '这个服务器关闭了注册，请找服主开账号',
    'incorrect server password': '服务器密码不对', 'already exists': '用户名或邮箱已被占用', 'user exists': '用户名已被占用', 'user not found': '没有这个用户', 'password required': '请填写密码', 'banned': '账号被封禁', 'forbidden': '没有权限',
  };
  const zhErr = e => { const s = String(e || ''); for (const k in ERR_ZH) if (s.toLowerCase().includes(k)) return ERR_ZH[k]; return s || '未知错误'; };
  // 官方 Auth Token 限额（docs.screeps.com/auth-tokens.html）。私服不限。
  const OFFICIAL_LIMITS = { 'POST /api/user/code': [240, 864e5], 'GET /api/user/code': [60, 36e5], 'GET /api/game/room-terrain': [360, 36e5], 'POST /api/game/map-stats': [60, 36e5],
    'GET /api/user/memory': [1440, 864e5], 'POST /api/user/memory': [240, 864e5], 'POST /api/user/console': [360, 36e5], 'POST /api/user/set-active-branch': [240, 864e5], '*': [120, 6e4] };

  // 安卓 App 里用原生 HTTP（CapacitorHttp）：私服一般没有 CORS 头，WebView 里的 fetch 会被浏览器拦截
  function nativeFetch() {
    const C = root.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    const H = (C.Plugins && C.Plugins.CapacitorHttp) || (C.registerPlugin && C.registerPlugin('CapacitorHttp')); if (!H) return null;
    return async (url, o = {}) => { const r = await H.request({ url, method: o.method || 'GET', headers: o.headers || {}, data: o.body ? JSON.parse(o.body) : undefined, responseType: 'text', connectTimeout: 15000, readTimeout: 30000 });
      const hd = {}; for (const k in r.headers || {}) hd[k.toLowerCase()] = r.headers[k];
      return { status: r.status, headers: { get: k => hd[String(k).toLowerCase()] ?? null }, text: async () => typeof r.data === 'string' ? r.data : JSON.stringify(r.data) }; };
  }
  class ApiError extends Error { constructor(msg, code, raw) { super(msg); this.code = code; this.raw = raw; } }

  class ScreepsApi {
    // cfg: { kind: 'private'|'official', host, port, secure, path, username, password, token, serverPassword, shard }
    constructor(cfg, deps = {}) {
      this.cfg = Object.assign({ kind: 'private', path: '/' }, cfg);
      this.fetch = deps.fetch || nativeFetch() || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
      this.WS = deps.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
      this.store = deps.storage || null; // 限额计数持久化（localStorage）
      this.token = this.cfg.kind === 'official' ? this.cfg.token : null; this.user = null;
      this.sock = null; this.subs = new Map(); this.onStatus = null; this._retry = 0; this._closed = false;
    }
    get official() { return this.cfg.kind === 'official'; }
    base() {
      if (this.official) return 'https://screeps.com';
      let h = String(this.cfg.host || '').trim().replace(/\/+$/, ''); if (!h) throw new ApiError('请填写服务器地址');
      if (!/^https?:\/\//i.test(h)) h = (this.cfg.secure ? 'https://' : 'http://') + h;
      const u = new URL(h); if (this.cfg.port && !/:\d+$/.test(u.host)) u.port = String(this.cfg.port);
      return u.origin + (u.pathname.replace(/\/+$/, '') || '');
    }
    // ---- 官方限额：本地计数，超限前就拒绝（不浪费请求），并给出中文提示 ----
    _rl(key) {
      if (!this.official) return; const lim = OFFICIAL_LIMITS[key]; const k = 'sbm_rl', now = Date.now();
      let st = {}; try { st = JSON.parse((this.store && this.store.getItem(k)) || '{}'); } catch (e) {}
      const chk = (kk, [n, win]) => { const L = (st[kk] || []).filter(t => now - t < win); if (L.length >= n) { const wait = Math.ceil((win - (now - L[0])) / 60000); throw new ApiError(`官方服务器限额：${kk === '*' ? '每分钟最多 120 次请求' : this._rlZh(kk, n, win)}，约 ${wait} 分钟后再试`, 429); } L.push(now); st[kk] = L; };
      chk('*', OFFICIAL_LIMITS['*']); if (lim) chk(key, lim);
      try { this.store && this.store.setItem(k, JSON.stringify(st)); } catch (e) {}
    }
    _rlZh(k, n, win) { const what = { 'POST /api/user/code': '上传代码', 'GET /api/user/code': '下载代码', 'GET /api/game/room-terrain': '读取地形', 'POST /api/game/map-stats': '读取地图', 'GET /api/user/memory': '读取内存', 'POST /api/user/memory': '修改内存', 'POST /api/user/console': '控制台命令', 'POST /api/user/set-active-branch': '切换分支' }[k] || '请求'; return `${what}每${win >= 864e5 ? '天' : '小时'}最多 ${n} 次`; }
    rateLeft(key) { if (!this.official) return Infinity; const lim = OFFICIAL_LIMITS[key]; if (!lim) return Infinity; let st = {}; try { st = JSON.parse((this.store && this.store.getItem('sbm_rl')) || '{}'); } catch (e) {} return lim[0] - (st[key] || []).filter(t => Date.now() - t < lim[1]).length; }

    async req(method, path, body, opt = {}) {
      if (!this.fetch) throw new ApiError('当前环境不能联网');
      const q = method === 'GET' && body ? '?' + Object.entries(body).filter(([, v]) => v != null).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
      if (!opt.noLimit) this._rl(method + ' ' + path);
      const h = { 'Content-Type': 'application/json; charset=utf-8' };
      if (this.token && opt.auth !== false) { h['X-Token'] = this.token; }
      if (this.cfg.serverPassword) h['X-Server-Password'] = this.cfg.serverPassword;
      let r; try { r = await this.fetch(this.base() + path + q, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }); }
      catch (e) { throw new ApiError(this.official ? '连不上官方服务器，请检查网络' : '连不上服务器，请检查地址、端口和网络', 0); }
      const nt = r.headers && r.headers.get && r.headers.get('x-token'); if (nt && !this.official) this.token = nt; // 私服每次请求会刷新 token
      if (r.status === 429) throw new ApiError('请求太频繁，服务器限流，请稍后再试', 429);
      if (r.status === 401) throw new ApiError(this.official ? 'Auth Token 无效或已过期' : '登录已失效，请重新登录', 401);
      if (r.status === 404) throw new ApiError(opt.what404 || '服务器不支持这个功能', 404);
      if (r.status >= 500) throw new ApiError('服务器出错，请稍后再试', r.status);
      let j; const txt = await r.text(); try { j = JSON.parse(txt); } catch (e) { throw new ApiError(r.status === 403 ? '服务器拒绝访问（服务器密码不对？）' : '服务器返回的不是游戏数据，请检查地址', r.status); }
      if (j && j.error) throw new ApiError(zhErr(j.error), r.status, j.error);
      return j;
    }
    get(p, q, o) { return this.req('GET', p, q, o); }
    post(p, b, o) { return this.req('POST', p, b, o); }
    shardQ(o) { if (this.official && this.cfg.shard) o.shard = this.cfg.shard; return o; }

    // ---- 登录 ----
    async version() { return this.get('/api/version', null, { auth: false, noLimit: !this.official }); }
    async login() {
      if (this.official) { if (!this.token) throw new ApiError('请填写 Auth Token'); }
      else {
        if (!this.cfg.username || !this.cfg.password) throw new ApiError('请填写用户名和密码');
        let r; try { r = await this.post('/api/auth/signin', { email: this.cfg.username, password: this.cfg.password }, { auth: false, what404: '这个服务器没装 screepsmod-auth，不能用密码登录' }); }
        catch (e) { if (e.code === 401) throw new ApiError('用户名或密码不对', 401); throw e; }
        this.token = r.token;
      }
      this.user = await this.get('/api/auth/me'); return this.user;
    }
    async register(username, password, email) { return this.post('/api/register/submit', { username, password, email: email || undefined }, { auth: false, what404: '这个服务器不支持注册' }); }

    // ---- 世界 ----
    worldSize() { return this.get('/api/game/world-size', this.shardQ({})); }
    time() { return this.get('/api/game/time', this.shardQ({})); }
    shards() { return this.get('/api/game/shards/info'); }
    terrain(room) { return this.get('/api/game/room-terrain', this.shardQ({ room, encoded: 1 })); }
    mapStats(rooms, statName = 'owner0') { return this.post('/api/game/map-stats', this.shardQ({ rooms, statName })); }
    worldStatus() { return this.get('/api/user/world-status'); }
    startRoom() { return this.get('/api/user/world-start-room', this.shardQ({})); }
    respawn() { return this.post('/api/user/respawn', {}); }
    placeSpawn(room, x, y, name) { return this.post('/api/game/place-spawn', this.shardQ({ room, x, y, name })); }
    createConstruction(room, x, y, structureType, name) { return this.post('/api/game/create-construction', this.shardQ({ room, x, y, structureType, name })); }
    createFlag(room, x, y, name, color, secondaryColor) { return this.post('/api/game/create-flag', this.shardQ({ room, x, y, name, color, secondaryColor })); }
    removeFlag(room, name) { return this.post('/api/game/remove-flag', this.shardQ({ room, name })); }
    intent(room, _id, name, intent) { return this.post('/api/game/add-object-intent', this.shardQ({ _id, room, name, intent })); }
    suicide(room, id) { return this.intent(room, id, 'suicide', {}); }
    destroyStructure(room, id) { return this.intent(room, 'room', 'destroyStructure', [{ id, roomName: room }]); }
    removeSite(room, id) { return this.intent(room, 'room', 'removeConstructionSite', [{ id, roomName: room }]); }

    // ---- 代码 ----
    branches() { return this.get('/api/user/branches'); }
    codeGet(branch) { return this.get('/api/user/code', { branch }); }
    codeSet(branch, modules) { return this.post('/api/user/code', { branch, modules, _hash: Date.now() }); }
    setActiveBranch(branch) { return this.post('/api/user/set-active-branch', { branch, activeName: 'activeWorld' }); }
    cloneBranch(branch, newName) { return this.post('/api/user/clone-branch', { branch, newName }); }
    console(expression) { return this.post('/api/user/console', this.shardQ({ expression })); }
    memory(path) { return this.get('/api/user/memory', this.shardQ({ path: path || '' })); }

    // ---- WebSocket（SockJS 原始 websocket 端点）----
    wsUrl() { const b = this.base().replace(/^http/, 'ws'); const sid = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-5]/g, 'a').padEnd(8, 'a'); return `${b}/socket/${Math.floor(Math.random() * 1000)}/${sid}/websocket`; }
    connect() {
      this._closed = false; if (!this.WS) throw new ApiError('当前环境不支持 WebSocket');
      return new Promise((res, rej) => {
        let ws; try { ws = this.sock = new this.WS(this.wsUrl()); } catch (e) { return rej(new ApiError('实时连接失败')); }
        let authed = false; const st = s => this.onStatus && this.onStatus(s);
        const done = (ok, e) => { if (ok) { if (!authed) { authed = true; this._retry = 0; st('已连接'); res(); } } else if (!authed) rej(e); };
        ws.onmessage = ev => { const d = typeof ev.data === 'string' ? ev.data : String(ev.data); this._frame(d, done); };
        ws.onclose = () => { this.sock = null; st('连接断开'); if (!authed) done(false, new ApiError('实时连接被服务器关闭')); if (!this._closed) this._reconnect(); };
        ws.onerror = () => { st('连接出错'); };
      });
    }
    _frame(d, done) {
      const t = d[0];
      if (t === 'o') { this._send('auth ' + this.token); return; }
      if (t === 'h' || t === 'c') return;
      let msgs = []; try { msgs = t === 'a' ? JSON.parse(d.slice(1)) : t === 'm' ? [JSON.parse(d.slice(1))] : [d]; } catch (e) { return; }
      for (const m of msgs) this._msg(m, done);
    }
    _msg(m, done) {
      if (typeof m !== 'string') return;
      if (m.startsWith('auth ok')) { const nt = m.slice(8).trim(); if (nt && !this.official) this.token = nt; done && done(true); for (const ch of this.subs.keys()) this._send('subscribe ' + ch); return; }
      if (m.startsWith('auth failed')) { done && done(false, new ApiError('实时连接登录失败，请重新登录', 401)); this.close(); return; }
      if (m.startsWith('time ') || m.startsWith('protocol ') || m.startsWith('package ')) return;
      let j; try { j = JSON.parse(m); } catch (e) { return; }
      if (!Array.isArray(j)) return; let [ch, data] = j, err = false;
      if (ch.startsWith('err@')) { ch = ch.slice(4); err = true; }
      const cbs = this.subs.get(ch); if (cbs) for (const cb of cbs) try { cb(data, ch, err); } catch (e) { console.error(e); }
    }
    _send(s) { try { this.sock && this.sock.readyState === 1 && this.sock.send(JSON.stringify([s])); } catch (e) {} }
    _reconnect() { const ms = Math.min(30000, 1000 * Math.pow(2, this._retry++)); this.onStatus && this.onStatus(`${Math.round(ms / 1000)} 秒后重连…`); clearTimeout(this._rt); this._rt = setTimeout(() => { if (!this._closed) this.connect().catch(() => {}); }, ms); }
    subscribe(ch, cb) { let s = this.subs.get(ch); if (!s) { s = new Set(); this.subs.set(ch, s); this._send('subscribe ' + ch); } s.add(cb); return () => this.unsubscribe(ch, cb); }
    unsubscribe(ch, cb) { const s = this.subs.get(ch); if (!s) return; if (cb) s.delete(cb); if (!cb || !s.size) { this.subs.delete(ch); this._send('unsubscribe ' + ch); } }
    roomChannel(room) { return 'room:' + (this.official && this.cfg.shard ? this.cfg.shard + '/' : '') + room; }
    mapChannel(room) { return 'roomMap2:' + (this.official && this.cfg.shard ? this.cfg.shard + '/' : '') + room; }
    close() { this._closed = true; clearTimeout(this._rt); try { this.sock && this.sock.close(); } catch (e) {} this.sock = null; }
  }
  // 房间订阅的增量合并：首包全量，之后只发变化字段；值为 null 表示删除
  function mergeDelta(dst, src) {
    for (const k in src) { const v = src[k];
      if (v === null) delete dst[k];
      else if (typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) mergeDelta(dst[k], v);
      else dst[k] = v; }
    return dst;
  }
  // 官方地形编码：每格一个字符 0 平原 1 墙 2 沼泽 3 墙（墙+沼泽按墙算）
  function decodeTerrain(s) { const out = new Array(2500); for (let i = 0; i < 2500; i++) { const c = +s.charAt(i) || 0; out[i] = c & 1 ? 1 : c & 2 ? 2 : 0; } return out; }
  const api = { ScreepsApi, ApiError, mergeDelta, decodeTerrain, zhErr, OFFICIAL_LIMITS };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
