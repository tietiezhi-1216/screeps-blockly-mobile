// 世界地图数据层（选择出生房间 / 游戏内世界地图共用），按官方客户端的做法按需加载「看得见的房间」：
//  · 地形：官方服务器用官方地图 CDN 的房间缩略图（和官方地图同一套图，不占 API 限额），失败再退回
//    GET /api/game/room-terrain?encoded=1（每小时 360 次，本地永久缓存）；私服直接用 room-terrain（不限额）。
//  · 房间状态 / 归属 / 新手区 / 重生区：POST /api/game/map-stats {rooms, statName:'owner0', shard}
//    （官方每小时 60 次：合批、去抖、留余量，结果本地缓存 15 分钟）。
//  · 资源与对象标记：订阅 roomMap2:[shard/]房间名（能量源 s、矿物 m、Controller c、Keeper 巢穴 k、传送门 p、
//    矿床 d、道路 r、墙 w、以及每个玩家自己的对象 <userId>），只订阅视野内的房间，移出视野就退订。
// 全部用真实房间名做键，与游戏窗口（WORLD_O / S）无关：官方大世界里可以一直拖到别的扇区。
(function (root) {
  const G = typeof module !== 'undefined' ? require('./geo.js') : root;
  const { decodeTerrain } = typeof module !== 'undefined' ? require('./screeps-api.js') : root;
  const CDN = 'https://d3os7yery2usni.cloudfront.net/map/'; // 官方客户端世界地图用的房间缩略图（150×150 PNG）
  const STAT_TTL = 15 * 60e3, STAT_KEEP = 12, TERR_KEEP = 60, ALL_KEEP = 40, MAX_SUBS = { official: 49, private: 100 };
  class WorldMap {
    constructor(sess, deps = {}) {
      this.s = sess; this.api = sess.api; this.store = deps.storage || sess.storage || null;
      this.Img = deps.Image !== undefined ? deps.Image : (typeof Image !== 'undefined' ? Image : null);
      this.now = deps.now || (() => Date.now()); this.setT = deps.setTimeout || setTimeout.bind(root); this.clearT = deps.clearTimeout || clearTimeout.bind(root);
      this.stats = new Map(); this.ter = new Map(); this.objs = new Map(); this.subs = new Map();
      this.want = []; this.wantObj = false; this.onChange = null; this._stT = null; this._stBusy = false; this._stLast = 0; this._tq = []; this._tBusy = 0; this._tLast = 0; this._subT = null;
      this.minGap = deps.minGap != null ? deps.minGap : (this.official ? 8000 : 0); this.debounce = deps.debounce != null ? deps.debounce : 400; this.terrGap = deps.terrGap != null ? deps.terrGap : 1500;
      this._loadStatCache();
    }
    get official() { return !!(this.s.official); }
    get shard() { return this.s.cfg && this.s.cfg.shard || ''; }
    // 世界范围（真实坐标）：官方按 world-size 居中；私服 = 会话窗口（已按真实存在的房间收紧）
    bounds() {
      if (this.official && this.s.worldW) { const h = Math.floor(this.s.worldW / 2); return { x0: -h, y0: -h, x1: h - 1, y1: h - 1 }; }
      const O = G.WORLD_O; return { x0: O.x, y0: O.y, x1: O.x + this.s.S - 1, y1: O.y + this.s.S - 1 };
    }
    inBounds(X, Y) { const b = this.bounds(); return X >= b.x0 && Y >= b.y0 && X <= b.x1 && Y <= b.y1; }
    _k(n) { return this.s.kOf ? this.s.kOf(n) : null; }
    _inWin(n) { const k = this._k(n); return k && this.s.inWorld(k) ? k : null; }
    // ---- 房间状态（map-stats）----
    stat(n) { // undefined = 还没拿到；null = 服务器说没有这个房间；否则为 map-stats 条目
      const k = this._inWin(n); if (k && k in (this.s.mapInfo || {})) return this.s.mapInfo[k];
      const e = this.stats.get(n); return e ? e.s : undefined;
    }
    user(id) { return (this.s.users && this.s.users[id]) || null; }
    _loadStatCache() { if (!this.official || !this.store) return; try { const j = JSON.parse(this.store.getItem(this._sk()) || '{}'), t = this.now();
      for (const n in j.r || {}) if (t - j.r[n][0] < STAT_TTL) this.stats.set(n, { at: j.r[n][0], s: j.r[n][1] }); Object.assign(this.s.users = this.s.users || {}, j.u || {}); } catch (e) {} }
    _saveStatCache() { if (!this.official || !this.store) return; try { const r = {}, u = {}, t = this.now(), L = [...this.stats].filter(([, e]) => t - e.at < STAT_TTL).slice(-3000);
      for (const [n, e] of L) { r[n] = [e.at, e.s]; const o = e.s && e.s.own && e.s.own.user; if (o && this.s.users[o]) u[o] = this.s.users[o]; } this.store.setItem(this._sk(), JSON.stringify({ r, u })); } catch (e) {} }
    _sk() { return 'sbm_wmst_' + this.shard; }
    _needStat(n) { if (this._inWin(n)) return false; const e = this.stats.get(n); return !e || this.now() - e.at > STAT_TTL; }
    _schedStats() { if (this._stT) return; this._stT = this.setT(() => { this._stT = null; this._flushStats().catch(() => {}); }, this.debounce); }
    async _flushStats() {
      if (this._stBusy) return this._schedStats(); const wait = this._stLast + this.minGap - this.now(); if (wait > 0) { this._stT = this.setT(() => { this._stT = null; this._flushStats().catch(() => {}); }, wait); return; }
      const names = this.want.filter(n => this._needStat(n)); if (!names.length) return;
      if (this.official && (this.api.rateLeft('POST /api/game/map-stats') <= STAT_KEEP || this.api.rateLeft('*') <= 20)) { this.limited = true; this._emit(); return; } // 留给游戏本身刷新地图
      this._stBusy = true; this._stLast = this.now();
      try { for (let i = 0; i < names.length; i += 400) { const part = names.slice(i, i + 400), r = await this.api.mapStats(part); const t = this.now();
          Object.assign(this.s.users = this.s.users || {}, r.users || {}); for (const n of part) this.stats.set(n, { at: t, s: (r.stats && r.stats[n]) || null }); }
        this._saveStatCache(); this._emit(); }
      catch (e) { this.err = e; this._stLast = this.now() + 30e3; } finally { this._stBusy = false; }
    }
    // ---- 地形 ----
    terrain(n) { // { img } | { tiles } | null
      const k = this._inWin(n); if (k && this.s.rooms && this.s.rooms[k] && this.s.rooms[k].tiles) return { tiles: this.s.rooms[k].tiles };
      const e = this.ter.get(n); return e && (e.img || e.tiles) ? e : null;
    }
    _tck(n) { return 'sbm_terr_' + (this.official ? this.shard : this.api.base()) + '_' + n; } // 与会话的地形缓存同一个键
    _needTer(n) { if (this.terrain(n)) return false; const e = this.ter.get(n); return !e || !!e.idle; }
    _queueTerrain(n) {
      let s = null; try { s = this.store && this.store.getItem(this._tck(n)); } catch (e) {}
      if (s) { this.ter.set(n, { tiles: decodeTerrain(s) }); return true; }
      const e0 = this.ter.get(n); if (e0 && e0.cdnFail) { this.ter.set(n, { pend: 1, cdnFail: 1 }); this._tq.push(n); this._pump(); return false; } // CDN 已失败过：直接走 API
      if (this.official && this.Img) { this.ter.set(n, { pend: 1 }); const im = new this.Img(); im.decoding = 'async';
        im.onload = () => { this.ter.set(n, { img: im }); this._emit(); };
        const url = CDN + encodeURIComponent(this.shard || 'shard0') + '/' + n + '.png'; let tries = 0;
        im.onerror = () => { if (++tries < 2) return this.setT(() => { im.src = url + '?r=1'; }, 800 + Math.random() * 800); // 网络抖动：先重试一次
          this.ter.set(n, { pend: 1, cdnFail: 1 }); this._tq.push(n); this._pump(); };
        im.src = url; return false; }
      this.ter.set(n, { pend: 1 }); this._tq.push(n); this._pump(); return false;
    }
    _pump() {
      while (this._tBusy < (this.official ? 2 : 6) && this._tq.length) {
        const vis = new Set(this.want), i = this._tq.findIndex(n => vis.has(n)); const n = this._tq.splice(i < 0 ? 0 : i, 1)[0];
        const idle = () => this.ter.set(n, Object.assign({ idle: 1 }, this.ter.get(n) && this.ter.get(n).cdnFail ? { cdnFail: 1 } : {}));
        if (!vis.has(n)) { idle(); continue; } // 已经移出视野，下次看到再加载
        if (this.official && (this.api.rateLeft('GET /api/game/room-terrain') <= TERR_KEEP || this.api.rateLeft('*') <= ALL_KEEP)) { idle(); this.limited = true; continue; } // 限额不够：先空着，下次再看
        if (this.official) { const w = this._tLast + this.terrGap - this.now(); if (w > 0) { this._tq.unshift(n); if (!this._tW) this._tW = this.setT(() => { this._tW = null; this._pump(); }, w); return; } this._tLast = this.now(); } // 官方：退回 API 时每 1.5 秒最多 1 间（每分钟总限额 120）
        this._tBusy++;
        this.api.terrain(n).then(r => { const s = r.terrain && r.terrain[0] && r.terrain[0].terrain; if (!s) { this.ter.set(n, { fail: 1 }); return; }
          if (this.official) try { this.store && this.store.setItem(this._tck(n), s); } catch (e) {}
          this.ter.set(n, { tiles: decodeTerrain(s) }); this._emit(); }).catch(() => this.ter.set(n, { fail: 1 })).finally(() => { this._tBusy--; this._pump(); });
      }
    }
    // ---- 房间对象（roomMap2）----
    objects(n) { return this.objs.get(n) || null; }
    _syncSubs() {
      const max = MAX_SUBS[this.official ? 'official' : 'private'], want = new Set(this.wantObj ? this.want.filter(n => { const s = this.stat(n); return s !== null; }).slice(0, max) : []);
      for (const [n, off] of this.subs) if (!want.has(n)) { off(); this.subs.delete(n); }
      for (const n of want) if (!this.subs.has(n)) this.subs.set(n, this.api.subscribe(this.api.mapChannel(n), (d, ch, err) => { if (err || !d) return; this.objs.set(n, d); this._emit(); }));
    }
    // ---- 入口：告诉数据层现在看得见哪些房间（中心优先）；objects=是否放大到能看清标记 ----
    view(names, objects) {
      this.want = names.filter(n => { const p = G.parseRealName(n); return p && this.inBounds(p[0], p[1]); }); this.wantObj = !!objects;
      let any = false; for (const n of this.want) if (this._needTer(n)) any = this._queueTerrain(n) || any; if (any) this._emit();
      if (this.want.some(n => this._needStat(n))) this._schedStats();
      if (this._subT) this.clearT(this._subT); this._subT = this.setT(() => { this._subT = null; this._syncSubs(); }, this.debounce);
    }
    close() { if (this._tW) this.clearT(this._tW); this._tW = null; this._tq = []; this.want = []; this.wantObj = false; if (this._subT) this.clearT(this._subT); this._subT = null; for (const off of this.subs.values()) off(); this.subs.clear(); }
    _emit() { if (this._eP) return; this._eP = true; this.setT(() => { this._eP = false; this.onChange && this.onChange(); }, 16); }
    // 房间对玩家的状态（地图上能否选择、选中时的说明）
    status(n, me) {
      const p = G.parseRealName(n); if (!p || !this.inBounds(p[0], p[1])) return 'out';
      const s = this.stat(n); if (s === null) return 'out'; if (s && s.status && s.status !== 'normal') return 'out';
      const a = (p[0] < 0 ? -p[0] - 1 : p[0]) % 10, b = (p[1] < 0 ? -p[1] - 1 : p[1]) % 10;
      if (a === 0 || b === 0) return 'highway'; if (a === 5 && b === 5) return 'center'; if (a >= 4 && a <= 6 && b >= 4 && b <= 6) return 'keeper';
      const o = s && s.own && s.own.user ? String(s.own.user) : null;
      if (o) return o === me ? 'mine' : (s.own.level > 0 ? 'owned' : 'reserved');
      if (s === undefined && this.official) return 'unknown';
      return 'free';
    }
    zone(n) { const s = this.stat(n), t = this.now(); if (!s) return null; if (s.novice && s.novice > t) return 'novice'; if (s.respawnArea && s.respawnArea > t) return 'respawn'; return null; }
  }
  // 地图上的视野：给定中心房间（真实坐标）和每个房间的像素尺寸，算出看得见的房间名（中心优先）
  function visibleRooms(geo, w, h, margin = 1) {
    const L = [], X0 = Math.floor(-geo.ox / geo.cs) - margin, Y0 = Math.floor(-geo.oy / geo.cs) - margin, X1 = Math.floor((w - geo.ox) / geo.cs) + margin, Y1 = Math.floor((h - geo.oy) / geo.cs) + margin;
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) L.push([X, Y, (X - cx) ** 2 + (Y - cy) ** 2]);
    return L.sort((a, b) => a[2] - b[2]).map(([X, Y]) => G.nameOfReal(X, Y));
  }
  const api = { WorldMap, visibleRooms, WM_CDN: CDN };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
