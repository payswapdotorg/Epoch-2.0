# 更新通道网络断言（真实窗口）— FAIL

- 生成时间: 2026-10-15T08:24:16.219Z
- 模式: deb；产物: `/home/z/Epoch-2.0/packages/desktop/dist/Epoch-3.14.3-linux-amd64.deb`
- 显示: :99（ambient）

## 断言

| 断言 | 状态 | 说明 |
| --- | --- | --- |
| real-window-launch | pass | 打包产物以真实 Electron 窗口启动（_electron.launch） |
| first-screen-not-blocked | pass | 更新检查/网络失败不得阻塞施工世界首屏（worldCanvas=true readyDot=true） |
| menu-check-triggered | pass | 菜单路径触发成功（via=menu-item-click-handler） |
| update-check-executed | pass | 更新检查实发（checking 日志 2 行 / 状态序列 1 条） |
| epoch-feed-hit | fail | 更新尝试应命中 Epoch feed 主机（api.github.com/github.com 资产域）；观察窗内命中 0 次 |
| zero-zcode-update-traffic | fail | 更新尝试对 ZCode 端点（zcode.z.ai）命中 1 次（必须为 0） |
| manifest-provider-runtime-absent | fail | 主进程日志实测：[auto-update] service manifest provider applied —— ZCode manifest provider 被安装（W037-W1 seam 缺陷的运行时证据） |
| observation-sufficient | pass | 观察层命中：proxy=12 cdp=9（无命中 → inconclusive，不得计为通过） |

## 更新尝试流量分类

- Epoch feed 命中（更新尝试）: **0**
- ZCode 端点命中（更新尝试）: **1**
  - 2026-10-15T08:23:17.404Z proxy connect zcode.z.ai:443 
- ZCode 端点命中（全部，含 renderer 后端流量，供 TL 裁量）: 2
- 其它主机（非更新通道断言面）: redirector.gvt1.com×6, rr3---sn-i3belnll.gvt1.com×2, rr5---sn-i3belnll.gvt1.com×2

## 主进程 [auto-update] 运行时证据（stdout）

```
[2026-10-15 08:23:17.381] [pid:20013] [main] [auto-update] initializing, current version: 3.14.3
[2026-10-15 08:23:17.382] [pid:20013] [main] [auto-update] service manifest provider applied platform=linux-x86_64
[2026-10-15 08:23:17.390] [pid:20013] [main] [auto-update] checking for update...
[2026-10-15 08:23:17.405] [pid:20013] [main] [auto-update] error: Error: net::ERR_TUNNEL_CONNECTION_FAILED
[2026-10-15 08:23:17.407] [pid:20013] [main] [auto-update] startup check failed: Error: net::ERR_TUNNEL_CONNECTION_FAILED
[2026-10-15 08:23:30.510] [pid:20013] [main] [auto-update] user clicked Check for Updates
[2026-10-15 08:23:30.511] [pid:20013] [main] [auto-update] checking for update...
[2026-10-15 08:23:30.524] [pid:20013] [main] [auto-update] error: Error: net::ERR_TUNNEL_CONNECTION_FAILED
[2026-10-15 08:23:30.525] [pid:20013] [main] [auto-update] manual check result → wc=1: error
[2026-10-15 08:23:30.525] [pid:20013] [main] [auto-update] manual check failed: Error: net::ERR_TUNNEL_CONNECTION_FAILED
```
## 菜单状态序列（真实 UI 面）

- 2026-10-15T08:23:30.552Z label="Check for updates" enabled=true

## 观察分层诚实声明

- proxy 层：Chromium 网络栈全量（renderer + 主进程 electron.net —— electron-updater 所在栈）。
- CDP 层：renderer 请求（URL 级）。
- 主进程 stdout：[auto-update] 日志。
- 不在观察范围：host/agent 子进程的 Node http 直连（更新器不在该进程；本环境无 root 无法系统级抓包）。
