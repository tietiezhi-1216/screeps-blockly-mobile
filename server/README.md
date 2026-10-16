# 自建 Screeps 官方私服

手机 App 只是客户端，游戏在服务器上跑。这个目录用 Docker 部署**官方** Screeps 服务器（[screepers/screeps-launcher](https://github.com/screepers/screeps-launcher) 打包的官方 `screeps` 包），外加 MongoDB 和 Redis。用到这几个 mod：

| mod | 作用 |
|---|---|
| screepsmod-auth | 用户名 + 密码登录（App 靠它登录、注册） |
| screepsmod-mongo | 用 MongoDB + Redis 存数据（多人、长期运行必需） |
| screepsmod-admin-utils | 管理命令，以及 `config.yml` 里的 `serverConfig`（tick 速度、欢迎语等） |

另外会放一个示例机器人 `screepsbot-zeswarm` 当邻居。

## 1. 准备一台服务器

- 系统：Ubuntu 22.04 / 24.04 或 Debian 12（x86_64 或 arm64 都行）
- 配置：**2 核 4 GB 内存**起步（只给自己和几个朋友玩）；2 GB 内存也能跑，但建议加 2 GB swap
- 硬盘：20 GB
- 需要一个公网 IP；想用 HTTPS 再准备一个域名，解析到这台机器

安装 Docker（自带 `docker compose`）：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 重新登录后生效，之后不用 sudo
```

## 2. 申请 Steam Key

官方服务器启动时要一个 Steam Web API Key（免费）：

1. 用**拥有 Screeps 游戏**的 Steam 账号登录 <https://steamcommunity.com/dev/apikey>
2. 域名随便填（例如你的服务器域名），同意条款，得到 32 位的 Key

Key 只写在 `server/.env` 里，这个文件不会被提交，也不要发给别人。

## 3. 启动

把仓库里的 `server/` 目录拷到服务器上，然后：

```bash
cd server
./setup.sh
```

脚本会：

1. 生成 `.env`，提示你粘贴 Steam Key（也可以 `STEAM_KEY=xxx ./setup.sh`）
2. 拉镜像、启动三个容器
3. 第一次启动时初始化世界（`system.resetAllData()`）并重启
4. 打印 App 里要填的地址

第一次启动要下载安装官方服务器，2～10 分钟，期间可以 `./setup.sh logs` 看进度。

不想用脚本也可以手动：

```bash
cp .env.example .env && nano .env          # 填 STEAM_KEY
docker compose up -d
docker compose exec screeps curl -X POST http://127.0.0.1:21026/cli -d 'system.resetAllData()'
docker compose restart screeps
```

## 4. 玩家账号

- **默认允许在 App 里注册**：App → 服务器与账号 → 私服 → 填地址、用户名、密码 → 「注册新账号」
- 也可以在服务器上建号 / 改密码：

```bash
./setup.sh adduser 小明 一个至少8位的密码
./setup.sh passwd  小明 新密码
```

- 只想自己人玩：
  - 在 `config.yml` 里把 `allowRegistration` 改成 `false`，然后 `./setup.sh restart`；或者
  - 在 `.env` 里设置 `SERVER_PASSWORD=...`，然后 `./setup.sh`。设置后 App 里不能自助注册，只能用 `adduser` 建号；App 登录页的「服务器密码」要填这个值

## 5. 端口

| 端口 | 用途 | 对外开放？ |
|---|---|---|
| 21025 | 游戏接口（HTTP + WebSocket），App 连这个 | 是（或者只开 Caddy 的 443） |
| 21026 | 管理 CLI | **否**。只在容器内部，`setup.sh` 通过 `docker compose exec` 使用；需要宿主机直连时只绑 `127.0.0.1`（见 `docker-compose.yml` 注释） |

云服务器记得在**安全组 / 防火墙**里放行 TCP 21025（或 443）。用 ufw 的话：

```bash
sudo ufw allow 21025/tcp      # 直接连
# 或者用 Caddy 时：
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

## 6. HTTPS（推荐，用 Caddy）

有域名的话，前面套一个 Caddy，自动申请证书，App 填 `https://你的域名` 即可，密码不会明文在网上传。

1. `.env` 里改成只监听本机：`SCREEPS_BIND=127.0.0.1`，然后 `./setup.sh`
2. 安装 Caddy（<https://caddyserver.com/docs/install>），`/etc/caddy/Caddyfile`：

```
screeps.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:21025
}
```

3. `sudo systemctl reload caddy`

Caddy 会自动转发 WebSocket，不用额外配置。App 用的是原生网络请求，不需要配置 CORS。

## 7. 日常维护

```bash
./setup.sh status            # 状态、房间数、玩家数
./setup.sh logs              # 日志
./setup.sh backup            # 备份 MongoDB + Redis + config.yml 到 backups/
./setup.sh restore 20261016-120000   # 从备份恢复（会完全替换现有数据）
./setup.sh upgrade           # 先备份，再升级镜像和官方服务器 / mod 到最新
./setup.sh init              # 清空并重建世界
./setup.sh cli 'help()'      # 执行一条管理命令
```

建议用 cron 每天备份一次：

```bash
0 4 * * * cd /path/to/server && ./setup.sh backup >/dev/null 2>&1
```

改 `config.yml`（tick 速度、机器人、mod）后 `./setup.sh restart` 生效。

## 8. 常见问题

**启动很久没好 / 一直 health: starting**
第一次要装几百个 npm 包，慢的机器要 10 分钟。`./setup.sh logs` 看有没有报错。内存不足（被 OOM 杀掉）时加 swap。

**日志里 `Cannot read properties of undefined (reading 'db')`，App 登录失败**
mod 加载顺序问题：`config.yml` 里 `screepsmod-auth` 必须写在 `screepsmod-mongo` **前面**（已经按这个顺序写好了，别调换）。

**`STEAM_KEY` 报错 / 启动时说 Key 无效**
检查 `.env` 里 `STEAM_KEY=` 后面有没有多余的空格或引号。

**App 提示「连不上服务器」**
- 地址格式：`IP:21025`，或者 `https://域名`
- 云服务器安全组有没有放行端口
- 在别的电脑上试 `curl http://IP:21025/api/version`，应该返回 `{"ok":1,...}`

**App 提示「用户名或密码不对」**
用 `./setup.sh passwd 用户名 新密码` 重设。

**容器里下载失败、拉不到 npm 包（`getaddrinfo` / `ENOTFOUND`）**
一般是 Docker 自建网络的 DNS 问题（某些云厂商或代理环境）。在 `/etc/docker/daemon.json` 里指定 DNS 后重启 Docker：

```json
{ "dns": ["223.5.5.5", "8.8.8.8"] }
```

**`permission denied ... docker.sock`**
当前用户没在 docker 组：`sudo ./setup.sh`，或 `sudo usermod -aG docker $USER` 后重新登录。

**想重置某个玩家（让他重新出生）**
让玩家在 App 里：个人中心 → 重新出生。
