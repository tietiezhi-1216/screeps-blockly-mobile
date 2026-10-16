// 坐标与房间名（官方规则）。App 内部用 0..S-1 的网格坐标；网格 (rx, ry) 对应服务器坐标 (rx + WORLD_O.x, ry + WORLD_O.y)，
// 服务器坐标按官方：E0 = 0、W0 = -1，S0 = 0、N0 = -1。偏移量由在线会话按服务器世界大小设定。
const ROOM = 50;
const T_PLAIN = 0, T_WALL = 1, T_SWAMP = 2;
const WORLD_O = { x: 0, y: 0 };
function realXY(rx, ry) { return [rx + WORLD_O.x, ry + WORLD_O.y]; }
function nameOfReal(x, y) { return (x < 0 ? 'W' + (-x - 1) : 'E' + x) + (y < 0 ? 'N' + (-y - 1) : 'S' + y); }
function roomNameXY(rx, ry) { return nameOfReal(rx + WORLD_O.x, ry + WORLD_O.y); }
function parseRealName(n) { const m = /^([WE])(\d+)([NS])(\d+)$/.exec(n || ''); if (!m) return null; return [m[1] === 'W' ? -1 - m[2] : +m[2], m[3] === 'N' ? -1 - m[4] : +m[4]]; }
function parseRoomName(n) { const p = parseRealName(n); return p ? [p[0] - WORLD_O.x, p[1] - WORLD_O.y] : null; }
function roomKey(x, y) { return Math.floor(x / ROOM) + ',' + Math.floor(y / ROOM); }
function roomName(x, y) { return roomNameXY(Math.floor(x / ROOM), Math.floor(y / ROOM)); }
// 官方扇区：坐标个位为 0 的是高速公路，(5,5) 扇区中心，中心周围 3×3 是 Source Keeper 房间（按房间名的数字判断）
function roomType(rx, ry) { const n = /^[WE](\d+)[NS](\d+)$/.exec(roomNameXY(rx, ry)); if (!n) return 'normal'; const a = +n[1] % 10, b = +n[2] % 10;
  if (a === 0 || b === 0) return 'highway'; if (a === 5 && b === 5) return 'center'; if (a >= 4 && a <= 6 && b >= 4 && b <= 6) return 'keeper'; return 'normal'; }
// 世界地图上房间对玩家的状态。服务器给出的房间状态（map-stats）优先：不是 normal 的房间不能出生
let ROOM_STATUS = {}; // 'rx,ry' -> 'normal' | 'out of borders' | ...
function setRoomStatus(s) { ROOM_STATUS = s || {}; }
function roomStatus(S, owned, rx, ry, pid) {
  if (rx < 0 || ry < 0 || rx >= S || ry >= S) return 'out';
  const k = rx + ',' + ry, ss = ROOM_STATUS[k]; if (ss && ss !== 'normal') return 'out';
  const t = roomType(rx, ry); if (t !== 'normal') return t;
  const o = owned[k]; if (o) return o === pid ? 'mine' : 'owned';
  return 'free'; // 能否出生最终由服务器判定（place-spawn）
}
function hash32(...n) { let h = 2166136261 >>> 0; for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; } return h >>> 0; }
if (typeof module !== 'undefined') module.exports = { ROOM, T_PLAIN, T_WALL, T_SWAMP, WORLD_O, realXY, nameOfReal, roomNameXY, parseRealName, parseRoomName, roomKey, roomName, roomType, roomStatus, hash32, setRoomStatus };
else if (typeof window !== 'undefined') window.WORLD_O = WORLD_O; // 让 online.js 能通过 window 改窗口偏移（const 全局不挂在 window 上）
