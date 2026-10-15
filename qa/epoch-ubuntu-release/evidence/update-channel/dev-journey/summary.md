# 密封 dev 态更新旅程 — FAIL

- 生成时间: 2026-10-15T08:37:13.427Z
- 当前版本: 3.14.3；夹具版本: 3.14.4
- dev feed: http://127.0.0.1:8081（dev-app-update.yml: generic http://localhost:8081）

## A. 夹具自证（feedFixtureSelfTest）

- [pass] selftest-available: electron-updater 报告 update-available（版本高于 3.14.3）
- [pass] selftest-download-progress: 下载进度事件出现
- [pass] selftest-update-downloaded: update-downloaded 事件出现（期望版本 3.14.4）
- [pass] selftest-downloaded-version: downloaded 版本 = 夹具版本 3.14.4
- [pass] selftest-staged-file: staged 文件: /tmp/w037-feed-selftest-60ds7L/cache-home/zcode-dev-updater/pending/Epoch-3.14.4-linux-x86_64.AppImage
- [pass] selftest-staged-sha512: staged 文件 sha512 与 manifest 一致（electron-updater 已验证 + 独立复核）

## B. 应用旅程（appJourney —— 验收门）

- [pass] dev-build-present: 桌面 dev 构建产物存在: /home/z/Epoch-2.0/packages/desktop/out/main/index.js
- [pass] first-screen-not-blocked: dev 应用首屏就绪（worldCanvas=true readyDot=true）
- [pass] menu-check-triggered: 菜单路径触发（via=menu-item-click-handler）
- [fail] feed-manifest-requested: 本地 feed 的 latest-linux.yml 被应用请求（命中 0 次；0 次 = dev 态未读取 dev-app-update.yml —— 预修复 seam 缺陷）
- [fail] update-available-surfaced: 新版本未浮现于菜单状态（观察到的状态序列: Check for updates）
- [pass] checking-state-observed: checking 状态被观察（stdout checking 行 / 菜单 label·enabled 变化）
- [fail] downloading-progress-observed: downloading 进度被观察（stdout download-progress 或菜单 label 百分比）
- [fail] ready-staged-on-disk: updater 缓存目录未出现 staged 更新文件
- [fail] staged-sha512-match: staged 文件 sha512 与 manifest 一致
- [fail] downloaded-menu-state: 未观察到 ready/restart 菜单状态
- [fail] feed-file-downloaded: 更新文件被下载（feed 服务器命中 0 次）
- [fail] no-zcode-update-traffic: dev 旅程内 ZCode 端点更新尝试为 0（sink 策略下仍记录 CONNECT 尝试；实际命中 2 次）

> 预修复实测: 预修复构建：initAutoUpdater 无条件 setFeedURL(ZCode manifest provider)，electron-updater 的 clientPromise 已设即不再读取 dev-app-update.yml —— 本地 feed 0 命中即该 seam（W037-W1）的实测证据。

> 终点语义: staging（update-downloaded + staged 文件）为验收终点：quitAndInstall 会退出并重启应用（dev 态回退 app.relaunch），在旅程中执行即中断观察 —— 工单明示不需要。

## feed 服务器命中

- （无命中 —— dev 应用未请求本地 feed）