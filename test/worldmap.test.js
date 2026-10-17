// 世界地图数据层（worldmap.js）：官方服务器（回放 screeps.com 只读录制）+ 私服（回放私服录制）
// 懒加载、合批、缓存、限额、CDN 缩略图与 room-terrain 退回、roomMap2 订阅/退订、房间状态与新手区/重生区、窗口重定位
const assert = require('assert'), FS = require('./fake-server.js'), G = require('../www/geo.js');
const { OnlineSession } = require('../www/online.js'), { WorldMap, visibleRooms } = require('../www/worldmap.js');
const OFX = require('./fixtures/official.json'), PFX = require('./fixtures/pserver.json');
const W = ms => new Promise(r => setTimeout(r, ms)); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('ok - ' + m); };
const box = (c, R) => { const [x0, y0] = G.parseRealName(c), L = []; for (let y = y0 - R; y <= y0 + R; y++) for (let x = x0 - R; x <= x0 + R; x++) L.push(G.nameOfReal(x, y)); return L; };
function FakeImage(png, fail) { return class { set src(u) { this._u = u; const m = /map\/([^/]+)\/([^/.]+)\.png$/.exec(u); setTimeout(() => (!fail && m && png[m[2]] ? this.onload && this.onload() : this.onerror && this.onerror()), 5); } get src() { return this._u; } }; }
(async () => {
  // ===== 官方 =====
  const D = FS.nodeDepsOfficial(OFX), s = new OnlineSession(FS.OFFICIAL_CFG, D); await s.start();
  ok(s.home === OFX.home && s.S === 11 && s.worldW === OFX.worldW, `官方：家 ${s.home}，游戏窗口 11×11，世界 ${s.worldW}`);
  const ms0 = D.req.filter(r => r.p === '/api/game/map-stats').length, tr0 = D.req.filter(r => r.p === '/api/game/room-terrain').length;
  const M = new WorldMap(s, { storage: D.storage, Image: FakeImage(OFX.png), debounce: 20, minGap: 0 });
  ok(M.bounds().x0 === -61 && M.bounds().x1 === 60, '官方世界范围按 world-size（W60..E60）');
  const view = box(s.home, 7); M.view(view, false); await W(300);
  const ms1 = D.req.filter(r => r.p === '/api/game/map-stats').slice(ms0);
  ok(ms1.length === 1, `视野外的房间只发 1 次 map-stats（合批），实际 ${ms1.length}`);
  ok(ms1[0].body.statName === 'owner0' && ms1[0].body.shard === 'shard3' && ms1[0].body.rooms.length === view.length - 121, `map-stats {statName:owner0, shard:shard3}，只问窗口外的 ${ms1[0].body.rooms.length} 间（窗口内 121 间已在登录时拿到）`);
  ok(view.every(q => M.terrain(q)) && view.filter(q => M.terrain(q).img).length >= view.length - 1, `${view.length} 间房全部有官方缩略图（CDN，不占 API 限额）`);
  ok(D.req.filter(r => r.p === '/api/game/room-terrain').length === tr0, '有缩略图时不调 room-terrain');
  const st = view.map(q => M.status(q, s.me._id)), cnt = k => st.filter(x => x === k).length;
  ok(cnt('owned') > 5 && cnt('reserved') > 0 && cnt('highway') > 5 && cnt('free') > 5 && cnt('unknown') === 0, `房间状态：占领 ${cnt('owned')}、预定 ${cnt('reserved')}、公路 ${cnt('highway')}、可出生 ${cnt('free')}、Keeper ${cnt('keeper')}`);
  const own = view.find(q => M.status(q) === 'owned'), u = M.stat(own).own.user;
  ok(s.users[u] && s.users[u].username, `占领者资料（用户名 / 徽章）随 map-stats 一起拿到：${own} → ${s.users[u].username}`);
  // 新手区 / 重生区：录制时这一片的时间戳都已过期 → 不画；把时钟拨回去就会画
  ok(view.every(q => M.zone(q) === null), '过期的新手区/重生区时间戳不再显示');
  const nov = view.find(q => M.stat(q) && M.stat(q).novice), Mt = new WorldMap(s, { storage: D.storage, Image: FakeImage(OFX.png), now: () => M.stat(nov).novice - 1000, debounce: 20, minGap: 0 });
  ok(Mt.zone(nov) === 'novice' || Mt.zone(nov) === 'respawn', `有效期内的 ${nov} 显示为 ${Mt.zone(nov)}`); Mt.close();
  // 缓存：重开地图不重复请求
  const M2 = new WorldMap(s, { storage: D.storage, Image: FakeImage(OFX.png), debounce: 20, minGap: 0 }); M2.view(view, false); await W(200);
  ok(D.req.filter(r => r.p === '/api/game/map-stats').length === ms0 + 1, '重新打开地图：房间状态走本地缓存（15 分钟），不再请求');
  // 拖动：只加载新进入视野的房间
  const [hx, hy] = G.parseRealName(s.home), pan = box(G.nameOfReal(hx + 4, hy), 7); M2.view(pan, false); await W(200);
  const ms2 = D.req.filter(r => r.p === '/api/game/map-stats').slice(ms0 + 1);
  const fresh = pan.filter(q => !view.includes(q) && !s.inWorld(s.kOf(q)));
  ok(ms2.length === 1 && ms2[0].body.rooms.length === fresh.length, `拖动后只请求新进视野的 ${fresh.length} 间`);
  // 限额：map-stats 剩余次数不多时不再请求（留给游戏）
  const M3 = new WorldMap(s, { storage: { getItem: () => null, setItem() {} }, Image: FakeImage(OFX.png), debounce: 20, minGap: 0 }); const rl = s.api.rateLeft; s.api.rateLeft = k => k === 'POST /api/game/map-stats' ? 10 : 999;
  const before = D.req.length; M3.view(box(G.nameOfReal(hx - 5, hy - 5), 3), false); await W(200);
  ok(!D.req.slice(before).some(r => r.p === '/api/game/map-stats') && M3.limited, '官方 map-stats 剩余 ≤12 次/小时时不再请求（地图只显示地形）'); s.api.rateLeft = rl; M3.close();
  // 去抖 + 最小间隔：连续拖动只发一次
  const M4 = new WorldMap(s, { storage: { getItem: () => null, setItem() {} }, Image: FakeImage(OFX.png), debounce: 60, minGap: 5000 }); const b4 = D.req.length;
  for (let i = 0; i < 6; i++) { M4.view(box(G.nameOfReal(hx - 3 + i, hy + 9), 2), false); await W(10); } await W(300);
  ok(D.req.slice(b4).filter(r => r.p === '/api/game/map-stats').length === 1, '连续拖动 6 次只发 1 次 map-stats（去抖 + 最小间隔）'); M4.close();
  // CDN 失败：退回 room-terrain，并发 ≤ 2，结果永久缓存
  const M5 = new WorldMap(s, { storage: D.storage, Image: FakeImage(OFX.png, true), debounce: 20, minGap: 0, terrGap: 20 }); const b5 = D.req.length;
  const near = box(s.home, 1).filter(q => !s.rooms[s.kOf(q)]); M5.view(near, false); await W(2500);
  const t5 = D.req.slice(b5).filter(r => r.p === '/api/game/room-terrain');
  ok(t5.length > 0 && t5.every(r => r.q.encoded === '1' && r.q.shard === 'shard3'), `CDN 不可用时退回 room-terrain?encoded=1&shard=shard3（${t5.length} 次）`);
  ok(near.filter(q => OFX.http['GET /api/game/room-terrain?' + q]).every(q => M5.terrain(q) && M5.terrain(q).tiles), '退回的地形解码可用');
  ok(near.some(q => D.storage.getItem('sbm_terr_shard3_' + q)), '地形永久缓存到本地'); M5.close();
  // roomMap2：放大后才订阅，最多 49 间，关闭退订
  const M6 = new WorldMap(s, { storage: D.storage, Image: FakeImage(OFX.png), debounce: 20, minGap: 0 }); M6.view(view, false); await W(100);
  ok(M6.subs.size === 0, '缩小看全图时不订阅 roomMap2');
  M6.view(box(s.home, 4), true); await W(800);
  ok(M6.subs.size > 0 && M6.subs.size <= 49 && [...M6.subs.keys()].every(q => box(s.home, 4).includes(q)), `放大后只订阅视野内的房间（${M6.subs.size} 个）`);
  const subs = D.req.filter(r => r.ws && r.ws.startsWith('subscribe roomMap2:')); ok(subs.length && subs.every(r => /^subscribe roomMap2:shard3\/[WE]\d+[NS]\d+$/.test(r.ws)), '频道名 roomMap2:shard3/房间');
  const withObj = [...M6.subs.keys()].find(q => M6.objects(q) && (M6.objects(q).s || []).length);
  ok(withObj, `收到 roomMap2：${withObj} 能量源 ${M6.objects(withObj).s.length}、Controller ${(M6.objects(withObj).c || []).length}`);
  M6.view(box(G.nameOfReal(hx + 8, hy + 8), 1), true); await W(100);
  ok([...M6.subs.keys()].every(q => box(G.nameOfReal(hx + 8, hy + 8), 1).includes(q)), '移出视野的房间退订');
  M6.close(); ok(M6.subs.size === 0, '关闭地图后全部退订');
  // 窗口重定位：选中游戏窗口外的房间
  const far = Object.keys(OFX.http).filter(k => k.startsWith('GET /api/game/room-terrain?')).map(k => k.split('?')[1]).find(q => s.needsRecenter(q)); ok(s.needsRecenter(far) && !s.needsRecenter(s.home), `${far} 在游戏窗口外 → 需要重定位`);
  await s.recenter(far); ok(s.kOf(far) === '5,5' && s.rooms['5,5'] && s.rooms['5,5'].tiles, `重定位后 ${far} 是窗口中心并已加载地形`);
  s.stop();
  // ===== 私服 =====
  const PD = FS.nodeDeps(PFX), ps = new OnlineSession(FS.CFG, PD); await ps.start(); const p0 = PD.req.length;
  const PM = new WorldMap(ps, { Image: null, debounce: 20, minGap: 0 }), all = []; const b = PM.bounds();
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) all.push(G.nameOfReal(x, y));
  PM.view(all, true); await W(300);
  ok(!PD.req.slice(p0).some(r => r.p === '/api/game/map-stats' || r.p === '/api/game/room-terrain'), `私服：${all.length} 间房的状态和地形都用登录时已加载的数据`);
  ok(all.filter(q => PM.stat(q)).every(q => PM.terrain(q) && PM.terrain(q).tiles), '私服每间房都有地形');
  ok(PM.status(PFX.home, ps.me._id) === 'mine' && PM.status(PFX.keeper) === 'keeper', `私服状态：${PFX.home} 是我的，${PFX.keeper} 是 Keeper 房`);
  ok([...PM.subs.keys()].length > 0 && ps.api.subs.has('roomMap2:' + PFX.home), '私服 roomMap2 频道不带 shard');
  PM.close(); ps.stop();
  console.log(`worldmap: ${n} ok`); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
