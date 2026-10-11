// 程序化地图生成：种子噪声地形 + 连通出口 + 合理能量源 + 公平出生点
const ROOM = 25;
const T_PLAIN = 0, T_WALL = 1, T_SWAMP = 2;
function hash32(...n) { let h = 2166136261 >>> 0; for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; } return h >>> 0; }
function rngFrom(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function vnoise(seed, x, y) { // 平滑值噪声
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, f = t => t * t * (3 - 2 * t);
  const r = (a, b) => hash32(seed, a, b) / 4294967296;
  const a = r(xi, yi), b = r(xi + 1, yi), c = r(xi, yi + 1), d = r(xi + 1, yi + 1), u = f(xf), v = f(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(seed, x, y) { let s = 0, amp = 0.5, fr = 1, n = 0; for (let o = 0; o < 4; o++) { s += amp * vnoise(seed + o * 101, x * fr, y * fr); n += amp; amp *= 0.5; fr *= 2; } return s / n; }
// 房间之间的出口：由“边”的哈希决定，两侧房间天然一致
function edgeGap(seed, ax, ay, bx, by) { const h = hash32(seed, ax, ay, bx, by, 77); return { c: 5 + (h % 15), w: 2 + ((h >>> 8) % 3) }; }

function genRoom(seed, rx, ry) {
  const t = new Array(ROOM * ROOM);
  for (let ly = 0; ly < ROOM; ly++) for (let lx = 0; lx < ROOM; lx++) {
    const gx = rx * ROOM + lx, gy = ry * ROOM + ly;
    const m = fbm(seed, gx / 9, gy / 9), sw = fbm(seed + 999, gx / 7, gy / 7);
    t[ly * ROOM + lx] = m > 0.63 ? T_WALL : sw > 0.66 ? T_SWAMP : T_PLAIN;
  }
  const r = rngFrom(hash32(seed, rx, ry, 5)), cx = 12, cy = 12;
  const carve = (x0, y0, x1, y1) => { let x = x0, y = y0; for (let i = 0; i < 200; i++) { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) { const X = x + dx, Y = y + dy; if (X > 0 && Y > 0 && X < ROOM - 1 && Y < ROOM - 1 && t[Y * ROOM + X] === T_WALL) t[Y * ROOM + X] = T_PLAIN; } if (x === x1 && y === y1) break; if (x !== x1 && (y === y1 || r() < 0.5)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); } };
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t[(cy + dy) * ROOM + cx + dx] = T_PLAIN;
  // 能量源：2 个，远离中心和彼此，四周至少 3 个可走格
  const sources = [];
  for (let tries = 0; tries < 400 && sources.length < 2; tries++) {
    const x = 3 + Math.floor(r() * 19), y = 3 + Math.floor(r() * 19);
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < 4 || sources.some(s => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < 6)) continue;
    let free = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && t[(y + dy) * ROOM + x + dx] !== T_WALL) free++;
    if (free < 3 && tries < 300) continue;
    t[y * ROOM + x] = T_PLAIN; carve(x, y, cx, cy); sources.push({ x, y });
  }
  return { tiles: t, sources, carve };
}
// 按邻居情况刷新房间边界墙与出口，并保证出口连到房间中心
function applyBorders(world, rx, ry) {
  const room = world.rooms[rx + ',' + ry], t = room.tiles, seed = world.seed;
  const has = (x, y) => !!world.rooms[x + ',' + y];
  const r = rngFrom(hash32(seed, rx, ry, 9));
  const carve = (x0, y0) => { let x = x0, y = y0; for (let i = 0; i < 80 && (x !== 12 || y !== 12); i++) { if (t[y * ROOM + x] === T_WALL) t[y * ROOM + x] = T_PLAIN; if (x !== 12 && (y === 12 || r() < 0.5)) x += Math.sign(12 - x); else y += Math.sign(12 - y); } };
  for (let i = 0; i < ROOM; i++) { t[i] = T_WALL; t[(ROOM - 1) * ROOM + i] = T_WALL; t[i * ROOM] = T_WALL; t[i * ROOM + ROOM - 1] = T_WALL; }
  const sides = [[0, -1, 'N'], [0, 1, 'S'], [-1, 0, 'W'], [1, 0, 'E']];
  for (const [dx, dy, s] of sides) {
    if (!has(rx + dx, ry + dy)) continue;
    const [ax, ay, bx, by] = (dx + dy > 0) ? [rx, ry, rx + dx, ry + dy] : [rx + dx, ry + dy, rx, ry];
    const g = edgeGap(seed, ax, ay, bx, by);
    for (let k = g.c; k < g.c + g.w; k++) {
      let x, y; if (s === 'N') { x = k; y = 0; } else if (s === 'S') { x = k; y = ROOM - 1; } else if (s === 'W') { x = 0; y = k; } else { x = ROOM - 1; y = k; }
      t[y * ROOM + x] = T_PLAIN;
      const ix = Math.min(ROOM - 2, Math.max(1, x)), iy = Math.min(ROOM - 2, Math.max(1, y)); carve(ix, iy);
    }
  }
}
if (typeof module !== 'undefined') Object.assign(globalThis, { ROOM, T_PLAIN, T_WALL, T_SWAMP, genRoom, applyBorders, hash32, rngFrom });
