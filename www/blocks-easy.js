// 新手积木层：自然语言中文积木，隐藏代码细节（隐式「当前 creep」），下拉来自实时游戏状态，身体部件用表单选择。
// 生成的 JS 全部是官方 API 调用（creep.harvest / moveTo / spawnCreep ...），可在「预览」里查看。
// 完整官方 API 积木保留在「高级」分类里。
(function () {
const JS = Blockly.JavaScript, O = JS.ORDER_NONE, OA = JS.ORDER_ATOMIC;
const v = (b, n, d) => JS.valueToCode(b, n, O) || d;
const q = s => JSON.stringify(String(s));
const C = { cmd: '#5973FF', act: '#3d85c6', cond: '#4a8f6a', spawn: '#2e8b57', build: '#a06a3a', misc: '#6b7280' };

// ---------- 实时 Spawn 列表 ----------
function spawnOptions() {
  const out = [['任意空闲的 Spawn', '*']];
  try { const vw = typeof view === 'function' && view(); const me = typeof myPid !== 'undefined' ? myPid : null;
    if (vw && vw.spawns) for (const s of vw.spawns) if (s.owner === me && !out.some(o => o[1] === s.name)) out.push([s.name, s.name]); } catch (e) {}
  const cur = this && this.getValue ? this.getValue() : null; if (cur && !out.some(o => o[1] === cur)) out.push([cur, cur]);
  return out;
}
const spawnExpr = name => name === '*' ? 'sbmPickSpawn()' : `Game.spawns[${q(name)}]`;

// ---------- 身体部件表单字段 ----------
const PART = { work: ['工作', '#ffe56d'], carry: ['携带', '#777777'], move: ['移动', '#a9b7c6'], attack: ['攻击', '#f93842'], ranged_attack: ['远程', '#5d80b2'], heal: ['治疗', '#65fd62'], claim: ['占领', '#b99cfb'], tough: ['坚韧', '#ffffff'] };
const COST = p => (typeof SC !== 'undefined' && SC.BODYPART_COST) ? SC.BODYPART_COST[p] : { work: 100, carry: 50, move: 50, attack: 80, ranged_attack: 150, heal: 250, claim: 600, tough: 10 }[p];
const parseBody = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(x => PART[x]);
const bodyCost = L => L.reduce((a, p) => a + COST(p), 0);
function bodySummary(L) { if (!L.length) return '点此选择部件'; const c = {}; L.forEach(p => c[p] = (c[p] || 0) + 1); return Object.keys(c).map(p => PART[p][0] + '×' + c[p]).join(' ') + ` · ${bodyCost(L)} 能量`; }
class FieldBody extends Blockly.Field {
  constructor(value) { super(value || 'work,carry,move'); this.SERIALIZABLE = true; this.CURSOR = 'pointer'; }
  static fromJson(o) { return new FieldBody(o.value); }
  doClassValidation_(nv) { const L = parseBody(nv); return L.length && L.length <= 50 ? L.join(',') : null; }
  getText_() { return bodySummary(parseBody(this.getValue())); }
  showEditor_() { openBodyForm(this.getValue(), val => this.setValue(val)); }
}
Blockly.fieldRegistry.register('field_body', FieldBody);
function openBodyForm(value, done) {
  let L = parseBody(value); const host = document.getElementById('editor') || document.body;
  const d = document.createElement('div'); d.id = 'bodyForm'; host.appendChild(d);
  const draw = () => {
    const sec = L.length * 3;
    d.innerHTML = `<div class="bfBox"><div class="bfHead"><b>身体部件</b><span class="bfStat">${L.length}/50 个 · <b>${bodyCost(L)}</b> 能量 · 孵化 ${sec} tick</span></div>
      <div class="bfParts">${Object.keys(PART).map(p => `<button class="bfP" data-p="${p}"><i style="background:${PART[p][1]}"></i><span>${PART[p][0]}</span><em>${COST(p)}</em></button>`).join('')}</div>
      <div class="bfCur">${L.length ? L.map((p, i) => `<button class="bfC" data-i="${i}" style="background:${PART[p][1]}" title="点一下移除">${PART[p][0]}</button>`).join('') : '<span class="bfEmpty">点上面的部件添加，点这里的部件移除</span>'}</div>
      <div class="bfFoot"><button data-a="clear" class="ghost">清空</button><span class="sp"></span><button data-a="cancel" class="ghost">取消</button><button data-a="ok" class="primary"${L.length ? '' : ' disabled'}>确定</button></div></div>`;
  };
  draw();
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) { if (e.target === d) d.remove(); return; }
    if (b.dataset.p) { if (L.length < 50) L.push(b.dataset.p); }
    else if (b.dataset.i) L.splice(+b.dataset.i, 1);
    else if (b.dataset.a === 'clear') L = [];
    else if (b.dataset.a === 'cancel') return d.remove();
    else if (b.dataset.a === 'ok') { d.remove(); return done(L.join(',')); }
    draw();
  });
}
window.openBodyForm = openBodyForm;

// ---------- 身份（玩家自己定义：名字 + 身体部件 + 数量；随程序一起保存） ----------
// 名字直接写进生成脚本的 creep.memory.role
const LEGACY = { harvester: '采集者', upgrader: '升级者', builder: '建造者', repairer: '修理工', hauler: '搬运工', defender: '守卫', healer: '治疗者', claimer: '占领者' };
let ROLES = []; // [{ name, body: 'work,carry,move' }]（数量在「保持数量」积木上设）
const findRole = n => ROLES.find(r => r.name === n);
const roleZh = n => n ? (findRole(n) ? n : n + '（已删除）') : '（未选身份）';
const rolesChanged = () => { try { window.sbmRolesChanged && window.sbmRolesChanged(); } catch (e) {} };
Blockly.serialization.registry.register('sbmRoles', {
  priority: 90, // 先于积木加载
  save: () => ROLES.map(r => ({ name: r.name, body: r.body })),
  load: st => { ROLES = (Array.isArray(st) ? st : []).filter(r => r && typeof r.name === 'string' && r.name.trim()).map(r => ({ name: r.name.trim().slice(0, 12), body: parseBody(r.body).join(',') || 'work,carry,move' })); },
  clear: () => { ROLES = []; },
});
// 旧存档（内置角色）迁移：把用到的角色转成玩家身份，部件和数量取自原来的「保持数量」积木
function migrateState(state) {
  if (!state || state.sbmRoles || !state.blocks) return state;
  const st = JSON.parse(JSON.stringify(state)), found = {};
  (function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
    if (o.type && o.fields && typeof o.fields.ROLE === 'string') { const n = LEGACY[o.fields.ROLE] || o.fields.ROLE; o.fields.ROLE = n;
      const r = found[n] || (found[n] = { name: n, body: 'work,carry,move' });
      if ((o.type === 'e_keep' || o.type === 'e_spawn') && o.fields.BODY) r.body = o.fields.BODY;
      delete o.fields.BODY; }
    for (const k in o) walk(o[k]); })(st.blocks);
  const L = Object.values(found); if (L.length) st.sbmRoles = L; return st;
}
window.sbmLoadWs = (state, ws) => Blockly.serialization.workspaces.load(migrateState(state), ws);
function roleOptions() { const L = ROLES.map(r => [r.name, r.name]); const cur = this && this.getValue && this.getValue();
  if (cur && !findRole(cur)) L.push([cur + '（已删除）', cur]);
  L.push([ROLES.length ? '＋ 新建身份' : '还没有身份，＋ 新建身份', '__new']); if (ROLES.length) L.push(['管理身份', '__manage']); return L; }
class FieldRole extends Blockly.FieldDropdown {
  constructor(v, opt) { super(roleOptions); this.detail_ = !!(opt && opt.detail); if (v != null) this.setValue(v); }
  static fromJson(o) { return new FieldRole(o.value, o); }
  doClassValidation_(nv) { if (nv === '__new' || nv === '__manage') { const b = this.getSourceBlock();
      if (b && !b.isInFlyout) setTimeout(() => nv === '__new' ? openRoleEdit(null, n => { if (n) this.setValue(n); }) : openRoleManager(), 0); return null; }
    return typeof nv === 'string' ? nv : null; }
  getText_() { const v = this.getValue(); if (!v) return ROLES.length ? '选择身份' : '先新建身份'; const r = findRole(v);
    if (!r) return v + '（已删除）'; return r.name; }
}
Blockly.fieldRegistry.register('field_role', FieldRole);
const forEachRoleField = fn => { const w = Blockly.getMainWorkspace && Blockly.getMainWorkspace(); if (!w) return;
  for (const b of w.getAllBlocks(false)) { const f = b.getField && b.getField('ROLE'); if (f instanceof FieldRole) fn(f, b); } };
const refreshRoleFields = () => forEachRoleField(f => { f.forceRerender && f.forceRerender(); });
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const ic = n => typeof icon === 'function' ? icon(n) : '';
// 新建 / 修改身份：名字 + 数量 + 身体部件
function openRoleEdit(old, done) {
  const r0 = old ? findRole(old) : null; let name = r0 ? r0.name : '', L = parseBody(r0 ? r0.body : 'work,carry,move');
  const host = document.getElementById('editor') || document.body; const d = document.createElement('div'); d.id = 'roleEdit'; d.className = 'sbmForm'; host.appendChild(d);
  const err = () => { const n = name.trim(); if (!n) return '请输入身份名字'; if (ROLES.some(r => r.name === n && r !== r0)) return '已经有同名身份'; if (!L.length) return '至少选一个部件'; return ''; };
  const draw = () => {
    d.innerHTML = `<div class="bfBox"><div class="bfHead"><b>${r0 ? '修改身份' : '新建身份'}</b><span class="bfStat">${L.length}/50 个 · <b>${bodyCost(L)}</b> 能量 · 孵化 ${L.length * 3} tick</span></div>
      <div class="rfRow"><label>名字</label><input class="rfName" maxlength="12" placeholder="例如：采集者" value="${esc(name)}"></div>
      <div class="bfParts">${Object.keys(PART).map(p => `<button class="bfP" data-p="${p}"><i style="background:${PART[p][1]}"></i><span>${PART[p][0]}</span><em>${COST(p)}</em></button>`).join('')}</div>
      <div class="bfCur">${L.length ? L.map((p, i) => `<button class="bfC" data-i="${i}" style="background:${PART[p][1]}">${PART[p][0]}</button>`).join('') : '<span class="bfEmpty">点上面的部件添加，点这里的部件移除</span>'}</div>
      <div class="bfFoot"><span class="rfErr">${err()}</span><span class="sp"></span><button data-a="cancel" class="ghost">取消</button><button data-a="ok" class="primary"${err() ? ' disabled' : ''}>${r0 ? '保存' : '创建'}</button></div></div>`;
    const inp = d.querySelector('.rfName'); inp.oninput = () => { name = inp.value; d.querySelector('.rfErr').textContent = err(); d.querySelector('[data-a="ok"]').disabled = !!err(); };
  };
  draw(); if (!r0) setTimeout(() => { const i = d.querySelector('.rfName'); i && i.focus(); }, 50);
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) { if (e.target === d) { d.remove(); done && done(null); } return; }
    if (b.dataset.p) { if (L.length < 50) L.push(b.dataset.p); }
    else if (b.dataset.i) L.splice(+b.dataset.i, 1);
    else if (b.dataset.a === 'cancel') { d.remove(); return done && done(null); }
    else if (b.dataset.a === 'ok') { if (err()) return; const n = name.trim();
      if (r0) { const was = r0.name; Object.assign(r0, { name: n, body: L.join(',') }); if (was !== n) forEachRoleField(f => { if (f.getValue() === was) f.setValue(n); }); }
      else ROLES.push({ name: n, body: L.join(',') });
      d.remove(); refreshRoleFields(); rolesChanged(); return done && done(n); }
    draw();
  });
}
// 身份管理：列表 + 新建 / 修改 / 删除
function openRoleManager() {
  const host = document.getElementById('editor') || document.body; let d = document.getElementById('roleMgr'); if (d) d.remove();
  d = document.createElement('div'); d.id = 'roleMgr'; d.className = 'sbmForm'; host.appendChild(d);
  const uses = n => { let k = 0; forEachRoleField(f => { if (f.getValue() === n) k++; }); return k; };
  const draw = () => {
    d.innerHTML = `<div class="bfBox"><div class="bfHead"><b>身份</b><span class="bfStat">${ROLES.length} 个</span></div>
      <div class="rmList">${ROLES.length ? ROLES.map((r, i) => `<div class="rmItem"><div class="rmMain"><b>${esc(r.name)}</b><span>${bodySummary(parseBody(r.body))}</span></div>
        <button class="rmBtn" data-e="${i}" title="修改">${ic('pencil')}</button><button class="rmBtn del" data-d="${i}" title="删除">${ic('trash')}</button></div>`).join('') : '<div class="bfEmpty rmEmpty">还没有身份</div>'}</div>
      <div class="bfFoot"><button data-a="new" class="primary">${ic('plus')} 新建身份</button><span class="sp"></span><button data-a="close" class="ghost">完成</button></div></div>`;
  };
  draw();
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) { if (e.target === d) d.remove(); return; }
    if (b.dataset.a === 'close') return d.remove();
    if (b.dataset.a === 'new') return openRoleEdit(null, () => draw());
    if (b.dataset.e) return openRoleEdit(ROLES[+b.dataset.e].name, () => draw());
    if (b.dataset.d) { const r = ROLES[+b.dataset.d], k = uses(r.name);
      if (!confirm(k ? `删除「${r.name}」？有 ${k} 个积木用到它，需要重新选择身份。` : `删除「${r.name}」？`)) return;
      ROLES.splice(+b.dataset.d, 1); refreshRoleFields(); rolesChanged(); draw(); }
  });
}
window.openRoleManager = openRoleManager; window.openRoleEdit = openRoleEdit; window.sbmRoles = () => ROLES;
window.sbmSetRoles = L => { ROLES = L.map(r => Object.assign({}, r)); };

// ---------- 运行时助手（只要用到新手积木就会一起生成；全部是官方 API） ----------
const LIB = `// ===== 积木助手（自动生成，全部使用官方 API）=====
// 对目标执行动作；距离不够时自动走过去
function sbmDo(creep, target, action, ...args) {
  if (!target) return false;
  const r = creep[action](target, ...args);
  if (r === ERR_NOT_IN_RANGE) creep.moveTo(target, { reusePath: 5 });
  return r === OK || r === ERR_NOT_IN_RANGE;
}
// 找一个空闲的 Spawn
function sbmPickSpawn() {
  const all = Object.values(Game.spawns);
  return all.find(s => !s.spawning && !sbmPickSpawn.used[s.name]) || all[0];
}
sbmPickSpawn.used = {};
// 角色数量
function sbmCount(role) { return Object.values(Game.creeps).filter(c => c.memory.role === role).length; }
// 保持某个角色的数量（同一 tick 每个 Spawn 只孵化一个，排在上面的先孵化）
function sbmKeep(role, n, body, spawn) {
  if (sbmCount(role) >= n || !spawn || spawn.spawning || sbmPickSpawn.used[spawn.name]) return;
  const r = spawn.spawnCreep(body, role + Game.time, { memory: { role: role } });
  sbmPickSpawn.used[spawn.name] = true;
  return r;
}
// 先补能量，再干活：背包空了去补，装满了去干活
function sbmCycle(creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
  return creep.memory.working;
}
// 需要能量的建筑
function sbmNeedEnergy(creep, types) {
  return creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: s => types.includes(s.structureType) && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 })
    || (types.includes(STRUCTURE_CONTAINER) ? creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }) : null);
}
// 在 Spawn 附近自动找空位放工地（数量受控制器等级限制）
function sbmPlace(spawn, type) {
  if (!spawn || !spawn.room.controller) return;
  const room = spawn.room, lim = (CONTROLLER_STRUCTURES[type] || {})[room.controller.level] || 0;
  const have = room.find(FIND_STRUCTURES, { filter: s => s.structureType === type }).length + room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === type }).length;
  if (have >= lim) return;
  const t = room.getTerrain();
  for (let r = 2; r <= 8; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = spawn.pos.x + dx, y = spawn.pos.y + dy;
    if (x < 2 || y < 2 || x > 47 || y > 47 || (x + y) % 2 || t.get(x, y) === TERRAIN_MASK_WALL) continue;
    if (room.lookForAt(LOOK_STRUCTURES, x, y).length || room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) continue;
    if (room.createConstructionSite(x, y, type) === OK) return;
  }
}
`;
const useLib = () => { JS.definitions_['sbm_lib'] = LIB; };

// ---------- 定义工具 ----------
const EASY = [];
function E(type, json, gen, say) {
  json.type = type; json.colour = json.colour || C.act; json.tooltip = json.tooltip || '';
  Blockly.defineBlocksWithJsonArray([json]);
  JS.forBlock[type] = function (b) { useLib(); return gen(b); };
  EASY.push({ type, say });
}
const stmt = { previousStatement: null, nextStatement: null };
const dd = (name, opts) => ({ type: 'field_dropdown', name, options: opts });
const roleDD = (name, detail) => ({ type: 'field_role', name, value: '', detail: !!detail });
const roleV = b => b.getFieldValue('ROLE') || '';
// 身份没选或已删除时给出提示
function needRole(type) { const bd = Blockly.Blocks[type], old = bd.onchange;
  bd.onchange = function (e) { if (old) old.call(this, e); if (!this.workspace || this.workspace.isFlyout || this.isInFlyout) return;
    if (this.getField('ROLE') && !findRole(roleV(this))) this.setWarningText(roleV(this) ? '这个身份已删除，请重新选择' : '请选择身份（没有就新建一个）', 'role'); else this.setWarningText(null, 'role'); }; }
const ctxTypes = ['e_each', 'e_role', 'e_cycle'];
// 需要「当前 creep」的积木：不在 creep 积木里面时给出提示
function needCreep(type) {
  const bd = Blockly.Blocks[type], old = bd.onchange;
  bd.onchange = function (e) { if (old) old.call(this, e); if (!this.workspace || this.workspace.isFlyout || this.isInFlyout) return;
    let p = this.getSurroundParent(), ok = false; while (p) { if (ctxTypes.includes(p.type)) { ok = true; break; } p = p.getSurroundParent(); }
    this.setWarningText(ok ? null : '要放在「对每个 creep」或「身份为 … 的 creep」里面'); };
}

// ===== 指挥 =====
E('e_each', { message0: '对每个我的 creep %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], ...stmt, colour: C.cmd, tooltip: '让每个 creep 依次执行里面的积木（孵化中的会跳过）' },
  b => `for (const name in Game.creeps) {\n  const creep = Game.creeps[name];\n  if (creep.spawning) continue;\n${JS.statementToCode(b, 'DO')}}\n`,
  (b, s) => ['让每个 creep：', s('DO')]);
E('e_role', { message0: '身份为 %1 的 creep %2 %3', args0: [roleDD('ROLE'), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], ...stmt, colour: C.cmd, tooltip: '只让这个身份的 creep 执行里面的积木' },
  b => !roleV(b) ? '' : `for (const name in Game.creeps) {\n  const creep = Game.creeps[name];\n  if (creep.spawning || creep.memory.role !== ${q(b.getFieldValue('ROLE'))}) continue;\n${JS.statementToCode(b, 'DO')}}\n`,
  (b, s) => [`让每个「${roleZh(b.getFieldValue('ROLE'))}」：`, s('DO')]);
E('e_cycle', { message0: '先 %1 装满能量 %2 再 %3 用完再回去补充', args0: [dd('SRC', [['采集能量源', 'harvest'], ['从仓库或容器取', 'withdraw'], ['捡地上的能量', 'pickup']]), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], ...stmt, colour: C.cmd, tooltip: '背包空了就去补充能量，装满后执行里面的积木' },
  b => { const s = b.getFieldValue('SRC'); const get = s === 'harvest' ? `sbmDo(creep, creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE), 'harvest');`
      : s === 'withdraw' ? `sbmDo(creep, creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: s => (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_CONTAINER) && s.store[RESOURCE_ENERGY] > 0 }), 'withdraw', RESOURCE_ENERGY);`
      : `sbmDo(creep, creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY }), 'pickup');`;
    return `if (sbmCycle(creep)) {\n${JS.statementToCode(b, 'DO')}} else {\n  ${get}\n}\n`; },
  (b, s) => [`先${{ harvest: '去最近的能量源采集', withdraw: '从仓库或容器取能量', pickup: '捡地上的能量' }[b.getFieldValue('SRC')]}直到装满，然后：`, s('DO'), '能量用完后回去补充']);
E('e_every', { message0: '每 %1 tick 执行一次 %2 %3', args0: [{ type: 'field_number', name: 'N', value: 10, min: 1, precision: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], ...stmt, colour: C.cmd },
  b => `if (Game.time % ${b.getFieldValue('N')} === 0) {\n${JS.statementToCode(b, 'DO')}}\n`, (b, s) => [`每 ${b.getFieldValue('N')} tick：`, s('DO')]);

// ===== 动作（当前 creep）=====
const HARV = [['最近的能量源', 'near'], ['房间第 1 个能量源', '0'], ['房间第 2 个能量源', '1']];
E('e_harvest', { message0: '采集 %1', args0: [dd('T', HARV)], ...stmt },
  b => { const t = b.getFieldValue('T'); return `sbmDo(creep, ${t === 'near' ? 'creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE)' : `creep.room.find(FIND_SOURCES)[${t}]`}, 'harvest');\n`; },
  b => `采集${HARV.find(x => x[1] === b.getFieldValue('T'))[0]}（不够近会自动走过去）`);
const DELIV = [['最近的 Spawn 或扩展', 'spawnext'], ['最近的防御塔', 'tower'], ['仓库 Storage', 'storage'], ['最近的容器', 'container']];
const DELIV_T = { spawnext: '[STRUCTURE_SPAWN, STRUCTURE_EXTENSION]', tower: '[STRUCTURE_TOWER]', storage: '[STRUCTURE_STORAGE]', container: '[STRUCTURE_CONTAINER]' };
E('e_deliver', { message0: '把能量送到 %1', args0: [dd('T', DELIV)], ...stmt },
  b => `sbmDo(creep, sbmNeedEnergy(creep, ${DELIV_T[b.getFieldValue('T')]}), 'transfer', RESOURCE_ENERGY);\n`,
  b => `把能量送到${DELIV.find(x => x[1] === b.getFieldValue('T'))[0]}`);
E('e_upgrade', { message0: '升级控制器', ...stmt }, () => `sbmDo(creep, creep.room.controller, 'upgradeController');\n`, () => '用能量升级房间控制器');
E('e_build', { message0: '建造 最近的工地', ...stmt }, () => `sbmDo(creep, creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES), 'build');\n`, () => '建造最近的工地');
const REP = [['最近的受损建筑', 'near'], ['最破的建筑', 'worst'], ['最近的受损道路', 'road']];
E('e_repair', { message0: '修理 %1', args0: [dd('T', REP)], ...stmt },
  b => { const t = b.getFieldValue('T'), f = `s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL${t === 'road' ? ' && s.structureType === STRUCTURE_ROAD' : ''}`;
    return t === 'worst' ? `sbmDo(creep, creep.room.find(FIND_STRUCTURES, { filter: ${f} }).sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0], 'repair');\n`
      : `sbmDo(creep, creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: ${f} }), 'repair');\n`; },
  b => `修理${REP.find(x => x[1] === b.getFieldValue('T'))[0]}`);
const ATK = [['最近的敌方 creep', 'creep'], ['最近的敌方建筑', 'struct']];
E('e_attack', { message0: '%1 %2', args0: [dd('M', [['近战攻击', 'attack'], ['远程攻击', 'rangedAttack'], ['拆除', 'dismantle']]), dd('T', ATK)], ...stmt, colour: '#b04a4a' },
  b => `sbmDo(creep, creep.pos.findClosestByPath(${b.getFieldValue('T') === 'creep' ? 'FIND_HOSTILE_CREEPS' : 'FIND_HOSTILE_STRUCTURES'}), ${q(b.getFieldValue('M'))});\n`,
  b => `${{ attack: '近战攻击', rangedAttack: '远程攻击', dismantle: '拆除' }[b.getFieldValue('M')]}${ATK.find(x => x[1] === b.getFieldValue('T'))[0]}`);
E('e_heal', { message0: '治疗 最近的受伤队友', ...stmt, colour: '#3f9a4a' }, () => `sbmDo(creep, creep.pos.findClosestByPath(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax }), 'heal');\n`, () => '治疗最近的受伤队友');
E('e_pickup', { message0: '捡起 最近的掉落能量', ...stmt }, () => `sbmDo(creep, creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY }), 'pickup');\n`, () => '捡起最近的掉落能量');
E('e_withdraw', { message0: '从 %1 取能量', args0: [dd('T', [['仓库 Storage', 'storage'], ['最近的容器', 'container'], ['最近的墓碑', 'tomb']])], ...stmt },
  b => { const t = b.getFieldValue('T');
    const tg = t === 'storage' ? 'creep.room.storage' : t === 'tomb' ? `creep.pos.findClosestByPath(FIND_TOMBSTONES, { filter: t => t.store[RESOURCE_ENERGY] > 0 })` : `creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0 })`;
    return `sbmDo(creep, ${tg}, 'withdraw', RESOURCE_ENERGY);\n`; }, b => `从${{ storage: '仓库', container: '最近的容器', tomb: '最近的墓碑' }[b.getFieldValue('T')]}取能量`);
E('e_move', { message0: '走到 %1', args0: [dd('T', [['控制器', 'ctrl'], ['最近的能量源', 'src'], ['我的 Spawn', 'spawn']])], ...stmt },
  b => `creep.moveTo(${{ ctrl: 'creep.room.controller', src: 'creep.pos.findClosestByPath(FIND_SOURCES)', spawn: 'creep.pos.findClosestByPath(FIND_MY_SPAWNS) || sbmPickSpawn()' }[b.getFieldValue('T')]});\n`,
  b => `走到${{ ctrl: '控制器', src: '最近的能量源', spawn: '我的 Spawn' }[b.getFieldValue('T')]}`);
E('e_flag', { message0: '走到旗帜 %1', args0: [{ type: 'field_input', name: 'F', text: 'Flag1' }], ...stmt },
  b => `if (Game.flags[${q(b.getFieldValue('F'))}]) creep.moveTo(Game.flags[${q(b.getFieldValue('F'))}]);\n`, b => `走到旗帜「${b.getFieldValue('F')}」`);
E('e_claim', { message0: '占领 旗帜 %1 所在房间', args0: [{ type: 'field_input', name: 'F', text: 'Flag1' }], ...stmt, colour: '#7b4fa0' },
  b => { const f = `Game.flags[${q(b.getFieldValue('F'))}]`; return `if (${f}) {\n  if (creep.room.name !== ${f}.pos.roomName) creep.moveTo(${f});\n  else sbmDo(creep, creep.room.controller, 'claimController');\n}\n`; },
  b => `去旗帜「${b.getFieldValue('F')}」所在房间占领控制器`);
E('e_say', { message0: '说 %1', args0: [{ type: 'field_input', name: 'T', text: '你好' }], ...stmt, colour: C.misc }, b => `creep.say(${q(b.getFieldValue('T'))});\n`, b => `头上显示「${b.getFieldValue('T')}」`);
E('e_recycle', { message0: '回到 Spawn 回收自己', ...stmt, colour: C.misc },
  () => `{ const sp = creep.pos.findClosestByPath(FIND_MY_SPAWNS); if (sp && sp.recycleCreep(creep) === ERR_NOT_IN_RANGE) creep.moveTo(sp); }\n`, () => '回到 Spawn 把自己回收');
['e_harvest', 'e_deliver', 'e_upgrade', 'e_build', 'e_repair', 'e_attack', 'e_heal', 'e_pickup', 'e_withdraw', 'e_move', 'e_flag', 'e_claim', 'e_say', 'e_recycle', 'e_cycle'].forEach(needCreep);

// ===== 判断 =====
const outB = { output: 'Boolean', colour: C.cond };
const STORE = [['已装满', 'full'], ['是空的', 'empty'], ['还有空位', 'free'], ['装有能量', 'has']];
E('e_store', { message0: '背包 %1', args0: [dd('S', STORE)], ...outB },
  b => [{ full: 'creep.store.getFreeCapacity() === 0', empty: 'creep.store.getUsedCapacity() === 0', free: 'creep.store.getFreeCapacity() > 0', has: 'creep.store[RESOURCE_ENERGY] > 0' }[b.getFieldValue('S')], JS.ORDER_EQUALITY],
  b => `背包${STORE.find(x => x[1] === b.getFieldValue('S'))[0]}`);
const EX = [['工地', 'site'], ['敌人', 'enemy'], ['受损建筑', 'hurt'], ['掉落的能量', 'drop'], ['受伤的队友', 'ally'], ['需要能量的 Spawn 或扩展', 'need']];
const EX_C = { site: 'creep.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0', enemy: 'creep.room.find(FIND_HOSTILE_CREEPS).length > 0',
  hurt: 'creep.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL }).length > 0',
  drop: 'creep.room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY }).length > 0', ally: 'creep.room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax }).length > 0',
  need: 'creep.room.find(FIND_MY_STRUCTURES, { filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }).length > 0' };
E('e_exists', { message0: '房间里有 %1', args0: [dd('T', EX)], ...outB }, b => [EX_C[b.getFieldValue('T')], JS.ORDER_RELATIONAL], b => `房间里有${EX.find(x => x[1] === b.getFieldValue('T'))[0]}`);
E('e_hp', { message0: '血量低于 %1 %%', args0: [{ type: 'field_number', name: 'N', value: 50, min: 1, max: 100 }], ...outB },
  b => [`creep.hits < creep.hitsMax * ${b.getFieldValue('N') / 100}`, JS.ORDER_RELATIONAL], b => `血量低于 ${b.getFieldValue('N')}%`);
E('e_isrole', { message0: '是 %1', args0: [roleDD('ROLE')], ...outB }, b => [`creep.memory.role === ${q(b.getFieldValue('ROLE'))}`, JS.ORDER_EQUALITY], b => `是${roleZh(b.getFieldValue('ROLE'))}`);
['e_store', 'e_exists', 'e_hp', 'e_isrole'].forEach(needCreep);
const outN = { output: 'Number', colour: C.cond };
E('e_count', { message0: '%1 的数量', args0: [roleDD('ROLE')], ...outN }, b => [`sbmCount(${q(b.getFieldValue('ROLE'))})`, JS.ORDER_FUNCTION_CALL], b => `${roleZh(b.getFieldValue('ROLE'))}的数量`);
E('e_energy', { message0: '%1 房间的可用能量', args0: [{ type: 'field_dropdown', name: 'SP', options: spawnOptions }], ...outN },
  b => [`(${spawnExpr(b.getFieldValue('SP'))} ? ${spawnExpr(b.getFieldValue('SP'))}.room.energyAvailable : 0)`, OA], () => '房间里可用于孵化的能量');
E('e_level', { message0: '控制器等级', ...outN }, () => [`(Object.values(Game.spawns)[0] ? Object.values(Game.spawns)[0].room.controller.level : 0)`, OA], () => '控制器等级');
E('e_ttl', { message0: '剩余寿命', ...outN }, () => ['creep.ticksToLive', JS.ORDER_MEMBER], () => '剩余寿命');
needCreep('e_ttl');

// ===== 孵化 =====
const roleBody = r => `[${parseBody(r.body).map(p => p.toUpperCase()).join(', ')}]`;
E('e_keep', { message0: '保持 %1 数量为 %2 %3 用 %4 孵化', args0: [roleDD('ROLE'), { type: 'field_number', name: 'N', value: 2, min: 0, max: 50, precision: 1 }, { type: 'input_dummy' }, { type: 'field_dropdown', name: 'SP', options: spawnOptions }], ...stmt, colour: C.spawn, tooltip: '数量不够时按身份里设定的部件自动孵化；排在上面的先孵化' },
  b => { const r = findRole(roleV(b)); return r ? `sbmKeep(${q(r.name)}, ${b.getFieldValue('N')}, ${roleBody(r)}, ${spawnExpr(b.getFieldValue('SP'))});\n` : ''; },
  b => { const r = findRole(roleV(b)); return r ? `始终保持 ${b.getFieldValue('N')} 个${r.name}（${bodySummary(parseBody(r.body))}），不够就孵化` : `保持数量：${roleZh(roleV(b))}`; });
E('e_spawn', { message0: '用 %1 孵化一个 %2', args0: [{ type: 'field_dropdown', name: 'SP', options: spawnOptions }, roleDD('ROLE')], ...stmt, colour: C.spawn, tooltip: '按身份里设定的部件孵化一个' },
  b => { const r = findRole(roleV(b)); return r ? `{ const sp = ${spawnExpr(b.getFieldValue('SP'))}; if (sp && !sp.spawning) sp.spawnCreep(${roleBody(r)}, ${q(r.name)} + Game.time, { memory: { role: ${q(r.name)} } }); }\n` : ''; },
  b => { const r = findRole(roleV(b)); return r ? `孵化一个${r.name}（${bodySummary(parseBody(r.body))}）` : `孵化：${roleZh(roleV(b))}`; });
E('e_clean', { message0: '清理已死亡 creep 的记忆', ...stmt, colour: C.spawn }, () => `for (const name in Memory.creeps) if (!Game.creeps[name]) delete Memory.creeps[name];\n`, () => '清理已死亡 creep 的记忆');

// ===== 建筑 =====
const PLACE = [['扩展', 'STRUCTURE_EXTENSION'], ['防御塔', 'STRUCTURE_TOWER'], ['容器', 'STRUCTURE_CONTAINER'], ['仓库', 'STRUCTURE_STORAGE'], ['道路', 'STRUCTURE_ROAD']];
E('e_place', { message0: '在 %1 附近放 %2 工地', args0: [{ type: 'field_dropdown', name: 'SP', options: spawnOptions }, dd('T', PLACE)], ...stmt, colour: C.build, tooltip: '自动找空位，按控制器等级允许的数量放置' },
  b => `sbmPlace(${spawnExpr(b.getFieldValue('SP'))}, ${b.getFieldValue('T')});\n`, b => `在 Spawn 附近自动放${PLACE.find(x => x[1] === b.getFieldValue('T'))[0]}工地（不超过等级上限）`);
E('e_tower', { message0: '所有防御塔：攻击敌人，没敌人就治疗队友和修理', ...stmt, colour: C.build },
  () => `for (const t of Object.values(Game.structures).filter(s => s.structureType === STRUCTURE_TOWER)) {\n  const foe = t.pos.findClosestByRange(FIND_HOSTILE_CREEPS);\n  if (foe) { t.attack(foe); continue; }\n  const hurt = t.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });\n  if (hurt) { t.heal(hurt); continue; }\n  const s = t.pos.findClosestByRange(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART });\n  if (s && t.store[RESOURCE_ENERGY] > 500) t.repair(s);\n}\n`,
  () => '所有防御塔：有敌人就攻击，否则治疗受伤队友、修理受损建筑');
E('e_safe', { message0: '有敌人进入时开启安全模式', ...stmt, colour: C.build },
  () => `for (const name in Game.rooms) { const r = Game.rooms[name]; if (r.controller && r.controller.my && r.find(FIND_HOSTILE_CREEPS).length && !r.controller.safeMode) r.controller.activateSafeMode(); }\n`, () => '有敌人进入我的房间时开启安全模式');
E('e_log', { message0: '在控制台显示 %1', args0: [{ type: 'input_value', name: 'T' }], ...stmt, colour: C.misc, inputsInline: true }, b => `console.log(${v(b, 'T', "''")});\n`, () => '在控制台显示一条消息');

// ---------- 分类（默认是新手积木，「高级」里是完整官方 API） ----------
const X = (type, extra) => Object.assign({ kind: 'block', type }, extra || {});
const IFC = (cond, els) => X('controls_if', Object.assign({ inputs: { IF0: { block: { type: cond } } } }, els ? { extraState: { hasElse: true } } : {}));
const EASY_CATS = [
  { id: 'e_cmd', name: '指挥', colour: C.cmd, items: [X('e_role'), X('e_each'), X('e_cycle', { inputs: { DO: { block: { type: 'e_upgrade' } } } }), X('e_every')] },
  { id: 'e_act', name: '动作', colour: C.act, items: ['e_harvest', 'e_deliver', 'e_upgrade', 'e_build', 'e_repair', 'e_pickup', 'e_withdraw', 'e_attack', 'e_heal', 'e_move', 'e_flag', 'e_claim', 'e_say', 'e_recycle'].map(t => X(t)) },
  { id: 'e_cond', name: '判断', colour: C.cond, items: [IFC('e_store'), IFC('e_exists', true), X('e_store'), X('e_exists'), X('e_hp'), X('e_isrole'),
      X('logic_compare', { inputs: { A: { block: { type: 'e_count' } }, B: { shadow: { type: 'math_number', fields: { NUM: 3 } } } }, fields: { OP: 'LT' } }), X('logic_operation'), X('logic_negate'),
      X('e_count'), X('e_energy'), X('e_level'), X('e_ttl'), X('math_number')] },
  { id: 'e_spawn', name: '孵化', colour: C.spawn, items: [{ kind: 'button', text: '＋ 新建身份', callbackKey: 'sbmNewRole' }, { kind: 'button', text: '管理身份', callbackKey: 'sbmRoles' }, X('e_keep'), X('e_spawn'), X('e_clean')] },
  { id: 'e_build', name: '建筑', colour: C.build, items: [X('e_place'), X('e_tower'), X('e_safe')] },
  { id: 'e_misc', name: '其他', colour: C.misc, items: [X('e_log', { inputs: { T: { shadow: { type: 'text', fields: { TEXT: '你好' } } } } }), X('text'), X('controls_repeat_ext', { inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } })] },
];
CATS.forEach(c => c.adv = true);
CATS.unshift(...EASY_CATS);
['e_role', 'e_isrole', 'e_count', 'e_keep', 'e_spawn'].forEach(needRole);
window.EASY_BLOCKS = EASY;

// ---------- 默认入门程序（全部用新手积木） ----------
const N = (type, o) => ({ block: Object.assign({ type }, o || {}) });
const chain = (...L) => { for (let i = L.length - 2; i >= 0; i--) L[i].block.next = L[i + 1]; return L[0]; };
const keep = (role, n) => N('e_keep', { fields: { ROLE: role, N: n, SP: '*' } });
const role = (r, inner) => N('e_role', { fields: { ROLE: r }, inputs: { DO: inner } });
const cycle = inner => N('e_cycle', { fields: { SRC: 'harvest' }, inputs: { DO: inner } });
const ifElse = (cond, a, b) => N('controls_if', { extraState: { hasElse: true }, inputs: { IF0: N(cond.t, { fields: cond.f }), DO0: a, ELSE: b } });
DEFAULT_WS = { blocks: { languageVersion: 0, blocks: [Object.assign(chain(
  N('e_clean'),
  keep('采集者', 2), keep('升级者', 2), keep('建造者', 1),
  role('采集者', cycle(ifElse({ t: 'e_exists', f: { T: 'need' } }, N('e_deliver', { fields: { T: 'spawnext' } }), N('e_upgrade')))),
  role('升级者', cycle(N('e_upgrade'))),
  role('建造者', cycle(ifElse({ t: 'e_exists', f: { T: 'site' } }, N('e_build'), N('e_upgrade')))),
).block, { x: 16, y: 16 })] }, sbmRoles: [{ name: '采集者', body: 'work,carry,move' }, { name: '升级者', body: 'work,carry,move' }, { name: '建造者', body: 'work,carry,move' }] };

// ---------- 程序说明（白话） ----------
function describe(ws) {
  const out = [];
  const say = t => EASY.find(e => e.type === t);
  function line(b, d) {
    if (!b || b.isEnabled && !b.isEnabled()) return;
    const ind = '  '.repeat(d), e = say(b.type);
    const sub = name => { const c = b.getInputTargetBlock(name); const L = []; let x = c; while (x) { L.push(x); x = x.getNextBlock(); } return L; };
    if (e && e.say) {
      const r = e.say(b, n => n);
      if (Array.isArray(r)) { out.push(ind + r[0]); for (const x of sub(r[1])) line(x, d + 1); if (r[2]) out.push(ind + r[2]); }
      else out.push(ind + r);
    } else if (b.type === 'controls_if') {
      let i = 0; while (b.getInput('IF' + i)) { const c = b.getInputTargetBlock('IF' + i); out.push(ind + (i ? '否则如果' : '如果') + '「' + cond(c) + '」：'); for (const x of sub('DO' + i)) line(x, d + 1); i++; }
      if (b.getInput('ELSE')) { out.push(ind + '否则：'); for (const x of sub('ELSE')) line(x, d + 1); }
    } else if (b.type === 'controls_repeat_ext') { out.push(ind + `重复 ${cond(b.getInputTargetBlock('TIMES'))} 次：`); for (const x of sub('DO')) line(x, d + 1); }
    else { out.push(ind + (b.type.startsWith('api_') ? '（高级）' : '') + b.toString().slice(0, 60)); }
  }
  function cond(c) {
    if (!c) return '（空）'; const e = say(c.type); if (e && e.say) return e.say(c);
    if (c.type === 'logic_negate') return '不是 ' + cond(c.getInputTargetBlock('BOOL'));
    if (c.type === 'logic_operation') return cond(c.getInputTargetBlock('A')) + (c.getFieldValue('OP') === 'AND' ? ' 并且 ' : ' 或者 ') + cond(c.getInputTargetBlock('B'));
    if (c.type === 'logic_compare') return cond(c.getInputTargetBlock('A')) + ' ' + ({ EQ: '等于', NEQ: '不等于', LT: '少于', LTE: '不多于', GT: '多于', GTE: '不少于' }[c.getFieldValue('OP')]) + ' ' + cond(c.getInputTargetBlock('B'));
    if (c.type === 'math_number') return String(c.getFieldValue('NUM'));
    return c.toString();
  }
  for (const top of ws.getTopBlocks(true)) { let b = top; while (b) { line(b, 0); b = b.getNextBlock(); } }
  return out.length ? out : ['（还没有积木）'];
}
window.describeProgram = describe;
// 简单语法高亮
window.highlightJS = function (src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const re = /(\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`)|\b(const|let|var|function|for|in|of|if|else|return|continue|break|new|while|true|false|null|undefined)\b|\b([A-Z][A-Z0-9_]{2,})\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = '', i = 0, m;
  while ((m = re.exec(src))) { out += esc(src.slice(i, m.index)); const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'K' : 'n'; out += `<span class="hl${cls}">${esc(m[0])}</span>`; i = re.lastIndex; }
  return out + esc(src.slice(i));
};
})();
