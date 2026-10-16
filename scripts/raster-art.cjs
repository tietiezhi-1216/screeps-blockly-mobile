// 把官方 SVG 贴图（assets-art/obj-svg/*.svg）预先栅格化成 256×256 PNG，App 里只加载 PNG。
// 原因：Android WebView 里 SVG 作为 <img> 解码/绘制到 canvas 不可靠，PNG 与 glow.png 同一路径加载最稳。用法：node scripts/raster-art.cjs
const fs = require('fs'), path = require('path'), p = require('puppeteer-core');
const SRC = path.join(__dirname, '../assets-art/obj-svg'), DIR = path.join(__dirname, '../www/art/obj'), SIZE = 256;
(async () => { const b = await p.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const pg = await b.newPage();
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.svg')).sort(); let n = 0;
  for (const f of files) { const svg = fs.readFileSync(path.join(SRC, f), 'utf8');
    const url = await pg.evaluate(async (svg, S) => { const i = new Image(); i.width = S; i.height = S; i.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await i.decode(); const c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d').drawImage(i, 0, 0, S, S); return c.toDataURL('image/png'); }, svg, SIZE);
    const buf = Buffer.from(url.split(',')[1], 'base64'); if (buf.length < 200) throw new Error('空白贴图 ' + f); fs.writeFileSync(path.join(DIR, f.replace(/\.svg$/, '.png')), buf); n++; }
  await b.close(); console.log('栅格化', n, '张'); })().catch(e => { console.error(e); process.exit(1); });
