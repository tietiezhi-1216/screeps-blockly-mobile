// 局域网联机：房主（权威 tick）与客户端。传输层可替换（安卓原生插件 / Node ws 测试）。
const LAN_PORT = 8787;
class HostSession {
  constructor(engine, transport, hostPid) {
    this.e = engine; this.t = transport; this.hostPid = hostPid; this.clients = new Map(); this.sentRoomsVer = -1; this.onLocalLog = null; this.onPeers = null;
    engine.onLog = (pid, s) => { if (pid === this.hostPid || !pid) this.onLocalLog && this.onLocalLog(s); for (const [id, c] of this.clients) if (c.pid === pid) this.t.send(id, JSON.stringify({ t: 'log', s })); };
    transport.onConnect = id => { this.clients.set(id, { pid: null }); };
    transport.onClose = id => { const c = this.clients.get(id); this.clients.delete(id); if (c?.pid) this.e.log(this.hostPid, '', this.e.w.players[c.pid]?.name, '断开（其 creep 继续按代码运行）'); this.onPeers && this.onPeers(); };
    transport.onMessage = (id, raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } this.handle(id, m); };
  }
  handle(id, m) {
    const c = this.clients.get(id); if (!c) return;
    if (m.t === 'join') {
      const pid = String(m.pid || ('p' + id)).slice(0, 40); if (pid === this.hostPid) return this.t.kick && this.t.kick(id);
      c.pid = pid; this.e.addPlayer(pid, String(m.name || '玩家').slice(0, 16), true, m.badge && typeof m.badge === 'object' ? { type: +m.badge.type | 0, color1: +m.badge.color1 | 0, color2: +m.badge.color2 | 0, color3: +m.badge.color3 | 0, param: +m.badge.param | 0, flip: !!m.badge.flip } : null); if (m.code != null) this.e.setCode(pid, String(m.code));
      this.t.send(id, JSON.stringify({ t: 'welcome', pid })); this.t.send(id, JSON.stringify(Object.assign({ t: 'rooms' }, this.e.roomsData())));
      this.t.send(id, JSON.stringify(Object.assign({ t: 'tick', dt: this.dt || 500 }, this.e.snapshot())));
      this.onPeers && this.onPeers();
    } else if (m.t === 'badge' && c.pid && m.badge && typeof m.badge === 'object' && this.e.w.players[c.pid]) { // 客户端改了徽章：实时同步给所有人
      const b = m.badge; this.e.w.players[c.pid].badge = { type: +b.type | 0, color1: +b.color1 | 0, color2: +b.color2 | 0, color3: +b.color3 | 0, param: +b.param | 0, flip: !!b.flip }; this.pushAll();
    } else if (m.t === 'spawnAt' && c.pid) { // 新玩家在世界地图上选好的出生点（房主按官方规则校验）
      const err = this.e.placeSpawnAt(c.pid, +m.x | 0, +m.y | 0); this.t.send(id, JSON.stringify({ t: 'spawnRes', err })); if (!err) this.pushAll();
    } else if (m.t === 'gen' && c.pid) { // 客户端要查看某房间地形
      ensureNear(this.e.w, +m.rx | 0, +m.ry | 0, 0); this.pushAll();
    } else if (m.t === 'respawn' && c.pid) { this.e.respawn(c.pid); this.pushAll();
    } else if (m.t === 'code' && c.pid) { this.e.setCode(c.pid, String(m.code || '')); this.e.log(c.pid, '代码已更新到房主'); }
  }
  pushAll() { this.sentRoomsVer = -1; this.afterTick(this.dt || 500); }
  afterTick(dt) {
    this.dt = dt; if (!this.clients.size) return;
    if (this.sentRoomsVer !== this.e.w.roomsVer) { this.sentRoomsVer = this.e.w.roomsVer; this.t.broadcast(JSON.stringify(Object.assign({ t: 'rooms' }, this.e.roomsData()))); }
    this.t.broadcast(JSON.stringify(Object.assign({ t: 'tick', dt }, this.e.snapshot())));
  }
  peerNames() { return [...this.clients.values()].filter(c => c.pid).map(c => this.e.w.players[c.pid]?.name); }
}
class ClientSession {
  constructor(url, pid, name, WS = WebSocket) {
    this.pid = pid; this.view = null; this.onTick = null; this.onLog = null; this.onStatus = null; this.code = '';
    const ws = this.ws = new WS(url);
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', pid, name, code: this.code, badge: this.badge })); this.onStatus && this.onStatus('已连接'); };
    ws.onclose = () => this.onStatus && this.onStatus('连接断开');
    ws.onerror = () => this.onStatus && this.onStatus('连接失败');
    ws.onmessage = ev => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); this.handle(m); };
  }
  setBadge(b) { this.badge = b; try { this.ws && this.ws.readyState === 1 && this.ws.send(JSON.stringify({ t: 'badge', badge: b })); } catch (e) { } }
  handle(m) {
    if (m.t === 'rooms') { this.rooms = {}; for (const k in m.rooms) this.rooms[k] = { tiles: Array.from(m.rooms[k].tiles, Number), owner: m.rooms[k].owner, name: m.rooms[k].name, type: m.rooms[k].type }; this.roomsVer = m.roomsVer; }
    else if (m.t === 'tick') { this.view = Object.assign(m, { rooms: this.rooms || {} }); this.onTick && this.onTick(this.view); }
    else if (m.t === 'spawnRes') this.onSpawnRes && this.onSpawnRes(m.err);
    else if (m.t === 'log') this.onLog && this.onLog(m.s);
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  spawnAt(x, y) { this.send({ t: 'spawnAt', x, y }); } gen(rx, ry) { this.send({ t: 'gen', rx, ry }); } respawn() { this.send({ t: 'respawn' }); }
  sendCode(code) { this.code = code; if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'code', code })); }
  close() { try { this.ws.close(); } catch (e) {} }
}
// 安卓原生插件适配
let _lanPlugin = null;
function lanPlugin() { const C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform() || !C.registerPlugin) return null; return _lanPlugin || (_lanPlugin = C.registerPlugin('LanServer')); }
let _transport = null;
function nativeTransport() {
  if (_transport) return _transport;
  const P = lanPlugin(); if (!P) return null;
  const t = { plugin: P, send: (id, data) => P.send({ id, data }), broadcast: data => P.broadcast({ data }), kick: id => P.kick({ id }) };
  P.addListener('connect', e => t.onConnect && t.onConnect(e.id)); P.addListener('message', e => t.onMessage && t.onMessage(e.id, e.data)); P.addListener('close', e => t.onClose && t.onClose(e.id));
  return (_transport = t);
}
if (typeof module !== 'undefined') module.exports = { HostSession, ClientSession };
