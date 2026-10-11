# Screeps 积木（screeps-blockly-mobile）

一款 **Screeps 风格的开放世界编程游戏** 的安卓版原型：用 Google **Blockly** 积木拼出 creep 的 AI，积木会生成真正的 JavaScript，在每个游戏 tick 里运行。

## 下载
到 [Releases](../../releases/latest) 下载最新 `screeps-blockly-v*.apk`，在手机上安装即可（需允许“安装未知来源应用”）。
应用启动时会自动检查 GitHub Releases，有新版本会提示下载安装（菜单 ⚙ → 检查更新 也可手动检查）。

## v1 功能
- 持久开放世界：3×3 个房间（每个 25×25 格），平原 / 沼泽 / 墙，房间之间有出口，多个能量源（定时再生）
- Spawn1、creep（WORK / CARRY / MOVE 身体部件、寿命 1500 tick、疲劳）
- 采集能量、送回 Spawn、放置工地并建造（extension 扩展容量 / road 道路）
- 单指拖动平移、双指缩放；点击格子查看 creep / 能量源 / Spawn 信息
- Blockly 积木编辑器（中文）+ 自定义 Screeps 积木，可切换查看生成的 JS
- 运行 / 暂停、1x–16x 倍速、日志面板
- 世界和积木程序自动保存在本地（localStorage）

## 玩家可用 API（Screeps 子集）
`Game.creeps`、`Game.spawns`、`Game.time`、`Game.createConstructionSite(x,y,type)`、`Memory`、
`creep.moveTo / harvest / transfer / build / say / drop / suicide`、`creep.store`、`creep.memory`、
`creep.pos.findClosestByPath(FIND_SOURCES | FIND_CONSTRUCTION_SITES | FIND_MY_SPAWNS)`、
`spawn.spawnCreep(body, name)`，以及 `OK / ERR_NOT_IN_RANGE / WORK / CARRY / MOVE ...` 常量。

## 技术栈与说明（与 Cocos 的偏差）
原计划用 Cocos Creator。但 Cocos Creator 的构建必须依赖**图形化编辑器本体**（需登录 Cocos 账号下载、官方不提供 Linux 版、
无官方无头 CI 镜像），在 GitHub Actions 上只能靠 Windows/macOS 运行器+非官方方式安装编辑器，稳定性和授权都不可靠。
因此 v1 采用：**原生 JavaScript + Canvas 2D 渲染 + Blockly + Capacitor 打包安卓**，全部能在 GitHub Actions Ubuntu 运行器上无头构建。
引擎层（`www/engine.js`）与渲染层（`www/render.js`）是分开的，以后可以把渲染层迁移到 Cocos Creator（JS/TS）而复用引擎与积木。

## 目录
```
www/engine.js   世界生成 + tick 模拟 + Screeps 风格 API + 沙盒
www/render.js   Canvas 渲染、触摸平移缩放
www/blocks.js   自定义积木、JS 生成器、默认程序
www/update.js   GitHub Releases 应用内更新
www/main.js     UI 与存档
.github/workflows/android.yml  构建 + 签名 + 发布 Release
```

## 本地开发
```bash
npm ci && ./scripts/prepare.sh
npx http-server www     # 浏览器里直接玩
npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug
```

## 发布
推送到 `main` 即触发 Actions：版本号为 `1.0.<运行序号>`，自动构建、签名（签名证书存于仓库 Secrets，保证可覆盖升级）并创建 Release。

## 许可证
MIT
