// 官方 API 扩展（v1.7）：Room.getEventLog / RoomVisual / Power Creeps / Deposits / Market
// 对照 screeps/engine 源码实现；以包装 Engine.tick / buildApi / worldSnapshot 的方式接入，不改动核心引擎结构。
(function () {
  const G = typeof globalThis !== 'undefined' ? globalThis : window;
  const PW = n => SC.POWER_INFO[n];
  const effOf = (o, power) => (o.effects || []).find(e => e.power === power && e.endTime > G.__w_time);
  const gplLevel = p => Math.floor(Math.pow((p.power || 0) / SC.POWER_LEVEL_MULTIPLY, 1 / SC.POWER_LEVEL_POW));
  const isHighway = (rx, ry) => rx % 10 === 0 || ry % 10 === 0;
  const today = () => new Date().toISOString().slice(0, 10);
  const DEPOSIT_TYPES = ['silicon', 'metal', 'biomass', 'mist'];

  // ---------- 事件日志：把本 tick 的渲染事件 + 销毁事件转换为官方 EVENT_*，供下一 tick getEventLog 读取 ----------
  // 官方条目在各动作处由 E.elog 写入（objectId/targetId/amount/damage 等完整 data），这里只按房间归档 + OBJECT_DESTROYED + EXIT
  function buildEventLog(E) {
    const w = E.w, log = {};
    const push = (k, e) => { (log[k] = log[k] || []).push(e); };
    for (const it of w._elog || []) push(it.k, it.e);
    for (const d of w._destroyed || []) push(roomKey(d.x, d.y), { event: SC.EVENT_OBJECT_DESTROYED, objectId: d.id, data: { type: d.type } });
    w._destroyed = []; w._elog = [];
    return log;
  }

  // ---------- 包装 Engine.removeStruct / killCreep：记录 OBJECT_DESTROYED ----------
  const P = Engine.prototype;
  const _rm = P.removeStruct; P.removeStruct = function (s) { (this.w._destroyed = this.w._destroyed || []).push({ x: s.x, y: s.y, id: s.id, type: s.kind === 'spawn' ? 'spawn' : s.type }); return _rm.call(this, s); };
  const _kill = P.killCreep; P.killCreep = function (c, rate) {
    (this.w._destroyed = this.w._destroyed || []).push({ x: c.x, y: c.y, id: c.id, type: c.pc ? 'powerCreep' : 'creep' });
    if (c.pc) { const r = (this.w.powerCreeps || []).find(p => p.id === c.pc); if (r) { r.spawned = false; r.spawnCooldownTime = this.w.time + SC.POWER_CREEP_SPAWN_COOLDOWN; r.store = {}; } }
    return _kill.call(this, c, c.pc ? 0 : rate);
  };

  // ---------- tick：事件日志、视觉清理、power creep 体力、deposit 生成/衰减、源再生效果、NPC 订单 ----------
  const _tick = P.tick;
  P.tick = function () {
    const w = this.w; w.deposits = w.deposits || []; w.powerCreeps = w.powerCreeps || []; w.market = w.market || { orders: [], history: [], deals: {} };
    w._visuals = {}; // 官方：视觉只保留到下一 tick 代码运行前
    w.market.deals = {}; w.market.intents = [];
    w._elog = []; const pre = new Map(); for (const c of w.creeps) if (!c.spawning) pre.set(c, roomKey(c.x, c.y));
    const r = _tick.call(this);
    // 官方 EVENT_EXIT：creep 离开房间时写入旧房间，data = { room, x, y }（新房间名与落点）
    for (const [c, k] of pre) if (w.creeps.includes(c) && roomKey(c.x, c.y) !== k) w._elog.push({ k, e: { event: SC.EVENT_EXIT, objectId: c.id, data: { room: roomName(c.x, c.y), x: c.x % ROOM, y: c.y % ROOM } } });
    // 官方 global processor：市场 intent 在所有房间结算之后按登记顺序处理
    for (const it of w.market.intents.splice(0)) it();
    G.__w_time = w.time;
    for (const c of w.creeps) if (c.pc) c.fatigue = 0; // Power Creep 不产生疲劳
    for (const L of [w.sources, w.structures, w.spawns, w.controllers, w.minerals]) for (const o of L) if (o.effects) o.effects = o.effects.filter(f => f.endTime > w.time);
    // Deposits：高速公路房间随机生成，DEPOSIT_DECAY_TIME 内无人采集则消失
    w.deposits = w.deposits.filter(d => w.time < d.decayAt);
    if (w.time % 50 === 0) this.spawnDeposits();
    if (w.time % 500 === 1) ensureNpcOrders(w);
    w.eventLog = buildEventLog(this);
    this._objVer++;
    return r;
  };
  P.spawnDeposits = function (force) {
    const w = this.w; w.deposits = w.deposits || [];
    let seed = (w.seed || 1) * 7919 + w.time; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let ry = 0; ry < w.S; ry++) for (let rx = 0; rx < w.S; rx++) {
      if (!isHighway(rx, ry)) continue; const k = rx + ',' + ry; if (!w.rooms[k]) ensureRoom(w, rx, ry); if (!w.rooms[k]) continue;
      if (w.deposits.some(d => roomKey(d.x, d.y) === k)) continue; if (!force && rnd() > 0.02) continue;
      for (let i = 0; i < 40; i++) { const lx = 5 + Math.floor(rnd() * 40), ly = 5 + Math.floor(rnd() * 40), x = rx * ROOM + lx, y = ry * ROOM + ly;
        if (this.tile(x, y) === T_WALL || this.solid(x, y)) continue; const near = [[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => this.tile(x + a, y + b) !== T_WALL); if (!near) continue;
        w.deposits.push({ kind: 'deposit', id: 'dp' + (w.nextId++), x, y, depositType: DEPOSIT_TYPES[Math.floor(rnd() * 4)], harvested: 0, cooldownTime: 0, lastCooldown: 0, decayAt: w.time + SC.DEPOSIT_DECAY_TIME });
        this._objVer++; break; }
      if (force) return w.deposits[w.deposits.length - 1];
    }
  };

  // ---------- 市场：NPC 订单（高速公路十字路口），玩家订单 ----------
  function ensureNpcOrders(w) {
    w.market = w.market || { orders: [], history: [], deals: {} };
    const rooms = []; for (let ry = 0; ry < w.S; ry += 10) for (let rx = 0; rx < w.S; rx += 10) rooms.push(roomNameXY(rx, ry));
    const base = { energy: 1, H: 2, O: 2, U: 3, L: 3, K: 3, Z: 3, X: 5, power: 10, ops: 5, pixel: 500, cpuUnlock: 20000, accessKey: 30000 };
    for (const res in base) for (const rn of (SC.INTERSHARD_RESOURCES.includes(res) ? [undefined] : rooms)) for (const type of ['buy', 'sell']) {
      let o = w.market.orders.find(o => o.npc && o.roomName === rn && o.resourceType === res && o.type === type);
      if (!o) { o = { id: 'mo' + (w.nextId++), npc: true, owner: null, created: w.time, createdTimestamp: Date.now(), active: true, type, resourceType: res, roomName: rn, price: 0, amount: 0, remainingAmount: 0, totalAmount: 0 }; w.market.orders.push(o); }
      o.price = +(base[res] * (type === 'buy' ? 0.9 : 1.1)).toFixed(3); o.amount = o.remainingAmount = o.totalAmount = 100000;
    }
  }
  function terminalIn(w, pid, rn) { const p = parseRoomName(rn); if (!p) return null; return w.structures.find(s => s.type === 'terminal' && s.owner === pid && Math.floor(s.x / ROOM) === p[0] && Math.floor(s.y / ROOM) === p[1]); }
  function txCost(amount, a, b) { const p = parseRoomName(a), q = parseRoomName(b); const d = p && q ? Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) : 0; return Math.ceil(amount * (1 - Math.exp(-d / 30))); }
  const orderView = o => ({ id: o.id, created: o.created, createdTimestamp: o.createdTimestamp, active: o.active, type: o.type, resourceType: o.resourceType, roomName: o.roomName, amount: o.amount, remainingAmount: o.remainingAmount, totalAmount: o.totalAmount, price: o.price });
  function addHistory(w, res, amount, price) {
    const d = today(); let h = w.market.history.find(x => x.resourceType === res && x.date === d);
    if (!h) { h = { resourceType: res, date: d, transactions: 0, volume: 0, avgPrice: 0, stddevPrice: 0, _sum: 0, _sq: 0 }; w.market.history.push(h); }
    h.transactions++; h.volume += amount; h._sum += price * amount; h._sq += price * price * amount; h.avgPrice = +(h._sum / h.volume).toFixed(3); h.stddevPrice = +Math.sqrt(Math.max(0, h._sq / h.volume - h.avgPrice * h.avgPrice)).toFixed(3);
    w.market.history = w.market.history.slice(-14 * 60);
  }
  function makeMarket(E, pid, base) {
    const w = E.w; w.market = w.market || { orders: [], history: [], deals: {} }; const pl = w.players[pid]; if (pl.credits == null) pl.credits = 0;
    const fee = (v) => Math.ceil(v * SC.MARKET_FEE * 1000) / 1000;
    const M = Object.create(base || {});
    Object.defineProperty(M, 'credits', { get: () => +pl.credits.toFixed(3), enumerable: true });
    Object.defineProperty(M, 'orders', { get: () => Object.fromEntries(w.market.orders.filter(o => o.owner === pid).map(o => [o.id, orderView(o)])), enumerable: true });
    M.calcTransactionCost = (amount, a, b) => txCost(amount, a, b);
    const createOrder = (dry, params, ...rest) => {
      if (typeof params !== 'object' || params === null) params = { type: params, resourceType: rest[0], price: rest[1], totalAmount: rest[2], roomName: rest[3] };
      const { type, resourceType, price, totalAmount, roomName: rn } = params;
      if ((type !== 'buy' && type !== 'sell') || !RESOURCES.has(resourceType) || !(price > 0) || !(totalAmount > 0)) return ERR_INVALID_ARGS;
      if (!SC.INTERSHARD_RESOURCES.includes(resourceType) && !terminalIn(w, pid, rn)) return ERR_NOT_OWNER; // 跨 shard 资源无需房间/终端
      if (w.market.orders.filter(o => o.owner === pid).length >= SC.MARKET_MAX_ORDERS) return ERR_FULL;
      const f = fee(price * totalAmount); if (pl.credits < f) return ERR_NOT_ENOUGH_RESOURCES;
      if (dry) return OK; pl.credits -= f; w.market.orders.push({ id: 'mo' + (w.nextId++), owner: pid, created: w.time, createdTimestamp: Date.now(), active: true, type, resourceType, roomName: rn, price, amount: totalAmount, remainingAmount: totalAmount, totalAmount });
      return OK;
    };
    const cancelOrder = (dry, id) => { const i = w.market.orders.findIndex(o => o.id === id && o.owner === pid); if (i < 0) return ERR_INVALID_ARGS; if (dry) return OK; w.market.orders.splice(i, 1); return OK; };
    const changeOrderPrice = (dry, id, np) => { const o = w.market.orders.find(o => o.id === id && o.owner === pid); if (!o || !(np > 0)) return ERR_INVALID_ARGS;
      const f = np > o.price ? fee((np - o.price) * o.remainingAmount) : 0; if (pl.credits < f) return ERR_NOT_ENOUGH_RESOURCES; if (dry) return OK; pl.credits -= f; o.price = np; return OK; };
    const extendOrder = (dry, id, add) => { const o = w.market.orders.find(o => o.id === id && o.owner === pid); if (!o || !(add > 0)) return ERR_INVALID_ARGS;
      const f = fee(o.price * add); if (pl.credits < f) return ERR_NOT_ENOUGH_RESOURCES; if (dry) return OK; pl.credits -= f; o.amount += add; o.remainingAmount += add; o.totalAmount += add; return OK; };
    M.getAllOrders = filter => { let L = w.market.orders.filter(o => o.active && o.remainingAmount > 0).map(orderView);
      if (typeof filter === 'function') L = L.filter(filter); else if (filter && typeof filter === 'object') L = L.filter(o => Object.keys(filter).every(k => o[k] === filter[k])); return L; };
    M.getOrderById = id => { const o = w.market.orders.find(o => o.id === id); return o ? orderView(o) : null; };
    M.getHistory = res => w.market.history.filter(h => !res || h.resourceType === res).map(h => ({ resourceType: h.resourceType, date: h.date, transactions: h.transactions, volume: h.volume, avgPrice: h.avgPrice, stddevPrice: h.stddevPrice }));
    const deal = (dry, id, amount, yourRoom) => { // 官方顺序：参数 → 每 tick 10 笔 → 订单 → 终端 → 资源/信用点
      if (!(amount > 0)) return ERR_INVALID_ARGS; amount = Math.floor(amount);
      const dl = w.market.deals[pid] || 0; if (dry && dl >= 10) return ERR_FULL;
      const o = w.market.orders.find(o => o.id === id); if (!o || o.owner === pid || !o.active) return ERR_INVALID_ARGS;
      amount = Math.min(amount, o.remainingAmount); if (!amount) return ERR_INVALID_ARGS;
      if (SC.INTERSHARD_RESOURCES.includes(o.resourceType)) { // 官方 market.js：跨 shard 资源直接在账户间转移，无终端/能量
        const other = o.owner ? w.players[o.owner] : null, gr = (p, r) => r === 'pixel' ? (p.pixels || 0) : ((p.res || {})[r] || 0), ar = (p, r, d) => { if (r === 'pixel') p.pixels = (p.pixels || 0) + d; else { p.res = p.res || {}; p.res[r] = (p.res[r] || 0) + d; } };
        const buyer = o.type === 'sell' ? pl : other, seller = o.type === 'sell' ? other : pl;
        if (buyer && (buyer.credits || 0) < o.price * amount) return ERR_NOT_ENOUGH_RESOURCES; if (seller && gr(seller, o.resourceType) < amount) return ERR_NOT_ENOUGH_RESOURCES;
        if (dry) return OK;
        if (buyer) { buyer.credits -= o.price * amount; ar(buyer, o.resourceType, amount); } if (seller) { seller.credits = (seller.credits || 0) + o.price * amount; ar(seller, o.resourceType, -amount); }
        o.remainingAmount -= amount; o.amount = o.remainingAmount; if (!o.npc && o.remainingAmount <= 0) w.market.orders.splice(w.market.orders.indexOf(o), 1); addHistory(w, o.resourceType, amount, o.price); return OK; }
      const t = terminalIn(w, pid, yourRoom); if (!t) return ERR_NOT_OWNER; if (t.cooldown > 0) return ERR_TIRED;
      const opT = pwrFx(t, SC.PWR_OPERATE_TERMINAL, w.time), cost = opT != null ? Math.ceil(txCost(amount, yourRoom, o.roomName) * opT) : txCost(amount, yourRoom, o.roomName), other = o.owner ? w.players[o.owner] : null, ot = o.owner ? terminalIn(w, o.owner, o.roomName) : null;
      if (o.owner && !ot) return ERR_INVALID_ARGS;
      if (o.type === 'sell') { // 我买
        if (pl.credits < o.price * amount || (t.store.energy || 0) < cost) return ERR_NOT_ENOUGH_RESOURCES;
        if (ot && (ot.store[o.resourceType] || 0) < amount) return ERR_NOT_ENOUGH_RESOURCES;
        if (freeFor(w, t, o.resourceType) < amount) return ERR_FULL;
        if (dry) return OK;
        pl.credits -= o.price * amount; if (other) other.credits = (other.credits || 0) + o.price * amount; if (ot) ot.store[o.resourceType] -= amount;
        t.store.energy -= cost; t.store[o.resourceType] = (t.store[o.resourceType] || 0) + amount;
      } else { // 我卖
        const need = o.resourceType === 'energy' ? amount + cost : amount; if ((t.store[o.resourceType] || 0) < need || (t.store.energy || 0) < cost) return ERR_NOT_ENOUGH_RESOURCES;
        if (other && (other.credits || 0) < o.price * amount) return ERR_NOT_ENOUGH_RESOURCES;
        if (dry) return OK;
        t.store[o.resourceType] -= amount; t.store.energy -= cost; pl.credits += o.price * amount; if (other) other.credits -= o.price * amount; if (ot) ot.store[o.resourceType] = (ot.store[o.resourceType] || 0) + amount;
      }
      if (dry) return OK;
      t.cooldown = opT != null ? Math.round(SC.TERMINAL_COOLDOWN * opT) : SC.TERMINAL_COOLDOWN; o.remainingAmount -= amount; o.amount = o.remainingAmount; if (!o.npc && o.remainingAmount <= 0) w.market.orders.splice(w.market.orders.indexOf(o), 1);
      addHistory(w, o.resourceType, amount, o.price);
      w.transactions = (w.transactions || []).slice(-99);
      const fromSender = o.type === 'sell' ? o.owner : pid, toRecv = o.type === 'sell' ? pid : o.owner;
      w.transactions.push({ transactionId: 't' + (w.nextId++), time: w.time, sender: fromSender ? { username: w.players[fromSender].name } : undefined, recipient: toRecv ? { username: w.players[toRecv].name } : undefined, _s: fromSender, _r: toRecv, resourceType: o.resourceType, amount, from: o.type === 'sell' ? o.roomName : yourRoom, to: o.type === 'sell' ? yourRoom : o.roomName, order: { id: o.id, type: o.type, price: o.price } });
      return OK;
    };
    // 官方：调用时校验并登记 intent（market.deal 每 tick 最多 10 笔），tick 末 global processor 再次校验后结算
    const queue = (fn, isDeal) => (...a) => { const r = fn(true, ...a); if (r !== OK) return r; if (isDeal) w.market.deals[pid] = (w.market.deals[pid] || 0) + 1; { const it = () => fn(false, ...a); it._pid = pid; (w.market.intents = w.market.intents || []).push(it); } return OK; };
    M.createOrder = queue(createOrder); M.cancelOrder = queue(cancelOrder); M.changeOrderPrice = queue(changeOrderPrice); M.extendOrder = queue(extendOrder); M.deal = queue(deal, true);
    M._flushNow = () => { for (const it of (w.market.intents || []).splice(0)) it(); };
    return M;
  }

  // ---------- RoomVisual（官方 API：circle/line/rect/poly/text/getSize/export/import/clear） ----------
  function makeRoomVisual(E, pid) {
    const w = E.w;
    const store = rn => { const V = (w._visuals = w._visuals || {}); const P = (V[pid] = V[pid] || {}); return (P[rn] = P[rn] || []); };
    const xy = (a, b) => (typeof a === 'object' && a) ? [a.x, a.y, a.roomName] : [a, b];
    class RoomVisual {
      constructor(roomName) { this.roomName = roomName; }
      _add(o) { store(this.roomName || '*').push(o); return this; }
      line(a, b, c, d, s) { let x1, y1, x2, y2, st; if (typeof a === 'object') { [x1, y1] = xy(a); [x2, y2] = xy(b); st = c; } else { x1 = a; y1 = b; x2 = c; y2 = d; st = s; } return this._add({ t: 'l', x1, y1, x2, y2, s: st || {} }); }
      circle(a, b, c) { let x, y, st; if (typeof a === 'object') { [x, y] = xy(a); st = b; } else { x = a; y = b; st = c; } return this._add({ t: 'c', x, y, s: st || {} }); }
      rect(a, b, c, d, e) { let x, y, wd, ht, st; if (typeof a === 'object') { [x, y] = xy(a); wd = b; ht = c; st = d; } else { x = a; y = b; wd = c; ht = d; st = e; } return this._add({ t: 'r', x, y, w: wd, h: ht, s: st || {} }); }
      poly(points, st) { return this._add({ t: 'p', points: (points || []).map(p => Array.isArray(p) ? p : [p.x, p.y]), s: st || {} }); }
      text(text, a, b, c) { let x, y, st; if (typeof a === 'object') { [x, y] = xy(a); st = b; } else { x = a; y = b; st = c; } return this._add({ t: 't', text: String(text), x, y, s: st || {} }); }
      clear() { store(this.roomName || '*').length = 0; return this; }
      getSize() { return JSON.stringify(store(this.roomName || '*')).length; }
      export() { return store(this.roomName || '*').map(o => JSON.stringify(o)).join('\n'); }
      import(str) { for (const line of String(str || '').split('\n')) if (line) { try { store(this.roomName || '*').push(JSON.parse(line)); } catch (e) {} } return this; }
    }
    return RoomVisual;
  }

  // ---------- Power Creeps ----------
  const typeOf = o => o ? (o.kind === 'spawn' ? 'spawn' : o.kind === 'structure' ? o.type : o.kind) : null; // 官方 object.type
  // 对照 engine/src/processor/intents/power-creeps/usePower.js：tick 末再次校验并生效（失败静默）
  function processUsePower(E, rec, live, power, target) {
    const w = E.w, t = w.time, info = PW(power), p = rec.powers[power];
    if (!w.creeps.includes(live)) return;
    const rc = ctrlOfRoom(w, roomKey(live.x, live.y)); if (rc) { if (!rc.isPowerEnabled) return; if (rc.owner !== live.owner && rc.safeMode > t) return; }
    if (!info || !p || !p.level || (p.cooldownTime || 0) > t) return;
    const ops = Array.isArray(info.ops) ? info.ops[p.level - 1] : (info.ops || 0); live.store = live.store || {}; if ((live.store.ops || 0) < ops) return;
    if (info.range) { if (!target || ![w.creeps, w.structures, w.spawns, w.controllers, w.sources, w.minerals].some(L => L.includes(target))) return; if (roomKey(target.x, target.y) !== roomKey(live.x, live.y) || dist(target, live) > info.range) return;
      const ce = (target.effects || []).find(f => f.power === power); if (ce && ce.level > p.level && ce.endTime > t) return; }
    let apply = false; const T = typeOf(target);
    switch (power) {
      case SC.PWR_GENERATE_OPS: { live.store.ops = (live.store.ops || 0) + info.effect[p.level - 1]; const cap = 100 * (rec.level + 1), sum = storeSum(live.store); if (sum > cap) { const d = Math.min(live.store.ops, sum - cap); live.store.ops -= d; E.dropAt(live.x, live.y, 'ops', d); } break; }
      case SC.PWR_OPERATE_SPAWN: case SC.PWR_DISRUPT_SPAWN: if (T !== 'spawn') return; apply = true; break;
      case SC.PWR_OPERATE_TOWER: case SC.PWR_DISRUPT_TOWER: if (T !== 'tower') return; apply = true; break;
      case SC.PWR_OPERATE_STORAGE: if (T !== 'storage') return; apply = true; break;
      case SC.PWR_OPERATE_LAB: if (T !== 'lab') return; apply = true; break;
      case SC.PWR_OPERATE_EXTENSION: {
        if (!target.store || !['storage', 'terminal', 'factory', 'container'].includes(T)) return; if (target.owner && rc && target.owner !== rc.owner) return;
        if ((target.effects || []).some(f => f.power === SC.PWR_DISRUPT_TERMINAL && f.endTime > t)) return;
        const exts = w.structures.filter(s => s.type === 'extension' && rc && s.owner === rc.owner && roomKey(s.x, s.y) === roomKey(live.x, live.y) && E.isActive(s));
        const limit = Math.min(target.store.energy || 0, info.effect[p.level - 1] * exts.reduce((a, s) => a + (storeCap(w, s, 'energy') || 0), 0));
        exts.sort((a, b) => dist(a, target) - dist(b, target)); let sent = 0;
        for (const s of exts) { const e = Math.min(limit - sent, (storeCap(w, s, 'energy') || 0) - (s.store.energy || 0)); s.store.energy = (s.store.energy || 0) + e; sent += e; if (sent >= limit) break; }
        if (sent === 0) return; target.store.energy -= sent; break; }
      case SC.PWR_OPERATE_OBSERVER: if (T !== 'observer') return; apply = true; break;
      case SC.PWR_OPERATE_TERMINAL: case SC.PWR_DISRUPT_TERMINAL: if (T !== 'terminal') return; apply = true; break;
      case SC.PWR_DISRUPT_SOURCE: case SC.PWR_REGEN_SOURCE: if (T !== 'source') return; apply = true; break;
      case SC.PWR_REGEN_MINERAL: if (T !== 'mineral' || target.amount === 0 || target.regenAt) return; apply = true; break;
      case SC.PWR_OPERATE_CONTROLLER: if (T !== 'controller') return; apply = true; break;
      case SC.PWR_OPERATE_POWER: if (T !== 'powerSpawn') return; apply = true; break;
      case SC.PWR_FORTIFY: if (T !== 'rampart' && T !== 'constructedWall') return; apply = true; break;
      case SC.PWR_SHIELD: {
        const site = w.sites.find(s => s.x === live.x && s.y === live.y); if (site) w.sites.splice(w.sites.indexOf(site), 1);
        if (w.structures.some(s => s.x === live.x && s.y === live.y && s.type !== 'road' && s.type !== 'container') || w.spawns.some(s => s.x === live.x && s.y === live.y) || E.tile(live.x, live.y) === T_WALL) return; // checkConstructionSite(rampart)
        const r = E.makeStruct('rampart', live.owner, live.x, live.y); r.hits = info.effect[p.level - 1]; r.hitsMax = 0; r.shield = t + info.duration; r.decayAt = null;
        r.effects = [{ power: SC.PWR_SHIELD, level: p.level, endTime: t + info.duration }]; w.structures.push(r); E._objVer++; E._o = null; break; }
      case SC.PWR_OPERATE_FACTORY: if (T !== 'factory') return; if (!target.level) target.level = p.level; else if (target.level !== p.level) return; apply = true; break;
      default: return;
    }
    if (apply) { target.effects = (target.effects || []).filter(f => f.power !== power); target.effects.push({ effect: power, power, level: p.level, endTime: t + (Array.isArray(info.duration) ? info.duration[p.level - 1] : info.duration) }); }
    p.cooldownTime = t + info.cooldown; live.store.ops = (live.store.ops || 0) - ops; if (!live.store.ops) delete live.store.ops;
    E.elog(live, SC.EVENT_POWER, { power, targetId: target ? target.id : undefined });
  }
  function pcBody(level) { const n = 10 * (level + 1), carry = 2 * (level + 1); return Array.from({ length: n }, (_, i) => i < carry ? 'carry' : 'move'); }
  function makePowerCreepApi(E, pid, api) {
    const w = E.w; w.powerCreeps = w.powerCreeps || []; const pl = w.players[pid];
    const rawOf = t => t && (t._raw || (t.pos && t.pos._g ? null : null));
    const ctrlRoomEnabled = (x, y) => { const c = ctrlOfRoom(w, roomKey(x, y)); return !c || !!c.isPowerEnabled; };
    const usedLevels = () => w.powerCreeps.filter(p => p.owner === pid).reduce((a, p) => a + p.level + 1, 0);
    function body(rec) { return rec.spawned ? w.creeps.find(c => c.pc === rec.id) : null; }
    function decorate(rec) {
      const live = body(rec); let v = live ? api.Game.getObjectById(live.id) : null;
      if (!v) v = { name: rec.name, my: rec.owner === pid, owner: { username: pl.name }, pos: undefined, room: undefined, ticksToLive: undefined, hits: undefined, store: undefined };
      Object.assign(v, { id: live ? live.id : rec.id, name: rec.name, className: rec.className, level: rec.level, powers: Object.fromEntries(Object.entries(rec.powers).map(([k, p]) => [k, { level: p.level, cooldown: Math.max(0, (p.cooldownTime || 0) - w.time) }])),
        hitsMax: 1000 * (rec.level + 1), spawnCooldownTime: rec.spawnCooldownTime && rec.spawnCooldownTime > w.time ? Date.now() + (rec.spawnCooldownTime - w.time) * 1000 : undefined, deleteTime: rec.deleteTime, shard: rec.spawned ? 'shard0' : undefined });
      if (live) { v.ticksToLive = live.ttl; v.powerCreepFlush = true;
        if (!(live._flushIntents && live._flushIntents._pc)) { const f0 = live._flushIntents; live._flushIntents = () => { if (f0) f0(); const pi = rec._pi; rec._pi = null; if (pi) for (const k of ['renew', 'enableRoom', 'usePower']) if (pi[k]) pi[k](); }; live._flushIntents._pc = true; }
        // 官方 PowerCreep 原型只有这些动作：没有 harvest/attack/build 等
        for (const k of ['attack', 'rangedAttack', 'rangedMassAttack', 'heal', 'rangedHeal', 'harvest', 'build', 'repair', 'dismantle', 'upgradeController', 'claimController', 'reserveController', 'attackController', 'generateSafeMode', 'signController', 'pull', 'getActiveBodyparts']) delete v[k];
        delete v.body; delete v.fatigue; delete v.spawning; }
      const PC_DROP = ['attack', 'rangedAttack', 'rangedMassAttack', 'heal', 'rangedHeal', 'harvest', 'build', 'repair', 'dismantle', 'upgradeController', 'claimController', 'reserveController', 'attackController', 'generateSafeMode', 'signController', 'pull', 'getActiveBodyparts'];
      v.spawn = ps => { if (rec.owner !== pid) return ERR_NOT_OWNER; if (rec.spawned) return ERR_BUSY; const s = ps && ps._raw; if (!s || s.type !== 'powerSpawn') return ERR_INVALID_TARGET; if (s.owner !== pid) return ERR_NOT_OWNER;
        if (rec.spawnCooldownTime > w.time) return ERR_TIRED; if (!E.isActive(s)) return ERR_RCL_NOT_ENOUGH;
        if (w.creeps.some(c => c.x === s.x && c.y === s.y && !c.spawning)) return ERR_BUSY;
        rec.spawned = true; w.creeps.push({ kind: 'creep', id: 'pc' + (w.nextId++), pc: rec.id, owner: pid, name: rec.name, body: pcBody(rec.level), hits: 1000 * (rec.level + 1), x: s.x, y: s.y, px: s.x, py: s.y, store: rec.store || {}, ttl: SC.POWER_CREEP_LIFE_TIME, fatigue: 0, _did: {} }); E._objVer++; E._o = null; return OK; };
      const inRoom = x => x && roomKey(x.x, x.y) === roomKey(live.x, live.y);
      const queue = (name, fn) => { rec._pi = rec._pi || {}; rec._pi[name] = fn; return OK; }; // 官方：intents.set(this.id, name, ...)，同名后者覆盖
      v.renew = t => { if (rec.owner !== pid) return ERR_NOT_OWNER; if (!live) return ERR_BUSY; const s = t && t._raw; if (!s || (s.type !== 'powerSpawn' && s.type !== 'powerBank')) return ERR_INVALID_TARGET; if (!inRoom(s) || dist(s, live) > 1) return ERR_NOT_IN_RANGE;
        if (s.type === 'powerSpawn' && !E.isActive(s)) return ERR_RCL_NOT_ENOUGH;
        return queue('renew', () => { if (!w.creeps.includes(live)) return; live.ttl = SC.POWER_CREEP_LIFE_TIME; }); };
      v.enableRoom = c => { if (rec.owner !== pid) return ERR_NOT_OWNER; if (!live) return ERR_BUSY; const x = c && c._raw; if (!x) return ERR_INVALID_TARGET; if (!inRoom(x) || dist(x, live) > 1) return ERR_NOT_IN_RANGE; if (x.kind !== 'controller' || (x.safeMode > w.time && x.owner !== pid)) return ERR_INVALID_TARGET;
        return queue('enableRoom', () => { x.isPowerEnabled = true; }); };
      v.upgrade = power => { if (rec.owner !== pid) return ERR_NOT_OWNER; const info = PW(power); if (!info || info.className !== rec.className) return ERR_INVALID_ARGS;
        if (gplLevel(pl) - usedLevels() < 1) return ERR_NOT_ENOUGH_RESOURCES; if (rec.level >= SC.POWER_CREEP_MAX_LEVEL) return ERR_FULL;
        const cur = rec.powers[power] ? rec.powers[power].level : 0; if (cur >= 5 || info.level[cur] > rec.level) return ERR_FULL;
        rec.level++; rec.powers[power] = { level: cur + 1, cooldownTime: rec.powers[power] ? rec.powers[power].cooldownTime : 0 }; if (live) { live.body = pcBody(rec.level); live.hits = Math.min(live.hits + 1000, 1000 * (rec.level + 1)); } return OK; };
      v.delete = cancel => { if (rec.owner !== pid) return ERR_NOT_OWNER; if (rec.spawned) return ERR_BUSY; if (cancel) { rec.deleteTime = undefined; return OK; } w.powerCreeps.splice(w.powerCreeps.indexOf(rec), 1); return OK; };
      v.rename = n => { if (rec.owner !== pid) return ERR_NOT_OWNER; if (rec.spawned) return ERR_BUSY; if (!n || w.powerCreeps.some(p => p.owner === pid && p.name === n)) return ERR_NAME_EXISTS; rec.name = n; return OK; };
      v.usePower = (power, target) => { // 对照 engine/src/game/power-creeps.js：调用时校验 → 登记 intent
        if (rec.owner !== pid) return ERR_NOT_OWNER; if (!live) return ERR_BUSY;
        const rc = ctrlOfRoom(w, roomKey(live.x, live.y)); if (rc) { if (!rc.isPowerEnabled) return ERR_INVALID_ARGS; if (rc.owner !== pid && rc.safeMode > w.time) return ERR_INVALID_ARGS; }
        const p = rec.powers[power], info = PW(power); if (!p || !p.level || !info) return ERR_NO_BODYPART;
        if ((p.cooldownTime || 0) > w.time) return ERR_TIRED;
        const ops = Array.isArray(info.ops) ? info.ops[p.level - 1] : (info.ops || 0); if ((live.store.ops || 0) < ops) return ERR_NOT_ENOUGH_RESOURCES;
        const x = target ? target._raw : null;
        if (info.range) { if (!x) return ERR_INVALID_TARGET; if (!inRoom(x) || dist(x, live) > info.range) return ERR_NOT_IN_RANGE;
          const ce = (x.effects || []).find(f => f.power === power); if (ce && ce.level > p.level && ce.endTime > w.time) return ERR_FULL; }
        return queue('usePower', () => processUsePower(E, rec, live, power, x)); };
      if (api._toClass) api._toClass(v, 'PowerCreep', PC_DROP);
      return v;
    }
    const storeCapOf = c => 100 * (((w.powerCreeps.find(p => p.id === c.pc) || {}).level || 0) + 1);
    const storeCapOfS = s => storeCap(w, s, 'energy') || 0;
    const powerCreeps = {}; for (const rec of w.powerCreeps) if (rec.owner === pid) powerCreeps[rec.name] = decorate(rec);
    const PowerCreep = api._cls ? api._cls.PowerCreep : function PowerCreep() { throw new Error('PowerCreep 不能直接构造'); }; // 官方原型类，全局重置之间保持
    PowerCreep.create = (name, className) => {
      if (!name || typeof name !== 'string' || name.length > 100) return ERR_INVALID_ARGS; if (!Object.values(SC.POWER_CLASS).includes(className)) return ERR_INVALID_ARGS;
      if (w.powerCreeps.some(p => p.owner === pid && p.name === name)) return ERR_NAME_EXISTS;
      if (gplLevel(pl) - usedLevels() < 1) return ERR_NOT_ENOUGH_RESOURCES;
      w.powerCreeps.push({ id: 'pcr' + (w.nextId++), owner: pid, name, className, level: 0, powers: {}, spawned: false, store: {}, spawnCooldownTime: 0 }); return OK; };
    return { powerCreeps, PowerCreep, decorate, storeCapOf };
  }

  // ---------- 接入 buildApi ----------
  const _build = G.buildApi;
  G.buildApi = function (E, pid) {
    const api = _build(E, pid), w = E.w, Game = api.Game;
    w.deposits = w.deposits || []; w.powerCreeps = w.powerCreeps || []; w.market = w.market || { orders: [], history: [], deals: {} };
    G.__w_time = w.time;
    const RoomVisual = makeRoomVisual(E, pid); api.RoomVisual = RoomVisual;
    const pcApi = makePowerCreepApi(E, pid, api); api.PowerCreep = pcApi.PowerCreep;
    // Game.creeps 不含 Power Creep（官方分开）
    for (const n in Game.creeps) { const c = Game.creeps[n]; if (c && c._raw && c._raw.pc) delete Game.creeps[n]; }
    Game.powerCreeps = pcApi.powerCreeps;
    const pl = w.players[pid], gl = gplLevel(pl), base = Math.pow(gl, SC.POWER_LEVEL_POW) * SC.POWER_LEVEL_MULTIPLY;
    Game.gpl = { level: gl, progress: (pl.power || 0) - base, progressTotal: Math.pow(gl + 1, SC.POWER_LEVEL_POW) * SC.POWER_LEVEL_MULTIPLY - base };
    Game.market = makeMarket(E, pid, Game.market);
    // 官方 InterShardMemory：本服只有 shard0；setLocal 只接受 ≤100KB 字符串；getRemote(未知 shard) 抛错
    w.isMem = w.isMem || {};
    api.InterShardMemory = { getLocal: () => (w.isMem[pid] != null ? w.isMem[pid] : null),
      setLocal: v => { if (typeof v !== 'string') throw new Error('InterShardMemory value should be a string'); if (v.length > 100 * 1024) throw new Error('InterShardMemory value exceeds 100 KB limit'); w.isMem[pid] = v; },
      getRemote: shard => { if (shard !== 'shard0') throw new Error(`Invalid shard name "${shard}"`); return w.isMem[pid] != null ? w.isMem[pid] : null; } };
    // ---- Game.cpu（官方文档）：unlock / unlocked / unlockedTime / shardLimits / setShardLimits / halt；Game.resources 跨 shard 资源 ----
    pl.res = pl.res || {}; const R = pl.res;
    Game.resources = { pixel: pl.pixels || 0, cpuUnlock: R.cpuUnlock || 0, accessKey: R.accessKey || 0, token: R.token || 0 };
    const now = Date.now(), unlocked = (pl.cpuUnlockedUntil || 0) > now, gclLv = E.gclLevel(pid);
    const full = Math.min(300, 20 + 10 * gclLv); // 官方：解锁后 CPU = 10×GCL + 20（上限 300）；未解锁免费 20
    const cpu = Game.cpu; cpu.unlocked = unlocked; cpu.unlockedTime = unlocked ? pl.cpuUnlockedUntil : undefined; cpu.limit = unlocked ? full : 20;
    pl.shardLimits = pl.shardLimits && pl.shardLimits.shard0 != null ? pl.shardLimits : { shard0: cpu.limit }; if (pl.shardLimits.shard0 !== cpu.limit && !pl.shardLimitsCustom) pl.shardLimits.shard0 = cpu.limit;
    cpu.shardLimits = Object.assign({}, pl.shardLimits);
    cpu.unlock = () => { // OK / ERR_NOT_ENOUGH_RESOURCES（没有 cpuUnlock）/ ERR_FULL（订阅中：本游戏无订阅，不会出现）
      if (!(R.cpuUnlock > 0)) return ERR_NOT_ENOUGH_RESOURCES; R.cpuUnlock--; pl.cpuUnlockedUntil = Math.max(Date.now(), pl.cpuUnlockedUntil || 0) + 24 * 3600 * 1000; return OK; };
    cpu.setShardLimits = limits => { // 官方：12 小时一次；各 shard 之和必须等于总 CPU；未知 shard → ERR_INVALID_ARGS
      if ((pl.shardLimitsAt || 0) + 12 * 3600 * 1000 > Date.now()) return ERR_BUSY;
      if (!limits || typeof limits !== 'object') return ERR_INVALID_ARGS; const ks = Object.keys(limits); if (!ks.every(k => k === 'shard0') || !ks.every(k => Number.isInteger(limits[k]) && limits[k] >= 0)) return ERR_INVALID_ARGS;
      const sum = ks.reduce((a, k) => a + limits[k], 0); if (sum !== cpu.limit) return ERR_INVALID_ARGS;
      pl.shardLimits = Object.assign({}, limits); pl.shardLimitsCustom = true; pl.shardLimitsAt = Date.now(); return OK; };
    cpu.halt = () => { const err = new Error('Game.cpu.halt'); err.__halt = true; throw err; }; // 官方：立刻终止运行时，本 tick intents 与 Memory 均不提交
    cpu.getHeapStatistics = () => (typeof performance !== 'undefined' && performance.memory) ? { total_heap_size: performance.memory.totalJSHeapSize, total_heap_size_executable: 0, total_physical_size: performance.memory.totalJSHeapSize, total_available_size: performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize, used_heap_size: performance.memory.usedJSHeapSize, heap_size_limit: performance.memory.jsHeapSizeLimit, malloced_memory: 0, peak_malloced_memory: 0, does_zap_garbage: 0, externally_allocated_size: 0 } : (typeof process !== 'undefined' && process.memoryUsage) ? (m => ({ total_heap_size: m.heapTotal, total_heap_size_executable: 0, total_physical_size: m.rss, total_available_size: 0, used_heap_size: m.heapUsed, heap_size_limit: 0, malloced_memory: 0, peak_malloced_memory: 0, does_zap_garbage: 0, externally_allocated_size: m.external }))(process.memoryUsage()) : ({ total_heap_size: 0, total_heap_size_executable: 0, total_physical_size: 0, total_available_size: 0, used_heap_size: 0, heap_size_limit: 0, malloced_memory: 0, peak_malloced_memory: 0, does_zap_garbage: 0, externally_allocated_size: 0 });
    Game.map.visual = new RoomVisual('*');
    // Deposit 包装
    const depCache = new Map(), RP = api.RoomPosition;
    const wrapDep = d => { if (depCache.has(d)) return depCache.get(d); const v = { id: d.id, depositType: d.depositType, cooldown: Math.max(0, d.cooldownTime - w.time), lastCooldown: d.lastCooldown, ticksToDecay: d.decayAt - w.time, pos: new RP(d.x % ROOM, d.y % ROOM, roomName(d.x, d.y)), effects: (d.effects || []).filter(f => f.endTime > w.time).map(f => ({ effect: f.power, power: f.power, level: f.level, ticksRemaining: f.endTime - w.time })) }; if (api._toClass) api._toClass(v, 'Deposit');
      Object.defineProperty(v, '_raw', { value: d, enumerable: false }); Object.defineProperty(v, 'room', { get: () => Game.rooms[roomName(d.x, d.y)], enumerable: false }); depCache.set(d, v); return v; };
    const gById = Game.getObjectById; Game.getObjectById = id => { const d = w.deposits.find(d => d.id === id); if (d) return wrapDep(d); const rec = w.powerCreeps.find(p => p.id === id); if (rec) return pcApi.decorate(rec);
      const v = gById(id); if (v && v._raw && v._raw.effects) v.effects = v._raw.effects.filter(f => f.endTime > w.time).map(f => ({ power: f.power, level: f.level, ticksRemaining: f.endTime - w.time })); if (v && v._raw && v._raw.kind === 'controller') v.isPowerEnabled = !!v._raw.isPowerEnabled; return v; };
    // Room 扩展：getEventLog、visual、find(FIND_DEPOSITS / POWER_CREEPS)、controller.isPowerEnabled
    for (const rn in Game.rooms) {
      const R = Game.rooms[rn], k = (() => { const p = parseRoomName(rn); return p[0] + ',' + p[1]; })();
      R.getEventLog = raw => { const L = (w.eventLog && w.eventLog[k]) || []; return raw ? JSON.stringify(L) : JSON.parse(JSON.stringify(L)); };
      R.visual = new RoomVisual(rn);
      const f0 = R.find; R.find = (type, opts) => {
        let L = null;
        if (type === SC.FIND_DEPOSITS) L = w.deposits.filter(d => roomKey(d.x, d.y) === k).map(wrapDep);
        else if (type === SC.FIND_POWER_CREEPS || type === SC.FIND_MY_POWER_CREEPS || type === SC.FIND_HOSTILE_POWER_CREEPS) L = w.creeps.filter(c => c.pc && roomKey(c.x, c.y) === k && (type === SC.FIND_POWER_CREEPS || (type === SC.FIND_MY_POWER_CREEPS) === (c.owner === pid))).map(c => pcApi.decorate(w.powerCreeps.find(p => p.id === c.pc)));
        else if (type === SC.FIND_CREEPS || type === SC.FIND_MY_CREEPS || type === SC.FIND_HOSTILE_CREEPS) return f0(type, opts).filter(c => !(c._raw && c._raw.pc));
        if (!L) return f0(type, opts);
        if (opts && opts.filter) L = L.filter(typeof opts.filter === 'function' ? opts.filter : (o => Object.keys(opts.filter).every(kk => o[kk] === opts.filter[kk])));
        return L; };
      const c = R.controller; if (c && c._raw) c.isPowerEnabled = !!c._raw.isPowerEnabled;
    }
    // Creep.harvest(deposit)：官方 HARVEST_DEPOSIT_POWER，冷却 = ceil(DEPOSIT_EXHAUST_MULTIPLY * harvested^DEPOSIT_EXHAUST_POW)
    for (const n in Game.creeps) { const v = Game.creeps[n], o = v._raw, h0 = v.harvest.bind(v);
      v.harvest = t => { const d = t && t._raw; if (!d || d.kind !== 'deposit') return h0(t);
        if (o.spawning) return ERR_BUSY; if (!activeParts(o, 'work')) return ERR_NO_BODYPART; if (roomKey(d.x, d.y) !== roomKey(o.x, o.y) || dist(d, o) > 1) return ERR_NOT_IN_RANGE;
        if (d.cooldownTime > w.time) return ERR_TIRED;
        if (!o._flushing) { o._intents = o._intents || {}; o._intents.harvest = [t]; return OK; } // 官方：登记 harvest intent，tick 末与其他动作一起按优先级结算
        if (!w.deposits.includes(d)) return ERR_INVALID_TARGET;
        const amt = boostPower(o, 'work', 'harvest') * SC.HARVEST_DEPOSIT_POWER; o.store[d.depositType] = (o.store[d.depositType] || 0) + amt;
        const cap = activeParts(o, 'carry') * SC.CARRY_CAPACITY, over = storeSum(o.store) - cap; if (over > 0) { o.store[d.depositType] -= over; E.dropAt(o.x, o.y, d.depositType, over); }
        d.harvested += amt; d.lastCooldown = Math.ceil(SC.DEPOSIT_EXHAUST_MULTIPLY * Math.pow(d.harvested, SC.DEPOSIT_EXHAUST_POW)); d.cooldownTime = w.time + d.lastCooldown; d.decayAt = w.time + SC.DEPOSIT_DECAY_TIME;
        E.elog(o, SC.EVENT_HARVEST, { targetId: d.id, amount: amt }); E.events.push({ t: 'harvest', fx: d.x, fy: d.y, x: o.x, y: o.y, amount: amt }); return OK; };
    }
    // Power Creep 的 store 容量 = 100 × (level+1)：由 2×(level+1) 个 CARRY 体积实现，getCapacity 自然一致
    return api;
  };

  // ---------- 快照：视觉 / deposits / power creep 标记 ----------
  const _snap = G.worldSnapshot;
  G.worldSnapshot = function (w, events, pid) {
    const s = _snap(w, events, pid);
    const vis = pid ? null : null;
    s.visuals = w._visuals || {};
    s.deposits = (w.deposits || []).map(d => ({ id: d.id, x: d.x, y: d.y, depositType: d.depositType, cooldown: Math.max(0, d.cooldownTime - w.time) }));
    if (s.creeps) for (const c of s.creeps) { const raw = w.creeps.find(r => r.id === c.id); if (raw && raw.pc) { c.pc = true; c.level = ((w.powerCreeps || []).find(p => p.id === raw.pc) || {}).level || 0; } }
    return s;
  };
  // storeCap：Power Creep 容量
  const _sc = G.storeCap; if (_sc) G.storeCap = function (w, o, res) { if (o && o.pc) return 100 * ((((w.powerCreeps || []).find(p => p.id === o.pc)) || {}).level + 1 || 1); return _sc(w, o, res); };
})();
