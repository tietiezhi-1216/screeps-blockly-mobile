// 新手积木：默认入门程序生成的代码在引擎里跑通（孵化 → 采集 → 送能量 → 升级控制器），并检查每个新手积木都能生成可编译的代码
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
global.window = globalThis; global.Blockly = require('blockly'); Blockly.JavaScript = require('blockly/javascript').javascriptGenerator;
require('blockly/msg/zh-hans');
vm.runInThisContext(W('blocks.js') + '\n' + W('blocks-easy.js') + '\nglobalThis.__DEF = DEFAULT_WS; globalThis.__CATS = CATS;');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const ws = new Blockly.Workspace(); Blockly.serialization.workspaces.load(__DEF, ws);
const code = Blockly.JavaScript.workspaceToCode(ws);
assert(!/Game\.spawns\['Spawn1'\]/.test(code) && code.includes('sbmKeep(') && code.includes("'upgradeController'"), '默认程序只用新手积木生成');
assert(describeProgram(ws).some(l => l.includes('采集者')), '白话说明含角色');
// 每个新手积木单独放进「对每个 creep」里都能编译
for (const e of EASY_BLOCKS) { const w2 = new Blockly.Workspace(); const b = w2.newBlock(e.type); let c;
  if (b.outputConnection) { const i = w2.newBlock('controls_if'); i.getInput('IF0').connection.connect(b.outputConnection); const p = w2.newBlock('e_each'); p.getInput('DO').connection.connect(i.previousConnection); }
  c = Blockly.JavaScript.workspaceToCode(w2); try { compileUser(c); } catch (err) { assert(false, e.type + ' 编译失败: ' + err.message + '\n' + c); } }
assert(true, `${EASY_BLOCKS.length} 个新手积木都能生成可编译代码`);
assert(__CATS.filter(c => !c.adv).length >= 6 && __CATS.some(c => c.adv && c.id === 'creep'), '默认分类为新手积木，完整 API 在「高级」');
// 引擎里跑
const e = new Engine(newWorld(7)); e.addPlayer('p1', 'T'); const w = e.w; e.setCode('p1', code);
const ctrl = () => w.controllers.find(c => c.owner === 'p1');
const logs = []; e.onLog = (pid, s) => logs.push(s);
let maxCreeps = 0, prog0 = null;
for (let i = 0; i < 1500; i++) { e.tick(); maxCreeps = Math.max(maxCreeps, w.creeps.filter(c => c.owner === 'p1').length); if (i === 0) prog0 = ctrl() && (ctrl().progress || 0); }
const errs = logs.filter(s => /错误|Error/i.test(s)); assert(!errs.length, '运行无报错 ' + (errs[0] || ''));
const roles = Object.values((w.memory.p1 || {}).creeps || {}).map(m => m.role);
assert(maxCreeps >= 4, '按「保持数量」孵化了 creep：' + maxCreeps + ' 角色 ' + [...new Set(roles)].join(','));
const c = ctrl(); assert(c && (c.level > 1 || c.progress > prog0), `控制器在升级：等级 ${c.level} 进度 ${c.progress}`);
console.log('ok - 入门程序在引擎里跑通');
