// 高级积木截图（横屏 + 竖屏）：分类积木列表、示例程序、实时对象下拉、常量下拉、身体部件表单
const p = require('puppeteer-core'); const W = ms => new Promise(r => setTimeout(r, ms)); const O = '/workspace/shots-adv/';
const PORT = process.env.PORT || 8797;
const B = (type, inputs, fields) => ({ block: Object.assign({ type }, inputs ? { inputs } : {}, fields ? { fields } : {}) });
const CUR = () => B('api_pick_creep', null, { N: '@cur' }), POS = () => B('api_creep_p_pos', { O: CUR() });
const stmts = [
  B('api_spawn_spawnCreep_3', { O: B('api_pick_spawn', null, { N: 'Spawn1' }), A0: B('api_body', null, { B: 'work,work,carry,move' }), A1: { shadow: { type: 'text', fields: { TEXT: '采集者1' } } }, A2: B('api_opt_spawn', null, { ROLE: 'harvester' }) }),
  B('api_creep_harvest_1', { O: CUR(), A0: B('api_pos_findClosestByPath_1', { O: POS(), A0: B('api_const_find', null, { K: 'FIND_SOURCES_ACTIVE' }) }) }),
  B('api_struct_attack_1', { O: B('api_pick_obj', null, { KIND: 'tower' }), A0: B('api_pos_findClosestByRange_1', { O: POS(), A0: B('api_const_find', null, { K: 'FIND_HOSTILE_CREEPS' }) }) }),
  B('api_creep_transfer_2', { O: CUR(), A0: B('api_pick_spawn', null, { N: 'Spawn1' }), A1: B('api_const_resource', null, { K: 'RESOURCE_ENERGY' }) }),
].map(e => B('api_do', { E: e }));
for (let i = stmts.length - 2; i >= 0; i--) stmts[i].block.next = stmts[i + 1];
const DEMO = { blocks: { languageVersion: 0, blocks: [Object.assign(stmts[0].block, { x: 16, y: 16 })] } };
async function run(b, vw, vh, tag) { const errs = [];
  const pg = await b.newPage(); await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('sbm_intro', '1'); const F = window.fetch; window.fetch = (u, o) => String(u).includes('api.github.com') ? Promise.reject(new Error('x')) : F(u, o); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await W(1200); await pg.tap('#sPlay'); await W(500);
  await pg.evaluate(() => { document.querySelectorAll('.shDlg').forEach(d => d.remove()); try { engine.placeSpawn(myPid); for (let i = 0; i < 3; i++) engine.tick(); _snap = null; } catch (e) {} $('wmap').classList.add('hidden'); $('btnCode').click(); });
  await W(600); await pg.evaluate(() => setAdv(true));
  for (const [i, c] of [['1', 'creep'], ['2', 'spawn'], ['3', 'struct'], ['4', 'room'], ['5', 'const']]) { await pg.evaluate(c => selectCat(c), c); await W(500); await pg.screenshot({ path: O + `${tag}-${i}-cat-${c}.png` }); }
  await pg.evaluate(D => { closeFlyout(); ws.clear(); Blockly.serialization.workspaces.load(D, ws); ws.setScale(0.7); ws.scroll(10, 10); }, DEMO); await W(500);
  await pg.screenshot({ path: O + tag + '-6-demo-program.png' });
  await pg.evaluate(() => (b => { b.setFieldValue('source', 'KIND'); return b; })(ws.getAllBlocks(false).find(b => b.type === 'api_pick_obj')).getField('ID').showEditor_()); await W(400); await pg.screenshot({ path: O + tag + '-7-live-object-dropdown.png' });
  await pg.evaluate(() => { Blockly.DropDownDiv.hideWithoutAnimation(); ws.getAllBlocks(false).find(b => b.type === 'api_const_resource').getField('K').showEditor_(); }); await W(400); await pg.screenshot({ path: O + tag + '-8-resource-dropdown.png' });
  await pg.evaluate(() => { Blockly.DropDownDiv.hideWithoutAnimation(); ws.getAllBlocks(false).find(b => b.type === 'api_body').getField('B').showEditor_(); }); await W(400); await pg.screenshot({ path: O + tag + '-9-body-form.png' });
  await pg.evaluate(() => { document.getElementById('bodyForm')?.remove(); previewShow('code'); }); await W(300); await pg.screenshot({ path: O + tag + '-10-preview-code.png' });
  const code = await pg.evaluate(() => Blockly.JavaScript.workspaceToCode(ws));
  await pg.close(); return { tag, errs, code };
}
(async () => { const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const R = [await run(b, 915, 412, 'landscape'), await run(b, 412, 915, 'portrait')]; console.log(JSON.stringify(R, null, 1)); await b.close(); })();
