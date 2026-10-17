// 在线会话：连接官方私服或官方服务器，把服务器的房间对象换成渲染器使用的快照格式。
// 游戏规则全部由服务器上的官方引擎执行；手机只负责显示、上传代码和发送手动操作。
(function (root) {
  const G = typeof module !== 'undefined' ? require('./geo.js') : root;
  const { ScreepsApi, ApiError, mergeDelta, decodeTerrain } = typeof module !== 'undefined' ? require('./screeps-api.js') : root;
  const NPC = { 2: '__invader', 3: '__keeper' };
  const uid = u => (u == null ? null : NPC[u] || String(u));
  const colorOf = id => { if (id === '__invader' || id === '__keeper') return 0xe0302f; const h = G.hash32(...String(id).split('').map(c => c.charCodeAt(0))); const hue = h % 360, s = .55, l = .58, f = n => { const k = (n + hue / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return (f(0) << 16) | (f(8) << 8) | f(4); };
  const STRUCT = new Set(['extension', 'road', 'constructedWall', 'rampart', 'link', 'storage', 'tower', 'observer', 'powerSpawn', 'extractor', 'lab', 'terminal', 'container', 'nuker', 'factory', 'keeperLair', 'invaderCore', 'powerBank', 'portal']);
  const storeOf = o => o.store || (o.energy != null ? { energy: o.energy } : {});
  const capOf = (o, r) => { const c = o.storeCapacityResource; if (c && c[r || 'energy'] != null) return c[r || 'energy']; if (o.storeCapacity != null) return o.storeCapacity; return o.energyCapacity; };
  const EV = { harvest: 'harvest', build: 'build', repair: 'repair', upgradeController: 'upgrade', transferEnergy: 'transfer', attack: 'attack', rangedAttack: 'attack', heal: 'heal', rangedHeal: 'heal' };

  const FACE = new Set(['dismantle', 'attackController', 'reserveController', 'claimController', 'pickup', 'withdraw', 'transfer']);
  class OnlineSession {
    constructor(cfg, deps = {}) {
      this.cfg = cfg; this.api = new ScreepsApi(cfg, deps); this.storage = deps.storage || null;
      this.rooms = {}; this.roomObjs = {}; this.roomUsers = {}; this.roomFlags = {}; this.roomVis = {}; this.mapInfo = {}; this.users = {};
      this.time = 0; this.S = 0; this.roomsVer = 0; this.watched = new Map(); this.view = null; this.me = null; this.needsSpawn = false;
      this.onTick = null; this.onLog = null; this.onStatus = null; this.onCpu = null; this._vT = 0;
    }
    get official() { return this.cfg.kind === 'official'; }
    kOf(name) { const p = G.parseRoomName(name); return p ? p[0] + ',' + p[1] : null; }
    nameOf(k) { const [rx, ry] = k.split(',').map(Number); return G.roomNameXY(rx, ry); }
    inWorld(k) { const [rx, ry] = k.split(',').map(Number); return rx >= 0 && ry >= 0 && rx < this.S && ry < this.S; }

    async start() {
      const st = s => this.onStatus && this.onStatus(s);
      st('连接服务器…'); await this.api.version();
      st('登录…'); this.me = await this.api.login(); this.users[this.me._id] = { username: this.me.username, badge: this.me.badge };
      const ws = await this.api.worldSize(), W = ws.width || 0; this.worldW = W;
      const ws2 = await this.api.worldStatus(); this.needsSpawn = ws2.status !== 'normal';
      // 我的房间：决定显示窗口（私服小世界显示全部；官方大世界只显示我周围 11×11）
      let home = null; try { const r = await this.api.get('/api/user/rooms', { id: this.me._id }); const L = r.shards ? (r.shards[this.cfg.shard] || []) : (r.rooms || []); home = L[0] || null; } catch (e) {}
      if (!home) try { const r = await this.api.startRoom(); home = (r.room || [])[0] || null; if (home && home.includes('/')) home = home.split('/')[1]; } catch (e) {}
      if (!this.official && W > 0 && W <= 40) { G.WORLD_O.x = -W / 2; G.WORLD_O.y = -W / 2; this.S = W; }
      else { const p = G.parseRealName(home || 'W5N5') || [-6, -6], R = 5; G.WORLD_O.x = p[0] - R; G.WORLD_O.y = p[1] - R; this.S = 2 * R + 1; }
      this.home = home;
      st('读取地图…'); await this.refreshMap();
      // 私服：world-size 是整块坐标范围，实际生成的房间常常只占一角；按真实存在的房间收紧窗口
      if (!this.official) { const ks = this.allNames().filter(k => this.mapInfo[k]); if (ks.length) { const P = ks.map(k => k.split(',').map(Number)), x0 = Math.min(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), n = Math.max(Math.max(...P.map(p => p[0])) - x0, Math.max(...P.map(p => p[1])) - y0) + 1;
        if (n < this.S) { G.WORLD_O.x += x0; G.WORLD_O.y += y0; this.S = n; this.mapInfo = {}; await this.refreshMap(); } } }
      if (!this.official) { st('读取地形…'); await this.loadAllTerrain(); }
      else if (home) await this.ensureTerrain(this.kOf(home), true);
      try { const t = await this.api.time(); this.time = t.time; } catch (e) {}
      st('建立实时连接…'); this.api.onStatus = s => this.onStatus && this.onStatus(s);
      await this.api.connect();
      this.api.subscribe(`user:${this.me._id}/console`, d => this._console(d));
      this.api.subscribe(`user:${this.me._id}/cpu`, d => this.onCpu && this.onCpu(d));
      this._mapT = setInterval(() => this.refreshMap().catch(() => {}), this.official ? 5 * 60000 : 20000);
      this.buildView(); st('已连接');
      return this;
    }
    stop() { clearInterval(this._mapT); clearTimeout(this._etT); this._etT = null; this._etq = []; this.api.close(); }
    // 官方大世界：世界地图上选了游戏窗口（11×11）以外的房间 → 窗口挪到以它为中心（地图状态、地形、订阅全部重来）
    needsRecenter(name) { const k = this.kOf(name); if (!k || !this.official) return false; const [rx, ry] = k.split(',').map(Number); return rx < 1 || ry < 1 || rx > this.S - 2 || ry > this.S - 2; }
    async recenter(name) {
      const p = G.parseRealName(name); if (!p) return; const R = (this.S - 1) / 2;
      this.watch([]); G.WORLD_O.x = p[0] - R; G.WORLD_O.y = p[1] - R;
      this.rooms = {}; this.roomObjs = {}; this.roomFlags = {}; this.roomVis = {}; this.mapInfo = {}; this._pos = {}; this.roomsVer++;
      await this.refreshMap(); await this.ensureTerrain(this.kOf(name), true).catch(e => this._err(e)); this.buildView();
    }
    allNames() { const L = []; for (let ry = 0; ry < this.S; ry++) for (let rx = 0; rx < this.S; rx++) L.push(rx + ',' + ry); return L; }
    async refreshMap() {
      const ks = this.allNames(), names = ks.map(k => this.nameOf(k)), res = {};
      for (let i = 0; i < names.length; i += 400) { const r = await this.api.mapStats(names.slice(i, i + 400)); Object.assign(res, r.stats || {}); Object.assign(this.users, r.users || {}); if (r.gameTime) this.time = Math.max(this.time, r.gameTime); }
      const stat = {}; for (const k of ks) { const s = res[this.nameOf(k)]; this.mapInfo[k] = s || null; stat[k] = s ? s.status : 'out of borders'; }
      G.setRoomStatus(stat);
      this._statusMap = stat; this.roomsVer++; this.buildView();
    }
    async loadAllTerrain() { const ks = this.allNames().filter(k => this.mapInfo[k]); for (let i = 0; i < ks.length; i += 12) await Promise.all(ks.slice(i, i + 12).map(k => this.ensureTerrain(k).catch(() => {}))); }
    // 官方：地形接口每小时 360 次、全部接口每分钟 120 次。游戏画面缩小时会一下子要很多房间的地形 →
    // 非急需的（onNeedRoom）排队，每 3 秒最多 1 间、只保留最近 24 个请求、限额紧张时不再取；急需的（家、选中、订阅的房间）直接取。
    ensureTerrain(k, urgent) {
      if (!this.official || urgent || !k || this.rooms[k]) return this._terrain(k);
      const q = this._etq = this._etq || []; if (!q.includes(k)) { q.push(k); if (q.length > 24) q.shift(); }
      if (!this._etT) { const pump = () => { this._etT = null; const k2 = q.pop(); if (!k2) return;
          if (this.api.rateLeft('GET /api/game/room-terrain') > 60 && this.api.rateLeft('*') > 40) this._terrain(k2).catch(() => {});
          if (q.length) this._etT = setTimeout(pump, 3000); };
        this._etT = setTimeout(pump, 0); }
      return Promise.resolve();
    }
    async _terrain(k) {
      if (!k || this.rooms[k] || !this.inWorld(k)) return; const n = this.nameOf(k), ck = 'sbm_terr_' + (this.official ? (this.cfg.shard || '') : this.api.base()) + '_' + n;
      let s = null; try { s = this.storage && this.storage.getItem(ck); } catch (e) {}
      if (!s) { if (this._tPend && this._tPend.has(k)) return; (this._tPend = this._tPend || new Set()).add(k);
        try { const r = await this.api.terrain(n); s = r.terrain && r.terrain[0] && r.terrain[0].terrain; } finally { this._tPend.delete(k); }
        if (s && this.official) try { this.storage && this.storage.setItem(ck, s); } catch (e) {} }
      if (!s) return; this.rooms[k] = { tiles: decodeTerrain(s), name: n, owner: null, type: G.roomType(...k.split(',').map(Number)) }; this.roomsVer++; this._dirty();
    }
    // 订阅可见房间（官方客户端：只看当前所在房间的实时对象）
    watch(keys) {
      const want = new Set(keys.filter(k => k && this.inWorld(k)).slice(0, this.official ? 3 : 9));
      for (const [k, off] of this.watched) if (!want.has(k)) { off(); this.watched.delete(k); delete this.roomObjs[k]; delete this.roomVis[k]; this._dirty(); }
      for (const k of want) if (!this.watched.has(k)) { this.ensureTerrain(k, true).catch(e => this._err(e)); const n = this.nameOf(k);
        this.roomObjs[k] = {}; this.watched.set(k, this.api.subscribe(this.api.roomChannel(n), (d, ch, err) => { if (!err) this._room(k, d); })); }
    }
    _room(k, d) {
      if (!this.watched.has(k)) return;
      if (d.objects) mergeDelta(this.roomObjs[k], d.objects);
      if (d.users) Object.assign(this.users, d.users);
      if (d.gameTime) this.time = Math.max(this.time, d.gameTime);
      if (d.flags !== undefined) this.roomFlags[k] = d.flags;
      this.roomVis[k] = d.visual || ''; this._dirty();
    }
    _console(d) {
      if (!this.onLog) return; const m = d.messages || {};
      const T = s => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      for (const s of m.log || []) this.onLog(T(s), '');
      for (const s of m.results || []) this.onLog(T(s), 'res');
      if (d.error) this.onLog(T(d.error), 'err');
    }
    _err(e) { this.onLog && this.onLog('[错误] ' + (e && e.message || e), 'err'); }
    _dirty() { if (this._vP) return; this._vP = true; setTimeout(() => { this._vP = false; this.buildView(); }, 30); }

    buildView() {
      const me = this.me ? this.me._id : null, T = this.time, v = { time: T, S: this.S, roomsVer: this.roomsVer, rooms: this.rooms, players: {}, owned: {}, online: true,
        sources: [], minerals: [], controllers: [], spawns: [], creeps: [], sites: [], structures: [], resources: [], tombstones: [], ruins: [], flags: [], nukes: [], deposits: [], events: [], visuals: {}, vis: [...this.watched.keys()] };
      const P = id => { if (!id || v.players[id]) return; const u = this.users[id === '__invader' ? 2 : id === '__keeper' ? 3 : id] || {};
        v.players[id] = { name: id === '__invader' ? 'Invader' : id === '__keeper' ? 'Source Keeper' : (u.username || id), color: colorOf(id), badge: u.badge || null, needsSpawn: id === me ? this.needsSpawn : false, gcl: u.gcl || 0 }; };
      if (me) P(me);
      for (const k in this.mapInfo) { const s = this.mapInfo[k]; if (s && s.own && s.own.user) { const o = uid(s.own.user); v.owned[k] = o; P(o); if (this.rooms[k]) this.rooms[k].owner = o; } }
      for (const k in this.roomObjs) {
        const [rx, ry] = k.split(',').map(Number), ox = rx * 50, oy = ry * 50, objs = this.roomObjs[k];
        for (const id in objs) { const o = objs[id]; if (!o || o.x == null) continue; const x = ox + o.x, y = oy + o.y, owner = uid(o.user); if (owner) P(owner);
          switch (o.type) {
            case 'source': v.sources.push({ id, x, y, energy: o.energy, cap: o.energyCapacity || 3000, ticksToRegeneration: o.nextRegenerationTime ? o.nextRegenerationTime - T : undefined }); break;
            case 'mineral': v.minerals.push({ id, x, y, type: o.mineralType, amount: o.mineralAmount, density: o.density }); break;
            case 'controller': v.controllers.push({ id, x, y, owner, level: o.level || 0, progress: o.progress || 0, progressTotal: (typeof SC !== 'undefined' && SC.CONTROLLER_LEVELS[o.level]) || 0, ticksToDowngrade: o.downgradeTime ? o.downgradeTime - T : 0,
              safeMode: o.safeMode > T ? o.safeMode - T : 0, safeModeAvailable: o.safeModeAvailable, reservation: o.reservation ? { owner: uid(o.reservation.user), username: uid(o.reservation.user), ticksToEnd: o.reservation.endTime - T } : null }); break;
            case 'spawn': v.spawns.push({ id, name: o.name, owner, x, y, energy: storeOf(o).energy || 0, cap: capOf(o) || 300, hits: o.hits, hitsMax: o.hitsMax,
              spawning: o.spawning && { name: o.spawning.name, left: o.spawning.spawnTime - T, total: o.spawning.needTime } }); break;
            case 'creep': case 'powerCreep': { if (o.spawning) break; const body = (o.body || []).map(b => b.type || b), st = storeOf(o); let face, ev = [];
              for (const a in o.actionLog || {}) { const t = o.actionLog[a]; if (t && t.x != null && (EV[a] || FACE.has(a))) { face = face || [ox + t.x, oy + t.y]; if (EV[a]) ev.push({ t: EV[a], fx: x, fy: y, x: ox + t.x, y: oy + t.y }); } }
              v.events.push(...ev);
              const prev = this._pos && this._pos[id];
              v.creeps.push({ id, owner, name: o.name, body, x, y, px: prev ? prev[0] : x, py: prev ? prev[1] : y, energy: Object.values(st).reduce((a, b) => a + (b || 0), 0), ttl: o.ageTime ? o.ageTime - T : o.ticksToLive, hits: o.hits, hitsMax: o.hitsMax, fatigue: o.fatigue,
                store: Object.assign({}, st), cap: capOf(o) ?? body.filter(b => b === 'carry').length * 50, face, say: o.actionLog && o.actionLog.say ? o.actionLog.say.message : undefined, pc: o.type === 'powerCreep' }); break; }
            case 'constructionSite': v.sites.push({ id, owner, x, y, type: o.structureType, progress: o.progress || 0, total: o.progressTotal }); break;
            case 'energy': case 'resource': { const rt = o.resourceType || 'energy'; v.resources.push({ id, x, y, resourceType: rt, amount: o[rt] ?? o.amount ?? o.energy ?? 0 }); break; }
            case 'tombstone': v.tombstones.push({ id, x, y, owner, creepName: o.creepName, energy: storeOf(o).energy || 0, decay: o.decayTime - T, store: Object.assign({}, storeOf(o)) }); break;
            case 'ruin': v.ruins.push({ id, x, y, owner, structureType: o.structure && o.structure.type, destroyTime: o.destroyTime, decay: o.decayTime - T, store: Object.assign({}, storeOf(o)) }); break;
            case 'nuke': v.nukes.push({ id, x, y, timeToLand: o.landTime - T, launchRoomName: o.launchRoomName }); break;
            case 'deposit': v.deposits.push({ id, x, y, depositType: o.depositType, cooldown: o.cooldownTime > T ? o.cooldownTime - T : 0 }); break;
            default: if (STRUCT.has(o.type)) { const st = storeOf(o), ec = capOf(o, 'energy');
              v.structures.push({ id, type: o.type, owner, x, y, hits: o.hits, hitsMax: o.hitsMax, energy: o.store || o.energy != null ? (st.energy || 0) : undefined, energyCapacity: ec, store: Object.assign({}, st),
                ticksToSpawn: o.type === 'keeperLair' && o.nextSpawnTime ? o.nextSpawnTime - T : undefined, deploy: o.type === 'invaderCore' && o.deployTime ? o.deployTime - T : undefined, ticksToDecay: o.decayTime ? o.decayTime - T : undefined, isPublic: o.isPublic }); }
          } }
        // 旗帜（只有自己的）："name~color~secondaryColor~x~y|..."
        const fs = this.roomFlags[k]; if (typeof fs === 'string' && fs) for (const f of fs.split('|')) { const [name, c1, c2, fx, fy] = f.split('~'); if (!name) continue; v.flags.push({ id: 'flag:' + this.nameOf(k) + ':' + name, name, owner: me, color: +c1, secondaryColor: +c2, x: ox + +fx, y: oy + +fy, room: this.nameOf(k) }); }
        // RoomVisual：服务器发来每行一个 JSON
        const vs = this.roomVis[k]; if (vs && me) { const L = []; for (const ln of String(vs).split('\n')) { if (!ln) continue; try { L.push(JSON.parse(ln)); } catch (e) {} } if (L.length) (v.visuals[me] = v.visuals[me] || {})[this.nameOf(k)] = L; }
      }
      this._pos = Object.fromEntries(v.creeps.map(c => [c.id, [c.x, c.y]]));
      if (this._lastT !== T) { this._lastT = T; this.view = v; } else { for (const c of v.creeps) { const o = this.view && this.view.creeps.find(z => z.id === c.id); if (o) { c.px = o.px; c.py = o.py; } } this.view = v; }
      this.onTick && this.onTick(v);
    }
    // ---- 手动操作（官方客户端同款接口） ----
    loc(x, y) { const k = G.roomKey(x, y); return { room: this.nameOf(k), x: x % 50, y: y % 50 }; }
    async placeSpawn(x, y, name) { const l = this.loc(x, y); await this.api.placeSpawn(l.room, l.x, l.y, name || 'Spawn1'); this.needsSpawn = false; await this.refreshMap(); }
    async build(x, y, type, name) { const l = this.loc(x, y); return this.api.createConstruction(l.room, l.x, l.y, type, type === 'spawn' ? (name || 'Spawn' + Math.floor(Math.random() * 1000)) : undefined); }
    async flag(x, y, name, c1, c2) { const l = this.loc(x, y); return this.api.createFlag(l.room, l.x, l.y, name, c1, c2); }
    async removeFlag(f) { return this.api.removeFlag(f.room, f.name); }
    async act(kind, o) { const l = this.loc(o.x, o.y); if (kind === 'suicide') return this.api.suicide(l.room, o.id); if (kind === 'destroy') return this.api.destroyStructure(l.room, o.id); if (kind === 'remove') return this.api.removeSite(l.room, o.id); throw new ApiError('不支持的操作'); }
    async respawn() { await this.api.respawn(); this.needsSpawn = true; await this.refreshMap(); }
    async uploadCode(main, modules) {
      let br = 'default'; try { const b = await this.api.branches(); const a = (b.list || []).find(x => x.activeWorld); if (a) br = a.branch; } catch (e) {}
      const mods = Object.assign({}, modules || {}, { main }); await this.api.codeSet(br, mods); return br;
    }
    runConsole(expr) { return this.api.console(expr); }
  }
  const out = { OnlineSession, colorOf };
  if (typeof module !== 'undefined') module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
