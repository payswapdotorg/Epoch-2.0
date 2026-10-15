#!/usr/bin/env node
/* eslint-disable max-lines -- 发布验收脚本按仓库惯例保持步骤逻辑集中（见 scripts/bundle.mjs）。 */
/**
 * W037-W2 — 真实窗口网络断言：打包 Epoch 应用的更新通道流量必须只指向 Epoch feed。
 *
 * 用法（仓库根执行）：
 *   node qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs --deb <path>
 *   node qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs --appimage <path>
 *   node qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs --extract-dir <dir>
 *
 * 运行方式（与 journey-ubuntu.mjs 同一真实窗口纪律）：
 * - 显示自足法：ambient DISPLAY → 常驻 Xvfb :99 → 私有 Xvfb -ac（本脚本内实现同律）；
 * - playwright-core _electron.launch 启动「打包产物」（打包态剥离 ELECTRON_RENDERER_URL、
 *   隔离 userData）；
 * - 观察分层（全部记录，互为印证）：
 *   1) 观察型正向代理（--proxy-server 注入；Chromium 网络栈全量：renderer + 主进程
 *      electron.net —— electron-updater 的 ElectronHttpExecutor 正走 electron.net）。
 *      zcode 端点 sink（记录 CONNECT 尝试即证据，绝不向真实 ZCode 服务器发流量）；
 *      GitHub feed 端点透明隧道转发（获得真实 404/403 响应，行为保真）；
 *   2) CDP Network 域（页面级，URL 级证据）；
 *   3) 主进程 stdout（[auto-update] 日志：provider 身份、checking、错误 —— 运行时证据）。
 * - 菜单路径触发手动检查（app.evaluate → check-for-update 菜单项 click 处理器 ——
 *   与真实用户点击执行的同一条命令路径）。
 *
 * PASS 标准（来自 spec/acceptance/epoch-auto-update-channel.md）：
 * - 更新尝试请求全部命中 Epoch feed 主机（api.github.com / github.com release 资产域）；
 * - 更新尝试对 zcode.z.ai / 任何 ZCode 端点 origin 的请求为 0；
 * - feed 错误（404/403）不阻塞启动与施工世界首屏。
 * 预修复构建上的 FAIL 正是 W037 记录的线上缺陷（主进程仍安装 ZCode manifest provider）——
 * 按工单法如实报告，绝不洗绿。观察层无任何命中 → inconclusive-observation（非 pass）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CHROMIUM_FLAGS,
  DEFAULT_EVIDENCE_ROOT,
  DEFAULT_ZCODE_ENDPOINT_ORIGIN,
  absolute,
  buildPackagedLaunchEnv,
  collectEnvironment,
  detectElectronRuntimeVersion,
  hostnameOf,
  hostnameOfOrigin,
  isEpochFeedHost,
  loadElectronLauncher,
  log,
  prepareArtifact,
  resolveDisplaySelfSufficient,
  writeEvidence,
  writeMarkdown,
} from "./lib/common.mjs";
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
const CHECK_SETTLE_TIMEOUT_MS = 45_000;
const POST_FIRST_SCREEN_GRACE_MS = 10_000;

function usage(exitCode) {
  console.log(
    [
      "用法: node qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs --deb <path> | --appimage <path> | --extract-dir <dir>",
      "       [--evidence <dir>] [--zcode-origin <origin>] [--observe-seconds <n>]",
      "",
      "  --deb <path>           对 .deb 产物运行网络断言（dpkg-deb -x → opt/Epoch/epoch）",
      "  --appimage <path>      对 .AppImage 产物运行网络断言（--appimage-extract）",
      "  --extract-dir <dir>    对已解包根目录运行（deb 布局 / squashfs-root / 顶层可执行）",
      "  --evidence <dir>       证据输出根目录（默认 qa/epoch-ubuntu-release/evidence/update-channel/network）",
      "  --zcode-origin <origin> ZCode 端点 origin（默认 https://zcode.z.ai；断言面含该 host）",
      "  --observe-seconds <n>  菜单触发后的观察窗（默认 25 秒）",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { modes: [], evidenceRoot: null, zcodeOrigin: DEFAULT_ZCODE_ENDPOINT_ORIGIN, observeSeconds: 25 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deb") options.modes.push({ kind: "deb", path: argv[++index] });
    else if (arg === "--appimage") options.modes.push({ kind: "appimage", path: argv[++index] });
    else if (arg === "--extract-dir") options.modes.push({ kind: "extract-dir", path: argv[++index] });
    else if (arg === "--evidence") options.evidenceRoot = argv[++index];
    else if (arg === "--zcode-origin") options.zcodeOrigin = argv[++index];
    else if (arg === "--observe-seconds") options.observeSeconds = Number.parseInt(argv[++index], 10) || 25;
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  return options;
}

function withinWindow(entry, windows) {
  const time = Date.parse(entry.timestamp);
  if (!Number.isFinite(time)) return false;
  return windows.some(([start, end]) => time >= start && time <= end);
}

function classifyRequests({ proxyRecords, cdpRequests, zcodeHostname, windows }) {
  const hostOf = (entry) => entry.host ?? hostnameOf(entry.url);
  const zcodeAny = [];
  const zcodeUpdateAttempts = [];
  const epochFeedAttempts = [];
  const otherHosts = new Map();
  for (const record of [...proxyRecords, ...cdpRequests]) {
    const host = hostOf(record);
    if (!host) continue;
    // file:// 等非网络请求（renderer 包内资产）不参与网络断言分类，也不计入 host 统计。
    const scheme = String(record.url ?? "").split(":")[0].toLowerCase();
    if (record.layer === "cdp" && scheme && !/^https?$/.test(scheme)) continue;
    if (host === zcodeHostname) {
      zcodeAny.push(record);
      // 主进程（proxy 层）在观察窗内的 zcode 命中即更新尝试候选（更新器是主进程唯一的
      // zcode 客户端；与 stdout [auto-update] 行互证）。CDP 层 renderer 命中需更新路径签名。
      const inWindow = withinWindow(record, windows);
      const isManifestPath = (() => {
        if (record.layer !== "cdp") return true;
        try {
          return new URL(record.url ?? "").pathname.startsWith("/api/v1/releases/electron/manifest");
        } catch {
          return false;
        }
      })();
      if (inWindow && isManifestPath) {
        zcodeUpdateAttempts.push(record);
      }
      continue;
    }
    if (isEpochFeedHost(host)) {
      if (withinWindow(record, windows)) epochFeedAttempts.push(record);
      continue;
    }
    otherHosts.set(host, (otherHosts.get(host) ?? 0) + 1);
  }
  return {
    zcodeAny,
    zcodeUpdateAttempts,
    epochFeedAttempts,
    otherHosts: [...otherHosts.entries()].map(([host, count]) => ({ host, count })),
  };
}

function humanSummary(manifest) {
  const lines = [];
  const verdictTag = manifest.verdict.toUpperCase();
  lines.push(`# 更新通道网络断言（真实窗口）— ${verdictTag}`);
  lines.push("");
  lines.push(`- 生成时间: ${manifest.generatedAt}`);
  lines.push(`- 模式: ${manifest.mode}；产物: \`${manifest.artifact.path}\``);
  lines.push(`- 显示: ${manifest.environment.display?.display ?? "?"}（${manifest.environment.display?.mode ?? "?"}）`);
  lines.push("");
  lines.push("## 断言");
  lines.push("");
  lines.push("| 断言 | 状态 | 说明 |");
  lines.push("| --- | --- | --- |");
  for (const check of manifest.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${check.detail.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push("## 更新尝试流量分类");
  lines.push("");
  lines.push(`- Epoch feed 命中（更新尝试）: **${manifest.traffic.epochFeedAttempts.length}**`);
  for (const record of manifest.traffic.epochFeedAttempts.slice(0, 20)) {
    lines.push(`  - ${record.timestamp} ${record.layer} ${record.method ?? ""} ${record.url ?? record.host}`);
  }
  lines.push(`- ZCode 端点命中（更新尝试）: **${manifest.traffic.zcodeUpdateAttempts.length}**`);
  for (const record of manifest.traffic.zcodeUpdateAttempts.slice(0, 20)) {
    lines.push(`  - ${record.timestamp} ${record.layer} ${record.kind} ${record.host}${record.port ? `:${record.port}` : ""} ${record.url ?? ""}`);
  }
  lines.push(`- ZCode 端点命中（全部，含 renderer 后端流量，供 TL 裁量）: ${manifest.traffic.zcodeAny.length}`);
  lines.push(`- 其它主机（非更新通道断言面）: ${manifest.traffic.otherHosts.map((entry) => `${entry.host}×${entry.count}`).join(", ") || "无"}`);
  lines.push("");
  if (manifest.stdout.autoUpdateLines.length > 0) {
    lines.push("## 主进程 [auto-update] 运行时证据（stdout）");
    lines.push("");
    lines.push("```");
    for (const entry of manifest.stdout.autoUpdateLines.slice(0, 60)) {
      lines.push(entry.text);
    }
    lines.push("```");
  }
  lines.push("## 菜单状态序列（真实 UI 面）");
  lines.push("");
  for (const state of manifest.menuStateTimeline) {
    lines.push(`- ${state.timestamp} label="${state.label}" enabled=${state.enabled}`);
  }
  lines.push("");
  lines.push("## 观察分层诚实声明");
  lines.push("");
  lines.push("- proxy 层：Chromium 网络栈全量（renderer + 主进程 electron.net —— electron-updater 所在栈）。");
  lines.push("- CDP 层：renderer 请求（URL 级）。");
  lines.push("- 主进程 stdout：[auto-update] 日志。");
  lines.push("- 不在观察范围：host/agent 子进程的 Node http 直连（更新器不在该进程；本环境无 root 无法系统级抓包）。");
  lines.push("");
  return lines.join("\n");
}

async function runMode(modeSpec, evidenceRoot, options, electronLauncher, display) {
  const logFn = (message) => log("network-assertion", message);
  const prepared = prepareArtifact(modeSpec);
  const evidenceDir = join(evidenceRoot, prepared.modeTag);
  mkdirSync(evidenceDir, { recursive: true });
  const screenshots = [];
  const checks = [];
  const addCheck = (id, status, detail) => checks.push({ id, status, detail });

  const proxy = await startObservingProxy({
    sinkOrigins: [options.zcodeOrigin],
    logPrefix: "network-assertion",
  });
  logFn(`观察代理: ${proxy.url}（sink=${proxy.policy.sinkHosts.join(",")}；GitHub feed 透明隧道）`);

  const userDataDir = mkdtempSync(join(tmpdir(), "epoch-network-ud-"));
  mkdirSync(userDataDir, { recursive: true });
  const launchEnv = buildPackagedLaunchEnv(userDataDir, { proxyServerUrl: proxy.url });
  launchEnv.DISPLAY = display.display;

  const launchTs = Date.now();
  let firstScreenReadyTs = null;
  let menuClickTs = null;
  let settleEndTs = null;

  let appHandle = null;
  let cdp = null;
  let stdoutCapture = null;
  let firstScreen = { ready: false, markers: { worldCanvas: false, readyDot: false } };
  let menuClick = { clicked: false, reason: null };
  let menuTimeline = [];
  let launcherError = null;

  try {
    logFn(`launching ${prepared.executablePath} (DISPLAY=${launchEnv.DISPLAY}; --proxy-server=${proxy.url})`);
    const app = await electronLauncher.launch({
      executablePath: prepared.executablePath,
      args: [...CHROMIUM_FLAGS, `--proxy-server=${proxy.url}`],
      env: launchEnv,
      timeout: LAUNCH_TIMEOUT_MS,
    });
    appHandle = { app };
    stdoutCapture = captureProcessOutput(app);
    const page = await app.firstWindow();
    appHandle.page = page;
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
    } catch {
      // 真实窗口尺寸调整失败不影响断言
    }
    cdp = await attachCdpNetwork(page);
    logFn("CDP Network 域已附加（renderer 请求 URL 级观察）");

    firstScreen = await waitForFirstScreen(page, { timeoutMs: 180_000, logFn });
    firstScreenReadyTs = Date.now();
    // 首屏后给 host/settings 初始化留出安定时间：手动检查的 settings 读取在 host 未就绪时会挂起。
    await sleep(POST_FIRST_SCREEN_GRACE_MS);
    await capture(page, evidenceDir, "01-launch-first-screen", "启动 + 首屏（启动期后台更新检查的网络观察窗内）", screenshots, logFn);

    // 菜单路径触发手动「检查更新」
    const beforeClick = await snapshotUpdateMenuItem(app);
    logFn(`菜单项快照: ${JSON.stringify(beforeClick)}`);
    menuClick = await clickCheckForUpdates(app, logFn);
    menuClickTs = Date.now();

    // 观察手动检查窗口：菜单状态 settle（回到 idle 或保持终态）后额外停留
    const observedBefore = menuTimeline.length;
    const pollResult = await pollMenuStates(app, {
      timeoutMs: CHECK_SETTLE_TIMEOUT_MS,
      intervalMs: 400,
    });
    menuTimeline = pollResult.observed;
    const settleDeadline = menuClickTs + options.observeSeconds * 1000;
    while (Date.now() < settleDeadline) {
      await sleep(500);
    }
    settleEndTs = Date.now();
    const observedAfter = menuTimeline.length;
    await capture(page, evidenceDir, "02-after-manual-check", "菜单「检查更新」触发后的窗口（手动检查观察窗结束时）", screenshots, logFn);
    logFn(`菜单状态序列（${observedBefore}→${observedAfter} 条）：${JSON.stringify(menuTimeline.map((state) => state.label))}`);

    // toast 文本（尽力而为：#zcode-toast-host 瞬态 DOM）
    let toastText = null;
    try {
      toastText = await appHandle.page.textContent("#zcode-toast-host", { timeout: 1000 });
    } catch {
      // toast 已消失或未出现
    }
    appHandle.toastText = toastText;
  } catch (error) {
    launcherError = error instanceof Error ? error.message : String(error);
    logFn(`LAUNCH FAILED: ${launcherError}`);
  } finally {
    if (appHandle?.app) {
      try {
        await closeApp(appHandle.app, logFn);
      } catch {
        // 清理失败不影响退出码
      }
    }
    await cdp?.close();
    await proxy.close();
    rmSync(userDataDir, { recursive: true, force: true });
    prepared.cleanup();
  }

  // ---------- 分类与裁决 ----------
  const windows = [];
  if (launcherError) {
    // 启动失败：观察窗 = 启动尝试全程
    windows.push([launchTs, Date.now()]);
  } else {
    windows.push([launchTs, (firstScreenReadyTs ?? Date.now()) + 3_000]);
    if (menuClickTs) {
      windows.push([menuClickTs, (settleEndTs ?? menuClickTs + options.observeSeconds * 1000) + 1_000]);
    }
  }
  const zcodeHostname = hostnameOfOrigin(options.zcodeOrigin);
  const traffic = classifyRequests({
    proxyRecords: proxy.hits(),
    cdpRequests: cdp ? cdp.requests : [],
    zcodeHostname,
    windows,
  });
  const autoUpdateLines = stdoutCapture ? stdoutCapture.autoUpdateLines() : [];
  const providerAppliedLine = autoUpdateLines.find((entry) => /service manifest provider applied/.test(entry.text)) ?? null;
  const checkingLines = autoUpdateLines.filter((entry) => /checking for update/.test(entry.text));
  const updateErrorLines = autoUpdateLines.filter((entry) => /manual check failed|check failed|error/i.test(entry.text));
  const observationCounts = {
    proxyTotal: proxy.hits().length,
    cdpTotal: cdp ? cdp.requests.length : 0,
  };
  const observationSufficient = observationCounts.proxyTotal > 0 || observationCounts.cdpTotal > 0;

  addCheck(
    "real-window-launch",
    launcherError ? "fail" : "pass",
    launcherError ? `真实 Electron 窗口启动失败: ${launcherError}` : "打包产物以真实 Electron 窗口启动（_electron.launch）",
  );
  addCheck(
    "first-screen-not-blocked",
    firstScreen.ready ? "pass" : "fail",
    `更新检查/网络失败不得阻塞施工世界首屏（worldCanvas=${firstScreen.markers.worldCanvas} readyDot=${firstScreen.markers.readyDot}）`,
  );
  addCheck(
    "menu-check-triggered",
    menuClick.clicked ? "pass" : "fail",
    menuClick.clicked
      ? `菜单路径触发成功（via=${menuClick.via}）`
      : `菜单路径触发失败: ${menuClick.reason ?? "unknown"}`,
  );
  // 更新检查是否真的发生（无证据 ≠ 通过）：checking 状态/日志或任一更新尝试流量都算实发。
  const checkingObserved =
    checkingLines.length > 0 ||
    menuTimeline.some((state) => state.enabled === false) ||
    traffic.epochFeedAttempts.length > 0 ||
    traffic.zcodeUpdateAttempts.length > 0;
  addCheck(
    "update-check-executed",
    checkingObserved ? "pass" : "fail",
    checkingObserved
      ? `更新检查实发（checking 日志 ${checkingLines.length} 行 / 状态序列 ${menuTimeline.length} 条）`
      : "更新检查未实际发生（无 checking 状态、无日志、无更新尝试流量）—— 无证据不等于通过",
  );
  addCheck(
    "epoch-feed-hit",
    traffic.epochFeedAttempts.length > 0 ? "pass" : "fail",
    `更新尝试应命中 Epoch feed 主机（api.github.com/github.com 资产域）；观察窗内命中 ${traffic.epochFeedAttempts.length} 次${checkingObserved ? "" : "（且更新检查未实发）"}`,
  );
  addCheck(
    "zero-zcode-update-traffic",
    traffic.zcodeUpdateAttempts.length === 0 && checkingObserved ? "pass" : "fail",
    traffic.zcodeUpdateAttempts.length > 0
      ? `更新尝试对 ZCode 端点（${zcodeHostname}）命中 ${traffic.zcodeUpdateAttempts.length} 次（必须为 0）`
      : checkingObserved
        ? `更新尝试对 ZCode 端点命中 0 次`
        : "更新检查未实发，无法证明 ZCode 更新流量为 0 —— 无证据不等于通过",
  );
  // 运行时 provider 身份（stdout 实测）：manifest provider 被 apply 即 W037-W1 seam 缺陷的运行时签名。
  addCheck(
    "manifest-provider-runtime-absent",
    providerAppliedLine
      ? "fail"
      : traffic.epochFeedAttempts.length > 0
        ? "pass"
        : "fail",
    providerAppliedLine
      ? `主进程日志实测：[auto-update] service manifest provider applied —— ZCode manifest provider 被安装（W037-W1 seam 缺陷的运行时证据）`
      : traffic.epochFeedAttempts.length > 0
        ? "未观察到 manifest provider 安装日志，且更新流量命中 Epoch feed（正向证据成立）"
        : "未观察到 manifest provider 安装日志，但亦无任何正向流量证据 —— 无法验证（无证据不等于通过）",
  );
  addCheck(
    "observation-sufficient",
    observationSufficient ? "pass" : "fail",
    `观察层命中：proxy=${observationCounts.proxyTotal} cdp=${observationCounts.cdpTotal}（无命中 → inconclusive，不得计为通过）`,
  );

  const failedChecks = checks.filter((check) => check.status === "fail");
  let verdict;
  if (!observationSufficient) {
    verdict = "inconclusive-observation";
  } else if (failedChecks.length === 0) {
    verdict = "pass";
  } else {
    verdict = "fail";
  }

  const manifest = {
    tool: "qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs (W037-W2)",
    workOrder: "W037 — Epoch Auto-Update Channel（真实窗口网络断言）",
    generatedAt: new Date().toISOString(),
    mode: prepared.modeTag,
    artifact: {
      path: prepared.artifactPath,
      sha256: prepared.sha256,
      bytes: prepared.bytes,
    },
    runPath: {
      executablePath: prepared.executablePath,
      launchArgs: [...CHROMIUM_FLAGS, `--proxy-server=${proxy.url}`],
      electronApi: "playwright-core _electron.launch（真实 Electron 窗口）",
    },
    environment: collectEnvironment(display, {
      displayMode: display.mode,
      electronRuntimeVersion: detectElectronRuntimeVersion(prepared.executablePath),
      zcodeOriginUnderAssertion: options.zcodeOrigin,
    }),
    observation: {
      layers: [
        "observing-forward-proxy（--proxy-server；Chromium 网络栈全量：renderer + 主进程 electron.net）",
        "cdp-network-domain（renderer，URL 级）",
        "main-process-stdout（[auto-update] 日志）",
      ],
      notObserved: [
        "host/agent 子进程 Node http 直连（更新器不在该进程；本环境无 root 无法系统级抓包）",
      ],
      windows: windows.map(([start, end]) => ({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      })),
      counts: observationCounts,
      proxyPolicy: proxy.policy,
    },
    traffic,
    stdout: {
      autoUpdateLines,
      providerAppliedLine,
      checkingLines,
      updateErrorLines,
      totalLines: stdoutCapture ? stdoutCapture.snapshot().length : 0,
    },
    menuStateTimeline: menuTimeline,
    menuClick,
    firstScreen,
    launcherError,
    checks,
    verdict,
    preFixBuildNote:
      verdict === "fail" && (traffic.zcodeUpdateAttempts.length > 0 || providerAppliedLine)
        ? "预修复构建（W037-W1 seam 未合入时的 main）：主进程实测安装了 ZCode manifest provider（service manifest provider applied）并向 zcode 端点发起更新请求 —— 这是 W037 工单记录的线上缺陷的实测证据，不是验收通过态。"
        : null,
    law: "verdict from observed network behavior, never from code reading; a pre-fix FAIL is honest evidence (W037 work order).",
  };

  const jsonPath = writeEvidence(evidenceDir, "manifest", manifest);
  writeMarkdown(evidenceDir, "summary", humanSummary(manifest));
  if (stdoutCapture) {
    writeFileSync(
      join(evidenceDir, "main-process-stdout.log"),
      `${stdoutCapture.snapshot().map((entry) => `[${entry.stream}] ${entry.text}`).join("\n")}\n`,
      "utf8",
    );
  }
  writeEvidence(evidenceDir, "network-log", {
    proxy: proxy.hits(),
    cdp: cdp ? cdp.requests : [],
  });
  logFn(`manifest written: ${jsonPath}`);
  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.modes.length === 0) {
    console.error("未指定任何模式（--deb / --appimage / --extract-dir 至少一项）");
    usage(2);
  }
  const evidenceRoot = options.evidenceRoot
    ? absolute(options.evidenceRoot)
    : join(DEFAULT_EVIDENCE_ROOT, "network");
  mkdirSync(evidenceRoot, { recursive: true });

  let electronLauncher = null;
  let launcherError = null;
  try {
    electronLauncher = await loadElectronLauncher("network-assertion");
  } catch (error) {
    launcherError = error instanceof Error ? error.message : String(error);
  }

  const display = await resolveDisplaySelfSufficient("network-assertion");
  const manifests = [];
  for (const mode of options.modes) {
    log("network-assertion", `=== mode ${mode.kind}: ${mode.path} ===`);
    if (launcherError) {
      // 依赖级阻塞：记为失败 manifest（无跳过路径）
      const evidenceDir = join(evidenceRoot, `${mode.kind}-error`);
      mkdirSync(evidenceDir, { recursive: true });
      const manifest = {
        tool: "qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs (W037-W2)",
        generatedAt: new Date().toISOString(),
        mode: `${mode.kind}-error`,
        artifact: { path: absolute(mode.path) },
        launcherError,
        checks: [{ id: "launcher-resolve", status: "fail", detail: launcherError }],
        verdict: "fail",
      };
      writeEvidence(evidenceDir, "manifest", manifest);
      manifests.push(manifest);
      continue;
    }
    manifests.push(await runMode(mode, evidenceRoot, options, electronLauncher, display));
  }
  display.release();

  for (const manifest of manifests) {
    const failed = manifest.checks?.filter((check) => check.status === "fail") ?? [];
    console.log(
      `[network-assertion] ${manifest.verdict.toUpperCase()} ${manifest.mode} (${failed.length} failed checks)`,
    );
    for (const check of failed) {
      console.log(`[network-assertion]   ✗ ${check.id}: ${check.detail}`);
    }
  }
  const failedModes = manifests.filter(
    (manifest) => manifest.verdict !== "pass",
  );
  console.log(
    `[network-assertion] overall: ${failedModes.length === 0 ? "PASS" : "FAIL"} (${manifests.length - failedModes.length}/${manifests.length} modes passed)`,
  );
  process.exit(failedModes.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[network-assertion] FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
