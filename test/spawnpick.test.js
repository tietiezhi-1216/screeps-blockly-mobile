// 选择出生房间：每种房间状态都有中文原因（回归：Keeper 房间曾显示 "E6S6 · undefined"），不可选房间禁用进入；房间资源概况
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js') + W('spawnpick.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.addPlayer('p2', 'U');
const v = e.snapshot(), S = v.S, seen = new Set();
for (let ry = -1; ry <= S; ry++) for (let rx = -1; rx <= S; rx++) for (const pid of ['p1', 'p2', 'p3']) {
  const st = roomStatus(S, v.owned, rx, ry, pid); seen.add(st); const t = wmStatusText(st, 'U');
  assert(typeof t === 'string' && t && !/undefined/.test(t), `${st} 有中文原因`);
  if (st !== 'free' && st !== 'mine') assert(/不可出生|超出/.test(t), `${st} 说明不可出生`);
  assert(wmSelectable(st, true) === (st === 'free'), `${st} 出生模式可选=${st === 'free'}`);
}
for (const st of ['free', 'close', 'mine', 'owned', 'highway', 'center', 'keeper', 'out']) { assert(seen.has(st) || st === 'close' || st === 'owned', `覆盖状态 ${st}`); assert(WM_STATUS_ZH[st], `${st} 有中文：${WM_STATUS_ZH[st]}`); }
assert(roomStatus(S, {}, 6, 6, 'p1') === 'keeper' && wmStatusText('keeper') === 'Source Keeper 房间，没有 Controller，不可出生', 'E6S6 是 Keeper 房间，有中文原因');
assert(wmStatusText('close') === '离其他玩家太近，不可出生', '太近：中文原因');
assert(wmStatusText('owned', 'U') === '已被 U 占领，不可出生' && wmStatusText('owned') === '已被其他玩家占领，不可出生', '已占领');
assert(wmStatusText('weird') === '不可出生', '未知状态兜底');
const idx = wmIndex(v); let n = 0;
for (let ry = 0; ry < S; ry++) for (let rx = 0; rx < S; rx++) { const s = wmRoomSummary(idx, rx, ry), t = roomType(rx, ry), en = idx.get(rx + ',' + ry);
  if (!en) continue; n++;
  if (t === 'normal') assert(en.controller && /Controller/.test(s) && !/无 Controller/.test(s) && en.sources.length >= 1, `${roomNameXY(rx, ry)} 普通房间：${s}`);
  if (t === 'highway') assert(en.sources.length === 0 && /无 Controller/.test(s), `${roomNameXY(rx, ry)} 高速公路：${s}`);
  if (en.minerals.length) assert(s.includes(en.minerals[0].type), '矿物类型显示');
}
assert(n > 0, '有房间概况');
console.log('spawnpick: all ok');
