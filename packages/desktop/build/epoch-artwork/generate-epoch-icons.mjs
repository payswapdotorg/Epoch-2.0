#!/usr/bin/env node
/**
 * Epoch 应用图标生成器（W036）— 把本目录的 epoch-icon.svg 光栅化为
 * electron-builder 需要的 Linux 图标集：
 *
 *   build/icons/{16x16,24x24,32x32,48x48,64x64,128x128,256x256,512x512,1024x1024}.png
 *   build/icon.png（1024；安装包内窗口/About 图标源，见 main/about.ts、main/index.ts）
 *
 * 光栅化用 sharp（librsvg）：每个目标尺寸按该尺寸矢量直出（在 SVG 上注入
 * width/height 后交给 librsvg，而不是先渲大图再缩放），16px 下笔画依然锐利；
 * 输出为严格 N×N 的 RGBA PNG（圆角四角透明），脚本内自校验尺寸与 PNG 签名。
 *
 * sharp 解析顺序：仓库内依赖（优先，未来若把 sharp 提为 devDependency 即自动生效）
 * → 本沙箱的全局 npm 安装（/home/z/.npm-global）。当前仓库未依赖 sharp，图标属于
 * 一次性资产（生成后随仓库提交），不在 CI 构建路径上，因此允许工具链在仓库外。
 *
 * 用法（仓库根或本目录均可）：node packages/desktop/build/epoch-artwork/generate-epoch-icons.mjs
 *
 * 注意：icon.ico / icon.icns / icon_windows.png / icon_installer.*（win/mac）不在
 * W036 Worker 1 范围内（Ubuntu 发布），本脚本不触碰。
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);

const ARTWORK_DIR = dirname(new URL(import.meta.url).pathname);
const BUILD_DIR = resolve(ARTWORK_DIR, "..");
const REPO_ROOT = resolve(BUILD_DIR, "../../..");
const SVG_PATH = join(ARTWORK_DIR, "epoch-icon.svg");

/** electron-builder Linux 图标集要求的全部尺寸（与 build/icons/ 现有文件一一对应）。 */
const LINUX_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
/** build/icon.png 既是 electron-builder 的通用 icon 源，也被打包进 resources 供运行时窗口图标使用。 */
const ICON_PNG_SIZE = 1024;

/** 沙箱全局 npm 的 sharp 安装位置（仓库内无 sharp 依赖时的兜底）。 */
const GLOBAL_SHARP_PATHS = [
  "/home/z/.npm-global/lib/node_modules/sharp",
  "/usr/lib/node_modules/sharp",
  "/usr/local/lib/node_modules/sharp",
];

function log(message) {
  console.log(`[epoch-icons] ${message}`);
}

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    for (const candidate of GLOBAL_SHARP_PATHS) {
      if (existsSync(candidate)) {
        return require(candidate);
      }
    }
  }
  throw new Error(
    "sharp not found: install sharp (e.g. `npm i -g sharp`) or add it to the repo devDependencies. Tried require('sharp') and:\n" +
      GLOBAL_SHARP_PATHS.join("\n"),
  );
}

/** 解析 PNG IHDR，校验输出确为 PNG 且尺寸精确。 */
function readPngSize(filePath) {
  const buffer = readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`${filePath} is not a PNG`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * 按目标尺寸矢量直出：给 <svg> 注入显式 width/height，librsvg 直接以该尺寸
 * 光栅化（几何按视口重新映射，不经过位图缩放）。
 */
async function renderIconPng({ sharp, svgSource, size, outputDir, fileName }) {
  const sizedSvg = svgSource.replace("<svg ", `<svg width="${size}" height="${size}" `);
  const pngPath = join(outputDir, fileName);
  await sharp(Buffer.from(sizedSvg, "utf8"), { limitInputPixels: false })
    .png({ compressionLevel: 9 })
    .toFile(pngPath);
  const { width, height } = readPngSize(pngPath);
  if (width !== size || height !== size) {
    throw new Error(`${fileName} expected ${size}x${size} but got ${width}x${height}`);
  }
  return { filePath: pngPath, width, height };
}

async function main() {
  if (!existsSync(SVG_PATH)) {
    throw new Error(`master SVG not found: ${SVG_PATH}`);
  }
  const svgSource = readFileSync(SVG_PATH, "utf8");
  const sharp = loadSharp();
  log(`sharp loaded (version ${sharp.versions?.vips ?? "unknown"} / librsvg)`);

  const iconsDir = join(BUILD_DIR, "icons");
  mkdirSync(iconsDir, { recursive: true });

  // 先渲染到临时目录，全部尺寸校验通过后再落盘，避免半更新状态。
  const scratchDir = join(BUILD_DIR, "epoch-artwork", ".render-tmp");
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });

  const outputs = [];
  for (const size of LINUX_ICON_SIZES) {
    outputs.push(
      await renderIconPng({
        sharp,
        svgSource,
        size,
        outputDir: scratchDir,
        fileName: `${size}x${size}.png`,
      }),
    );
  }
  // build/icon.png 与 1024x1024 同源同尺寸（上游现状即如此），独立渲染保持文件确定性。
  outputs.push(
    await renderIconPng({
      sharp,
      svgSource,
      size: ICON_PNG_SIZE,
      outputDir: scratchDir,
      fileName: "icon.png",
    }),
  );

  for (const output of outputs) {
    const baseName = output.filePath.slice(output.filePath.lastIndexOf("/") + 1);
    const destination = baseName === "icon.png" ? join(BUILD_DIR, "icon.png") : join(iconsDir, baseName);
    rmSync(destination, { force: true });
    writeFileSync(destination, readFileSync(output.filePath));
    log(`wrote ${destination.replace(REPO_ROOT + "/", "")} (${output.width}x${output.height})`);
  }

  rmSync(scratchDir, { recursive: true, force: true });
  log(`done: ${outputs.length} files (9 hicolor sizes + icon.png).`);
}

main().catch((error) => {
  console.error(`[epoch-icons] FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
