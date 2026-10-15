/* eslint-disable max-lines -- 发布验收共享件按仓库惯例保持显示自足/解包/证据写出逻辑集中（见 scripts/bundle.mjs）。 */
/**
 * W037-W2 — update-channel 验收套件共享工具。
 *
 * 三个 CLI（feed-audit / update-network-assertion / dev-update-journey）共用的：
 * - 环境采集（OS/内核/架构/glibc/node/git commit/electron 版本/display 模式）；
 * - 显示自足法（与 run-release-gate.sh 同律：ambient DISPLAY → 常驻 Xvfb :99 → 私有 Xvfb -ac）；
 * - playwright-core _electron 启动器解析（journey-ubuntu.mjs 同款解析顺序）；
 * - 产物解包（dpkg-deb -x / --appimage-extract / 预解包目录识别）；
 * - 机器可读 manifest + 人类可读 markdown 写出；凭据形状防御性脱敏。
 */
import { spawn, spawnSync } from "node:child_process";
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
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..", "..", "..");
export const DESKTOP_ROOT = join(REPO_ROOT, "packages", "desktop");
export const UPDATE_CHANNEL_DIR = join(REPO_ROOT, "qa", "epoch-ubuntu-release", "update-channel");
export const DEFAULT_EVIDENCE_ROOT = join(
  REPO_ROOT,
  "qa",
  "epoch-ubuntu-release",
  "evidence",
  "update-channel",
);

/** W036 旅程同款 Chromium 旗标（真实窗口，软渲染兜底）。 */
export const CHROMIUM_FLAGS = [
  "--no-sandbox",
  "--disable-gpu-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--disable-gpu-compositing",
];

/** Epoch 更新通道身份（W037 TL 预集成后的唯一合法 feed）。 */
export const EPOCH_FEED = Object.freeze({
  provider: "github",
  owner: "payswapdotorg",
  repo: "Epoch-2.0",
});

/** ZCode 端点（更新流量绝不允许触达）。 */
export const DEFAULT_ZCODE_ENDPOINT_ORIGIN = "https://zcode.z.ai";
/** 服务端 manifest provider 的更新清单路径签名（manifestUpdateProvider.ts）。 */
export const ZCODE_ELECTRON_MANIFEST_API_PATH = "/api/v1/releases/electron/manifest";

/** Electron feed 主机（GitHub Releases API / release 资产域）。 */
export function isEpochFeedHost(hostname) {
  return (
    hostname === "api.github.com" ||
    hostname === "github.com" ||
    hostname === "codeload.github.com" ||
    hostname === "objects.githubusercontent.com" ||
    hostname.endsWith(".githubusercontent.com") ||
    hostname.endsWith(".githubassets.com")
  );
}

export function hostnameOf(urlOrHost) {
  const raw = String(urlOrHost ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname) return parsed.hostname.toLowerCase();
  } catch {
    // 非 URL 形式，走裸主机处理
  }
  // CONNECT 目标形如 "host:port"（new URL 会把 "host:port" 误析成 scheme）；剥掉端口按裸主机处理。
  const bare = raw.replace(/:\d+$/, "");
  return bare ? bare.toLowerCase() : null;
}

/** 从 origin（https://zcode.z.ai）提取 hostname。 */
export function hostnameOfOrigin(origin) {
  return hostnameOf(String(origin ?? "").replace(/^\w+:\/\//, "").replace(/\/.*$/, ""));
}

export function absolute(path) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function log(prefix, message) {
  console.log(`[${prefix}] ${message}`);
}

/** 同步分块 sha256（产物 <2GB）。 */
export function sha256OfFile(path) {
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

/**
 * 凭据形状防御性脱敏（法：文件/报告/日志绝不携带凭据）。
 * 覆盖 GitHub token、Bearer 头、URL 内嵌 userinfo、常见 secret 查询参数。
 */
export function scrubSecrets(text) {
  return String(text ?? "")
    .replace(/ghp_[A-Za-z0-9]{16,}/g, "ghp_<redacted>")
    .replace(/gho_[A-Za-z0-9]{16,}/g, "gho_<redacted>")
    .replace(/ghu_[A-Za-z0-9]{16,}/g, "ghu_<redacted>")
    .replace(/ghs_[A-Za-z0-9]{16,}/g, "ghs_<redacted>")
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, "github_pat_<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/g, "Bearer <redacted>")
    .replace(/(token|password|secret|api[_-]?key)=([^&\s]{8,})/gi, "$1=<redacted>")
    .replace(/https:\/\/([^:@/\s]+):([^@/\s]+)@/g, "https://<redacted>@");
}

/** 采集环境块（诚实记录；displayUsed 见 resolveDisplaySelfSufficient）。 */
export function collectEnvironment(displayUsed, extra = {}) {
  const environment = {
    node: process.version,
    platform: process.platform,
    osPrettyName: null,
    kernel: null,
    arch: null,
    glibc: null,
    display: displayUsed,
    electronVersion: null,
    electronSource: null,
    gitCommit: null,
    ...extra,
  };
  try {
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
  try {
    const pkg = JSON.parse(readFileSync(join(DESKTOP_ROOT, "package.json"), "utf8"));
    environment.electronVersion = pkg.devDependencies?.electron ?? null;
    environment.electronSource = "packages/desktop/package.json devDependencies（构建输入声明）";
  } catch {
    // best-effort
  }
  return environment;
}

/** 解析 Electron 运行时版本（若能执行二进制 --version，则升级为实测值）。 */
export function detectElectronRuntimeVersion(executablePath) {
  try {
    const result = spawnSync(executablePath, ["--version"], {
      encoding: "utf8",
      timeout: 20_000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    const version = result.stdout?.trim().replace(/^v/i, "");
    if (result.status === 0 && /^\d+\.\d+\.\d+/.test(version ?? "")) {
      return version;
    }
  } catch {
    // best-effort
  }
  return null;
}

function displaySocketPathOf(value) {
  let normalized = String(value ?? "");
  if (normalized.startsWith("localhost:")) normalized = `:${normalized.slice("localhost:".length)}`;
  const number = normalized.replace(/^:/, "").split(".")[0];
  return number ? `/tmp/.X11-unix/X${number}` : null;
}

/** socket 文件存在且可连（残留的死 socket 不算 —— 私有 Xvfb 被 SIGKILL 后会留死文件）。 */
function displaySocketAlive(value) {
  const socketPath = displaySocketPathOf(value);
  if (!socketPath || !existsSync(socketPath)) return false;
  const probeScript =
    'const s=require("node:net").connect(process.argv[1]);' +
    's.on("connect",()=>{s.destroy();process.exit(0)});' +
    's.on("error",()=>process.exit(1));' +
    'setTimeout(()=>process.exit(1),400)';
  try {
    const probe = spawnSync(process.execPath, ["-e", probeScript, socketPath], { timeout: 2000 });
    return probe.status === 0;
  } catch {
    return false;
  }
}

/**
 * 显示自足法（W036 run-release-gate.sh 同律）：
 * 1) 环境 DISPLAY 且 socket 存在 → 复用（mode=ambient）；
 * 2) 常驻 Xvfb :99 socket → 复用（mode=resident-:99）；
 * 3) 否则现起私有 Xvfb -ac（90-99 找空位；10s socket 就绪等待；mode=private-xvfb），
 *    返回 release() 供调用方退出时回收。
 * 无 X 显示 → 抛错（真实窗口旅程无法执行；无跳过路径）。
 */
export async function resolveDisplaySelfSufficient(logPrefix = "update-channel") {
  if (process.env.DISPLAY && displaySocketAlive(process.env.DISPLAY)) {
    log(logPrefix, `显示：复用环境 DISPLAY=${process.env.DISPLAY}`);
    return { display: process.env.DISPLAY, mode: "ambient", release: () => {} };
  }
  if (displaySocketAlive(":99")) {
    log(logPrefix, "显示：复用常驻 Xvfb :99");
    return { display: ":99", mode: "resident-:99", release: () => {} };
  }
  const xvfbProbe = spawnSync("which", ["Xvfb"], { encoding: "utf8" });
  if (xvfbProbe.status !== 0 || !xvfbProbe.stdout?.trim()) {
    throw new Error(
      "无可用 X 显示且未安装 Xvfb —— 真实窗口断言无法执行（验收法：跳过不得计为通过）",
    );
  }
  let chosen = null;
  for (const candidate of [99, 98, 97, 96, 95, 94, 93, 92, 91, 90]) {
    // 死 socket（上一轮私有 Xvfb 被强杀的残留）也视为空位，选中后清理。
    if (!displaySocketAlive(`:${candidate}`)) {
      chosen = `:${candidate}`;
      break;
    }
  }
  if (!chosen) {
    throw new Error("X :90-:99 全被占用，无法现起私有 Xvfb");
  }
  const xvfb = spawn("Xvfb", [chosen, "-screen", "0", "1920x1080x24", "-nolisten", "tcp", "-ac"], {
    stdio: "ignore",
    detached: false,
  });
  const socketPath = `/tmp/.X11-unix/X${chosen.slice(1)}`;
  rmSync(socketPath, { force: true });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (displaySocketAlive(chosen)) break;
    await new Promise((sleepResolve) => setTimeout(sleepResolve, 200));
  }
  if (!displaySocketAlive(chosen)) {
    try {
      xvfb.kill("SIGKILL");
    } catch {
      // 进程可能已退出
    }
    throw new Error(`私有 Xvfb 在 ${chosen} 上 10s 内未就绪`);
  }
  log(logPrefix, `显示：已启动私有 Xvfb ${chosen}（pid ${xvfb.pid}；退出时回收）`);
  return {
    display: chosen,
    mode: "private-xvfb",
    release: () => {
      try {
        xvfb.kill("SIGTERM");
      } catch {
        // 清理失败不影响退出码
      }
      // SIGTERM 让 Xvfb 自清理 socket；2s 后强杀并移除残留 socket 文件，
      // 避免死 socket 被下一轮误判为「常驻 :99」。
      setTimeout(() => {
        try {
          xvfb.kill("SIGKILL");
        } catch {
          // 已退出
        }
        rmSync(socketPath, { force: true });
      }, 2_000).unref?.();
    },
  };
}

/** playwright-core _electron 解析（journey-ubuntu.mjs 同款顺序）。 */
export function resolvePlaywrightCoreEntry() {
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

export async function loadElectronLauncher(logPrefix = "update-channel") {
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
  log(logPrefix, `playwright-core resolved: ${entry}`);
  return electronApi;
}

/**
 * 解析桌面 dev 态 Electron 二进制（packages/desktop/scripts/dev.mjs 同款：node_modules/electron/dist/electron）。
 */
export function resolveDevElectronBinary() {
  const candidates = [
    join(DESKTOP_ROOT, "node_modules", "electron", "dist", "electron"),
    join(REPO_ROOT, "node_modules", "electron", "dist", "electron"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "找不到 dev Electron 二进制（node_modules/electron/dist/electron）；请先 pnpm install",
  );
}

/**
 * 解包产物（deb: dpkg-deb -x → opt/Epoch/epoch；AppImage: --appimage-extract → squashfs-root；
 * extract-dir: 识别既有布局）。返回 { modeTag, executablePath, resourcesDir, artifactPath,
 * sha256, bytes, cleanup }。
 */
export function prepareArtifact(mode) {
  const runDir = mkdtempSync(join(tmpdir(), `epoch-update-channel-${mode.kind}-`));
  const makeResult = (modeTag, executablePath, resourcesDir, artifactPath, sha256, bytes) => ({
    modeTag,
    executablePath,
    resourcesDir,
    artifactPath,
    sha256,
    bytes,
    cleanup: () => rmSync(runDir, { recursive: true, force: true }),
  });
  if (mode.kind === "deb") {
    const artifactPath = absolute(mode.path);
    if (!existsSync(artifactPath)) throw new Error(`产物不存在: ${artifactPath}`);
    const extract = spawnSync("dpkg-deb", ["-x", artifactPath, runDir], { encoding: "utf8" });
    if (extract.status !== 0) {
      throw new Error(`dpkg-deb -x 失败（exit ${extract.status}）: ${extract.stderr}`);
    }
    const executablePath = join(runDir, "opt", "Epoch", "epoch");
    const resourcesDir = join(runDir, "opt", "Epoch", "resources");
    if (!existsSync(executablePath)) {
      throw new Error(`解包目录缺少 ${join("opt", "Epoch", "epoch")}`);
    }
    return makeResult("deb", executablePath, resourcesDir, artifactPath, sha256OfFile(artifactPath), statSync(artifactPath).size);
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
    // journey-ubuntu.mjs 的实测结论：AppRun 是 shell 包装会破坏 _electron 握手，直接启动真实二进制。
    const directBinary = join(squashRoot, "epoch");
    const appRun = join(squashRoot, "AppRun");
    const executablePath = existsSync(directBinary) ? directBinary : appRun;
    if (!existsSync(executablePath)) {
      throw new Error("squashfs-root 内找不到 epoch/AppRun 可执行");
    }
    return makeResult(
      "appimage",
      executablePath,
      join(squashRoot, "resources"),
      artifactPath,
      sha256OfFile(artifactPath),
      statSync(artifactPath).size,
    );
  }
  const rootDir = absolute(mode.path);
  if (!existsSync(rootDir)) throw new Error(`目录不存在: ${rootDir}`);
  const debLayout = join(rootDir, "opt", "Epoch", "epoch");
  const squashBinary = join(rootDir, "squashfs-root", "epoch");
  const squashAppRun = join(rootDir, "squashfs-root", "AppRun");
  const rootAppRun = join(rootDir, "AppRun");
  const rootBinary = join(rootDir, "epoch");
  if (existsSync(debLayout)) {
    return makeResult("extract-deb", debLayout, join(rootDir, "opt", "Epoch", "resources"), rootDir, null, null);
  }
  if (existsSync(squashBinary) || existsSync(squashAppRun)) {
    return makeResult(
      "extract-appimage",
      existsSync(squashBinary) ? squashBinary : squashAppRun,
      join(rootDir, "squashfs-root", "resources"),
      rootDir,
      null,
      null,
    );
  }
  if (existsSync(rootAppRun) || existsSync(rootBinary)) {
    return makeResult(
      "extract-root",
      existsSync(rootAppRun) ? rootAppRun : rootBinary,
      join(rootDir, "resources"),
      rootDir,
      null,
      null,
    );
  }
  throw new Error(
    `目录 ${rootDir} 未识别出可执行布局（期望 opt/Epoch/epoch、squashfs-root/epoch|AppRun 或顶层 epoch|AppRun）`,
  );
}

/** 打包态启动环境（journey-ubuntu.mjs 同律：剥离 ELECTRON_RENDERER_URL；隔离 userData）。 */
export function buildPackagedLaunchEnv(userDataDir, { proxyServerUrl } = {}) {
  const env = { ...process.env };
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  // 剥离继承的代理环境：观察代理只通过 --proxy-server 显式注入，避免双代理污染。
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) {
    delete env[key];
  }
  env.DISPLAY = env.DISPLAY || ":99";
  env.ZCODE_DESKTOP_USER_DATA_DIR = userDataDir;
  env.ZCODE_DESKTOP_SESSION_DATA_DIR = join(userDataDir, "session");
  if (proxyServerUrl) {
    env.NO_PROXY = "localhost,127.0.0.1";
    env.no_proxy = "localhost,127.0.0.1";
  }
  return env;
}

/** manifest 写出（JSON 文本整体经 scrubSecrets 防御性脱敏；替换不会引入引号，JSON 仍有效）。 */
export function writeEvidence(outDir, name, data) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${name}.json`);
  writeFileSync(jsonPath, `${scrubSecrets(JSON.stringify(data, null, 2))}\n`, "utf8");
  return jsonPath;
}

/** JSON.stringify 后整体脱敏再写 markdown（凭据法）。 */
export function writeMarkdown(outDir, name, content) {
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, `${name}.md`);
  writeFileSync(mdPath, scrubSecrets(content), "utf8");
  return mdPath;
}

/** 读 desktop 构建元数据里的 app 版本（构建写出的 build-meta.json 优先，兜底根 package.json）。 */
export function resolveDesktopAppVersion() {
  const candidates = [
    join(DESKTOP_ROOT, "out", "metadata", "build-meta.json"),
    join(REPO_ROOT, "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8"));
      const version = parsed.appVersion ?? parsed.version;
      if (typeof version === "string" && version.trim()) return version.trim();
    } catch {
      // 尝试下一个
    }
  }
  throw new Error("无法确定 app 版本（out/metadata/build-meta.json 与根 package.json 均缺失/无效）");
}

/** 简易扁平 YAML 解析（app-update.yml / dev-app-update.yml 都是 key: value 扁平结构）。 */
export function parseFlatYaml(text) {
  const result = {};
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      const value = match[2].trim();
      result[match[1]] = value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value;
    }
  }
  return result;
}
