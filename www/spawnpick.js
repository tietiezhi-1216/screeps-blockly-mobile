// 世界地图 / 选择出生房间：房间状态文案 + 每个房间的资源概况（缩略图标记与选中信息共用）
// 同官方世界地图：地形缩略图 + 能量源（黄点）、矿物（白点+类型）、Controller、Source Keeper 巢穴、传送门
const WM_STATUS_ZH = {
  free: '空闲，可出生', mine: '我的房间',
  close: '离其他玩家太近，不可出生', owned: '已被其他玩家占领，不可出生',
  highway: '高速公路，没有 Controller，不可出生', center: '扇区中心，没有 Controller，不可出生',
  keeper: 'Source Keeper 房间，没有 Controller，不可出生', out: '超出世界范围',
  reserved: '已被其他玩家预定，不可出生', unknown: '正在读取房间状态…',
};
function wmStatusText(st, ownerName) {
  if (st === 'owned' && ownerName) return `已被 ${ownerName} 占领，不可出生`;
  if (st === 'reserved' && ownerName) return `已被 ${ownerName} 预定，不可出生`;
  return WM_STATUS_ZH[st] || '不可出生';
}
const wmSelectable = (st, pick) => pick ? st === 'free' : st !== 'out';
const MINERAL_ZH = { H: '氢 H', O: '氧 O', U: 'Utrium U', L: 'Lemergium L', K: 'Keanium K', Z: 'Zynthium Z', X: 'Catalyst X' };
// 把快照里的对象按房间分组（只取地图需要的静态对象）
function wmIndex(v) {
  const R = 50, M = new Map(), at = (o) => { const k = Math.floor(o.x / R) + ',' + Math.floor(o.y / R); let e = M.get(k); if (!e) M.set(k, e = { sources: [], minerals: [], controller: null, lairs: [], portals: [] }); return e; }, L = (o) => ({ x: o.x % R, y: o.y % R });
  for (const s of v.sources || []) at(s).sources.push(L(s));
  for (const m of v.minerals || []) at(m).minerals.push(Object.assign(L(m), { type: m.type }));
  for (const c of v.controllers || []) at(c).controller = Object.assign(L(c), { owner: c.owner, level: c.level });
  for (const s of v.structures || []) if (s.type === 'keeperLair') at(s).lairs.push(L(s)); else if (s.type === 'portal') at(s).portals.push(L(s));
  return M;
}
function wmRoomSummary(idx, rx, ry) {
  const e = idx.get(rx + ',' + ry) || { sources: [], minerals: [], controller: null, lairs: [], portals: [] };
  const parts = [`能量源 ${e.sources.length}`];
  parts.push(e.minerals.length ? '矿物 ' + e.minerals.map(m => MINERAL_ZH[m.type] || m.type).join('、') : '无矿物');
  parts.push(e.controller ? 'Controller' : '无 Controller');
  if (e.lairs.length) parts.push(`Keeper 巢穴 ${e.lairs.length}`);
  if (e.portals.length) parts.push('传送门');
  return parts.join(' · ');
}
if (typeof module !== 'undefined') module.exports = { WM_STATUS_ZH, wmStatusText, wmSelectable, wmIndex, wmRoomSummary, MINERAL_ZH };
