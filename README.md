# Screeps 积木（screeps-blockly-mobile）

**Screeps 风格的开放世界编程游戏**，安卓版。用 Google **Blockly** 积木拼出 creep 的 AI，积木生成真正的 JavaScript，每个 tick 运行一次。支持**局域网多人**。

## 下载
[Releases](../../releases/latest) 下载最新 `screeps-blockly-v*.apk` 安装。启动时自动检查新版本（⚙ → 检查更新 也可）。

> ⚠ v1.0.1 → v1.1.0 更换了签名证书，需**先卸载 v1.0.1 再安装**（之后的版本可直接覆盖升级）。

## v1.1 功能
- **PixiJS 渲染**（WebGL）：程序生成贴图——带明暗/高度的山体、沼泽、发光能量源、旋转的 Spawn、扩展、道路、工地进度
- **流畅动画**：creep 在 tick 之间插值移动；采集/运送能量粒子飞行、建造火花、出生光环、死亡烟雾
- **程序化地图**：种子值噪声地形（墙/沼泽），房间之间的出口由边的哈希决定且两侧一致，每个出口、能量源都会挖通到房间中心（保证连通）
- **动态扩张**：世界为 S×S 个房间，S = max(2, ⌈√(2×玩家数)⌉)，有人加入就向外长出新房间
- **公平出生**：新玩家放在离已有玩家最远的空房间中心
- **局域网联机**：一台手机开房（App 内原生 WebSocket 服务器 + UDP 广播发现），其他手机搜索或输 IP 加入；每人有自己的 Spawn/creep/代码，所有代码在房主上按 tick 运行，状态同步给客户端
- 默认程序极简（生产 creep + 采集），其余逻辑由你自己拼

## 怎么联机
1. 所有手机连同一个 WiFi（或连上房主手机开的热点）
2. 房主：📡 联机 → 🏠 开房 → 点 ▶ 运行（房主控制运行/速度）
3. 其他人：📡 联机 → 🔍 搜索局域网房间 → 点击加入；搜不到就输入房主界面显示的 IP
4. 每个人在 🧩 代码 里拼积木，点“✔ 完成”就会把代码发给房主
5. 电脑上也能当房主测试：`npm ci && npm run host`，然后浏览器打开 `www/index.html?join=<电脑IP>:8787`

## 玩家 API（Screeps 子集）
`Game.creeps / spawns / time / getObjectById / createConstructionSite(x,y,type)`、`Memory`、
`creep.moveTo / harvest / transfer / build / say / drop / suicide`、`creep.store`、`creep.memory`、`creep.my`、
`pos.findClosestByPath / findClosestByRange / find(FIND_SOURCES | FIND_CONSTRUCTION_SITES | FIND_MY_SPAWNS | FIND_MY_CREEPS | FIND_HOSTILE_CREEPS)`、
`spawn.spawnCreep(body, name, {memory})`。

## 技术栈（不使用 Cocos）
原生 JavaScript + **PixiJS 7** + **Blockly 11** + **Capacitor 6**；联机用自写 Capacitor 安卓插件 `plugins/capacitor-lan-server`（NanoHTTPD WebSocket + UDP 广播）。

```
www/worldgen.js  噪声地形、出口、能量源
www/engine.js    多玩家权威模拟 + Screeps API + 沙盒（可在 Node 运行）
www/net.js       房主/客户端协议
www/render.js    PixiJS 渲染与动画（只读视图）
www/blocks.js    自定义积木与默认程序
www/main.js      UI、模式切换、存档
test/lan.test.js Node 下模拟房主+2客户端的自动测试（npm test）
```

## 构建
```bash
npm ci && npm test
APP_VERSION=1.1.0 VERSION_CODE=110 ./scripts/build-android.sh
KEYSTORE=~/keys/release.p12 KEYSTORE_PASS=*** ./scripts/sign.sh out.apk
```

## CI
当前 gh 授权缺 `workflow` 权限，工作流暂存在 `ci/android.yml`。启用：
```bash
gh auth refresh -s workflow
mkdir -p .github/workflows && git mv ci/android.yml .github/workflows/android.yml && git commit -m "启用 CI" && git push
```

## 第三方资源与许可
- 图标：[Tabler Icons](https://tabler.io/icons)（MIT），通过 [Iconify](https://iconify.design/) 的 `@iconify-json/tabler` 在构建时离线打包进 `www/icons.js`
- [PixiJS](https://pixijs.com/)（MIT）、[Blockly](https://developers.google.com/blockly)（Apache-2.0）、[Capacitor](https://capacitorjs.com/)（MIT）、[NanoHTTPD](https://github.com/NanoHttpd/nanohttpd)（BSD-3）
- 开始界面插画：AI 生成，位于 `assets-art/`

## 许可证
MIT
