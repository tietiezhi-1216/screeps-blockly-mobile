// 高级积木：中文自然语言显示（不出现点号/括号/代码名）、全部可放入工作区生成代码、旧存档生成的代码与改版前一致
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const W = p => fs.readFileSync(path.join(__dirname, '../www', p), 'utf8');
vm.runInThisContext(W('screeps-const.js') + W('worldgen.js') + W('engine.js') + W('engine-ext.js'));
global.window = globalThis; global.Blockly = require('blockly'); Blockly.JavaScript = require('blockly/javascript').javascriptGenerator;
require('blockly/msg/zh-hans');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
vm.runInThisContext(W('blocks.js') + '\n' + W('blocks-easy.js') + '\nglobalThis.__CATS = CATS; globalThis.__API = API; globalThis.__flyout = flyoutFor;');
// 旧存档：改版前（v1.8.1 新手积木提交 7ce648e）的入门程序 + 全部高级积木，保存时生成的代码
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/adv-old-save.json'), 'utf8'));
const ws = new Blockly.Workspace(); Blockly.serialization.workspaces.load(FX.save, ws);
assert(ws.getAllBlocks(false).length > 900, '旧存档全部积木都能载入：' + ws.getAllBlocks(false).length);
const code = Blockly.JavaScript.workspaceToCode(ws);
assert(code === FX.code, '旧存档载入后生成的代码与改版前逐字一致');
// 每个高级积木的显示文字
const bad = [];
for (const a of __API) { if (a.type === 'api_js_prop_raw') continue; const j = Blockly.Blocks[a.type]; const w2 = new Blockly.Workspace(); const b = w2.newBlock(a.type);
  const txt = b.inputList.map(i => i.fieldRow.map(f => f.getText ? f.getText() : '').join(' ')).join(' ');
  if (/[.()\[\]{}=]|\bGame\b|\bMemory\b|\bconsole\b|\bfor\b|\bnew\b|\bObject\b|_/.test(txt.replace(/\d+(\.\d+)?/g, ''))) bad.push(a.type + ': ' + txt); }
assert(!bad.length, `${__API.length} 个高级积木显示为中文自然语言` + (bad.length ? '\n' + bad.join('\n') : ''));
// flyout 里每个积木都能放进工作区并生成可编译代码
let n = 0;
for (const c of __CATS.filter(c => c.adv && !c.std && !c.custom)) for (const it of __flyout(c)) { if (it.kind !== 'block') continue;
  const w3 = new Blockly.Workspace(); const b = Blockly.serialization.blocks.append(Object.assign({}, it, { kind: undefined }), w3);
  let c2 = Blockly.JavaScript.workspaceToCode(w3); if (b.outputConnection) c2 = 'var __x = ' + c2.trim() + ';';
  try { new Function('creep', 'room', c2); } catch (e) { assert(false, it.type + ' 生成代码无法编译: ' + e.message + '\n' + c2); } n++; }
assert(n > 250, `高级分类 ${n} 个积木都能生成可编译代码`);
// 常量下拉显示中文，值仍是官方常量
const kb = new Blockly.Workspace().newBlock('api_const_find'); const opts = kb.getField('K').getOptions();
assert(opts.every(([t, v]) => /^FIND_/.test(v) && !/FIND_/.test(t)), '查找类型下拉显示中文、值为官方常量');
const rb = new Blockly.Workspace().newBlock('api_const_resource'); assert(rb.getField('K').getOptions().every(([t]) => !/RESOURCE_/.test(t)), '资源下拉显示中文');
// 身体部件旧值（大写）兼容
const w4 = new Blockly.Workspace(); Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: 'api_body', fields: { B: 'WORK,WORK,CARRY,MOVE' } }] } }, w4);
assert(Blockly.JavaScript.workspaceToCode(w4).trim() === '[WORK, WORK, CARRY, MOVE];' || /\[WORK, WORK, CARRY, MOVE\]/.test(Blockly.JavaScript.workspaceToCode(w4)), '身体部件表单兼容旧存档');
