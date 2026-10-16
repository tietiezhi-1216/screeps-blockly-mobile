// 选择出生房间：服务器（回放 test/fixtures/pserver.json）给出的每个房间状态都有中文原因，不可选房间禁用进入；房间资源概况来自服务器推送的对象
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('spawnpick.js'));
const G = require('../www/geo.js'); const { roomStatus, roomType, roomNameXY } = G;
const { OnlineSession } = require('../www/online.js'), FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
(async () => {
  const s = new OnlineSession(FS.CFG, FS.nodeDeps(FX)); await s.start();
  const home = s.kOf(FX.home), keeper = s.kOf(FX.keeper); s.watch([home, keeper]); await new Promise(r => setTimeout(r, 300));
  const v = s.buildView() || s.view, S = s.S, me = s.me._id, seen = new Set();
  for (let ry = -1; ry <= S; ry++) for (let rx = -1; rx <= S; rx++) for (const pid of [me, 'someone-else']) {
    const st = roomStatus(S, v.owned, rx, ry, pid); seen.add(st); const t = wmStatusText(st, 'U');
    assert(typeof t === 'string' && t && !/undefined/.test(t), `${roomNameXY(rx, ry)} ${st} 有中文原因`);
    if (st !== 'free' && st !== 'mine') assert(/不可出生|超出/.test(t), `${st} 说明不可出生`);
    assert(wmSelectable(st, true) === (st === 'free'), `${st} 出生模式可选=${st === 'free'}`);
  }
  for (const st of ['free', 'mine', 'keeper', 'out']) assert(seen.has(st), '覆盖状态 ' + st);
  for (const st of ['free', 'close', 'mine', 'owned', 'highway', 'center', 'keeper', 'out']) assert(WM_STATUS_ZH[st], `${st} 有中文：${WM_STATUS_ZH[st]}`);
  const [hx, hy] = home.split(',').map(Number), [kx, ky] = keeper.split(',').map(Number);
  assert(roomStatus(S, v.owned, hx, hy, me) === 'mine', `${FX.home} 是我的房间`);
  assert(roomStatus(S, v.owned, kx, ky, me) === 'keeper' && wmStatusText('keeper') === 'Source Keeper 房间，没有 Controller，不可出生', `${FX.keeper} 是 Keeper 房间，有中文原因`);
  // 服务器说不是 normal 的房间（比如 out of borders）一律不可出生
  const st0 = s._statusMap; G.setRoomStatus(Object.assign({}, st0, { [hx + ',' + hy]: 'out of borders' })); assert(roomStatus(S, {}, hx, hy, me) === 'out', '服务器状态不是 normal → 不可出生'); G.setRoomStatus(st0);
  assert(wmStatusText('close') === '离其他玩家太近，不可出生', '太近：中文原因');
  assert(wmStatusText('owned', 'U') === '已被 U 占领，不可出生' && wmStatusText('owned') === '已被其他玩家占领，不可出生', '已占领');
  assert(wmStatusText('weird') === '不可出生', '未知状态兜底');
  const idx = wmIndex(v), sh = wmRoomSummary(idx, hx, hy), sk = wmRoomSummary(idx, kx, ky);
  assert(/Controller/.test(sh) && !/无 Controller/.test(sh) && /能量源 [12]/.test(sh), `${FX.home} 概况：${sh}`);
  assert(/无 Controller/.test(sk) && /Keeper 巢穴 \d/.test(sk), `${FX.keeper} 概况：${sk}`);
  const en = idx.get(home); if (en && en.minerals.length) assert(sh.includes(MINERAL_ZH[en.minerals[0].type] || en.minerals[0].type), '矿物类型显示');
  assert(roomType(kx, ky) === 'keeper', '按房间名判断 Keeper 房间');
  s.stop(); console.log('spawnpick: all ok'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
