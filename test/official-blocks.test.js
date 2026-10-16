// 官方 API 积木（对齐 docs.screeps.com/api）：覆盖率、中文显示、无打包助手、每块都能生成可运行代码、
// 结果码、变量跨回合保留、带参数/返回值的函数、自定义身份、旧存档转换、入门程序能直接作为官方 main 模块运行
// （App 不再有本地引擎；这里用最小的 Game/Memory 桩按官方方式 require 模块并调用 loop，真实运行见 online-ui.cjs 连私服的测试）
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('geo.js'));
// 按官方运行方式加载 main 模块：模块顶层只跑一次，之后每回合调用 module.exports.loop()
const runMain = (code, ticks, G = {}) => { const Memory = G.Memory || {}, logs = []; const ctx = vm.createContext(Object.assign({}, SC_GLOBALS(), { Memory, Game: G.Game || { time: 1, creeps: {}, spawns: {}, rooms: {}, flags: {}, cpu: { getUsed: () => 0, tickLimit: 500, limit: 20, bucket: 10000 } }, console: { log: (...a) => logs.push(a.join(' ')) } }));
  const mod = { exports: {} }; vm.runInContext('(function (module, exports) {\n' + code + '\n})', ctx)(mod, mod.exports);
  for (let i = 0; i < ticks; i++) { ctx.Game.time++; mod.exports.loop(); } return { Memory, logs, mod }; };
function SC_GLOBALS() { const o = {}; for (const k of Object.getOwnPropertyNames(globalThis)) if (/^[A-Z][A-Z0-9_]+$/.test(k)) o[k] = globalThis[k]; return o; }
const LS = {}; global.localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
let toasts = []; global.toastMsg = m => toasts.push(m);
global.window = globalThis; global.Blockly = require('blockly'); Blockly.JavaScript = require('blockly/javascript').javascriptGenerator;
require('blockly/msg/zh-hans');
const SRC = W('blocks.js'); vm.runInThisContext(SRC);
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const JSG = Blockly.JavaScript, gen = ws => JSG.workspaceToCode(ws);
const load = st => { const ws = new Blockly.Workspace(); sbmLoadWs(st, ws); return ws; };

// ---- 覆盖率：清单里每个官方 API 都有放在分类里的积木 ----
const md = fs.readFileSync(path.join(__dirname, '../docs/OFFICIAL_COVERAGE.md'), 'utf8');
const keys = md.match(/```api\n([\s\S]*?)```/)[1].split(/\s+/).filter(Boolean);
const inCat = new Set(Object.values(AB.CAT).flat().filter(e => e.kind === 'block').map(e => e.type));
const resolve = k => { if (AB.API[k]) return AB.API[k]; const i = k.lastIndexOf('.'), c = k.slice(0, i), m = k.slice(i + 1);
  if (/^(Structure|OwnedStructure)/.test(c) && AB.API['Structure.' + m]) return AB.API['Structure.' + m];
  if (/^[A-Z]/.test(c) && !/^(Game|PathFinder|RawMemory|InterShardMemory|const)\b/.test(c)) return AB.API['*.' + m]; return null; };
const missing = keys.filter(k => !(resolve(k) || []).some(t => Blockly.Blocks[t] && inCat.has(t)));
const nConst = keys.filter(k => k.startsWith('const.')).length;
assert(keys.length > 1000 && nConst === 423, `清单 ${keys.length} 个官方 API 键（常量 ${nConst} 个）`);
assert(!missing.length, '每个官方 API 都有积木' + (missing.length ? '：缺 ' + missing.join(' ') : ''));
for (const k of ['Creep.harvest', 'StructureSpawn.spawnCreep', 'Room.find', 'PathFinder.search', 'Game.market.deal', 'RawMemory.setActiveSegments', 'InterShardMemory.getRemote', 'Game.map.visual.text', 'PowerCreep.usePower', 'const.ERR_NOT_IN_RANGE', 'const.BODYPART_COST'])
  assert(keys.includes(k), '清单含 ' + k);
const nBlocks = Object.keys(AB.BLOCKS).length; console.log(`  积木 ${nBlocks} 块，覆盖官方键 ${keys.length - missing.length}/${keys.length}`);

// ---- 分类 ----
assert(JSON.stringify(AB.CATS.map(c => c.name)) === JSON.stringify(['游戏', '查找', '属性', '兵', '超能兵', '孵化', '建筑', '房间', '位置与寻路', '地图', '市场', '记忆', '常量', '判断', '循环', '数字', '文字', '列表', '数据表', '变量', '函数']), '21 个分类，顺序固定');
for (const c of AB.CATS) if (!c.custom) assert(AB.CAT[c.id].some(e => e.kind === 'block'), `分类「${c.name}」有积木`);
assert(!AB.CATS.some(c => c.adv), '没有「新手 / 高级」之分');

// ---- 积木上只有中文：不出现函数名、常量名、点号、括号 ----
const bad = [];
for (const t of Object.keys(AB.BLOCKS)) { const b = new Blockly.Workspace().newBlock(t);
  const txt = b.inputList.map(i => i.fieldRow.map(f => f.getText ? f.getText() : '').join(' ')).join(' ');
  if (/[A-Za-z]{2,}|[._()[\]{}=]/.test(txt.replace(/化合物 [A-Z0-9]+/g, ''))) bad.push(t + ': ' + txt);
  for (const inp of b.inputList) for (const f of inp.fieldRow) if (f.getOptions && !(f instanceof Blockly.FieldVariable)) for (const [o] of f.getOptions(false)) if (typeof o === 'string' && /[a-z]{2,}|[A-Z]{2,}_|[._(){}]/.test(o.replace(/化合物 [A-Z0-9]+/, ''))) bad.push(t + ' 选项: ' + o); }
assert(!bad.length, `${nBlocks} 块积木的文字与下拉选项都是中文` + (bad.length ? '\n' + bad.slice(0, 30).join('\n') : ''));
assert(AB.CAT.find.some(e => e.type === 'w_room_find') && /可不填/.test(Blockly.Msg && new Blockly.Workspace().newBlock('w_room_find').toString()), '可以不填的参数标「可不填」');

// ---- 没有打包好的助手积木 ----
for (const w of ['保持 %1', '靠近并攻击', '采集并送回', 'sbmKeep', 'sbmDo', 'sbmCycle', '积木助手']) assert(!SRC.includes(w), '没有 ' + w);
assert(!Object.keys(Blockly.Blocks).some(t => /^e_/.test(t)), '旧的新手积木已全部去掉');

// ---- 抽屉里每块积木都能放进程序并通过编译 ----
let n = 0;
for (const e of Object.values(AB.CAT).flat()) { if (e.kind !== 'block') continue;
  const ws = new Blockly.Workspace(); const b = Blockly.serialization.blocks.append(Object.assign({}, e, { kind: undefined }), ws);
  if (e.type === 'controls_flow_statements') { const lp = ws.newBlock('controls_whileUntil'); lp.getInput('DO').connection.connect(b.previousConnection); }
  else if (b.outputConnection) { const s = ws.newBlock('w_log'); s.getInput('A0').connection.connect(b.outputConnection); }
  const code = gen(ws); try { new Function('module', 'exports', 'require', code); } catch (err) { assert(false, e.type + ' 编译失败: ' + err.message + '\n' + code); } n++; }
assert(n > 400, `抽屉里 ${n} 块积木都能生成可编译的代码`);

// ---- 生成的代码就是官方 API；动作结果存进「上一个动作的结果」；可不填的参数不传 ----
{ const ws = new Blockly.Workspace(); const st = { blocks: { languageVersion: 0, blocks: [
  { type: 'w_c_transfer', inputs: { O: { block: { type: 'variables_get', fields: { VAR: { name: '兵' } } } }, A0: { block: { type: 'w_g_spawn', inputs: { A0: { block: { type: 'text', fields: { TEXT: 'Spawn1' } } } } } }, A1: { block: { type: 'w_k_res', fields: { K: 'RESOURCE_ENERGY' } } } },
    next: { block: { type: 'w_log', inputs: { A0: { block: { type: 'logic_compare', fields: { OP: 'EQ' }, inputs: { A: { block: { type: 'w_result' } }, B: { block: { type: 'w_k_err', fields: { K: 'OK' } } } } } } } } } }] } };
  Blockly.serialization.workspaces.load(st, ws); const c = gen(ws); if (process.env.DBG) console.log(c);
  assert(/__r = 兵\?\.transfer\(Game\.spawns\['Spawn1'\], RESOURCE_ENERGY\);/.test(c), '动作 → 官方调用，结果存进 __r，可不填的数量没传');
  assert(/console\.log\(__r == OK\)/.test(c) && /module\.exports\.loop = function/.test(c), '结果可与返回码比较；程序放进 module.exports.loop'); }

// ---- 变量跨回合保留、带参数和返回值的函数 ----
{ const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
    { type: 'procedures_defreturn', fields: { NAME: '加倍' }, extraState: { params: [{ name: '数' }] }, inputs: { RETURN: { block: { type: 'math_arithmetic', fields: { OP: 'MULTIPLY' }, inputs: { A: { block: { type: 'variables_get', fields: { VAR: { name: '数' } } } }, B: { block: { type: 'math_number', fields: { NUM: 2 } } } } } } } },
    { type: 'math_change', fields: { VAR: { name: '计数' } }, inputs: { DELTA: { block: { type: 'math_number', fields: { NUM: 1 } } } },
      next: { block: { type: 'w_mem_set', inputs: { A0: { block: { type: 'text', fields: { TEXT: '结果' } } }, A1: { block: { type: 'procedures_callreturn', extraState: { name: '加倍', params: ['数'] }, inputs: { ARG0: { block: { type: 'variables_get', fields: { VAR: { name: '计数' } } } } } } } } } } }] } }, ws);
  const code = gen(ws); assert(/function 加倍\(数\)/.test(code) && /return 数 \* 2/.test(code), '函数带参数和返回值，名字保留中文');
  const r = runMain(code, 3);
  assert(r.Memory.结果 === 6, '变量跨回合保留（第 3 回合 计数=3 → 加倍=6）：' + JSON.stringify(r.Memory.结果)); }

// ---- 自定义身份与身体部件面板 ----
{ const ws = new Blockly.Workspace(); sbmSetRoles([]);
  Blockly.serialization.workspaces.load({ sbmRoles: [{ name: '前锋', body: 'attack,attack,move,move' }], blocks: { languageVersion: 0, blocks: [{ type: 'w_s_spawn', inputs: { O: { block: { type: 'variables_get', fields: { VAR: { name: '基地' } } } }, A0: { block: { type: 'w_role_body', fields: { ROLE: '前锋' } } }, A1: { block: { type: 'w_role_name', fields: { ROLE: '前锋' } } }, A2: { block: { type: 'w_opt_spawn', inputs: { A0: { block: { type: 'w_role_mem', fields: { ROLE: '前锋' } } } } } } } }] } }, ws);
  assert(/spawnCreep\(\[ATTACK, ATTACK, MOVE, MOVE\], "前锋", \{ memory: \{ role: "前锋" \} \}\)/.test(gen(ws)), '身份 → 官方身体部件数组和孵化选项');
  assert(!/'(战士|工人)'/.test(SRC) && sbmRoles().length === 1, '没有内置身份，只有玩家建的');
  const body = new Blockly.Workspace().newBlock('w_body'); body.setFieldValue('work,work,carry,move', 'B'); assert(JSG.forBlock.w_body(body)[0] === '[WORK, WORK, CARRY, MOVE]', '身体部件面板 → 官方常量数组'); }

// ---- 旧存档：旧版积木的程序进历史版本，身份保留，换成新的入门程序 ----
{ const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/adv-old-save.json'), 'utf8'));
  const old = Object.assign({}, FX.save, { sbmRoles: [{ name: '矿工', body: 'work,work,move' }] }); toasts = [];
  const ws = new Blockly.Workspace(); const r = sbmLoadWs(old, ws);
  const H = JSON.parse(LS.sbm_code_hist || '[]');
  assert(r === 'converted' && H[0] && H[0].reason === '旧版积木程序', '旧版积木程序存进历史版本');
  assert(sbmRoles().some(x => x.name === '矿工') && sbmRoles().some(x => x.name === '采集者'), '旧程序里的身份保留，入门程序的身份也在');
  assert(ws.getAllBlocks(false).length > 50 && ws.getAllBlocks(false).every(b => AB.BLOCKS[b.type] || /^(controls|logic|math|text|lists|variables|procedures)(_|$)/.test(b.type)), '换成用新积木写的入门程序');
  const legacy = { blocks: { languageVersion: 0, blocks: [{ type: 'w_role_body', fields: { ROLE: 'harvester' } }] } }; sbmLoadWs(legacy, new Blockly.Workspace());
  assert(sbmRoles().some(x => x.name === '采集者'), '更早的英文身份名转成中文身份'); }

// ---- 入门程序：只用新积木，在引擎里跑通 ----
{ const ws = load(DEFAULT_WS); const code = gen(ws);
  assert(ws.getAllBlocks(false).every(b => AB.BLOCKS[b.type] || /^(controls|logic|math|text|lists|variables|procedures)(_|$)/.test(b.type)), '入门程序只用新积木');
  assert(/spawnCreep\(/.test(code) && /harvest\(/.test(code) && /upgradeController\(/.test(code) && /function 去升级控制器\(兵\)/.test(code), '入门程序：孵化、采集、升级，带一个函数');
  assert(describeProgram(ws).some(l => /采集者/.test(l)), '程序说明是中文');
  assert(/module\.exports\.loop = function/.test(code), '入门程序是官方 main 模块（module.exports.loop）');
  let err = null; try { runMain(code, 3); } catch (e) { err = e; }
  assert(!err, '入门程序按官方方式加载并跑 3 回合没有报错（没有引用本地才有的辅助函数）' + (err ? '：' + err.message : ''));
  // 循环保护：只用官方 Game.cpu，CPU 快用完时抛错停下
  const g = { time: 1, creeps: {}, spawns: {}, rooms: {}, flags: {}, cpu: { getUsed: () => 499, tickLimit: 500 } }; let thrown = null;
  if (/__loopGuard\(\)/.test(code)) { try { runMain(code, 1, { Game: Object.assign(g, { creeps: { a: { memory: {}, store: { getUsedCapacity: () => 0 } } } }) }); } catch (e) { thrown = e; }
    assert(thrown && /CPU/.test(thrown.message), '循环保护在 CPU 快用完时停下：' + (thrown && thrown.message)); } }
console.log('ok - official-blocks');
