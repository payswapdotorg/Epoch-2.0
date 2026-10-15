#!/usr/bin/env node
/* eslint-disable max-lines -- 发布验收脚本按仓库惯例保持步骤逻辑集中（见 scripts/bundle.mjs）。 */
/**
 * W037-W2 — 密封 dev 态更新旅程：本地 feed 服务器 + 未打包 dev 应用 的真实更新流。
 *
 * 用法（仓库根执行；需要先完成 pnpm install 与桌面构建 out/ 产物）：
 *   node qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs
 *   node qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs --feed-port 8081
 *   node qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs --self-test-only
 *
 * 两个正交部分（manifest 分开记录，绝不把夹具自测当成应用旅程通过）：
 *
 * A. feedFixtureSelfTest —— 夹具正确性自证：
 *    用仓库的 electron + 仓库的 electron-updater + 仓库的 dev-app-update.yml（只读复制），
 *    在临时 app 目录跑一个最小 Electron 主进程：forceDevUpdateConfig=true → 读取
 *    dev-app-update.yml → generic provider → localhost:8081 → check → available →
 *    download → update-downloaded（staged 文件 sha512 校验）。它证明 latest-linux.yml
 *    夹具 + sha512 + dummy 文件 + dev feed 配置端到端正确。
 *
 * B. appJourney —— 真正的验收门（W036 法：跳过不算通过）：
 *    启动未打包 dev 应用（packages/desktop 的 out 构建产物；electron dist 二进制；
 *    ZCODE_AUTO_UPDATE_DEV=1 激活 dev 态更新器；ZCODE_AUTO_UPDATE_DEV_VERSION 锁定当前
 *    产品版本；XDG_CACHE_HOME 隔离 updater 缓存；ZCODE_ENV 已在构建期烘为 production），
 *    通过真实菜单路径触发「检查更新」，断言：
 *      check → available（新版本号浮现于菜单/toast —— 真实 UI 面）
 *           → downloading（progress）
 *           → ready/downloaded（staged 文件落盘 + sha512 匹配）。
 *    观察分层与网络断言一致（观察代理 + CDP + stdout + feed 服务器命中日志）；
 *    ZCode 端点 sink —— 旅程绝不向真实 ZCode 服务器发更新探测。
 *
 *    预修复构建（W037-W1 seam 未合入）上的诚实结果：initAutoUpdater 无条件安装 ZCode
 *    manifest provider（setFeedURL 优先级高于 dev-app-update.yml —— electron-updater
 *    的 clientPromise 已设则不再读盘上配置），本地 feed 服务器 0 命中、菜单回到
 *    idle/检查失败 —— 旅程 FAIL，并把该 seam 缺陷作为实测证据记录。
 *
 * 终点语义：staging（update-downloaded + staged 文件）即验收终点。quitAndInstall 会
 * 重启/退出应用（dev 态走 app.relaunch 回退），在验收旅程中执行等于中断观察 —— 不需要。
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createHash } from "node:crypto";
import {
  CHROMIUM_FLAGS,
  DEFAULT_EVIDENCE_ROOT,
  DEFAULT_ZCODE_ENDPOINT_ORIGIN,
  DESKTOP_ROOT,
  REPO_ROOT,
  absolute,
  collectEnvironment,
  detectElectronRuntimeVersion,
  hostnameOfOrigin,
  loadElectronLauncher,
  log,
  resolveDisplaySelfSufficient,
  resolveDevElectronBinary,
  resolveDesktopAppVersion,
  writeEvidence,
  writeMarkdown,
} from "./lib/common.mjs";
import { craftUpdateFixture, readDevAppUpdateYaml, startFeedServer } from "./lib/feed-server.mjs";
import { startObservingProxy } from "./lib/observing-proxy.mjs";
import {
  attachCdpNetwork,
  capture,
  captureProcessOutput,
  clickCheckForUpdates,
  closeApp,
  pollMenuStates,
  snapshotUpdateMenuItem,
  waitForFirstScreen,
} from "./lib/app-driver.mjs";

const LAUNCH_TIMEOUT_MS = 180_000;
const JOURNEY_SETTLE_TIMEOUT_MS = 120_000;

function usage(exitCode) {
  console.log(
    [
      "用法: node qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs [--feed-port 8081]",
      "       [--evidence <dir>] [--skip-self-test] [--self-test-only] [--app-version <version>]",
      "",
      "  --feed-port <n>        本地 feed 服务器端口（默认读 dev-app-update.yml 的 8081）",
      "  --evidence <dir>       证据输出目录（默认 qa/epoch-ubuntu-release/evidence/update-channel/dev-journey）",
      "  --skip-self-test       跳过夹具自证部分（正常验收门不应使用 —— 会记 skipped 并 FAIL）",
      "  --self-test-only       只运行夹具自证（应用旅程记 skipped 并 FAIL —— 调试用）",
      "  --app-version <v>      显式指定当前应用版本（默认 out/metadata/build-meta.json → 根 package.json）",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { feedPort: null, evidenceRoot: null, skipSelfTest: false, selfTestOnly: false, appVersion: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--feed-port") options.feedPort = Number.parseInt(argv[++index], 10) || null;
    else if (arg === "--evidence") options.evidenceRoot = argv[++index];
    else if (arg === "--skip-self-test") options.skipSelfTest = true;
    else if (arg === "--self-test-only") options.selfTestOnly = true;
    else if (arg === "--app-version") options.appVersion = argv[++index];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  return options;
}

/** 递归收集缓存目录里的文件（staged 证据）。 */
function listFilesRecursive(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) out.push(...listFilesRecursive(path));
    else out.push(path);
  }
  return out;
}

function sha512Base64OfFile(path) {
  return createHash("sha512").update(readFileSync(path)).digest("base64");
}

/**
 * A. 夹具自证：最小 Electron 主进程 + 仓库 electron-updater + 真实 dev-app-update.yml 副本。
 * 证明：latest-linux.yml（版本更高、sha512 正确）+ dummy 文件 + generic feed（localhost:8081）
 * 在 electron-updater 端到端可用（check → available → download → downloaded + staged 校验）。
 *
 * 技术要点：
 * - 启动哨兵文件（W037_SELFTEST_START_FILE）：主进程窗口就绪后等待该文件出现才开始更新流，
 *   确保驱动侧先挂好 stdout 捕获再触发 —— 否则早期行会被 launch 握手窗口吞掉；
 * - APPIMAGE 环境变量：Linux 上 AppImageUpdater.doDownloadUpdate 需要 APPIMAGE 指向旧包
 *   （差分基准；差分失败自动回退全量下载）。指向「临时占位文件」而绝不动真实产物 ——
 *   autoInstallOnAppQuit 已显式关闭，但即便有残留安装副作用也只会影响临时文件；
 * - autoInstallOnAppQuit=false：staging 是验收终点，退出绝不移动/删除任何文件。
 */
async function runFeedFixtureSelfTest({ feedOrigin, fixture, appVersion, electronLauncher, display, appimagePath }) {
  const logFn = (message) => log("dev-journey-selftest", message);
  const checks = [];
  const addCheck = (id, status, detail) => checks.push({ id, status, detail });
  const selfTestDir = mkdtempSync(join(tmpdir(), "w037-feed-selftest-"));
  let app = null;
  let stdoutLines = [];
  try {
    // 最小 dev app：package.json + main.js + dev-app-update.yml（真实文件副本）
    writeFileSync(
      join(selfTestDir, "package.json"),
      `${JSON.stringify(
        {
          name: "w037-feed-selftest",
          version: appVersion,
          main: "main.js",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const devYml = readDevAppUpdateYaml(DESKTOP_ROOT);
    copyFileSync(devYml.path, join(selfTestDir, "dev-app-update.yml"));
    const electronUpdaterEntry = join(REPO_ROOT, "node_modules", "electron-updater");
    const startFile = join(selfTestDir, "start");
    writeFileSync(
      join(selfTestDir, "main.js"),
      `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const updater = require(${JSON.stringify(electronUpdaterEntry)});
const { autoUpdater } = updater;
const emit = (line) => console.log("[selftest] " + line);
const startFile = ${JSON.stringify(startFile)};
autoUpdater.logger = { info: (...a) => console.log("[updater]", ...a), warn: (...a) => console.warn("[updater]", ...a), error: (...a) => console.error("[updater]", ...a) };
autoUpdater.forceDevUpdateConfig = true; // dev 态读取 dev-app-update.yml（与 desktop 运行时同开关语义）
autoUpdater.currentVersion = ${JSON.stringify(appVersion)};
autoUpdater.autoDownload = false;
// 夹具自证的终点是 staged（update-downloaded + 落盘）。autoInstallOnAppQuit 默认开启，
// 退出时会把 staged 文件移动到 APPIMAGE 同目录并删除旧文件 —— 对验收器是破坏性副作用，必须关掉。
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.on("update-available", (info) => emit("update-available " + info.version));
autoUpdater.on("download-progress", (p) => emit("download-progress " + p.percent.toFixed(1)));
autoUpdater.on("update-downloaded", (info) => emit("update-downloaded " + info.version));
autoUpdater.on("error", (e) => emit("error " + (e && (e.stack || e.message))));
function waitForStart() {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (fs.existsSync(startFile)) { clearInterval(timer); resolve(); }
    }, 100);
  });
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 640, height: 480, show: true });
  await win.loadURL("data:text/html,<title>w037 feed selftest</title><pre>" + ${JSON.stringify(feedOrigin)} + "</pre>");
  emit("window-ready");
  await waitForStart();
  emit("started");
  try {
    emit("checking");
    const result = await autoUpdater.checkForUpdates();
    emit("check-result isUpdateAvailable=" + (result && result.isUpdateAvailable) + " version=" + (result && result.updateInfo && result.updateInfo.version));
    if (result && result.isUpdateAvailable) {
      emit("downloading");
      await autoUpdater.downloadUpdate();
      emit("download-call-resolved");
    }
  } catch (e) {
    emit("check-failed " + (e && (e.stack || e.message)));
  }
  emit("done");
  setTimeout(() => app.exit(0), 5000);
});
`,
      "utf8",
    );
    const cacheHome = join(selfTestDir, "cache-home");
    mkdirSync(cacheHome, { recursive: true });
    const selfTestEnv = {
      ...process.env,
      DISPLAY: display.display,
      XDG_CACHE_HOME: cacheHome,
      // Linux AppImageUpdater 下载需要 APPIMAGE（差分基准 → 失败回退全量）；真实用户环境由 AppImage runtime 注入。
      APPIMAGE: appimagePath,
    };
    delete selfTestEnv.ELECTRON_RENDERER_URL;
    delete selfTestEnv.ELECTRON_RUN_AS_NODE;
    app = await electronLauncher.launch({
      executablePath: resolveDevElectronBinary(),
      args: [...CHROMIUM_FLAGS, selfTestDir],
      env: selfTestEnv,
      timeout: 120_000,
    });
    const captureOutput = captureProcessOutput(app);
    await app.firstWindow();
    // 先挂好 stdout 捕获，再写哨兵文件触发更新流（消除早期行丢失）。
    await sleep(1_000);
    writeFileSync(startFile, "go", "utf8");
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      stdoutLines = captureOutput.snapshot();
      if (stdoutLines.some((entry) => /\[selftest\] done/.test(entry.text))) break;
      await sleep(500);
    }
    await sleep(1_000); // 等待 update-downloaded 事件后的落盘/收尾
    const selftestLines = stdoutLines.filter((entry) => /\[selftest\]|\[updater\]/.test(entry.text));
    const available = selftestLines.some((entry) => /\[selftest\] update-available /.test(entry.text));
    const progressed = selftestLines.some((entry) => /\[selftest\] download-progress /.test(entry.text));
    const downloaded = selftestLines.some((entry) => /\[selftest\] update-downloaded /.test(entry.text));
    const downloadedVersionOk = selftestLines.some(
      (entry) => new RegExp(`\\[selftest\\] update-downloaded ${fixture.targetVersion.replace(/\./g, "\\.")}$`).test(entry.text),
    );
    // staged 文件：XDG_CACHE_HOME 下的 updater 缓存目录
    const stagedFiles = listFilesRecursive(join(cacheHome));
    const stagedUpdateFile = stagedFiles.find((path) => path.endsWith(fixture.fileName)) ?? null;
    const stagedShaOk =
      stagedUpdateFile != null && sha512Base64OfFile(stagedUpdateFile) === fixture.sha512Base64;
    addCheck("selftest-available", available ? "pass" : "fail", `electron-updater 报告 update-available（版本高于 ${appVersion}）`);
    addCheck("selftest-download-progress", progressed ? "pass" : "fail", "下载进度事件出现");
    addCheck("selftest-update-downloaded", downloaded ? "pass" : "fail", `update-downloaded 事件出现（期望版本 ${fixture.targetVersion}）`);
    addCheck("selftest-downloaded-version", downloadedVersionOk ? "pass" : "fail", `downloaded 版本 = 夹具版本 ${fixture.targetVersion}`);
    addCheck(
      "selftest-staged-file",
      stagedUpdateFile != null ? "pass" : "fail",
      stagedUpdateFile != null ? `staged 文件: ${stagedUpdateFile}` : "缓存目录中未找到 staged 更新文件",
    );
    addCheck("selftest-staged-sha512", stagedShaOk ? "pass" : "fail", "staged 文件 sha512 与 manifest 一致（electron-updater 已验证 + 独立复核）");
    const verdict = checks.every((check) => check.status === "pass") ? "pass" : "fail";
    return {
      part: "feedFixtureSelfTest",
      purpose:
        "夹具自证：仓库 electron-updater + 真实 dev-app-update.yml（副本）+ 本地 latest-linux.yml 夹具端到端可用。它不代替应用旅程（appJourney 才是验收门）。",
      feedOrigin,
      fixture: {
        currentVersion: appVersion,
        targetVersion: fixture.targetVersion,
        fileName: fixture.fileName,
        bytes: fixture.bytes,
        sha512Base64: fixture.sha512Base64,
      },
      selftestLines,
      environment: { appimageEnv: appimagePath },
      stagedFiles,
      checks,
      verdict,
    };
  } finally {
    if (app) {
      try {
        await closeApp(app, logFn, 15_000);
      } catch {
        // 清理失败不影响退出码
      }
    }
    rmSync(selfTestDir, { recursive: true, force: true });
  }
}

/**
 * B. 应用旅程：未打包 dev 应用 + 真实菜单路径 + 本地 feed。
 */
async function runAppJourney({ feedOrigin, feedServer, fixture, appVersion, evidenceDir, electronLauncher, display, zcodeOrigin, appimagePath, baselineFeedHitCount }) {
  const logFn = (message) => log("dev-journey", message);
  const checks = [];
  const addCheck = (id, status, detail) => checks.push({ id, status, detail });
  const screenshots = [];
  const proxy = await startObservingProxy({ sinkOrigins: [zcodeOrigin], logPrefix: "dev-journey" });
  const userDataDir = mkdtempSync(join(tmpdir(), "epoch-devjourney-ud-"));
  mkdirSync(userDataDir, { recursive: true });
  const cacheHome = mkdtempSync(join(tmpdir(), "epoch-devjourney-cache-"));
  const mainBundle = join(DESKTOP_ROOT, "out", "main", "index.js");
  addCheck(
    "dev-build-present",
    existsSync(mainBundle) ? "pass" : "fail",
    existsSync(mainBundle)
      ? `桌面 dev 构建产物存在: ${mainBundle}`
      : `缺少 ${mainBundle} —— 先完成桌面构建（pnpm --filter @zcode/desktop build 或 linux-release 构建脚本）`,
  );
  let app = null;
  let cdp = null;
  let stdoutCapture = null;
  let firstScreen = { ready: false, markers: {} };
  let menuClick = { clicked: false };
  let menuTimeline = [];
  let launcherError = null;
  if (!existsSync(mainBundle)) {
    await proxy.close();
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(cacheHome, { recursive: true, force: true });
    return {
      part: "appJourney",
      checks,
      verdict: "fail",
      launcherError: "dev 构建缺失（无跳过路径：按 W036 法 skipped 即 FAIL）",
      screenshots,
    };
  }
  // dev 态 renderer：ES 模块经裸 file:// 会被 CORS 拦（origin null × crossorigin）。
  // 真实 dev 模式走 ELECTRON_RENDERER_URL（vite dev server）；这里用本地静态服务器承载
  // 「已构建」的 out/renderer —— 同一 dev 契约（!isPackaged + ELECTRON_RENDERER_URL → loadURL），
  // 不需要 vite 进程。app.isPackaged 仍为 false —— dev 态更新器语义不变。
  const rendererDir = join(DESKTOP_ROOT, "out", "renderer");
  const rendererServer = await startFeedServer({ serveDir: rendererDir, port: 0, defaultFile: "index.html" });
  logFn(`dev renderer 服务器: ${rendererServer.origin}（ELECTRON_RENDERER_URL 契约；承载 out/renderer）`);
  try {
    const launchEnv = {
      ...process.env,
      DISPLAY: display.display,
      ELECTRON_RENDERER_URL: rendererServer.origin,
      ZCODE_AUTO_UPDATE_DEV: "1",
      ZCODE_AUTO_UPDATE_DEV_VERSION: appVersion,
      ZCODE_DESKTOP_USER_DATA_DIR: userDataDir,
      ZCODE_DESKTOP_SESSION_DATA_DIR: join(userDataDir, "session"),
      XDG_CACHE_HOME: cacheHome,
      // Linux AppImageUpdater 下载需要 APPIMAGE（差分基准，失败自动回退全量）；
      // 真实用户从 AppImage 启动时由 AppImage runtime 注入 —— 这里镜像同一环境。
      APPIMAGE: appimagePath,
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) {
      delete launchEnv[key];
    }
    logFn(`launching dev app: ${resolveDevElectronBinary()} ${DESKTOP_ROOT} (DISPLAY=${display.display})`);
    app = await electronLauncher.launch({
      executablePath: resolveDevElectronBinary(),
      args: [...CHROMIUM_FLAGS, DESKTOP_ROOT, `--proxy-server=${proxy.url}`],
      env: launchEnv,
      timeout: LAUNCH_TIMEOUT_MS,
    });
    stdoutCapture = captureProcessOutput(app);
    const page = await app.firstWindow();
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
    } catch {
      // 真实窗口尺寸调整失败不影响旅程
    }
    cdp = await attachCdpNetwork(page);
    firstScreen = await waitForFirstScreen(page, { timeoutMs: 180_000, logFn });
    await capture(page, evidenceDir, "01-dev-launch-first-screen", "dev 应用首屏（启动期后台更新检查观察窗内）", screenshots, logFn);

    const before = await snapshotUpdateMenuItem(app);
    logFn(`菜单项快照: ${JSON.stringify(before)}`);
    menuClick = await clickCheckForUpdates(app, logFn);
    const poll = await pollMenuStates(app, {
      timeoutMs: JOURNEY_SETTLE_TIMEOUT_MS,
      intervalMs: 250,
    });
    menuTimeline = poll.observed;
    await capture(page, evidenceDir, "02-after-check", "菜单「检查更新」后的窗口（状态面 + toast 瞬态）", screenshots, logFn);
    await sleep(2000);
    await capture(page, evidenceDir, "03-final-state", "旅程结束态", screenshots, logFn);
  } catch (error) {
    launcherError = error instanceof Error ? error.message : String(error);
    logFn(`JOURNEY FAILED: ${launcherError}`);
  } finally {
    if (app) {
      try {
        await closeApp(app, logFn);
      } catch {
        // 清理失败不影响退出码
      }
    }
    await cdp?.close();
    await proxy.close();
    await rendererServer.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }

  // ---------- 断言 ----------
  // feed 命中基线：只统计「应用旅程期间」的新增命中 —— 夹具自证（selfTest）共用同一台
  // feed 服务器，若不切基线会把自证的命中误记为应用行为（洗绿）。
  const allFeedHits = feedServer.hits();
  const baselineHits = baselineFeedHitCount ?? 0;
  const feedHits = allFeedHits.slice(baselineHits);
  const manifestHits = feedHits.filter((hit) => /latest-linux\.yml/.test(hit.url ?? ""));
  const fileHits = feedHits.filter((hit) => (hit.url ?? "").includes(fixture.fileName));
  const autoUpdateLines = stdoutCapture ? stdoutCapture.autoUpdateLines() : [];
  const providerApplied = autoUpdateLines.some((entry) => /service manifest provider applied/.test(entry.text));
  const availableMenuState = menuTimeline.find((state) => state.label.includes(fixture.targetVersion)) ?? null;
  const downloadedMenuState = menuTimeline.find(
    (state) => state.label.includes(fixture.targetVersion) && /restart|重启|重新启动|update/i.test(state.label),
  ) ?? null;
  const stagedFiles = listFilesRecursive(cacheHome);
  const stagedUpdateFile = stagedFiles.find((path) => path.endsWith(fixture.fileName)) ?? null;
  const stagedShaOk = stagedUpdateFile != null && sha512Base64OfFile(stagedUpdateFile) === fixture.sha512Base64;

  addCheck("first-screen-not-blocked", firstScreen.ready ? "pass" : "fail", `dev 应用首屏就绪（worldCanvas=${firstScreen.markers.worldCanvas} readyDot=${firstScreen.markers.readyDot}）`);
  addCheck("menu-check-triggered", menuClick.clicked ? "pass" : "fail", menuClick.clicked ? `菜单路径触发（via=${menuClick.via}）` : `菜单路径触发失败: ${menuClick.reason}`);
  addCheck("feed-manifest-requested", manifestHits.length > 0 ? "pass" : "fail", `本地 feed 的 latest-linux.yml 被应用请求（命中 ${manifestHits.length} 次；0 次 = dev 态未读取 dev-app-update.yml —— 预修复 seam 缺陷）`);
  addCheck("update-available-surfaced", availableMenuState ? "pass" : "fail", availableMenuState ? `菜单状态浮现新版本 ${fixture.targetVersion}（label="${availableMenuState.label}"）—— 真实 UI 面` : `新版本未浮现于菜单状态（观察到的状态序列: ${menuTimeline.map((state) => state.label).join(" → ") || "无变化"}）`);
  addCheck("checking-state-observed", autoUpdateLines.some((entry) => /checking for update/.test(entry.text)) || menuTimeline.some((state) => state.enabled === false) || menuTimeline.length > 1 ? "pass" : "fail", "checking 状态被观察（stdout checking 行 / 菜单 label·enabled 变化）");
  addCheck("downloading-progress-observed", autoUpdateLines.some((entry) => /download progress/i.test(entry.text)) || menuTimeline.some((state) => /\d+\s*%/.test(state.label)) ? "pass" : "fail", "downloading 进度被观察（stdout download-progress 或菜单 label 百分比）");
  addCheck("ready-staged-on-disk", stagedUpdateFile != null ? "pass" : "fail", stagedUpdateFile != null ? `staged 文件落盘: ${stagedUpdateFile}` : "updater 缓存目录未出现 staged 更新文件");
  addCheck("staged-sha512-match", stagedShaOk ? "pass" : "fail", "staged 文件 sha512 与 manifest 一致");
  addCheck("downloaded-menu-state", downloadedMenuState ? "pass" : "fail", downloadedMenuState ? `update-downloaded 菜单状态（label="${downloadedMenuState.label}"）` : "未观察到 ready/restart 菜单状态");
  addCheck("feed-file-downloaded", fileHits.length > 0 ? "pass" : "fail", `更新文件被下载（feed 服务器命中 ${fileHits.length} 次）`);
  addCheck(
    "no-zcode-update-traffic",
    proxy.hits().filter((hit) => hit.host === hostnameOfOrigin(zcodeOrigin)).length === 0 ? "pass" : "fail",
    `dev 旅程内 ZCode 端点更新尝试为 0（sink 策略下仍记录 CONNECT 尝试；实际命中 ${proxy.hits().filter((hit) => hit.host === hostnameOfOrigin(zcodeOrigin)).length} 次）`,
  );

  const verdict = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const result = {
    part: "appJourney",
    purpose: "验收门：未打包 dev 应用经真实菜单路径完成 check → available → downloading → ready(staged)。",
    appVersion,
    fixture: {
      targetVersion: fixture.targetVersion,
      fileName: fixture.fileName,
      bytes: fixture.bytes,
      sha512Base64: fixture.sha512Base64,
    },
    feedOrigin,
    feedHits,
    environment: collectEnvironment(display, {
      displayMode: display.mode,
      electronRuntimeVersion: detectElectronRuntimeVersion(resolveDevElectronBinary()),
    }),
    launchEnvNote: {
      ELECTRON_RENDERER_URL: rendererServer.origin,
      ZCODE_AUTO_UPDATE_DEV: "1",
      ZCODE_AUTO_UPDATE_DEV_VERSION: appVersion,
      XDG_CACHE_HOME: "<isolated-temp>",
      ZCODE_DESKTOP_USER_DATA_DIR: "<isolated-temp>",
      APPIMAGE: appimagePath,
      proxyServer: proxy.url,
    },
    firstScreen,
    menuClick,
    menuStateTimeline: menuTimeline,
    stdout: {
      autoUpdateLines,
      providerApplied,
      totalLines: stdoutCapture ? stdoutCapture.snapshot().length : 0,
    },
    feedHitsBaseline: baselineHits,
    feedHitsTotalIncludingSelfTest: allFeedHits.length,
    stagedFiles,
    checks,
    verdict,
    terminusNote:
      "staging（update-downloaded + staged 文件）为验收终点：quitAndInstall 会退出并重启应用（dev 态回退 app.relaunch），在旅程中执行即中断观察 —— 工单明示不需要。",
    preFixBuildNote:
      providerApplied && manifestHits.length === 0
        ? "预修复构建：initAutoUpdater 无条件 setFeedURL(ZCode manifest provider)，electron-updater 的 clientPromise 已设即不再读取 dev-app-update.yml —— 本地 feed 0 命中即该 seam（W037-W1）的实测证据。"
        : null,
  };
  writeEvidence(evidenceDir, "app-journey-network-log", { proxy: proxy.hits(), cdp: cdp ? cdp.requests : [] });
  if (stdoutCapture) {
    writeFileSync(
      join(evidenceDir, "dev-app-stdout.log"),
      `${stdoutCapture.snapshot().map((entry) => `[${entry.stream}] ${entry.text}`).join("\n")}\n`,
      "utf8",
    );
  }
  rmSync(cacheHome, { recursive: true, force: true });
  return { ...result, screenshots };
}

function humanSummary(report) {
  const lines = [];
  lines.push(`# 密封 dev 态更新旅程 — ${report.verdict.toUpperCase()}`);
  lines.push("");
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- 当前版本: ${report.appVersion}；夹具版本: ${report.journey?.fixture?.targetVersion ?? report.selfTest?.fixture?.targetVersion ?? "?"}`);
  lines.push(`- dev feed: ${report.devFeed.url}（dev-app-update.yml: ${report.devFeed.parsed.provider} ${report.devFeed.parsed.url}）`);
  lines.push("");
  lines.push("## A. 夹具自证（feedFixtureSelfTest）");
  lines.push("");
  for (const check of report.selfTest.checks) {
    lines.push(`- [${check.status}] ${check.id}: ${check.detail}`);
  }
  lines.push("");
  lines.push("## B. 应用旅程（appJourney —— 验收门）");
  lines.push("");
  for (const check of report.journey.checks ?? []) {
    lines.push(`- [${check.status}] ${check.id}: ${check.detail}`);
  }
  lines.push("");
  if (report.journey?.preFixBuildNote) {
    lines.push(`> 预修复实测: ${report.journey.preFixBuildNote}`);
    lines.push("");
  }
  lines.push(`> 终点语义: ${report.journey?.terminusNote ?? "n/a"}`);
  lines.push("");
  lines.push("## feed 服务器命中");
  lines.push("");
  for (const hit of report.journey?.feedHits ?? []) {
    lines.push(`- ${hit.timestamp} ${hit.method} ${hit.url} → ${hit.status}${hit.bytes ? ` (${hit.bytes}B)` : ""}`);
  }
  if (report.journey.feedHits.length === 0) {
    lines.push("- （无命中 —— dev 应用未请求本地 feed）");
  }
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceRoot = options.evidenceRoot
    ? absolute(options.evidenceRoot)
    : join(DEFAULT_EVIDENCE_ROOT, "dev-journey");
  mkdirSync(evidenceRoot, { recursive: true });

  const devFeed = readDevAppUpdateYaml(DESKTOP_ROOT);
  const feedPort = options.feedPort ?? (new URL(devFeed.parsed.url).port ? Number.parseInt(new URL(devFeed.parsed.url).port, 10) : 80);
  const appVersion = options.appVersion ?? resolveDesktopAppVersion();
  log("dev-journey", `dev-app-update.yml: provider=${devFeed.parsed.provider} url=${devFeed.parsed.url}（→ 本地 feed 端口 ${feedPort}）`);
  log("dev-journey", `appVersion=${appVersion}`);

  // 夹具 + 本地 feed 服务器
  const fixtureDir = mkdtempSync(join(tmpdir(), "w037-feed-fixture-"));
  const fixture = craftUpdateFixture({ currentVersion: appVersion, outDir: fixtureDir });
  const feedServer = await startFeedServer({ serveDir: fixtureDir, port: feedPort });
  const feedOrigin = `http://127.0.0.1:${feedServer.port}`;
  log("dev-journey", `本地 feed 服务器: ${feedOrigin}（latest-linux.yml 版本 ${fixture.targetVersion} > ${appVersion}）`);

  const electronLauncher = await loadElectronLauncher("dev-journey");
  const display = await resolveDisplaySelfSufficient("dev-journey");

  // APPIMAGE 环境差分基准：一律用临时占位文件（差分失败自动回退全量下载）。
  // 绝不指向真实产物：electron-updater 的 autoInstallOnAppQuit 在退出时会把 staged 文件
  // 移到 APPIMAGE 同目录并删除旧文件 —— 指向真实产物会把发布目录里的 AppImage 换成夹具
  // （实测事故已发生在早期版本，见旅程 manifest 的教训记录）。
  const appimagePlaceholder = join(tmpdir(), `w037-appimage-placeholder-${Date.now()}`);
  writeFileSync(appimagePlaceholder, "w037 dev-journey APPIMAGE placeholder (differential base fallback)\n", "utf8");
  const appimagePath = appimagePlaceholder;
  log("dev-journey", `APPIMAGE 差分基准: ${appimagePath}（临时占位文件 —— 差分将失败并回退全量下载；真实产物绝不受影响）`);

  let selfTest = null;
  if (options.skipSelfTest) {
    selfTest = {
      part: "feedFixtureSelfTest",
      checks: [{ id: "self-test-run", status: "fail", detail: "--skip-self-test 被显式使用（W036 法：跳过不算通过）" }],
      verdict: "fail",
    };
  } else {
    selfTest = await runFeedFixtureSelfTest({
      feedOrigin,
      fixture,
      appVersion,
      electronLauncher,
      display,
      appimagePath,
    });
    log("dev-journey", `夹具自证: ${selfTest.verdict.toUpperCase()}`);
  }
  // 应用旅程的 feed 命中基线：夹具自证共用同一台 feed 服务器 —— 只把基线之后的新增命中记为应用行为。
  const baselineFeedHitCount = feedServer.hits().length;

  let journey = null;
  if (options.selfTestOnly) {
    journey = {
      part: "appJourney",
      checks: [{ id: "app-journey-run", status: "fail", detail: "--self-test-only 被显式使用（应用旅程未运行 = 不算通过）" }],
      verdict: "fail",
      terminusNote: "n/a",
      feedHits: [],
      stdout: {},
      menuStateTimeline: [],
      stagedFiles: [],
      screenshots: [],
    };
  } else {
    journey = await runAppJourney({
      feedOrigin,
      feedServer,
      fixture,
      appVersion,
      evidenceDir: evidenceRoot,
      electronLauncher,
      display,
      zcodeOrigin: DEFAULT_ZCODE_ENDPOINT_ORIGIN,
      appimagePath,
      baselineFeedHitCount,
    });
    log("dev-journey", `应用旅程: ${journey.verdict.toUpperCase()}`);
  }
  display.release();
  await feedServer.close();
  rmSync(fixtureDir, { recursive: true, force: true });
  rmSync(appimagePlaceholder, { force: true });

  const verdict = selfTest.verdict === "pass" && journey.verdict === "pass" ? "pass" : "fail";
  const report = {
    tool: "qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs (W037-W2)",
    workOrder: "W037 — Epoch Auto-Update Channel（密封 dev 态更新旅程）",
    generatedAt: new Date().toISOString(),
    appVersion,
    devFeed: { url: feedOrigin, path: devFeed.path, parsed: devFeed.parsed },
    selfTest,
    journey,
    verdict,
    law: "A skipped journey never counts as a pass (W036 law); the fixture self-test is harness validation, never a substitute for the app journey.",
  };
  const jsonPath = writeEvidence(evidenceRoot, "manifest", report);
  writeMarkdown(evidenceRoot, "summary", humanSummary(report));
  console.log("");
  console.log(`[dev-journey] selfTest=${selfTest.verdict.toUpperCase()} appJourney=${journey.verdict.toUpperCase()}`);
  for (const check of [...selfTest.checks, ...journey.checks]) {
    if (check.status !== "pass") {
      console.log(`[dev-journey]   ✗ [${check.id}] ${check.detail}`);
    }
  }
  console.log(`[dev-journey] verdict: ${verdict.toUpperCase()}`);
  console.log(`[dev-journey] report: ${jsonPath}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

main().catch((error) => {
  console.error(`[dev-journey] FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
