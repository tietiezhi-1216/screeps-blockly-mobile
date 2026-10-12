// 自定义 Screeps 积木 + JS 生成器
const JS = Blockly.JavaScript;
const C = 230, S = 160, Q = 20, T = 0; // T for tower category colour via style
Blockly.defineBlocksWithJsonArray([
  { type: 'sc_each_creep', message0: '对每个 creep %1 执行 %2 %3', args0: [{ type: 'field_variable', name: 'VAR', variable: 'creep' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: C },
  { type: 'sc_harvest', message0: '%1 去最近的能量源采集', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_transfer_spawn', message0: '%1 把能量送回 Spawn1', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_build', message0: '%1 去建造最近的工地', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_upgrade', message0: '%1 去升级房间 Controller', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
  { type: 'sc_repair', message0: '%1 去修理最近的己方建筑', args0: [{ type: 'input_value', name: 'C' }], previousStatement: null, nextStatement: null, colour: C, inputsInline: true },
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
  { type: 'sc_rcl', message0: '本房间 Controller 等级', output: 'Number', colour: S },
  { type: 'sc_ctrl_progress', message0: 'Controller 升级进度', output: 'Number', colour: S },
  { type: 'sc_site', message0: '在 Spawn1 偏移 dx %1 dy %2 放置工地 %3', args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }, { type: 'field_dropdown', name: 'T', options: [
    ['扩展 extension (RCL2+)', 'extension'], ['道路 road', 'road'], ['围墙 wall', 'constructedWall'], ['城墙 rampart', 'rampart'],
    ['防御塔 tower (RCL3+)', 'tower'], ['容器 container', 'container'], ['仓储 storage (RCL4+)', 'storage'], ['Spawn (RCL7+)', 'spawn']
  ] }], previousStatement: null, nextStatement: null, colour: S, inputsInline: true },
  { type: 'sc_tower_attack', message0: '用最近的塔攻击最近的敌方 creep', previousStatement: null, nextStatement: null, colour: 0 },
  { type: 'sc_tower_repair', message0: '用最近的塔修理最近的己方建筑', previousStatement: null, nextStatement: null, colour: 0 },
  { type: 'sc_tower_heal', message0: '用最近的塔治疗最近的己方 creep', previousStatement: null, nextStatement: null, colour: 0 },
  { type: 'sc_time', message0: '当前 tick', output: 'Number', colour: Q },
  { type: 'sc_log', message0: '打印日志 %1', args0: [{ type: 'input_value', name: 'T' }], previousStatement: null, nextStatement: null, colour: Q },
]);
const v = (b, n, d = 'null') => JS.valueToCode(b, n, JS.ORDER_NONE) || d;
const myCtrl = `Object.values(Game.rooms).map(r=>r.controller).find(c=>c&&c.my)`;
const G = {
  sc_each_creep: b => { const n = JS.nameDB_.getName(b.getFieldValue('VAR'), Blockly.Names.NameType.VARIABLE); return `for (const __name in Game.creeps) {\n  ${n} = Game.creeps[__name];\n${JS.statementToCode(b, 'DO')}}\n`; },
  sc_harvest: b => `(function (c) {\n  const src = c.pos.findClosestByPath(FIND_SOURCES);\n  if (src && c.harvest(src) === ERR_NOT_IN_RANGE) c.moveTo(src);\n})(${v(b, 'C')});\n`,
  sc_transfer_spawn: b => `(function (c) {\n  const sp = Game.spawns['Spawn1'];\n  if (c.transfer(sp, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) c.moveTo(sp);\n})(${v(b, 'C')});\n`,
  sc_build: b => `(function (c) {\n  const site = c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);\n  if (site && c.build(site) === ERR_NOT_IN_RANGE) c.moveTo(site);\n})(${v(b, 'C')});\n`,
  sc_upgrade: b => `(function (c) {\n  const ctrl = ${myCtrl};\n  if (ctrl && c.upgradeController(ctrl) === ERR_NOT_IN_RANGE) c.moveTo(ctrl);\n})(${v(b, 'C')});\n`,
  sc_repair: b => `(function (c) {\n  const st = c.pos.findClosestByPath(FIND_MY_STRUCTURES);\n  if (st && c.repair(st) === ERR_NOT_IN_RANGE) c.moveTo(st);\n})(${v(b, 'C')});\n`,
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
  sc_rcl: () => [`((${myCtrl})||{level:0}).level`, JS.ORDER_MEMBER],
  sc_ctrl_progress: () => [`((${myCtrl})||{progress:0}).progress`, JS.ORDER_MEMBER],
  sc_site: b => `Game.createConstructionSite(Game.spawns['Spawn1'].pos.x + (${v(b, 'X', 0)}), Game.spawns['Spawn1'].pos.y + (${v(b, 'Y', 0)}), '${b.getFieldValue('T')}');\n`,
  sc_tower_attack: () => `(function(){const t=(Game.spawns['Spawn1'].pos.find(FIND_MY_STRUCTURES)||[]).find(s=>s.structureType===STRUCTURE_TOWER);const e=Game.spawns['Spawn1'].pos.findClosestByRange(FIND_HOSTILE_CREEPS);if(t&&e)t.attack(e);})();\n`,
  sc_tower_repair: () => `(function(){const t=(Game.spawns['Spawn1'].pos.find(FIND_MY_STRUCTURES)||[]).find(s=>s.structureType===STRUCTURE_TOWER);const s=(Game.spawns['Spawn1'].pos.find(FIND_MY_STRUCTURES)||[]).find(x=>x.hits<x.hitsMax);if(t&&s)t.repair(s);})();\n`,
  sc_tower_heal: () => `(function(){const t=(Game.spawns['Spawn1'].pos.find(FIND_MY_STRUCTURES)||[]).find(s=>s.structureType===STRUCTURE_TOWER);const c=Game.spawns['Spawn1'].pos.findClosestByRange(FIND_MY_CREEPS);if(t&&c)t.heal(c);})();\n`,
  sc_time: () => ['Game.time', JS.ORDER_MEMBER],
  sc_log: b => `console.log(${v(b, 'T', "''")});\n`,
};
for (const k in G) JS.forBlock[k] = G[k];
JS.INFINITE_LOOP_TRAP = '__loopGuard();\n';

// 水平顶部分类（flyout 模式）：无侧边栏，分类以顶栏 chips 展示
const TOOLBOX = { kind: 'flyoutToolbox', contents: [] }; // 动态注入，见下方 CATS
const CATS = [
  { id: 'creep', name: 'Creep', colour: '#3d85c6', blocks: ['sc_each_creep', 'sc_harvest', 'sc_transfer_spawn', 'sc_build', 'sc_upgrade', 'sc_repair', 'sc_moveto', 'sc_say', 'sc_is', 'sc_mem_get', 'sc_mem_set', 'sc_creep_prop'] },
  { id: 'base', name: '基地', colour: '#2e8b57', blocks: ['sc_spawn', 'sc_spawn_energy', 'sc_creep_count', 'sc_site_count', 'sc_rcl', 'sc_ctrl_progress', 'sc_site', 'sc_time', 'sc_log'] },
  { id: 'tower', name: '防御塔', colour: '#c44', blocks: ['sc_tower_attack', 'sc_tower_repair', 'sc_tower_heal'] },
  { id: 'logic', name: '逻辑', colour: '#5b80a5', blocks: ['controls_if', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean'] },
  { id: 'loop', name: '循环', colour: '#5ba55b', blocks: ['controls_repeat_ext', 'controls_whileUntil', 'controls_for'] },
  { id: 'math', name: '数学', colour: '#5b67a5', blocks: ['math_number', 'math_arithmetic', 'math_random_int', 'math_modulo'] },
  { id: 'text', name: '文本', colour: '#5ba58c', blocks: ['text', 'text_join'] },
  { id: 'var', name: '变量', colour: '#a55b80', custom: 'VARIABLE' },
  { id: 'fn', name: '函数', colour: '#995ba5', custom: 'PROCEDURE' },
];

const DEFAULT_WS = { blocks: { languageVersion: 0, blocks: [{ type: 'sc_spawn', x: 20, y: 20, fields: { B: 'work,carry,move' },
  next: { block: { type: 'sc_each_creep', fields: { VAR: { name: 'creep' } }, inputs: { DO: { block: { type: 'sc_harvest', inputs: { C: { block: { type: 'variables_get', fields: { VAR: { name: 'creep' } } } } } } } } } } }] } };
