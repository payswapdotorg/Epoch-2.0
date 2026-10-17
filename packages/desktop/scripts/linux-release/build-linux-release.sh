#!/usr/bin/env bash
# W036：Epoch Ubuntu 桌面发布驱动（linux x64 的 deb + AppImage 一条龙）。
# W038：--arch 参数化（默认 x64 与 W036 逐字节等价；arm64 目标见用法说明）。
#
# 职责（只复用仓库既有命令，不发明新的构建入口）：
#   1. 环境锁定：EPOCH_DESKTOP_IDENTITY=1（Epoch 身份，优先级最高，见
#      scripts/desktop-product-identity.mjs）+ ZCODE_ENV=production（生产后端，
#      产物文件名不带 _TEST 后缀）+ ZCODE_TARGET_OS/ARCH（确定性目标）+
#      ZCODE_LINUX_TARGETS=deb,AppImage（electron-builder.config.js 提供的收窄开关，
#      无 rpmbuild 的环境也能出包）。
#   2. 仓库根目录 `pnpm build`：仓库真实构建路径（所有包，含 desktop 的
#      prepare:runtime-assets + run-production-build）。
#   3. packages/desktop 内 `pnpm bundle -- --os linux --arch x64 --skip-prepare
#      --skip-build`：只跑 electron-builder（构建已由第 2 步完成，skip 标志避免重复
#      全量构建）。注意 bundle.mjs 只认 `--os/--arch` 旗标或位置参数 `linux x64`，
#      不支持 `--linux --x64` 这类平台旗标（parseArgs 会直接报不支持的参数）。
#   4. 生成 SHA256SUMS 与 release-manifest.json 骨架（版本/commit/时间/产物大小与哈希）。
#   5. 调 validate-artifacts.mjs 做发布前机械校验（任一失败即非零退出，发布门 fail-closed）。
#
# 前置条件（本脚本不负责安装依赖，重跑安全：产物与清单每次整体重写）：
#   - 已完成 `pnpm install`（含 packages/desktop postinstall 的 node-pty 预编译就位）；
#   - node>=24 与 pnpm 10.33.2（见根 mise.toml）；
#   - git 可用（release-manifest 需要真实 commit 溯源）。
#
# 用法（仓库根目录）：
#   bash packages/desktop/scripts/linux-release/build-linux-release.sh [--arch <x64|arm64>]
#     --arch x64    默认；产物名与 W036 冻结基线逐字节一致（amd64 deb + x86_64 AppImage）
#     --arch arm64  W038 arm64 目标（arm64 deb + arm64 AppImage，见 spec/acceptance/ubuntu-arm64-release.md）
#
# 产物目录：packages/desktop/dist（可用 ZCODE_DESKTOP_DIST_DIR 覆盖；语义与
# electron-builder 的 directories.output 一致：相对路径基于 packages/desktop 解析）。
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)"
DESKTOP_ROOT="${REPO_ROOT}/packages/desktop"
LINUX_RELEASE_DIR="${DESKTOP_ROOT}/scripts/linux-release"
LOG_PREFIX="[linux-release]"

log() { echo "${LOG_PREFIX} $*"; }
fail() { echo "${LOG_PREFIX} ERROR: $*" >&2; exit 1; }

# ---------- 参数解析（W038） ----------
ARCH="x64"
while [ $# -gt 0 ]; do
  case "$1" in
    --arch)
      [ $# -ge 2 ] || fail "--arch 需要一个参数（x64|arm64）"
      ARCH="$2"; shift 2 ;;
    -h|--help)
      sed -n 's/^# \?//p' "$0" | head -n 30; exit 0 ;;
    *) fail "未知参数: $1（--arch <x64|arm64>；--help 查看用法）" ;;
  esac
done
case "$ARCH" in
  x64|arm64) ;;
  *) fail "不支持的架构: $ARCH（仅支持 x64 和 arm64）" ;;
esac

# ---------- 环境锁定 ----------
# Epoch 身份与生产后端两轴分离（见 desktop-product-identity.mjs 注释）：
# 身份决定 appId/productName/executableName/packageName，后端决定产物名是否带 _TEST。
export EPOCH_DESKTOP_IDENTITY=1
export ZCODE_ENV=production
export ZCODE_TARGET_OS=linux
export ZCODE_TARGET_ARCH="$ARCH"
# 默认只出 deb + AppImage；需要全量 target 时显式传 ZCODE_LINUX_TARGETS 覆盖。
export ZCODE_LINUX_TARGETS="${ZCODE_LINUX_TARGETS:-deb,AppImage}"

# 产物名架构段（electron-builder@26.8.1 getArtifactArchName 的既定事实，非猜测）：
#   deb     -> Debian 架构名：x64=amd64（W036 冻结名），arm64=arm64
#   AppImage -> x64=x86_64（W036 冻结名，x64 专属特例），arm64=arm64（aarch64 重映射只适用 pacman/rpm/flatpak）
case "$ARCH" in
  x64)   DEB_ARCH="amd64";  APPIMAGE_ARCH="x86_64" ;;
  arm64) DEB_ARCH="arm64";  APPIMAGE_ARCH="arm64" ;;
esac

# ---------- 前置检查 ----------
command -v node >/dev/null 2>&1 || fail "缺少 node（需要 >=24，见 mise.toml）"
command -v pnpm >/dev/null 2>&1 || fail "缺少 pnpm（需要 10.33.2，见 mise.toml）"
command -v git >/dev/null 2>&1 || fail "缺少 git（release-manifest 需要 commit 溯源）"
command -v sha256sum >/dev/null 2>&1 || fail "缺少 sha256sum（coreutils）"

# 依赖就位检查：electron-builder 的 bin 与 pnpm 虚拟store 都必须存在，
# 避免跑到一半才发现 pnpm install 没做（本脚本不代跑 install，保持发布路径单一）。
# TL 修正（2026-10-14 实测）：本仓库 .npmrc 是 node-linker=hoisted——依赖整体装在
# 仓库根 node_modules（含 .pnpm 虚拟 store 与 .bin），packages/desktop/node_modules
# 只剩 workspace 软链（@zcode/*、vite 等）。两级都探测，hoisted 与 isolated 布局通吃。
if [ ! -d "${REPO_ROOT}/node_modules/.pnpm" ] && [ ! -d "${DESKTOP_ROOT}/node_modules/.pnpm" ]; then
  fail "node_modules/.pnpm 不存在（根与 packages/desktop 都没有）：请先在仓库根目录运行 pnpm install"
fi
if [ ! -x "${REPO_ROOT}/node_modules/.bin/electron-builder" ] && [ ! -x "${DESKTOP_ROOT}/node_modules/.bin/electron-builder" ]; then
  fail "electron-builder 可执行不存在（根与 packages/desktop 的 .bin 都没有）：请先运行 pnpm install"
fi

GIT_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)" ||
  fail "git rev-parse HEAD 失败：需要在 git 工作区内构建"
GIT_COMMIT_SHORT="$(git -C "${REPO_ROOT}" rev-parse --short=8 HEAD)"

# dist 目录解析与 electron-builder directories.output 同语义：
# 未设置时为 packages/desktop/dist；相对路径相对 packages/desktop 解析。
if [ -n "${ZCODE_DESKTOP_DIST_DIR:-}" ]; then
  case "${ZCODE_DESKTOP_DIST_DIR}" in
    /*) DIST_DIR="${ZCODE_DESKTOP_DIST_DIR}" ;;
    *) DIST_DIR="${DESKTOP_ROOT}/${ZCODE_DESKTOP_DIST_DIR}" ;;
  esac
else
  DIST_DIR="${DESKTOP_ROOT}/dist"
fi

# 版本以构建写出的 build-meta.json 为准（与 extraMetadata.version/${version} 同源），
# 兜底根 package.json（build-metadata.mjs 的 appVersion 即来自根版本号）。
APP_VERSION="$(node -e '
const fs = require("node:fs");
let version = null;
try { version = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).appVersion; } catch {}
if (!version) version = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).version;
if (!version) process.exit(1);
console.log(version);
' "${DESKTOP_ROOT}/out/metadata/build-meta.json" "${REPO_ROOT}/package.json")" ||
  fail "无法确定 app 版本（build-meta.json 与根 package.json 均缺失/无效）"

DEB_ARTIFACT="Epoch-${APP_VERSION}-linux-${DEB_ARCH}.deb" # electron-builder deb 用 Debian 架构名（amd64/arm64）
APPIMAGE_ARTIFACT="Epoch-${APP_VERSION}-linux-${APPIMAGE_ARCH}.AppImage" # AppImage 架构段（x86_64/arm64）

log "repo=${REPO_ROOT}"
log "dist=${DIST_DIR}"
log "version=${APP_VERSION} commit=${GIT_COMMIT_SHORT}"
log "identity=EPOCH_DESKTOP_IDENTITY=${EPOCH_DESKTOP_IDENTITY} backend=ZCODE_ENV=${ZCODE_ENV}"
log "targets=${ZCODE_LINUX_TARGETS} arch=${ZCODE_TARGET_ARCH} debArch=${DEB_ARCH} appimageArch=${APPIMAGE_ARCH}"

# ---------- 1/4 仓库真实构建路径（根 pnpm build：所有包） ----------
# W036_SKIP_ROOT_BUILD=1：可恢复重跑开关——大仓库在低内存 CI/本地盒上可能被 OOM 或
# 会话回收打断，重跑时若根构建已单独完成（pnpm build 已 green），跳过第 1 步直接
# 进入打包。发布语义不变：调用方自行保证「跳过 = 根构建已在同一 commit 上通过」。
if [ "${W036_SKIP_ROOT_BUILD:-0}" = "1" ]; then
  log "step 1/4: W036_SKIP_ROOT_BUILD=1 —— 跳过根构建（调用方保证已单独完成）"
else
  log "step 1/4: 桌面发布所需构建（packages/* 除 desktop + desktop 全量含 runtime assets）"
  # TL 修正（2026-10-14 实测）：根 `pnpm build` 会把 apps/zcode-cli 全量 turbo 与
  # @zcode/web 的 vite 一并构建——4GB CI/本地盒上被 OOM(137) 杀死。桌面包的真实
  # 依赖集是 packages/*（@zcode/* workspace 依赖，产物进 asar）+ desktop 自身
  # （prepare:runtime-assets 内部按需构建 agent CLI 的 desktop-agent 目标与
  # native-search，不跑 cli 全量 turbo，也不碰 web）。该过滤集与根 pnpm build 在
  # 这些包上执行的是完全相同的命令，只是去掉了发布不需要的两个 app 目标。
  # TURBO_CONCURRENCY=1：agent bundle 的 turbo 在低内存盒上并行 vite 会 OOM。
  # ZCODE_DESKTOP_SERIAL_BUILD=1：tsup 与 vite 串行（并行峰值 RSS 在 4GB 盒上被 OOM 杀）。
  export TURBO_CONCURRENCY="${TURBO_CONCURRENCY:-1}"
  export ZCODE_DESKTOP_SERIAL_BUILD="${ZCODE_DESKTOP_SERIAL_BUILD:-1}"
  # !@zcode/web：web 是独立 Web 应用（浏览器端），不在 desktop 的依赖闭包里
  # （desktop package.json 无此依赖；runtime-dependency-closure 也不含它），
  # 而它的 vite 全量构建在 4GB 盒上稳定 OOM（10931 modules 后被杀）。发布不需要它。
  ( cd "${REPO_ROOT}" && pnpm -r --filter "./packages/*" --filter "!@zcode/web" --filter "!@zcode/desktop" build )
  ( cd "${REPO_ROOT}" && pnpm --filter @zcode/desktop build )
fi

# ---------- 2/4 electron-builder 打包 ----------
log "step 2/4: pnpm bundle（linux ${ARCH}，--skip-prepare --skip-build 避免重复构建）"
(
  cd "${DESKTOP_ROOT}" &&
    pnpm bundle -- --os linux --arch "$ARCH" --skip-prepare --skip-build
)

# ---------- 3/4 产物存在性 + SHA256SUMS + release-manifest.json ----------
log "step 3/4: 生成 SHA256SUMS / release-manifest.json"
for artifact in "${DEB_ARTIFACT}" "${APPIMAGE_ARTIFACT}"; do
  [ -s "${DIST_DIR}/${artifact}" ] ||
    fail "产物缺失或为空: ${DIST_DIR}/${artifact}"
done

ELECTRON_VERSION="$(node -e '
const fs = require("node:fs");
console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).devDependencies.electron);
' "${DESKTOP_ROOT}/package.json")"
# electron-builder 实际版本从 desktop 的 node_modules 解析；解析失败不阻断发布，
# manifest 记 unknown（版本事实仍可从 lockfile 追溯）。
ELECTRON_BUILDER_VERSION="$(node -e '
try { console.log(require(process.argv[1] + "/package.json").version); }
catch { console.log("unknown"); }
' "${DESKTOP_ROOT}/node_modules/electron-builder")"
GLIBC_VERSION="$(getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}' || true)"
NODE_VERSION="$(node --version)"
PNPM_VERSION="$(pnpm --version)"
KERNEL_INFO="$(uname -sr)"

node - \
  "${DIST_DIR}" \
  "${APP_VERSION}" \
  "${GIT_COMMIT}" \
  "${GIT_COMMIT_SHORT}" \
  "${ELECTRON_VERSION}" \
  "${ELECTRON_BUILDER_VERSION}" \
  "${GLIBC_VERSION:-unknown}" \
  "${NODE_VERSION}" \
  "${PNPM_VERSION}" \
  "${KERNEL_INFO}" \
  "${ZCODE_LINUX_TARGETS}" \
  "${ARCH}" \
  "${DEB_ARTIFACT}" \
  "${APPIMAGE_ARTIFACT}" <<'NODE'
// 生成 SHA256SUMS 与 release-manifest.json 骨架。
// 哈希用流式读取：deb/AppImage 体积可达数百 MiB，readFileSync 会顶爆小内存构建机。
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const [
  distDir,
  version,
  commit,
  commitShort,
  electronVersion,
  electronBuilderVersion,
  glibcVersion,
  nodeVersion,
  pnpmVersion,
  kernelInfo,
  targetsRaw,
  ...artifactNames
] = process.argv.slice(2);

function sha256File(filePath) {
  return new Promise((resolvePromise, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

(async () => {
  const artifacts = [];
  const shaLines = [];
  for (const name of artifactNames) {
    const filePath = path.join(distDir, name);
    const sizeBytes = fs.statSync(filePath).size;
    const sha256 = await sha256File(filePath);
    artifacts.push({ name, sizeBytes, sha256 });
    // 与 `sha256sum -c` 兼容的 "hash  filename"（两个空格）格式。
    shaLines.push(`${sha256}  ${name}`);
  }

  fs.writeFileSync(path.join(distDir, "SHA256SUMS"), `${shaLines.join("\n")}\n`, "utf8");
  const manifest = {
    product: "Epoch",
    flavor: "epoch",
    appId: "org.epoch.desktop",
    version,
    targets: targetsRaw.split(",").map((entry) => entry.trim()).filter(Boolean),
    arch,
    commit,
    commitShort,
    buildTime: new Date().toISOString(),
    electronVersion,
    electronBuilderVersion,
    buildMachine: {
      // kernelInfo 已含 “Linux 5.x …” 前缀（uname -sr），避免与 os.type() 重复。
      os: `${kernelInfo} (${os.arch()})`,
      glibc: glibcVersion,
      node: nodeVersion,
      pnpm: pnpmVersion,
    },
    artifacts,
    notes:
      "Skeleton generated by packages/desktop/scripts/linux-release/build-linux-release.sh; " +
      "enrich with release tag, asset URLs and acceptance evidence before publishing (W036).",
  };
  fs.writeFileSync(
    path.join(distDir, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`[linux-release] wrote ${path.join(distDir, "SHA256SUMS")}`);
  console.log(`[linux-release] wrote ${path.join(distDir, "release-manifest.json")}`);
  for (const artifact of artifacts) {
    console.log(
      `[linux-release] ${artifact.name} size=${artifact.sizeBytes} sha256=${artifact.sha256}`,
    );
  }
})().catch((error) => {
  console.error(`[linux-release] manifest generation failed: ${error && error.message}`);
  process.exit(1);
});
NODE

# ---------- 4/4 发布前机械校验 ----------
log "step 4/4: validate-artifacts.mjs（任一检查失败则本脚本非零退出）"
node "${LINUX_RELEASE_DIR}/validate-artifacts.mjs" \
  --dist "${DIST_DIR}" \
  --version "${APP_VERSION}" \
  --arch "$ARCH" \
  --report "${DIST_DIR}/validation-report.json"

log "完成：Epoch ${APP_VERSION} (commit ${GIT_COMMIT_SHORT}) linux ${ARCH} 产物就绪"
log "  dist:      ${DIST_DIR}"
log "  deb:       ${DEB_ARTIFACT}"
log "  AppImage:  ${APPIMAGE_ARTIFACT}"
log "下一步（安装/启动演练，非 root）："
log "  bash packages/desktop/scripts/linux-release/install-launch-check.sh --arch ${ARCH}"
