#!/usr/bin/env bash
# Screeps 官方私服一键管理脚本（screepers/screeps-launcher + MongoDB + Redis）
# 用法：./setup.sh [命令]，不带命令 = 安装并启动。详见 README.md
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# docker compose v2 插件或旧版 docker-compose 都行
if docker compose version >/dev/null 2>&1; then DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then DC=(docker-compose)
else DC=(); fi
need_docker() {
  command -v docker >/dev/null 2>&1 || die "没有安装 Docker。Ubuntu/Debian：curl -fsSL https://get.docker.com | sh"
  [ ${#DC[@]} -gt 0 ] || die "没有 docker compose。安装 Docker 官方版本会自带（docker compose 插件）"
  docker info >/dev/null 2>&1 || die "连不上 Docker（没启动，或当前用户没有权限：试试 sudo ./setup.sh，或把用户加入 docker 组）"
}
dc() { "${DC[@]}" "$@"; }
# 在容器里调用管理 CLI（HTTP 接口，只在容器内 127.0.0.1:21026，外网访问不到）
cli() { local o; o=$(dc exec -T screeps curl -sS --max-time 120 -X POST http://127.0.0.1:21026/cli --data-binary "$1") && printf '%s\n' "$o"; }
api_up() { dc exec -T screeps curl -fsS --max-time 5 http://127.0.0.1:21025/api/version >/dev/null 2>&1; }
wait_up() {
  say "等待服务器启动（第一次要下载安装官方服务器，2～10 分钟）…"
  for i in $(seq 1 180); do api_up && { say "服务器已启动"; return 0; }; sleep 5; [ $((i % 12)) -eq 0 ] && say "仍在启动…（$((i * 5)) 秒，可另开终端看 ./setup.sh logs）"; done
  die "15 分钟内没启动成功，请看 ./setup.sh logs"
}
check_name() { [[ "$1" =~ ^[A-Za-z0-9_-]{2,30}$ ]] || die "用户名只能用字母、数字、_ 和 -（2～30 个字符）"; }
check_pass() { [ ${#1} -ge 8 ] || die "密码至少 8 位"; [[ "$1" != *"'"* && "$1" != *"\\"* ]] || die "密码里不要用 ' 和 \\"; }

ensure_env() {
  [ -f .env ] || { cp .env.example .env; chmod 600 .env; say "已生成 .env"; }
  local key; key=$(grep -E '^STEAM_KEY=' .env | head -1 | cut -d= -f2- || true)
  if [ -z "$key" ] && [ -n "${STEAM_KEY:-}" ]; then key=$STEAM_KEY; sed -i "s|^STEAM_KEY=.*|STEAM_KEY=$key|" .env; fi
  if [ -z "$key" ] && [ -t 0 ]; then
    echo "需要 Steam Web API Key（免费）：用拥有 Screeps 的 Steam 账号登录 https://steamcommunity.com/dev/apikey 申请"
    read -rsp "粘贴 Steam Key（输入不显示）：" key; echo
    [ -n "$key" ] && sed -i "s|^STEAM_KEY=.*|STEAM_KEY=$key|" .env
  fi
  grep -qE '^STEAM_KEY=.+' .env || die "请在 server/.env 里填写 STEAM_KEY，或运行 STEAM_KEY=你的key ./setup.sh"
}

port() { grep -E '^SCREEPS_PORT=' .env 2>/dev/null | cut -d= -f2- | grep . || echo 21025; }
world_rooms() { cli "storage.db.rooms.count()" 2>/dev/null | tr -dc '0-9'; }

cmd_install() {
  need_docker; ensure_env
  say "拉取镜像并启动…"; dc pull -q || warn "拉取镜像失败，先用本地已有的镜像"
  dc up -d; wait_up
  local n; n=$(world_rooms || true)
  if [ -z "$n" ] || [ "$n" = "0" ]; then
    say "第一次启动：初始化世界（system.resetAllData）"; cli "system.resetAllData()"
    say "重启服务器…"; dc restart screeps; wait_up
  fi
  say "房间数：$(world_rooms || echo ?)"
  cat <<TXT

完成。手机 App → 服务器与账号 → 私服：
  服务器地址：$(hostname -I 2>/dev/null | awk '{print $1}' || echo 你的服务器IP):$(port)（套了 HTTPS 就填 https://你的域名）
  用户名 / 密码：在 App 里点「注册新账号」，或在这里 ./setup.sh adduser 名字 密码
别忘了在云服务器防火墙 / 安全组放行 TCP $(port)（或 Caddy 的 443）。
TXT
}

case "${1:-install}" in
  install|start) cmd_install ;;
  stop)    need_docker; dc stop ;;
  restart) need_docker; dc restart screeps; wait_up ;;
  status)  need_docker; dc ps; api_up && say "游戏接口正常" || warn "游戏接口没有响应"; say "房间数：$(world_rooms || echo ?)"; cli "storage.db.users.count({})" | sed 's/^/玩家数（含 NPC）：/' ;;
  logs)    need_docker; dc logs --tail=200 -f screeps ;;
  cli)     need_docker; [ -n "${2:-}" ] || die "用法：./setup.sh cli 'JS 表达式'，例如 ./setup.sh cli 'help()'"; cli "$2" ;;
  init|reset)
    need_docker; read -rp "这会清空整个世界和所有玩家数据，输入 yes 继续：" a; [ "$a" = yes ] || exit 1
    cli "system.resetAllData()"; dc restart screeps; wait_up ;;
  adduser)
    need_docker; u=${2:-}; p=${3:-}; [ -n "$u" ] && [ -n "$p" ] || die "用法：./setup.sh adduser 用户名 密码"; check_name "$u"; check_pass "$p"; l=$(echo "$u" | tr 'A-Z' 'a-z')
    cli "storage.db.users.findOne({usernameLower:'$l'}).then(u=>u?'用户已存在，改用 ./setup.sh passwd':storage.db.users.insert({username:'$u',usernameLower:'$l',cpu:100,cpuAvailable:0,registeredDate:new Date(),blocked:false,money:0,gcl:0}).then(u=>storage.db['users.code'].insert({user:u._id,modules:{main:''},branch:'default',activeWorld:true,activeSim:true}).then(()=>storage.env.set('scrUserMemory:'+u._id,'{}'))).then(()=>auth.setPassword('$u','$p')).then(()=>'已创建 $u'))" ;;
  passwd)
    need_docker; u=${2:-}; p=${3:-}; [ -n "$u" ] && [ -n "$p" ] || die "用法：./setup.sh passwd 用户名 新密码"; check_name "$u"; check_pass "$p"
    cli "storage.db.users.findOne({username:'$u'}).then(x=>x?auth.setPassword('$u','$p').then(()=>'已修改 $u 的密码'):'没有这个用户')" ;;
  backup)
    need_docker; mkdir -p backups; t=$(date +%Y%m%d-%H%M%S)
    say "备份 MongoDB…"; dc exec -T mongo mongodump --quiet --archive --gzip > "backups/mongo-$t.archive.gz"
    say "备份 Redis…"; dc exec -T redis redis-cli SAVE >/dev/null; dc cp redis:/data/dump.rdb "backups/redis-$t.rdb"
    cp config.yml "backups/config-$t.yml"; say "已备份到 server/backups/（*-$t.*）"; ls -lh backups/*"$t"* ;;
  restore)
    need_docker; t=${2:-}; [ -n "$t" ] && [ -f "backups/mongo-$t.archive.gz" ] || die "用法：./setup.sh restore 时间戳（看 ls backups/，例如 20261016-120000）"
    read -rp "会用备份完全替换现有数据，输入 yes 继续：" a; [ "$a" = yes ] || exit 1
    dc stop screeps
    dc exec -T mongo mongorestore --quiet --drop --archive --gzip < "backups/mongo-$t.archive.gz"
    if [ -f "backups/redis-$t.rdb" ]; then dc stop redis; dc cp "backups/redis-$t.rdb" redis:/data/dump.rdb; dc start redis; fi
    dc start screeps; wait_up
    # 只恢复了 MongoDB（没有 Redis 备份）时，Redis 里没有地形缓存，玩家代码会跑不起来：重建一次
    cli 'map.updateTerrainData()' >/dev/null && say "地形缓存已重建" ;;
  upgrade)
    need_docker; say "先备份…"; "$0" backup
    say "更新镜像…"; dc pull
    dc up -d; wait_up
    say "更新官方服务器和 mod 到最新版…"; dc exec -T screeps screeps-launcher upgrade || warn "升级命令失败，请看上面的输出"
    dc restart screeps; wait_up; dc exec -T screeps curl -s http://127.0.0.1:21025/api/version | head -c 300; echo ;;
  help|-h|--help)
    sed -n '1,3p' "$0"; cat <<TXT
命令：
  ./setup.sh               安装并启动（第一次会初始化世界）
  ./setup.sh status        查看状态
  ./setup.sh logs          看日志（Ctrl+C 退出）
  ./setup.sh adduser 名字 密码   新建玩家（设置了服务器密码时 App 里不能注册，用这个）
  ./setup.sh passwd 名字 密码    改密码
  ./setup.sh backup        备份到 backups/
  ./setup.sh restore 时间戳 从备份恢复
  ./setup.sh upgrade       备份后升级到最新官方服务器
  ./setup.sh init          清空并重建世界
  ./setup.sh cli 'JS'      执行一条管理命令
  ./setup.sh stop | restart
TXT
    ;;
  *) die "不认识的命令：$1（./setup.sh help 看全部命令）" ;;
esac
