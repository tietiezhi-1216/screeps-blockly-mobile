// Screeps World 官方 API 积木（对齐 https://docs.screeps.com/api/ ）
// 每块积木 1:1 对应一个官方函数 / 方法 / 属性 / 常量；积木上只显示中文，生成的代码直接调用官方 API。
// 没有打包好的“助手”积木。动作积木把返回值存进「上一个动作的结果」，可与返回码比较。
(function () {
const JS = Blockly.JavaScript;
JS.INFINITE_LOOP_TRAP = '__loopGuard();\n'; // 每次循环检查 Game.cpu.tickLimit
const O = JS.ORDER_NONE, OM = JS.ORDER_MEMBER, OF = JS.ORDER_FUNCTION_CALL, OA = JS.ORDER_ATOMIC, ON = JS.ORDER_NEW, OR = JS.ORDER_RELATIONAL, OEQ = JS.ORDER_EQUALITY;
const R = '__r'; // 上一个动作的结果（模块级变量，跨回合保留）
// 生成的程序：变量 / 函数 / 结果放在模块顶层（跨回合保留），积木程序本身放进官方的 module.exports.loop（每回合执行一次）
JS.finish = (function (orig) { return function (code) {
  if (code.includes(R)) this.definitions_['__r'] = `var ${R}; // 上一个动作的结果`;
  const body = code.trim() ? 'module.exports.loop = function () {\n' + this.prefixLines(code, this.INDENT) + '};\n' : '';
  return orig.call(this, body);
}; })(JS.finish);
// 变量 / 函数名保留中文（官方 JS 支持 Unicode 标识符），只替换不能做名字的符号
if (Blockly.Names && Blockly.Names.prototype) Blockly.Names.prototype.safeName = function (name) {
  if (!name) return 'unnamed'; name = String(name).replace(/[^\p{L}\p{N}_$]/gu, '_'); return /^\p{N}/u.test(name) ? '_' + name : name; };
const vc = (b, n, d = 'undefined') => JS.valueToCode(b, n, O) || d;
const rv = b => JS.valueToCode(b, 'O', OM) || 'undefined';
const q = s => JSON.stringify(String(s));
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const ic = n => typeof icon === 'function' ? icon(n) : '';

// ---------- 分类 ----------
const CATS = [
  { id: 'game', name: '游戏', colour: '#4a6fa5' }, { id: 'find', name: '查找', colour: '#3f7f8f' }, { id: 'prop', name: '属性', colour: '#5a6f8f' },
  { id: 'creep', name: '兵', colour: '#3d85c6' }, { id: 'pc', name: '超能兵', colour: '#6a5aa5' }, { id: 'spawn', name: '孵化', colour: '#2e8b57' },
  { id: 'struct', name: '建筑', colour: '#a04848' }, { id: 'room', name: '房间', colour: '#7a6a2e' }, { id: 'pos', name: '位置与寻路', colour: '#8a5a2e' },
  { id: 'map', name: '地图', colour: '#556b8e' }, { id: 'market', name: '市场', colour: '#7a5a7a' }, { id: 'mem', name: '记忆', colour: '#5a7a7a' },
  { id: 'const', name: '常量', colour: '#666e78' }, { id: 'logic', name: '判断', colour: '#5b80a5' }, { id: 'loop', name: '循环', colour: '#5ba55b' },
  { id: 'math', name: '数字', colour: '#5b67a5' }, { id: 'text', name: '文字', colour: '#5ba58c' }, { id: 'list', name: '列表', colour: '#745ba5' },
  { id: 'data', name: '数据表', colour: '#6b7280' }, { id: 'var', name: '变量', colour: '#a55b80', custom: 'VARIABLE' }, { id: 'fn', name: '函数', colour: '#995ba5', custom: 'PROCEDURE' },
];
const COL = {}; CATS.forEach(c => COL[c.id] = c.colour);
const CAT = {}; CATS.forEach(c => CAT[c.id] = []);
const API = {};    // 官方 API 键 → 积木类型（覆盖率测试用）
const BLOCKS = {}; // 本文件定义的积木类型 → 分类
const cover = (type, keys) => { for (const k of keys || []) (API[k] = API[k] || []).push(type); };
const label = (cat, text) => CAT[cat].push({ kind: 'label', text });

// ---------- 预设输入（抽屉里积木自带的默认值） ----------
function PRE(p) {
  if (!p) return undefined; if (typeof p === 'object') return p;
  const [k, ...rest] = String(p).split(':'), a = rest.join(':');
  if (k === 'v') return { block: { type: 'variables_get', fields: { VAR: { name: a } } } };
  if (k === 'n') return { shadow: { type: 'math_number', fields: { NUM: +a } } };
  if (k === 's') return { shadow: { type: 'text', fields: { TEXT: a } } };
  if (k === 'b') return { block: { type: 'logic_boolean', fields: { BOOL: a === '0' ? 'FALSE' : 'TRUE' } } };
  if (k === 'k') { const [t, v] = a.split(':'); return { block: { type: 'w_k_' + t, fields: { K: v } } }; }
  if (k === 'p') { const [prop, of] = a.split(':'); return { block: { type: 'w_p_' + prop, inputs: { O: PRE(of.includes('.') ? 'p:' + of.split('.').join(':') : 'v:' + of) } } }; }
  if (k === 'blk') return { block: { type: a } };
  return undefined;
}
// 参数说明："预设"，前缀 ? 表示可不填（没接积木就不传）
const isOpt = a => typeof a === 'string' && a[0] === '?';
const preOf = a => isOpt(a) ? a.slice(1) : a;
function callArgs(b, args) {
  const L = args.map((a, i) => JS.valueToCode(b, 'A' + i, O));
  let n = L.length; while (n > 0 && !L[n - 1] && isOpt(args[n - 1])) n--;
  return L.slice(0, n).map(x => x || 'undefined').join(', ');
}
const OUT = { val: null, num: 'Number', bool: 'Boolean', arr: 'Array', str: 'String' };
// 通用积木构造：mode = act（动作：结果存进「上一个动作的结果」）/ stmt（语句）/ val num bool arr str（取值）
function mk(cat, type, text, ins, expr, keys, mode = 'val', extra = {}) {
  const json = { type, message0: text, args0: ins.map(([n]) => ({ type: 'input_value', name: n })), colour: COL[cat], tooltip: (keys || []).join(' / '), helpUrl: '', inputsInline: true };
  if (mode === 'act' || mode === 'stmt') Object.assign(json, { previousStatement: null, nextStatement: null }); else json.output = OUT[mode] === undefined ? null : OUT[mode];
  Blockly.defineBlocksWithJsonArray([json]);
  JS.forBlock[type] = mode === 'act' ? b => `${R} = ${expr(b)};\n` : mode === 'stmt' ? b => `${expr(b)};\n` : b => [expr(b), extra.order || OF];
  BLOCKS[type] = cat; cover(type, keys);
  if (extra.hide) return;
  const inputs = {}; for (const [n, p] of ins) { const v = PRE(preOf(p)); if (v) inputs[n] = v; }
  CAT[cat].push({ kind: 'block', type, ...(Object.keys(inputs).length ? { inputs } : {}) });
}
// 对象方法：%1 是对象，%2… 是参数
const M = (cat, type, text, recv, meth, args, keys, mode = 'val') =>
  mk(cat, type, text, [['O', recv], ...args.map((a, i) => ['A' + i, a])], b => `${rv(b)}?.${meth}(${callArgs(b, args)})`, keys, mode);
// 全局函数（Game.xxx(...) 等）
const G = (cat, type, text, fn, args, keys, mode = 'val') =>
  mk(cat, type, text, args.map((a, i) => ['A' + i, a]), b => `${fn}(${callArgs(b, args)})`, keys, mode);
// 全局属性
const GP = (cat, type, text, expr, keys) => mk(cat, type, text, [], () => expr, keys, 'val', { order: OM });
// 对象属性（所有带这个属性的官方对象共用一块，覆盖键 *.属性名）
const P = (cat, name, text, recv, extraKeys = []) => Blockly.Blocks['w_p_' + name] ? CAT[cat].push({ kind: 'block', type: 'w_p_' + name, inputs: { O: PRE(recv) } }) : mk(cat, 'w_p_' + name, `%1 的${text}`, [['O', recv]], b => `${rv(b)}?.${name}`, ['*.' + name, ...extraKeys], 'val', { order: OM });

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
// ======================= 游戏（Game） =======================
const C_ = 'v:兵', T_ = 'v:目标';
label('game', '全局对象');
GP('game', 'w_g_creeps', '我的所有兵（按名字）', 'Game.creeps', ['Game.creeps']);
GP('game', 'w_g_spawns', '我的所有基地（按名字）', 'Game.spawns', ['Game.spawns']);
GP('game', 'w_g_rooms', '能看到的所有房间（按名字）', 'Game.rooms', ['Game.rooms']);
GP('game', 'w_g_structures', '我的所有建筑（按编号）', 'Game.structures', ['Game.structures']);
GP('game', 'w_g_sites', '我的所有工地（按编号）', 'Game.constructionSites', ['Game.constructionSites']);
GP('game', 'w_g_flags', '我的所有旗帜（按名字）', 'Game.flags', ['Game.flags']);
GP('game', 'w_g_pcs', '我的所有超能兵（按名字）', 'Game.powerCreeps', ['Game.powerCreeps']);
mk('game', 'w_g_creep', '名字是 %1 的兵', [['A0', 's:']], b => `Game.creeps[${vc(b, 'A0', "''")}]`, ['Game.creeps'], 'val', { order: OM });
mk('game', 'w_g_spawn', '名字是 %1 的基地', [['A0', 's:']], b => `Game.spawns[${vc(b, 'A0', "''")}]`, ['Game.spawns'], 'val', { order: OM });
mk('game', 'w_g_room', '名字是 %1 的房间', [['A0', 's:']], b => `Game.rooms[${vc(b, 'A0', "''")}]`, ['Game.rooms'], 'val', { order: OM });
mk('game', 'w_g_flag', '名字是 %1 的旗帜', [['A0', 's:']], b => `Game.flags[${vc(b, 'A0', "''")}]`, ['Game.flags'], 'val', { order: OM });
G('game', 'w_g_byid', '编号是 %1 的对象', 'Game.getObjectById', ['s:'], ['Game.getObjectById']);
label('game', '游戏信息');
GP('game', 'w_g_time', '现在是第几回合', 'Game.time', ['Game.time']);
GP('game', 'w_g_shard', '当前分片信息', 'Game.shard', ['Game.shard']);
GP('game', 'w_g_shardname', '当前分片的名字', 'Game.shard.name', ['Game.shard.name']);
GP('game', 'w_g_shardtype', '当前分片的种类', 'Game.shard.type', ['Game.shard.type']);
GP('game', 'w_g_shardptr', '当前是测试服吗', 'Game.shard.ptr', ['Game.shard.ptr']);
GP('game', 'w_g_shardaccess', '能进入当前分片', 'Game.shard.access', ['Game.shard.access']);
GP('game', 'w_g_shardaccesstime', '当前分片进入权限到期时间', 'Game.shard.accessTime', ['Game.shard.accessTime']);
G('game', 'w_g_shardactivate', '用访问钥匙延长当前分片的进入权限', 'Game.shard.activateAccess', [], ['Game.shard.activateAccess'], 'act');
GP('game', 'w_g_gcl', '全局控制等级信息', 'Game.gcl', ['Game.gcl']);
GP('game', 'w_g_gcllv', '全局控制等级', 'Game.gcl.level', ['Game.gcl']);
GP('game', 'w_g_gclp', '全局控制等级进度', 'Game.gcl.progress', ['Game.gcl']);
GP('game', 'w_g_gclt', '全局控制等级升级所需', 'Game.gcl.progressTotal', ['Game.gcl']);
GP('game', 'w_g_gpl', '全局超能等级信息', 'Game.gpl', ['Game.gpl']);
GP('game', 'w_g_gpllv', '全局超能等级', 'Game.gpl.level', ['Game.gpl']);
GP('game', 'w_g_gplp', '全局超能等级进度', 'Game.gpl.progress', ['Game.gpl']);
GP('game', 'w_g_gplt', '全局超能等级升级所需', 'Game.gpl.progressTotal', ['Game.gpl']);
GP('game', 'w_g_res', '账户里的资源', 'Game.resources', ['Game.resources']);
GP('game', 'w_g_map', '世界地图', 'Game.map', ['Game.map']);
GP('game', 'w_g_market', '市场', 'Game.market', ['Game.market']);
G('game', 'w_g_notify', '发通知 %1 间隔分钟（可不填）%2', 'Game.notify', ['s:', '?n:0'], ['Game.notify'], 'act');
label('game', '计算资源');
GP('game', 'w_g_cpu', '计算资源信息', 'Game.cpu', ['Game.cpu']);
GP('game', 'w_cpu_limit', '计算资源每回合上限', 'Game.cpu.limit', ['Game.cpu.limit']);
GP('game', 'w_cpu_ticklimit', '本回合最多可用计算时间', 'Game.cpu.tickLimit', ['Game.cpu.tickLimit']);
GP('game', 'w_cpu_bucket', '计算资源储备', 'Game.cpu.bucket', ['Game.cpu.bucket']);
GP('game', 'w_cpu_shardlimits', '各分片的计算资源分配', 'Game.cpu.shardLimits', ['Game.cpu.shardLimits']);
GP('game', 'w_cpu_unlocked', '已解锁全部计算资源', 'Game.cpu.unlocked', ['Game.cpu.unlocked']);
GP('game', 'w_cpu_unlockedtime', '全部计算资源解锁到期时间', 'Game.cpu.unlockedTime', ['Game.cpu.unlockedTime']);
G('game', 'w_cpu_used', '本回合已用的计算时间', 'Game.cpu.getUsed', [], ['Game.cpu.getUsed'], 'num');
G('game', 'w_cpu_heap', '内存堆统计', 'Game.cpu.getHeapStatistics', [], ['Game.cpu.getHeapStatistics']);
G('game', 'w_cpu_halt', '立刻重启程序', 'Game.cpu.halt', [], ['Game.cpu.halt'], 'act');
G('game', 'w_cpu_setlimits', '设置各分片计算资源分配 %1', 'Game.cpu.setShardLimits', ['blk:w_obj_new'], ['Game.cpu.setShardLimits'], 'act');
G('game', 'w_cpu_unlock', '用解锁道具解锁全部计算资源', 'Game.cpu.unlock', [], ['Game.cpu.unlock'], 'act');
G('game', 'w_cpu_pixel', '用储备生成一个像素', 'Game.cpu.generatePixel', [], ['Game.cpu.generatePixel'], 'act');
label('game', '上一个动作');
mk('game', 'w_result', '上一个动作的结果', [], () => R, ['result'], 'val', { order: OA });
mk('game', 'w_log', '在控制台显示 %1', [['A0', 's:你好']], b => `console.log(${vc(b, 'A0', "''")})`, ['console.log'], 'stmt');

// ======================= 查找 =======================
label('find', '在房间里找');
M('find', 'w_room_find', '在 %1 里找 %2 筛选（可不填）%3', 'v:房间', 'find', ['k:find:FIND_SOURCES', '?'], ['Room.find'], 'arr');
M('find', 'w_pos_closestpath', '离 %1 走路最近的 %2 筛选（可不填）%3', 'p:pos:兵', 'findClosestByPath', ['k:find:FIND_SOURCES_ACTIVE', '?'], ['RoomPosition.findClosestByPath']);
M('find', 'w_pos_closestrange', '离 %1 直线最近的 %2 筛选（可不填）%3', 'p:pos:兵', 'findClosestByRange', ['k:find:FIND_HOSTILE_CREEPS', '?'], ['RoomPosition.findClosestByRange']);
M('find', 'w_pos_inrange', '%1 周围 %3 格内的 %2 筛选（可不填）%4', 'p:pos:兵', 'findInRange', ['k:find:FIND_MY_CREEPS', 'n:3', '?'], ['RoomPosition.findInRange'], 'arr');
mk('find', 'w_opt_filter', '筛选：%1 是 %2 的', [['A0', 'k:fkey:structureType'], ['A1', 'k:struct:STRUCTURE_EXTENSION']], b => `{ filter: { [${vc(b, 'A0', "'structureType'")}]: ${vc(b, 'A1')} } }`, ['Room.find'], 'val', { order: OA });
label('find', '看格子上的东西');
M('find', 'w_room_lookat', '%1 里横 %2 纵 %3 格上的所有东西', 'v:房间', 'lookAt', ['n:25', 'n:25'], ['Room.lookAt'], 'arr');
M('find', 'w_room_lookatobj', '%1 里 %2 所在格上的所有东西', 'v:房间', 'lookAt', [T_], ['Room.lookAt'], 'arr');
M('find', 'w_room_lookforat', '%1 里横 %3 纵 %4 格上的 %2', 'v:房间', 'lookForAt', ['k:look:LOOK_STRUCTURES', 'n:25', 'n:25'], ['Room.lookForAt'], 'arr');
M('find', 'w_room_lookforatobj', '%1 里 %3 所在格上的 %2', 'v:房间', 'lookForAt', ['k:look:LOOK_STRUCTURES', T_], ['Room.lookForAt'], 'arr');
M('find', 'w_room_lookarea', '%1 里 上 %2 左 %3 下 %4 右 %5 范围内的所有东西 排成列表（可不填）%6', 'v:房间', 'lookAtArea', ['n:20', 'n:20', 'n:30', 'n:30', '?b:1'], ['Room.lookAtArea']);
M('find', 'w_room_lookforarea', '%1 里 上 %3 左 %4 下 %5 右 %6 范围内的 %2 排成列表（可不填）%7', 'v:房间', 'lookForAtArea', ['k:look:LOOK_CREEPS', 'n:20', 'n:20', 'n:30', 'n:30', '?b:1'], ['Room.lookForAtArea']);
M('find', 'w_pos_look', '%1 格上的所有东西', 'p:pos:兵', 'look', [], ['RoomPosition.look'], 'arr');
M('find', 'w_pos_lookfor', '%1 格上的 %2', 'p:pos:兵', 'lookFor', ['k:look:LOOK_STRUCTURES'], ['RoomPosition.lookFor'], 'arr');
label('find', '距离与方向');
M('find', 'w_pos_range', '%1 到 %2 的距离', 'p:pos:兵', 'getRangeTo', [T_], ['RoomPosition.getRangeTo'], 'num');
M('find', 'w_pos_inrangeto', '%1 离 %2 不超过 %3 格', 'p:pos:兵', 'inRangeTo', [T_, 'n:3'], ['RoomPosition.inRangeTo'], 'bool');
M('find', 'w_pos_near', '%1 紧挨着 %2', 'p:pos:兵', 'isNearTo', [T_], ['RoomPosition.isNearTo'], 'bool');
M('find', 'w_pos_equal', '%1 和 %2 是同一格', 'p:pos:兵', 'isEqualTo', [T_], ['RoomPosition.isEqualTo'], 'bool');
M('find', 'w_pos_dir', '从 %1 看 %2 在哪个方向', 'p:pos:兵', 'getDirectionTo', [T_], ['RoomPosition.getDirectionTo']);

// ======================= 属性（所有对象共用） =======================
label('prop', '通用');
P('prop', 'id', '编号', T_); P('prop', 'pos', '位置', T_); P('prop', 'room', '所在房间', T_); P('prop', 'name', '名字', T_);
P('prop', 'hits', '生命', T_); P('prop', 'hitsMax', '最大生命', T_); P('prop', 'my', '是我的', T_); P('prop', 'owner', '主人', T_);
mk('prop', 'w_p_username', '%1 的玩家名', [['O', 'p:owner:目标']], b => `${rv(b)}?.username`, ['*.owner'], 'val', { order: OM });
P('prop', 'effects', '身上的效果', T_); P('prop', 'structureType', '建筑种类', T_); P('prop', 'store', '存储', T_);
P('prop', 'memory', '记忆', T_); P('prop', 'level', '等级', T_); P('prop', 'cooldown', '冷却回合', T_); P('prop', 'ticksToDecay', '消失倒计时', T_);
P('prop', 'progress', '进度', T_); P('prop', 'progressTotal', '总进度', T_);
label('prop', '存储');
mk('prop', 'w_store_get', '%1 里 %2 的数量', [['O', 'p:store:兵'], ['A0', 'k:res:RESOURCE_ENERGY']], b => `(${rv(b)}?.[${vc(b, 'A0')}] ?? 0)`, ['Store'], 'num', { order: OA });
M('prop', 'w_store_cap', '%1 能装 %2（可不填）多少', 'p:store:兵', 'getCapacity', ['?'], ['Store.getCapacity'], 'num');
M('prop', 'w_store_free', '%1 还能装 %2（可不填）多少', 'p:store:兵', 'getFreeCapacity', ['?'], ['Store.getFreeCapacity'], 'num');
M('prop', 'w_store_used', '%1 已经装了 %2（可不填）多少', 'p:store:兵', 'getUsedCapacity', ['?'], ['Store.getUsedCapacity'], 'num');
P('prop', 'storeCapacity', '存储容量（旧写法）', 'v:建筑');
label('prop', '能量与资源');
P('prop', 'energy', '能量', 'v:能量源'); P('prop', 'energyCapacity', '能量容量', 'v:能量源'); P('prop', 'ticksToRegeneration', '再生倒计时', 'v:能量源');
P('prop', 'mineralType', '矿物种类', 'v:矿物'); P('prop', 'mineralAmount', '矿物数量', 'v:矿物'); P('prop', 'density', '密度', 'v:矿物');
P('prop', 'depositType', '沉积物种类', 'v:沉积物'); P('prop', 'lastCooldown', '上次冷却回合', 'v:沉积物');
P('prop', 'amount', '数量', 'v:掉落的资源'); P('prop', 'resourceType', '资源种类', 'v:掉落的资源');
P('prop', 'mineralCapacity', '矿物容量（旧写法）', 'v:实验室');
P('prop', 'power', '超能数量', 'v:建筑'); P('prop', 'powerCapacity', '超能容量（旧写法）', 'v:建筑');
P('prop', 'ghodium', '萃取物数量（旧写法）', 'v:建筑'); P('prop', 'ghodiumCapacity', '萃取物容量（旧写法）', 'v:建筑');
label('prop', '墓碑、废墟、核弹、旗帜');
P('prop', 'creep', '死去的兵', 'v:墓碑'); P('prop', 'deathTime', '死亡回合', 'v:墓碑');
P('prop', 'structure', '原来的建筑', 'v:废墟'); P('prop', 'destroyTime', '被摧毁的回合', 'v:废墟');
P('prop', 'launchRoomName', '发射房间名', 'v:核弹'); P('prop', 'timeToLand', '落地倒计时', 'v:核弹');
P('prop', 'color', '主颜色', 'v:旗帜'); P('prop', 'secondaryColor', '副颜色', 'v:旗帜');
label('prop', '效果');
mk('prop', 'w_p_efftype', '效果 %1 的种类', [['O', T_]], b => `${rv(b)}?.effect`, ['*.effects'], 'val', { order: OM });
mk('prop', 'w_p_efflevel', '效果 %1 的等级', [['O', T_]], b => `${rv(b)}?.level`, ['*.effects'], 'val', { order: OM });
mk('prop', 'w_p_effleft', '效果 %1 的剩余回合', [['O', T_]], b => `${rv(b)}?.ticksRemaining`, ['*.effects'], 'val', { order: OM });
label('prop', '种类判断');
const PROTOS = [['兵', 'Creep'], ['超能兵', 'PowerCreep'], ['建筑', 'Structure'], ['有主人的建筑', 'OwnedStructure'], ['基地', 'StructureSpawn'], ['扩展', 'StructureExtension'], ['塔', 'StructureTower'], ['控制器', 'StructureController'],
  ['链路', 'StructureLink'], ['仓库', 'StructureStorage'], ['终端', 'StructureTerminal'], ['容器', 'StructureContainer'], ['实验室', 'StructureLab'], ['工厂', 'StructureFactory'], ['观察者', 'StructureObserver'],
  ['超能基地', 'StructurePowerSpawn'], ['核弹发射井', 'StructureNuker'], ['采矿机', 'StructureExtractor'], ['城墙', 'StructureRampart'], ['墙', 'StructureWall'], ['道路', 'StructureRoad'],
  ['守卫巢穴', 'StructureKeeperLair'], ['传送门', 'StructurePortal'], ['超能银行', 'StructurePowerBank'], ['入侵者核心', 'StructureInvaderCore'], ['能量源', 'Source'], ['矿物', 'Mineral'],
  ['沉积物', 'Deposit'], ['工地', 'ConstructionSite'], ['掉落的资源', 'Resource'], ['墓碑', 'Tombstone'], ['废墟', 'Ruin'], ['旗帜', 'Flag'], ['核弹', 'Nuke'], ['房间里的对象', 'RoomObject'], ['房间', 'Room'], ['位置', 'RoomPosition']];
Blockly.defineBlocksWithJsonArray([{ type: 'w_is', message0: '%1 是 %2 吗', args0: [{ type: 'input_value', name: 'O' }, { type: 'field_dropdown', name: 'T', options: PROTOS }], output: 'Boolean', inputsInline: true, colour: COL.prop, tooltip: PROTOS.map(p => p[1]).join(' '), helpUrl: '' }]);
JS.forBlock.w_is = b => [`(${JS.valueToCode(b, 'O', OR) || 'undefined'} instanceof ${b.getFieldValue('T')})`, OR]; BLOCKS.w_is = 'prop';
cover('w_is', PROTOS.map(p => p[1])); CAT.prop.push({ kind: 'block', type: 'w_is', inputs: { O: PRE(T_) } });
mk('prop', 'w_exists', '%1 存在（不是空的）', [['O', T_]], b => `(${JS.valueToCode(b, 'O', OEQ) || 'undefined'} != null)`, [], 'bool', { order: OEQ });

// ======================= 兵（Creep，超能兵共用的动作也在这里） =======================
const CP = (m) => ['Creep.' + m, 'PowerCreep.' + m];
label('creep', '移动');
M('creep', 'w_c_moveto', '让 %1 走向 %2 走路选项（可不填）%3', C_, 'moveTo', [T_, '?'], CP('moveTo'), 'act');
M('creep', 'w_c_movetoxy', '让 %1 走到横 %2 纵 %3 走路选项（可不填）%4', C_, 'moveTo', ['n:25', 'n:25', '?'], CP('moveTo'), 'act');
M('creep', 'w_c_move', '让 %1 朝 %2 走一格', C_, 'move', ['k:dir:TOP'], CP('move'), 'act');
M('creep', 'w_c_movebypath', '让 %1 沿着路线 %2 走', C_, 'moveByPath', ['v:路线'], CP('moveByPath'), 'act');
M('creep', 'w_c_pull', '让 %1 拉着 %2', C_, 'pull', [T_], ['Creep.pull'], 'act');
mk('creep', 'w_opt_move', '走路选项 路线保留回合 %1 不管其他兵 %2 停在离目标几格（可不填）%3 画出路线 %4', [['A0', 'n:5'], ['A1', 'b:0'], ['A2', ''], ['A3', 'b:0']],
  b => { const o = [`reusePath: ${vc(b, 'A0', '5')}`, `ignoreCreeps: ${vc(b, 'A1', 'false')}`]; const r = JS.valueToCode(b, 'A2', O); if (r) o.push(`range: ${r}`);
    const v = JS.valueToCode(b, 'A3', O); if (v && v !== 'false') o.push(`visualizePathStyle: (${v}) ? { stroke: '#ffffff' } : undefined`); return `{ ${o.join(', ')} }`; }, ['Creep.moveTo'], 'val', { order: OA });
label('creep', '采集与搬运');
M('creep', 'w_c_harvest', '让 %1 采集 %2', C_, 'harvest', [T_], ['Creep.harvest'], 'act');
M('creep', 'w_c_transfer', '让 %1 把 %3 交给 %2 数量（可不填）%4', C_, 'transfer', [T_, 'k:res:RESOURCE_ENERGY', '?'], CP('transfer'), 'act');
M('creep', 'w_c_withdraw', '让 %1 从 %2 取出 %3 数量（可不填）%4', C_, 'withdraw', [T_, 'k:res:RESOURCE_ENERGY', '?'], CP('withdraw'), 'act');
M('creep', 'w_c_pickup', '让 %1 捡起 %2', C_, 'pickup', [T_], CP('pickup'), 'act');
M('creep', 'w_c_drop', '让 %1 扔下 %2 数量（可不填）%3', C_, 'drop', ['k:res:RESOURCE_ENERGY', '?'], CP('drop'), 'act');
label('creep', '建造与控制器');
M('creep', 'w_c_build', '让 %1 建造 %2', C_, 'build', [T_], ['Creep.build'], 'act');
M('creep', 'w_c_repair', '让 %1 修理 %2', C_, 'repair', [T_], ['Creep.repair'], 'act');
M('creep', 'w_c_dismantle', '让 %1 拆除 %2', C_, 'dismantle', [T_], ['Creep.dismantle'], 'act');
M('creep', 'w_c_upgrade', '让 %1 升级控制器 %2', C_, 'upgradeController', ['p:controller:房间'], ['Creep.upgradeController'], 'act');
M('creep', 'w_c_claim', '让 %1 占领控制器 %2', C_, 'claimController', ['p:controller:房间'], ['Creep.claimController'], 'act');
M('creep', 'w_c_reserve', '让 %1 预定控制器 %2', C_, 'reserveController', ['p:controller:房间'], ['Creep.reserveController'], 'act');
M('creep', 'w_c_attackctrl', '让 %1 攻击控制器 %2', C_, 'attackController', ['p:controller:房间'], ['Creep.attackController'], 'act');
M('creep', 'w_c_sign', '让 %1 在控制器 %2 上签名 %3', C_, 'signController', ['p:controller:房间', 's:'], ['Creep.signController'], 'act');
M('creep', 'w_c_gensafe', '让 %1 给控制器 %2 生成安全模式', C_, 'generateSafeMode', ['p:controller:房间'], ['Creep.generateSafeMode'], 'act');
label('creep', '战斗与治疗');
M('creep', 'w_c_attack', '让 %1 近战攻击 %2', C_, 'attack', [T_], ['Creep.attack'], 'act');
M('creep', 'w_c_ranged', '让 %1 远程攻击 %2', C_, 'rangedAttack', [T_], ['Creep.rangedAttack'], 'act');
M('creep', 'w_c_mass', '让 %1 攻击周围三格内所有敌人', C_, 'rangedMassAttack', [], ['Creep.rangedMassAttack'], 'act');
M('creep', 'w_c_heal', '让 %1 治疗 %2', C_, 'heal', [T_], ['Creep.heal'], 'act');
M('creep', 'w_c_rheal', '让 %1 远程治疗 %2', C_, 'rangedHeal', [T_], ['Creep.rangedHeal'], 'act');
label('creep', '其他');
M('creep', 'w_c_say', '让 %1 说 %2 所有人可见（可不填）%3', C_, 'say', ['s:你好', '?b:0'], CP('say'), 'act');
M('creep', 'w_c_suicide', '让 %1 自杀', C_, 'suicide', [], CP('suicide'), 'act');
M('creep', 'w_c_cancel', '让 %1 取消这回合的 %2 指令', C_, 'cancelOrder', ['k:meth:move'], CP('cancelOrder'), 'act');
M('creep', 'w_c_notify', '%1 被攻击时通知我 %2', C_, 'notifyWhenAttacked', ['b:1'], CP('notifyWhenAttacked'), 'act');
M('creep', 'w_c_parts', '%1 还能用的 %2 部件数', C_, 'getActiveBodyparts', ['k:part:WORK'], ['Creep.getActiveBodyparts'], 'num');
label('creep', '兵的属性');
P('creep', 'body', '身体部件列表', C_); P('creep', 'fatigue', '疲劳', C_); P('creep', 'ticksToLive', '剩余寿命', C_); P('creep', 'saying', '这回合说的话', C_);
P('creep', 'spawning', '正在孵化', C_);
mk('creep', 'w_p_parttype', '身体部件 %1 的种类', [['O', 'v:部件']], b => `${rv(b)}?.type`, ['Creep.body'], 'val', { order: OM });
mk('creep', 'w_p_partboost', '身体部件 %1 的强化', [['O', 'v:部件']], b => `${rv(b)}?.boost`, ['Creep.body'], 'val', { order: OM });
P('creep', 'carry', '携带的资源（旧写法）', C_); P('creep', 'carryCapacity', '携带容量（旧写法）', C_);

// ======================= 超能兵（PowerCreep） =======================
const PCV = 'v:超能兵';
G('pc', 'w_pc_create', '新建超能兵 名字 %1 职业 %2', 'PowerCreep.create', ['s:超能兵1', 'k:pclass:OPERATOR'], ['PowerCreep.create'], 'act');
M('pc', 'w_pc_spawn', '让 %1 在超能基地 %2 出现', PCV, 'spawn', ['v:超能基地'], ['PowerCreep.spawn'], 'act');
M('pc', 'w_pc_renew', '让 %1 在 %2 续命', PCV, 'renew', ['v:超能基地'], ['PowerCreep.renew'], 'act');
M('pc', 'w_pc_use', '让 %1 使用能力 %2 目标（可不填）%3', PCV, 'usePower', ['k:pwr:PWR_GENERATE_OPS', '?'], ['PowerCreep.usePower'], 'act');
M('pc', 'w_pc_enable', '让 %1 给控制器 %2 开启超能', PCV, 'enableRoom', ['p:controller:房间'], ['PowerCreep.enableRoom'], 'act');
M('pc', 'w_pc_upgrade', '给 %1 升级能力 %2', PCV, 'upgrade', ['k:pwr:PWR_GENERATE_OPS'], ['PowerCreep.upgrade'], 'act');
M('pc', 'w_pc_rename', '把 %1 改名为 %2', PCV, 'rename', ['s:'], ['PowerCreep.rename'], 'act');
M('pc', 'w_pc_delete', '删除 %1 取消删除（可不填）%2', PCV, 'delete', ['?b:0'], ['PowerCreep.delete'], 'act');
P('pc', 'className', '职业', PCV); P('pc', 'powers', '能力表', PCV); P('pc', 'shard', '所在分片', PCV); P('pc', 'spawnCooldownTime', '可以再出现的时间', PCV); P('pc', 'deleteTime', '将被删除的时间', PCV);
mk('pc', 'w_pc_powerlv', '%1 的能力 %2 的等级', [['O', PCV], ['A0', 'k:pwr:PWR_GENERATE_OPS']], b => `${rv(b)}?.powers?.[${vc(b, 'A0')}]?.level`, ['PowerCreep.powers'], 'val', { order: OM });
mk('pc', 'w_pc_powercd', '%1 的能力 %2 的冷却', [['O', PCV], ['A0', 'k:pwr:PWR_GENERATE_OPS']], b => `${rv(b)}?.powers?.[${vc(b, 'A0')}]?.cooldown`, ['PowerCreep.powers'], 'val', { order: OM });
// ======================= 孵化（基地 StructureSpawn） =======================
const SPV = 'v:基地';
label('spawn', '身份');
CAT.spawn.push({ kind: 'button', text: '＋ 新建身份', callbackKey: 'sbmNewRole' }, { kind: 'button', text: '管理身份', callbackKey: 'sbmRoles' });
label('spawn', '孵化');
M('spawn', 'w_s_spawn', '让 %1 孵化 身体 %2 名字 %3 孵化选项（可不填）%4', SPV, 'spawnCreep', ['blk:w_body', 's:兵', '?'], ['StructureSpawn.spawnCreep'], 'act');
mk('spawn', 'w_opt_spawn', '孵化选项 记忆（可不填）%1 只检查能不能孵化 %2 出生方向（可不填）%3 用这些建筑的能量（可不填）%4', [['A0', ''], ['A1', 'b:0'], ['A2', ''], ['A3', '']],
  b => { const o = [], m = JS.valueToCode(b, 'A0', O), d = JS.valueToCode(b, 'A1', O), r = JS.valueToCode(b, 'A2', O), e = JS.valueToCode(b, 'A3', O);
    if (m) o.push(`memory: ${m}`); if (d && d !== 'false') o.push(`dryRun: ${d}`); if (r) o.push(`directions: ${r}`); if (e) o.push(`energyStructures: ${e}`); return `{ ${o.join(', ')} }`; }, ['StructureSpawn.spawnCreep'], 'val', { order: OA });
M('spawn', 'w_s_recycle', '让 %1 回收 %2', SPV, 'recycleCreep', [C_], ['StructureSpawn.recycleCreep'], 'act');
M('spawn', 'w_s_renew', '让 %1 给 %2 续命', SPV, 'renewCreep', [C_], ['StructureSpawn.renewCreep'], 'act');
M('spawn', 'w_s_cancreate', '%1 能不能孵化 身体 %2 名字（可不填）%3（旧写法）', SPV, 'canCreateCreep', ['blk:w_body', '?'], ['StructureSpawn.canCreateCreep']);
M('spawn', 'w_s_create', '让 %1 孵化 身体 %2 名字（可不填）%3 记忆（可不填）%4（旧写法）', SPV, 'createCreep', ['blk:w_body', '?', '?'], ['StructureSpawn.createCreep'], 'act');
label('spawn', '正在孵化');
P('spawn', 'spawning', '正在孵化', SPV);
P('spawn', 'needTime', '总共需要回合', 'p:spawning:基地'); P('spawn', 'remainingTime', '还需回合', 'p:spawning:基地'); P('spawn', 'directions', '出生方向', 'p:spawning:基地');
P('spawn', 'spawn', '所属基地', 'p:spawning:基地');
M('spawn', 'w_sp_cancel', '取消孵化 %1', 'p:spawning:基地', 'cancel', [], ['StructureSpawn.Spawning.cancel'], 'act');
M('spawn', 'w_sp_dirs', '把 %1 的出生方向设为 %2', 'p:spawning:基地', 'setDirections', ['blk:lists_create_with'], ['StructureSpawn.Spawning.setDirections'], 'act');

// ======================= 建筑 =======================
const SV = 'v:建筑';
label('struct', '所有建筑');
M('struct', 'w_st_destroy', '摧毁 %1', SV, 'destroy', [], ['Structure.destroy'], 'act');
M('struct', 'w_st_active', '%1 能用吗', SV, 'isActive', [], ['Structure.isActive'], 'bool');
M('struct', 'w_st_notify', '%1 被攻击时通知我 %2', SV, 'notifyWhenAttacked', ['b:1'], ['Structure.notifyWhenAttacked'], 'act');
label('struct', '塔');
M('struct', 'w_tw_attack', '让塔 %1 攻击 %2', 'v:塔', 'attack', [T_], ['StructureTower.attack'], 'act');
M('struct', 'w_tw_heal', '让塔 %1 治疗 %2', 'v:塔', 'heal', [T_], ['StructureTower.heal'], 'act');
M('struct', 'w_tw_repair', '让塔 %1 修理 %2', 'v:塔', 'repair', [T_], ['StructureTower.repair'], 'act');
label('struct', '控制器');
M('struct', 'w_ct_safe', '让控制器 %1 开启安全模式', 'p:controller:房间', 'activateSafeMode', [], ['StructureController.activateSafeMode'], 'act');
M('struct', 'w_ct_unclaim', '放弃控制器 %1', 'p:controller:房间', 'unclaim', [], ['StructureController.unclaim'], 'act');
const CTR = 'p:controller:房间';
P('struct', 'ticksToDowngrade', '降级倒计时', CTR); P('struct', 'safeMode', '安全模式剩余回合', CTR); P('struct', 'safeModeAvailable', '可用安全模式次数', CTR);
P('struct', 'safeModeCooldown', '安全模式冷却', CTR); P('struct', 'upgradeBlocked', '禁止升级剩余回合', CTR); P('struct', 'isPowerEnabled', '已开启超能', CTR);
P('struct', 'reservation', '预定信息', CTR); P('struct', 'sign', '签名信息', CTR);
mk('struct', 'w_p_ticksToEnd', '%1 的剩余回合', [['O', 'p:reservation:controller.房间']], b => `${rv(b)}?.ticksToEnd`, ['StructureController.reservation'], 'val', { order: OM });
mk('struct', 'w_p_signtext', '%1 的文字', [['O', 'p:sign:controller.房间']], b => `${rv(b)}?.text`, ['StructureController.sign'], 'val', { order: OM });
label('struct', '链路、终端、实验室、工厂');
M('struct', 'w_lk_send', '让链路 %1 把能量传给 %2 数量（可不填）%3', 'v:链路', 'transferEnergy', [T_, '?'], ['StructureLink.transferEnergy'], 'act');
M('struct', 'w_tm_send', '让终端 %1 发送 %2 数量 %3 到房间 %4 说明（可不填）%5', 'p:terminal:房间', 'send', ['k:res:RESOURCE_ENERGY', 'n:1000', 's:', '?'], ['StructureTerminal.send'], 'act');
M('struct', 'w_lb_run', '让实验室 %1 用 %2 和 %3 反应', 'v:实验室', 'runReaction', ['v:实验室1', 'v:实验室2'], ['StructureLab.runReaction'], 'act');
M('struct', 'w_lb_rev', '让实验室 %1 分解到 %2 和 %3', 'v:实验室', 'reverseReaction', ['v:实验室1', 'v:实验室2'], ['StructureLab.reverseReaction'], 'act');
M('struct', 'w_lb_boost', '让实验室 %1 强化 %2 部件数（可不填）%3', 'v:实验室', 'boostCreep', [C_, '?'], ['StructureLab.boostCreep'], 'act');
M('struct', 'w_lb_unboost', '让实验室 %1 取消 %2 的强化', 'v:实验室', 'unboostCreep', [C_], ['StructureLab.unboostCreep'], 'act');
M('struct', 'w_fc_produce', '让工厂 %1 生产 %2', 'v:工厂', 'produce', ['k:res:RESOURCE_BATTERY'], ['StructureFactory.produce'], 'act');
label('struct', '其他建筑');
M('struct', 'w_ob_observe', '让观察者 %1 观察房间 %2', 'v:观察者', 'observeRoom', ['s:'], ['StructureObserver.observeRoom'], 'act');
M('struct', 'w_ps_process', '让超能基地 %1 处理超能', 'v:超能基地', 'processPower', [], ['StructurePowerSpawn.processPower'], 'act');
M('struct', 'w_nk_launch', '让核弹发射井 %1 打向 %2', 'v:核弹发射井', 'launchNuke', ['v:位置'], ['StructureNuker.launchNuke'], 'act');
M('struct', 'w_rp_public', '把城墙 %1 设为所有人可通过 %2', 'v:城墙', 'setPublic', ['b:1'], ['StructureRampart.setPublic'], 'act');
P('struct', 'isPublic', '所有人可通过', 'v:城墙'); P('struct', 'destination', '传送目的地', 'v:传送门');
P('struct', 'ticksToDeploy', '部署倒计时', 'v:入侵者核心'); P('struct', 'ticksToSpawn', '刷新倒计时', 'v:守卫巢穴'); P('struct', 'ticksToLive', '剩余寿命', SV);

// ======================= 工地、旗帜 =======================
label('room', '工地');
M('room', 'w_room_site', '在 %1 横 %2 纵 %3 放 %4 工地 名字（可不填）%5', 'v:房间', 'createConstructionSite', ['n:25', 'n:25', 'k:struct:STRUCTURE_EXTENSION', '?'], ['Room.createConstructionSite'], 'act');
M('room', 'w_room_sitepos', '在 %1 的 %2 放 %3 工地 名字（可不填）%4', 'v:房间', 'createConstructionSite', ['v:位置', 'k:struct:STRUCTURE_EXTENSION', '?'], ['Room.createConstructionSite'], 'act');
M('room', 'w_pos_site', '在 %1 放 %2 工地 名字（可不填）%3', 'v:位置', 'createConstructionSite', ['k:struct:STRUCTURE_ROAD', '?'], ['RoomPosition.createConstructionSite'], 'act');
M('room', 'w_site_remove', '取消工地 %1', 'v:工地', 'remove', [], ['ConstructionSite.remove'], 'act');
label('room', '旗帜');
M('room', 'w_room_flag', '在 %1 横 %2 纵 %3 插旗帜 名字（可不填）%4 主颜色（可不填）%5 副颜色（可不填）%6', 'v:房间', 'createFlag', ['n:25', 'n:25', '?', '?', '?'], ['Room.createFlag'], 'act');
M('room', 'w_room_flagpos', '在 %1 的 %2 插旗帜 名字（可不填）%3 主颜色（可不填）%4 副颜色（可不填）%5', 'v:房间', 'createFlag', ['v:位置', '?', '?', '?'], ['Room.createFlag'], 'act');
M('room', 'w_pos_flag', '在 %1 插旗帜 名字（可不填）%2 主颜色（可不填）%3 副颜色（可不填）%4', 'v:位置', 'createFlag', ['?', '?', '?'], ['RoomPosition.createFlag'], 'act');
M('room', 'w_flag_remove', '拔掉旗帜 %1', 'v:旗帜', 'remove', [], ['Flag.remove'], 'act');
M('room', 'w_flag_color', '把旗帜 %1 的颜色改成 %2 副颜色（可不填）%3', 'v:旗帜', 'setColor', ['k:color:COLOR_RED', '?'], ['Flag.setColor'], 'act');
M('room', 'w_flag_move', '把旗帜 %1 移到 %2', 'v:旗帜', 'setPosition', ['v:位置'], ['Flag.setPosition'], 'act');
M('room', 'w_flag_movexy', '把旗帜 %1 移到横 %2 纵 %3', 'v:旗帜', 'setPosition', ['n:25', 'n:25'], ['Flag.setPosition'], 'act');
// ======================= 房间（Room） =======================
label('room', '房间信息');
P('room', 'controller', '控制器', 'v:房间'); P('room', 'storage', '仓库', 'v:房间'); P('room', 'terminal', '终端', 'v:房间');
P('room', 'energyAvailable', '可用能量', 'v:房间'); P('room', 'energyCapacityAvailable', '能量上限', 'v:房间'); P('room', 'visual', '绘图', 'v:房间');
M('room', 'w_room_getpos', '%1 里横 %2 纵 %3 的位置', 'v:房间', 'getPositionAt', ['n:25', 'n:25'], ['Room.getPositionAt']);
M('room', 'w_room_exit', '%1 去房间 %2 走哪个出口', 'v:房间', 'findExitTo', ['s:'], ['Room.findExitTo']);
M('room', 'w_room_events', '%1 上回合的事件记录 原始文字（可不填）%2', 'v:房间', 'getEventLog', ['?b:0'], ['Room.getEventLog'], 'arr');
mk('room', 'w_ev_event', '事件 %1 的种类', [['O', 'v:事件']], b => `${rv(b)}?.event`, ['Room.getEventLog'], 'val', { order: OM });
mk('room', 'w_ev_obj', '事件 %1 的发起对象编号', [['O', 'v:事件']], b => `${rv(b)}?.objectId`, ['Room.getEventLog'], 'val', { order: OM });
mk('room', 'w_ev_data', '事件 %1 的详情', [['O', 'v:事件']], b => `${rv(b)}?.data`, ['Room.getEventLog'], 'val', { order: OM });
label('room', '地形');
M('room', 'w_room_terrain', '%1 的地形', 'v:房间', 'getTerrain', [], ['Room.getTerrain']);
mk('room', 'w_terrain_new', '房间 %1 的地形', [['A0', 's:']], b => `new Room.Terrain(${vc(b, 'A0', "''")})`, ['Room.Terrain'], 'val', { order: ON });
M('room', 'w_terrain_get', '地形 %1 横 %2 纵 %3 是什么', 'blk:w_room_terrain', 'get', ['n:25', 'n:25'], ['Room.Terrain.get'], 'num');
M('room', 'w_terrain_raw', '地形 %1 的全部格子数据 存到（可不填）%2', 'blk:w_room_terrain', 'getRawBuffer', ['?'], ['Room.Terrain.getRawBuffer']);
label('room', '绘图');
mk('room', 'w_vis_new', '房间 %1（可不填）的绘图', [['A0', '']], b => `new RoomVisual(${JS.valueToCode(b, 'A0', O)})`, ['RoomVisual'], 'val', { order: ON });
const VIS = 'p:visual:房间';
M('room', 'w_vis_line', '在 %1 上从 %2 到 %3 画线 样式（可不填）%4', VIS, 'line', ['v:位置1', 'v:位置2', '?blk:w_style'], ['RoomVisual.line'], 'act');
M('room', 'w_vis_circle', '在 %1 上 %2 画圆 样式（可不填）%3', VIS, 'circle', ['v:位置', '?blk:w_style'], ['RoomVisual.circle'], 'act');
M('room', 'w_vis_rect', '在 %1 上从 %2 画宽 %3 高 %4 的方框 样式（可不填）%5', VIS, 'rect', ['v:位置', 'n:3', 'n:3', '?blk:w_style'], ['RoomVisual.rect'], 'act');
M('room', 'w_vis_poly', '在 %1 上沿着 %2 画折线 样式（可不填）%3', VIS, 'poly', ['v:路线', '?blk:w_style'], ['RoomVisual.poly'], 'act');
M('room', 'w_vis_text', '在 %1 上 %3 写字 %2 样式（可不填）%4', VIS, 'text', ['s:你好', 'v:位置', '?blk:w_style'], ['RoomVisual.text'], 'act');
M('room', 'w_vis_clear', '清空 %1', VIS, 'clear', [], ['RoomVisual.clear'], 'act');
M('room', 'w_vis_size', '%1 已用的大小', VIS, 'getSize', [], ['RoomVisual.getSize'], 'num');
M('room', 'w_vis_export', '%1 导出成文字', VIS, 'export', [], ['RoomVisual.export'], 'str');
M('room', 'w_vis_import', '把文字 %2 导入 %1', VIS, 'import', ['s:'], ['RoomVisual.import'], 'act');
P('room', 'roomName', '房间名', 'v:位置');
mk('room', 'w_style', '样式 颜色 %1 透明度 %2', [['A0', 's:#ffffff'], ['A1', 'n:0.5']], b => { const c = vc(b, 'A0', "'#ffffff'"); return `{ color: ${c}, fill: ${c}, stroke: ${c}, opacity: ${vc(b, 'A1', '0.5')} }`; }, ['RoomVisual'], 'val', { order: OA });

// ======================= 位置与寻路 =======================
label('pos', '位置');
mk('pos', 'w_pos_new', '房间 %3 里横 %1 纵 %2 的位置', [['A0', 'n:25'], ['A1', 'n:25'], ['A2', 's:']], b => `new RoomPosition(${vc(b, 'A0', '0')}, ${vc(b, 'A1', '0')}, ${vc(b, 'A2', "''")})`, ['RoomPosition'], 'val', { order: ON });
P('pos', 'x', '横坐标', 'v:位置'); P('pos', 'y', '纵坐标', 'v:位置');
label('pos', '路线');
M('pos', 'w_pos_pathto', '从 %1 到 %2 的路线 选项（可不填）%3', 'p:pos:兵', 'findPathTo', [T_, '?'], ['RoomPosition.findPathTo'], 'arr');
M('pos', 'w_room_path', '在 %1 里从 %2 到 %3 的路线 选项（可不填）%4', 'v:房间', 'findPath', ['p:pos:兵', 'p:pos:目标', '?'], ['Room.findPath'], 'arr');
G('pos', 'w_room_ser', '把路线 %1 变成文字', 'Room.serializePath', ['v:路线'], ['Room.serializePath'], 'str');
G('pos', 'w_room_deser', '把文字 %1 变回路线', 'Room.deserializePath', ['s:'], ['Room.deserializePath'], 'arr');
label('pos', '寻路器');
G('pos', 'w_pf_search', '寻路器：从 %1 到 %2 选项（可不填）%3', 'PathFinder.search', ['p:pos:兵', 'blk:w_pf_goal', '?'], ['PathFinder.search']);
mk('pos', 'w_pf_goal', '目标 %1 范围 %2', [['A0', 'p:pos:目标'], ['A1', 'n:1']], b => `{ pos: ${vc(b, 'A0')}, range: ${vc(b, 'A1', '0')} }`, ['PathFinder.search'], 'val', { order: OA });
mk('pos', 'w_pf_opts', '寻路选项 平地花费 %1 沼泽花费 %2 远离目标 %3 最多计算次数 %4 最多房间数 %5 花费表（可不填）%6', [['A0', 'n:1'], ['A1', 'n:5'], ['A2', 'b:0'], ['A3', 'n:2000'], ['A4', 'n:16'], ['A5', '']],
  b => { const o = [`plainCost: ${vc(b, 'A0', '1')}`, `swampCost: ${vc(b, 'A1', '5')}`, `flee: ${vc(b, 'A2', 'false')}`, `maxOps: ${vc(b, 'A3', '2000')}`, `maxRooms: ${vc(b, 'A4', '16')}`]; const m = JS.valueToCode(b, 'A5', O); if (m) o.push(`roomCallback: () => ${m}`); return `{ ${o.join(', ')} }`; }, ['PathFinder.search'], 'val', { order: OA });
mk('pos', 'w_pf_path', '寻路结果 %1 的路线', [['O', 'v:结果']], b => `${rv(b)}?.path`, ['PathFinder.search'], 'arr', { order: OM });
mk('pos', 'w_pf_incomplete', '寻路结果 %1 没找到完整路线', [['O', 'v:结果']], b => `${rv(b)}?.incomplete`, ['PathFinder.search'], 'bool', { order: OM });
mk('pos', 'w_pf_cost', '寻路结果 %1 的总花费', [['O', 'v:结果']], b => `${rv(b)}?.cost`, ['PathFinder.search'], 'num', { order: OM });
mk('pos', 'w_pf_ops', '寻路结果 %1 的计算次数', [['O', 'v:结果']], b => `${rv(b)}?.ops`, ['PathFinder.search'], 'num', { order: OM });
G('pos', 'w_pf_use', '使用寻路器 %1（旧写法）', 'PathFinder.use', ['b:1'], ['PathFinder.use'], 'act');
label('pos', '花费表');
mk('pos', 'w_cm_new', '新的花费表', [], () => 'new PathFinder.CostMatrix()', ['PathFinder.CostMatrix'], 'val', { order: ON });
M('pos', 'w_cm_set', '在花费表 %1 里把横 %2 纵 %3 设为 %4', 'v:花费表', 'set', ['n:25', 'n:25', 'n:255'], ['PathFinder.CostMatrix.set'], 'stmt');
M('pos', 'w_cm_get', '花费表 %1 里横 %2 纵 %3 的花费', 'v:花费表', 'get', ['n:25', 'n:25'], ['PathFinder.CostMatrix.get'], 'num');
M('pos', 'w_cm_clone', '复制花费表 %1', 'v:花费表', 'clone', [], ['PathFinder.CostMatrix.clone']);
M('pos', 'w_cm_ser', '把花费表 %1 变成数据', 'v:花费表', 'serialize', [], ['PathFinder.CostMatrix.serialize']);
G('pos', 'w_cm_deser', '把数据 %1 变回花费表', 'PathFinder.CostMatrix.deserialize', ['v:数据'], ['PathFinder.CostMatrix.deserialize']);

// ======================= 地图（Game.map） =======================
label('map', '房间之间');
G('map', 'w_map_exits', '房间 %1 的出口通向哪些房间', 'Game.map.describeExits', ['s:'], ['Game.map.describeExits']);
G('map', 'w_map_findexit', '从房间 %1 去房间 %2 走哪个出口 选项（可不填）%3', 'Game.map.findExit', ['s:', 's:', '?'], ['Game.map.findExit']);
G('map', 'w_map_route', '从房间 %1 到房间 %2 经过的房间 选项（可不填）%3', 'Game.map.findRoute', ['s:', 's:', '?'], ['Game.map.findRoute']);
G('map', 'w_map_dist', '房间 %1 和房间 %2 相隔几个房间 世界首尾相连（可不填）%3', 'Game.map.getRoomLinearDistance', ['s:', 's:', '?b:0'], ['Game.map.getRoomLinearDistance'], 'num');
G('map', 'w_map_terrain', '房间 %1 的地形（不用视野）', 'Game.map.getRoomTerrain', ['s:'], ['Game.map.getRoomTerrain']);
G('map', 'w_map_size', '世界的大小', 'Game.map.getWorldSize', [], ['Game.map.getWorldSize'], 'num');
G('map', 'w_map_terrainat', '房间 %3 横 %1 纵 %2 的地形（旧写法）', 'Game.map.getTerrainAt', ['n:25', 'n:25', 's:'], ['Game.map.getTerrainAt'], 'str');
G('map', 'w_map_avail', '房间 %1 能去吗（旧写法）', 'Game.map.isRoomAvailable', ['s:'], ['Game.map.isRoomAvailable'], 'bool');
G('map', 'w_map_status', '房间 %1 的开放状态', 'Game.map.getRoomStatus', ['s:'], ['Game.map.getRoomStatus']);
label('map', '地图绘图');
GP('map', 'w_map_visual', '世界地图绘图', 'Game.map.visual', ['Game.map.visual']);
G('map', 'w_mv_line', '在地图上从 %1 到 %2 画线 样式（可不填）%3', 'Game.map.visual.line', ['v:位置1', 'v:位置2', '?blk:w_style'], ['Game.map.visual.line'], 'act');
G('map', 'w_mv_circle', '在地图上 %1 画圆 样式（可不填）%2', 'Game.map.visual.circle', ['v:位置', '?blk:w_style'], ['Game.map.visual.circle'], 'act');
G('map', 'w_mv_rect', '在地图上从 %1 画宽 %2 高 %3 的方框 样式（可不填）%4', 'Game.map.visual.rect', ['v:位置', 'n:10', 'n:10', '?blk:w_style'], ['Game.map.visual.rect'], 'act');
G('map', 'w_mv_poly', '在地图上沿着 %1 画折线 样式（可不填）%2', 'Game.map.visual.poly', ['v:路线', '?blk:w_style'], ['Game.map.visual.poly'], 'act');
G('map', 'w_mv_text', '在地图上 %2 写字 %1 样式（可不填）%3', 'Game.map.visual.text', ['s:你好', 'v:位置', '?blk:w_style'], ['Game.map.visual.text'], 'act');
G('map', 'w_mv_clear', '清空地图绘图', 'Game.map.visual.clear', [], ['Game.map.visual.clear'], 'act');
G('map', 'w_mv_size', '地图绘图已用的大小', 'Game.map.visual.getSize', [], ['Game.map.visual.getSize'], 'num');
G('map', 'w_mv_export', '地图绘图导出成文字', 'Game.map.visual.export', [], ['Game.map.visual.export'], 'str');
G('map', 'w_mv_import', '把文字 %1 导入地图绘图', 'Game.map.visual.import', ['s:'], ['Game.map.visual.import'], 'act');

// ======================= 市场（Game.market） =======================
label('market', '我的');
GP('market', 'w_mk_credits', '我的信用点', 'Game.market.credits', ['Game.market.credits']);
GP('market', 'w_mk_orders', '我的订单', 'Game.market.orders', ['Game.market.orders']);
GP('market', 'w_mk_in', '最近收到的交易', 'Game.market.incomingTransactions', ['Game.market.incomingTransactions']);
GP('market', 'w_mk_out', '最近发出的交易', 'Game.market.outgoingTransactions', ['Game.market.outgoingTransactions']);
label('market', '查询');
G('market', 'w_mk_all', '市场上的订单 筛选（可不填）%1', 'Game.market.getAllOrders', ['?blk:w_mk_filter'], ['Game.market.getAllOrders'], 'arr');
mk('market', 'w_mk_filter', '订单筛选 种类 %1 资源 %2', [['A0', 'k:order:ORDER_SELL'], ['A1', 'k:res:RESOURCE_ENERGY']], b => `{ type: ${vc(b, 'A0')}, resourceType: ${vc(b, 'A1')} }`, ['Game.market.getAllOrders'], 'val', { order: OA });
G('market', 'w_mk_byid', '编号是 %1 的订单', 'Game.market.getOrderById', ['s:'], ['Game.market.getOrderById']);
G('market', 'w_mk_hist', '%1（可不填）最近的价格记录', 'Game.market.getHistory', ['?k:res:RESOURCE_ENERGY'], ['Game.market.getHistory'], 'arr');
G('market', 'w_mk_cost', '从房间 %2 发 %1 个资源到房间 %3 要花多少能量', 'Game.market.calcTransactionCost', ['n:1000', 's:', 's:'], ['Game.market.calcTransactionCost'], 'num');
label('market', '交易');
G('market', 'w_mk_deal', '和订单 %1 成交 数量 %2 用我的房间（可不填）%3', 'Game.market.deal', ['s:', 'n:100', '?'], ['Game.market.deal'], 'act');
G('market', 'w_mk_create', '挂出订单 %1', 'Game.market.createOrder', ['blk:w_mk_params'], ['Game.market.createOrder'], 'act');
mk('market', 'w_mk_params', '订单 种类 %1 资源 %2 单价 %3 总量 %4 房间（可不填）%5', [['A0', 'k:order:ORDER_SELL'], ['A1', 'k:res:RESOURCE_ENERGY'], ['A2', 'n:1'], ['A3', 'n:1000'], ['A4', '']],
  b => { const o = [`type: ${vc(b, 'A0')}`, `resourceType: ${vc(b, 'A1')}`, `price: ${vc(b, 'A2', '0')}`, `totalAmount: ${vc(b, 'A3', '0')}`]; const r = JS.valueToCode(b, 'A4', O); if (r) o.push(`roomName: ${r}`); return `{ ${o.join(', ')} }`; }, ['Game.market.createOrder'], 'val', { order: OA });
G('market', 'w_mk_cancel', '撤销订单 %1', 'Game.market.cancelOrder', ['s:'], ['Game.market.cancelOrder'], 'act');
G('market', 'w_mk_price', '把订单 %1 的单价改成 %2', 'Game.market.changeOrderPrice', ['s:', 'n:1'], ['Game.market.changeOrderPrice'], 'act');
G('market', 'w_mk_extend', '给订单 %1 追加数量 %2', 'Game.market.extendOrder', ['s:', 'n:1000'], ['Game.market.extendOrder'], 'act');

// ======================= 记忆 =======================
label('mem', '记忆');
GP('mem', 'w_mem', '全部记忆', 'Memory', ['Memory']);
mk('mem', 'w_mem_get', '记忆里 %1 的值', [['A0', 's:']], b => `Memory[${vc(b, 'A0', "''")}]`, ['Memory'], 'val', { order: OM });
mk('mem', 'w_mem_set', '把记忆里 %1 设为 %2', [['A0', 's:'], ['A1', '']], b => `Memory[${vc(b, 'A0', "''")}] = ${vc(b, 'A1')}`, ['Memory'], 'stmt');
GP('mem', 'w_mem_creeps', '所有兵的记忆', 'Memory.creeps', ['Memory']);
label('mem', '原始记忆');
G('mem', 'w_raw_get', '原始记忆的文字', 'RawMemory.get', [], ['RawMemory.get'], 'str');
G('mem', 'w_raw_set', '把原始记忆设为 %1', 'RawMemory.set', ['s:'], ['RawMemory.set'], 'act');
GP('mem', 'w_raw_segs', '已打开的记忆分段', 'RawMemory.segments', ['RawMemory.segments']);
GP('mem', 'w_raw_intershard', '跨分片记忆段（旧写法）', 'RawMemory.interShardSegment', ['RawMemory.interShardSegment']);
GP('mem', 'w_raw_foreign', '别人的公开分段', 'RawMemory.foreignSegment', ['RawMemory.foreignSegment']);
G('mem', 'w_raw_active', '下回合打开记忆分段 %1', 'RawMemory.setActiveSegments', ['blk:lists_create_with'], ['RawMemory.setActiveSegments'], 'act');
G('mem', 'w_raw_activeforeign', '下回合读取玩家 %1 的公开分段 分段号（可不填）%2', 'RawMemory.setActiveForeignSegment', ['s:', '?'], ['RawMemory.setActiveForeignSegment'], 'act');
G('mem', 'w_raw_defpublic', '把分段 %1 设为默认公开分段', 'RawMemory.setDefaultPublicSegment', ['n:0'], ['RawMemory.setDefaultPublicSegment'], 'act');
G('mem', 'w_raw_public', '把分段 %1 设为公开', 'RawMemory.setPublicSegments', ['blk:lists_create_with'], ['RawMemory.setPublicSegments'], 'act');
label('mem', '跨分片记忆');
G('mem', 'w_ism_get', '本分片的跨分片数据', 'InterShardMemory.getLocal', [], ['InterShardMemory.getLocal'], 'str');
G('mem', 'w_ism_set', '把本分片的跨分片数据设为 %1', 'InterShardMemory.setLocal', ['s:'], ['InterShardMemory.setLocal'], 'act');
G('mem', 'w_ism_remote', '分片 %1 的跨分片数据', 'InterShardMemory.getRemote', ['s:'], ['InterShardMemory.getRemote'], 'str');
label('mem', '常用');
mk('mem', 'w_json_str', '把 %1 变成文字', [['A0', '']], b => `JSON.stringify(${vc(b, 'A0')})`, [], 'str');
mk('mem', 'w_json_parse', '把文字 %1 变回数据', [['A0', 's:']], b => `JSON.parse(${vc(b, 'A0', "'null'")})`, [], 'val');
// ======================= 常量（下拉显示中文，值是官方常量） =======================
const CZH = {
  OK: '成功', ERR_NOT_OWNER: '不是你的', ERR_NO_PATH: '没有路', ERR_NAME_EXISTS: '名字已存在', ERR_BUSY: '正忙', ERR_NOT_FOUND: '没找到', ERR_NOT_ENOUGH_ENERGY: '能量不够',
  ERR_NOT_ENOUGH_RESOURCES: '资源不够', ERR_INVALID_TARGET: '目标不对', ERR_FULL: '已经满了', ERR_NOT_IN_RANGE: '距离太远', ERR_INVALID_ARGS: '参数不对', ERR_TIRED: '太累了（疲劳）',
  ERR_NO_BODYPART: '缺少需要的部件', ERR_NOT_ENOUGH_EXTENSIONS: '扩展不够', ERR_RCL_NOT_ENOUGH: '控制器等级不够', ERR_GCL_NOT_ENOUGH: '全局控制等级不够', ERR_ACCESS_DENIED: '没有权限',
  FIND_EXIT_TOP: '上方出口', FIND_EXIT_RIGHT: '右方出口', FIND_EXIT_BOTTOM: '下方出口', FIND_EXIT_LEFT: '左方出口', FIND_EXIT: '所有出口',
  FIND_CREEPS: '所有兵', FIND_MY_CREEPS: '我的兵', FIND_HOSTILE_CREEPS: '敌人的兵', FIND_SOURCES_ACTIVE: '还有能量的能量源', FIND_SOURCES: '所有能量源',
  FIND_DROPPED_RESOURCES: '掉在地上的资源', FIND_STRUCTURES: '所有建筑', FIND_MY_STRUCTURES: '我的建筑', FIND_HOSTILE_STRUCTURES: '敌人的建筑', FIND_FLAGS: '旗帜',
  FIND_CONSTRUCTION_SITES: '所有工地', FIND_MY_SPAWNS: '我的基地', FIND_HOSTILE_SPAWNS: '敌人的基地', FIND_MY_CONSTRUCTION_SITES: '我的工地', FIND_HOSTILE_CONSTRUCTION_SITES: '敌人的工地',
  FIND_MINERALS: '矿物', FIND_NUKES: '飞来的核弹', FIND_TOMBSTONES: '墓碑', FIND_POWER_CREEPS: '所有超能兵', FIND_MY_POWER_CREEPS: '我的超能兵', FIND_HOSTILE_POWER_CREEPS: '敌人的超能兵',
  FIND_DEPOSITS: '沉积物', FIND_RUINS: '废墟',
  LOOK_CREEPS: '兵', LOOK_ENERGY: '能量', LOOK_RESOURCES: '掉落的资源', LOOK_SOURCES: '能量源', LOOK_MINERALS: '矿物', LOOK_DEPOSITS: '沉积物', LOOK_STRUCTURES: '建筑', LOOK_FLAGS: '旗帜',
  LOOK_CONSTRUCTION_SITES: '工地', LOOK_NUKES: '核弹', LOOK_TERRAIN: '地形', LOOK_TOMBSTONES: '墓碑', LOOK_POWER_CREEPS: '超能兵', LOOK_RUINS: '废墟',
  STRUCTURE_SPAWN: '基地', STRUCTURE_EXTENSION: '扩展', STRUCTURE_ROAD: '道路', STRUCTURE_WALL: '墙', STRUCTURE_RAMPART: '城墙', STRUCTURE_KEEPER_LAIR: '守卫巢穴', STRUCTURE_PORTAL: '传送门',
  STRUCTURE_CONTROLLER: '控制器', STRUCTURE_LINK: '链路', STRUCTURE_STORAGE: '仓库', STRUCTURE_TOWER: '塔', STRUCTURE_OBSERVER: '观察者', STRUCTURE_POWER_BANK: '超能银行',
  STRUCTURE_POWER_SPAWN: '超能基地', STRUCTURE_EXTRACTOR: '采矿机', STRUCTURE_LAB: '实验室', STRUCTURE_TERMINAL: '终端', STRUCTURE_CONTAINER: '容器', STRUCTURE_NUKER: '核弹发射井',
  STRUCTURE_FACTORY: '工厂', STRUCTURE_INVADER_CORE: '入侵者核心',
  WORK: '工作', CARRY: '携带', MOVE: '移动', ATTACK: '近战攻击', RANGED_ATTACK: '远程攻击', HEAL: '治疗', CLAIM: '占领', TOUGH: '坚韧',
  TOP: '上', TOP_RIGHT: '右上', RIGHT: '右', BOTTOM_RIGHT: '右下', BOTTOM: '下', BOTTOM_LEFT: '左下', LEFT: '左', TOP_LEFT: '左上',
  TERRAIN_MASK_WALL: '墙', TERRAIN_MASK_SWAMP: '沼泽', TERRAIN_MASK_LAVA: '岩浆',
  COLOR_RED: '红', COLOR_PURPLE: '紫', COLOR_BLUE: '蓝', COLOR_CYAN: '青', COLOR_GREEN: '绿', COLOR_YELLOW: '黄', COLOR_ORANGE: '橙', COLOR_BROWN: '棕', COLOR_GREY: '灰', COLOR_WHITE: '白',
  ORDER_SELL: '卖单', ORDER_BUY: '买单',
  EVENT_ATTACK: '攻击', EVENT_OBJECT_DESTROYED: '对象被摧毁', EVENT_ATTACK_CONTROLLER: '攻击控制器', EVENT_BUILD: '建造', EVENT_HARVEST: '采集', EVENT_HEAL: '治疗', EVENT_REPAIR: '修理',
  EVENT_RESERVE_CONTROLLER: '预定控制器', EVENT_UPGRADE_CONTROLLER: '升级控制器', EVENT_EXIT: '离开房间', EVENT_POWER: '使用超能', EVENT_TRANSFER: '转移资源',
  EVENT_ATTACK_TYPE_MELEE: '攻击方式：近战', EVENT_ATTACK_TYPE_RANGED: '攻击方式：远程', EVENT_ATTACK_TYPE_RANGED_MASS: '攻击方式：远程范围', EVENT_ATTACK_TYPE_DISMANTLE: '攻击方式：拆除',
  EVENT_ATTACK_TYPE_HIT_BACK: '攻击方式：反击', EVENT_ATTACK_TYPE_NUKE: '攻击方式：核弹', EVENT_HEAL_TYPE_MELEE: '治疗方式：近身', EVENT_HEAL_TYPE_RANGED: '治疗方式：远程',
  PWR_GENERATE_OPS: '生成操作点', PWR_OPERATE_SPAWN: '加速基地', PWR_OPERATE_TOWER: '增强塔', PWR_OPERATE_STORAGE: '扩容仓库', PWR_OPERATE_LAB: '加速实验室', PWR_OPERATE_EXTENSION: '充满扩展',
  PWR_OPERATE_OBSERVER: '增强观察者', PWR_OPERATE_TERMINAL: '增强终端', PWR_DISRUPT_SPAWN: '干扰基地', PWR_DISRUPT_TOWER: '削弱塔', PWR_DISRUPT_SOURCE: '封锁能量源', PWR_SHIELD: '护盾',
  PWR_REGEN_SOURCE: '恢复能量源', PWR_REGEN_MINERAL: '恢复矿物', PWR_DISRUPT_TERMINAL: '干扰终端', PWR_OPERATE_POWER: '加速超能处理', PWR_FORTIFY: '加固', PWR_OPERATE_CONTROLLER: '加速控制器升级', PWR_OPERATE_FACTORY: '激活工厂',
  EFFECT_INVULNERABILITY: '无敌', EFFECT_COLLAPSE_TIMER: '倒塌倒计时',
  RESOURCE_ENERGY: '能量', RESOURCE_POWER: '超能', RESOURCE_OPS: '操作点', RESOURCE_HYDROGEN: '氢 H', RESOURCE_OXYGEN: '氧 O', RESOURCE_UTRIUM: '钛 U', RESOURCE_LEMERGIUM: '铑 L',
  RESOURCE_KEANIUM: '钾 K', RESOURCE_ZYNTHIUM: '锌 Z', RESOURCE_CATALYST: '催化剂 X', RESOURCE_GHODIUM: '萃取物 G', RESOURCE_SILICON: '硅', RESOURCE_METAL: '金属', RESOURCE_BIOMASS: '生物质',
  RESOURCE_MIST: '雾', RESOURCE_UTRIUM_BAR: '钛条', RESOURCE_LEMERGIUM_BAR: '铑条', RESOURCE_ZYNTHIUM_BAR: '锌条', RESOURCE_KEANIUM_BAR: '钾条', RESOURCE_GHODIUM_MELT: '萃取物熔块',
  RESOURCE_OXIDANT: '氧化剂', RESOURCE_REDUCTANT: '还原剂', RESOURCE_PURIFIER: '净化剂', RESOURCE_BATTERY: '电池', RESOURCE_COMPOSITE: '复合材料', RESOURCE_CRYSTAL: '晶体', RESOURCE_LIQUID: '液体',
  RESOURCE_WIRE: '导线', RESOURCE_SWITCH: '开关', RESOURCE_TRANSISTOR: '晶体管', RESOURCE_MICROCHIP: '微芯片', RESOURCE_CIRCUIT: '电路', RESOURCE_DEVICE: '设备',
  RESOURCE_CELL: '细胞', RESOURCE_PHLEGM: '黏液', RESOURCE_TISSUE: '组织', RESOURCE_MUSCLE: '肌肉', RESOURCE_ORGANOID: '类器官', RESOURCE_ORGANISM: '有机体',
  RESOURCE_ALLOY: '合金', RESOURCE_TUBE: '管材', RESOURCE_FIXTURES: '配件', RESOURCE_FRAME: '框架', RESOURCE_HYDRAULICS: '液压件', RESOURCE_MACHINE: '机器',
  RESOURCE_CONDENSATE: '冷凝物', RESOURCE_CONCENTRATE: '浓缩物', RESOURCE_EXTRACT: '萃取液', RESOURCE_SPIRIT: '灵质', RESOURCE_EMANATION: '辐射物', RESOURCE_ESSENCE: '精华',
};
const NUMZH = `OBSTACLE_OBJECT_TYPES=挡路的对象种类;BODYPART_COST=各身体部件价格;WORLD_WIDTH=世界宽度;WORLD_HEIGHT=世界高度;CREEP_LIFE_TIME=兵的寿命;CREEP_CLAIM_LIFE_TIME=带占领部件的兵的寿命;CREEP_CORPSE_RATE=兵死后留下资源的比例;CREEP_PART_MAX_ENERGY=每个部件最多回收能量;CARRY_CAPACITY=每个携带部件的容量;HARVEST_POWER=每个工作部件采集能量;HARVEST_MINERAL_POWER=每个工作部件采集矿物;HARVEST_DEPOSIT_POWER=每个工作部件采集沉积物;REPAIR_POWER=每个工作部件修理量;DISMANTLE_POWER=每个工作部件拆除量;BUILD_POWER=每个工作部件建造量;ATTACK_POWER=每个近战部件伤害;UPGRADE_CONTROLLER_POWER=每个工作部件升级量;RANGED_ATTACK_POWER=每个远程部件伤害;HEAL_POWER=每个治疗部件治疗量;RANGED_HEAL_POWER=每个治疗部件远程治疗量;REPAIR_COST=修理每点生命耗能;DISMANTLE_COST=拆除每点生命返还能量;RAMPART_DECAY_AMOUNT=城墙每次衰减生命;RAMPART_DECAY_TIME=城墙衰减间隔;RAMPART_HITS=城墙初始生命;RAMPART_HITS_MAX=城墙各等级最大生命;ENERGY_REGEN_TIME=能量源恢复间隔;ENERGY_DECAY=地上能量每回合消散;SPAWN_HITS=基地生命;SPAWN_ENERGY_START=基地初始能量;SPAWN_ENERGY_CAPACITY=基地能量容量;CREEP_SPAWN_TIME=每个部件孵化回合;SPAWN_RENEW_RATIO=续命效率;SOURCE_ENERGY_CAPACITY=能量源容量（已占领房间）;SOURCE_ENERGY_NEUTRAL_CAPACITY=能量源容量（无主房间）;SOURCE_ENERGY_KEEPER_CAPACITY=能量源容量（守卫房间）;WALL_HITS=墙初始生命;WALL_HITS_MAX=墙最大生命;EXTENSION_HITS=扩展生命;EXTENSION_ENERGY_CAPACITY=扩展各等级能量容量;ROAD_HITS=道路生命;ROAD_WEAROUT=兵走过道路的磨损;ROAD_WEAROUT_POWER_CREEP=超能兵走过道路的磨损;ROAD_DECAY_AMOUNT=道路每次衰减生命;ROAD_DECAY_TIME=道路衰减间隔;LINK_HITS=链路生命;LINK_HITS_MAX=链路最大生命;LINK_CAPACITY=链路容量;LINK_COOLDOWN=链路每格冷却;LINK_LOSS_RATIO=链路传送损耗比例;STORAGE_CAPACITY=仓库容量;STORAGE_HITS=仓库生命;CONSTRUCTION_COST=各建筑建造花费;CONSTRUCTION_COST_ROAD_SWAMP_RATIO=沼泽修路花费倍数;CONSTRUCTION_COST_ROAD_WALL_RATIO=墙上修路花费倍数;CONTROLLER_LEVELS=控制器各等级升级所需;CONTROLLER_STRUCTURES=控制器各等级可建数量;CONTROLLER_DOWNGRADE=控制器各等级降级时间;CONTROLLER_DOWNGRADE_RESTORE=控制器降级恢复量;CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD=降级倒计时低于多少不能开安全模式;CONTROLLER_CLAIM_DOWNGRADE=攻击控制器降级量;CONTROLLER_RESERVE=每个占领部件预定回合;CONTROLLER_RESERVE_MAX=最长预定回合;CONTROLLER_MAX_UPGRADE_PER_TICK=八级控制器每回合最多升级量;CONTROLLER_ATTACK_BLOCKED_UPGRADE=被攻击后禁止升级回合;CONTROLLER_NUKE_BLOCKED_UPGRADE=被核弹击中后禁止升级回合;SAFE_MODE_DURATION=安全模式持续回合;SAFE_MODE_COOLDOWN=安全模式冷却;SAFE_MODE_COST=生成安全模式所需萃取物;TOWER_HITS=塔生命;TOWER_CAPACITY=塔能量容量;TOWER_ENERGY_COST=塔每次耗能;TOWER_POWER_ATTACK=塔攻击伤害;TOWER_POWER_HEAL=塔治疗量;TOWER_POWER_REPAIR=塔修理量;TOWER_OPTIMAL_RANGE=塔满威力距离;TOWER_FALLOFF_RANGE=塔最弱距离;TOWER_FALLOFF=塔最远处威力降低比例;OBSERVER_HITS=观察者生命;OBSERVER_RANGE=观察者范围;POWER_BANK_HITS=超能银行生命;POWER_BANK_CAPACITY_MAX=超能银行最多超能;POWER_BANK_CAPACITY_MIN=超能银行最少超能;POWER_BANK_CAPACITY_CRIT=超能银行大量超能门槛;POWER_BANK_DECAY=超能银行消失回合;POWER_BANK_HIT_BACK=超能银行反伤比例;POWER_SPAWN_HITS=超能基地生命;POWER_SPAWN_ENERGY_CAPACITY=超能基地能量容量;POWER_SPAWN_POWER_CAPACITY=超能基地超能容量;POWER_SPAWN_ENERGY_RATIO=处理每点超能耗能;EXTRACTOR_HITS=采矿机生命;EXTRACTOR_COOLDOWN=采矿机冷却;LAB_HITS=实验室生命;LAB_MINERAL_CAPACITY=实验室矿物容量;LAB_ENERGY_CAPACITY=实验室能量容量;LAB_BOOST_ENERGY=强化每个部件耗能;LAB_BOOST_MINERAL=强化每个部件耗矿物;LAB_COOLDOWN=实验室冷却;LAB_REACTION_AMOUNT=每次反应产量;LAB_UNBOOST_ENERGY=取消强化返还能量;LAB_UNBOOST_MINERAL=取消强化返还矿物;GCL_POW=全局控制等级指数;GCL_MULTIPLY=全局控制等级倍数;GCL_NOVICE=新手区全局控制等级上限;MODE_SIMULATION=模拟模式;MODE_WORLD=世界模式;MAX_CONSTRUCTION_SITES=最多工地数;MAX_CREEP_SIZE=兵最多部件数;MINERAL_REGEN_TIME=矿物再生回合;MINERAL_MIN_AMOUNT=各密度矿物最少储量;MINERAL_RANDOM_FACTOR=矿物储量随机系数;MINERAL_DENSITY=各密度矿物储量;MINERAL_DENSITY_PROBABILITY=各密度出现概率;MINERAL_DENSITY_CHANGE=矿物密度变化概率;DENSITY_LOW=低密度;DENSITY_MODERATE=中密度;DENSITY_HIGH=高密度;DENSITY_ULTRA=超高密度;DEPOSIT_EXHAUST_MULTIPLY=沉积物冷却倍数;DEPOSIT_EXHAUST_POW=沉积物冷却指数;DEPOSIT_DECAY_TIME=沉积物消失回合;TERMINAL_CAPACITY=终端容量;TERMINAL_HITS=终端生命;TERMINAL_SEND_COST=终端发送费用系数;TERMINAL_MIN_SEND=终端最少发送量;TERMINAL_COOLDOWN=终端冷却;CONTAINER_HITS=容器生命;CONTAINER_CAPACITY=容器容量;CONTAINER_DECAY=容器每次衰减生命;CONTAINER_DECAY_TIME=容器衰减间隔;CONTAINER_DECAY_TIME_OWNED=自己房间容器衰减间隔;NUKER_HITS=核弹发射井生命;NUKER_COOLDOWN=核弹发射井冷却;NUKER_ENERGY_CAPACITY=核弹发射井能量容量;NUKER_GHODIUM_CAPACITY=核弹发射井萃取物容量;NUKE_LAND_TIME=核弹飞行回合;NUKE_RANGE=核弹射程;NUKE_DAMAGE=核弹伤害;FACTORY_HITS=工厂生命;FACTORY_CAPACITY=工厂容量;TOMBSTONE_DECAY_PER_PART=墓碑每个部件存留回合;TOMBSTONE_DECAY_POWER_CREEP=超能兵墓碑存留回合;RUIN_DECAY=废墟存留回合;RUIN_DECAY_STRUCTURES=特定建筑废墟存留回合;PORTAL_DECAY=传送门消失回合;MARKET_FEE=市场手续费;MARKET_MAX_ORDERS=最多订单数;MARKET_ORDER_LIFE_TIME=订单有效期;FLAGS_LIMIT=最多旗帜数;SUBSCRIPTION_TOKEN=订阅令牌;CPU_UNLOCK=计算资源解锁道具;PIXEL=像素;ACCESS_KEY=访问钥匙;PIXEL_CPU_COST=生成像素所需储备;REACTIONS=化学反应表;BOOSTS=强化效果表;REACTION_TIME=各化合物反应回合;PORTAL_UNSTABLE=不稳定传送门存在回合;PORTAL_MIN_TIMEOUT=传送门最短存在回合;PORTAL_MAX_TIMEOUT=传送门最长存在回合;POWER_BANK_RESPAWN_TIME=超能银行刷新回合;INVADERS_ENERGY_GOAL=入侵者出现能量门槛;SYSTEM_USERNAME=系统玩家名;SIGN_NOVICE_AREA=新手区签名;SIGN_RESPAWN_AREA=重生区签名;SIGN_PLANNED_AREA=规划区签名;POWER_LEVEL_MULTIPLY=全局超能等级倍数;POWER_LEVEL_POW=全局超能等级指数;POWER_CREEP_SPAWN_COOLDOWN=超能兵出现冷却;POWER_CREEP_DELETE_COOLDOWN=超能兵删除冷却;POWER_CREEP_MAX_LEVEL=超能兵最高等级;POWER_CREEP_LIFE_TIME=超能兵寿命;POWER_CLASS=超能兵职业表;INVADER_CORE_HITS=入侵者核心生命;INVADER_CORE_CREEP_SPAWN_TIME=入侵者核心孵化回合;INVADER_CORE_EXPAND_TIME=入侵者核心扩张回合;INVADER_CORE_CONTROLLER_POWER=入侵者核心对控制器的影响;INVADER_CORE_CONTROLLER_DOWNGRADE=入侵者核心控制器降级回合;STRONGHOLD_RAMPART_HITS=要塞城墙生命;STRONGHOLD_DECAY_TICKS=要塞存在回合;POWER_INFO=超能能力表;BODYPARTS_ALL=全部身体部件;RESOURCES_ALL=全部资源;COLORS_ALL=全部颜色;INTERSHARD_RESOURCES=跨分片资源;COMMODITIES=商品配方表`;
NUMZH.split(';').forEach(s => { const [k, v] = s.split('='); CZH[k] = v; });
// 化合物：显示化学式（游戏里的写法，如 UH、XGHO2）
function constZh(x) { if (CZH[x]) return CZH[x]; if (x.startsWith('RESOURCE_') && typeof SC !== 'undefined' && typeof SC[x] === 'string') return '化合物 ' + SC[x]; return x; }
const SCK = typeof SC !== 'undefined' ? Object.keys(SC) : [];
const byPre = (re, ex) => SCK.filter(k => re.test(k) && !(ex && ex.test(k)) && typeof SC[k] !== 'function');
const K_BODY = ['MOVE', 'WORK', 'CARRY', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM', 'TOUGH'], K_DIR = ['TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT'];
const KGROUPS = [
  ['err', '结果码', ['OK', ...byPre(/^ERR_/)]], ['find', '查找', byPre(/^FIND_/)], ['look', '看', byPre(/^LOOK_/)], ['struct', '建筑种类', byPre(/^STRUCTURE_/)],
  ['res', '资源', byPre(/^RESOURCE_/)], ['part', '身体部件', K_BODY], ['dir', '方向', K_DIR], ['color', '颜色', byPre(/^COLOR_/, /^COLORS_ALL$/)],
  ['terrain', '地形', byPre(/^TERRAIN_MASK_/)], ['order', '订单种类', byPre(/^ORDER_/)], ['event', '事件', byPre(/^EVENT_/)], ['pwr', '超能能力', byPre(/^PWR_/)], ['effect', '特殊效果', byPre(/^EFFECT_/)],
];
const inGroup = new Set(KGROUPS.flatMap(g => g[2]));
KGROUPS.push(['num', '游戏数值', SCK.filter(k => /^[A-Z][A-Z0-9_]*$/.test(k) && !inGroup.has(k) && CZH[k] && typeof SC[k] !== 'function')]);
function KDEF(id, text, list, gen, keys, cat = 'const') {
  const type = 'w_k_' + id;
  Blockly.defineBlocksWithJsonArray([{ type, message0: `${text} %1`, args0: [{ type: 'field_dropdown', name: 'K', options: list }], output: null, colour: COL.const, tooltip: keys.join(' '), helpUrl: '' }]);
  JS.forBlock[type] = gen; BLOCKS[type] = cat; cover(type, keys); CAT[cat].push({ kind: 'block', type });
}
for (const [id, text, list] of KGROUPS) { if (!list.length) continue; KDEF(id, text, list.map(k => [constZh(k), k]), b => [b.getFieldValue('K'), OA], list.map(k => 'const.' + k)); }
label('const', '选项');
KDEF('fkey', '按', [['建筑种类', 'structureType'], ['资源种类', 'resourceType'], ['名字', 'name'], ['是我的', 'my'], ['矿物种类', 'mineralType'], ['沉积物种类', 'depositType']], b => [q(b.getFieldValue('K')), OA], ['Room.find']);
KDEF('meth', '动作', [['移动', 'move'], ['采集', 'harvest'], ['近战攻击', 'attack'], ['远程攻击', 'rangedAttack'], ['远程范围攻击', 'rangedMassAttack'], ['治疗', 'heal'], ['远程治疗', 'rangedHeal'], ['建造', 'build'], ['修理', 'repair'],
  ['拆除', 'dismantle'], ['升级控制器', 'upgradeController'], ['转移', 'transfer'], ['取出', 'withdraw'], ['捡起', 'pickup'], ['扔下', 'drop'], ['说话', 'say'], ['拉', 'pull']], b => [q(b.getFieldValue('K')), OA], ['Creep.cancelOrder']);
KDEF('pclass', '超能兵职业', [['操作员', 'OPERATOR']], b => [`POWER_CLASS.${b.getFieldValue('K')}`, OM], ['const.POWER_CLASS']);

// ======================= 数据表（JS 对象：遍历 Game.creeps 这类“按名字”的表） =======================
mk('data', 'w_obj_values', '%1 里的全部内容', [['A0', 'blk:w_g_creeps']], b => `Object.values(${vc(b, 'A0', '{}')})`, [], 'arr');
mk('data', 'w_obj_keys', '%1 里的全部名字', [['A0', 'blk:w_g_creeps']], b => `Object.keys(${vc(b, 'A0', '{}')})`, [], 'arr');
Blockly.defineBlocksWithJsonArray([{ type: 'w_forin', message0: '对 %2 里的每个名字 %1 %3 %4', args0: [{ type: 'field_variable', name: 'VAR', variable: '名字' }, { type: 'input_value', name: 'O' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, inputsInline: true, colour: COL.loop, tooltip: '', helpUrl: '' }]);
JS.forBlock.w_forin = b => `for (${JS.getVariableName(b.getFieldValue('VAR'))} in ${JS.valueToCode(b, 'O', O) || '{}'}) {\n${JS.INFINITE_LOOP_TRAP}${JS.statementToCode(b, 'DO')}}\n`; BLOCKS.w_forin = 'loop';
mk('data', 'w_obj_get', '%1 里 %2 的值', [['O', 'v:数据'], ['A0', 's:']], b => `${rv(b)}?.[${vc(b, 'A0', "''")}]`, [], 'val', { order: OM });
mk('data', 'w_obj_set', '把 %1 里 %2 设为 %3', [['O', 'v:数据'], ['A0', 's:'], ['A1', '']], b => `Object(${vc(b, 'O', '{}')})[${vc(b, 'A0', "''")}] = ${vc(b, 'A1')}`, [], 'stmt');
mk('data', 'w_obj_del', '从 %1 删掉 %2', [['O', 'v:数据'], ['A0', 's:']], b => `delete Object(${vc(b, 'O', '{}')})[${vc(b, 'A0', "''")}]`, [], 'stmt');
mk('data', 'w_obj_has', '%1 里有 %2 吗', [['O', 'v:数据'], ['A0', 's:']], b => `(${vc(b, 'A0', "''")} in Object(${vc(b, 'O', '{}')}))`, [], 'bool', { order: OR });
mk('data', 'w_obj_new', '新的空数据表', [], () => '{}', [], 'val', { order: OA });
mk('data', 'w_obj_pair', '数据表 %1 是 %2', [['A0', 's:role'], ['A1', 's:']], b => `{ [${vc(b, 'A0', "''")}]: ${vc(b, 'A1')} }`, [], 'val', { order: OA });
mk('data', 'w_obj_pair2', '数据表 %1 是 %2 %3 是 %4', [['A0', 's:'], ['A1', ''], ['A2', 's:'], ['A3', '']], b => `{ [${vc(b, 'A0', "''")}]: ${vc(b, 'A1')}, [${vc(b, 'A2', "''")}]: ${vc(b, 'A3')} }`, [], 'val', { order: OA });
cover('w_g_time', ['Game']); cover('w_ism_get', ['InterShardMemory']); cover('w_pf_search', ['PathFinder']); cover('w_raw_get', ['RawMemory']);
// ---------- 身体部件与身份积木 ----------
Blockly.defineBlocksWithJsonArray([
  { type: 'w_body', message0: '身体 %1', args0: [{ type: 'field_body', name: 'B', value: 'work,carry,move' }], output: 'Array', colour: COL.spawn, tooltip: 'StructureSpawn.spawnCreep body', helpUrl: '' },
  { type: 'w_role_body', message0: '身份 %1 的身体', args0: [{ type: 'field_role', name: 'ROLE' }], output: 'Array', colour: COL.spawn, tooltip: 'StructureSpawn.spawnCreep body', helpUrl: '' },
  { type: 'w_role_name', message0: '身份 %1', args0: [{ type: 'field_role', name: 'ROLE' }], output: 'String', colour: COL.spawn, tooltip: '', helpUrl: '' },
  { type: 'w_role_mem', message0: '身份 %1 的记忆', args0: [{ type: 'field_role', name: 'ROLE' }], output: null, colour: COL.spawn, tooltip: 'StructureSpawn.spawnCreep memory', helpUrl: '' },
  { type: 'w_role_of', message0: '%1 记忆里的身份', args0: [{ type: 'input_value', name: 'O' }], output: null, inputsInline: true, colour: COL.spawn, tooltip: 'Creep.memory', helpUrl: '' },
]);
const bodyArr = s => `[${parseBody(s).map(p => p.toUpperCase()).join(', ')}]`;
JS.forBlock.w_body = b => [bodyArr(b.getFieldValue('B')), OA];
JS.forBlock.w_role_body = b => { const r = findRole(b.getFieldValue('ROLE')); return [r ? bodyArr(r.body) : '[]', OA]; };
JS.forBlock.w_role_name = b => [q(b.getFieldValue('ROLE') || ''), OA];
JS.forBlock.w_role_mem = b => [`{ role: ${q(b.getFieldValue('ROLE') || '')} }`, OA];
JS.forBlock.w_role_of = b => [`${rv(b)}?.memory?.role`, OM];
['w_body', 'w_role_body', 'w_role_name', 'w_role_mem', 'w_role_of'].forEach(t => BLOCKS[t] = 'spawn');
cover('w_body', ['StructureSpawn.spawnCreep']);
{ const s = CAT.spawn, i = s.findIndex(e => e.kind === 'label' && e.text === '孵化');
  s.splice(i, 0, { kind: 'block', type: 'w_role_body' }, { kind: 'block', type: 'w_role_name' }, { kind: 'block', type: 'w_role_mem' }, { kind: 'block', type: 'w_role_of', inputs: { O: PRE(C_) } });
  s.splice(s.findIndex(e => e.type === 'w_s_spawn') + 1, 0, { kind: 'block', type: 'w_body' }); }

// ---------- 通用编程积木（Blockly 标准积木） ----------
const N = n => ({ shadow: { type: 'math_number', fields: { NUM: n } } }), TX = t => ({ shadow: { type: 'text', fields: { TEXT: t } } });
const SB = (type, extra) => Object.assign({ kind: 'block', type }, extra || {});
CAT.logic.push(SB('controls_if'), SB('controls_if', { extraState: { hasElse: true } }), SB('controls_if', { extraState: { elseIfCount: 1, hasElse: true } }),
  SB('logic_compare', { inputs: { A: { block: { type: 'w_result' } }, B: { block: { type: 'w_k_err', fields: { K: 'ERR_NOT_IN_RANGE' } } } } }),
  SB('logic_compare'), SB('logic_operation'), SB('logic_negate'), SB('logic_boolean'), SB('logic_null'), SB('logic_ternary'), { kind: 'block', type: 'w_exists', inputs: { O: PRE(T_) } });
CAT.loop.push(SB('controls_forEach', { inputs: { LIST: { block: { type: 'w_obj_values', inputs: { A0: { block: { type: 'w_g_creeps' } } } } } }, fields: { VAR: { name: '兵' } } }),
  SB('w_forin', { inputs: { O: { block: { type: 'w_g_creeps' } } } }), SB('controls_repeat_ext', { inputs: { TIMES: N(3) } }), SB('controls_whileUntil'),
  SB('controls_for', { inputs: { FROM: N(1), TO: N(10), BY: N(1) } }), SB('controls_flow_statements'));
CAT.math.push(SB('math_number'), SB('math_arithmetic', { inputs: { A: N(1), B: N(1) } }), SB('math_single', { inputs: { NUM: N(9) } }), SB('math_round', { inputs: { NUM: N(3.1) } }),
  SB('math_modulo', { inputs: { DIVIDEND: N(64), DIVISOR: N(10) } }), SB('math_constrain', { inputs: { VALUE: N(50), LOW: N(1), HIGH: N(100) } }), SB('math_on_list'),
  SB('math_random_int', { inputs: { FROM: N(1), TO: N(100) } }), SB('math_random_float'), SB('math_number_property', { inputs: { NUMBER_TO_CHECK: N(0) } }), SB('math_constant'));
CAT.text.push(SB('text'), SB('text_join'), SB('text_append', { inputs: { TEXT: TX('') } }), SB('text_length', { inputs: { VALUE: TX('abc') } }), SB('text_isEmpty', { inputs: { VALUE: TX('') } }),
  SB('text_indexOf', { inputs: { FIND: TX('a') } }), SB('text_charAt'), SB('text_getSubstring'), SB('text_changeCase', { inputs: { TEXT: TX('abc') } }), SB('text_trim', { inputs: { TEXT: TX(' abc ') } }),
  { kind: 'block', type: 'w_log', inputs: { A0: PRE('s:你好') } });
CAT.list.push(SB('lists_create_empty'), SB('lists_create_with'), SB('lists_repeat', { inputs: { NUM: N(5) } }), SB('lists_length'), SB('lists_isEmpty'), SB('lists_indexOf'),
  SB('lists_getIndex'), SB('lists_setIndex'), SB('lists_getSublist'), SB('lists_split', { inputs: { DELIM: TX(',') } }), SB('lists_sort'), SB('lists_reverse'));
CAT.data.unshift(SB('w_forin', { inputs: { O: { block: { type: 'w_g_creeps' } } } }));
CATS.forEach(c => { if (c.custom) delete CAT[c.id]; });
Object.assign(Blockly.Msg, { NEW_VARIABLE: '＋ 新建变量', NEW_VARIABLE_TITLE: '变量名字（可以用中文）：', PROCEDURES_DEFNORETURN_PROCEDURE: '做某事', PROCEDURES_DEFRETURN_PROCEDURE: '算某值',
  PROCEDURES_DEFNORETURN_TITLE: '定义函数', PROCEDURES_DEFRETURN_TITLE: '定义函数', PROCEDURES_BEFORE_PARAMS: '参数：', PROCEDURES_CALL_BEFORE_PARAMS: '参数：', PROCEDURES_DEFRETURN_RETURN: '返回' });
function flyoutFor(c) { return c.custom ? c.custom : CAT[c.id] || []; }

// ---------- 默认入门程序（全部用上面的官方 API 积木拼成） ----------
const B = (type, fields, inputs, extra) => ({ block: Object.assign({ type }, fields ? { fields } : {}, inputs ? { inputs } : {}, extra || {}) });
const V = n => B('variables_get', { VAR: { name: n } });
const SET = (n, v) => B('variables_set', { VAR: { name: n } }, { VALUE: v });
const NUM = n => B('math_number', { NUM: n });
const chain = (...L) => { L = L.filter(Boolean); for (let i = L.length - 2; i >= 0; i--) L[i].block.next = L[i + 1]; return L[0]; };
const EQ = (a, b2, op = 'EQ') => B('logic_compare', { OP: op }, { A: a, B: b2 });
const IF = (cond, then, els) => B('controls_if', null, Object.assign({ IF0: cond, DO0: then }, els ? { ELSE: els } : {}), els ? { extraState: { hasElse: true } } : undefined);
const RES = B('w_result'), FAR = B('w_k_err', { K: 'ERR_NOT_IN_RANGE' });
const P_ = (prop, o) => B('w_p_' + prop, null, { O: o });
const goIfFar = (act, target) => [act, IF(EQ(RES, FAR), B('w_c_moveto', null, { O: V('兵'), A0: target }))];
const roleIs = r => EQ(B('w_role_of', null, { O: V('兵') }), B('w_role_name', { ROLE: r }));
const each = (list, body) => B('controls_forEach', { VAR: { name: '兵' } }, { LIST: B('w_obj_values', null, { A0: list }), DO: body });
const spawnRole = r => B('w_s_spawn', null, { O: V('基地'), A0: B('w_role_body', { ROLE: r }),
  A1: B('text_join', null, { ADD0: B('w_role_name', { ROLE: r }), ADD1: B('w_g_time') }, { extraState: { itemCount: 2 } }), A2: B('w_opt_spawn', null, { A0: B('w_role_mem', { ROLE: r }), A1: B('logic_boolean', { BOOL: 'FALSE' }) }) });
const count = r => IF(roleIs(r), B('math_change', { VAR: { name: r + '数' } }, { DELTA: B('math_number', { NUM: 1 }) }));
const setWork = (cond, v) => IF(cond, B('w_obj_set', null, { O: P_('memory', V('兵')), A0: B('text', { TEXT: 'working' }), A1: B('logic_boolean', { BOOL: v }) }));
const ENERGY = B('w_k_res', { K: 'RESOURCE_ENERGY' });
const UPG = B('procedures_callnoreturn', null, { ARG0: V('兵') }, { extraState: { name: '去升级控制器', params: ['兵'] } });
const MAIN = chain(
  SET('基地', B('lists_getIndex', { MODE: 'GET', WHERE: 'FIRST' }, { VALUE: B('w_obj_values', null, { A0: B('w_g_spawns') }) })),
  SET('采集者数', NUM(0)), SET('升级者数', NUM(0)), SET('建造者数', NUM(0)),
  each(B('w_g_creeps'), chain(count('采集者'), count('升级者'), count('建造者'))),
  B('controls_if', null, { IF0: EQ(V('采集者数'), NUM(2), 'LT'), DO0: spawnRole('采集者'), IF1: EQ(V('升级者数'), NUM(2), 'LT'), DO1: spawnRole('升级者'), IF2: EQ(V('建造者数'), NUM(1), 'LT'), DO2: spawnRole('建造者') }, { extraState: { elseIfCount: 2 } }),
  each(B('w_g_creeps'), chain(
    setWork(EQ(B('w_store_used', null, { O: P_('store', V('兵')), A0: ENERGY }), NUM(0)), 'FALSE'),
    setWork(EQ(B('w_store_free', null, { O: P_('store', V('兵')), A0: ENERGY }), NUM(0)), 'TRUE'),
    IF(B('logic_negate', null, { BOOL: B('w_obj_get', null, { O: P_('memory', V('兵')), A0: B('text', { TEXT: 'working' }) }) }),
      chain(SET('目标', B('w_pos_closestpath', null, { O: P_('pos', V('兵')), A0: B('w_k_find', { K: 'FIND_SOURCES_ACTIVE' }) })),
        ...goIfFar(B('w_c_harvest', null, { O: V('兵'), A0: V('目标') }), V('目标'))),
      B('controls_if', null, {
        IF0: roleIs('采集者'), DO0: chain(B('w_c_transfer', null, { O: V('兵'), A0: V('基地'), A1: ENERGY }),
          B('controls_if', null, { IF0: EQ(RES, FAR), DO0: B('w_c_moveto', null, { O: V('兵'), A0: V('基地') }), IF1: EQ(RES, B('w_k_err', { K: 'ERR_FULL' })), DO1: UPG }, { extraState: { elseIfCount: 1 } })),
        IF1: roleIs('建造者'), DO1: chain(SET('目标', B('w_pos_closestpath', null, { O: P_('pos', V('兵')), A0: B('w_k_find', { K: 'FIND_MY_CONSTRUCTION_SITES' }) })),
          IF(B('w_exists', null, { O: V('目标') }), chain(...goIfFar(B('w_c_build', null, { O: V('兵'), A0: V('目标') }), V('目标'))), JSON.parse(JSON.stringify(UPG)))),
        ELSE: JSON.parse(JSON.stringify(UPG)),
      }, { extraState: { elseIfCount: 1, hasElse: true } })),
  )),
);
const UPG_FN = B('procedures_defnoreturn', { NAME: '去升级控制器' }, { STACK: chain(...goIfFar(B('w_c_upgrade', null, { O: V('兵'), A0: P_('controller', P_('room', V('兵'))) }), P_('controller', P_('room', V('兵'))))) },
  { extraState: { params: [{ name: '兵' }] } });
let DEFAULT_WS = { blocks: { languageVersion: 0, blocks: [Object.assign(UPG_FN.block, { x: 16, y: 16 }), Object.assign(MAIN.block, { x: 16, y: 240 })] },
  sbmRoles: [{ name: '采集者', body: 'work,carry,move' }, { name: '升级者', body: 'work,carry,move' }, { name: '建造者', body: 'work,carry,move' }] };

// ---------- 载入存档：旧版积木（新手 / 高级）已不再使用 → 旧程序存进历史版本，身份保留，换成新的入门程序 ----------
function stateTypes(st) { const out = new Set(); (function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o.type === 'string' && (o.fields || o.inputs || o.next || o.id || o.x != null || o.extraState || Object.keys(o).length <= 3)) out.add(o.type); for (const k in o) if (k !== 'fields') walk(o[k]); })(st && st.blocks); return [...out]; }
function sbmLoadWs(state, ws) {
  state = migrateState(state);
  const bad = stateTypes(state).filter(t => !Blockly.Blocks[t]);
  if (!bad.length) { Blockly.serialization.workspaces.load(state, ws); return 'ok'; }
  const st = JSON.stringify(state);
  try { const L = JSON.parse(localStorage.getItem('sbm_code_hist') || '[]'); if (!L.some(h => h.st === st)) { L.unshift({ ts: Date.now(), reason: '旧版积木程序', n: (st.match(/"type"/g) || []).length, st }); while (L.length > 20) L.pop(); localStorage.setItem('sbm_code_hist', JSON.stringify(L)); } } catch (e) {}
  const roles = (state.sbmRoles || []).slice(); for (const r of DEFAULT_WS.sbmRoles) if (!roles.some(x => x.name === r.name)) roles.push(r);
  Blockly.serialization.workspaces.load(Object.assign({}, DEFAULT_WS, { sbmRoles: roles }), ws);
  setTimeout(() => { try { toastMsg('积木已全面更新，旧程序放在历史版本里，已换成新的入门程序'); } catch (e) {} }, 800);
  return 'converted';
}
if (typeof window !== 'undefined') window.sbmLoadWs = sbmLoadWs;

// ---------- 程序说明（积木上的中文） ----------
function describe(ws) {
  const out = [];
  const txt = b => b.toString().replace(/\s+/g, ' ').trim();
  function line(b, d) {
    if (!b || (b.isEnabled && !b.isEnabled())) return; const ind = '  '.repeat(d);
    const stmts = b.inputList.filter(i => i.type === Blockly.inputs.inputTypes.STATEMENT);
    if (!stmts.length) { out.push(ind + txt(b)); return; }
    let head = []; for (const inp of b.inputList) { if (inp.type === Blockly.inputs.inputTypes.STATEMENT) { out.push(ind + (head.join(' ').trim() || txt(b).slice(0, 40)) + '：'); head = []; let x = inp.connection.targetBlock(); while (x) { line(x, d + 1); x = x.getNextBlock(); } }
      else { head.push(inp.fieldRow.map(f => f.getText()).join(' ')); const t = inp.connection && inp.connection.targetBlock(); if (t) head.push(txt(t)); } }
  }
  for (const top of ws.getTopBlocks(true)) { let b = top; while (b) { line(b, 0); b = b.getNextBlock(); } }
  return out.length ? out : ['（还没有积木）'];
}
window.describeProgram = describe;
window.highlightJS = function (src) {
  const e = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const re = /(\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`)|\b(const|let|var|function|for|in|of|if|else|return|continue|break|new|while|true|false|null|undefined|delete)\b|\b([A-Z][A-Z0-9_]{2,})\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = '', i = 0, m;
  while ((m = re.exec(src))) { out += e(src.slice(i, m.index)); const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'K' : 'n'; out += `<span class="hl${cls}">${e(m[0])}</span>`; i = re.lastIndex; }
  return out + e(src.slice(i));
};
const AB = { CATS, CAT, API, BLOCKS, CZH, flyoutFor, DEFAULT_WS, sbmLoadWs };
if (typeof window !== 'undefined') window.AB = AB;

Object.assign(window, { CATS, flyoutFor, DEFAULT_WS, sbmLoadWs, AB });
})();
