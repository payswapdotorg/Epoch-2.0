# W037-W2 — Epoch 更新通道验收套件

证明「Epoch 桌面安装包的更新通道是 Epoch 自己的」这件事，只能来自**真实构建产物**与
**真实观察到的行为**——不是读代码。本目录是 W037 Worker 2 的验收面。

三部分（spec/acceptance/epoch-auto-update-channel.md 是验收清单）：

| 部分 | CLI | 断言 |
| --- | --- | --- |
| 静态 feed 审计 | `feed-audit.mjs` | 烘烤的 `resources/app-update.yml` 必须是 GitHub provider `payswapdotorg/Epoch-2.0`；generic 占位 / `zcode.z.ai` / 缺失 = FAIL |
| 真实窗口网络断言 | `update-network-assertion.mjs` | 打包应用（真实 Electron 窗口）经菜单路径触发「检查更新」；更新尝试流量只许命中 Epoch feed 主机；ZCode 端点更新尝试必须为 0 |
| 密封 dev 更新旅程 | `dev-update-journey.mjs` | 本地 feed（`dev-app-update.yml` → localhost:8081）提供更高版本；未打包 dev 应用经真实菜单路径完成 check → available → downloading → ready(staged) |

## 快速开始（总门）

```bash
# 0) 依赖 + 产物（重但真实；参考 packages/desktop/scripts/linux-release/build-linux-release.sh）
pnpm install --frozen-lockfile
bash packages/desktop/scripts/linux-release/build-linux-release.sh
# → packages/desktop/dist/Epoch-<version>-linux-amd64.deb + .AppImage

# 1) 更新通道总门（一键运行全部三部分并聚合）
bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh \
  --dist packages/desktop/dist
# 或显式产物：
bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh \
  --deb packages/desktop/dist/Epoch-3.14.3-linux-amd64.deb \
  --appimage packages/desktop/dist/Epoch-3.14.3-linux-x86_64.AppImage
```

证据输出：`qa/epoch-ubuntu-release/evidence/update-channel/`
（`feed-audit.json` + `network/<mode>/manifest.json` + `dev-journey/manifest.json`
+ `update-channel-report.json` + `update-channel-summary.md` + 截图/日志）。
环境变量 `EPOCH_UPDATE_EVIDENCE_DIR=<dir>` 可重定向证据目录。

## 单独运行各部分

```bash
# 静态 feed 审计（无窗口依赖）
node qa/epoch-ubuntu-release/update-channel/feed-audit.mjs \
  --deb packages/desktop/dist/Epoch-3.14.3-linux-amd64.deb \
  --appimage packages/desktop/dist/Epoch-3.14.3-linux-x86_64.AppImage \
  --out qa/epoch-ubuntu-release/evidence/update-channel

# 合成 PASS/FAIL 路径自测（不需要产物 —— 用于验证审计断言本身的判别力）
node qa/epoch-ubuntu-release/update-channel/feed-audit.mjs \
  --resources-dir <含 app-update.yml 的目录>

# 真实窗口网络断言（需要 Xvfb；显示自足：ambient DISPLAY → :99 → 私有 Xvfb -ac）
node qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs \
  --deb packages/desktop/dist/Epoch-3.14.3-linux-amd64.deb

# 密封 dev 更新旅程（需要 packages/desktop/out 构建产物 —— 总门构建已产出）
node qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs

# 聚合（总门内部也会调用）
node qa/epoch-ubuntu-release/update-channel/aggregate.mjs \
  --out qa/epoch-ubuntu-release/evidence/update-channel
```

## 观察分层（网络断言 / dev 旅程共用）

1. **观察型正向代理**：以 `--proxy-server` 注入应用（不改任何应用配置）。Chromium
   网络栈全量可见 —— renderer 请求 + 主进程 `electron.net`（electron-updater 的
   `ElectronHttpExecutor` 正走该栈，故更新请求必然可见）。HTTPS 经代理为
   `CONNECT host:port`（主机级证据）；HTTP 为绝对 URI（URL 级证据）。
   - `zcode.z.ai`（及 `--zcode-origin` 指定端点）= **sink**：记录 CONNECT 尝试后挂断。
     尝试本身即证据；测试绝不向真实 ZCode 服务器发更新探测。
   - GitHub feed 主机（api.github.com / github.com / *.githubusercontent.com）=
     **透明隧道**：应用获得真实响应（404/403 等），行为保真。
2. **CDP Network 域**（`page.context().newCDPSession(page)`）：renderer 请求 URL 级记录。
3. **主进程 stdout**：`[auto-update]` 日志行（provider 身份、checking、错误）。
4. **feed 服务器命中日志**（dev 旅程）：latest-linux.yml / 更新文件的每次请求。

不在观察范围（如实记录于 manifest 的 `observation.notObserved`）：host/agent 子进程的
Node `http` 直连不经 Chromium 代理（更新器不在该进程；本环境无 root，无法系统级抓包）。

## 预修复构建的诚实结果（W037-W1 seam 未合入 main 时）

- 网络断言：主进程 `initAutoUpdater` 仍无条件 `setFeedURL(ZCode manifest provider)` →
  启动期后台检查 + 菜单手动检查都会 `CONNECT zcode.z.ai:443` → 断言 FAIL。这不是
  套件缺陷，是工单记录的**线上缺陷的实测证据**（manifest 的 `preFixBuildNote` 字段）。
- dev 旅程：electron-updater 的 `setFeedURL` 已设 `clientPromise`，盘上的
  `dev-app-update.yml` 不再被读取 → 本地 feed 服务器 0 命中 → 旅程 FAIL
  （`feed-manifest-requested` 检查失败详情即 seam 证据）。夹具自证部分
  （feedFixtureSelfTest）独立于该 seam，仍然应当 PASS —— 它证明 feed 夹具与
  electron-updater 链路本身正确。

W037-W1 修复合入后，TL 在集成提交上重跑本总门，三部分转绿才是验收通过。

## dev 旅程的终点语义

`ready/downloaded`（staged 文件落盘 + sha512 校验）是验收终点。`quitAndInstall` 会
退出并重启应用（dev 态回退为 `app.relaunch`），在旅程中执行等于中断观察 —— 工单明示
不需要，本套件不执行它。

## 实现要点（排障记录，复现时值得知道）

- **electron-updater 语义**：`setFeedURL` 一旦调用即设置 `clientPromise`，盘上的
  `app-update.yml` / `dev-app-update.yml` 不再被读取 —— 预修复 main 上
  `applyManifestUpdateProvider` 无条件 setFeedURL，这正是 dev 旅程在预修复构建上
  FAIL 的机理（本地 feed 0 命中）。
- **stdout 捕获时序**：playwright `_electron.launch` 握手期间挂监听会丢早期行 ——
  夹具自证用「哨兵文件」让主进程等驱动侧挂好捕获再开始更新流。
- **Linux AppImageUpdater**：下载需要 `APPIMAGE` 环境变量（差分基准；失败自动回退
  全量下载）。旅程把 APPIMAGE 指向**临时占位文件**，绝不指向真实产物 ——
  `autoInstallOnAppQuit` 在应用退出时会把 staged 文件移到 APPIMAGE 同目录并删除旧
  文件，指向真实产物会把发布目录的 AppImage 换成夹具（开发期间实测发生过一次，
  已通过 `autoInstallOnAppQuit=false`（自证）+ 占位文件（双保险）根治；受污染产物
  已重建）。
- **dev 态 renderer 加载**：vite 产物的 ES 模块（`type="module" crossorigin`）经裸
  `file://` 会被 CORS 拦截。真实 dev 模式走 `ELECTRON_RENDERER_URL` —— 旅程用本地
  静态服务器承载 `out/renderer`（同一 dev 契约，`app.isPackaged` 仍为 false），并把
  `text/html` 等 content-type 发对（否则主框架导航被当下载而 ERR_FAILED）。
- **feed 命中基线**：夹具自证与应用旅程共用一台 feed 服务器 —— 旅程只统计基线之后的
  新增命中，避免把自证流量记成应用行为（洗绿防线）。
- **Xvfb 死 socket**：私有 Xvfb 被强杀后 `/tmp/.X11-unix/X99` 会残留死文件，显示解析
  对 socket 做「可连」探测而不是「存在」探测。

## 环境要求

- node ≥ 24、pnpm 10.33.2（仓库 `packageManager` 锁定）；
- `dpkg-deb`（deb 解包）、可执行的 `.AppImage`（`--appimage-extract`，无需 FUSE）；
- `Xvfb`（真实窗口显示自足法；无任何 X 显示时窗口部分如实失败，不静默跳过）；
- 网络出站（GitHub feed 隧道转发需要；`zcode.z.ai` 走 sink，无需真实可达）。

## 文件清单

- `feed-audit.mjs` — 静态 feed 审计 CLI；
- `update-network-assertion.mjs` — 真实窗口网络断言 CLI；
- `dev-update-journey.mjs` — 密封 dev 更新旅程 CLI（含夹具自证）；
- `run-update-gate.sh` — 总门编排器（显示自足法 + 四步编排）；
- `aggregate.mjs` — 机器可读聚合器（PASS/FAIL/skipped 裁决法）；
- `lib/common.mjs` — 环境/显示/产物解包/manifest 写出共享件；
- `lib/observing-proxy.mjs` — 观察型正向代理（sink/tunnel 策略）；
- `lib/feed-server.mjs` — 本地静态 feed 服务器 + latest-linux.yml 夹具构造；
- `lib/app-driver.mjs` — 窗口驱动共享件（stdout 捕获 / CDP / 菜单路径 / 状态轮询）。
