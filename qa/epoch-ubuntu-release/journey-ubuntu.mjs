#!/usr/bin/env node
/* eslint-disable max-lines -- the repo convention for long release scripts (see scripts/bundle.mjs); the journey/audit keep their step logic together on purpose. */
/**
 * W036-W3 — Epoch Ubuntu 打包产物真实 Electron 窗口验收旅程（CLI 入口）。
 *
 * 用法（仓库根执行；依赖已安装——playwright-core 是 @zcode/desktop 的生产依赖）：
 *   node qa/epoch-ubuntu-release/journey-ubuntu.mjs --deb <path>
 *   node qa/epoch-ubuntu-release/journey-ubuntu.mjs --appimage <path>
 *   node qa/epoch-ubuntu-release/journey-ubuntu.mjs --deb <path> --appimage <path>
 *   node qa/epoch-ubuntu-release/journey-ubuntu.mjs --extract-dir <dir>   # 预解包根目录
 *
 * 运行方式（与 W006 qa/epoch-desktop/journey.mjs 同一 _electron 模式，但面向「打包产物」）：
 * - deb：非 root 解包（dpkg-deb -x <deb> <prefix>）后启动 <prefix>/opt/Epoch/epoch；
 * - AppImage：--appimage-extract 到临时目录后启动 squashfs-root/AppRun；
 * - _electron.launch({ executablePath, args }) 驱动真实 Electron 窗口（Xvfb :99 真实 X 显示，
 *   非 headless renderer）；打包态绝不设置 ELECTRON_RENDERER_URL（renderer 从包内加载）。
 *
 * 输出：qa/epoch-ubuntu-release/evidence/<mode>/NN-*.png + manifest.json；
 * 任一步骤失败 → manifest.pass=false 且退出码非 0。无跳过路径（验收法）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { openSync as fsOpenSync, readSync as fsReadSync, closeSync as fsCloseSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
import { runJourneySession, JOURNEY_SELECTORS } from "./lib/journey-core.mjs";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");
const DESKTOP_ROOT = join(REPO_ROOT, "packages", "desktop");
const DEFAULT_EVIDENCE_ROOT = resolve(REPO_ROOT, "qa/epoch-ubuntu-release/evidence");
const LAUNCH_TIMEOUT_MS = 180_000;
const CLOSE_TIMEOUT_MS = 30_000;

const CHROMIUM_FLAGS = [
  "--no-sandbox",
  "--disable-gpu-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--disable-gpu-compositing",
];

function log(message) {
  console.log(`[journey-ubuntu] ${message}`);
}

function usage(exitCode) {
  console.log(
    [
      "用法: node qa/epoch-ubuntu-release/journey-ubuntu.mjs --deb <path> [--appimage <path>] [--extract-dir <dir>] [--evidence <dir>]",
      "",
      "  --deb <path>        对 .deb 产物运行旅程（dpkg-deb -x 解包 → /opt/Epoch/epoch）",
      "  --appimage <path>   对 .AppImage 产物运行旅程（--appimage-extract → AppRun）",
      "  --extract-dir <dir> 对已解包根目录运行（自动识别 deb 布局 / squashfs-root / 直接含 epoch）",
      "  --evidence <dir>    证据输出根目录（默认 qa/epoch-ubuntu-release/evidence）",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { modes: [], evidenceRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deb") options.modes.push({ kind: "deb", path: argv[++index] });
    else if (arg === "--appimage") options.modes.push({ kind: "appimage", path: argv[++index] });
    else if (arg === "--extract-dir") options.modes.push({ kind: "extract-dir", path: argv[++index] });
    else if (arg === "--evidence") options.evidenceRoot = argv[++index];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  return options;
}

/**
 * 解析 playwright-core（@zcode/desktop 生产依赖；qa/ 目录不是包，需要显式解析）。
 * 顺序：packages/desktop（pnpm 链接）→ 仓库根 → .pnpm 目录通配兜底。
 */
function resolvePlaywrightCoreEntry() {
  const candidates = [
    join(DESKTOP_ROOT, "package.json"),
    join(REPO_ROOT, "package.json"),
    join(DESKTOP_ROOT, "node_modules", "playwright-core", "package.json"),
    join(REPO_ROOT, "node_modules", "playwright-core", "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      const requireHere = createRequire(candidate);
      return requireHere.resolve("playwright-core");
    } catch {
      // 尝试下一个
    }
  }
  return null;
}

async function loadElectronLauncher() {
  const entry = resolvePlaywrightCoreEntry();
  if (!entry) {
    throw new Error(
      "无法解析 playwright-core（需要先安装依赖：仓库根 pnpm install --frozen-lockfile）",
    );
  }
  const loaded = await import(pathToFileURL(entry).href);
  const electronApi = loaded._electron ?? loaded.default?._electron;
  if (!electronApi || typeof electronApi.launch !== "function") {
    throw new Error("playwright-core _electron API 不可用");
  }
  log(`playwright-core resolved: ${entry}`);
  return electronApi;
}

function sha256OfFile(path) {
  const hash = createHash("sha256");
  const fd = fsOpenSync(path, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const read = fsReadSync(fd, buffer, 0, buffer.length, null);
      if (read <= 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fsCloseSync(fd);
  }
  return hash.digest("hex");
}

/** 采集环境块（OS/内核/架构/glibc/显示/git commit）。 */
function collectEnvironment(displayUsed) {
  const environment = {
    node: process.version,
    platform: process.platform,
    osRelease: null,
    osPrettyName: null,
    kernel: null,
    arch: null,
    glibc: null,
    display: displayUsed,
    gitCommit: null,
  };
  try {
    environment.osRelease = spawnSync("uname", ["-r"], { encoding: "utf8" }).stdout?.trim() ?? null;
    environment.kernel = spawnSync("uname", ["-sr"], { encoding: "utf8" }).stdout?.trim() ?? null;
    environment.arch = spawnSync("uname", ["-m"], { encoding: "utf8" }).stdout?.trim() ?? null;
    const ldd = spawnSync("ldd", ["--version"], { encoding: "utf8" }).stdout?.split("\n")[0] ?? null;
    environment.glibc = ldd?.trim() ?? null;
  } catch {
    // best-effort
  }
  try {
    const osReleaseText = readFileSync("/etc/os-release", "utf8");
    environment.osPrettyName = osReleaseText.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1] ?? null;
  } catch {
    // best-effort
  }
  try {
    const git = spawnSync("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" });
    if (git.status === 0) environment.gitCommit = git.stdout.trim();
  } catch {
    // best-effort
  }
  return environment;
}

/**
 * 模式准备：解包并返回 { modeTag, executablePath, artifactPath, sha256, bytes, cleanup }。
 * extract-dir 布局自动识别：deb 解包根（opt/Epoch/epoch）/ squashfs-root / 直接含 epoch。
 */
function prepareMode(mode) {
  const runDir = mkdtempSync(join(tmpdir(), `epoch-journey-${mode.kind}-`));
  if (mode.kind === "deb") {
    const artifactPath = absolute(mode.path);
    if (!existsSync(artifactPath)) throw new Error(`产物不存在: ${artifactPath}`);
    const extract = spawnSync("dpkg-deb", ["-x", artifactPath, runDir], { encoding: "utf8" });
    if (extract.status !== 0) {
      throw new Error(`dpkg-deb -x 失败（exit ${extract.status}）: ${extract.stderr}`);
    }
    const executablePath = join(runDir, "opt", "Epoch", "epoch");
    if (!existsSync(executablePath)) {
      throw new Error(`解包目录缺少 ${join("opt", "Epoch", "epoch")}（electron-builder Linux 默认 /opt/Epoch）`);
    }
    return {
      modeTag: "deb",
      executablePath,
      artifactPath,
      sha256: sha256OfFile(artifactPath),
      bytes: statSync(artifactPath).size,
      cleanup: () => rmSync(runDir, { recursive: true, force: true }),
    };
  }
  if (mode.kind === "appimage") {
    const artifactPath = absolute(mode.path);
    if (!existsSync(artifactPath)) throw new Error(`产物不存在: ${artifactPath}`);
    chmodSync(artifactPath, 0o755);
    const extract = spawnSync(artifactPath, ["--appimage-extract"], {
      cwd: runDir,
      encoding: "utf8",
    });
    if (extract.status !== 0) {
      throw new Error(`--appimage-extract 失败（exit ${extract.status}）: ${extract.stderr}`);
    }
    const squashRoot = join(runDir, "squashfs-root");
    const appRun = join(squashRoot, "AppRun");
    const directBinary = join(squashRoot, "epoch");
    // TL 修正（2026-10-14 实测）：AppRun 是 shell 包装（exec 内嵌 electron），会破坏
    // playwright _electron 的启动协议握手（waitForLine 收不到就绪行 → "Process failed
    // to launch!"）。deb 模式直接启动 <prefix>/opt/Epoch/epoch 已验证可行，这里同样
    // 优先直接启动真实二进制；AppRun 仅作为缺失时的回退。
    const executablePath = existsSync(directBinary)
      ? directBinary
      : existsSync(appRun)
        ? appRun
        : null;
    if (!executablePath) {
      throw new Error("squashfs-root 内找不到 AppRun / epoch 可执行");
    }
    return {
      modeTag: "appimage",
      executablePath,
      artifactPath,
      sha256: sha256OfFile(artifactPath),
      bytes: statSync(artifactPath).size,
      cleanup: () => rmSync(runDir, { recursive: true, force: true }),
    };
  }
  // extract-dir：预解包根目录
  const rootDir = absolute(mode.path);
  if (!existsSync(rootDir)) throw new Error(`目录不存在: ${rootDir}`);
  const debLayout = join(rootDir, "opt", "Epoch", "epoch");
  const squashAppRun = join(rootDir, "squashfs-root", "AppRun");
  const rootAppRun = join(rootDir, "AppRun");
  const rootBinary = join(rootDir, "epoch");
  if (existsSync(debLayout)) {
    return {
      modeTag: "extract-deb",
      executablePath: debLayout,
      artifactPath: rootDir,
      sha256: null,
      bytes: null,
      cleanup: () => {},
    };
  }
  if (existsSync(squashAppRun)) {
    return {
      modeTag: "extract-appimage",
      executablePath: squashAppRun,
      artifactPath: rootDir,
      sha256: null,
      bytes: null,
      cleanup: () => {},
    };
  }
  if (existsSync(rootAppRun) || existsSync(rootBinary)) {
    return {
      modeTag: "extract-root",
      executablePath: existsSync(rootAppRun) ? rootAppRun : rootBinary,
      artifactPath: rootDir,
      sha256: null,
      bytes: null,
      cleanup: () => {},
    };
  }
  throw new Error(
    `目录 ${rootDir} 未识别出可执行布局（期望 opt/Epoch/epoch、squashfs-root/AppRun 或顶层 AppRun/epoch）`,
  );
}

function absolute(path) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/** 构造打包态启动环境：剥离 ELECTRON_RENDERER_URL；Xvfb 显示默认 :99；隔离 userData。 */
function buildLaunchEnv(userDataDir) {
  const env = { ...process.env };
  delete env.ELECTRON_RENDERER_URL; // 打包态 renderer 从包内加载（绝不能指向 dev server）
  delete env.ELECTRON_RUN_AS_NODE;
  env.DISPLAY = env.DISPLAY || ":99";
  // 单实例锁与用户数据隔离：旅程可重复运行且不污染真实用户数据（desktopRuntimeEnv.ts 支持的覆盖键）。
  env.ZCODE_DESKTOP_USER_DATA_DIR = userDataDir;
  env.ZCODE_DESKTOP_SESSION_DATA_DIR = join(userDataDir, "session");
  return env;
}

/** 关闭 app：优雅关闭 + 超时强杀兜底（W006 cleanup 模式的打包版）。 */
async function closeApp(app, logFn) {
  try {
    await Promise.race([
      app.close(),
      sleep(CLOSE_TIMEOUT_MS).then(() => {
        throw new Error("app.close() timeout");
      }),
    ]);
    return "close";
  } catch (error) {
    logFn(`app.close() 未在 ${CLOSE_TIMEOUT_MS}ms 内完成（${error.message}）——SIGKILL 兜底`);
    try {
      app.process().kill("SIGKILL");
    } catch {
      // 进程可能已退出
    }
    await sleep(1500);
    return "kill";
  }
}

/** 单个模式的完整旅程（launch → 01-09 → 10-relaunch → manifest）。launcherError 非空时记为启动阻塞（无跳过路径）。 */
async function runMode(modeSpec, evidenceRoot, electronLauncher, launcherError) {
  const prepared = prepareMode(modeSpec);
  const evidenceDir = join(evidenceRoot, prepared.modeTag);
  mkdirSync(evidenceDir, { recursive: true });
  const screenshots = [];
  const consoleErrors = [];
  const pageErrors = [];
  const steps = [];

  const capture = async (page, id, description) => {
    const file = `${id}.png`;
    await page.screenshot({ path: join(evidenceDir, file), fullPage: false });
    screenshots.push({ file, step: id, description });
    log(`captured ${file} — ${description}`);
  };

  const launchEnvUserData = join(tmpdir(), `epoch-journey-ud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(launchEnvUserData, { recursive: true });
  const launch = async () => {
    log(`launching ${prepared.executablePath} (DISPLAY=${buildLaunchEnv(launchEnvUserData).DISPLAY})`);
    const app = await electronLauncher.launch({
      executablePath: prepared.executablePath,
      args: CHROMIUM_FLAGS,
      env: buildLaunchEnv(launchEnvUserData),
      timeout: LAUNCH_TIMEOUT_MS,
    });
    const page = await app.firstWindow();
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
    } catch {
      // 真实窗口尺寸调整失败不影响旅程（Electron 窗口非 headless viewport）
    }
    page.on("console", (message) => {
      if (message.type() === "error") {
        if (consoleErrors.length < 200) consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      if (pageErrors.length < 100) pageErrors.push(error.message);
    });
    return { app, page };
  };

  let appHandle = null;
  let failureDiagnostics = null;
  try {
    if (launcherError) {
      // 依赖级阻塞（如 playwright-core 未安装）：记为启动失败，不静默跳过。
      throw new Error(`无法解析 playwright-core（旅程驱动依赖）：${launcherError}`);
    }
    appHandle = await launch();
    let { app, page } = appHandle;

    const session = await runJourneySession({
      app,
      page,
      capture,
      log,
    });
    steps.push(...session.steps);

    // ---------- 10 relaunch ----------
    const relaunchStarted = Date.now();
    log("step 10-relaunch …");
    try {
      const closeMode = await closeApp(app, log);
      const exitedGracefully = closeMode === "close";
      // 复用同一 userData 重新启动：验证二次启动（已存在数据目录）不进入崩溃循环。
      const relaunched = await launch();
      app = relaunched.app;
      page = relaunched.page;
      appHandle = relaunched;
      await page.waitForSelector(JOURNEY_SELECTORS.worldCanvas, { timeout: 180_000 });
      await page.waitForSelector(JOURNEY_SELECTORS.readyDot, { timeout: 180_000 });
      await sleep(3000); // 停留 3 秒确认无崩溃循环
      const canvasAlive = (await page.locator(JOURNEY_SELECTORS.worldCanvas).count()) > 0;
      if (!canvasAlive) throw new Error("重启 3 秒后世界画布消失（崩溃循环？）");
      const relaunchTitle = await page.title();
      await capture(page, "10-relaunch", "关闭后重启：世界立即恢复，无崩溃循环/缺失运行时依赖/必需凭据。");
      if (relaunchTitle !== "Epoch") {
        throw new Error(`重启后窗口标题为 ${JSON.stringify(relaunchTitle)}，期望 "Epoch"`);
      }
      steps.push({
        step: "10-relaunch",
        title: "关闭并重启；世界恢复且无崩溃循环",
        status: "pass",
        durationMs: Date.now() - relaunchStarted,
        detail: { closeMode, exitedGracefully, relaunchTitle },
      });
      log("step 10-relaunch PASS");
    } catch (error) {
      steps.push({
        step: "10-relaunch",
        title: "关闭并重启；世界恢复且无崩溃循环",
        status: "fail",
        durationMs: Date.now() - relaunchStarted,
        error: error instanceof Error ? error.message : String(error),
      });
      log(`step 10-relaunch FAIL: ${error.message}`);
    }
  } catch (error) {
    // 启动级别失败：记录为阻塞项（无跳过路径）。
    const message = error instanceof Error ? error.message : String(error);
    steps.push({
      step: "00-launch",
      title: "启动打包产物（_electron.launch）",
      status: "fail",
      durationMs: 0,
      error: message,
    });
    log(`LAUNCH FAILED: ${message}`);
    failureDiagnostics = { launchError: message };
  } finally {
    // 失败时抓取诊断截图 + DOM 摘要（W006 模式）。
    if (appHandle) {
      try {
        const page = appHandle.page;
        await page.screenshot({ path: join(evidenceDir, "00-failure.png"), fullPage: false });
        screenshots.push({ file: "00-failure.png", step: "00", description: "失败诊断截图" });
        const bodyText = await page.textContent("body").catch(() => "");
        // 对象展开对 undefined 是 no-op，无需 ?? {} 兜底（oxlint no-useless-fallback-in-spread）。
        failureDiagnostics = {
          ...failureDiagnostics,
          bodyTextHead: bodyText?.slice(0, 600) ?? null,
        };
      } catch {
        // 诊断失败不影响退出码
      }
      try {
        await closeApp(appHandle.app, log);
      } catch {
        // 清理失败不影响退出码
      }
    }
    prepared.cleanup();
    rmSync(launchEnvUserData, { recursive: true, force: true });
  }

  // 只在有失败时保留 00-failure.png；全绿时移除避免误读。
  const failed = steps.some((step) => step.status === "fail");
  if (!failed && screenshots.some((shot) => shot.file === "00-failure.png")) {
    const failureShots = screenshots.filter((shot) => shot.file === "00-failure.png");
    for (const shot of failureShots) {
      rmSync(join(evidenceDir, shot.file), { force: true });
    }
  }

  const identity = {
    windowTitle: steps.find((step) => step.step === "01-launch-identity")?.detail?.windowTitle ?? null,
    appName: steps.find((step) => step.step === "01-launch-identity")?.detail?.appInfo?.name ?? null,
    appVersion: steps.find((step) => step.step === "01-launch-identity")?.detail?.appInfo?.version ?? null,
    electronVersion:
      steps.find((step) => step.step === "01-launch-identity")?.detail?.appInfo?.electron ?? null,
    chromeVersion:
      steps.find((step) => step.step === "01-launch-identity")?.detail?.appInfo?.chrome ?? null,
  };
  // app.evaluate 不可用时的 Electron 版本回退：读 desktop 包 manifest（构建输入）。
  if (!identity.electronVersion) {
    try {
      const pkg = JSON.parse(readFileSync(join(DESKTOP_ROOT, "package.json"), "utf8"));
      identity.electronVersion = `${pkg.devDependencies?.electron ?? "?"} (desktop package.json devDependencies — 未经运行时验证)`;
    } catch {
      identity.electronVersion = null;
    }
  }

  const manifest = {
    workOrder: "W036 — Ubuntu Epoch Desktop Release（打包产物验收旅程）",
    journey:
      "launch → identity → world-dominant → navigate → select → inspect → isolate → unisolate → measure → annotate → relaunch",
    generatedAt: new Date().toISOString(),
    mode: prepared.modeTag,
    artifact: {
      path: prepared.artifactPath,
      fileName: basename(String(prepared.artifactPath)),
      sha256: prepared.sha256,
      bytes: prepared.bytes,
    },
    runPath: {
      executablePath: prepared.executablePath,
      launchArgs: CHROMIUM_FLAGS,
      electronApi: "playwright-core _electron.launch (真实 Electron 窗口)",
      envNotes: [
        "ELECTRON_RENDERER_URL 已剥离（打包态 renderer 从 app.asar 内加载）",
        "ZCODE_DESKTOP_USER_DATA_DIR/SESSION_DATA_DIR 指向旅程临时目录（单实例锁与数据隔离）",
      ],
    },
    environment: collectEnvironment(buildLaunchEnv(launchEnvUserData).DISPLAY),
    identity,
    selectors: JOURNEY_SELECTORS,
    steps,
    evidence: screenshots,
    diagnostics: {
      failure: failureDiagnostics ?? null,
      pageErrors: pageErrors.slice(0, 50),
      consoleErrors: consoleErrors.slice(0, 50),
    },
    pass: !failed,
    law: "No skipped critical desktop journey may be recorded as a passing release (spec/acceptance/ubuntu-epoch-desktop-release.md)",
  };
  const manifestPath = join(evidenceDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  log(`manifest written: ${manifestPath}`);
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
    : DEFAULT_EVIDENCE_ROOT;
  mkdirSync(evidenceRoot, { recursive: true });

  const electronLauncherResult = await loadElectronLauncher().then(
    (launcher) => ({ launcher, launcherError: null }),
    (error) => ({ launcher: null, launcherError: error instanceof Error ? error.message : String(error) }),
  );
  if (electronLauncherResult.launcherError) {
    log(
      `launcher resolution failed — 每个模式将记录为启动失败（无跳过路径）：${electronLauncherResult.launcherError}`,
    );
  }
  const manifests = [];
  for (const mode of options.modes) {
    log(`=== mode ${mode.kind}: ${mode.path} ===`);
    try {
      manifests.push(
        await runMode(
          mode,
          evidenceRoot,
          electronLauncherResult.launcher,
          electronLauncherResult.launcherError,
        ),
      );
    } catch (error) {
      // 模式级失败（解包失败等）：记录为 fail manifest（不跳过）。
      const modeTag = `${mode.kind}-error`;
      const evidenceDir = join(evidenceRoot, modeTag);
      mkdirSync(evidenceDir, { recursive: true });
      const manifest = {
        workOrder: "W036 — Ubuntu Epoch Desktop Release（打包产物验收旅程）",
        generatedAt: new Date().toISOString(),
        mode: modeTag,
        artifact: { path: absolute(mode.path), fileName: basename(mode.path), sha256: null, bytes: null },
        steps: [
          {
            step: "00-prepare",
            title: "解包/定位可执行",
            status: "fail",
            durationMs: 0,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
        evidence: [],
        pass: false,
      };
      writeFileSync(
        join(evidenceDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      manifests.push(manifest);
      log(`mode ${mode.kind} PREPARE FAILED: ${error.message}`);
    }
  }

  const failedModes = manifests.filter((manifest) => !manifest.pass);
  for (const manifest of manifests) {
    const tag = manifest.pass ? "PASS" : "FAIL";
    const failedSteps = manifest.steps.filter((step) => step.status === "fail");
    console.log(`[journey-ubuntu] ${tag} ${manifest.mode} (${failedSteps.length} failed steps)`);
    for (const step of failedSteps) {
      console.log(`[journey-ubuntu]   ✗ ${step.step}: ${step.error}`);
    }
  }
  console.log(
    `[journey-ubuntu] overall: ${failedModes.length === 0 ? "PASS" : "FAIL"} (${manifests.length - failedModes.length}/${manifests.length} modes passed)`,
  );
  process.exit(failedModes.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[journey-ubuntu] FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
