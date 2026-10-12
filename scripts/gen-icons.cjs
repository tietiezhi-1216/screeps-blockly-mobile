// 从 @iconify-json/tabler（MIT）抽取用到的图标，生成离线 www/icons.js
const set = require('@iconify-json/tabler/icons.json');
const names = ['player-play', 'player-pause', 'puzzle', 'terminal-2', 'broadcast', 'settings', 'home', 'search', 'device-gamepad-2', 'x', 'bolt', 'bug', 'users', 'map', 'download', 'refresh', 'help', 'device-floppy', 'world', 'check', 'code', 'gauge', 'player-track-next', 'login', 'wifi', 'plug-connected', 'rocket', 'info-circle', 'arrow-back-up', 'trash', 'zoom-in', 'zoom-out', 'focus-centered', 'hammer', 'flag'];
const out = {};
for (const n of names) { const i = set.icons[n]; if (!i) throw new Error('missing ' + n); const w = i.width || set.width || 24, h = i.height || set.height || 24; out[n] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="1em" height="1em">${i.body}</svg>`; }
require('fs').writeFileSync('www/icons.js', '// Tabler Icons (MIT) via Iconify — 离线内置\nconst ICONS = ' + JSON.stringify(out) + ';\nfunction icon(n) { return ICONS[n] || ""; }\nfunction applyIcons(root = document) { root.querySelectorAll("[data-icon]").forEach(e => { if (!e._i) { e._i = 1; e.insertAdjacentHTML("afterbegin", `<span class="ic">${icon(e.dataset.icon)}</span>`); } }); }\n');
console.log('icons', Object.keys(out).length);
