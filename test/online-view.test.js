// 服务器数据 → 渲染快照（不连网，回放 test/fixtures/pserver.json）：增量合并、地形解码、坐标换算、旗帜、NPC、
// creep 朝向（服务器 actionLog → face，渲染 Renderer.faceAngle 指向目标；v1.9.2 采集朝向回归）、官方限额本地计数
const fs = require('fs'), path = require('path'), W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
const { ScreepsApi, mergeDelta, decodeTerrain, OFFICIAL_LIMITS } = require('../www/screeps-api.js'), G = require('../www/geo.js');
const { OnlineSession } = require('../www/online.js'), FS = require('./fake-server.js'), FX = require('./fixtures/pserver.json');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const rs = W('render.js'), fa = rs.match(/static faceAngle\(x, y, tx, ty\) \{ return ([^}]+) \}/); assert(fa, 'render.js 有 Renderer.faceAngle'); const faceAngle = new Function('x', 'y', 'tx', 'ty', 'return ' + fa[1]);
assert(/if \(cr\.face && [^\n]*\n\s*else if \(cr\.px != null/.test(rs), '动作朝向优先于移动方向');
// 增量合并：null 删除、对象深合并、数组整体替换
{ const d = { a: { x: 1, store: { energy: 5 }, body: [1, 2] }, b: { x: 2 } }; mergeDelta(d, { a: { store: { energy: 7 }, body: [3] }, b: null, c: { x: 3 } });
  assert(!d.b && d.c.x === 3 && d.a.x === 1 && d.a.store.energy === 7 && d.a.body.length === 1, '增量合并：null 删除，对象深合并，数组替换'); }
{ const t = decodeTerrain('0123'.padEnd(2500, '0')); assert(t[0] === 0 && t[1] === 1 && t[2] === 2 && t[3] === 1, '地形编码：0 平地 1 墙 2 沼泽 3 墙'); }
{ assert(G.nameOfReal(0, 0) === 'E0S0' && G.nameOfReal(-1, -1) === 'W0N0' && G.parseRealName('W3N5')[0] === -4 && G.parseRealName('W3N5')[1] === -6, '房间名 ↔ 服务器坐标（E0=0，W0=-1）'); }
(async () => {
  const deps = FS.nodeDeps(FX), s = new OnlineSession(FS.CFG, deps); await s.start();
  assert(s.me && s.me.username === FX.user, '登录后拿到玩家信息');
  const home = s.kOf(FX.home), keeper = s.kOf(FX.keeper); assert(s.nameOf(home) === FX.home, '网格坐标 ↔ 房间名一致：' + FX.home + ' → ' + home);
  assert(s.S > 0 && s.S <= 12 && Object.values(s.mapInfo).filter(Boolean).length === s.S * s.S, `私服窗口按实际存在的房间收紧：${s.S}×${s.S}`);
  s.watch([home, keeper]); await new Promise(r => setTimeout(r, 300)); const v = s.view;
  assert(v.spawns.some(o => o.owner === s.me._id) && v.controllers.some(o => o.owner === s.me._id), '自己的 spawn 和 controller 在快照里');
  assert(v.owned[home] === s.me._id, '房间归属来自服务器');
  assert(v.creeps.filter(c => c.owner === '__keeper').length > 0 && v.players.__keeper && v.players.__keeper.name === 'Source Keeper', 'NPC 用户 "3" → Source Keeper');
  assert(v.creeps.every(c => typeof c.body[0] === 'string' && c.x >= 0 && c.y >= 0), 'creep 身体部件是字符串，坐标是全局格子');
  // 旗帜：服务器格式 "名字~主色~副色~x~y|..."
  s._room(home, { flags: 'A~1~2~10~11|B~3~3~20~21' }); let v2 = s.buildView() || s.view; const fa1 = v2.flags.find(f => f.name === 'A');
  assert(v2.flags.length === 2 && fa1 && fa1.x % 50 === 10 && fa1.y % 50 === 11, '旗帜字符串解析成位置');
  // 朝向：服务器 actionLog.harvest 记录目标坐标
  const cr = v.creeps.find(c => c.owner === s.me._id), lx = cr.x % 50, ly = cr.y % 50;
  for (const [dx, dy] of [[-1, 1], [1, 0], [0, -1]]) {
    s._room(home, { objects: { [cr.id]: { actionLog: { harvest: { x: lx - dx, y: ly - dy }, attack: null } } } }); v2 = s.buildView() || s.view; const c = v2.creeps.find(c => c.id === cr.id);
    assert(c.face && c.face[0] === cr.x - dx && c.face[1] === cr.y - dy, `采集后 face 指向目标 (${-dx},${-dy})`);
    const r = faceAngle(c.x, c.y, c.face[0], c.face[1]), fx = Math.sin(r), fy = -Math.cos(r);
    assert(Math.abs(fx - (-dx) / Math.hypot(dx, dy)) < 1e-9 && Math.abs(fy - (-dy) / Math.hypot(dx, dy)) < 1e-9, '渲染旋转后正面指向目标');
  }
  s._room(home, { objects: { [cr.id]: { actionLog: { harvest: null } } } }); v2 = s.buildView() || s.view; assert(!v2.creeps.find(c => c.id === cr.id).face, '没有动作时不带 face');
  s.stop();
  // 官方服务器：Token 走 X-Token 头，房间频道带 shard，上传代码每天 240 次本地计数，超限前就给中文提示
  { const LS = {}, store = { getItem: k => LS[k] ?? null, setItem: (k, v) => { LS[k] = v; } }, hdr = [];
    const a = new ScreepsApi({ kind: 'official', token: 'T0K', shard: 'shard3' }, { fetch: async (u, o) => { hdr.push(o.headers); return { status: 200, headers: { get: () => null }, text: async () => '{"ok":1}' }; }, storage: store });
    assert(a.base() === 'https://screeps.com' && a.roomChannel('W1N1') === 'room:shard3/W1N1', '官方地址和带 shard 的房间频道');
    await a.codeSet('default', { main: '' }); assert(hdr[0]['X-Token'] === 'T0K', '官方请求带 X-Token');
    assert(OFFICIAL_LIMITS['POST /api/user/code'][0] === 240 && a.rateLeft('POST /api/user/code') === 239, '上传代码限额 240/天，本地计数');
    LS.sbm_rl = JSON.stringify({ 'POST /api/user/code': Array(240).fill(Date.now()) }); let e = null; try { await a.codeSet('default', { main: '' }); } catch (x) { e = x; }
    assert(e && /上传代码每天最多 240 次/.test(e.message) && hdr.length === 1, '超限时不发请求，中文提示：' + (e && e.message)); }
  console.log('ok - online-view'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
