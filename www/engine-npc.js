// NPC（v1.8.2）：Invader 入侵（backend-local cronjobs.js genInvaders + engine creeps/invaders/*）、
// Stronghold / Invader Core（backend-local strongholds.js + engine invader-core/* + common/strongholds.js）、
// notifyWhenAttacked 通知（engine utils.sendAttackingNotification）。以包装 Engine 原型方法的方式接入。
(function () {
  const G = typeof globalThis !== 'undefined' ? globalThis : window;
  const INVADER = '__invader'; G.INVADER = INVADER;
  const NPC_NAME = { __invader: 'Invader', __keeper: 'Source Keeper' }; G.NPC_NAME = NPC_NAME;
  // 官方 cron 以真实时间触发（genInvaders / genStrongholds 每 5 分钟，expandStrongholds 每 15 分钟）；按官方服务器约 3 秒/tick 折算为 tick 数
  const CRON_INVADERS = 100, CRON_STRONGHOLDS = 100, CRON_EXPAND = 300, STRONGHOLD_DEPLOY_TIME = 5000;
  const SH = {"templates":{"bunker1":{"description":"Level 1 bunker-style Stronghold","rewardLevel":1,"structures":[{"type":"invaderCore","dx":0,"dy":0,"level":1,"strongholdBehavior":"bunker1"},{"type":"rampart","dx":0,"dy":0},{"type":"rampart","dx":1,"dy":1},{"type":"tower","dx":1,"dy":1},{"type":"road","dx":0,"dy":1},{"type":"rampart","dx":0,"dy":1},{"type":"container","dx":1,"dy":0},{"type":"road","dx":1,"dy":0},{"type":"rampart","dx":1,"dy":0}]},"bunker2":{"description":"Level 2 bunker-style Stronghold","rewardLevel":2,"structures":[{"type":"invaderCore","dx":0,"dy":0,"level":2,"strongholdBehavior":"bunker2"},{"type":"rampart","dx":0,"dy":0},{"type":"tower","dx":1,"dy":1},{"type":"rampart","dx":1,"dy":1},{"type":"tower","dx":-1,"dy":-1},{"type":"rampart","dx":-1,"dy":-1},{"type":"road","dx":0,"dy":-1},{"type":"rampart","dx":0,"dy":-1},{"type":"road","dx":1,"dy":-1},{"type":"rampart","dx":1,"dy":-1},{"type":"road","dx":-1,"dy":1},{"type":"rampart","dx":-1,"dy":1},{"type":"road","dx":0,"dy":1},{"type":"rampart","dx":0,"dy":1},{"type":"container","dx":1,"dy":0},{"type":"road","dx":1,"dy":0},{"type":"rampart","dx":1,"dy":0},{"type":"container","dx":-1,"dy":0},{"type":"road","dx":-1,"dy":0},{"type":"rampart","dx":-1,"dy":0}]},"bunker3":{"description":"Level 3 bunker-style Stronghold","rewardLevel":3,"structures":[{"type":"invaderCore","dx":0,"dy":0,"level":3,"strongholdBehavior":"bunker3"},{"type":"rampart","dx":0,"dy":0},{"type":"tower","dx":1,"dy":1},{"type":"rampart","dx":1,"dy":1},{"type":"tower","dx":-1,"dy":-1},{"type":"rampart","dx":-1,"dy":-1},{"type":"tower","dx":-1,"dy":1},{"type":"rampart","dx":-1,"dy":1},{"type":"road","dx":-2,"dy":-1},{"type":"rampart","dx":-2,"dy":-1},{"type":"road","dx":0,"dy":-1},{"type":"rampart","dx":0,"dy":-1},{"type":"road","dx":-1,"dy":0},{"type":"rampart","dx":-1,"dy":0},{"type":"road","dx":1,"dy":0},{"type":"rampart","dx":1,"dy":0},{"type":"road","dx":-2,"dy":1},{"type":"rampart","dx":-2,"dy":1},{"type":"road","dx":0,"dy":1},{"type":"rampart","dx":0,"dy":1},{"type":"road","dx":-2,"dy":2},{"type":"rampart","dx":-2,"dy":2},{"type":"road","dx":-1,"dy":2},{"type":"rampart","dx":-1,"dy":2},{"type":"road","dx":1,"dy":2},{"type":"rampart","dx":1,"dy":2},{"type":"container","dx":1,"dy":-1},{"type":"road","dx":1,"dy":-1},{"type":"rampart","dx":1,"dy":-1},{"type":"container","dx":-2,"dy":0},{"type":"road","dx":-2,"dy":0},{"type":"rampart","dx":-2,"dy":0},{"type":"container","dx":0,"dy":2},{"type":"road","dx":0,"dy":2},{"type":"rampart","dx":0,"dy":2}]},"bunker4":{"description":"Level 4 bunker-style Stronghold","rewardLevel":4,"structures":[{"type":"invaderCore","dx":0,"dy":0,"level":4,"strongholdBehavior":"bunker4"},{"type":"rampart","dx":0,"dy":0},{"type":"tower","dx":1,"dy":1},{"type":"rampart","dx":1,"dy":1},{"type":"tower","dx":-1,"dy":-1},{"type":"rampart","dx":-1,"dy":-1},{"type":"tower","dx":-1,"dy":1},{"type":"rampart","dx":-1,"dy":1},{"type":"tower","dx":1,"dy":-1},{"type":"rampart","dx":1,"dy":-1},{"type":"road","dx":-2,"dy":-2},{"type":"rampart","dx":-2,"dy":-2},{"type":"road","dx":-1,"dy":-2},{"type":"rampart","dx":-1,"dy":-2},{"type":"road","dx":1,"dy":-2},{"type":"rampart","dx":1,"dy":-2},{"type":"road","dx":2,"dy":-2},{"type":"rampart","dx":2,"dy":-2},{"type":"road","dx":-2,"dy":-1},{"type":"rampart","dx":-2,"dy":-1},{"type":"road","dx":0,"dy":-1},{"type":"rampart","dx":0,"dy":-1},{"type":"road","dx":2,"dy":-1},{"type":"rampart","dx":2,"dy":-1},{"type":"road","dx":-1,"dy":0},{"type":"rampart","dx":-1,"dy":0},{"type":"road","dx":1,"dy":0},{"type":"rampart","dx":1,"dy":0},{"type":"road","dx":-2,"dy":1},{"type":"rampart","dx":-2,"dy":1},{"type":"road","dx":0,"dy":1},{"type":"rampart","dx":0,"dy":1},{"type":"road","dx":2,"dy":1},{"type":"rampart","dx":2,"dy":1},{"type":"road","dx":-2,"dy":2},{"type":"rampart","dx":-2,"dy":2},{"type":"road","dx":-1,"dy":2},{"type":"rampart","dx":-1,"dy":2},{"type":"road","dx":1,"dy":2},{"type":"rampart","dx":1,"dy":2},{"type":"road","dx":2,"dy":2},{"type":"rampart","dx":2,"dy":2},{"type":"container","dx":2,"dy":0},{"type":"road","dx":2,"dy":0},{"type":"rampart","dx":2,"dy":0},{"type":"container","dx":-2,"dy":0},{"type":"road","dx":-2,"dy":0},{"type":"rampart","dx":-2,"dy":0},{"type":"container","dx":0,"dy":2},{"type":"road","dx":0,"dy":2},{"type":"rampart","dx":0,"dy":2},{"type":"container","dx":0,"dy":-2},{"type":"road","dx":0,"dy":-2},{"type":"rampart","dx":0,"dy":-2}]},"bunker5":{"description":"Level 5 bunker-style Stronghold","rewardLevel":5,"structures":[{"type":"invaderCore","dx":0,"dy":0,"level":5,"strongholdBehavior":"bunker5"},{"type":"rampart","dx":0,"dy":0},{"type":"tower","dx":1,"dy":1},{"type":"rampart","dx":1,"dy":1},{"type":"tower","dx":-1,"dy":-1},{"type":"rampart","dx":-1,"dy":-1},{"type":"tower","dx":-1,"dy":1},{"type":"rampart","dx":-1,"dy":1},{"type":"tower","dx":1,"dy":-1},{"type":"rampart","dx":1,"dy":-1},{"type":"tower","dx":0,"dy":-2},{"type":"rampart","dx":0,"dy":-2},{"type":"tower","dx":0,"dy":2},{"type":"rampart","dx":0,"dy":2},{"type":"road","dx":-2,"dy":-3},{"type":"rampart","dx":-2,"dy":-3},{"type":"road","dx":-1,"dy":-3},{"type":"rampart","dx":-1,"dy":-3},{"type":"road","dx":0,"dy":-3},{"type":"rampart","dx":0,"dy":-3},{"type":"road","dx":1,"dy":-3},{"type":"rampart","dx":1,"dy":-3},{"type":"road","dx":2,"dy":-3},{"type":"rampart","dx":2,"dy":-3},{"type":"road","dx":-3,"dy":-2},{"type":"rampart","dx":-3,"dy":-2},{"type":"road","dx":-1,"dy":-2},{"type":"rampart","dx":-1,"dy":-2},{"type":"road","dx":1,"dy":-2},{"type":"rampart","dx":1,"dy":-2},{"type":"road","dx":3,"dy":-2},{"type":"rampart","dx":3,"dy":-2},{"type":"road","dx":-3,"dy":-1},{"type":"rampart","dx":-3,"dy":-1},{"type":"road","dx":-2,"dy":-1},{"type":"rampart","dx":-2,"dy":-1},{"type":"road","dx":0,"dy":-1},{"type":"rampart","dx":0,"dy":-1},{"type":"road","dx":2,"dy":-1},{"type":"rampart","dx":2,"dy":-1},{"type":"road","dx":3,"dy":-1},{"type":"rampart","dx":3,"dy":-1},{"type":"road","dx":-3,"dy":0},{"type":"rampart","dx":-3,"dy":0},{"type":"road","dx":-2,"dy":0},{"type":"rampart","dx":-2,"dy":0},{"type":"road","dx":-1,"dy":0},{"type":"rampart","dx":-1,"dy":0},{"type":"road","dx":1,"dy":0},{"type":"rampart","dx":1,"dy":0},{"type":"road","dx":2,"dy":0},{"type":"rampart","dx":2,"dy":0},{"type":"road","dx":3,"dy":0},{"type":"rampart","dx":3,"dy":0},{"type":"road","dx":-3,"dy":1},{"type":"rampart","dx":-3,"dy":1},{"type":"road","dx":-2,"dy":1},{"type":"rampart","dx":-2,"dy":1},{"type":"road","dx":0,"dy":1},{"type":"rampart","dx":0,"dy":1},{"type":"road","dx":2,"dy":1},{"type":"rampart","dx":2,"dy":1},{"type":"road","dx":3,"dy":1},{"type":"rampart","dx":3,"dy":1},{"type":"road","dx":-3,"dy":2},{"type":"rampart","dx":-3,"dy":2},{"type":"road","dx":-1,"dy":2},{"type":"rampart","dx":-1,"dy":2},{"type":"road","dx":1,"dy":2},{"type":"rampart","dx":1,"dy":2},{"type":"road","dx":3,"dy":2},{"type":"rampart","dx":3,"dy":2},{"type":"road","dx":-2,"dy":3},{"type":"rampart","dx":-2,"dy":3},{"type":"road","dx":-1,"dy":3},{"type":"rampart","dx":-1,"dy":3},{"type":"road","dx":0,"dy":3},{"type":"rampart","dx":0,"dy":3},{"type":"road","dx":1,"dy":3},{"type":"rampart","dx":1,"dy":3},{"type":"road","dx":2,"dy":3},{"type":"rampart","dx":2,"dy":3},{"type":"container","dx":2,"dy":2},{"type":"road","dx":2,"dy":2},{"type":"rampart","dx":2,"dy":2},{"type":"container","dx":-2,"dy":-2},{"type":"road","dx":-2,"dy":-2},{"type":"rampart","dx":-2,"dy":-2},{"type":"container","dx":2,"dy":-2},{"type":"road","dx":2,"dy":-2},{"type":"rampart","dx":2,"dy":-2},{"type":"container","dx":-2,"dy":2},{"type":"road","dx":-2,"dy":2},{"type":"rampart","dx":-2,"dy":2}]}},"coreRewards":{"silicon":["wire","switch","transistor","microchip","circuit","device"],"metal":["alloy","tube","fixtures","frame","hydraulics","machine"],"biomass":["cell","phlegm","tissue","muscle","organoid","organism"],"mist":["condensate","concentrate","extract","spirit","emanation","essence"]},"coreAmounts":[0,1000,16000,60000,400000,3000000],"coreDensities":[10,220,1400,5100,14000,31500],"containerRewards":{"utrium_bar":5,"lemergium_bar":5,"zynthium_bar":5,"keanium_bar":5,"oxidant":5,"reductant":5,"purifier":5,"ghodium_melt":20,"battery":10,"composite":10,"crystal":15,"liquid":30},"containerAmounts":[0,500,4000,10000,50000,360000]}; // 官方 @screeps/common/lib/strongholds.js（模板/奖励表原样）
  const P = Engine.prototype;
  const rnd = () => Math.random(), sample = a => a[Math.floor(rnd() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const minBy = (L, f) => { let b, bv = Infinity; for (const x of L) { const v = f(x); if (v < bv) { bv = v; b = x; } } return b; };
  const maxBy = (L, f) => { let b, bv = -Infinity; for (const x of L) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; };
  const rkOf = o => roomKey(o.x, o.y), lx = o => o.x % ROOM, ly = o => o.y % ROOM;
  const hasA = (c, part) => !!c.body && activeParts(c, part) > 0;
  const hitsMaxOf = c => c.body.length * 100;
  const typeOf = o => o.kind === 'creep' ? (o.pc ? 'powerCreep' : 'creep') : o.kind === 'site' ? 'constructionSite' : o.kind === 'structure' ? o.type : o.kind;
  const getDir = (dx, dy) => dirOf(dx, dy);
  // utils.isCenter / isVeryCenter（扇区中心 3×3 / 正中心）
  const isCenter = (rx, ry) => { const t = roomType(rx, ry); return t === 'keeper' || t === 'center'; };
  const isVeryCenter = (rx, ry) => roomType(rx, ry) === 'center';
  const sectorOf = rk => { const [rx, ry] = rk.split(',').map(Number); return roomNameXY(rx, ry).replace(/^([WE]\d*)\d([NS]\d*)\d$/, (s, a, b) => a + '|' + b); };
  // utils.calcReward（原样，含官方 densities[order.length - 1] 写法）
  function calcReward(resourceDensities, targetDensity, itemsLimit) {
    const resources = [], densities = []; for (const r in resourceDensities) { resources.push(r); densities.push(resourceDensities[r]); }
    let order = shuffle(resources.map((_, i) => i)); if (itemsLimit) order = order.slice(0, itemsLimit);
    const result = order.map(() => 0); let cur = 0;
    for (let i = 0; i < order.length - 1; i++) { result[i] = Math.max(0, Math.round(rnd() * (targetDensity - cur) / densities[order[i]])); cur += result[i] * densities[order[i]]; }
    result[order.length - 1] = Math.max(0, Math.round((targetDensity - cur) / densities[order.length - 1]));
    const o = {}; order.forEach((i, j) => { o[resources[i]] = result[j]; }); return o;
  }
  // ---------- 房间对象（官方 roomObjects 视图） ----------
  function roomObjects(w, rk) {
    const L = []; const add = list => { for (const o of list || []) if (rkOf(o) === rk) L.push(o); };
    add(w.creeps.filter(c => !c.spawning || true)); add(w.spawns); add(w.structures); add(w.sources); add(w.minerals); add(w.controllers); add(w.sites); add(w.deposits);
    return L;
  }
  // ---------- fake-runtime：单房间 PathFinder（官方 processor/common/fake-runtime.js） ----------
  class CostMatrix { constructor() { this._bits = new Uint8Array(2500); } set(x, y, v) { x |= 0; y |= 0; this._bits[x * 50 + y] = Math.min(Math.max(0, v), 255); } get(x, y) { x |= 0; y |= 0; return this._bits[x * 50 + y]; } clone() { const m = new CostMatrix(); m._bits = new Uint8Array(this._bits); return m; } }
  const OBST = SC.OBSTACLE_OBJECT_TYPES.concat(['portal']), DESTR = ['constructedWall', 'rampart', 'spawn', 'extension', 'link', 'storage', 'observer', 'tower', 'powerBank', 'powerSpawn', 'lab', 'terminal'];
  function defaultCostMatrix(E, rk, opts, creep) {
    if (rkOf(creep) !== rk) return false;
    const costs = new CostMatrix(); let types = OBST.slice();
    if (opts.ignoreDestructibleStructures) types = types.filter(t => !DESTR.includes(t));
    if (opts.ignoreCreeps) types = types.filter(t => t !== 'creep');
    for (const o of roomObjects(E.w, rk)) { if (o.kind === 'creep' && o.spawning) continue; const t = typeOf(o);
      if (types.includes(t) || (!opts.ignoreDestructibleStructures && t === 'rampart' && !o.isPublic && o.owner !== creep.owner) || (!opts.ignoreDestructibleStructures && t === 'constructionSite' && o.owner === creep.owner && SC.OBSTACLE_OBJECT_TYPES.includes(o.type))) costs.set(lx(o), ly(o), Infinity);
      if (!opts.ignoreRoads && t === 'road' && costs.get(lx(o), ly(o)) < Infinity) costs.set(lx(o), ly(o), 1); }
    return costs;
  }
  // PathFinder.search（单房间、maxRooms 1）：A*，heuristicWeight 1.2，maxOps 2000，到不了时返回到最近点的路径
  function search(E, rk, from, goals, o) {
    const [rx, ry] = rk.split(',').map(Number), ox = rx * ROOM, oy = ry * ROOM, cm = o.roomCallback(rk);
    if (cm === false) return { path: [], incomplete: true };
    const plain = o.plainCost || 1, swamp = o.swampCost || 5, hw = o.heuristicWeight == null ? 1.2 : o.heuristicWeight, maxOps = o.maxOps || 2000, flee = !!o.flee;
    const gl = goals.map(g => ({ x: g.x % ROOM, y: g.y % ROOM, r: g.range || 0 }));
    const H = (x, y) => { if (flee) { let m = 0; for (const g of gl) { const d = Math.max(Math.abs(x - g.x), Math.abs(y - g.y)); if (d < g.r) m = Math.max(m, g.r - d); } return m; } let m = Infinity; for (const g of gl) { const d = Math.max(Math.abs(x - g.x), Math.abs(y - g.y)) - g.r; if (d < m) m = d; } return Math.max(0, m); };
    const cost = (x, y) => { const v = cm.get(x, y); if (v === 255) return -1; if (v > 0) return v; const t = E.tile(ox + x, oy + y); return t === T_WALL ? -1 : t === T_SWAMP ? swamp : plain; };
    const gs = new Float64Array(2500).fill(Infinity), prev = new Int32Array(2500).fill(-1), closed = new Uint8Array(2500), heap = [];
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
    const s = (from.y % ROOM) * 50 + (from.x % ROOM); gs[s] = 0; push(s, H(from.x % ROOM, from.y % ROOM) * hw);
    let end = -1, best = s, bestH = H(from.x % ROOM, from.y % ROOM), ops = 0;
    while (heap.length && ops < maxOps) { const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; ops++; const x = k % 50, y = (k / 50) | 0, h = H(x, y);
      if (h === 0) { end = k; break; } if (h < bestH || (h === bestH && gs[k] < gs[best])) { bestH = h; best = k; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue; const nk = ny * 50 + nx; if (closed[nk]) continue; const c = cost(nx, ny); if (c < 0) continue; const ng = gs[k] + c; if (ng < gs[nk]) { gs[nk] = ng; prev[nk] = k; push(nk, ng + H(nx, ny) * hw); } } }
    const inc = end < 0; if (inc) end = best; const path = []; for (let k = end; k !== s && k >= 0; k = prev[k]) path.push({ x: ox + k % 50, y: oy + ((k / 50) | 0) });
    return { path: path.reverse(), incomplete: inc };
  }
  function findPath(E, source, target, opts) {
    const rk = rkOf(source), so = Object.assign({}, opts);
    so.roomCallback = room => { let m = defaultCostMatrix(E, room, opts, source); if (m && typeof opts.costCallback === 'function') { m = m.clone(); const r = opts.costCallback(room, m); if (r instanceof CostMatrix) m = r; } return m; };
    if (!so.ignoreRoads) { so.plainCost = 2; so.swampCost = 10; }
    const isPos = !Array.isArray(target) && target.range === undefined, goals = Array.isArray(target) ? target : [target];
    const ret = search(E, rk, source, goals.map(g => ({ x: g.x, y: g.y, range: g.range || 0 })), so);
    if (isPos && !opts.range && ((ret.path.length && dist(ret.path[ret.path.length - 1], target) === 1) || (!ret.path.length && dist(source, target) === 1))) ret.path.push({ x: target.x, y: target.y });
    return ret;
  }
  function frFlee(E, creep, hostiles, range) { const r = findPath(E, creep, hostiles.map(c => ({ x: c.x, y: c.y, range })), { flee: true }); if (!r.path.length) return 0; return getDir(r.path[0].x - creep.x, r.path[0].y - creep.y); }
  function nextDirectionByPath(creep, path) {
    const idx = path.findIndex(p => p.x === creep.x && p.y === creep.y); if (idx === path.length - 1) return 0;
    let next; if (idx < 0) { if (dist(creep, path[0]) <= 1) next = path[0]; } else next = path[idx + 1];
    return next ? getDir(next.x - creep.x, next.y - creep.y) : 0;
  }
  function frMoveTo(E, creep, target, opts) {
    const w = E.w; opts = opts || {}; if (opts.reusePath === undefined) opts.reusePath = 5; if (opts.range === undefined) opts.range = 0;
    if (dist(creep, target) <= opts.range) return 0;
    const dest = target.x + ',' + target.y, mm = creep.memory_move;
    if (!mm || !mm.dest || !mm.time || mm.dest !== dest || w.time > mm.time + opts.reusePath) { const r = findPath(E, creep, { x: target.x, y: target.y, range: opts.range }, opts); creep.memory_move = { dest, path: r.path, time: w.time }; }
    const d = nextDirectionByPath(creep, creep.memory_move.path); if (d) creep.memory_move.lastMove = w.time; return d;
  }
  function frWalkTo(E, creep, target, opts, ctx) {
    const d = frMoveTo(E, creep, target, opts); if (!d) return d; const [dx, dy] = DIRS[d];
    const ahead = E.w.creeps.find(c => !c.spawning && c.owner === creep.owner && c.x === creep.x + dx && c.y === creep.y + dy);
    if (ahead && (!ahead.memory_move || (ahead.memory_move.lastMove && ahead.memory_move.lastMove + 1 < E.w.time))) { ctx.I.set(ahead.id, 'move', { direction: getDir(creep.x - ahead.x, creep.y - ahead.y) }); ahead.memory_move = { dest: null, time: null, path: null, lastMove: E.w.time }; }
    ctx.I.set(creep.id, 'move', { direction: d });
  }
  function frClosestByPath(E, from, objects, opts) {
    if (!objects.length) return null; opts = Object.assign({}, opts || {}); if (opts.range === undefined) opts.range = 0;
    const here = objects.find(o => dist(from, o) === 0); if (here) return here;
    const r = findPath(E, from, objects.map(o => ({ x: o.x, y: o.y, range: 1 })), opts); const last = r.path.length ? r.path[r.path.length - 1] : from;
    let res = null; for (const o of objects) if (dist(last, o) <= 1) res = o; return res;
  }
  const mkIntents = () => ({ list: {}, set(id, name, data) { (this.list[id] = this.list[id] || {})[name] = data; } });
  // ---------- Invader creep AI（engine creeps/invaders/pretick.js + findAttack/healer/flee/shootAtWill） ----------
  function invCtx(E, creep, I) {
    const w = E.w, rk = rkOf(creep), objs = roomObjects(w, rk), invaders = [], healers = [], hostiles = [], fortifications = [];
    for (const o of objs) { const t = typeOf(o);
      if ((o.kind === 'creep' && !o.spawning && t === 'creep') || t === 'powerCreep') {
        if (o.owner === creep.owner) { invaders.push(o); if (hasA(o, 'heal')) healers.push(o); } else if (o.owner !== KEEPER) hostiles.push(o); }
      if (t === 'rampart' || t === 'constructedWall') fortifications.push(o); }
    return { E, I, rk, objs, invaders, healers, hostiles, fortifications, ctrl: ctrlOfRoom(w, rk) };
  }
  function invFlee(creep, range, ctx) { const near = ctx.hostiles.filter(c => dist(creep, c) < range); if (near.length) { const d = frFlee(ctx.E, creep, near, range); if (d) { ctx.I.set(creep.id, 'move', { direction: d }); return true; } } return false; }
  function checkPath(E, a, b) { const r = findPath(E, a, { x: b.x, y: b.y }, {}); if (!r.path.length) return false; const l = r.path[r.path.length - 1]; return l.x === b.x && l.y === b.y; }
  function findAttack(creep, ctx) {
    const { E, I, healers, hostiles, fortifications, objs, ctrl } = ctx;
    const ignoreRamparts = (room, cm) => { fortifications.forEach(f => cm.set(lx(f), ly(f), 0)); };
    const haveAttack = hasA(creep, 'attack');
    if (!haveAttack && hasA(creep, 'ranged_attack') && invFlee(creep, 3, ctx)) return;
    let target;
    if (creep.hits < hitsMaxOf(creep) / 2 && healers.length && !haveAttack) {
      target = frClosestByPath(E, creep, healers, { ignoreRoads: true });
      if (target) { const d = frMoveTo(E, creep, target, { maxRooms: 1, ignoreRoads: true }); if (d) I.set(creep.id, 'move', { direction: d }); else target = null; } else target = null;
    }
    if (haveAttack) { const near = hostiles.find(c => dist(creep, c) <= 1); if (near) I.set(creep.id, 'attack', { id: near.id }); }
    const tryT = opts => { target = frClosestByPath(E, creep, hostiles, opts); if (target && (haveAttack || dist(creep, target) > 3)) { const d = frMoveTo(E, creep, target, Object.assign({ maxRooms: 1 }, opts)); if (d) I.set(creep.id, 'move', { direction: d }); } };
    if (!target) tryT({ ignoreRoads: true, ignoreCreeps: true });
    if (!target) tryT({ maxRooms: 1, ignoreRoads: true, costCallback: ignoreRamparts });
    if (!target) tryT({ ignoreDestructibleStructures: true, maxRooms: 1, ignoreRoads: true });
    if (!target) {
      const unreach = objs.filter(o => o.kind === 'spawn' && !checkPath(E, creep, o));
      if (!unreach.length && ctrl && ctrl.owner) { I.set(creep.id, 'suicide', {}); return; }
      target = unreach[0];
      if (target) { const d = frMoveTo(E, creep, target, { ignoreDestructibleStructures: true, maxRooms: 1, ignoreRoads: true }); if (d) I.set(creep.id, 'move', { direction: d }); }
      return;
    }
    I.set(creep.id, 'attack', { id: target.id });
    if ((haveAttack || hasA(creep, 'work')) && creep.memory_move && creep.memory_move.path) {
      if (!creep.memory_move.path.length) return;
      const pos = creep.memory_move.path[0];
      const ss = objs.filter(o => (o.kind === 'structure' || o.kind === 'spawn') && SC.CONTROLLER_STRUCTURES[typeOf(o)] && typeOf(o) !== 'spawn' && o.x === pos.x && o.y === pos.y);
      if (ss.length) { if (hasA(creep, 'ranged_attack')) I.set(creep.id, 'rangedAttack', { id: ss[0].id }); if (hasA(creep, 'work')) I.set(creep.id, 'dismantle', { id: ss[0].id }); else I.set(creep.id, 'attack', { id: ss[0].id }); }
    }
  }
  function healer(creep, ctx) {
    const { E, I, invaders } = ctx;
    const ht = invaders.filter(c => dist(c, creep) <= 3);
    if (ht.length) { const t = ht.sort((a, b) => (hitsMaxOf(b) - b.hits) - (hitsMaxOf(a) - a.hits))[0]; if (dist(creep, t) <= 1) I.set(creep.id, 'heal', { id: t.id }); else I.set(creep.id, 'rangedHeal', { id: t.id }); }
    if (creep.hits < hitsMaxOf(creep) / 2) {
      if (!invFlee(creep, 4, ctx)) { const ft = frClosestByPath(E, creep, invaders.filter(c => c !== creep && hasA(c, 'heal')), null); if (ft) { const d = frMoveTo(E, creep, ft, { range: 1 }); if (d) I.set(creep.id, 'move', { direction: d }); } }
      return;
    }
    let target = frClosestByPath(E, creep, invaders.filter(c => c.hits < hitsMaxOf(c)), null);
    if (!target) { if (invFlee(creep, 4, ctx)) return; target = frClosestByPath(E, creep, invaders.filter(c => c !== creep && !hasA(c, 'heal')), null); }
    if (!target) { I.set(creep.id, 'suicide', {}); return; }
    const d = dist(creep, target) <= 1 ? getDir(target.x - creep.x, target.y - creep.y) : frMoveTo(E, creep, target, { range: 1 });
    if (d) I.set(creep.id, 'move', { direction: d });
  }
  function shootAtWill(creep, ctx) { if (!hasA(creep, 'ranged_attack')) return; const t = ctx.hostiles.filter(c => dist(creep, c) <= 3); if (!t.length) return; ctx.I.set(creep.id, 'rangedAttack', { id: minBy(t, c => c.hits).id }); }
  // ---------- Stronghold（engine invader-core/stronghold/*） ----------
  const towerRefillChance = [0, 0.01, 0.1, 0.3, 1, 1];
  const makeBody = d => d.reduce((r, s) => { for (let i = 0; i < s.count; i++) { r.body.push(s.part); r.boosts.push(s.boost); } return r; }, { body: [], boosts: [] });
  const BODIES = {
    fortifier: makeBody([{ part: 'work', count: 15, boost: 'XLH2O' }, { part: 'carry', count: 15 }, { part: 'move', count: 15 }]),
    weakDefender: makeBody([{ part: 'attack', count: 15 }, { part: 'move', count: 15 }]),
    fullDefender: makeBody([{ part: 'attack', count: 25 }, { part: 'move', count: 25 }]),
    boostedDefender: makeBody([{ part: 'attack', count: 25, boost: 'UH2O' }, { part: 'move', count: 25 }]),
    boostedRanger: makeBody([{ part: 'ranged_attack', count: 25, boost: 'KHO2' }, { part: 'move', count: 25 }]),
    fullBoostedMelee: makeBody([{ part: 'attack', count: 44, boost: 'XUH2O' }, { part: 'move', count: 6, boost: 'XZHO2' }]),
    fullBoostedRanger: makeBody([{ part: 'ranged_attack', count: 44, boost: 'XKHO2' }, { part: 'move', count: 6, boost: 'XZHO2' }])
  };
  const eff = (o, e) => (o.effects || []).find(f => f.effect === e);
  function createSafeMatrixCallback(ctx) {
    const { hostiles, ramparts, objs } = ctx; if (!hostiles.length) return undefined;
    return () => { const m = new CostMatrix(); for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) m.set(i, j, Infinity);
      for (const r of ramparts) m.set(lx(r), ly(r), 1);
      for (const o of objs) if (typeOf(o) !== 'creep' && SC.OBSTACLE_OBJECT_TYPES.includes(typeOf(o))) m.set(lx(o), ly(o), Infinity);
      return m; };
  }
  function distribute(positions, agents) {
    if (!agents.length) return {}; if (agents.length > positions.length) agents = agents.slice(0, positions.length);
    const result = {}, weights = positions.map(p => ({ pos: p, weight: 100 }));
    while (agents.length) { const creep = agents.shift(), place = maxBy(weights, x => x.weight); weights.splice(weights.indexOf(place), 1); result[50 * lx(place.pos) + ly(place.pos)] = creep;
      for (const x of weights) x.weight -= Math.max(0, weights.length - dist(x.pos, place.pos)); }
    return result;
  }
  const CREEP_BEHAVIORS = {
    coordinated(creep, ctx) {
      const { spots, E, I, defenders, core } = ctx, safe = createSafeMatrixCallback(ctx), creeps = defenders.slice();
      for (const spot in spots) { const c = E.w.creeps.find(x => x.id === spots[spot]); const i = creeps.indexOf(c); if (i >= 0) creeps.splice(i, 1); if (!c) continue;
        if (50 * lx(c) + ly(c) == spot) continue; const [rx, ry] = ctx.rk.split(',').map(Number);
        frWalkTo(E, c, { x: rx * ROOM + Math.floor(spot / 50), y: ry * ROOM + spot % 50 }, { range: 0, costCallback: safe }, ctx); }
      if (core.spawning) for (const c of creeps) if (dist(c, core) === 1) { const d = frFlee(E, c, [core], 2); if (d) { I.set(c.id, 'move', { direction: d }); return true; } }
    },
    'simple-melee'(creep, ctx) {
      const { hostiles, I, E } = ctx; if (!hostiles.length) return; const safe = createSafeMatrixCallback(ctx);
      const t = frClosestByPath(E, creep, hostiles, { costCallback: safe }); if (!t) return;
      if (dist(creep, t) <= 1) I.set(creep.id, 'attack', { id: t.id }); else frWalkTo(E, creep, t, { costCallback: safe }, ctx);
    },
    fortifier(creep, ctx) {
      const { ramparts, I, E } = ctx; if (!(creep.store && creep.store.energy) || !ramparts.length) return;
      const rep = ramparts.filter(r => r.hitsTarget && r.hits < r.hitsTarget); if (!rep.length) return; const t = rep[0];
      if (dist(creep, t) <= 3) { I.set(creep.id, 'repair', { id: t.id }); return; }
      frWalkTo(E, creep, t, { range: 3, costCallback: createSafeMatrixCallback(ctx) }, ctx);
      const tin = rep.filter(r => dist(creep, r) <= 3)[0]; if (tin) I.set(creep.id, 'repair', { id: tin.id });
    }
  };
  function handleController(ctx) { const { core, I, ctrl } = ctx, t = ctx.E.w.time; if (!ctrl) return;
    if (ctrl.owner === core.owner) { if (ctrl.downgradeTime - t < SC.INVADER_CORE_CONTROLLER_DOWNGRADE - 25) I.set(core.id, 'upgradeController', { id: ctrl.id }); }
    else if (!ctrl.reservation || ctrl.reservation.owner === core.owner) I.set(core.id, 'reserveController', { id: ctrl.id });
    else I.set(core.id, 'attackController', { id: ctrl.id }); }
  function refillTowers(ctx) { const { core, I, towers, ramparts } = ctx; if (towerRefillChance[core.level || 0] < rnd()) return false;
    const u = towers.filter(t => (t.store.energy || 0) <= 2 * SC.TOWER_ENERGY_COST && ramparts.some(r => r.x === t.x && r.y === t.y));
    if (u.length) { const t = minBy(u, x => x.store.energy || 0); I.set(core.id, 'transfer', { id: t.id, amount: SC.TOWER_CAPACITY - (t.store.energy || 0), resourceType: 'energy' }); return true; } return false; }
  function refillCreeps(ctx) { const { core, I, defenders, E } = ctx;
    const u = defenders.filter(c => { const cap = storeCap(E.w, c); return cap > 0 && 2 * (c.store.energy || 0) <= cap; });
    if (u.length) { const c = minBy(u, x => x.store.energy || 0); I.set(core.id, 'transfer', { id: c.id, amount: storeCap(E.w, c) - (c.store.energy || 0), resourceType: 'energy' }); return true; } return false; }
  function towersMaintenance(ctx) { const { I, towers, ramparts, damagedDefenders, damagedRoads } = ctx; if (!towers.length || (!damagedDefenders.length && !damagedRoads.length)) return;
    const pc = damagedDefenders.filter(d => ramparts.some(r => r.x === d.x && r.y === d.y));
    if (pc.length) { const tw = towers[0]; I.set(tw.id, 'heal', { id: pc[0].id }); towers.splice(0, 1); return; }
    const pr = damagedRoads.filter(r => ramparts.some(x => x.x === r.x && x.y === r.y));
    if (pr.length) { const tw = towers[0]; I.set(tw.id, 'repair', { id: damagedRoads[0].id }); towers.splice(0, 1); } }
  function shootTarget(ctx, target) { const { I, defenders } = ctx;
    for (const m of defenders.filter(d => dist(d, target) === 1 && d.body.includes('attack'))) I.set(m.id, 'attack', { id: target.id });
    for (const r of defenders.filter(d => dist(d, target) <= 3 && d.body.includes('ranged_attack'))) { if (dist(r, target) === 1) I.set(r.id, 'rangedMassAttack', {}); else I.set(r.id, 'rangedAttack', { id: target.id }); } }
  function focusClosest(ctx) { const { core, I, hostiles, towers } = ctx; if (!hostiles.length) return false; const target = minBy(hostiles, c => dist(c, core)); if (!target) return false;
    for (const t of towers) I.set(t.id, 'attack', { id: target.id }); shootTarget(ctx, target); return true; }
  function focusMax(ctx) { const { I, defenders, hostiles, towers, E } = ctx, t0 = E.w.time; if (!hostiles.length) return false;
    const active = towers.filter(t => (t.store.energy || 0) >= SC.TOWER_ENERGY_COST);
    const target = maxBy(hostiles, c => { let dmg = 0;
      for (const tw of active) { let r = dist(c, tw), a = SC.TOWER_POWER_ATTACK; if (r > SC.TOWER_OPTIMAL_RANGE) { if (r > SC.TOWER_FALLOFF_RANGE) r = SC.TOWER_FALLOFF_RANGE; a -= a * SC.TOWER_FALLOFF * (r - SC.TOWER_OPTIMAL_RANGE) / (SC.TOWER_FALLOFF_RANGE - SC.TOWER_OPTIMAL_RANGE); }
        for (const pw of [SC.PWR_OPERATE_TOWER, SC.PWR_DISRUPT_TOWER]) { const f = (tw.effects || []).find(e => e.power === pw); if (f && f.endTime > t0) a *= SC.POWER_INFO[pw].effect[f.level - 1]; } dmg += Math.floor(a); }
      for (const d of defenders) { if (dist(d, c) <= 3 && d.body.includes('ranged_attack')) dmg += boostPower(d, 'ranged_attack', 'rangedAttack') * SC.RANGED_ATTACK_POWER; if (dist(d, c) <= 1 && d.body.includes('attack')) dmg += boostPower(d, 'attack', 'attack') * SC.ATTACK_POWER; }
      return dmg; });
    shootTarget(ctx, target); for (const t of active) I.set(t.id, 'attack', { id: target.id }); return true; }
  function maintainPopulation(ctx) { const { core, I, defenders } = ctx; if (!core.population) return;
    core.population.forEach((p, i) => { const name = 'defender' + i, c = defenders.find(d => d.name === name), beh = CREEP_BEHAVIORS[p.behavior];
      if (c && beh) { beh(c, ctx); return; }
      if (!core.spawning && !ctx._spawning) { I.set(core.id, 'createCreep', { name, body: BODIES[p.body].body, boosts: BODIES[p.body].boosts }); ctx._spawning = true; } }); }
  function antinuke(ctx) { const { core, ramparts, objs, E } = ctx; if (E.w.time % 10) return; const nukes = (E.w.nukes || []).filter(n => rkOf(n) === ctx.rk), base = SC.STRONGHOLD_RAMPART_HITS[core.level];
    for (const r of ramparts) { if (objs.some(o => o.type === 'container' && o.x === r.x && o.y === r.y)) continue; let ht = base;
      for (const n of nukes) { const d = dist(r, n); if (d === 0) { ht += SC.NUKE_DAMAGE[0]; continue; } if (d <= 2) ht += SC.NUKE_DAMAGE[2]; } if (r.hitsTarget !== ht) r.hitsTarget = ht; } }
  function assignDefenders(ctx) { let rs = [], ms = [];
    for (const h of ctx.hostiles) { ms.push(...ctx.ramparts.filter(r => dist(h, r) <= 1)); rs.push(...ctx.ramparts.filter(r => dist(h, r) <= 3)); }
    ms = [...new Set(ms)]; rs = [...new Set(rs)].filter(r => !ms.includes(r)); const rangers = [], melees = [];
    for (const d of ctx.defenders) { if (d.body.includes('attack')) melees.push(d.id); if (d.body.includes('ranged_attack')) rangers.push(d.id); }
    let spots = {}; if (ms.length && melees.length) spots = distribute(ms, melees); if (rs.length && rangers.length) Object.assign(spots, distribute(rs, rangers)); return spots; }
  function deployStronghold(ctx) {
    const { E, core, ramparts } = ctx, w = E.w; if (!(core.deployTime && core.deployTime <= 1 + w.time)) return;
    const duration = Math.round(SC.STRONGHOLD_DECAY_TICKS * (0.9 + rnd() * 0.2)), decayTime = w.time + duration, collapse = () => ({ effect: SC.EFFECT_COLLAPSE_TIMER, power: SC.EFFECT_COLLAPSE_TIMER, endTime: decayTime, duration });
    core.effects = (core.effects || []).concat([collapse()]); core.deployTime = null; core.decayTime = decayTime; core.collapseAt = decayTime; core.hits = core.hitsMax = SC.INVADER_CORE_HITS;
    for (const r of ramparts) E.removeStruct(r);
    const tpl = SH.templates[core.templateName];
    for (const i of tpl.structures) { const x = core.x + i.dx, y = core.y + i.dy;
      for (const o of roomObjects(w, ctx.rk).filter(o => !o.strongholdId && o.x === x && o.y === y)) {
        if (o.kind === 'creep') E.killCreep(o, SC.CREEP_CORPSE_RATE);
        if (o.kind === 'site') { w.sites.splice(w.sites.indexOf(o), 1); if (o.progress > 1) E.dropAt(o.x, o.y, 'energy', Math.floor(o.progress / 2)); }
        if ((o.kind === 'structure' || o.kind === 'spawn') && SC.CONSTRUCTION_COST[typeOf(o)]) { E.ruinOf(o); E.removeStruct(o); } }
      if (i.type === 'invaderCore') continue;
      const s = { kind: 'structure', id: 'st' + (w.nextId++), type: i.type, owner: null, x, y, strongholdId: core.strongholdId, decayTime, collapseAt: decayTime, effects: [collapse()] };
      if (i.type === 'rampart') Object.assign(s, { hits: SC.STRONGHOLD_RAMPART_HITS[tpl.rewardLevel], hitsMax: SC.RAMPART_HITS_MAX[8], hitsTarget: SC.STRONGHOLD_RAMPART_HITS[core.level], decayAt: decayTime });
      if (i.type === 'tower') Object.assign(s, { hits: SC.TOWER_HITS, hitsMax: SC.TOWER_HITS, store: { energy: SC.TOWER_CAPACITY }, cooldown: 0 });
      if (i.type === 'container') Object.assign(s, { notifyAttacked: false, hits: SC.CONTAINER_HITS, hitsMax: SC.CONTAINER_HITS, decayAt: decayTime, store: calcReward(SH.containerRewards, SH.containerAmounts[tpl.rewardLevel], 3) });
      if (i.type === 'road') Object.assign(s, { notifyAttacked: false, hits: SC.ROAD_HITS, hitsMax: SC.ROAD_HITS, decayAt: decayTime });
      if (i.type === 'tower' || i.type === 'rampart') s.owner = core.owner;
      w.structures.push(s); }
    E._objVer++; E._o = null;
  }
  const BEHAVIORS = {
    deploy(ctx) { handleController(ctx); deployStronghold(ctx); },
    default(ctx) { handleController(ctx); refillTowers(ctx); focusClosest(ctx); },
    bunker1(ctx) { handleController(ctx); refillTowers(ctx) || refillCreeps(ctx); focusClosest(ctx); },
    bunker2(ctx) { handleController(ctx); refillTowers(ctx) || refillCreeps(ctx); if (!ctx.core.population) ctx.core.population = [{ body: 'weakDefender', behavior: 'simple-melee' }]; maintainPopulation(ctx); focusClosest(ctx); },
    bunker3(ctx) { handleController(ctx); refillTowers(ctx); if (!ctx.core.population) ctx.core.population = [{ body: 'fullDefender', behavior: 'simple-melee' }, { body: 'fullDefender', behavior: 'simple-melee' }]; maintainPopulation(ctx); focusClosest(ctx); },
    bunker4(ctx) { handleController(ctx); refillTowers(ctx) || refillCreeps(ctx);
      if (!ctx.core.population) { const deck = [{ body: 'fortifier', behavior: 'fortifier' }].concat(Array(4).fill({ body: 'boostedDefender', behavior: 'coordinated' }), Array(3).fill({ body: 'boostedRanger', behavior: 'coordinated' })); ctx.core.population = shuffle(deck).slice(0, 4).map(x => Object.assign({}, x)); }
      ctx.spots = assignDefenders(ctx); maintainPopulation(ctx); towersMaintenance(ctx); focusMax(ctx); },
    bunker5(ctx) { handleController(ctx); refillTowers(ctx) || refillCreeps(ctx);
      if (!ctx.core.population) { const deck = shuffle([{ body: 'fortifier', behavior: 'fortifier' }].concat(Array(7).fill({ body: 'fullBoostedMelee', behavior: 'coordinated' }), Array(9).fill({ body: 'fullBoostedRanger', behavior: 'coordinated' }))); ctx.core.population = [{ body: 'fortifier', behavior: 'fortifier' }].concat(shuffle(deck).slice(0, 8).map(x => Object.assign({}, x))); }
      antinuke(ctx); ctx.spots = assignDefenders(ctx); maintainPopulation(ctx); towersMaintenance(ctx); focusMax(ctx); }
  };
  function corePretick(E, core, I) {
    const w = E.w, rk = rkOf(core), objs = roomObjects(w, rk), beh = core.deployTime ? 'deploy' : core.strongholdBehavior || 'default'; if (!BEHAVIORS[beh]) return;
    const creeps = [], defenders = [], damagedDefenders = [], hostiles = [], towers = [], ramparts = [], damagedRoads = [];
    for (const o of objs) { const t = typeOf(o);
      if ((t === 'creep' || t === 'powerCreep') && !o.spawning) { creeps.push(o); if (o.owner === core.owner) { defenders.push(o); if (o.hits < hitsMaxOf(o)) damagedDefenders.push(o); } else if (o.owner !== KEEPER) hostiles.push(o); continue; }
      if (t === 'tower' && o.owner === core.owner) { towers.push(o); continue; }
      if (t === 'rampart' && o.owner === core.owner) { ramparts.push(o); continue; }
      if (core.strongholdId === o.strongholdId && t === 'road' && o.hits < o.hitsMax) damagedRoads.push(o); }
    BEHAVIORS[beh]({ E, I, rk, objs, creeps, defenders, damagedDefenders, hostiles, towers, ramparts, damagedRoads, ctrl: ctrlOfRoom(w, rk), core });
  }
  // 核心的 intent（invader-core/createCreep / transfer / reserveController / attackController / upgradeController）
  function coreIntent(E, core, name, d) {
    const w = E.w, T = d.id && (w.creeps.find(c => c.id === d.id) || w.structures.find(s => s.id === d.id) || w.controllers.find(c => c.id === d.id));
    if (name === 'createCreep') { if (core.spawning || !core.level || !SC.INVADER_CORE_CREEP_SPAWN_TIME[core.level]) return;
      const body = [], boosts = []; d.body.slice(0, SC.MAX_CREEP_SIZE).forEach((type, i) => { if (!SC.BODYPARTS_ALL.includes(type)) return; body.push(type); boosts.push(d.boosts && d.boosts.length >= i && SC.BOOSTS[type] && SC.BOOSTS[type][d.boosts[i]] ? d.boosts[i] : undefined); });
      w.creeps.push({ kind: 'creep', id: 'c' + (w.nextId++), owner: core.owner, name: d.name, body, boosts, hits: body.length * 100, x: core.x, y: core.y, px: core.x, py: core.y, store: { energy: 0 }, ttl: (core.decayTime || w.time + SC.CREEP_LIFE_TIME) - w.time, fatigue: 0, spawning: true, strongholdId: core.strongholdId, notifyAttacked: false, ageTime: core.decayTime });
      const need = SC.INVADER_CORE_CREEP_SPAWN_TIME[core.level] * body.length; core.spawning = { name: d.name, needTime: need, spawnTime: w.time + need }; E._o = null; return; }
    if (name === 'transfer') { if (!T || !(T.kind === 'creep' || T.type === 'tower')) return; const tot = T.kind === 'creep' ? storeSum(T.store) : (T.store.energy || 0), cap = T.kind === 'creep' ? storeCap(w, T) : SC.TOWER_CAPACITY;
      if (tot === cap) return; let a = d.amount; if (tot + a > cap) a = cap - tot; T.store.energy = (T.store.energy || 0) + a; E.elog(core, SC.EVENT_TRANSFER, { targetId: T.id, resourceType: 'energy', amount: a }); E.events.push({ t: 'transfer', fx: core.x, fy: core.y, x: T.x, y: T.y }); return; }
    if (!T || T.kind !== 'controller') return;
    if (name === 'reserveController') { if (T.owner || (T.reservation && T.reservation.owner !== core.owner)) return; if (!T.reservation) T.reservation = { owner: core.owner, endTime: w.time + 1 };
      const e = SC.INVADER_CORE_CONTROLLER_POWER * SC.CONTROLLER_RESERVE; if (T.reservation.endTime + e > w.time + SC.CONTROLLER_RESERVE_MAX) return; T.reservation.endTime += e; E.elog(core, SC.EVENT_RESERVE_CONTROLLER, { amount: e }); return; }
    if (name === 'attackController') { if (core.spawning) return; if (!T.owner && !T.reservation) return; if ((T.owner !== core.owner && T.safeMode > w.time) || T.upgradeBlocked > w.time) return;
      if (T.reservation) T.reservation.endTime -= Math.floor(SC.INVADER_CORE_CONTROLLER_POWER * SC.CONTROLLER_RESERVE);
      if (T.owner) { T.downgradeTime -= Math.floor(SC.INVADER_CORE_CONTROLLER_POWER * SC.CONTROLLER_CLAIM_DOWNGRADE); T.upgradeBlocked = w.time + SC.CONTROLLER_ATTACK_BLOCKED_UPGRADE; }
      E.elog(core, SC.EVENT_ATTACK_CONTROLLER, {}); return; }
    if (name === 'upgradeController') { if (T.level === 0 || T.owner !== core.owner) return; if (T.upgradeBlocked && T.upgradeBlocked > w.time) return;
      const f = eff(T, SC.EFFECT_INVULNERABILITY); if (f) f.endTime = w.time + SC.INVADER_CORE_CONTROLLER_DOWNGRADE; else T.effects = [{ effect: SC.EFFECT_INVULNERABILITY, endTime: w.time + SC.INVADER_CORE_CONTROLLER_DOWNGRADE, duration: SC.INVADER_CORE_CONTROLLER_DOWNGRADE }];
      T.downgradeTime = w.time + SC.INVADER_CORE_CONTROLLER_DOWNGRADE; T._upgraded = (T._upgraded || 0) + 1; E.elog(core, SC.EVENT_UPGRADE_CONTROLLER, { amount: 1, energySpent: 0 }); }
  }
  // ---------- cron：genStrongholds / spawnStronghold / selectRoom / expandStronghold（backend-local strongholds.js） ----------
  const noObs = new Set(SC.OBSTACLE_OBJECT_TYPES.concat(['rampart']));
  function spawnStronghold(E, rk, opts = {}) {
    const w = E.w; if (!opts.deployTime) opts.deployTime = 1; const user = opts.user || INVADER, [rx, ry] = rk.split(',').map(Number), ox = rx * ROOM, oy = ry * ROOM;
    const names = opts.templateName ? [opts.templateName] : Object.keys(SH.templates), objs = roomObjects(w, rk).filter(o => noObs.has(typeOf(o)));
    const ctrl = ctrlOfRoom(w, rk); if (ctrl && (ctrl.owner || (ctrl.reservation && ctrl.reservation.owner !== user))) return 'room occupied';
    const occ = new Set(objs.map(o => lx(o) + ',' + ly(o))), spots = {};
    if (opts.x != null && opts.y != null && opts.templateName) spots[opts.templateName] = [{ x: opts.x, y: opts.y }];
    else for (let x = 4; x < 45; x++) for (let y = 4; y < 45; y++) for (const t of names) if (SH.templates[t].structures.every(s => E.tile(ox + x + s.dx, oy + y + s.dy) !== T_WALL && !occ.has((x + s.dx) + ',' + (y + s.dy)))) (spots[t] = spots[t] || []).push({ x, y });
    if (!Object.keys(spots).length) return 'No spots';
    const tn = sample(Object.keys(spots)), tpl = SH.templates[tn], spot = sample(spots[tn]), depositType = sample(Object.keys(SH.coreRewards)), deployTime = w.time + opts.deployTime, strongholdId = roomNameXY(rx, ry) + '_' + w.time;
    for (const i of tpl.structures) { const x = ox + spot.x + i.dx, y = oy + spot.y + i.dy;
      if (i.type === 'invaderCore') w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'invaderCore', owner: user, x, y, level: i.level, strongholdBehavior: i.strongholdBehavior, templateName: tn, hits: SC.INVADER_CORE_HITS, hitsMax: SC.INVADER_CORE_HITS, nextExpandTime: deployTime + SC.INVADER_CORE_EXPAND_TIME[i.level], depositType, deployTime, strongholdId, notifyAttacked: false, effects: [{ effect: SC.EFFECT_INVULNERABILITY, power: SC.EFFECT_INVULNERABILITY, endTime: deployTime, duration: STRONGHOLD_DEPLOY_TIME }] });
      if (i.type === 'rampart') w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'rampart', owner: user, x, y, hits: 1, hitsMax: 1, isPublic: true, strongholdId, decayAt: deployTime, notifyAttacked: false }); }
    if (ctrl) Object.assign(ctrl, { owner: user, level: 8, progress: 0, downgradeTime: deployTime, effects: [{ effect: SC.EFFECT_INVULNERABILITY, power: SC.EFFECT_INVULNERABILITY, endTime: deployTime, duration: STRONGHOLD_DEPLOY_TIME }] });
    E._objVer++; E._o = null; return { templateName: tn, x: spot.x, y: spot.y, strongholdId };
  }
  function selectRoom(E, centerRk) {
    const w = E.w, sec = sectorOf(centerRk), list = Object.keys(w.rooms).filter(k => sectorOf(k) === sec);
    const ok = list.filter(k => { const [x, y] = k.split(',').map(Number); if (w.rooms[k].type === 'highway' || !isCenter(x, y) || isVeryCenter(x, y)) return false;
      const c = ctrlOfRoom(w, k); if (!c) return true; if (c.owner || c.reservation) return false; return !w.creeps.some(o => rkOf(o) === k && o.body.includes('claim')); });
    if (ok.length) return spawnStronghold(E, sample(ok), { deployTime: STRONGHOLD_DEPLOY_TIME });
  }
  function genStrongholds(E) { const w = E.w;
    const centers = Object.keys(w.rooms).filter(k => { const [x, y] = k.split(',').map(Number); return isVeryCenter(x, y) && x < w.S && y < w.S; });
    const coreRooms = new Set(w.structures.filter(s => s.type === 'invaderCore').map(rkOf).concat((w.ruins || []).filter(r => r.structureType === 'invaderCore').map(rkOf)).map(sectorOf));
    const out = []; for (const c of centers) if (!coreRooms.has(sectorOf(c))) out.push(selectRoom(E, c)); return out; }
  function mapGrid(E) { const w = E.w, g = {};
    for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number), ox = rx * ROOM, oy = ry * ROOM, d = {};
      const cnt = (f) => { let n = 0; for (let i = 0; i < 50; i++) { const [x, y] = f(i); if (E.tile(ox + x, oy + y) !== T_WALL) n++; } return n; };
      const t = cnt(i => [i, 0]), r = cnt(i => [49, i]), b = cnt(i => [i, 49]), l = cnt(i => [0, i]); if (t) d.t = t; if (r) d.r = r; if (b) d.b = b; if (l) d.l = l; g[k] = d; }
    return g; }
  function findFreePos(E, rk, distance, rect) { const [rx, ry] = rk.split(',').map(Number), ox = rx * ROOM, oy = ry * ROOM, objs = roomObjects(E.w, rk).filter(o => SC.OBSTACLE_OBJECT_TYPES.concat(['rampart', 'portal']).includes(typeOf(o)));
    let x, y, spot, has, n = 0;
    do { x = rect.x1 + Math.floor(rnd() * (rect.x2 - rect.x1)); y = rect.y1 + Math.floor(rnd() * (rect.y2 - rect.y1)); spot = true;
      for (let dx = -distance; dx <= distance; dx++) for (let dy = -distance; dy <= distance; dy++) if (E.tile(ox + x + dx, oy + y + dy) === T_WALL) spot = false;
      has = objs.some(o => Math.abs(lx(o) - x) <= distance && Math.abs(ly(o) - y) <= distance); n++; } while ((!spot || has) && n < 500);
    return !spot || has ? null : { x: ox + x, y: oy + y }; }
  function expandStronghold(E, core, grid) {
    const w = E.w, zone = k => { const [x, y] = k.split(',').map(Number); return !!E.zoneOf(x, y); }; grid = grid || mapGrid(E);
    if (zone(rkOf(core))) return false; core.nextExpandTime = w.time + SC.INVADER_CORE_EXPAND_TIME[core.level];
    const open = [rkOf(core)], closed = []; let found;
    do { const room = open.shift(); closed.push(room); const [x, y] = room.split(',').map(Number);
      for (const dir of shuffle(Object.keys(grid[room] || {}))) { const dx = dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dy = dir === 't' ? -1 : dir === 'b' ? 1 : 0, nk = (x + dx) + ',' + (y + dy);
        if (!grid[nk]) continue; if (/(W|E)\d*0/.test(roomNameXY(x + dx, y + dy)) || /(N|S)\d*0/.test(roomNameXY(x + dx, y + dy))) continue; if (zone(nk)) continue;
        const c = ctrlOfRoom(w, nk), hasCore = w.structures.some(s => s.type === 'invaderCore' && rkOf(s) === nk);
        if (c && !c.owner && !hasCore) { found = { rk: nk, c }; break; }
        if ((!c || hasCore) && !open.includes(nk) && !closed.includes(nk)) open.push(nk); } }
    while (!found && open.length);
    if (!found) return false; const c = found.c, p = findFreePos(E, found.rk, 1, { x1: Math.max(1, lx(c) - 5), x2: Math.min(48, lx(c) + 5), y1: Math.max(1, ly(c) - 5), y2: Math.min(48, ly(c) + 5) }); if (!p) return false;
    w.structures.push({ kind: 'structure', id: 'st' + (w.nextId++), type: 'invaderCore', level: 0, owner: INVADER, x: p.x, y: p.y, hits: SC.INVADER_CORE_HITS, hitsMax: SC.INVADER_CORE_HITS, strongholdId: core.strongholdId, notifyAttacked: false, effects: JSON.parse(JSON.stringify(core.effects || [])), collapseAt: core.collapseAt, decayTime: core.decayTime });
    E._objVer++; E._o = null; return true;
  }
  function expandStrongholds(E) { const g = mapGrid(E); for (const c of E.w.structures.filter(s => s.type === 'invaderCore' && !s.deployTime && s.level > 0 && s.nextExpandTime < E.w.time)) expandStronghold(E, c, g); }
  // ---------- cron：genInvaders / createRaid（backend-local cronjobs.js） ----------
  const RAID = {
    bigHealer: [].concat(Array(24).fill('move'), Array(25).fill('heal'), ['move']),
    bigRanged: [].concat(Array(6).fill('tough'), Array(24).fill('move'), Array(18).fill('ranged_attack'), ['work', 'move']),
    bigMelee: [].concat(Array(16).fill('tough'), Array(24).fill('move'), Array(3).fill('ranged_attack'), Array(4).fill('work'), Array(2).fill('attack'), ['move']),
    smallHealer: ['move', 'move', 'move', 'move', 'heal', 'heal', 'heal', 'heal', 'heal', 'move'],
    smallRanged: ['tough', 'tough', 'move', 'move', 'move', 'move', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'move'],
    smallMelee: ['tough', 'tough', 'move', 'move', 'move', 'move', 'ranged_attack', 'work', 'attack', 'move']
  };
  function createCreep(E, type, rk, sq, boosted) { const w = E.w, [rx, ry] = rk.split(',').map(Number), C = isCenter(rx, ry), body = RAID[type].slice();
    const B = { heal: C ? 'XLHO2' : 'LO', ranged_attack: C ? 'XKHO2' : 'KO', work: C ? 'XZH2O' : 'ZH', attack: C ? 'XUH2O' : 'UH', tough: C ? 'XGHO2' : 'GO' };
    const c = { kind: 'creep', id: 'c' + (w.nextId++), owner: INVADER, name: 'invader_' + roomNameXY(rx, ry) + '_' + Math.floor(rnd() * 1000), body, boosts: boosted ? body.map(p => B[p]) : [], hits: body.length * 100, ttl: 1500, x: sq[0], y: sq[1], px: sq[0], py: sq[1], fatigue: 0, store: {}, notifyAttacked: false };
    w.creeps.push(c); E._o = null; return c; }
  function createRaid(E, level, rk, exits) {
    const [rx, ry] = rk.split(',').map(Number), C = isCenter(rx, ry), type = level && level >= 4 ? 'big' : 'small'; let max = 1, count = 1, boostChance = 0.5;
    if (rnd() > 0.9 || C) { max = 2; boostChance = type === 'big' ? 0 : 0.5;
      if (rnd() > 0.8 || C) { max = 5; if (type === 'big') { if (level < 5) max = 2; else if (level < 6) max = 2; else if (level < 7) max = 3; else if (level < 8) { boostChance = 0.4; max = 3; } else { boostChance = 0.4; max = 5; } } }
      count = Math.floor(rnd() * (max - 1)) + 2; count = Math.min(count, exits.length); }
    const out = []; let last;
    for (let i = 0; i < count; i++) { const sub = i === 0 && !C ? 'Melee' : i === 0 || (i === 1 || i === 2 && count === 5) && rnd() > 0.5 ? 'Ranged' : 'Healer';
      const sq = last ? exits.slice().sort((a, b) => Math.max(Math.abs(a[0] - last[0]), Math.abs(a[1] - last[1])) - Math.max(Math.abs(b[0] - last[0]), Math.abs(b[1] - last[1])))[0] : exits[Math.floor(rnd() * exits.length)];
      if (!sq) break; out.push(createCreep(E, type + sub, rk, sq, rnd() < boostChance)); exits.splice(exits.indexOf(sq), 1); last = sq; }
    return out; }
  function genInvaders(E) { const w = E.w, out = [];
    for (const k in w.rooms) { const [rx, ry] = k.split(',').map(Number); if (rx >= w.S || ry >= w.S) continue; const rm = w.rooms[k];
      if (w.creeps.some(c => c.owner === INVADER && rkOf(c) === k)) continue;
      const srcs = w.sources.filter(s => rkOf(s) === k), harvested = srcs.reduce((a, s) => a + (s.invaderHarvested || 0), 0), goal = rm.invaderGoal || SC.INVADERS_ENERGY_GOAL;
      if (goal != 1 && harvested < goal) continue;
      const sec = sectorOf(k); if (!w.structures.some(s => s.type === 'invaderCore' && s.level > 0 && sectorOf(rkOf(s)) === sec)) continue;
      const ox = rx * ROOM, oy = ry * ROOM, ex = { top: [], left: [], right: [], bottom: [] };
      for (let i = 0; i < 49; i++) { if (E.tile(ox + i, oy) !== T_WALL) ex.top.push([ox + i, oy]); if (E.tile(ox + i, oy + 49) !== T_WALL) ex.bottom.push([ox + i, oy + 49]); if (E.tile(ox, oy + i) !== T_WALL) ex.left.push([ox, oy + i]); if (E.tile(ox + 49, oy + i) !== T_WALL) ex.right.push([ox + 49, oy + i]); }
      const exits = Object.keys(ex).filter(e => ex[e].length).filter(e => { const nx = rx + (e === 'right') - (e === 'left'), ny = ry + (e === 'bottom') - (e === 'top'), c = ctrlOfRoom(w, nx + ',' + ny); return !(c && (c.owner || c.reservation)); });
      if (!exits.length) continue; const exit = exits[Math.floor(rnd() * exits.length)], c = ctrlOfRoom(w, k);
      out.push(...createRaid(E, c && c.owner && c.level, k, ex[exit]));
      let g = Math.floor(SC.INVADERS_ENERGY_GOAL * (rnd() * 0.6 + 0.7)); if (rnd() < 0.1) g *= Math.floor(rnd() > 0.5 ? 2 : 0.5); rm.invaderGoal = g;
      for (const s of srcs) s.invaderHarvested = 0; }
    return out; }
  // ---------- 用 API 执行 NPC intent（与玩家相同的校验/结算） ----------
  function runNpc(E, pid, list) {
    const w = E.w; if (!Object.keys(list).length) return; const had = w.players[pid], hadM = w.memory[pid];
    if (!had) w.players[pid] = { name: NPC_NAME[pid] || pid, gcl: 0, bucket: 0, npc: true }; if (!hadM) w.memory[pid] = {};
    try { const api = E.buildApi(pid), get = id => api.Game.getObjectById(id);
      for (const id in list) { const it = list[id], core = w.structures.find(s => s.id === id && s.type === 'invaderCore');
        if (core) { for (const n in it) coreIntent(E, core, n, it[n]); continue; }
        const v = get(id); if (!v) continue;
        for (const n in it) { const d = it[n], T = d.id != null ? get(d.id) : null;
          try { if (n === 'move') v.move(d.direction); else if (n === 'rangedMassAttack') v.rangedMassAttack(); else if (n === 'suicide') v.suicide(); else if (T && typeof v[n] === 'function') v[n](T); } catch (e) { /* NPC intent 无效即忽略（同官方 processor） */ } } }
      E.flushIntents(pid);
    } finally { if (!had) delete w.players[pid]; if (!hadM) delete w.memory[pid]; if (E._cls) delete E._cls[pid]; }
  }
  const _kai = P.keeperAI;
  P.keeperAI = function () { _kai.call(this); const w = this.w, I = mkIntents();
    for (const c of w.creeps.slice()) { if (c.owner !== INVADER || c.spawning || c.strongholdId || c.hits <= 0) continue; const ctx = invCtx(this, c, I);
      if (c.body.includes('heal')) healer(c, ctx); else findAttack(c, ctx); shootAtWill(c, ctx); }
    const cores = {}; for (const s of w.structures) if (s.type === 'invaderCore' && s.owner) cores[rkOf(s)] = s; // 官方：每房间处理一个 invaderCore
    for (const k in cores) corePretick(this, cores[k], I);
    runNpc(this, INVADER, I.list); };
  // 核心 tick（invader-core/tick.js）+ 坍塌计时（processor.js EFFECT_COLLAPSE_TIMER）+ cron
  const _tick = P.tick;
  P.tick = function () { _tick.call(this); const w = this.w;
    for (const core of w.structures.filter(s => s.type === 'invaderCore')) {
      if (core.collapseAt != null && core.collapseAt <= w.time) { const c = ctrlOfRoom(w, rkOf(core)); if (c) resetCtrl(c); continue; }
      if (core.spawning && w.time >= core.spawning.spawnTime - 1) { const cr = w.creeps.find(c => c.spawning && c.name === core.spawning.name && c.x === core.x && c.y === core.y);
        let pos = null; if (cr) for (let d = 1; d <= 8; d++) { const [dx, dy] = DIRS[d]; if (!this.blocked(core.x + dx, core.y + dy)) { pos = { x: core.x + dx, y: core.y + dy }; break; } }
        if (!cr) core.spawning = null; else if (pos) { cr.spawning = false; if (cr.ageTime) cr.ttl = cr.ageTime - w.time; cr.x = pos.x; cr.y = pos.y; cr.px = core.x; cr.py = core.y; core.spawning = null; this._o = null; this.events.push({ t: 'spawn', x: pos.x, y: pos.y, fx: core.x, fy: core.y }); }
        else core.spawning.spawnTime = w.time + 1; } }
    for (const s of w.structures.slice()) if (s.collapseAt != null && s.collapseAt <= w.time) this.removeStruct(s);
    for (const s of w.structures) if (s.strongholdId && s.type === 'rampart' && !s.isPublic) s.hitsMax = SC.RAMPART_HITS_MAX[8];

    if (w.time % CRON_STRONGHOLDS === 0) genStrongholds(this);
    if (w.time % CRON_INVADERS === 0) genInvaders(this);
    if (w.time % CRON_EXPAND === 0) expandStrongholds(this);
  };
  function resetCtrl(c) { Object.assign(c, { owner: null, level: 0, progress: 0, downgradeTime: null, safeMode: null, safeModeAvailable: 0, safeModeCooldown: null, isPowerEnabled: false, effects: null }); }
  // 摧毁核心：invader-core/destroy.js（重置 Controller，按 rewardLevel 生成战利品放进 Ruin）；Ruin 至少保留到坍塌时间（structures/_destroy.js）
  const _ruin = P.ruinOf;
  P.ruinOf = function (s) { const w = this.w;
    if (s.type === 'invaderCore') { const c = ctrlOfRoom(w, rkOf(s)); if (c) resetCtrl(c);
      if (s.depositType && SH.coreRewards[s.depositType] && s.templateName && SH.templates[s.templateName]) { const rl = SH.templates[s.templateName].rewardLevel;
        const rw = SH.coreRewards[s.depositType].slice(0, 1 + rl).map(r => Array.isArray(r) ? sample(r) : r), dn = SH.coreDensities.slice(0, 1 + rl), o = {}; rw.forEach((r, i) => { o[r] = dn[i]; });
        s.store = calcReward(o, SH.coreAmounts[rl]); } }
    _ruin.call(this, s); const r = w.ruins[w.ruins.length - 1]; if (r && s.collapseAt != null) r.decayAt = Math.max(r.decayAt, s.collapseAt); };
  // 要塞 creep 死亡不掉落身体能量（_die.js：!object.strongholdId）
  const _kill = P.killCreep; P.killCreep = function (c, rate) { return _kill.call(this, c, c.strongholdId ? 0 : rate); };
  // ---------- notifyWhenAttacked（_damage.js / towers/attack.js → utils.sendAttackingNotification → driver.sendNotification） ----------
  P.notify = function (pid, message) { const w = this.w; if (!pid || !w.players[pid] || w.players[pid].npc) return; const L = (w.notifications = w.notifications || {})[pid] = w.notifications[pid] || [];
    const ex = L.find(n => n.message === message); if (ex) { ex.count++; ex.time = w.time; ex.date = Date.now(); L.splice(L.indexOf(ex), 1); L.push(ex); } else { L.push({ message, count: 1, time: w.time, date: Date.now(), type: 'msg' }); if (L.length > 100) L.shift(); }
    this.log(pid, '[通知]', message); if (this.onNotify) this.onNotify(pid, message); };
  P.attackNotify = function (target) { const w = this.w, ctrl = ctrlOfRoom(w, rkOf(target)), user = target.owner || (ctrl && ctrl.owner); if (!user || !w.players[user]) return;
    const label = target.kind === 'creep' ? 'creep ' + target.name : target.kind === 'spawn' ? 'spawn ' + target.name : (target.type || target.kind) + ' #' + target.id;
    this.notify(user, `你在房间 ${roomName(target.x, target.y)} 的 ${label} 正在遭受攻击！`); };
  const _dmg = P.damage;
  P.damage = function (target, amount, attackerOwner, src) { const w = this.w;
    if ((target.type === 'constructedWall' || target.type === 'rampart') && (target.effects || []).some(f => f.effect === SC.EFFECT_INVULNERABILITY && f.endTime > w.time)) return; // _damage.js：INVULNERABILITY
    const ramp = w.structures.find(s => s.type === 'rampart' && s.x === target.x && s.y === target.y), real = ramp && ramp !== target ? ramp : target;
    const ctrl = ctrlOfRoom(w, rkOf(target)), safe = ctrl && ctrl.safeMode > w.time && ctrl.owner !== attackerOwner;
    _dmg.call(this, target, amount, attackerOwner);
    if (!safe && (src === 'tower' || (attackerOwner !== INVADER && attackerOwner !== KEEPER)) && real.notifyAttacked !== false && !(real.kind === 'creep' && (real.owner === INVADER || real.owner === KEEPER))) this.attackNotify(real); };
  // ---------- 官方地图视图（processor.js mapView）：无视野房间也显示各玩家/NPC 对象的点、能量源、矿物、Controller、Keeper Lair ----------
  G.mapViewOf = function (w, vis) { const out = []; const add = (o, k) => { if (vis && vis.has(rkOf(o))) return; out.push([o.x, o.y, k]); };
    for (const c of w.creeps) if (!c.spawning) add(c, c.owner);
    for (const s of w.spawns) add(s, s.owner);
    for (const s of w.structures) { if (s.type === 'keeperLair') add(s, 'k'); else if (s.zoneWall) continue; else if (s.owner) { if (s.type !== 'rampart' || !s.isPublic) add(s, s.owner); } else if (s.type === 'constructedWall') add(s, 'w'); else if (s.type === 'road') add(s, 'r'); else if (s.type === 'powerBank') add(s, 'pb'); else if (s.type === 'portal') add(s, 'p'); }
    for (const c of w.controllers) if (c.owner) add(c, c.owner);
    return out; };
  const _ws = G.worldSnapshot; if (_ws) { G.worldSnapshot = function (w, ev, pid) { const v = _ws(w, ev, pid); const vis = pid ? visibleRooms(w, pid) : null; v.mapView = mapViewOf(w, vis);
    v.cores = w.structures.filter(s => s.type === 'invaderCore' && (!vis || vis.has(rkOf(s)))).map(s => ({ id: s.id, x: s.x, y: s.y, level: s.level, deploy: s.deployTime ? s.deployTime - w.time : 0 })); return v; };
    if (typeof worldSnapshot !== 'undefined') try { worldSnapshot = G.worldSnapshot; } catch (e) {} }
  G.NPC = { genInvaders, genStrongholds, spawnStronghold, expandStronghold, expandStrongholds, createRaid, calcReward, findPath, search, CostMatrix, SH, RAID, BODIES, isCenter, isVeryCenter, sectorOf, CRON_INVADERS, CRON_STRONGHOLDS, CRON_EXPAND, STRONGHOLD_DEPLOY_TIME };
})();
