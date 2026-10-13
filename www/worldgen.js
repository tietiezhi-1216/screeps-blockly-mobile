// 地图生成：移植自官方 screeps/backend-local lib/cli/map.js 的 generateRoom（元胞自动机地形 + 出口 + 能量源/Controller/矿物放在墙上）。
// 唯一改动：官方用 Math.random，这里用"种子 + 房间坐标"的确定性随机数，保证联机各端/读档结果一致。
const ROOM = 50;
const T_PLAIN = 0, T_WALL = 1, T_SWAMP = 2;
function hash32(...n) { let h = 2166136261 >>> 0; for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; } return h >>> 0; }
function rngFrom(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function vnoise(seed, x, y) { // 渲染用平滑值噪声
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, f = t => t * t * (3 - 2 * t);
  const r = (a, b) => hash32(seed, a, b) / 4294967296;
  const a = r(xi, yi), b = r(xi + 1, yi), c = r(xi, yi + 1), d = r(xi + 1, yi + 1), u = f(xf), v = f(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// 官方房间名：东/西 + 南/北。网格 (rx, ry) 映射为 E{rx}S{ry}（E0S0 起，向右向下增长，扩容时名字不变）
function roomNameXY(rx, ry) { return (rx < 0 ? 'W' + (-rx - 1) : 'E' + rx) + (ry < 0 ? 'N' + (-ry - 1) : 'S' + ry); }
function parseRoomName(n) { const m = /^([WE])(\d+)([NS])(\d+)$/.exec(n || ''); if (!m) return null; return [m[1] === 'W' ? -1 - m[2] : +m[2], m[3] === 'N' ? -1 - m[4] : +m[4]]; }

const WALL_TYPES = { 1: [0.4, 10, 5], 2: [0.2, 20, 4], 3: [0.2, 20, 4], 4: [0.3, 18, 4], 5: [0.3, 10, 4], 6: [0.3, 10, 4], 7: [0.3, 10, 4], 8: [0.35, 15, 4], 9: [0.3, 2, 4], 10: [0.35, 2, 4], 11: [0.35, 5, 4], 12: [0.35, 5, 4], 13: [0.25, 5, 4],
  14: [0.4, 3, 5], 15: [0.5, 3, 5], 16: [0.45, 4, 5], 17: [0.45, 6, 5], 18: [0.45, 10, 5], 19: [0.5, 10, 5], 20: [0.4, 3, 5], 21: [0.5, 2, 5], 22: [0.45, 4, 5], 23: [0.45, 6, 5], 24: [0.45, 10, 5], 25: [0.5, 10, 5], 26: [0.45, 10, 5], 27: [0.45, 6, 5], 28: [0.2, 20, 4] };
const SWAMP_TYPES = { 1: [0.3, 3, 5], 2: [0.35, 3, 5], 3: [0.45, 3, 5], 4: [0.25, 1, 5], 5: [0.25, 30, 4], 6: [0.52, 30, 5], 7: [0.45, 3, 5], 8: [0.3, 1, 5], 9: [0.3, 1, 4], 10: [0.3, 3, 5], 11: [0.3, 3, 5], 12: [0.3, 1, 5], 13: [0.25, 1, 5], 14: [0.35, 3, 5] };
const MINERAL_TYPES = ['H', 'H', 'H', 'H', 'H', 'H', 'O', 'O', 'O', 'O', 'O', 'O', 'Z', 'Z', 'Z', 'K', 'K', 'K', 'U', 'U', 'U', 'L', 'L', 'L', 'X'];

// 官方 _genExit：每条边一组出口格（2..47），两侧房间共用同一条边的随机数，所以天然对齐
function genExit(r) {
  const exitLength = Math.floor(r() * 43) + 1, intervalsCnt = [0, 0, 1, 1, 2][Math.floor(r() * 5)], exitStart = Math.floor(r() * (46 - exitLength)) + 2, iv = [];
  let curStart = exitStart;
  for (let j = 0; j < intervalsCnt; j++) {
    curStart += Math.floor(r() * (exitLength / (intervalsCnt * 2))) + 5;
    let length = Math.floor(r() * (exitLength / (intervalsCnt * 2))) + 5;
    if (length + curStart >= exitStart + exitLength - 5) length = exitStart + exitLength - curStart - 5;
    iv.push({ start: curStart, length }); curStart += length + 1;
  }
  const exit = [];
  for (let x = exitStart; x <= exitStart + exitLength; x++) {
    if (iv.some(i => i.length > 0 && x >= i.start && x <= i.start + i.length)) continue;
    if (x < 2 || x > 47) continue; exit.push(x);
  }
  if (!exit.length) exit.push(Math.min(47, Math.max(2, exitStart)));
  return exit;
}
// 边的出口：横向边 (ax,ay)-(ax+1,ay) 与纵向边 (ax,ay)-(ax,ay+1)
function edgeExits(seed, ax, ay, vertical) { return genExit(rngFrom(hash32(seed, ax, ay, vertical ? 2 : 1, 4242))); }

function smooth(cells, factor, key) { // key: 'wall' | 'swamp'；先取出布尔网格再计数（避免逐邻居属性查找）
  const out = new Array(2500), v = new Uint8Array(52 * 52), isW = key === 'wall';
  if (isW) v.fill(1);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) v[(y + 1) * 52 + x + 1] = cells[y * 50 + x][key] ? 1 : 0;
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const i = (y + 1) * 52 + x + 1;
    const cnt = v[i - 53] + v[i - 52] + v[i - 51] + v[i - 1] + v[i] + v[i + 1] + v[i + 51] + v[i + 52] + v[i + 53];
    const o = Object.assign({}, cells[y * 50 + x]); o[key] = cnt >= factor;
    if (isW) { if (x === 0 || x === 49 || y === 0 || y === 49) o.wall = true; if (o.forceOpen) o.wall = false; }
    out[y * 50 + x] = o;
  }
  return out;
}
function checkFlood(cells) {
  let start = -1; for (let i = 0; i < 2500; i++) if (!cells[i].wall) { start = i; break; }
  if (start < 0) return false;
  const seen = new Uint8Array(2500), st = [start]; seen[start] = 1;
  while (st.length) { const k = st.pop(), x = k % 50, y = (k / 50) | 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx, Y = y + dy; if ((!dx && !dy) || X < 0 || Y < 0 || X > 49 || Y > 49) continue; const n = Y * 50 + X; if (!seen[n] && !cells[n].wall) { seen[n] = 1; st.push(n); } } }
  for (let i = 0; i < 2500; i++) if (!cells[i].wall && !seen[i]) return false;
  return true;
}
const passNearby = (cells, x, y) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X > 49 || Y > 49) continue; if (!cells[Y * 50 + X].wall) return true; } return false; };

// 生成一个 50x50 房间。exits = {top, right, bottom, left} 各为出口坐标数组
// 官方扇区：每 10 个房间一条"高速公路"（x 或 y 为 10 的倍数，无 Controller/能量源，地形开阔）；扇区中心 (5,5) 有 3 个能量源、无 Controller
function roomType(rx, ry) { const m = v => ((v % 10) + 10) % 10; if (m(rx) === 0 || m(ry) === 0) return 'highway'; if (m(rx) === 5 && m(ry) === 5) return 'center'; if (m(rx) >= 4 && m(rx) <= 6 && m(ry) >= 4 && m(ry) <= 6) return 'keeper'; return 'normal'; }
// 地图上某房间对玩家 pid 的状态（主机与客户端共用）：owned = { 'rx,ry': ownerPid }
function roomStatus(S, owned, rx, ry, pid) {
  if (rx < 0 || ry < 0 || rx >= S || ry >= S) return 'out';
  const t = roomType(rx, ry); if (t !== 'normal') return t;
  const o = owned[rx + ',' + ry]; if (o) return o === pid ? 'mine' : 'owned';
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const p = owned[(rx + dx) + ',' + (ry + dy)]; if (p && p !== pid) return 'close'; }
  return 'free';
}
function genRoom(seed, rx, ry, exits) {
  const r = rngFrom(hash32(seed, rx, ry, 5)), type = roomType(rx, ry);
  let wallType = Math.floor(r() * 27) + 1; const swampType = Math.floor(r() * 14); let nSources = r() > 0.5 ? 1 : 2;
  if (type === 'highway') { wallType = 28; nSources = 0; } else if (type === 'center' || type === 'keeper') nSources = 3;
  const gen = () => {
    let cells, tries = 0;
    do {
      if (++tries > 100) { wallType = Math.floor(r() * 27) + 1; tries = 0; }
      cells = new Array(2500); for (let i = 0; i < 2500; i++) cells[i] = {};
      for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
        const c = cells[y * 50 + x];
        const ex = (y === 0 && exits.top.includes(x)) ? [x, 1] : (y === 49 && exits.bottom.includes(x)) ? [x, 48] : (x === 0 && exits.left.includes(y)) ? [1, y] : (x === 49 && exits.right.includes(y)) ? [48, y] : null;
        if (ex) { c.forceOpen = true; c.exit = true; cells[ex[1] * 50 + ex[0]].forceOpen = true; continue; }
        c.wall = r() < WALL_TYPES[wallType][0]; c.swamp = swampType ? r() < SWAMP_TYPES[swampType][0] : false;
      }
      for (let i = 0; i < WALL_TYPES[wallType][1]; i++) cells = smooth(cells, WALL_TYPES[wallType][2], 'wall');
    } while (!checkFlood(cells));
    if (swampType) for (let i = 0; i < SWAMP_TYPES[swampType][1]; i++) cells = smooth(cells, SWAMP_TYPES[swampType][2], 'swamp');
    const sources = [];
    for (let i = 0; i < nSources; i++) { // 官方：能量源必须在墙格上，且旁边有可走格
      let x, y, n = 0;
      do { if (++n > 1000) return null; x = Math.floor(r() * 44) + 3; y = Math.floor(r() * 44) + 3; }
      while (!cells[y * 50 + x].wall || !passNearby(cells, x, y) || cells[y * 50 + x].source);
      cells[y * 50 + x].source = true; sources.push({ x, y });
    }
    if (type !== 'normal') return { cells, sources, controller: null };
    let cx, cy, n = 0; // Controller：同样在墙格上，旁边有可走格
    do { if (++n > 5000) return null; cx = Math.floor(r() * 40) + 5; cy = Math.floor(r() * 40) + 5; }
    while (!cells[cy * 50 + cx].wall || !passNearby(cells, cx, cy) || cells[cy * 50 + cx].source);
    return { cells, sources, controller: { x: cx, y: cy } };
  };
  let g; while (!(g = gen())) wallType = Math.floor(r() * 27) + 1;
  const tiles = new Array(2500);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { // 官方：沼泽只保留在可走格附近；墙优先
    const c = g.cells[y * 50 + x];
    tiles[y * 50 + x] = c.wall ? T_WALL : (c.swamp && passNearby(g.cells, x, y)) ? T_SWAMP : T_PLAIN;
  }
  // 矿物：墙格、旁边有可走格、离能量源/Controller 至少 5 格
  if (type === 'highway') return { tiles, sources: [], controller: null, mineral: null, type };
  const objs = g.sources.concat(g.controller ? [g.controller] : []); let mx, my, n = 0;
  do { mx = 4 + Math.floor(r() * 42); my = 4 + Math.floor(r() * 42); n++; }
  while (n < 20000 && (tiles[my * 50 + mx] !== T_WALL || !passNearby(g.cells, mx, my) || objs.some(o => Math.abs(o.x - mx) < 5 && Math.abs(o.y - my) < 5)));
  const rd = r(), dp = SC.MINERAL_DENSITY_PROBABILITY; let density = 4; for (const d in dp) if (rd <= dp[d]) { density = +d; break; }
  const mineral = n < 20000 ? { x: mx, y: my, type: MINERAL_TYPES[Math.floor(r() * MINERAL_TYPES.length)], density, amount: SC.MINERAL_DENSITY[density] } : null;
  // 官方 Source Keeper 房间：每个能量源/矿物旁都有一个 Keeper Lair（2~4 格内的空地）
  const lairs = [];
  if (type === 'keeper') for (const o of g.sources.concat(mineral ? [mineral] : [])) {
    let best = null; for (let d = 2; d <= 5 && !best; d++) for (let dy = -d; dy <= d && !best; dy++) for (let dx = -d; dx <= d && !best; dx++) {
      const x = o.x + dx, y = o.y + dy; if (x < 2 || y < 2 || x > 47 || y > 47 || tiles[y * 50 + x] === T_WALL || lairs.some(l => l.x === x && l.y === y)) continue; best = { x, y, tx: o.x, ty: o.y };
    }
    if (best) lairs.push(best);
  }
  return { tiles, sources: g.sources, controller: g.controller, mineral, type, lairs };
}
function roomExits(seed, rx, ry) {
  return { top: edgeExits(seed, rx, ry - 1, true), bottom: edgeExits(seed, rx, ry, true), left: edgeExits(seed, rx - 1, ry, false), right: edgeExits(seed, rx, ry, false) };
}
// 世界边界外一侧封成墙；世界扩大后恢复原始出口
function applyBorders(world, rx, ry) {
  const room = world.rooms[rx + ',' + ry], t = room.tiles, base = room.base, S = world.S, inb = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
  const open = { top: inb(rx, ry - 1), bottom: inb(rx, ry + 1), left: inb(rx - 1, ry), right: inb(rx + 1, ry) };
  for (let i = 0; i < 50; i++) {
    t[i] = open.top ? base[i] : T_WALL; t[49 * 50 + i] = open.bottom ? base[49 * 50 + i] : T_WALL;
    t[i * 50] = open.left ? base[i * 50] : T_WALL; t[i * 50 + 49] = open.right ? base[i * 50 + 49] : T_WALL;
  }
}
if (typeof module !== 'undefined') Object.assign(globalThis, { roomType, roomStatus, ROOM, T_PLAIN, T_WALL, T_SWAMP, genRoom, roomExits, applyBorders, hash32, rngFrom, vnoise, roomNameXY, parseRoomName });
