# Screeps World（screeps-blockly-mobile）

**Screeps 风格的开放世界编程游戏**，安卓版。用 Google **Blockly** 积木拼出 creep 的 AI，积木生成真正的 JavaScript，每个 tick 运行一次。支持**局域网多人**。

## 下载
[Releases](../../releases/latest) 下载最新 `screeps-blockly-v*.apk` 安装。启动时自动检查新版本（⚙ → 检查更新 也可）。

> ⚠ v1.0.1 → v1.1.0 更换了签名证书，需**先卸载 v1.0.1 再安装**（之后的版本可直接覆盖升级）。

## 游戏规则（v1.3 起严格对齐官方 Screeps）
- **常量**：`www/screeps-const.js` 原样取自官方 [screeps/common constants.js](https://github.com/screeps/common/blob/master/lib/constants.js)（ISC），代码里所有数值都从这里读：身体部件价格、`HARVEST_POWER`、`BUILD_POWER`、`REPAIR_POWER`、`UPGRADE_CONTROLLER_POWER`、`CARRY_CAPACITY`、`CONTROLLER_LEVELS / DOWNGRADE / STRUCTURES`、`CONSTRUCTION_COST`、各建筑 hits/容量、塔威力与衰减、返回码、`FIND_* / LOOK_*` 等。
- **地图**：每个房间 50×50，移植官方 `generateRoom` 算法（元胞自动机墙体 + 沼泽、四边出口两侧对齐、全房间连通检查）。**能量源（1–2 个）和 Controller 都放在墙格上、紧挨可走格**，从旁边采集/升级；每个房间有一个矿物（同样在墙上）。房间名用官方格式 `E0S0`、`E1S0`…
- **扩容**：世界 S×S 个房间，S = ⌈√(2×玩家数)⌉；世界边缘封墙，新房间出现时恢复原有出口。走到出口格会像官方一样进入相邻房间。
- **能量源**：已占领/预定的房间 3000，无主 1500，首次被采后 300 tick 回满。
- **creep**：生产 3 tick/部件、寿命 1500（CLAIM 600）；疲劳 = 非 MOVE 部件（空 CARRY 不算）× 道路 1 / 平原 2 / 沼泽 10，每个 MOVE 每 tick 减 2；死亡留下墓碑（5 tick/部件），携带物与回收能量掉落后每 tick 衰减 ceil(n/1000)。
- **Spawn**：初始 300 能量；房间可用能量 < 300 时每 tick +1；生产扣 Spawn + Extension 能量（可用 `energyStructures` 指定顺序）。Extension 容量 50（RCL7 100、RCL8 200）。
- **Controller**：升级 1 进度/WORK/能量，满级进度后升级并把降级计时设为一半；每次升级恢复 100 tick 降级计时；超时降级时进度回 90%。RCL8 每 tick 最多 15。超额建筑按距离 Controller 保留（`isActive`）。
- **建筑**：`CONTROLLER_STRUCTURES` 数量上限、工地上限 100、边缘与出口旁不能建、道路可修在沼泽（×5）和墙（×150）上；道路每 1000 tick 掉 100 hits 并被踩磨损；Container 每 100 tick（自己房间 500 tick）掉 5000；Rampart 每 100 tick 掉 300、上限随 RCL；塔 600/400/800，5 格外线性衰减到 20 格时 25%，每次 10 能量。

## 玩家 API（官方名称与返回码）
- 全局：`Game`、`Memory`、`RawMemory`、`RoomPosition`、`Room`（含 `Room.Terrain`）、`PathFinder`（简化）、`console.log`，以及全部官方常量。
- `Game`：`time creeps spawns structures constructionSites flags rooms`（按视野）`gcl cpu shard getObjectById notify map.{describeExits findRoute findExit getRoomLinearDistance getRoomTerrain getTerrainAt getWorldSize getRoomStatus}`、`market`（空壳）。
- `Room`：`name controller storage terminal energyAvailable energyCapacityAvailable memory find lookAt lookForAt lookAtArea lookForAtArea createConstructionSite createFlag getTerrain getPositionAt findPath findExitTo`。
- `RoomPosition`：`getRangeTo inRangeTo isNearTo isEqualTo getDirectionTo findClosestByRange findClosestByPath findInRange findPathTo look lookFor createConstructionSite createFlag`。
- `Creep`：`move moveTo moveByPath harvest transfer withdraw pickup drop build repair dismantle upgradeController claimController reserveController attackController signController generateSafeMode attack rangedAttack rangedMassAttack heal rangedHeal say suicide cancelOrder notifyWhenAttacked getActiveBodyparts`，属性 `body fatigue hits hitsMax store memory spawning ticksToLive saying my owner`。
- `StructureSpawn`：`spawnCreep(body, name, {memory, energyStructures, dryRun, directions})`、`spawning.{cancel,setDirections}`、`renewCreep recycleCreep`；`StructureController`：`activateSafeMode unclaim`；`StructureTower`：`attack heal repair`；`StructureLink`：`transferEnergy`；`StructureRampart`：`setPublic`；所有建筑：`destroy isActive notifyWhenAttacked`；`ConstructionSite.remove`、`Flag`、`Source`、`Mineral`、`Resource`、`Tombstone`、`Store.getCapacity/getUsedCapacity/getFreeCapacity`。

## 怎么联机
1. 所有手机连同一个 WiFi（或连上房主手机开的热点）
2. 房主：📡 联机 → 🏠 开房 → 点 ▶ 运行（房主控制运行/速度）
3. 其他人：📡 联机 → 🔍 搜索局域网房间 → 点击加入；搜不到就输入房主界面显示的 IP
4. 每个人在 🧩 代码 里拼积木，点“✔ 完成”就会把代码发给房主
5. 电脑上也能当房主测试：`npm ci && npm run host`，然后浏览器打开 `www/index.html?join=<电脑IP>:8787`

## 技术栈（不使用 Cocos）
原生 JavaScript + **PixiJS 7** + **Blockly 11** + **Capacitor 6**；联机用自写 Capacitor 安卓插件 `plugins/capacitor-lan-server`（NanoHTTPD WebSocket + UDP 广播）。

```
www/screeps-const.js 官方常量（原样）
www/worldgen.js  官方地图生成算法移植
www/engine.js    多玩家权威模拟 + Screeps API + 沙盒（可在 Node 运行）
www/net.js       房主/客户端协议
www/render.js    PixiJS 渲染与动画（只读视图）
www/blocks.js    自定义积木与默认程序
www/main.js      UI、模式切换、存档
test/lan.test.js Node 下模拟房主+2客户端的自动测试（npm test）
test/controller.test.js 官方规则对照测试
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
