// Screeps 官方 API 积木（1:1 对应 https://docs.screeps.com/api/ ），生成的 JS 即官方调用。
// 基础逻辑 / 循环 / 数学 / 文本 / 列表 / 变量 / 函数 全部使用 Blockly 官方标准积木。
const JS = Blockly.JavaScript;
JS.INFINITE_LOOP_TRAP = '__loopGuard();\n'; // 每次循环检查 CPU tickLimit / 死循环
const O = JS.ORDER_NONE, OM = JS.ORDER_MEMBER, OF = JS.ORDER_FUNCTION_CALL, OA = JS.ORDER_ATOMIC;
const val = (b, n, d = 'undefined') => JS.valueToCode(b, n, O) || d;
const recv = (b) => JS.valueToCode(b, 'O', OM) || 'undefined';
const API = []; // { type, cat, sub } 用于生成 toolbox

// ---- 规格 DSL ----
// m(cat, sub, 接收者示例名, 方法, [参数中文名...], 中文说明, {ret})  → 返回值积木 recv.method(args)
// p(cat, sub, 接收者示例名, 属性, 中文说明)                       → 属性积木 recv.prop
// g(cat, sub, 完整表达式前缀, [参数...], 中文说明, isCall)          → 全局 Game.xxx / Game.xxx(args)
const COL = {};
function def(type, json, gen, cat, sub, preset) {
  if (API.some(a => a.type === type)) type += '_' + String((preset && preset.O) || sub).replace(/\W/g, '_'); // 同名方法不同对象（如 source/mineral）
  json.type = type; json.colour = COL[cat]; json.tooltip = json.tooltip || ''; json.helpUrl = 'https://docs.screeps.com/api/'; Blockly.defineBlocksWithJsonArray([json]); JS.forBlock[type] = gen; API.push({ type, cat, sub, preset }); }
function m(cat, sub, rn, meth, args, zh, action) {
  const type = `api_${cat}_${meth}_${args.length}`.replace(/\W/g, '_');
  const a0 = [{ type: 'input_value', name: 'O' }]; let msg = `${zh} %1.${meth}(`;
  args.forEach((n, i) => { msg += `${i ? ',' : ''} ${n} %${i + 2}`; a0.push({ type: 'input_value', name: 'A' + i }); });
  msg += ' )';
  def(type, { message0: msg, args0: a0, output: null, inputsInline: true, tooltip: `${rn}.${meth}(${args.join(', ')})` },
    b => [`${recv(b)}.${meth}(${args.map((_, i) => val(b, 'A' + i)).join(', ')})`, OF], cat, sub,
    { O: rn, action });
}
function p(cat, sub, rn, prop, zh) {
  const type = `api_${cat}_p_${prop}`.replace(/\W/g, '_');
  def(type, { message0: `%1.${prop} ${zh}`, args0: [{ type: 'input_value', name: 'O' }], output: null, inputsInline: true, tooltip: `${rn}.${prop}` },
    b => [`${recv(b)}.${prop}`, OM], cat, sub, { O: rn });
}
function g(cat, sub, expr, args, zh, call, action) {
  const type = `api_${cat}_g_${expr}_${args ? args.length : 'p'}`.replace(/\W/g, '_');
  let msg = `${zh} ${expr}`; const a0 = [];
  if (call) { msg += '('; args.forEach((n, i) => { msg += `${i ? ',' : ''} ${n} %${i + 1}`; a0.push({ type: 'input_value', name: 'A' + i }); }); msg += ' )'; }
  def(type, { message0: msg, args0: a0, output: null, inputsInline: true, tooltip: expr },
    b => [call ? `${expr}(${args.map((_, i) => val(b, 'A' + i)).join(', ')})` : expr, call ? OF : OM], cat, sub, { action });
}
function k(cat, sub, prefix, list, zh) { // 常量下拉
  const type = `api_const_${prefix.replace(/_$/, '')}`.toLowerCase();
  def(type, { message0: `${zh} %1`, args0: [{ type: 'field_dropdown', name: 'K', options: list.map(x => [x, x]) }], output: null },
    b => [b.getFieldValue('K'), OA], cat, sub);
}
function idx(cat, sub, expr, zh) { // Game.creeps[名字]
  const type = `api_${cat}_idx_${expr}`.replace(/\W/g, '_');
  def(type, { message0: `${zh} ${expr}[ %1 ]`, args0: [{ type: 'input_value', name: 'A0' }], output: null, inputsInline: true },
    b => [`${expr}[${val(b, 'A0', "''")}]`, OM], cat, sub, { A0: 'Spawn1' });
}

// ---- 分类与颜色 ----
const CATS = [
  { id: 'game', name: 'Game', colour: '#4a6fa5' }, { id: 'creep', name: 'Creep', colour: '#3d85c6' },
  { id: 'spawn', name: 'Spawn', colour: '#2e8b57' }, { id: 'room', name: 'Room', colour: '#7a6a2e' },
  { id: 'pos', name: 'RoomPosition', colour: '#8a5a2e' }, { id: 'ctrl', name: 'Controller', colour: '#7b4fa0' },
  { id: 'struct', name: 'Structure', colour: '#a04848' }, { id: 'obj', name: 'Source/资源', colour: '#9a8a1e' },
  { id: 'mem', name: 'Memory', colour: '#5a7a7a' }, { id: 'map', name: 'Map/Market/CPU', colour: '#556b8e' },
  { id: 'const', name: '常量', colour: '#666' }, { id: 'js', name: 'JS 对象', colour: '#5f6f7f' },
  { id: 'logic', name: '逻辑', colour: '#5b80a5', std: ['controls_if', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'logic_null', 'logic_ternary'] },
  { id: 'loop', name: '循环', colour: '#5ba55b', std: ['controls_repeat_ext', 'controls_whileUntil', 'controls_for', 'controls_forEach', 'controls_flow_statements'] },
  { id: 'math', name: '数学', colour: '#5b67a5', std: ['math_number', 'math_arithmetic', 'math_single', 'math_round', 'math_on_list', 'math_modulo', 'math_constrain', 'math_random_int', 'math_random_float', 'math_number_property', 'math_constant'] },
  { id: 'text', name: '文本', colour: '#5ba58c', std: ['text', 'text_join', 'text_append', 'text_length', 'text_isEmpty', 'text_indexOf', 'text_charAt', 'text_getSubstring', 'text_changeCase', 'text_trim', 'text_print'] },
  { id: 'list', name: '列表', colour: '#745ba5', std: ['lists_create_empty', 'lists_create_with', 'lists_repeat', 'lists_length', 'lists_isEmpty', 'lists_indexOf', 'lists_getIndex', 'lists_setIndex', 'lists_getSublist', 'lists_split', 'lists_sort', 'lists_reverse'] },
  { id: 'var', name: '变量', colour: '#a55b80', custom: 'VARIABLE' },
  { id: 'fn', name: '函数', colour: '#995ba5', custom: 'PROCEDURE' },
];
CATS.forEach(c => COL[c.id] = c.colour);

// ---- 执行语句：把任意 API 调用当作语句执行（如 creep.moveTo(...);）----
Blockly.defineBlocksWithJsonArray([{ type: 'api_do', message0: '执行 %1', args0: [{ type: 'input_value', name: 'E' }], previousStatement: null, nextStatement: null, colour: '#555', inputsInline: true, tooltip: '把表达式作为一条语句执行' }]);
JS.forBlock.api_do = b => `${val(b, 'E', '')};\n`;

// ===== Game =====
const L = (zh) => zh; // 中文标签
g('game', '对象', 'Game.creeps', null, '所有 creep'); g('game', '对象', 'Game.spawns', null, '所有 spawn'); g('game', '对象', 'Game.rooms', null, '可见房间');
g('game', '对象', 'Game.structures', null, '我的建筑'); g('game', '对象', 'Game.constructionSites', null, '我的工地'); g('game', '对象', 'Game.flags', null, '旗帜');
idx('game', '对象', 'Game.creeps', '按名取 creep'); idx('game', '对象', 'Game.spawns', '按名取 spawn'); idx('game', '对象', 'Game.rooms', '按名取房间');
g('game', '信息', 'Game.time', null, '当前 tick'); g('game', '信息', 'Game.shard.name', null, 'shard 名');
g('game', '信息', 'Game.gcl.level', null, 'GCL 等级'); g('game', '信息', 'Game.gcl.progress', null, 'GCL 进度'); g('game', '信息', 'Game.gcl.progressTotal', null, 'GCL 升级所需');
g('game', '信息', 'Game.gpl.level', null, 'GPL 等级'); g('game', '信息', 'Game.resources', null, '账户资源');
g('game', '方法', 'Game.getObjectById', ['id'], '按 id 取对象', true);
g('game', '方法', 'Game.notify', ['消息'], '发送通知', true, true);

// ===== Creep =====
const CR = 'creep';
['harvest:采集', 'build:建造', 'repair:修理', 'upgradeController:升级控制器', 'attack:近战攻击', 'rangedAttack:远程攻击', 'heal:治疗', 'rangedHeal:远程治疗',
 'dismantle:拆除', 'pickup:拾取', 'claimController:占领控制器', 'reserveController:预定控制器', 'attackController:攻击控制器', 'generateSafeMode:生成安全模式', 'pull:拖拽', 'moveByPath:按路径移动']
  .forEach(s => { const [n, z] = s.split(':'); m('creep', '动作', CR, n, ['目标'], z, true); });
m('creep', '动作', CR, 'moveTo', ['目标'], '移动到', true); m('creep', '动作', CR, 'moveTo', ['x', 'y'], '移动到坐标', true);
m('creep', '动作', CR, 'move', ['方向'], '朝方向移动', true);
m('creep', '动作', CR, 'transfer', ['目标', '资源类型'], '转移给', true); m('creep', '动作', CR, 'transfer', ['目标', '资源类型', '数量'], '转移数量给', true);
m('creep', '动作', CR, 'withdraw', ['目标', '资源类型'], '取出', true); m('creep', '动作', CR, 'withdraw', ['目标', '资源类型', '数量'], '取出数量', true);
m('creep', '动作', CR, 'drop', ['资源类型'], '丢弃', true); m('creep', '动作', CR, 'drop', ['资源类型', '数量'], '丢弃数量', true);
m('creep', '动作', CR, 'say', ['消息'], '说话', true); m('creep', '动作', CR, 'say', ['消息', '公开'], '公开说话', true);
m('creep', '动作', CR, 'signController', ['控制器', '文本'], '签名控制器', true);
m('creep', '动作', CR, 'rangedMassAttack', [], '范围攻击', true); m('creep', '动作', CR, 'suicide', [], '自杀', true);
m('creep', '动作', CR, 'cancelOrder', ['方法名'], '取消指令', true); m('creep', '动作', CR, 'notifyWhenAttacked', ['开启'], '受攻击通知', true);
m('creep', '查询', CR, 'getActiveBodyparts', ['部件类型'], '有效部件数');
['name:名字', 'id:id', 'body:身体', 'store:存储', 'fatigue:疲劳', 'hits:血量', 'hitsMax:最大血量', 'memory:记忆', 'my:是我的', 'owner:主人', 'saying:说的话', 'spawning:孵化中', 'ticksToLive:剩余寿命', 'pos:位置', 'room:所在房间']
  .forEach(s => { const [n, z] = s.split(':'); p('creep', '属性', CR, n, z); });
// Store（creep/建筑共用）
m('creep', 'Store', 'creep.store', 'getCapacity', ['资源类型'], '容量'); m('creep', 'Store', 'creep.store', 'getFreeCapacity', ['资源类型'], '剩余容量');
m('creep', 'Store', 'creep.store', 'getUsedCapacity', ['资源类型'], '已用容量');
m('creep', 'Store', 'creep.store', 'getFreeCapacity', [], '剩余容量(全部)'); m('creep', 'Store', 'creep.store', 'getUsedCapacity', [], '已用容量(全部)');

// ===== StructureSpawn =====
const SP = "Game.spawns['Spawn1']";
m('spawn', '方法', SP, 'spawnCreep', ['身体', '名字'], '孵化', true); m('spawn', '方法', SP, 'spawnCreep', ['身体', '名字', '选项'], '孵化(选项)', true);
m('spawn', '方法', SP, 'recycleCreep', ['creep'], '回收', true); m('spawn', '方法', SP, 'renewCreep', ['creep'], '续命', true);
['name:名字', 'spawning:正在孵化', 'store:存储', 'memory:记忆', 'hits:血量', 'my:是我的', 'room:房间', 'pos:位置']
  .forEach(s => { const [n, z] = s.split(':'); p('spawn', '属性', SP, n, z); });
p('spawn', 'Spawning', `${SP}.spawning`, 'needTime', '总需时间'); p('spawn', 'Spawning', `${SP}.spawning`, 'remainingTime', '剩余时间');
m('spawn', 'Spawning', `${SP}.spawning`, 'cancel', [], '取消孵化', true); m('spawn', 'Spawning', `${SP}.spawning`, 'setDirections', ['方向列表'], '出生方向', true);
// 身体部件列表
Blockly.defineBlocksWithJsonArray([{ type: 'api_body', message0: '身体 [ %1 ]', args0: [{ type: 'field_input', name: 'B', text: 'WORK,CARRY,MOVE' }], output: 'Array', colour: COL.spawn, tooltip: '身体部件数组，如 [WORK, CARRY, MOVE]' }]);
JS.forBlock.api_body = b => [`[${b.getFieldValue('B').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z_]+$/.test(s)).join(', ')}]`, OA];
API.push({ type: 'api_body', cat: 'spawn', sub: '方法' });

// ===== Room =====
const RM = 'room';
m('room', '查找', RM, 'find', ['FIND_类型'], '查找'); m('room', '查找', RM, 'find', ['FIND_类型', '选项'], '查找(过滤)');
m('room', '查找', RM, 'lookAt', ['x', 'y'], '查看'); m('room', '查找', RM, 'lookForAt', ['LOOK_类型', 'x', 'y'], '查看类型');
m('room', '查找', RM, 'findPath', ['起点', '终点'], '寻路'); m('room', '查找', RM, 'findExitTo', ['房间'], '出口方向');
m('room', '方法', RM, 'createConstructionSite', ['x', 'y', '建筑类型'], '放置工地', true);
m('room', '方法', RM, 'createFlag', ['x', 'y', '名字'], '放旗帜', true);
m('room', '方法', RM, 'getPositionAt', ['x', 'y'], '取位置'); m('room', '方法', RM, 'getTerrain', [], '地形'); m('room', '方法', RM, 'getEventLog', [], '事件日志');
['name:名字', 'controller:控制器', 'storage:仓储', 'terminal:终端', 'energyAvailable:可用能量', 'energyCapacityAvailable:能量上限', 'memory:记忆']
  .forEach(s => { const [n, z] = s.split(':'); p('room', '属性', RM, n, z); });
m('room', '地形', 'room.getTerrain()', 'get', ['x', 'y'], '地形值');

// ===== RoomPosition =====
const PS = 'creep.pos';
def('api_pos_new', { message0: 'new RoomPosition( x %1, y %2, 房间名 %3 )', args0: [{ type: 'input_value', name: 'X' }, { type: 'input_value', name: 'Y' }, { type: 'input_value', name: 'R' }], output: null, inputsInline: true },
  b => [`new RoomPosition(${val(b, 'X', 0)}, ${val(b, 'Y', 0)}, ${val(b, 'R', "''")})`, JS.ORDER_NEW], 'pos', '构造');
['x', 'y', 'roomName'].forEach(n => p('pos', '属性', PS, n, ''));
m('pos', '查找', PS, 'findClosestByPath', ['FIND_类型'], '路径最近'); m('pos', '查找', PS, 'findClosestByPath', ['FIND_类型', '选项'], '路径最近(过滤)');
m('pos', '查找', PS, 'findClosestByRange', ['FIND_类型'], '直线最近'); m('pos', '查找', PS, 'findInRange', ['FIND_类型', '范围'], '范围内');
m('pos', '查找', PS, 'findPathTo', ['目标'], '寻路到'); m('pos', '查找', PS, 'look', [], '查看'); m('pos', '查找', PS, 'lookFor', ['LOOK_类型'], '查看类型');
m('pos', '距离', PS, 'getRangeTo', ['目标'], '距离'); m('pos', '距离', PS, 'getDirectionTo', ['目标'], '方向');
m('pos', '距离', PS, 'inRangeTo', ['目标', '范围'], '在范围内'); m('pos', '距离', PS, 'isNearTo', ['目标'], '相邻'); m('pos', '距离', PS, 'isEqualTo', ['目标'], '相同');
m('pos', '方法', PS, 'createConstructionSite', ['建筑类型'], '放置工地', true); m('pos', '方法', PS, 'createFlag', ['名字'], '放旗帜', true);

// ===== StructureController =====
const CT = 'creep.room.controller';
['level:等级', 'progress:进度', 'progressTotal:升级所需', 'ticksToDowngrade:降级倒计时', 'safeMode:安全模式剩余', 'safeModeAvailable:可用安全模式', 'safeModeCooldown:安全模式冷却', 'upgradeBlocked:禁止升级', 'reservation:预定', 'sign:签名', 'my:是我的', 'owner:主人']
  .forEach(s => { const [n, z] = s.split(':'); p('ctrl', '属性', CT, n, z); });
m('ctrl', '方法', CT, 'activateSafeMode', [], '开启安全模式', true); m('ctrl', '方法', CT, 'unclaim', [], '放弃', true);

// ===== Structure 及各建筑 =====
const ST = 'structure';
['id:id', 'structureType:类型', 'hits:血量', 'hitsMax:最大血量', 'my:是我的', 'owner:主人', 'store:存储', 'room:房间', 'pos:位置'].forEach(s => { const [n, z] = s.split(':'); p('struct', '通用', ST, n, z); });
m('struct', '通用', ST, 'destroy', [], '摧毁', true); m('struct', '通用', ST, 'isActive', [], '是否可用'); m('struct', '通用', ST, 'notifyWhenAttacked', ['开启'], '受攻击通知', true);
m('struct', 'Tower', 'tower', 'attack', ['目标'], '塔攻击', true); m('struct', 'Tower', 'tower', 'heal', ['目标'], '塔治疗', true); m('struct', 'Tower', 'tower', 'repair', ['目标'], '塔修理', true);
m('struct', 'Link', 'link', 'transferEnergy', ['目标'], '传送能量', true); m('struct', 'Link', 'link', 'transferEnergy', ['目标', '数量'], '传送能量数量', true); p('struct', 'Link', 'link', 'cooldown', '冷却');
p('struct', 'Container', 'container', 'ticksToDecay', '衰减倒计时');
m('struct', 'Terminal', 'terminal', 'send', ['资源类型', '数量', '目标房间'], '发送', true);
m('struct', 'Lab', 'lab', 'runReaction', ['lab1', 'lab2'], '反应', true); m('struct', 'Lab', 'lab', 'boostCreep', ['creep'], '强化', true); p('struct', 'Lab', 'lab', 'mineralType', '矿物类型'); m('struct', 'Lab', 'lab', 'reverseReaction', ['lab1', 'lab2'], '逆反应', true); m('struct', 'Lab', 'lab', 'unboostCreep', ['creep'], '解除强化', true); p('struct', 'Lab', 'lab', 'mineralAmount', '矿物数量');
m('struct', '其他', 'observer', 'observeRoom', ['房间名'], '观察', true); m('struct', '其他', 'factory', 'produce', ['资源类型'], '生产', true);
m('struct', '其他', 'powerSpawn', 'processPower', [], '处理 power', true); m('struct', '其他', 'nuker', 'launchNuke', ['位置'], '发射核弹', true);
m('struct', '其他', 'rampart', 'setPublic', ['公开'], '设为公开', true); p('struct', '其他', 'rampart', 'isPublic', '是否公开');

// ===== Source / Mineral / ConstructionSite / Resource / Tombstone / Flag =====
['energy:能量', 'energyCapacity:容量', 'ticksToRegeneration:再生倒计时', 'id:id', 'pos:位置'].forEach(s => { const [n, z] = s.split(':'); p('obj', 'Source', 'source', n, z); });
['mineralType:类型', 'mineralAmount:储量', 'density:密度', 'ticksToRegeneration:再生倒计时'].forEach(s => { const [n, z] = s.split(':'); p('obj', 'Mineral', 'mineral', n, z); });
['progress:进度', 'progressTotal:所需', 'structureType:类型', 'my:是我的'].forEach(s => { const [n, z] = s.split(':'); p('obj', 'ConstructionSite', 'site', n, z); });
m('obj', 'ConstructionSite', 'site', 'remove', [], '移除工地', true);
['amount:数量', 'resourceType:资源类型'].forEach(s => { const [n, z] = s.split(':'); p('obj', 'Resource', 'resource', n, z); });
['deathTime:死亡时间', 'ticksToDecay:衰减倒计时', 'creep:creep'].forEach(s => { const [n, z] = s.split(':'); p('obj', 'Tombstone', 'tombstone', n, z); });
['name:名字', 'color:颜色', 'memory:记忆'].forEach(s => { const [n, z] = s.split(':'); p('obj', 'Flag', 'flag', n, z); });
m('obj', 'Flag', 'flag', 'remove', [], '移除旗帜', true); m('obj', 'Flag', 'flag', 'setPosition', ['位置'], '移动旗帜', true);

// ===== Memory =====
def('api_mem_get', { message0: 'Memory[ %1 ] 读全局记忆', args0: [{ type: 'input_value', name: 'K' }], output: null, inputsInline: true }, b => [`Memory[${val(b, 'K', "''")}]`, OM], 'mem', '全局', { K: 'key' });
def('api_mem_set', { message0: 'Memory[ %1 ] = %2 写全局记忆', args0: [{ type: 'input_value', name: 'K' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `Memory[${val(b, 'K', "''")}] = ${val(b, 'V', 'null')};\n`, 'mem', '全局', { K: 'key' });
def('api_objmem_get', { message0: '%1.memory[ %2 ] 读对象记忆', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }], output: null, inputsInline: true }, b => [`${recv(b)}.memory[${val(b, 'K', "''")}]`, OM], 'mem', '对象', { O: 'creep', K: 'working' });
def('api_objmem_set', { message0: '%1.memory[ %2 ] = %3 写对象记忆', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `${recv(b)}.memory[${val(b, 'K', "''")}] = ${val(b, 'V', 'null')};\n`, 'mem', '对象', { O: 'creep', K: 'working' });
def('api_mem_del', { message0: 'delete Memory.creeps[ %1 ] 清理记忆', args0: [{ type: 'input_value', name: 'K' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `delete Memory.creeps[${val(b, 'K', "''")}];\n`, 'mem', '全局');
g('mem', '全局', 'Memory', null, '全局记忆对象'); g('mem', '全局', 'Memory.creeps', null, 'creep 记忆');

// ===== Game.map / market / cpu / PathFinder =====
['describeExits:房间出口:房间名', 'findExit:出口方向:起点房间,终点房间', 'findRoute:房间路线:起点房间,终点房间', 'getRoomLinearDistance:房间距离:房间1,房间2', 'getRoomTerrain:房间地形:房间名', 'getWorldSize:世界大小:', 'getRoomStatus:房间状态:房间名']
  .forEach(s => { const [n, z, a] = s.split(':'); g('map', 'Game.map', `Game.map.${n}`, a ? a.split(',') : [], z, true); });
g('map', 'Game.market', 'Game.market.credits', null, '信用点'); g('map', 'Game.market', 'Game.market.orders', null, '我的订单');
g('map', 'Game.market', 'Game.market.calcTransactionCost', ['数量', '房间1', '房间2'], '交易费用', true);
g('map', 'Game.market', 'Game.market.getAllOrders', ['过滤'], '所有订单', true); g('map', 'Game.market', 'Game.market.getOrderById', ['id'], '取订单', true);
g('map', 'Game.market', 'Game.market.deal', ['订单id', '数量', '房间名'], '成交', true, true);
g('map', 'Game.market', 'Game.market.createOrder', ['参数'], '创建订单', true, true); g('map', 'Game.market', 'Game.market.cancelOrder', ['订单id'], '取消订单', true, true);
// ===== v1.7.0：事件日志 / RoomVisual / Power Creep / Deposit / 市场补全 =====
m('room', '事件', RM, 'getEventLog', [], '事件日志'); m('room', '事件', RM, 'getEventLog', ['raw'], '事件日志(原始JSON)');
['circle:画圆:x,y,样式', 'line:画线:点1,点2,样式', 'rect:画矩形:x,y,宽,高,样式', 'poly:画折线:点数组,样式', 'text:写文字:文字,x,y,样式', 'clear:清除视觉:', 'getSize:视觉大小:']
  .forEach(q => { const [n, z, a] = q.split(':'); g('room', '视觉', `room.visual.${n}`, a ? a.split(',') : [], z, true, true); });
g('room', '视觉', 'new RoomVisual', ['房间名'], '新建 RoomVisual', true);
g('creep', 'Power Creep', 'Game.powerCreeps', null, '所有 Power Creep'); g('creep', 'Power Creep', 'PowerCreep.create', ['名字', '类型'], '创建 Power Creep', true, true);
['spawn:召唤:能量源', 'renew:续命:目标', 'usePower:使用能力:能力,目标', 'upgrade:升级能力:能力', 'enableRoom:启用房间:控制器', 'delete:删除:', 'rename:改名:新名字']
  .forEach(q => { const [n, z, a] = q.split(':'); m('creep', 'Power Creep', CR, n, a ? a.split(',') : [], z, true); });
g('game', '信息', 'Game.gpl.progress', null, 'GPL 进度'); g('game', '信息', 'Game.gpl.progressTotal', null, 'GPL 升级所需');
p('creep', 'Power Creep', CR, 'level', '等级'); p('creep', 'Power Creep', CR, 'className', '职业'); p('creep', 'Power Creep', CR, 'powers', '能力表'); p('creep', 'Power Creep', CR, 'spawnCooldownTime', '召唤冷却');
p('room', 'Deposit', 'deposit', 'depositType', '沉积物类型'); p('room', 'Deposit', 'deposit', 'cooldown', '冷却'); p('room', 'Deposit', 'deposit', 'lastCooldown', '上次冷却'); p('room', 'Deposit', 'deposit', 'ticksToDecay', '剩余寿命');
g('map', 'Game.market', 'Game.market.changeOrderPrice', ['订单id', '新价格'], '改订单价格', true, true);
g('map', 'Game.market', 'Game.market.extendOrder', ['订单id', '追加数量'], '追加订单数量', true, true);
g('map', 'Game.market', 'Game.market.getHistory', ['资源'], '价格历史', true);
g('map', 'Game.cpu', 'Game.cpu.limit', null, 'CPU 上限'); g('map', 'Game.cpu', 'Game.cpu.tickLimit', null, '本 tick 上限'); g('map', 'Game.cpu', 'Game.cpu.bucket', null, 'CPU 桶');
g('map', 'Game.cpu', 'Game.cpu.getUsed', [], '已用 CPU', true); g('map', 'Game.cpu', 'Game.cpu.generatePixel', [], '生成 pixel', true, true);
g('map', 'PathFinder', 'PathFinder.search', ['起点', '目标'], '寻路搜索', true);

// ===== 常量 =====
const K = (pre) => Object.keys(SC).filter(x => x.startsWith(pre) && typeof SC[x] !== 'object').sort();
k('const', 'FIND', 'FIND_', K('FIND_'), '查找类型'); k('const', 'RESOURCE', 'RESOURCE_', K('RESOURCE_'), '资源');
k('const', 'STRUCTURE', 'STRUCTURE_', K('STRUCTURE_'), '建筑'); k('const', 'LOOK', 'LOOK_', K('LOOK_'), '查看类型');
k('const', '返回码', 'ERR_', ['OK', ...K('ERR_')], '返回码');
k('const', '部件/方向', 'BODY_', ['WORK', 'CARRY', 'MOVE', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM', 'TOUGH'], '身体部件');
k('const', '部件/方向', 'DIR_', ['TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT'], '方向');
k('const', '部件/方向', 'TERRAIN_', ['TERRAIN_MASK_WALL', 'TERRAIN_MASK_SWAMP'], '地形');

// ===== JS 对象工具（标准 JS，用来遍历 Game.creeps 这类对象）=====
def('api_js_values', { message0: 'Object.values( %1 )', args0: [{ type: 'input_value', name: 'O' }], output: 'Array', inputsInline: true }, b => [`Object.values(${val(b, 'O', '{}')})`, OF], 'js', '对象');
def('api_js_keys', { message0: 'Object.keys( %1 )', args0: [{ type: 'input_value', name: 'O' }], output: 'Array', inputsInline: true }, b => [`Object.keys(${val(b, 'O', '{}')})`, OF], 'js', '对象');
def('api_js_forin', { message0: 'for ( const %1 in %2 ) %3 %4', args0: [{ type: 'field_variable', name: 'VAR', variable: 'creepName' }, { type: 'input_value', name: 'O' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, inputsInline: true },
  b => `for (${JS.getVariableName(b.getFieldValue('VAR'))} in ${val(b, 'O', '{}')}) {\n${JS.statementToCode(b, 'DO')}}\n`, 'js', '对象');
def('api_js_get', { message0: '%1 [ %2 ]', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }], output: null, inputsInline: true }, b => [`${recv(b)}[${val(b, 'K', "''")}]`, OM], 'js', '对象');
def('api_js_set', { message0: '%1 [ %2 ] = %3', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `${recv(b)}[${val(b, 'K', "''")}] = ${val(b, 'V', 'null')};\n`, 'js', '对象');
def('api_js_obj', { message0: '{ } 空对象', output: null }, () => ['{}', OA], 'js', '对象');
def('api_js_del', { message0: 'delete %1 [ %2 ]', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `delete ${recv(b)}[${val(b, 'K', "''")}];\n`, 'js', '对象');
def('api_js_has', { message0: '%1 in %2', args0: [{ type: 'input_value', name: 'K' }, { type: 'input_value', name: 'O' }], output: 'Boolean', inputsInline: true }, b => [`(${val(b, 'K', "''")} in ${JS.valueToCode(b, 'O', JS.ORDER_IN) || '{}'})`, OA], 'js', '对象');
def('api_js_prop', { message0: '%1 . %2', args0: [{ type: 'input_value', name: 'O' }, { type: 'field_input', name: 'P', text: 'length' }], output: null, inputsInline: true }, b => [`${recv(b)}.${b.getFieldValue('P').replace(/[^\w$]/g, '')}`, OM], 'js', '对象');
def('api_js_filter', { message0: '{ filter: { structureType: %1 } }', args0: [{ type: 'input_value', name: 'T' }], output: null, inputsInline: true }, b => [`{ filter: { structureType: ${val(b, 'T', 'STRUCTURE_SPAWN')} } }`, OA], 'js', '选项');
def('api_js_log', { message0: 'console.log( %1 )', args0: [{ type: 'input_value', name: 'T' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `console.log(${val(b, 'T', "''")});\n`, 'js', '对象');

// ---- 生成 flyout 内容：每个分类按子类加标签；动作类方法默认包在「执行」里 ----
const VAR = (n) => ({ block: { type: 'variables_get', fields: { VAR: { name: n } } } });
const TXT = (t) => ({ shadow: { type: 'text', fields: { TEXT: t } } });
function recvInput(rn) {
  if (!rn) return undefined;
  if (/^[a-z]\w*$/i.test(rn)) return VAR(rn);
  return { block: { type: 'api_js_prop_raw', fields: { E: rn } } };
}
// 接收者是复杂表达式（如 Game.spawns['Spawn1']）时用的原样表达式积木
def('api_js_prop_raw', { message0: '%1', args0: [{ type: 'field_input', name: 'E', text: 'Game' }], output: null }, b => [b.getFieldValue('E').replace(/[;\n]/g, ''), OM], 'js', '对象');
function flyoutFor(c) {
  if (c.custom) return c.custom;
  if (c.std) return c.std.map(t => ({ kind: 'block', type: t }));
  const out = []; let sub = null;
  for (const a of API.filter(x => x.cat === c.id)) {
    if (a.sub !== sub) { sub = a.sub; out.push({ kind: 'label', text: sub }); }
    const inputs = {}; const pr = a.preset || {};
    if (pr.O) inputs.O = recvInput(pr.O);
    if (pr.K) inputs.K = TXT(pr.K); if (pr.A0) inputs.A0 = TXT(pr.A0);
    const blk = { kind: 'block', type: a.type, inputs };
    out.push(pr.action ? { kind: 'block', type: 'api_do', inputs: { E: { block: { type: a.type, inputs } } } } : blk);
  }
  return out;
}

// ---- 默认程序：官方入门教程的 harvester ----
const DEFAULT_CODE_DOC = `Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, MOVE], 'Harvester' + Game.time);
for (const name in Game.creeps) { const creep = Game.creeps[name]; ... harvest / transfer ... }`;
const B = (type, inputs, fields, extra) => ({ block: Object.assign({ type }, inputs ? { inputs } : {}, fields ? { fields } : {}, extra || {}) });
const RAW = (e) => B('api_js_prop_raw', null, { E: e });
const CREEP = VAR('creep'), POS = B('api_creep_p_pos', { O: CREEP });
const closest = (f) => B('api_pos_findClosestByPath_1', { O: POS, A0: B('api_const_find', null, { K: f }) });
const DO = (e, next) => B('api_do', { E: e }, null, next ? { next } : {});
const ifRange = (call, moveTarget, next) => B('controls_if', { IF0: B('logic_compare', { A: call, B: B('api_const_err', null, { K: 'ERR_NOT_IN_RANGE' }) }, { OP: 'EQ' }), DO0: DO(B('api_creep_moveTo_1', { O: CREEP, A0: moveTarget })) }, null, next ? { next } : {});
const spawnStmt = DO(B('api_spawn_spawnCreep_2', { O: RAW("Game.spawns['Spawn1']"), A0: B('api_body', null, { B: 'WORK,CARRY,MOVE' }),
  A1: B('text_join', { ADD0: B('text', null, { TEXT: 'Harvester' }), ADD1: B('api_game_g_Game_time_p') }, null, { extraState: { itemCount: 2 } }) }));
// 官方教程 harvester：满了送回 Spawn，否则去采集
const body = B('variables_set', { VALUE: B('api_js_get', { O: B('api_game_g_Game_creeps_p'), K: VAR('creepName') }) }, { VAR: { name: 'creep' } }, { next:
  B('controls_if', {
    IF0: B('logic_compare', { A: B('api_creep_getFreeCapacity_0', { O: B('api_creep_p_store', { O: CREEP }) }), B: B('math_number', null, { NUM: 0 }) }, { OP: 'GT' }),
    DO0: ifRange(B('api_creep_harvest_1', { O: CREEP, A0: closest('FIND_SOURCES') }), closest('FIND_SOURCES')),
    ELSE: ifRange(B('api_creep_transfer_2', { O: CREEP, A0: RAW("Game.spawns['Spawn1']"), A1: B('api_const_resource', null, { K: 'RESOURCE_ENERGY' }) }), RAW("Game.spawns['Spawn1']")),
  }, null, { extraState: { hasElse: true } }) });
const DEFAULT_WS = { blocks: { languageVersion: 0, blocks: [Object.assign(spawnStmt.block, { x: 16, y: 16,
  next: B('api_js_forin', { O: B('api_game_g_Game_creeps_p'), DO: body }, { VAR: { name: 'creepName' } }) })] } };
