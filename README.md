# Screeps World（screeps-blockly-mobile）

**Screeps 的安卓积木客户端**。用 Google **Blockly** 积木拼出 creep 的 AI，积木生成官方 JavaScript（`module.exports.loop`），上传到 **Screeps 服务器**运行：

- **自建官方私服**：用 `server/` 里的 Docker 部署官方 Screeps 服务器（见 [server/README.md](server/README.md)），在 App 里用用户名 + 密码登录
- **官方 Screeps World**：在 App 里填自己账号的 Auth Token（screeps.com → 账号设置 → Auth Tokens），选择 shard

v2.0 起不再有本地模拟引擎、单机存档和局域网联机：游戏规则就是服务器上的官方引擎。

## 下载
[Releases](../../releases/latest) 下载最新 `screeps-blockly-v*.apk` 安装。启动时自动检查新版本。

## App 做什么
- **登录**：私服（地址、用户名/邮箱、密码、可选服务器密码，screepsmod-auth）或官方服务器（Auth Token + shard），设置保存在本机
- **代码**：积木一一对应官方 API（`docs/OFFICIAL_COVERAGE.md`），自定义身份与身体部件面板生成 `spawnCreep` 参数；「上传」把 main 模块传到服务器当前生效的分支（`POST /api/user/code`），内容没变不重复上传
- **世界**：世界地图（`map-stats` + 地形）、房间视图（WebSocket 订阅 `room:` 频道，首帧全量 + 增量合并）、控制台和 CPU（`user:<id>/console`、`user:<id>/cpu`）
- **操作**：选房间放 Spawn（`place-spawn`）、放工地、插旗/拆旗、creep 自杀、摧毁建筑、取消工地（`add-object-intent`）、重新出生
- **官方限额**：本地计数，超限前就提示（上传代码 240 次/天、地形 360 次/小时等）；断线自动重连（1 秒 → 30 秒退避）
- 私服没有 CORS 头，安卓 App 里所有 HTTP 请求走 Capacitor 原生 HTTP

## 技术栈
原生 JavaScript + **PixiJS 7** + **Blockly 11** + **Capacitor 6**。

```
www/screeps-const.js 官方常量（原样，screeps/common）
www/screeps-api.js   HTTP + SockJS WebSocket 客户端（登录、限额、重连、中文错误）
www/online.js        服务器数据 → 渲染快照（房间增量、地形、地图、操作）
www/geo.js           房间名与坐标（官方规则）
www/render.js        PixiJS 渲染（只读视图）
www/blocks.js        积木（官方 API）与默认程序
www/main.js          游戏界面；www/shell.js 首页、登录、设置
server/              官方私服部署（docker compose + setup.sh）
```

## 测试
```bash
npm ci && npm test                       # 不连网：回放 test/fixtures/pserver.json（录自真实私服）
SBM_SERVER=127.0.0.1:21025 SBM_USER=xx SBM_PASS=xx npm run test:online   # 连真实私服端到端
SBM_SERVER=... SBM_USER=... SBM_PASS=... npm run record-fixture          # 重新录制离线数据
```

## 构建
```bash
APP_VERSION=2.0.0 VERSION_CODE=200 ./scripts/build-android.sh
KEYSTORE=~/keys/release.p12 KEYSTORE_PASS=*** ./scripts/sign.sh out.apk
```

## 第三方资源与许可
- 图标：[Tabler Icons](https://tabler.io/icons)（MIT），通过 [Iconify](https://iconify.design/) 的 `@iconify-json/tabler` 在构建时离线打包进 `www/icons.js`
- 对象贴图：[screeps/renderer](https://github.com/screeps/renderer)（ISC）
- [PixiJS](https://pixijs.com/)（MIT）、[Blockly](https://developers.google.com/blockly)（Apache-2.0）、[Capacitor](https://capacitorjs.com/)（MIT）
- 服务器：官方 [screeps](https://github.com/screeps/screeps)（ISC）、[screeps-launcher](https://github.com/screepers/screeps-launcher)、screepsmod-auth / mongo / admin-utils

## 许可证
MIT
