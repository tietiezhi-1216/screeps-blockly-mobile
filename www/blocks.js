// 自定义 Screeps 积木 + JS 生成器
const JS = Blockly.JavaScript;
const C = 230, S = 160, Q = 20;
Blockly.defineBlocksWithJsonArray([
  { type: 'sc_each_creep', message0: '对每个 creep %1 执行 %2 %3', args0: [{ type: 'field_variable', name: 'VAR', variable: 'creep' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: C, tooltip: '遍历 Game.creeps' },
  { type: 'sc_harvest', message0: '%1 去最近的能量源采集', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_transfer_spawn', message0: '%1 把能量送回 Spawn1', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_build', message0: '%1 去建造最近的工地', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_moveto', message0: '%1 移动到 x %2 y %3', args0: [{ type: 'input_value', name: 'C' }, { type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_say', message0: '%1 说 %2', args0: [{ type: 'input_value', name: 'C' }, { type: 'input_value', name: 'T' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_is', message0: '%1 %2', args0: [{ type: 'input_value', name: 'C' }, { type: 'field_dropdown', name: 'K', options: [['能量满了', 'full'], ['能量空了', 'empty']] }], output: 'Boolean', colour: C, inputsInline: true },
  { type: 'sc_mem_get', message0: '%1 的记忆 %2', args0: [{ type: 'input_value', name: 'C' }, { type: 'field_input', name: 'K', text: 'working' }], output: null, colour: C, inputsInline: true },
  { type: 'sc_mem_set', message0: '设置 %1 的记忆 %2 = %3', args0: [{ type: 'input_value', name: 'C' }, { type: 'field_input', name: 'K', text: 'working' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_creep_prop', message0: '%1 的 %2', args0: [{ type: 'input_value', name: 'C' }, { type: 'field_dropdown', name: 'K', options: [['携带能量', 'energy'], ['剩余寿命', 'ttl'], ['x', 'x'], ['y', 'y'], ['名字', 'name']] }], output: null, colour: C, inputsInline: true },
  { type: 'sc_spawn', message0: 'Spawn1 生产 creep 身体 %1', args0: [{ type: 'field_dropdown', name: 'B', options: [['[WORK,CARRY,MOVE] 200', 'work,carry,move'], ['[WORK,WORK,CARRY,MOVE] 300', 'work,work,carry,move'], ['[WORK,CARRY,CARRY,MOVE,MOVE] 300', 'work,carry,carry,move,move'], ['[WORK×2,CARRY×2,MOVE×2] 400', 'work,work,carry,carry,move,move']] }], previousStatement: null, nextStatement: null, colour: S },
  { type: 'sc_spawn_energy', message0: 'Spawn1 能量', output: 'Number', colour: S },
  { type: 'sc_creep_count', message0: 'creep 数量', output: 'Number', colour: S },
  { type: 'sc_site_count', message0: '工地数量', output: 'Number', colour: S },
  { type: 'sc_site', message0: '在 Spawn1 偏移 dx %1 dy %2 放置工地 %3', args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }, { type: 'field_dropdown', name: 'T', options: [['扩展 extension', 'extension'], ['道路 road', 'road']] }], previousStatement: null, nextStatement: null, colour: S, inputsInline: true },
  { type: 'sc_time', message0: '当前 tick', output: 'Number', colour: Q },
  { type: 'sc_log', message0: '打印日志 %1', args0: [{ type: 'input_value', name: 'T' }], previousStatement: null, nextStatement: null, colour: Q },
]);
const v = (b, n, d = 'null') => JS.valueToCode(b, n, JS.ORDER_NONE) || d;
const G = {
  sc_each_creep: b => { const n = JS.nameDB_.getName(b.getFieldValue('VAR'), Blockly.Names.NameType.VARIABLE); return `for (const __name in Game.creeps) {\n  ${n} = Game.creeps[__name];\n${JS.statementToCode(b, 'DO')}}\n`; },
  sc_harvest: b => `(function (c) {\n  const src = c.pos.findClosestByPath(FIND_SOURCES);\n  if (src && c.harvest(src) === ERR_NOT_IN_RANGE) c.moveTo(src);\n})(${v(b, 'C')});\n`,
  sc_transfer_spawn: b => `(function (c) {\n  const sp = Game.spawns['Spawn1'];\n  if (c.transfer(sp, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) c.moveTo(sp);\n})(${v(b, 'C')});\n`,
  sc_build: b => `(function (c) {\n  const site = c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);\n  if (site && c.build(site) === ERR_NOT_IN_RANGE) c.moveTo(site);\n})(${v(b, 'C')});\n`,
  sc_moveto: b => `${v(b, 'C')}.moveTo(${v(b, 'X', 0)}, ${v(b, 'Y', 0)});\n`,
  sc_say: b => `${v(b, 'C')}.say(${v(b, 'T', "''")});\n`,
  sc_is: b => [b.getFieldValue('K') === 'full' ? `(${v(b, 'C')}.store.getFreeCapacity() === 0)` : `(${v(b, 'C')}.store.energy === 0)`, JS.ORDER_ATOMIC],
  sc_mem_get: b => [`${v(b, 'C')}.memory[${JSON.stringify(b.getFieldValue('K'))}]`, JS.ORDER_MEMBER],
  sc_mem_set: b => `${v(b, 'C')}.memory[${JSON.stringify(b.getFieldValue('K'))}] = ${v(b, 'V')};\n`,
  sc_creep_prop: b => { const k = b.getFieldValue('K'), c = v(b, 'C'); return [{ energy: `${c}.store.energy`, ttl: `${c}.ticksToLive`, x: `${c}.pos.x`, y: `${c}.pos.y`, name: `${c}.name` }[k], JS.ORDER_MEMBER]; },
  sc_spawn: b => `Game.spawns['Spawn1'].spawnCreep([${b.getFieldValue('B').split(',').map(x => x.toUpperCase()).join(', ')}], 'creep' + Game.time);\n`,
  sc_spawn_energy: () => [`Game.spawns['Spawn1'].store.energy`, JS.ORDER_MEMBER],
  sc_creep_count: () => [`Object.keys(Game.creeps).length`, JS.ORDER_MEMBER],
  sc_site_count: () => [`Game.spawns['Spawn1'].pos.find(FIND_CONSTRUCTION_SITES).length`, JS.ORDER_MEMBER],
  sc_site: b => `Game.createConstructionSite(Game.spawns['Spawn1'].pos.x + (${v(b, 'X', 0)}), Game.spawns['Spawn1'].pos.y + (${v(b, 'Y', 0)}), '${b.getFieldValue('T')}');\n`,
  sc_time: () => ['Game.time', JS.ORDER_MEMBER],
  sc_log: b => `console.log(${v(b, 'T', "''")});\n`,
};
for (const k in G) JS.forBlock[k] = G[k];
JS.INFINITE_LOOP_TRAP = '__loopGuard();\n';

const TOOLBOX = { kind: 'categoryToolbox', contents: [
  { kind: 'category', name: '🐜 Creep', colour: C, contents: ['sc_each_creep', 'sc_harvest', 'sc_transfer_spawn', 'sc_build', 'sc_moveto', 'sc_say', 'sc_is', 'sc_mem_get', 'sc_mem_set', 'sc_creep_prop'].map(t => ({ kind: 'block', type: t })) },
  { kind: 'category', name: '🏠 基地', colour: S, contents: ['sc_spawn', 'sc_spawn_energy', 'sc_creep_count', 'sc_site_count', 'sc_site', 'sc_time', 'sc_log'].map(t => ({ kind: 'block', type: t })) },
  { kind: 'category', name: '❓ 逻辑', categorystyle: 'logic_category', contents: ['controls_if', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean'].map(t => ({ kind: 'block', type: t })) },
  { kind: 'category', name: '🔁 循环', categorystyle: 'loop_category', contents: ['controls_repeat_ext', 'controls_whileUntil', 'controls_for'].map(t => ({ kind: 'block', type: t })) },
  { kind: 'category', name: '🔢 数学', categorystyle: 'math_category', contents: ['math_number', 'math_arithmetic', 'math_random_int', 'math_modulo'].map(t => ({ kind: 'block', type: t })) },
  { kind: 'category', name: '🔤 文本', categorystyle: 'text_category', contents: ['text', 'text_join'].map(t => ({ kind: 'block', type: t })) },
  { kind: 'category', name: '📦 变量', categorystyle: 'variable_category', custom: 'VARIABLE' },
  { kind: 'category', name: '🧩 函数', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
] };

// 默认程序：故意保持最小——只生产 creep 并让它们采集，剩下的交给玩家
const DEFAULT_WS = { blocks: { languageVersion: 0, blocks: [{ type: 'sc_spawn', x: 20, y: 20, fields: { B: 'work,carry,move' },
  next: { block: { type: 'sc_each_creep', fields: { VAR: { name: 'creep' } }, inputs: { DO: { block: { type: 'sc_harvest', inputs: { C: { block: { type: 'variables_get', fields: { VAR: { name: 'creep' } } } } } } } } } } }] } };
