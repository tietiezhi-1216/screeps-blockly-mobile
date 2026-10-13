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
// ---- 显示文字：积木上只显示中文自然语言（不出现点号、括号、代码名）；tooltip 保留官方 API 写法 ----
const WORDS = [[/\(([^)]*)\)/g, ' · $1'], [/（([^）]*)）/g, ' · $1'], [/CostMatrix/g, '代价表'], [/RoomVisual/g, '房间视觉'], [/\bJSON\b/g, ''], [/\bshard\b/g, '分片'], [/\bpixel\b/g, '像素点'],
  [/\bid\b/g, '编号'], [/\bpower\b/g, 'Power'], [/PathFinder/g, '寻路器'], [/\braw\b/g, '原始数据'], [/\bFIND_类型\b|FIND_类型/g, '查找什么'], [/LOOK_类型/g, '看什么'], [/\bGame\./g, ''], [/\bMemory\b/g, '记忆'], [/\s+/g, ' ']];
const zhText = t => WORDS.reduce((a, [r, w]) => a.replace(r, w), String(t || '')).trim();
const ARGZH = { x: '横坐标', y: '纵坐标', '公开': '公开', '开启': '开启', 'creep': 'creep', '上': '上边', '左': '左边', '下': '下边', '右': '右边' };
const argLabel = n => zhText(ARGZH[n] || n);
const RECVZH = { creep: 'creep', room: '房间' };
function m(cat, sub, rn, meth, args, zh, action) {
  const type = `api_${cat}_${meth}_${args.length}`.replace(/\W/g, '_');
  const a0 = [{ type: 'input_value', name: 'O' }]; let msg = action ? `让 %1 ${zhText(zh)}` : `%1 的 ${zhText(zh)}`;
  args.forEach((n, i) => { msg += ` ${argLabel(n)} %${i + 2}`; a0.push({ type: 'input_value', name: 'A' + i }); });
  def(type, { message0: msg, args0: a0, output: null, inputsInline: true, tooltip: `${rn}.${meth}(${args.join(', ')})` },
    b => [`${recv(b)}.${meth}(${args.map((_, i) => val(b, 'A' + i)).join(', ')})`, OF], cat, sub,
    { O: rn, action, args });
}
const PROPZH = { x: '横坐标', y: '纵坐标', roomName: '所在房间名', id: '编号', creep: '死去的 creep' };
function p(cat, sub, rn, prop, zh) {
  const type = `api_${cat}_p_${prop}`.replace(/\W/g, '_');
  def(type, { message0: `%1 的 ${zhText(PROPZH[prop] || zh || prop)}`, args0: [{ type: 'input_value', name: 'O' }], output: null, inputsInline: true, tooltip: `${rn}.${prop}` },
    b => [`${recv(b)}.${prop}`, OM], cat, sub, { O: rn });
}
function g(cat, sub, expr, args, zh, call, action) {
  const type = `api_${cat}_g_${expr}_${args ? args.length : 'p'}`.replace(/\W/g, '_');
  let msg = zhText(zh); const a0 = [];
  if (call) args.forEach((n, i) => { msg += ` ${argLabel(n)} %${i + 1}`; a0.push({ type: 'input_value', name: 'A' + i }); });
  def(type, { message0: msg, args0: a0, output: null, inputsInline: true, tooltip: expr },
    b => [call ? `${expr}(${args.map((_, i) => val(b, 'A' + i)).join(', ')})` : expr, call ? OF : OM], cat, sub, { action, args });
}
function k(cat, sub, prefix, list, zh) { // 常量下拉
  const type = `api_const_${prefix.replace(/_$/, '')}`.toLowerCase();
  def(type, { message0: `${zh} %1`, args0: [{ type: 'field_dropdown', name: 'K', options: list.map(x => [constZh(x), x]) }], output: null, tooltip: '官方常量' },
    b => [b.getFieldValue('K'), OA], cat, sub);
}
function idx(cat, sub, expr, zh) { // Game.creeps[名字]
  const type = `api_${cat}_idx_${expr}`.replace(/\W/g, '_');
  def(type, { message0: `名字为 %1 的 ${zh.replace(/^按名取 ?/, '')}`, tooltip: `${expr}[名字]`, args0: [{ type: 'input_value', name: 'A0' }], output: null, inputsInline: true },
    b => [`${expr}[${val(b, 'A0', "''")}]`, OM], cat, sub, { A0: 'Spawn1' });
}

// ---- 分类与颜色 ----
const CATS = [
  { id: 'game', name: '游戏', colour: '#4a6fa5' }, { id: 'creep', name: 'Creep', colour: '#3d85c6' },
  { id: 'spawn', name: 'Spawn', colour: '#2e8b57' }, { id: 'room', name: '房间', colour: '#7a6a2e' },
  { id: 'pos', name: '位置', colour: '#8a5a2e' }, { id: 'ctrl', name: '控制器', colour: '#7b4fa0' },
  { id: 'struct', name: '建筑', colour: '#a04848' }, { id: 'obj', name: '能量源与资源', colour: '#9a8a1e' },
  { id: 'mem', name: '记忆', colour: '#5a7a7a' }, { id: 'map', name: '地图与市场', colour: '#556b8e' },
  { id: 'const', name: '常量', colour: '#666' }, { id: 'js', name: '数据', colour: '#5f6f7f' },
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
m('spawn', '方法', SP, 'spawnCreep', ['身体', '名字'], '孵化', true); m('spawn', '方法', SP, 'spawnCreep', ['身体', '名字', '选项'], '带选项孵化', true);
m('spawn', '方法', SP, 'recycleCreep', ['creep'], '回收', true); m('spawn', '方法', SP, 'renewCreep', ['creep'], '续命', true);
['name:名字', 'spawning:正在孵化', 'store:存储', 'memory:记忆', 'hits:血量', 'my:是我的', 'room:房间', 'pos:位置']
  .forEach(s => { const [n, z] = s.split(':'); p('spawn', '属性', SP, n, z); });
p('spawn', 'Spawning', `${SP}.spawning`, 'needTime', '总需时间'); p('spawn', 'Spawning', `${SP}.spawning`, 'remainingTime', '剩余时间');
m('spawn', 'Spawning', `${SP}.spawning`, 'cancel', [], '取消孵化', true); m('spawn', 'Spawning', `${SP}.spawning`, 'setDirections', ['方向列表'], '出生方向', true);
// 身体部件列表
Blockly.defineBlocksWithJsonArray([{ type: 'api_body', message0: '身体部件 %1', args0: [{ type: 'field_body', name: 'B', value: 'work,carry,move' }], output: 'Array', colour: COL.spawn, tooltip: '身体部件数组，如 [WORK, CARRY, MOVE]；点一下用表单选择' }]);
JS.forBlock.api_body = b => [`[${b.getFieldValue('B').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z_]+$/.test(s)).join(', ')}]`, OA];
API.push({ type: 'api_body', cat: 'spawn', sub: '方法' });

// ===== Room =====
const RM = 'room';
m('room', '查找', RM, 'find', ['FIND_类型'], '查找'); m('room', '查找', RM, 'find', ['FIND_类型', '选项'], '按条件查找');
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
def('api_pos_new', { message0: '位置 横坐标 %1 纵坐标 %2 房间 %3', tooltip: 'new RoomPosition(x, y, roomName)', args0: [{ type: 'input_value', name: 'X' }, { type: 'input_value', name: 'Y' }, { type: 'input_value', name: 'R' }], output: null, inputsInline: true },
  b => [`new RoomPosition(${val(b, 'X', 0)}, ${val(b, 'Y', 0)}, ${val(b, 'R', "''")})`, JS.ORDER_NEW], 'pos', '构造');
['x', 'y', 'roomName'].forEach(n => p('pos', '属性', PS, n, ''));
m('pos', '查找', PS, 'findClosestByPath', ['FIND_类型'], '路径最近'); m('pos', '查找', PS, 'findClosestByPath', ['FIND_类型', '选项'], '按条件路径最近');
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
def('api_mem_get', { message0: '全局记忆里 %1 的值', tooltip: 'Memory[key]', args0: [{ type: 'input_value', name: 'K' }], output: null, inputsInline: true }, b => [`Memory[${val(b, 'K', "''")}]`, OM], 'mem', '全局', { K: 'key' });
def('api_mem_set', { message0: '把全局记忆 %1 设为 %2', tooltip: 'Memory[key] = value', args0: [{ type: 'input_value', name: 'K' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `Memory[${val(b, 'K', "''")}] = ${val(b, 'V', 'null')};\n`, 'mem', '全局', { K: 'key' });
def('api_objmem_get', { message0: '%1 记忆里 %2 的值', tooltip: 'obj.memory[key]', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }], output: null, inputsInline: true }, b => [`${recv(b)}.memory[${val(b, 'K', "''")}]`, OM], 'mem', '对象', { O: 'creep', K: 'working' });
def('api_objmem_set', { message0: '把 %1 记忆里的 %2 设为 %3', tooltip: 'obj.memory[key] = value', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `${recv(b)}.memory[${val(b, 'K', "''")}] = ${val(b, 'V', 'null')};\n`, 'mem', '对象', { O: 'creep', K: 'working' });
def('api_mem_del', { message0: '删除名为 %1 的 creep 的记忆', tooltip: 'delete Memory.creeps[name]', args0: [{ type: 'input_value', name: 'K' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `delete Memory.creeps[${val(b, 'K', "''")}];\n`, 'mem', '全局');
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
// ---- 补全：CPU / 地图视觉 / 市场记录 / PathFinder / RawMemory / InterShardMemory（官方 API 全部成员，含已废弃）----
g('map', 'Game.cpu', 'Game.cpu.shardLimits', null, '各 shard CPU 分配'); g('map', 'Game.cpu', 'Game.cpu.unlocked', null, '已解锁满 CPU'); g('map', 'Game.cpu', 'Game.cpu.unlockedTime', null, '解锁到期时间');
g('map', 'Game.cpu', 'Game.cpu.getHeapStatistics', [], '堆内存统计', true); g('map', 'Game.cpu', 'Game.cpu.halt', [], '重置运行时', true, true);
g('map', 'Game.cpu', 'Game.cpu.setShardLimits', ['分配对象'], '设置 shard CPU', true, true); g('map', 'Game.cpu', 'Game.cpu.unlock', [], '解锁满 CPU', true, true);
g('map', 'Game.map.visual', 'Game.map.visual', null, '世界地图视觉');
g('map', 'Game.map.visual', 'Game.map.visual.line', ['起点', '终点', '样式'], '地图画线', true, true); g('map', 'Game.map.visual', 'Game.map.visual.circle', ['位置', '样式'], '地图画圆', true, true);
g('map', 'Game.map.visual', 'Game.map.visual.rect', ['左上', '宽', '高', '样式'], '地图画矩形', true, true); g('map', 'Game.map.visual', 'Game.map.visual.poly', ['点数组', '样式'], '地图画折线', true, true);
g('map', 'Game.map.visual', 'Game.map.visual.text', ['文字', '位置', '样式'], '地图写字', true, true); g('map', 'Game.map.visual', 'Game.map.visual.clear', [], '清空地图视觉', true, true);
g('map', 'Game.map.visual', 'Game.map.visual.getSize', [], '地图视觉大小', true); g('map', 'Game.map.visual', 'Game.map.visual.export', [], '导出地图视觉', true);
g('map', 'Game.map.visual', 'Game.map.visual.import', ['数据'], '导入地图视觉', true, true);
g('map', 'Game.market', 'Game.market.incomingTransactions', null, '收到的交易'); g('map', 'Game.market', 'Game.market.outgoingTransactions', null, '发出的交易');
g('map', 'PathFinder', 'PathFinder.use', ['是否启用'], '启用 PathFinder（已废弃）', true, true);
g('map', 'PathFinder', 'new PathFinder.CostMatrix', [], '新建 CostMatrix', true);
m('map', 'PathFinder', 'PathFinder.CostMatrix', 'set', ['x', 'y', '代价'], 'CostMatrix 设置', true); m('map', 'PathFinder', 'PathFinder.CostMatrix', 'get', ['x', 'y'], 'CostMatrix 读取');
m('map', 'PathFinder', 'PathFinder.CostMatrix', 'clone', [], 'CostMatrix 复制'); m('map', 'PathFinder', 'PathFinder.CostMatrix', 'serialize', [], 'CostMatrix 序列化');
g('map', 'PathFinder', 'PathFinder.CostMatrix.deserialize', ['数据'], 'CostMatrix 反序列化', true);
g('mem', 'RawMemory', 'RawMemory.segments', null, '内存段'); g('mem', 'RawMemory', 'RawMemory.foreignSegment', null, '外部内存段');
g('mem', 'RawMemory', 'RawMemory.get', [], '读取原始 Memory', true); g('mem', 'RawMemory', 'RawMemory.set', ['字符串'], '写入原始 Memory', true, true);
g('mem', 'RawMemory', 'RawMemory.setActiveSegments', ['段号数组'], '激活内存段', true, true); g('mem', 'RawMemory', 'RawMemory.setActiveForeignSegment', ['玩家名', '段号'], '激活外部段', true, true);
g('mem', 'RawMemory', 'RawMemory.setDefaultPublicSegment', ['段号'], '默认公开段', true, true); g('mem', 'RawMemory', 'RawMemory.setPublicSegments', ['段号数组'], '设置公开段', true, true);
g('mem', 'InterShardMemory', 'InterShardMemory.getLocal', [], '读本 shard 数据', true); g('mem', 'InterShardMemory', 'InterShardMemory.setLocal', ['字符串'], '写本 shard 数据', true, true);
g('mem', 'InterShardMemory', 'InterShardMemory.getRemote', ['shard 名'], '读其他 shard 数据', true);
// ---- 补全：对象属性/方法（含已废弃）----
p('obj', '通用', 'roomObject', 'effects', '效果列表');
p('creep', '查询', CR, 'carry', '携带（已废弃）'); p('creep', '查询', CR, 'carryCapacity', '携带容量（已废弃）');
p('obj', 'Flag', 'flag', 'secondaryColor', '副颜色'); m('obj', 'Flag', 'flag', 'setColor', ['颜色', '副颜色'], '设置颜色', true);
p('obj', 'Nuke', 'nuke', 'launchRoomName', '发射房间'); p('obj', 'Nuke', 'nuke', 'timeToLand', '落地倒计时');
p('obj', 'Ruin', 'ruin', 'destroyTime', '摧毁时间'); p('obj', 'Ruin', 'ruin', 'structure', '原建筑');
m('room', '方法', 'room', 'lookAtArea', ['上', '左', '下', '右', '数组形式'], '查看区域');
m('room', '方法', 'room', 'lookForAtArea', ['类型', '上', '左', '下', '右', '数组形式'], '按类型查看区域');
g('room', '方法', 'Room.serializePath', ['路径'], '序列化路径', true); g('room', '方法', 'Room.deserializePath', ['字符串'], '反序列化路径', true);
m('room', '地形', 'terrain', 'getRawBuffer', [], '地形原始数据');
m('room', '视觉', 'room.visual', 'export', [], '导出房间视觉'); m('room', '视觉', 'room.visual', 'import', ['数据'], '导入房间视觉', true);
p('struct', '通用', 'structure', 'storeCapacity', '容量（已废弃）');
p('ctrl', '属性', 'controller', 'isPowerEnabled', '已启用 Power');
p('struct', '其他', 'invaderCore', 'ticksToDeploy', '部署倒计时'); p('struct', '其他', 'keeperLair', 'ticksToSpawn', '刷新倒计时');
p('struct', 'Lab', 'lab', 'mineralCapacity', '矿物容量（已废弃）');
p('struct', '其他', 'nuker', 'ghodium', 'G 储量（已废弃）'); p('struct', '其他', 'nuker', 'ghodiumCapacity', 'G 容量（已废弃）');
p('struct', '其他', 'powerBank / powerSpawn', 'power', 'power 储量'); p('struct', '其他', 'powerSpawn', 'powerCapacity', 'power 容量（已废弃）');
p('struct', '其他', 'portal', 'destination', '传送目的地');
m('spawn', '方法', 'spawn', 'canCreateCreep', ['身体', '名字'], '能否孵化（已废弃）'); m('spawn', '方法', 'spawn', 'createCreep', ['身体', '名字', '内存'], '孵化（已废弃）', true);
p('spawn', 'Spawning', 'spawn.spawning', 'directions', '出生方向');

// ---- 常量中文名（下拉里显示中文，值仍是官方常量）----
const CZH = {
  FIND_EXIT_TOP: '上方出口', FIND_EXIT_RIGHT: '右方出口', FIND_EXIT_BOTTOM: '下方出口', FIND_EXIT_LEFT: '左方出口', FIND_EXIT: '所有出口',
  FIND_CREEPS: '所有 creep', FIND_MY_CREEPS: '我的 creep', FIND_HOSTILE_CREEPS: '敌方 creep', FIND_SOURCES_ACTIVE: '有能量的能量源', FIND_SOURCES: '所有能量源',
  FIND_DROPPED_RESOURCES: '掉落的资源', FIND_STRUCTURES: '所有建筑', FIND_MY_STRUCTURES: '我的建筑', FIND_HOSTILE_STRUCTURES: '敌方建筑', FIND_FLAGS: '旗帜',
  FIND_CONSTRUCTION_SITES: '所有工地', FIND_MY_SPAWNS: '我的 Spawn', FIND_HOSTILE_SPAWNS: '敌方 Spawn', FIND_MY_CONSTRUCTION_SITES: '我的工地', FIND_HOSTILE_CONSTRUCTION_SITES: '敌方工地',
  FIND_MINERALS: '矿物', FIND_NUKES: '飞来的核弹', FIND_TOMBSTONES: '墓碑', FIND_POWER_CREEPS: '所有 Power Creep', FIND_MY_POWER_CREEPS: '我的 Power Creep', FIND_HOSTILE_POWER_CREEPS: '敌方 Power Creep',
  FIND_DEPOSITS: '沉积物', FIND_RUINS: '废墟',
  LOOK_CREEPS: 'creep', LOOK_ENERGY: '能量', LOOK_RESOURCES: '资源', LOOK_SOURCES: '能量源', LOOK_MINERALS: '矿物', LOOK_DEPOSITS: '沉积物', LOOK_STRUCTURES: '建筑', LOOK_FLAGS: '旗帜',
  LOOK_CONSTRUCTION_SITES: '工地', LOOK_NUKES: '核弹', LOOK_TERRAIN: '地形', LOOK_TOMBSTONES: '墓碑', LOOK_POWER_CREEPS: 'Power Creep', LOOK_RUINS: '废墟',
  STRUCTURE_SPAWN: 'Spawn', STRUCTURE_EXTENSION: '扩展', STRUCTURE_ROAD: '道路', STRUCTURE_WALL: '墙', STRUCTURE_RAMPART: '城墙', STRUCTURE_KEEPER_LAIR: '守卫巢穴', STRUCTURE_PORTAL: '传送门',
  STRUCTURE_CONTROLLER: '控制器', STRUCTURE_LINK: '链路', STRUCTURE_STORAGE: '仓库', STRUCTURE_TOWER: '防御塔', STRUCTURE_OBSERVER: '观察者', STRUCTURE_POWER_BANK: 'Power 银行',
  STRUCTURE_POWER_SPAWN: 'Power Spawn', STRUCTURE_EXTRACTOR: '采矿机', STRUCTURE_LAB: '实验室', STRUCTURE_TERMINAL: '终端', STRUCTURE_CONTAINER: '容器', STRUCTURE_NUKER: '核弹发射井',
  STRUCTURE_FACTORY: '工厂', STRUCTURE_INVADER_CORE: '入侵者核心',
  OK: '成功', ERR_NOT_OWNER: '不是你的', ERR_NO_PATH: '没有路', ERR_NAME_EXISTS: '名字已存在', ERR_BUSY: '正忙', ERR_NOT_FOUND: '没找到', ERR_NOT_ENOUGH_ENERGY: '能量不够',
  ERR_NOT_ENOUGH_RESOURCES: '资源不够', ERR_INVALID_TARGET: '目标无效', ERR_FULL: '已满', ERR_NOT_IN_RANGE: '距离太远', ERR_INVALID_ARGS: '参数无效', ERR_TIRED: '疲劳中',
  ERR_NO_BODYPART: '缺少身体部件', ERR_NOT_ENOUGH_EXTENSIONS: '扩展不够', ERR_RCL_NOT_ENOUGH: '控制器等级不够', ERR_GCL_NOT_ENOUGH: 'GCL 不够', ERR_ACCESS_DENIED: '无权访问',
  WORK: '工作', CARRY: '携带', MOVE: '移动', ATTACK: '近战攻击', RANGED_ATTACK: '远程攻击', HEAL: '治疗', CLAIM: '占领', TOUGH: '坚韧',
  TOP: '上', TOP_RIGHT: '右上', RIGHT: '右', BOTTOM_RIGHT: '右下', BOTTOM: '下', BOTTOM_LEFT: '左下', LEFT: '左', TOP_LEFT: '左上',
  TERRAIN_MASK_WALL: '墙', TERRAIN_MASK_SWAMP: '沼泽',
  RESOURCE_ENERGY: '能量', RESOURCE_POWER: 'Power', RESOURCE_OPS: '操作点 ops', RESOURCE_HYDROGEN: '氢 H', RESOURCE_OXYGEN: '氧 O', RESOURCE_UTRIUM: '钛 U', RESOURCE_LEMERGIUM: '铑 L',
  RESOURCE_KEANIUM: '钾 K', RESOURCE_ZYNTHIUM: '锌 Z', RESOURCE_CATALYST: '催化剂 X', RESOURCE_GHODIUM: '萃取物 G', RESOURCE_SILICON: '硅', RESOURCE_METAL: '金属', RESOURCE_BIOMASS: '生物质',
  RESOURCE_MIST: '雾', RESOURCE_UTRIUM_BAR: '钛条', RESOURCE_LEMERGIUM_BAR: '铑条', RESOURCE_ZYNTHIUM_BAR: '锌条', RESOURCE_KEANIUM_BAR: '钾条', RESOURCE_GHODIUM_MELT: '萃取物熔块',
  RESOURCE_OXIDANT: '氧化剂', RESOURCE_REDUCTANT: '还原剂', RESOURCE_PURIFIER: '净化剂', RESOURCE_BATTERY: '电池', RESOURCE_COMPOSITE: '复合材料', RESOURCE_CRYSTAL: '晶体', RESOURCE_LIQUID: '液体',
  RESOURCE_WIRE: '导线', RESOURCE_SWITCH: '开关', RESOURCE_TRANSISTOR: '晶体管', RESOURCE_MICROCHIP: '微芯片', RESOURCE_CIRCUIT: '电路', RESOURCE_DEVICE: '设备',
  RESOURCE_CELL: '细胞', RESOURCE_PHLEGM: '黏液', RESOURCE_TISSUE: '组织', RESOURCE_MUSCLE: '肌肉', RESOURCE_ORGANOID: '类器官', RESOURCE_ORGANISM: '有机体',
  RESOURCE_ALLOY: '合金', RESOURCE_TUBE: '管材', RESOURCE_FIXTURES: '配件', RESOURCE_FRAME: '框架', RESOURCE_HYDRAULICS: '液压件', RESOURCE_MACHINE: '机器',
  RESOURCE_CONDENSATE: '冷凝物', RESOURCE_CONCENTRATE: '浓缩物', RESOURCE_EXTRACT: '萃取液', RESOURCE_SPIRIT: '灵质', RESOURCE_EMANATION: '辐射物', RESOURCE_ESSENCE: '精华',
};
// 化合物：显示化学式（如 UH、XGHO2），就是游戏里的写法
function constZh(x) { if (CZH[x]) return CZH[x]; if (x.startsWith('RESOURCE_') && typeof SC !== 'undefined' && typeof SC[x] === 'string') return '化合物 ' + SC[x]; return x.replace(/^[A-Z]+_/, '').toLowerCase(); }

// ===== 常量 =====
const K = (pre) => Object.keys(SC).filter(x => x.startsWith(pre) && typeof SC[x] !== 'object').sort();
k('const', 'FIND', 'FIND_', K('FIND_'), '查找类型'); k('const', 'RESOURCE', 'RESOURCE_', K('RESOURCE_'), '资源');
k('const', 'STRUCTURE', 'STRUCTURE_', K('STRUCTURE_'), '建筑'); k('const', 'LOOK', 'LOOK_', K('LOOK_'), '查看类型');
k('const', '返回码', 'ERR_', ['OK', ...K('ERR_')], '返回码');
k('const', '部件/方向', 'BODY_', ['WORK', 'CARRY', 'MOVE', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM', 'TOUGH'], '身体部件');
k('const', '部件/方向', 'DIR_', ['TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT'], '方向');
k('const', '部件/方向', 'TERRAIN_', ['TERRAIN_MASK_WALL', 'TERRAIN_MASK_SWAMP'], '地形');

// ===== JS 对象工具（标准 JS，用来遍历 Game.creeps 这类对象）=====
def('api_js_values', { message0: '%1 里的全部对象', tooltip: 'Object.values(obj)', args0: [{ type: 'input_value', name: 'O' }], output: 'Array', inputsInline: true }, b => [`Object.values(${val(b, 'O', '{}')})`, OF], 'js', '对象');
def('api_js_keys', { message0: '%1 里的全部名字', tooltip: 'Object.keys(obj)', args0: [{ type: 'input_value', name: 'O' }], output: 'Array', inputsInline: true }, b => [`Object.keys(${val(b, 'O', '{}')})`, OF], 'js', '对象');
def('api_js_forin', { message0: '对 %2 里的每个名字 %1 %3 %4', tooltip: 'for (const name in obj)', args0: [{ type: 'field_variable', name: 'VAR', variable: 'creepName' }, { type: 'input_value', name: 'O' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, inputsInline: true },
  b => `for (${JS.getVariableName(b.getFieldValue('VAR'))} in ${val(b, 'O', '{}')}) {\n${JS.statementToCode(b, 'DO')}}\n`, 'js', '对象');
def('api_js_get', { message0: '%1 里名为 %2 的项', tooltip: 'obj[key]', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }], output: null, inputsInline: true }, b => [`${recv(b)}[${val(b, 'K', "''")}]`, OM], 'js', '对象');
def('api_js_set', { message0: '把 %1 里的 %2 设为 %3', tooltip: 'obj[key] = value', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `${recv(b)}[${val(b, 'K', "''")}] = ${val(b, 'V', 'null')};\n`, 'js', '对象');
def('api_js_obj', { message0: '空的数据表', tooltip: '{}', output: null }, () => ['{}', OA], 'js', '对象');
def('api_js_del', { message0: '从 %1 删除 %2', tooltip: 'delete obj[key]', args0: [{ type: 'input_value', name: 'O' }, { type: 'input_value', name: 'K' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `delete ${recv(b)}[${val(b, 'K', "''")}];\n`, 'js', '对象');
def('api_js_has', { message0: '%2 里有名为 %1 的项', tooltip: 'key in obj', args0: [{ type: 'input_value', name: 'K' }, { type: 'input_value', name: 'O' }], output: 'Boolean', inputsInline: true }, b => [`(${val(b, 'K', "''")} in ${JS.valueToCode(b, 'O', JS.ORDER_IN) || '{}'})`, OA], 'js', '对象');
def('api_js_prop', { message0: '%1 的属性 %2', tooltip: 'obj.prop', args0: [{ type: 'input_value', name: 'O' }, { type: 'field_input', name: 'P', text: 'length' }], output: null, inputsInline: true }, b => [`${recv(b)}.${b.getFieldValue('P').replace(/[^\w$]/g, '')}`, OM], 'js', '对象');
def('api_js_filter', { message0: '条件：建筑类型是 %1', tooltip: '{ filter: { structureType } }', args0: [{ type: 'input_value', name: 'T' }], output: null, inputsInline: true }, b => [`{ filter: { structureType: ${val(b, 'T', 'STRUCTURE_SPAWN')} } }`, OA], 'js', '选项');
def('api_js_log', { message0: '在控制台显示 %1', tooltip: 'console.log(x)', args0: [{ type: 'input_value', name: 'T' }], previousStatement: null, nextStatement: null, inputsInline: true }, b => `console.log(${val(b, 'T', "''")});\n`, 'js', '对象');

// ---- 实时对象选择积木（下拉列出当前游戏里真实存在的对象；生成官方写法）----
const qs = s => JSON.stringify(String(s));
function liveView() { try { return typeof view === 'function' ? view() : null; } catch (e) { return null; } }
const meId = () => (typeof myPid !== 'undefined' ? myPid : null);
const where = o => { try { return `${roomName(o.x, o.y)} · ${((o.x % 50) + 50) % 50},${((o.y % 50) + 50) % 50}`; } catch (e) { return ''; } };
function keepCur(out, f) { const cur = f && f.getValue ? f.getValue() : null; if (cur != null && cur !== '' && !out.some(o => o[1] === cur)) out.push([cur, cur]); if (!out.length) out.push(['（暂无）', '']); return out; }
// 实时下拉：选项来自当前游戏；存档里的名字即使现在不存在也照样保留（旧存档/其他世界不丢值）
class FieldLive extends Blockly.FieldDropdown { doClassValidation_(v) { return v == null ? null : String(v); } }
if (Blockly.fieldRegistry) Blockly.fieldRegistry.register('field_live', FieldLive);
function liveNames(kind) { return function () {
  const v = liveView(), me = meId(), out = kind === 'creep' ? [['当前 creep', '@cur']] : kind === 'room' ? [['当前 creep 所在房间', '@cur']] : [];
  if (v) {
    if (kind === 'spawn') for (const s of v.spawns || []) if (s.owner === me) out.push([s.name, s.name]);
    if (kind === 'creep') for (const c of v.creeps || []) if (c.owner === me) out.push([c.name, c.name]);
    if (kind === 'flag') for (const f of v.flags || []) if (f.owner === me) out.push([f.name, f.name]);
    if (kind === 'room') { const seen = new Set(); for (const o of [...(v.spawns || []), ...(v.controllers || []), ...(v.creeps || [])]) if (o.owner === me) { try { const n = roomName(o.x, o.y); if (!seen.has(n)) { seen.add(n); out.push([n, n]); } } catch (e) {} } }
  }
  return keepCur(out, this);
}; }
def('api_pick_spawn', { message0: 'Spawn %1', args0: [{ type: 'field_live', name: 'N', options: liveNames('spawn') }], output: null, tooltip: "Game.spawns['名字']" },
  b => [`Game.spawns[${qs(b.getFieldValue('N'))}]`, OM], 'spawn', '选择');
def('api_pick_creep', { message0: 'creep %1', args0: [{ type: 'field_live', name: 'N', options: liveNames('creep') }], output: null, tooltip: "creep / Game.creeps['名字']" },
  b => b.getFieldValue('N') === '@cur' ? ['creep', OA] : [`Game.creeps[${qs(b.getFieldValue('N'))}]`, OM], 'creep', '选择');
def('api_pick_room', { message0: '房间 %1', args0: [{ type: 'field_live', name: 'N', options: liveNames('room') }], output: null, tooltip: "creep.room / Game.rooms['名字']" },
  b => b.getFieldValue('N') === '@cur' ? ['creep.room', OM] : [`Game.rooms[${qs(b.getFieldValue('N'))}]`, OM], 'room', '选择');
def('api_pick_flag', { message0: '旗帜 %1', args0: [{ type: 'field_live', name: 'N', options: liveNames('flag') }], output: null, tooltip: "Game.flags['名字']" },
  b => [`Game.flags[${qs(b.getFieldValue('N'))}]`, OM], 'obj', '选择');
// 任意对象：先选种类，再从当前游戏里的实物中选（按编号取，Game.getObjectById）
const KINDS = [['防御塔', 'tower'], ['扩展', 'extension'], ['链路', 'link'], ['仓库', 'storage'], ['终端', 'terminal'], ['容器', 'container'], ['实验室', 'lab'], ['工厂', 'factory'],
  ['观察者', 'observer'], ['Power Spawn', 'powerSpawn'], ['核弹发射井', 'nuker'], ['采矿机', 'extractor'], ['城墙', 'rampart'], ['墙', 'constructedWall'], ['道路', 'road'], ['Spawn', 'spawn'],
  ['控制器', 'controller'], ['能量源', 'source'], ['矿物', 'mineral'], ['工地', 'site'], ['掉落资源', 'resource'], ['墓碑', 'tombstone'], ['核弹', 'nuke'], ['creep', 'creep'],
  ['守卫巢穴', 'keeperLair'], ['传送门', 'portal'], ['入侵者核心', 'invaderCore'], ['Power 银行', 'powerBank']];
const kindZh = k => (KINDS.find(x => x[1] === k) || [k])[0];
function myRoomSet(v, me) { const r = new Set(); for (const o of [...(v.spawns || []), ...(v.controllers || []), ...(v.creeps || [])]) if (o.owner === me) { try { r.add(roomName(o.x, o.y)); } catch (e) {} } return r; }
function liveObjs() {
  const v0 = liveView(), me = meId(), R = v0 ? myRoomSet(v0, me) : null, inMine = L => (L || []).filter(o => { try { return R.has(roomName(o.x, o.y)); } catch (e) { return true; } });
  const v = v0 && Object.assign({}, v0, { sources: inMine(v0.sources), minerals: inMine(v0.minerals), resources: inMine(v0.resources), tombstones: inMine(v0.tombstones), nukes: inMine(v0.nukes) }), kind = this.getSourceBlock() ? this.getSourceBlock().getFieldValue('KIND') : 'tower', out = [];
  if (v) {
    const add = (o, label) => out.push([`${label || kindZh(kind)} ${where(o)}`, String(o.id)]);
    if (kind === 'source') (v.sources || []).forEach(o => add(o));
    else if (kind === 'mineral') (v.minerals || []).forEach(o => add(o, '矿物 ' + o.type));
    else if (kind === 'controller') (v.controllers || []).filter(o => o.owner === me).forEach(o => add(o, '控制器 ' + o.level + ' 级'));
    else if (kind === 'site') (v.sites || []).filter(o => o.owner === me).forEach(o => add(o, '工地'));
    else if (kind === 'resource') (v.resources || []).forEach(o => add(o, '掉落 ' + o.amount));
    else if (kind === 'tombstone') (v.tombstones || []).forEach(o => add(o, '墓碑 ' + (o.creepName || '')));
    else if (kind === 'nuke') (v.nukes || []).forEach(o => add(o));
    else if (kind === 'creep') (v.creeps || []).filter(o => o.owner === me).forEach(o => add(o, o.name));
    else if (kind === 'spawn') (v.spawns || []).filter(o => o.owner === me).forEach(o => add(o, o.name));
    else (v.structures || []).filter(o => o.type === kind && (!o.owner || o.owner === me || ['keeperLair', 'portal', 'invaderCore', 'powerBank'].includes(kind))).forEach(o => add(o));
  }
  return keepCur(out, this);
}
def('api_pick_obj', { message0: '%1 %2', args0: [{ type: 'field_dropdown', name: 'KIND', options: KINDS }, { type: 'field_live', name: 'ID', options: liveObjs }], output: null, tooltip: 'Game.getObjectById(id)，列表是当前游戏里的实物' },
  b => b.getFieldValue('ID') ? [`Game.getObjectById(${qs(b.getFieldValue('ID'))})`, OF] : ['null', OA], 'obj', '选择');
if (Blockly.Blocks.api_pick_obj) { const init0 = Blockly.Blocks.api_pick_obj.init; Blockly.Blocks.api_pick_obj.init = function () { init0.call(this);
  this.getField('KIND').setValidator(v => { const idf = this.getField('ID'); if (idf && v !== this.getFieldValue('KIND')) { idf.setValue(''); setTimeout(() => { if (this.isDeadOrDying && this.isDeadOrDying()) return; if (idf.getValue() !== '') return; const o = idf.getOptions(false); if (o[0] && o[0][1]) idf.setValue(o[0][1]); }, 0); } return v; }); }; }
// ---- 选项表单（官方 options 对象）----
const ROLE_OPTS = [['不设角色', ''], ['采集者', 'harvester'], ['升级者', 'upgrader'], ['建造者', 'builder'], ['修理工', 'repairer'], ['搬运工', 'hauler'], ['守卫', 'defender'], ['治疗者', 'healer'], ['占领者', 'claimer']];
def('api_opt_spawn', { message0: '孵化选项 %1 角色 %2 %3 只检查能否孵化 %4', args0: [{ type: 'input_dummy' }, { type: 'field_dropdown', name: 'ROLE', options: ROLE_OPTS }, { type: 'input_dummy' }, { type: 'field_checkbox', name: 'DRY', checked: false }], output: null, tooltip: '{ memory: { role }, dryRun }' },
  b => { const r = b.getFieldValue('ROLE'), o = []; if (r) o.push(`memory: { role: ${qs(r)} }`); if (b.getFieldValue('DRY') === 'TRUE') o.push('dryRun: true'); return [`{ ${o.join(', ')} }`, OA]; }, 'spawn', '选项');
def('api_opt_move', { message0: '移动选项 %1 路径保留 %2 tick %3 无视其他 creep %4 %5 画出路线 %6', args0: [{ type: 'input_dummy' }, { type: 'field_number', name: 'R', value: 5, min: 0, precision: 1 }, { type: 'input_dummy' }, { type: 'field_checkbox', name: 'IC', checked: false }, { type: 'input_dummy' }, { type: 'field_checkbox', name: 'VIS', checked: true }], output: null, tooltip: '{ reusePath, ignoreCreeps, visualizePathStyle }' },
  b => { const o = [`reusePath: ${Number(b.getFieldValue('R')) || 0}`]; if (b.getFieldValue('IC') === 'TRUE') o.push('ignoreCreeps: true'); if (b.getFieldValue('VIS') === 'TRUE') o.push("visualizePathStyle: { stroke: '#ffffff' }"); return [`{ ${o.join(', ')} }`, OA]; }, 'creep', '选项');
const FILT = [['血量没满', 'o => o.hits < o.hitsMax'], ['还能装能量', 'o => o.store && o.store.getFreeCapacity(RESOURCE_ENERGY) > 0'], ['装有能量', 'o => o.store && o.store[RESOURCE_ENERGY] > 0'], ['是我的', 'o => o.my']];
def('api_opt_filter', { message0: '条件：%1', args0: [{ type: 'field_dropdown', name: 'F', options: FILT }], output: null, tooltip: '{ filter: 函数 }' },
  b => { const f = FILT.find(x => x[1] === b.getFieldValue('F')); return [`{ filter: ${f ? f[1] : FILT[0][1]} }`, OA]; }, 'pos', '选项');

// ---- 生成 flyout 内容：每个分类按子类加标签；动作类方法默认包在「执行」里 ----
const VAR = (n) => ({ block: { type: 'variables_get', fields: { VAR: { name: n } } } });
const TXT = (t) => ({ shadow: { type: 'text', fields: { TEXT: t } } });
const PK = (t, f) => ({ block: Object.assign({ type: t }, f ? { fields: f } : {}) });
const PKI = (t, inputs) => ({ block: { type: t, inputs } });
const OBJKIND = { structure: 'spawn', tower: 'tower', link: 'link', lab: 'lab', terminal: 'terminal', container: 'container', observer: 'observer', factory: 'factory', powerSpawn: 'powerSpawn',
  'powerBank / powerSpawn': 'powerSpawn', nuker: 'nuker', rampart: 'rampart', source: 'source', mineral: 'mineral', site: 'site', resource: 'resource', tombstone: 'tombstone', nuke: 'nuke',
  ruin: 'tower', deposit: 'source', roomObject: 'source', controller: 'controller', invaderCore: 'invaderCore', keeperLair: 'keeperLair', portal: 'portal' };
// 接收者 → 中文可选积木（不再出现代码表达式）
function recvInput(rn) {
  if (!rn) return undefined;
  const creep = () => PK('api_pick_creep', { N: '@cur' }), spawn = () => PK('api_pick_spawn', { N: 'Spawn1' }), room = () => PK('api_pick_room', { N: '@cur' });
  if (rn === 'creep') return creep();
  if (rn === 'room') return room();
  if (rn === 'spawn' || rn === "Game.spawns['Spawn1']") return spawn();
  if (rn === 'flag') return PK('api_pick_flag', { N: 'Flag1' });
  if (rn === 'creep.store') return PKI('api_creep_p_store', { O: creep() });
  if (rn === 'creep.pos') return PKI('api_creep_p_pos', { O: creep() });
  if (rn === 'creep.room.controller') return PKI('api_room_p_controller', { O: room() });
  if (rn === "Game.spawns['Spawn1'].spawning" || rn === 'spawn.spawning') return PKI('api_spawn_p_spawning', { O: spawn() });
  if (rn === 'room.getTerrain()' || rn === 'terrain') return PKI('api_room_getTerrain_0', { O: room() });
  if (rn === 'PathFinder.CostMatrix') return PK('api_map_g_new_PathFinder_CostMatrix_0');
  if (OBJKIND[rn]) return PK('api_pick_obj', { KIND: OBJKIND[rn] });
  if (/^[a-z]\w*$/i.test(rn)) return VAR(rn);
  return { block: { type: 'api_js_prop_raw', fields: { E: rn } } };
}
// 参数默认值：按参数含义放好中文下拉/表单
function argInput(n) {
  const C = (t) => ({ shadow: { type: t } });
  if (/FIND_/.test(n)) return { block: { type: 'api_const_find', fields: { K: 'FIND_SOURCES' } } };
  if (/LOOK_|^类型$/.test(n)) return { block: { type: 'api_const_look' } };
  if (n === '资源类型' || n === '资源') return { block: { type: 'api_const_resource', fields: { K: 'RESOURCE_ENERGY' } } };
  if (n === '建筑类型') return { block: { type: 'api_const_structure', fields: { K: 'STRUCTURE_EXTENSION' } } };
  if (n === '部件类型') return { block: { type: 'api_const_body', fields: { K: 'WORK' } } };
  if (n === '方向') return { block: { type: 'api_const_dir' } };
  if (n === '身体') return { block: { type: 'api_body' } };
  if (n === 'x' || n === 'y' || n === '数量' || n === '范围' || n === '上' || n === '左' || n === '下' || n === '右') return { shadow: { type: 'math_number', fields: { NUM: n === '数量' ? 50 : n === '范围' ? 3 : 25 } } };
  if (n === '公开' || n === '开启' || n === '数组形式' || n === '是否启用') return C('logic_boolean');
  if (n === '名字' || n === '消息' || n === '文本' || n === '新名字' || n === '方法名') return { shadow: { type: 'text', fields: { TEXT: n === '方法名' ? 'move' : '' } } };
  if (n === '房间名' || n === '房间' || n === '目标房间' || n === '起点房间' || n === '终点房间' || n === '房间1' || n === '房间2') return { shadow: { type: 'text', fields: { TEXT: 'W1N1' } } };
  if (n === 'creep') return { block: { type: 'api_pick_creep' } };
  if (n === '控制器') return PKI('api_room_p_controller', { O: { block: { type: 'api_pick_room' } } });
  if (n === '选项') return { block: { type: 'api_opt_filter' } };
  return undefined;
}
const SUBZH = { 'Game.map': '地图', 'Game.market': '市场', 'Game.cpu': 'CPU', 'Game.map.visual': '地图视觉', PathFinder: '寻路', RawMemory: '原始记忆', InterShardMemory: '跨分片记忆',
  Store: '存储', Spawning: '孵化进度', Tower: '防御塔', Link: '链路', Container: '容器', Terminal: '终端', Lab: '实验室', Source: '能量源', Mineral: '矿物', ConstructionSite: '工地',
  Resource: '掉落资源', Tombstone: '墓碑', Flag: '旗帜', Nuke: '核弹', Ruin: '废墟', Deposit: '沉积物', FIND: '查找什么', RESOURCE: '资源', STRUCTURE: '建筑类型', LOOK: '看什么', '部件/方向': '部件与方向' };
// 接收者是复杂表达式（如 Game.spawns['Spawn1']）时用的原样表达式积木
def('api_js_prop_raw', { message0: '对象 %1', tooltip: '直接写的对象表达式（旧存档兼容）', args0: [{ type: 'field_input', name: 'E', text: 'Game' }], output: null }, b => [b.getFieldValue('E').replace(/[;\n]/g, ''), OM], 'js', '对象');
function flyoutFor(c) {
  if (c.items) return c.items;
  if (c.custom) return c.custom;
  if (c.std) return c.std.map(t => ({ kind: 'block', type: t }));
  const out = []; let sub = null;
  const list = API.filter(x => x.cat === c.id && x.type !== 'api_js_prop_raw'), first = list.filter(x => x.sub === '选择' || x.sub === '选项');
  for (const a of [...first, ...list.filter(x => !first.includes(x))]) {
    if (a.sub !== sub) { sub = a.sub; out.push({ kind: 'label', text: SUBZH[sub] || sub }); }
    const inputs = {}; const pr = a.preset || {};
    if (pr.O) inputs.O = recvInput(pr.O);
    if (pr.K) inputs.K = TXT(pr.K); if (pr.A0) inputs.A0 = TXT(pr.A0);
    (pr.args || []).forEach((n, i) => { if (!inputs['A' + i]) { const d = argInput(n); if (d) inputs['A' + i] = d; } });
    if (a.type === 'api_spawn_spawnCreep_3') inputs.A2 = { block: { type: 'api_opt_spawn', fields: { ROLE: 'harvester' } } };
    if (a.type === 'api_creep_moveTo_1') { /* 目标 */ inputs.A0 = { block: { type: 'api_pick_obj', fields: { KIND: 'source' } } }; }
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
let DEFAULT_WS = { blocks: { languageVersion: 0, blocks: [Object.assign(spawnStmt.block, { x: 16, y: 16,
  next: B('api_js_forin', { O: B('api_game_g_Game_creeps_p'), DO: body }, { VAR: { name: 'creepName' } }) })] } };
