# Plum Admin 生产部署

本文描述在新机器上部署 `plum_admin` 的可复现流程。默认目录为
`/opt/workspace/plum_admin`，后端 `ai4all_bridge` 位于同机
`/opt/workspace/ai4all_bridge`，并仅监听 `127.0.0.1:8180`。

生产域名为 `https://admin.plum.top`。浏览器只访问 nginx 和 Next.js；Next.js BFF 使用独立
Bearer Token 访问 FastAPI。不得把 BFF Token、飞书 Secret、Session Secret 或数据库连接串提交到 Git。

## 1. 前置条件

- Ubuntu、Node.js 22、npm 10、nginx、Certbot。
- PostgreSQL 16 已初始化，应用角色拥有 `public` schema 的 `USAGE, CREATE` 权限。
- `admin.plum.top` 的 DNS 已指向新机器，公网只开放 22、80、443。
- 飞书应用可用范围只包含需要进入后台的同事。
- 飞书安全设置已加入回调：
  `https://admin.plum.top/api/auth/feishu/callback`。
- 后端部署提交包含 Migration 129 和 Plum Admin Identity 路由。

先确认版本：

```bash
node --version   # v22.x
npm --version    # 10.x
nginx -v
```

## 2. 先部署后端

后端必须先于前端部署。按照 `ai4all_bridge` 的海外节点部署说明安装 PostgreSQL、虚拟环境、`.env`
和用户级 `ai4all-bridge-backend.service`，然后确认 Migration 129 已创建 `plum_admin_users`。

在后端 `.env` 配置：

```dotenv
PLUM_ADMIN_BFF_TOKEN=<独立随机值，建议至少 32 个字符>
PLUM_ADMIN_WRITES_ENABLED=false
```

`PLUM_ADMIN_BFF_TOKEN` 不得复用 Bridge、Admin、Staff、Reviewer 或 Session Token。首次部署保持后端写开关
为 `false`。应用迁移在启动阶段执行；迁移失败时不要停止仍在运行的旧服务。

```bash
cd /opt/workspace/ai4all_bridge
make env-check
systemctl --user restart ai4all-bridge-backend.service
systemctl --user is-active ai4all-bridge-backend.service
curl -fsS http://127.0.0.1:8180/health/ready
```

## 3. 安装和配置前端

```bash
cd /opt/workspace
git clone https://github.com/huanshanxiaoyao/plum_admin.git
cd plum_admin
npm ci
```

分别生成 BFF Token 和 Session Secret，不要复用：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

创建权限为 `600` 的 `/opt/workspace/plum_admin/.env`：

```dotenv
ADMIN_AUTH_MODE=feishu
ADMIN_SESSION_SECRET=<独立随机值，至少 32 个字符>
ADMIN_DATA_SOURCE=remote
ADMIN_API_ORIGIN=http://127.0.0.1:8180
PLUM_ADMIN_BFF_TOKEN=<与后端完全相同的独立随机值>
ADMIN_API_WRITE_ENABLED=false

FEISHU_CLIENT_ID=<飞书应用 App ID>
FEISHU_CLIENT_SECRET=<飞书应用 App Secret>
FEISHU_REDIRECT_URI=https://admin.plum.top/api/auth/feishu/callback
```

`ADMIN_API_WRITE_ENABLED` 一期保持 `false`。**上线角色批量导入时改为 `true`**——这是全局开关，改了之后内容复核的三处置（`release` / `confine` / `purge`，其中 `purge` 不可撤销）也一并在生产可用。这个连带影响已于 2026-09-05 拍板接受，前提是写操作都有审计，覆盖范围见[角色批量导入 PRD §11.3](./CHARACTER_IMPORT_PRD.md)。

```bash
chmod 600 .env
npm run lint
npm run typecheck
npm test
npm run build
```

## 4. 安装用户级 systemd 服务

模板中的 Node 目录和工作目录必须在安装时替换；不要把某台机器的 NVM 补丁版本路径提交到仓库。

```bash
cd /opt/workspace/plum_admin
node_bin_dir="$(dirname "$(command -v node)")"
install -d "$HOME/.config/systemd/user"
sed \
  -e "s|__PLUM_ADMIN_DIR__|/opt/workspace/plum_admin|g" \
  -e "s|__NODE_BIN_DIR__|$node_bin_dir|g" \
  deploy/systemd/plum-admin-frontend.service.in \
  > /tmp/plum-admin-frontend.service
install -m 0644 /tmp/plum-admin-frontend.service \
  "$HOME/.config/systemd/user/plum-admin-frontend.service"

sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0755 /var/log/apps
sudo loginctl enable-linger "$(id -un)"
systemctl --user daemon-reload
systemctl --user enable --now plum-admin-frontend.service
systemctl --user is-active plum-admin-frontend.service
curl -fsS http://127.0.0.1:3001/api/health
```

升级 Node.js 后重新渲染 unit，避免继续引用已经删除的 NVM 版本目录。

## 5. 安装 nginx 和 TLS

脱敏日志格式只记录 `$uri`，不能改回包含 `$request_uri` 的默认请求行；OAuth 回调查询参数中包含短期
authorization code 和 state。

```bash
cd /opt/workspace/plum_admin
sudo install -m 0644 deploy/nginx/admin-log-format.conf \
  /etc/nginx/conf.d/admin-log-format.conf
sudo install -m 0644 deploy/nginx/admin.plum.top.conf \
  /etc/nginx/sites-available/admin.plum.top.conf
sudo ln -s /etc/nginx/sites-available/admin.plum.top.conf \
  /etc/nginx/sites-enabled/admin.plum.top.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d admin.plum.top
sudo nginx -t
sudo systemctl reload nginx
```

Certbot 会在 `/etc/nginx/sites-available/admin.plum.top.conf` 的安装副本中加入证书路径和 HTTP 到 HTTPS
跳转；仓库模板保持为首次签发证书前可加载的 HTTP 配置。确认续期 timer：

```bash
systemctl is-enabled certbot.timer
systemctl list-timers --all | rg certbot
```

系统自带 `/etc/logrotate.d/nginx` 通常覆盖 `/var/log/nginx/*.log`。应用日志还需安装
`ai4all_bridge/deploy/logrotate/apps.conf`；安装后使用 `logrotate -d` 检查没有重复匹配。

## 6. 首次登录和首位 Admin

飞书应用可用范围内的成员首次登录会自动注册为 `active operator`，无需提前创建账号。自注册永远不会授予
Admin。首位 Admin 的安全顺序如下：

1. 候选人在 `https://admin.plum.top` 完成一次真实飞书登录。
2. 从后端隔离表 `plum_admin_users` 核对其真实 `open_id`、姓名和非占位 `tenant_key`。
3. 使用一次性脚本提升该真实身份：

```bash
cd /opt/workspace/ai4all_bridge
.venv/bin/python scripts/bootstrap_plum_admin.py \
  --open-id <飞书实际返回的 ou_...> \
  --display-name <姓名> \
  --confirm
```

4. 刷新后台，确认 `/admin/plum/me` 返回 `admin` 和 `staff.manage`。
5. 如果曾创建错误的 `bootstrap_pending` 占位身份，必须先确认真实 Active Admin 已存在，再通过后台成员管理
   或带审计的仓储逻辑将错误身份设为 `disabled`；不要直接删除数据库行。

同事能否登录由飞书应用“可用范围”控制。新成员自动成为 Operator；只有 Active Admin 可以授予 Admin。

## 7. 验证与监控

```bash
curl -fsS http://127.0.0.1:8180/health/ready
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://admin.plum.top/api/health
curl -fsSI https://admin.plum.top/
ss -ltn | rg ':3001|:8180|:80|:443'
```

验收至少覆盖：真实飞书登录、Admin/Operator 导航差异、Disabled 用户立即拒绝、Character/Work/Creator/User 只读查询、Overview 四项指标和统计窗口、一期外写路径不可用、其他产品旧 Admin 路由不变、
访问日志不包含 OAuth 查询参数。纯只读一期内前后端业务写开关始终保持 `false`。只读发布不要求新增备份设施或恢复演练；官方角色和其他业务写能力已移至后续，不能在一期部署窗口临时开启。

把 `ai4all_bridge/deploy/systemd/ai4all-monitor-health.service` 和 timer 安装到同一运行用户的
`~/.config/systemd/user/`。该 service 应同时检查：

- `http://127.0.0.1:3001/api/health`
- `https://admin.plum.top/api/health`

## 8. 日常发布与回滚

合并到 `main` 后，GitHub Actions 的 `CI` workflow 全绿会自动触发
`.github/workflows/deploy-ec201.yml`：锁定该次 CI 对应的 Commit，通过 SSH 更新
`/opt/workspace/plum_admin`，安装锁文件依赖、完成生产构建、重启用户级 systemd 服务，并依次检查本机和公网
健康端点。部署任务使用并发锁串行执行，不会取消已经开始的发布。
若较旧 CI 的部署任务晚于新版本到达，脚本会确认生产环境已位于 `origin/main` 上更晚的 Commit 后跳过旧任务，
不会用新代码冒充旧 Commit 重复构建。CI 也会使用 `actionlint` 检查所有 workflow 的 YAML、表达式和 shell。

首次启用前，在 GitHub `ec201` Environment 配置与 `plum_chat` 相同的 Secrets：

- `EC2_HOST`、`EC2_USER`、`EC2_SSH_KEY`：EC201 SSH 连接信息。
- `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_DEPLOY_CHAT_ID`：部署开始和结果通知；通知失败不会阻断发布。

EC201 上仍须先按第 3、4 节准备权限为 `600` 的 `.env` 和
`plum-admin-frontend.service`。生产 Git 工作区存在未提交改动、`.env` 缺失或权限错误、Node/npm 版本不符、
构建失败、服务启动失败、任一健康检查失败时，自动发布会停止并发送失败通知。不要在生产工作区保留临时改动；
脚本不会 reset 或 stash 它们。

特殊发布窗口不希望 merge 后自动上线时，在 merge commit message 中加入 `[skip deploy]`。需要重跑或已完成
特殊情况处置后，在 GitHub Actions 的 `Deploy EC201` 页面使用 `Run workflow`；人工触发不受
`[skip deploy]` 限制。

发布前仍应记录两个仓库 Commit、数据库 schema 版本、服务启动时间和 `.env` 备份位置。需要在机器上人工发布时
执行：

```bash
git pull --ff-only
npm ci
npm run lint
npm run typecheck
npm test
npm run build
systemctl --user restart plum-admin-frontend.service
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://admin.plum.top/api/health
```

前端异常时切回已记录的上一 Commit，重新执行 `npm ci`、`npm run build` 并重启。Migration 129 是扩展式迁移，
回滚前端或后端代码时不要删除 `plum_admin_users`。认证异常时优先关闭入口或回滚前端，不要通过开放写开关、
复用其他 Token 或回落到共享 Admin 表绕过问题。
