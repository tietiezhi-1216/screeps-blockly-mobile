// 官方客户端对象外观（screeps/renderer 的 metadata/src/objects/*.metadata.js + metadata/images/*.svg → 预栅格化 PNG，ISC 许可，见 art/obj/LICENSE.txt）。
// 尺寸单位：格（官方 metadata 里 100 = 1 格）。贴图按官方 tint 着色：自己的建筑用玩家色（默认白），他人 #FF7777。
const ART = (() => {
  const NAMES = ['extension', 'extension-border50', 'extension-border100', 'extension-border200', 'tower-base', 'tower-rotatable', 'tower-rotatable-npc', 'storage', 'storage-border', 'link', 'link-border', 'link-energy', 'extractor', 'lab', 'terminal', 'terminal-border', 'terminal-arrows', 'factory', 'factory-border', 'factory-lvl0', 'nuker', 'nuker-border', 'controller', 'controller-level', 'invaderCore', 'powerBank', 'flag', 'flag-secondary', 'creep-npc', 'ruin', 'tombstone', 'tombstone-border', 'nuke', 'deposit-biomass', 'deposit-biomass-fill', 'deposit-metal', 'deposit-metal-fill', 'deposit-mist', 'deposit-mist-fill', 'deposit-silicon', 'deposit-silicon-fill'];
  // 加载预先栅格化的 PNG（scripts/raster-art.cjs 由官方 SVG 生成）：Android WebView 里 SVG 当 <img> 解码不可靠，PNG 与 glow.png 同一条加载路径。
  // 每张图显式 256×256，decode() 完成才算就绪；加载失败的记进 failed（测试会检查），失败的图层改画后备图形，对象不会变成看不见。
  const img = {}, cbs = [], failed = []; let n = 0, ok = false;
  const done = () => { if (++n === NAMES.length) { ok = true; cbs.splice(0).forEach(f => { try { f(); } catch (e) {} }); } };
  NAMES.forEach(k => { const i = new Image(256, 256); let fin = false; const end = good => { if (fin) return; fin = true; if (!good) { i._bad = true; failed.push(k); } done(); };
    i.onload = () => (i.decode ? i.decode().then(() => end(i.naturalWidth > 0), () => end(i.naturalWidth > 0)) : end(i.naturalWidth > 0)); i.onerror = () => end(false);
    i.src = 'art/obj/' + k + '.png'; img[k] = i; });
  const usable = k => { const i = img[k]; return !!(i && !i._bad && i.complete && i.naturalWidth > 0); };
  const tinted = new Map();
  // 着色贴图只在原图可用时缓存；原图还没加载好时返回空画布但不缓存（v1.9.4 以前会把空画布永久缓存）
  function tint(k, col) { const key = k + '|' + col; let c = tinted.get(key); if (c) return c; const i = img[k]; c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    if (!usable(k)) return c;
    try { g.drawImage(i, 0, 0, 256, 256); if (col) { g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0, 256, 256); } } catch (e) { return c; }
    tinted.set(key, c); return c; }
  // 官方 creep-npc.svg 的同一几何（100 见方：五边形，填充 #f93842，描边 #300000 宽 12），直接用矢量画，不依赖贴图
  function npcShape(g, size = 1) { g.save(); g.scale(size / 100, size / 100); g.beginPath(); g.moveTo(-30, 15); g.lineTo(0, -35); g.lineTo(30, 15); g.lineTo(20, 35); g.lineTo(-20, 35); g.closePath(); g.lineJoin = 'miter'; g.lineWidth = 12; g.strokeStyle = '#300000'; g.stroke(); g.fillStyle = '#f93842'; g.fill(); g.restore(); }
  // 贴图不可用时的后备：按图层大小画一个描边圆（玩家色 / 灰），保证对象看得见
  function fallback(g, size, col, dx, dy) { g.save(); g.beginPath(); g.arc(dx, dy, size * .34, 0, Math.PI * 2); g.fillStyle = '#111111'; g.fill(); g.lineWidth = size * .06; g.strokeStyle = col || '#9e9e9e'; g.stroke(); g.restore(); }
  // 画一层官方贴图：size 格见方，中心在 (dx, dy)
  function L(g, k, size, col, dx = 0, dy = 0, alpha = 1) { if (!ok) return; if (!usable(k)) { if (!/-(border|fill|arrows|lvl0|energy|secondary|level)/.test(k)) fallback(g, size, col, dx, dy); return; } g.save(); g.globalAlpha = alpha; g.drawImage(tint(k, col), dx - size / 2, dy - size / 2, size, size); g.restore(); }
  const circle = (g, r, fill, stroke, lw, a = 1) => { g.save(); g.globalAlpha = a; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } g.restore(); };
  const rrect = (g, w, h, r, fill, stroke, lw) => { g.beginPath(); g.roundRect ? g.roundRect(-w / 2, -h / 2, w, h, r) : g.rect(-w / 2, -h / 2, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  const MIN = { L: ['#89F4A5', '#3F6147'], U: ['#88D6F7', '#1B617F'], K: ['#9370FF', '#331A80'], Z: ['#F2D28B', '#594D33'], X: ['#FF7A7A', '#4F2626'], O: ['#CCCCCC', '#4D4D4D'], H: ['#CCCCCC', '#4D4D4D'] };
  const FLAG = [null, '#F44336', '#9C27B0', '#2196F3', '#00BCD4', '#4CAF50', '#FFEB3B', '#FF9800', '#795548', '#9E9E9E', '#FFFFFF'];
  const FLAG_ZH = [null, '红', '紫', '蓝', '青', '绿', '黄', '橙', '棕', '灰', '白'];
  // 每种对象：{ key, w, h, draw(g) }；o = { mine, npc, cap, level, mineral, color, secondaryColor, depositType }
  function spec(type, o = {}) {
    const pc = o.mine === false ? '#ff7777' : '#ffffff', k = type + '|' + pc;
    switch (type) {
      case 'spawn': return { key: k, w: 1.4, h: 1.4, draw: g => { circle(g, .70, '#cccccc'); circle(g, .59, '#181818'); circle(g, .38, '#555555'); } };
      case 'extension': { const c = o.cap >= 200 ? 200 : o.cap >= 100 ? 100 : 50, s = c === 200 ? 1 : c === 100 ? .8 : .68; return { key: k + c, w: 1, h: 1, size: s, draw: g => { L(g, 'extension-border' + c, 1, pc); L(g, 'extension', s); } }; }
      case 'tower': return { key: k, w: 2, h: 2, draw: g => L(g, 'tower-base', 2, pc) };
      case 'storage': return { key: k, w: 2, h: 2, draw: g => { L(g, 'storage-border', 2, pc); L(g, 'storage', 2); } };
      case 'container': return { key: 'container', w: .7, h: .8, draw: g => { g.fillStyle = '#181818'; g.fillRect(-.3, -.35, .6, .7); g.fillStyle = '#555555'; g.fillRect(-.2, -.25, .4, .5); } };
      case 'link': return { key: k, w: 1, h: 1, draw: g => { L(g, 'link-border', 1, pc); L(g, 'link', 1); } };
      case 'extractor': return { key: k, w: 2, h: 2, draw: g => L(g, 'extractor', 2, pc) };
      case 'lab': return { key: k, w: 2, h: 2, draw: g => L(g, 'lab', 2, pc) };
      case 'terminal': return { key: k, w: 2, h: 2, draw: g => { L(g, 'terminal-border', 2, pc); L(g, 'terminal', 2); L(g, 'terminal-arrows', 2); } };
      case 'factory': return { key: k, w: 2, h: 2, draw: g => { L(g, 'factory-border', 2, pc); L(g, 'factory', 2); L(g, 'factory-lvl0', 2); } };
      case 'observer': return { key: k, w: 1, h: 1, draw: g => { g.beginPath(); g.ellipse(0, 0, .45, .40, 0, 0, Math.PI * 2); g.fillStyle = '#111111'; g.fill(); g.strokeStyle = pc; g.lineWidth = .05; g.stroke(); g.beginPath(); g.ellipse(0, 0, .2, .2, 0, 0, Math.PI * 2); g.fillStyle = pc; g.fill(); } };
      case 'powerSpawn': return { key: k, w: 1.6, h: 1.6, draw: g => { circle(g, .75, '#222222', '#cccccc', .07); circle(g, .68, '#222222', '#f41f33', .10); circle(g, .59, '#181818'); circle(g, .38, '#555555'); } };
      case 'nuker': return { key: k, w: 3, h: 3, draw: g => { L(g, 'nuker-border', 3, pc, 0, -.4); L(g, 'nuker', 3, null, 0, -.4); } };
      case 'controller': { const lv = o.level || 0, lit = o.owner ? (o.mine === false ? '#ff7777' : null) : null; return { key: 'ctrl' + lv + (lit || ''), w: 2, h: 2, draw: g => { L(g, 'controller', 2, '#000000');
        for (let i = 0; i < lv; i++) { g.save(); g.rotate(i * Math.PI / 4); if (ok && usable('controller-level')) g.drawImage(tint('controller-level', lit), -.5, -1, 1, 1); g.restore(); }
        circle(g, .37, '#222222'); circle(g, .40, null, '#080808', .10); } }; }
      case 'constructionSite': return { key: 'site' + pc, w: .6, h: .6, draw: g => circle(g, .2, null, pc, .1, .4) };
      case 'source': return { key: 'source', w: 1, h: 1, draw: g => rrect(g, .4, .4, .15, '#111111', '#595026', .15) };
      case 'mineral': { const [fg, bg] = MIN[o.mineral] || MIN.H; return { key: 'min' + o.mineral, w: 1.3, h: 1.3, draw: g => { circle(g, .54, bg, fg, .10); g.fillStyle = fg; g.font = 'bold .82px Roboto, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.mineral || '', 0, .05); } }; }
      case 'keeperLair': return { key: 'lair', w: 1.3, h: 1.3, draw: g => { circle(g, .6, '#000000'); circle(g, .5, '#780207'); circle(g, .3, '#000000'); } };
      case 'invaderCore': return { key: 'core', w: 2, h: 2, draw: g => L(g, 'invaderCore', 2) };
      case 'powerBank': return { key: 'pbank', w: 2, h: 2, draw: g => L(g, 'powerBank', 2) };
      case 'portal': return { key: 'portal', w: 1, h: 1, draw: g => { circle(g, .45, '#111133', null, 0, .5); circle(g, .40, '#61c0ed', null, 0, .5); circle(g, .25, '#111133', null, 0, .5); } };
      case 'flag': { const a = FLAG[o.color] || FLAG[10], b = FLAG[o.secondaryColor] || a; return { key: 'flag' + a + b, w: 2, h: 2, draw: g => { L(g, 'flag', 2, a); L(g, 'flag-secondary', 2, b); } }; }
      case 'ruin': return { key: 'ruin', w: 1, h: 1, draw: g => L(g, 'ruin', 1) };
      case 'tombstone': return { key: 'tomb', w: 1, h: 1, draw: g => { L(g, 'tombstone-border', 1, '#ffffff'); L(g, 'tombstone', 1); } };
      case 'nuke': return { key: 'nuke', w: 1, h: 1, draw: g => L(g, 'nuke', 1) };
      case 'deposit': { const d = o.depositType || 'silicon'; return { key: 'dep' + d, w: 1.6, h: 1.6, draw: g => { const c = { biomass: '#84b012', metal: '#956f5c', mist: '#da6bf5', silicon: '#4ca7e5' }[d]; L(g, 'deposit-' + d + '-fill', 1.6, c, 0, 0, .5); L(g, 'deposit-' + d, 1.6, c); } }; }
      case 'road': return { key: 'road', w: 1, h: 1, draw: g => { g.strokeStyle = '#666666'; g.lineWidth = .15; g.lineCap = 'round'; g.beginPath(); g.moveTo(-.4, .4); g.lineTo(.4, -.4); g.stroke(); } };
      case 'constructedWall': return { key: 'cwall', w: 1, h: 1, draw: g => { g.fillStyle = '#111111'; g.fillRect(-.5, -.5, 1, 1); g.strokeStyle = '#4a4a4a'; g.lineWidth = .06; g.strokeRect(-.47, -.47, .94, .94); } };
      case 'rampart': return { key: 'ramp' + (o.mine === false ? 'h' : 'm'), w: 1, h: 1, draw: g => { const c = o.mine === false ? '255,68,68' : '68,255,68'; g.fillStyle = `rgba(${c},.25)`; g.fillRect(-.5, -.5, 1, 1); g.strokeStyle = `rgba(${c},.85)`; g.lineWidth = .08; g.strokeRect(-.46, -.46, .92, .92); } };
    }
    return null;
  }
  // 建造菜单小图标：按对象外框缩放到 px 见方
  const icons = new Map();
  function icon(type, o = {}, px = 40) { const a = spec(type, o); if (!a || !ok) return ''; const key = a.key + px; if (icons.has(key)) return icons.get(key);
    const c = document.createElement('canvas'); c.width = c.height = px * 2; const g = c.getContext('2d'), fit = { tower: 1.5, lab: 1.45, nuker: 2.6, flag: 1.4, constructionSite: .7, constructedWall: 1.1, rampart: 1.1, road: 1.1, container: 1 }[type] || Math.max(a.w, a.h, 1);
    g.translate(px, px); g.scale(px * 2 / fit, px * 2 / fit); g.lineJoin = 'round';
    if (type === 'tower') { a.draw(g); g.drawImage(tint(o.npc ? 'tower-rotatable-npc' : 'tower-rotatable'), -.575, -.575, 1.15, 1.15); } else a.draw(g);
    if (type === 'spawn' || type === 'powerSpawn') circle(g, .38, '#5973FF');
    if (type === 'extension') circle(g, (a.size || .68) * .32, '#ffe56d');
    if (type === 'source') rrect(g, .6, .6, .15, '#ffe56d');
    const u = c.toDataURL(); icons.set(key, u); return u; }
  return { spec, icon, tint, npcShape, usable, NAMES, failed, ready: f => ok ? f() : cbs.push(f), get ok() { return ok; }, FLAG, FLAG_ZH, MIN };
})();
