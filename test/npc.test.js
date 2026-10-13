// v1.8.2 NPC：Stronghold / Invader Core（backend-local strongholds.js + engine invader-core/*）、Invader 入侵（cronjobs.js genInvaders + creeps/invaders/*）、
// notifyWhenAttacked 通知（_damage.js / towers/attack.js → sendAttackingNotification）、getRoomLinearDistance continuous、官方 mapView
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js') + W('engine-npc.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const e = new Engine(newWorld(42)); e.addPlayer('p1', 'T'); e.w.zones = {}; const w = e.w; w.players.p2 = { name: 'F' }; w.memory.p2 = {};
const call = (code, pid = 'p1') => { const f = compileUser(code); let r; f(Object.assign({}, e.buildApi(pid), { log: (...a) => { r = a[0]; } })); return r; };
const free = (rk, n = 1, near) => { const [rx, ry] = rk.split(',').map(Number), L = []; for (let y = 3; y < 47 && L.length < n; y++) for (let x = 3; x < 47 && L.length < n; x++) { const gx = rx * 50 + x, gy = ry * 50 + y; if (!e.blocked(gx, gy) && !L.some(p => Math.abs(p[0] - gx) <= 1 && Math.abs(p[1] - gy) <= 1) && (!near || Math.max(Math.abs(gx - near.x), Math.abs(gy - near.y)) <= near.r)) L.push([gx, gy]); } return L; };
const C = (id, owner, body, p, extra = {}) => { const c = Object.assign({ kind: 'creep', id, owner, name: id, body, hits: body.length * 100, x: p[0], y: p[1], px: p[0], py: p[1], store: {}, ttl: 1000, fatigue: 0 }, extra); w.creeps.push(c); e._o = null; return c; };
// ===== 0. 数据与官方一致 =====
const OFF = '/workspace/screeps-common/lib/strongholds.js';
if (fs.existsSync(OFF)) { const S = require(OFF); assert(JSON.stringify(S) === JSON.stringify(NPC.SH), '要塞模板/奖励表与官方 @screeps/common strongholds.js 完全一致'); }
const CJ = '/workspace/screeps-backend-local/lib/cronjobs.js';
if (fs.existsSync(CJ)) { const src = fs.readFileSync(CJ, 'utf8'), m = src.match(/var body = (\{[\s\S]*?\});/); const B = eval('(' + m[1] + ')'); assert(JSON.stringify(B) === JSON.stringify(NPC.RAID), '入侵者 6 种 body 与官方 cronjobs.js 完全一致'); }
assert(NPC.isCenter(4, 4) && NPC.isCenter(5, 5) && NPC.isCenter(6, 4) && !NPC.isCenter(3, 5) && NPC.isVeryCenter(5, 5) && !NPC.isVeryCenter(4, 5), 'utils.isCenter / isVeryCenter：扇区中心 3×3 / 正中心');
// ===== 1. 扇区中心房间 =====
const center = w.rooms['5,5'], ks = ['4,4', '4,5', '4,6', '5,4', '5,6', '6,4', '6,5', '6,6'];
assert(center.type === 'center' && w.sources.filter(s => roomKey(s.x, s.y) === '5,5').length === 3 && !w.structures.some(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === '5,5') && !w.controllers.some(c => roomKey(c.x, c.y) === '5,5'), '正中心房间：3 个能量源、无 Keeper Lair、无 Controller');
for (const k of ks) { const L = w.structures.filter(s => s.type === 'keeperLair' && roomKey(s.x, s.y) === k), S = w.sources.filter(s => roomKey(s.x, s.y) === k), M = w.minerals.filter(s => roomKey(s.x, s.y) === k);
  assert(w.rooms[k].type === 'keeper' && S.length === 3 && M.length === 1 && L.length >= 3 && !w.controllers.some(c => roomKey(c.x, c.y) === k), `SK 房间 ${roomNameXY(...k.split(',').map(Number))}：3 能量源 + 1 矿物 + ${L.length} 个 Keeper Lair，无 Controller`); }
e.tick(); assert(w.sources.filter(s => ks.includes(roomKey(s.x, s.y))).every(s => s.cap === SC.SOURCE_ENERGY_KEEPER_CAPACITY) && w.sources.filter(s => roomKey(s.x, s.y) === '5,5').every(s => s.cap === SC.SOURCE_ENERGY_KEEPER_CAPACITY), '扇区中心 9 个房间的能量源容量 4000（SOURCE_ENERGY_KEEPER_CAPACITY）');
// ===== 2. genStrongholds → spawnStronghold =====
while (w.time % NPC.CRON_STRONGHOLDS !== 0) e.tick();
let core = w.structures.find(s => s.type === 'invaderCore');
assert(!!core && NPC.isCenter(...roomKey(core.x, core.y).split(',').map(Number)) && !NPC.isVeryCenter(...roomKey(core.x, core.y).split(',').map(Number)), 'genStrongholds：扇区里没有核心 → 在中心 3×3（非正中心）房间生成要塞 ' + roomName(core.x, core.y));
const tpl = NPC.SH.templates[core.templateName], cRk = roomKey(core.x, core.y);
assert(core.level === tpl.structures[0].level && core.owner === INVADER && core.hits === SC.INVADER_CORE_HITS && core.deployTime === w.time + NPC.STRONGHOLD_DEPLOY_TIME && core.nextExpandTime === core.deployTime + SC.INVADER_CORE_EXPAND_TIME[core.level], `核心 ${core.templateName}：level ${core.level}，hits 100000，deployTime = now + 5000，nextExpandTime`);
const ph = w.structures.filter(s => s.type === 'rampart' && s.strongholdId === core.strongholdId);
assert(ph.length === tpl.structures.filter(s => s.type === 'rampart').length && ph.every(r => r.hits === 1 && r.isPublic), '部署前：模板位置上放 hits 1 的公共 rampart');
assert(core.effects[0].effect === SC.EFFECT_INVULNERABILITY && core.effects[0].endTime === core.deployTime, '部署前核心 EFFECT_INVULNERABILITY');
const n0 = w.structures.filter(s => s.type === 'invaderCore').length; NPC.genStrongholds(e); assert(w.structures.filter(s => s.type === 'invaderCore').length === n0, '同扇区已有核心 → 不重复生成');
// 无敌：攻击返回 ERR_INVALID_TARGET；API 属性
const ap = free(cRk, 1, { x: core.x, y: core.y, r: 3 }).find(p => Math.max(Math.abs(p[0] - core.x), Math.abs(p[1] - core.y)) === 1) || (() => { for (let d = 1; d <= 8; d++) { const [dx, dy] = DIRS[d]; if (!e.blocked(core.x + dx, core.y + dy)) return [core.x + dx, core.y + dy]; } })();
const att = C('att', 'p1', ['attack', 'move'], ap);
assert(call(`console.log(Game.creeps.att.attack(Game.getObjectById('${core.id}')))`) === ERR_INVALID_TARGET, '部署期间攻击核心 → ERR_INVALID_TARGET（creeps.js EFFECT_INVULNERABILITY）');
const api = call(`const c = Game.getObjectById('${core.id}'); console.log({ t: c.ticksToDeploy, l: c.level, cls: c instanceof StructureInvaderCore, u: c.owner.username, e: c.effects[0], sp: c.spawning })`);
assert(api.t === core.deployTime - w.time && api.l === core.level && api.cls && api.u === 'Invader' && api.e.effect === SC.EFFECT_INVULNERABILITY && api.e.ticksRemaining > 0 && api.sp === null, 'StructureInvaderCore：ticksToDeploy / level / owner.username=Invader / effects / spawning');
w.creeps.splice(w.creeps.indexOf(att), 1); e._o = null;
// ===== 3. 部署 =====
core.deployTime = w.time + 2; core.effects[0].endTime = core.deployTime; e.tick(); e.tick();
assert(!core.deployTime && core.decayTime >= w.time + 0.9 * SC.STRONGHOLD_DECAY_TICKS - 2 && core.decayTime <= w.time + 1.1 * SC.STRONGHOLD_DECAY_TICKS && core.effects.some(f => f.effect === SC.EFFECT_COLLAPSE_TIMER), '部署：decayTime = now + 75000×(0.9~1.1)，EFFECT_COLLAPSE_TIMER');
const sh = w.structures.filter(s => s.strongholdId === core.strongholdId && s !== core), cnt = t => sh.filter(s => s.type === t).length, tc = t => tpl.structures.filter(s => s.type === t).length;
assert(['rampart', 'tower', 'container', 'road'].every(t => cnt(t) === tc(t)), `按模板放置：rampart ${cnt('rampart')} / tower ${cnt('tower')} / container ${cnt('container')} / road ${cnt('road')}`);
assert(sh.filter(s => s.type === 'rampart').every(r => r.hits === SC.STRONGHOLD_RAMPART_HITS[tpl.rewardLevel] && r.hitsMax === SC.RAMPART_HITS_MAX[8] && r.hitsTarget === SC.STRONGHOLD_RAMPART_HITS[core.level] && r.owner === INVADER && !r.isPublic), 'rampart：hits = STRONGHOLD_RAMPART_HITS[rewardLevel]，hitsMax = RAMPART_HITS_MAX[8]');
assert(sh.filter(s => s.type === 'tower').every(t => t.store.energy === SC.TOWER_CAPACITY - 0 || t.store.energy >= SC.TOWER_CAPACITY - 2 * SC.TOWER_ENERGY_COST), 'tower：满能量');
const loot = sh.filter(s => s.type === 'container'); assert(loot.every(c => Object.keys(c.store).length <= 3 && Object.keys(c.store).every(r => r in NPC.SH.containerRewards) && c.notifyAttacked === false), 'container：calcReward(containerRewards, containerAmounts[rewardLevel], 3) 战利品');
assert(sh.every(s => s.collapseAt === core.decayTime), '全部要塞建筑带坍塌时间');
// 防御：塔打最近的敌人；核心 transfer 给塔补能量
const tw = sh.find(s => s.type === 'tower'), hp = free(cRk, 1, { x: core.x, y: core.y, r: 6 })[0], foe = C('foe', 'p1', Array(10).fill('tough').concat(['move']), hp, { ttl: 1000 });
const h0 = foe.hits; e.tick(); assert(foe.hits < h0, `要塞塔攻击闯入的玩家 creep（${h0}→${foe.hits}）`);
const nt = (w.notifications || {}).p1 || []; assert(nt.some(n => /creep foe/.test(n.message) && /正在遭受攻击/.test(n.message)), '塔攻击 → notifyWhenAttacked 通知（towers/attack.js 不区分攻击者）');
w.creeps.splice(w.creeps.indexOf(foe), 1); e._o = null;
tw.store.energy = 0; const lvl = core.level; for (let i = 0; i < 200 && tw.store.energy === 0; i++) e.tick();
assert(lvl >= 4 ? tw.store.energy === SC.TOWER_CAPACITY : true, 'refillTowers：level ' + lvl + ' 按 towerRefillChance 给 rampart 下的塔补满能量');
// bunker2+ 生成防御者
if (core.level >= 2) { for (let i = 0; i < 400 && !w.creeps.some(c => c.strongholdId === core.strongholdId && !c.spawning); i++) e.tick();
  const d = w.creeps.find(c => c.strongholdId === core.strongholdId && !c.spawning); assert(!!d && d.name.startsWith('defender') && d.ttl <= core.decayTime - w.time + 1 && d.notifyAttacked === false, `level ${core.level}：核心按 population 生成 ${d && d.name}（body ${d && d.body.length}，寿命到坍塌）`); }
// ===== 4. 摧毁核心 → Ruin 战利品 =====
const rl = tpl.rewardLevel, dt = core.depositType; const cr0 = w.structures.find(s => s.type === 'rampart' && s.x === core.x && s.y === core.y); e.damage(core, 10, 'p1'); assert(cr0 && cr0.hits === SC.STRONGHOLD_RAMPART_HITS[rl] - 10 && core.hits === SC.INVADER_CORE_HITS, '核心上有 rampart → 伤害打在 rampart 上'); e.removeStruct(cr0); core.hits = 1; e.damage(core, 10, 'p1'); const ruin = w.ruins.find(r => r.structureType === 'invaderCore');
assert(!w.structures.includes(core) && ruin && Object.keys(ruin.store).every(r => NPC.SH.coreRewards[dt].slice(0, 1 + rl).includes(r)) && ruin.decayAt >= core.collapseAt, `摧毁核心：Ruin 存放 ${dt} 系列 ${rl + 1} 档商品（invader-core/destroy.js），保留到坍塌时间`);
NPC.genStrongholds(e); assert(!w.structures.some(s => s.type === 'invaderCore' && s !== core && NPC.sectorOf(roomKey(s.x, s.y)) === NPC.sectorOf(cRk)), '扇区里还有核心 Ruin → 不生成新要塞（genStrongholds）');
// ===== 5. 坍塌 =====
for (const s of sh) s.collapseAt = w.time + 1; e.tick(); assert(!sh.some(s => w.structures.includes(s)) && !w.ruins.some(r => sh.some(s => s.id === r.structureId)), '坍塌时间到：要塞建筑直接消失（无 Ruin）');
// ===== 6. 扩张：level 0 核心预定邻近房间 Controller =====
w.ruins = w.ruins.filter(r => r !== ruin); const r2 = NPC.spawnStronghold(e, '4,5', { deployTime: 1, templateName: 'bunker1' }); assert(r2 && r2.templateName === 'bunker1', 'spawnStronghold(bunker1)');
const c1 = w.structures.find(s => s.type === 'invaderCore' && s.strongholdId === r2.strongholdId); e.tick(); e.tick(); assert(!c1.deployTime, 'bunker1 已部署');
c1.nextExpandTime = w.time - 1; const ok = NPC.expandStronghold(e, c1); const c0 = w.structures.find(s => s.type === 'invaderCore' && s.level === 0);
assert(ok && c0 && w.rooms[roomKey(c0.x, c0.y)].type === 'normal' && c0.collapseAt === c1.collapseAt && c1.nextExpandTime === w.time + SC.INVADER_CORE_EXPAND_TIME[1], `expandStronghold：在 ${roomName(c0.x, c0.y)} Controller 旁放 level 0 核心（同坍塌时间）`);
const ct = ctrlOfRoom(w, roomKey(c0.x, c0.y)); e.tick(); e.tick(); assert(ct.reservation && ct.reservation.owner === INVADER && ct.reservation.endTime > w.time, 'level 0 核心 reserveController（INVADER_CORE_CONTROLLER_POWER × CONTROLLER_RESERVE）');
// ===== 7. 采集累计 + 入侵 =====
const myRk = roomKey(w.spawns[0].x, w.spawns[0].y), src = w.sources.find(s => roomKey(s.x, s.y) === myRk);
const hv = C('hv', 'p1', ['work', 'work', 'carry', 'move'], (() => { for (let d = 1; d <= 8; d++) { const [dx, dy] = DIRS[d]; if (!e.blocked(src.x + dx, src.y + dy)) return [src.x + dx, src.y + dy]; } })());
src.energy = 3000; call(`Game.creeps.hv.harvest(Game.getObjectById('${src.id}'))`); e.flushIntents('p1'); assert(src.invaderHarvested === 4, 'harvest 累计 source.invaderHarvested（官方 harvest.js）');
w.creeps.splice(w.creeps.indexOf(hv), 1); e._o = null;
const sec = NPC.sectorOf(myRk); assert(w.structures.some(s => s.type === 'invaderCore' && s.level > 0 && NPC.sectorOf(roomKey(s.x, s.y)) === sec), '本扇区有 level>0 核心（入侵前提）');
src.invaderHarvested = SC.INVADERS_ENERGY_GOAL; let raid = NPC.genInvaders(e).filter(c => roomKey(c.x, c.y) === myRk);
assert(raid.length >= 1 && raid[0].body.join() === NPC.RAID.smallMelee.join() && raid.every(c => c.ttl === 1500 && c.owner === INVADER && (c.x % 50 === 0 || c.x % 50 === 49 || c.y % 50 === 0 || c.y % 50 === 49)), `采集满 ${SC.INVADERS_ENERGY_GOAL} → 从出口生成入侵者（RCL<4：small，首个 Melee），共 ${raid.length} 个`);
const ig = w.rooms[myRk].invaderGoal; assert(src.invaderHarvested === 0 && (ig === 0 || (ig >= 70000 && ig <= 130000) || (ig >= 140000 && ig <= 260000)), '入侵后 invaderHarvested 清零，invaderGoal = 100000×(0.7~1.3)');
assert(NPC.genInvaders(e).filter(c => roomKey(c.x, c.y) === myRk).length === 0, '房间里已有 Invader → 不再生成');
assert(call(`const c = Game.getObjectById('${raid[0].id}'); console.log(c ? c.owner.username : 'novis')`) === 'Invader', 'Invader creep owner.username = Invader');
// big raid：RCL ≥ 4
w.creeps = w.creeps.filter(c => !raid.includes(c)); e._o = null; const myC = ctrlOfRoom(w, myRk); myC.level = 4; src.invaderHarvested = 1e6;
raid = NPC.genInvaders(e).filter(c => roomKey(c.x, c.y) === myRk); assert(raid.length && raid[0].body.join() === NPC.RAID.bigMelee.join(), 'RCL ≥ 4 → big 入侵者（bigMelee 50 部件）');
w.creeps = w.creeps.filter(c => !raid.includes(c)); e._o = null; myC.level = 1;
// 扇区无核心 → 不入侵
const cores = w.structures.filter(s => s.type === 'invaderCore'); w.structures = w.structures.filter(s => s.type !== 'invaderCore'); e._objVer++; src.invaderHarvested = 1e6;
assert(NPC.genInvaders(e).filter(c => roomKey(c.x, c.y) === myRk).length === 0, '扇区内没有 level>0 的核心 → 不入侵（cronjobs.js）'); w.structures.push(...cores); e._objVer++; src.invaderHarvested = 0;
// ===== 8. Invader AI =====
ctrlOfRoom(w, myRk).safeMode = 0; // 安全模式下 NPC 无法攻击
const [pa, pb] = free(myRk, 2); const vic = C('vic', 'p1', ['move', 'move'], pa); const inv = C('inv1', INVADER, NPC.RAID.smallMelee.slice(), [pa[0] + 1, pa[1]], { notifyAttacked: false });
if (e.blocked(inv.x, inv.y, inv)) { inv.x = pa[0]; inv.y = pa[1] + 1; } e._o = null;
const v0 = vic.hits; e.tick(); assert(vic.hits < v0, `Invader 近战/远程攻击相邻的玩家 creep（${v0}→${vic.hits}）`);
assert((w.notifications.p1 || []).some(n => /creep vic/.test(n.message)) === false, 'NPC（Invader）攻击不发通知（_damage.js：object.user != 2/3）');
const hl = C('hl1', INVADER, NPC.RAID.smallHealer.slice(), [inv.x, inv.y + 1]); if (e.blocked(hl.x, hl.y, hl)) { hl.x = inv.x - 1; hl.y = inv.y - 1; } e._o = null; inv.hits = 500; e.tick();
assert(inv.hits > 500, 'Invader 治疗者治疗受伤的同伴（healer.js）');
w.creeps = w.creeps.filter(c => ![vic, inv, hl].includes(c)); e._o = null;
const lone = C('inv2', INVADER, NPC.RAID.smallRanged.slice(), pb); e.tick(); e.tick(); assert(!w.creeps.includes(lone), '房间没有敌人且 Controller 有主 → suicide（findAttack.js）');
// ===== 9. notifyWhenAttacked =====
w.notifications = {}; const [q1, q2] = free(myRk, 2).length ? (() => { const L = []; for (let x = pb[0] - 5; x < pb[0] + 5 && L.length < 1; x++) if (!e.blocked(x, pb[1]) && !e.blocked(x + 1, pb[1])) L.push([[x, pb[1]], [x + 1, pb[1]]]); return L[0]; })() : [];
const mine = C('mine', 'p1', ['move'], q1), bad = C('bad', 'p2', ['attack', 'move'], q2);
call(`Game.creeps.bad.attack(Game.getObjectById('mine'))`, 'p2'); e.flushIntents('p2');
assert(w.notifications.p1 && w.notifications.p1[0].message === `你在房间 ${roomName(mine.x, mine.y)} 的 creep mine 正在遭受攻击！` && w.notifications.p1[0].count === 1, '玩家攻击 → 受害者收到「creep mine 正在遭受攻击」通知');
call(`Game.creeps.bad.attack(Game.getObjectById('mine'))`, 'p2'); e.flushIntents('p2'); assert(w.notifications.p1.length === 1 && w.notifications.p1[0].count === 2, '同一消息合并计数（driver.sendNotification upsert count）');
assert(call(`console.log(Game.creeps.mine.notifyWhenAttacked(false))`) === OK, 'notifyWhenAttacked(false) → OK'); e.flushIntents('p1'); w.notifications = {};
call(`Game.creeps.bad.attack(Game.getObjectById('mine'))`, 'p2'); e.flushIntents('p2'); assert(!(w.notifications.p1 || []).length, '关闭后不再通知');
mine.notifyAttacked = true; const ext = w.spawns[0]; w.notifications = {}; e.damage(ext, 1, 'p2'); assert(w.notifications.p1[0].message === `你在房间 ${roomName(ext.x, ext.y)} 的 spawn ${ext.name} 正在遭受攻击！`, 'spawn 被攻击 → 「spawn 名字」通知');
const road = e.makeStruct('road', 'p1', q1[0], q1[1] + 2); w.structures.push(road); w.notifications = {}; e.damage(road, 1, 'p2'); assert(w.notifications.p1 && w.notifications.p1[0].message.includes('road #' + road.id), '无主建筑（road）→ 通知房间 Controller 主人，「road #id」');
w.notifications = {}; call(`Game.notify('hello')`); assert(w.notifications.p1[0].message === 'hello', 'Game.notify 写入通知列表');
let logged = []; e.onNotify = (pid, m) => logged.push([pid, m]); call(`Game.notify('x2')`); assert(logged.length === 1 && logged[0][0] === 'p1', 'Engine.onNotify 回调（界面弹出通知）');
// ===== 10. getRoomLinearDistance continuous =====
const r = call(`console.log([Game.map.getRoomLinearDistance('W0N0', 'W10N0'), Game.map.getRoomLinearDistance('W0N0', 'W10N0', true), Game.map.getWorldSize(), Game.map.getRoomLinearDistance('W1N1', 'W3N9', true)])`);
assert(r[0] === 10 && r[1] === Math.min(w.S - 10, 10) && r[3] === Math.max(2, Math.min(w.S - 8, 8)), `getRoomLinearDistance：普通 ${r[0]}，continuous 按 worldSize ${r[2]} 环绕 → ${r[1]}`);
// ===== 11. 官方 mapView：无视野房间显示 NPC / Keeper Lair =====
for (const l of w.structures.filter(s => s.type === 'keeperLair')) l.spawnAt = w.time + 1; e.tick(); e.tick();
const snap = e.snapshot('p1'), vis = new Set(snap.vis);
assert(!snap.creeps.some(c => c.owner === KEEPER && !vis.has(roomKey(c.x, c.y))), '无视野：快照里没有 Keeper 对象本身');
assert(snap.mapView.some(p => p[2] === 'k') && snap.mapView.some(p => p[2] === KEEPER) && snap.mapView.some(p => p[2] === INVADER), 'mapView：无视野房间也有 Keeper Lair(k) / Keeper / Invader 的位置点（processor.js mapView）');
assert(call(`const k = _.find(Game.creeps, () => false); console.log(1)`) === 1, 'lodash 正常');
console.log('npc tests passed');
