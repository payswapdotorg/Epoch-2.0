#!/usr/bin/env node
/* eslint-disable max-lines -- the repo convention for long release scripts (see scripts/bundle.mjs); the validator keeps its 33 checks together on purpose. */
/**
 * W036：Epoch Linux 发布产物机械校验器（Node 标准库实现，无第三方依赖）。
 *
 * 输入：dist 目录 + 期望版本/架构（默认 x64）。产物文件名由 electron-builder.config.js
 * 的 artifactName 模板决定：Epoch-<version>-linux-amd64.deb（Debian 架构名）/ Epoch-<version>-linux-x86_64.AppImage（uname 风格）。
 *
 * .deb 检查（dpkg-deb --info / -x）：
 *   - 包名 epoch、Version 精确匹配、Architecture amd64；
 *   - Maintainer 含 Epoch、Homepage 为出包仓库、Description 含 Epoch；
 *   - Depends 覆盖 app-builder-lib 26.8.1 默认集 + 追加的 libgbm1/libasound2
 *     （缺 libgbm1 的 deb 在最小化 Ubuntu 上“安装成功、启动报 libgbm.so.1 缺失”）；
 *   - /usr/share/applications/epoch.desktop：Name=Epoch、Icon=epoch、Exec 指向包内
 *     /opt/Epoch/epoch（去掉 %U 字段码后必须能在解包树中找到且可执行）；
 *   - /usr/share/icons/hicolor/<size>/apps/epoch.png（多尺寸、512 必须存在、PNG 魔数）；
 *   - 主二进制 ELF 魔数 + 可执行位；resources/app.asar 存在。
 *
 * .AppImage 检查：
 *   - 非空、ELF 魔数（AppImage 是带 squashfs 尾部的 ELF）；
 *   - 首选 `--appimage-extract`（自解压，不需要 FUSE；在临时目录执行，产物固定为
 *     ./squashfs-root）；若运行时解压不可用（如 noexec 挂载），回退 unsquashfs -ls
 *     按内嵌 squashfs 偏移只做文件名清单校验（list-only 降级模式，内容类检查跳过
 *     并在报告中标注 degraded）；两者都失败则明确报错；
 *   - 提取模式检查：AppRun、epoch.desktop（Name=Epoch、Icon=epoch）、根目录 epoch
 *     二进制（ELF + 可执行位）、resources/app.asar、usr/share/icons/hicolor/<size>/apps/epoch.png。
 *
 * 两个产物共检：
 *   - dist/SHA256SUMS 存在，且每个产物的实测 sha256 与其中记录一致（文件缺失/哈希
 *     不一致都算失败）；产物大小非零。
 *
 * 报告：机器可读 JSON（--report 指定路径，默认 <dist>/validation-report.json）。
 * 任一检查失败：逐条打印 `FAIL <artifact>/<check-id>: <detail>` 并以非零退出。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Epoch flavor 的期望值（与 electron-builder.config.js / desktop-product-identity.mjs 对齐）。
const EXPECTED = {
  productName: "Epoch",
  packageName: "epoch",
  executableName: "epoch",
  desktopEntryName: "epoch.desktop",
  debArch: "amd64",
  // electron-builder LinuxTargetHelper.installPrefix + sanitizedProductName。
  installPrefix: "/opt/Epoch",
  homepage: "https://github.com/payswapdotorg/Epoch-2.0",
  // app-builder-lib 26.8.1 deb 默认 Depends + 本仓库追加项（electron-builder.config.js）。
  requiredDebDepends: [
    "libgtk-3-0",
    "libnotify4",
    "libnss3",
    "libxss1",
    "libxtst6",
    "xdg-utils",
    "libatspi2.0-0",
    "libuuid1",
    "libsecret-1-0",
    "libgbm1",
    "libasound2",
  ],
};

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function printHelp() {
  console.log(`Epoch Linux 发布产物校验器

用法:
  node packages/desktop/scripts/linux-release/validate-artifacts.mjs \\
    --dist packages/desktop/dist --version <version> --arch x64

参数:
  --dist <dir>        产物目录（默认 packages/desktop/dist）
  --version <v>       期望版本（默认自动从根 package.json 读取）
  --arch <x64>        期望架构，目前仅支持 x64（deb 内为 amd64）
  --report <path>     校验报告 JSON 输出路径（默认 <dist>/validation-report.json）
`);
}

function parseArgs(argv) {
  const options = { dist: null, version: null, arch: "x64", report: null };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "--dist") {
      options.dist = argv[++index];
    } else if (arg.startsWith("--dist=")) {
      options.dist = arg.slice("--dist=".length);
    } else if (arg === "--version") {
      options.version = argv[++index];
    } else if (arg.startsWith("--version=")) {
      options.version = arg.slice("--version=".length);
    } else if (arg === "--arch") {
      options.arch = argv[++index];
    } else if (arg.startsWith("--arch=")) {
      options.arch = arg.slice("--arch=".length);
    } else if (arg === "--report") {
      options.report = argv[++index];
    } else if (arg.startsWith("--report=")) {
      options.report = arg.slice("--report=".length);
    } else {
      positional.push(arg);
    }
  }
  if (!options.dist && positional.length > 0) {
    options.dist = positional[0];
  }
  return options;
}

function isExecutable(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function hasMagic(filePath, magic) {
  // 只读前 N 字节：AppImage 可达数百 MiB，不能为魔数检查整读入内存。
  try {
    const fd = openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(magic.length);
      const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
      return bytesRead === buffer.length && buffer.equals(magic);
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

function sha256File(filePath) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

/** 把检查结果记入 checks，并返回该检查是否通过（detail 供报告与失败输出）。 */
function record(checks, artifact, id, ok, detail) {
  checks.push({ id, ok, detail: detail ?? "" });
  if (!ok) {
    console.error(`[validate-artifacts] FAIL ${artifact}/${id}: ${detail ?? ""}`);
  }
  return ok;
}

function parseDebInfo(stdout) {
  const fields = {};
  for (const line of stdout.split("\n")) {
    // dpkg-deb 1.22 的控制字段带 1 个前导空格（" Package: epoch"），旧版本不带；
    // 两种格式都要兼容，且不能把“size/bytes 等元信息行”误当字段（无冒号或含空格则不匹配）。
    const match = /^\s*([A-Za-z][A-Za-z0-9-]*):\s?(.*)$/.exec(line);
    if (match) {
      fields[match[1]] = match[2].trim();
    }
  }
  return fields;
}

function parseDesktopEntry(content) {
  const entries = {};
  for (const rawLine of content.split("\n")) {
    if (rawLine.startsWith("[") || !rawLine.includes("=")) {
      continue;
    }
    const eqIndex = rawLine.indexOf("=");
    entries[rawLine.slice(0, eqIndex).trim()] = rawLine.slice(eqIndex + 1).trim();
  }
  return entries;
}

/** Exec 值去掉 desktop entry 字段码（%f/%u/%F/%U…）后取第一个 token。 */
function execFirstToken(execValue) {
  const token = execValue.split(/\s+/)[0] ?? "";
  return token.startsWith("%") ? "" : token;
}

function dependsIncludes(dependsLine, name) {
  if (!dependsLine) {
    return false;
  }
  return dependsLine.split(",").some((entry) =>
    entry.split("|").some((alternative) => {
      const depName = alternative.trim().split(/[\s(]/)[0];
      return depName === name;
    }),
  );
}

function findHicolorIcons(rootDir, iconName) {
  const hicolorDir = join(rootDir, "usr", "share", "icons", "hicolor");
  if (!existsSync(hicolorDir)) {
    return [];
  }
  const found = [];
  for (const entry of readdirSync(hicolorDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const iconPath = join(hicolorDir, entry.name, "apps", iconName);
    if (existsSync(iconPath)) {
      found.push({ sizeDir: entry.name, path: iconPath });
    }
  }
  return found;
}

function listDirFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

// ---------------------------------------------------------------------------
// .deb 校验
// ---------------------------------------------------------------------------
async function validateDeb({ debPath, expectedVersion, report }) {
  const checks = [];
  const artifact = "deb";
  const debDir = mkdtempSync(join(tmpdir(), "epoch-validate-deb-"));
  try {
    const sizeBytes = statSync(debPath).size;
    record(
      checks,
      artifact,
      "file-non-empty",
      sizeBytes > 0,
      sizeBytes > 0 ? `${sizeBytes} bytes` : "file is empty",
    );

    const infoResult = run("dpkg-deb", ["--info", debPath]);
    if (record(
      checks,
      artifact,
      "dpkg-deb-info",
      infoResult.status === 0,
      infoResult.status === 0 ? "" : `dpkg-deb --info failed: ${(infoResult.stderr || "").trim()}`,
    ) === false) {
      return finishArtifactReport(report, artifact, debPath, sizeBytes, "dpkg-deb", checks);
    }

    const info = parseDebInfo(infoResult.stdout);
    record(
      checks,
      artifact,
      "package-name",
      info.Package === EXPECTED.packageName,
      `Package: ${info.Package ?? "<missing>"} (expected ${EXPECTED.packageName})`,
    );
    record(
      checks,
      artifact,
      "version",
      info.Version === expectedVersion,
      `Version: ${info.Version ?? "<missing>"} (expected ${expectedVersion})`,
    );
    record(
      checks,
      artifact,
      "architecture",
      info.Architecture === EXPECTED.debArch,
      `Architecture: ${info.Architecture ?? "<missing>"} (expected ${EXPECTED.debArch})`,
    );
    const maintainerOk = /epoch/i.test(info.Maintainer ?? "");
    record(
      checks,
      artifact,
      "maintainer-epoch",
      maintainerOk,
      `Maintainer: ${info.Maintainer ?? "<missing>"}`,
    );
    record(
      checks,
      artifact,
      "homepage",
      info.Homepage === EXPECTED.homepage,
      `Homepage: ${info.Homepage ?? "<missing>"} (expected ${EXPECTED.homepage})`,
    );
    const descriptionOk = (info.Description ?? "").includes(EXPECTED.productName);
    record(
      checks,
      artifact,
      "description-epoch",
      descriptionOk,
      `Description: ${info.Description ?? "<missing>"}`,
    );

    const missingDepends = EXPECTED.requiredDebDepends.filter(
      (name) => !dependsIncludes(info.Depends ?? "", name),
    );
    record(
      checks,
      artifact,
      "depends-runtime",
      missingDepends.length === 0,
      missingDepends.length === 0
        ? `Depends: ${info.Depends}`
        : `missing runtime depends: ${missingDepends.join(", ")}; actual Depends: ${
            info.Depends ?? "<missing>"
          }`,
    );

    // 解包后做文件级检查（dpkg-deb -x 不需要 root）。
    const extractResult = run("dpkg-deb", ["-x", debPath, debDir]);
    if (record(
      checks,
      artifact,
      "dpkg-deb-extract",
      extractResult.status === 0,
      extractResult.status === 0
        ? ""
        : `dpkg-deb -x failed: ${(extractResult.stderr || "").trim()}`,
    ) === false) {
      return finishArtifactReport(report, artifact, debPath, sizeBytes, "dpkg-deb", checks);
    }

    const execPath = join(debDir, "opt", "Epoch", EXPECTED.executableName);
    const execExists = existsSync(execPath);
    record(
      checks,
      artifact,
      "main-binary-present",
      execExists,
      execExists ? execPath : `missing ${join(EXPECTED.installPrefix, EXPECTED.executableName)} in package`,
    );
    if (execExists) {
      record(
        checks,
        artifact,
        "main-binary-executable",
        isExecutable(execPath),
        `mode check on ${join(EXPECTED.installPrefix, EXPECTED.executableName)}`,
      );
      record(
        checks,
        artifact,
        "main-binary-elf",
        hasMagic(execPath, ELF_MAGIC),
        hasMagic(execPath, ELF_MAGIC) ? "" : "not an ELF executable",
      );
    }

    const asarPath = join(debDir, "opt", "Epoch", "resources", "app.asar");
    record(
      checks,
      artifact,
      "app-asar-present",
      existsSync(asarPath),
      existsSync(asarPath) ? "" : "missing /opt/Epoch/resources/app.asar in package",
    );

    const desktopPath = join(debDir, "usr", "share", "applications", EXPECTED.desktopEntryName);
    if (
      record(
        checks,
        artifact,
        "desktop-entry-present",
        existsSync(desktopPath),
        existsSync(desktopPath)
          ? ""
          : `missing /usr/share/applications/${EXPECTED.desktopEntryName} in package`,
      )
    ) {
      const desktop = parseDesktopEntry(readFileSync(desktopPath, "utf8"));
      record(
        checks,
        artifact,
        "desktop-name",
        desktop.Name === EXPECTED.productName,
        `Name=${desktop.Name ?? "<missing>"} (expected ${EXPECTED.productName})`,
      );
      record(
        checks,
        artifact,
        "desktop-icon",
        desktop.Icon === EXPECTED.executableName,
        `Icon=${desktop.Icon ?? "<missing>"} (expected ${EXPECTED.executableName})`,
      );
      const execToken = execFirstToken(desktop.Exec ?? "");
      const execResolves =
        execToken === join(EXPECTED.installPrefix, EXPECTED.executableName) && existsSync(execPath);
      record(
        checks,
        artifact,
        "desktop-exec-resolves",
        execResolves,
        `Exec=${desktop.Exec ?? "<missing>"} -> ${execToken || "<empty>"} (expected ${join(
          EXPECTED.installPrefix,
          EXPECTED.executableName,
        )} present in package)`,
      );
      const categories = (desktop.Categories ?? "").split(";").filter(Boolean);
      const categoriesOk =
        categories.includes("Science") && categories.includes("Engineering");
      record(
        checks,
        artifact,
        "desktop-categories",
        categoriesOk,
        `Categories=${desktop.Categories ?? "<missing>"} (expected Science;Engineering)`,
      );
      record(
        checks,
        artifact,
        "desktop-comment",
        (desktop.Comment ?? "").includes(EXPECTED.productName),
        `Comment=${desktop.Comment ?? "<missing>"}`,
      );
      record(
        checks,
        artifact,
        "desktop-startup-wm-class",
        desktop.StartupWMClass === EXPECTED.productName,
        `StartupWMClass=${desktop.StartupWMClass ?? "<missing>"} (expected ${EXPECTED.productName})`,
      );
      // MimeType=x-scheme-handler/zcode; 是上游兼容标识（W036 允许例外），只记录不判失败。
      if (desktop.MimeType) {
        checks.push({
          id: "desktop-mimetype-info",
          ok: true,
          detail: `MimeType=${desktop.MimeType} (upstream compatibility scheme, informational)`,
        });
      }
    }

    const icons = findHicolorIcons(debDir, `${EXPECTED.executableName}.png`);
    const has512 = icons.some((icon) => icon.sizeDir === "512x512");
    record(
      checks,
      artifact,
      "hicolor-icons",
      icons.length >= 4 && has512,
      icons.length === 0
        ? "no /usr/share/icons/hicolor/*/apps/epoch.png found in package"
        : `sizes: ${icons.map((icon) => icon.sizeDir).join(", ")}${
            has512 ? "" : " (512x512 missing)"
          }`,
    );
    const icon512 = icons.find((icon) => icon.sizeDir === "512x512");
    if (icon512) {
      record(
        checks,
        artifact,
        "hicolor-icon-512-png",
        hasMagic(icon512.path, PNG_MAGIC),
        hasMagic(icon512.path, PNG_MAGIC) ? "" : "512x512 icon is not a valid PNG",
      );
    }

    return finishArtifactReport(report, artifact, debPath, sizeBytes, "dpkg-deb", checks);
  } finally {
    rmSync(debDir, { force: true, recursive: true });
  }
}

// ---------------------------------------------------------------------------
// .AppImage 校验
// ---------------------------------------------------------------------------
function findSquashfsOffset(appImagePath) {
  // AppImage = ELF runtime + squashfs（"hsqs" 魔数）。偏移通常在 ELF 之后几 KB～几百 KB，
  // 只扫前 4MiB 足够；找不到返回 -1。流式读取，不整读入内存。
  try {
    const fd = openSync(appImagePath, "r");
    try {
      const scanLength = 4 * 1024 * 1024;
      const chunkSize = 1024 * 1024;
      const buffer = Buffer.alloc(chunkSize);
      const needle = Buffer.from("hsqs");
      let scanned = 0;
      while (scanned < scanLength) {
        const toRead = Math.min(chunkSize, scanLength - scanned);
        // readSync 带 position 参数自带定位，无需 lseek。
        const bytesRead = readSync(fd, buffer, 0, toRead, scanned);
        if (bytesRead < needle.length) {
          // EOF 或尾部残余不足魔数长度：既不可能命中，也无法再前进（否则会死循环）。
          break;
        }
        const index = buffer.subarray(0, bytesRead).indexOf(needle);
        if (index >= 0) {
          return scanned + index;
        }
        // 回退 3 字节重叠，避免魔数跨 chunk 读取边界时漏检。
        scanned += bytesRead - needle.length + 1;
      }
      return -1;
    } finally {
      closeSync(fd);
    }
  } catch {
    return -1;
  }
}

async function validateAppImage({ appImagePath, report, notes }) {
  const checks = [];
  const artifact = "appImage";
  const sizeBytes = statSync(appImagePath).size;
  record(
    checks,
    artifact,
    "file-non-empty",
    sizeBytes > 0,
    sizeBytes > 0 ? `${sizeBytes} bytes` : "file is empty",
  );
  record(
    checks,
    artifact,
    "elf-magic",
    hasMagic(appImagePath, ELF_MAGIC),
    hasMagic(appImagePath, ELF_MAGIC) ? "" : "AppImage is not an ELF executable",
  );

  if (!isExecutable(appImagePath)) {
    record(
      checks,
      artifact,
      "executable-bit",
      false,
      "AppImage is not executable (chmod +x required to run)",
    );
    return finishArtifactReport(report, artifact, appImagePath, sizeBytes, "failed", checks);
  }

  // 首选：AppImage 自带 runtime 的 --appimage-extract（不需要 FUSE），解到临时目录。
  const extractDir = mkdtempSync(join(tmpdir(), "epoch-validate-appimage-"));
  try {
    const extractResult = run(appImagePath, ["--appimage-extract"], { cwd: extractDir });
    const extractedRoot = join(extractDir, "squashfs-root");
    if (extractResult.status === 0 && existsSync(extractedRoot)) {
      validateAppImageExtracted(extractedRoot, checks, artifact);
      return finishArtifactReport(report, artifact, appImagePath, sizeBytes, "extract", checks);
    }

    // 回退：unsquashfs 只读清单（运行时解压不可用时，例如宿主环境限制）。
    const extractStderr = `${(extractResult.stderr || extractResult.stdout || "").trim()}`.slice(0, 500);
    const extractFailedReason =
      extractResult.status === 0
        ? "runtime exited 0 but ./squashfs-root was not created (not a real AppImage?)"
        : `exit=${extractResult.status ?? "null"} stderr=${extractStderr}`;
    notes.push(`AppImage --appimage-extract failed: ${extractFailedReason}`);
    const offset = findSquashfsOffset(appImagePath);
    const listResult =
      offset >= 0 ? run("unsquashfs", ["-ls", "-o", String(offset), appImagePath]) : { status: null };
    if (listResult.status === 0) {
      validateAppImageListing(listResult.stdout, checks, artifact);
      notes.push("AppImage validated in list-only mode (unsquashfs -ls); content checks degraded.");
      return finishArtifactReport(report, artifact, appImagePath, sizeBytes, "list-only", checks);
    }

    record(
      checks,
      artifact,
      "appimage-extract",
      false,
      `--appimage-extract failed: ${extractFailedReason}; unsquashfs fallback also unavailable (status=${
        listResult.status ?? "null"
      })`,
    );
    return finishArtifactReport(report, artifact, appImagePath, sizeBytes, "failed", checks);
  } finally {
    rmSync(extractDir, { force: true, recursive: true });
  }
}

function validateAppImageExtracted(rootDir, checks, artifact) {
  const appRunPath = join(rootDir, "AppRun");
  const appRunExists = existsSync(appRunPath);
  record(
    checks,
    artifact,
    "apprun-present",
    appRunExists,
    appRunExists ? "" : "AppRun missing in AppImage root",
  );
  if (appRunExists) {
    // accessSync(X_OK) 会穿透符号链接，AppRun 常是指向入口二进制的符号链接。
    record(
      checks,
      artifact,
      "apprun-executable",
      isExecutable(appRunPath),
      "AppRun must be executable or a symlink to the entrypoint",
    );
  }

  const binaryPath = join(rootDir, EXPECTED.executableName);
  const binaryExists = existsSync(binaryPath);
  record(
    checks,
    artifact,
    "main-binary-present",
    binaryExists,
    binaryExists ? "" : `missing ${EXPECTED.executableName} binary in AppImage root`,
  );
  if (binaryExists) {
    record(
      checks,
      artifact,
      "main-binary-executable",
      isExecutable(binaryPath),
      `${EXPECTED.executableName} must be executable`,
    );
    record(
      checks,
      artifact,
      "main-binary-elf",
      hasMagic(binaryPath, ELF_MAGIC),
      hasMagic(binaryPath, ELF_MAGIC) ? "" : "inner binary is not an ELF executable",
    );
  }

  record(
    checks,
    artifact,
    "app-asar-present",
    existsSync(join(rootDir, "resources", "app.asar")),
    existsSync(join(rootDir, "resources", "app.asar"))
      ? ""
      : "missing resources/app.asar in AppImage",
  );

  const rootDesktopFiles = listDirFiles(rootDir).filter((name) => name.endsWith(".desktop"));
  const preferredName = rootDesktopFiles.includes(EXPECTED.desktopEntryName)
    ? EXPECTED.desktopEntryName
    : rootDesktopFiles[0];
  if (
    record(
      checks,
      artifact,
      "desktop-entry-present",
      Boolean(preferredName),
      rootDesktopFiles.length === 0
        ? "no .desktop file in AppImage root"
        : `desktop file: ${preferredName}`,
    )
  ) {
    const desktop = parseDesktopEntry(readFileSync(join(rootDir, preferredName), "utf8"));
    record(
      checks,
      artifact,
      "desktop-name",
      desktop.Name === EXPECTED.productName,
      `Name=${desktop.Name ?? "<missing>"} (expected ${EXPECTED.productName})`,
    );
    record(
      checks,
      artifact,
      "desktop-icon",
      desktop.Icon === EXPECTED.executableName,
      `Icon=${desktop.Icon ?? "<missing>"} (expected ${EXPECTED.executableName})`,
    );
    record(
      checks,
      artifact,
      "desktop-exec-present",
      Boolean(desktop.Exec),
      `Exec=${desktop.Exec ?? "<missing>"}`,
    );
    const categories = (desktop.Categories ?? "").split(";").filter(Boolean);
    record(
      checks,
      artifact,
      "desktop-categories",
      categories.includes("Science") && categories.includes("Engineering"),
      `Categories=${desktop.Categories ?? "<missing>"} (expected Science;Engineering)`,
    );
  }

  const icons = findHicolorIcons(rootDir, `${EXPECTED.executableName}.png`);
  const rootIconFallback =
    existsSync(join(rootDir, `${EXPECTED.executableName}.png`)) || existsSync(join(rootDir, ".DirIcon"));
  record(
    checks,
    artifact,
    "icons-present",
    icons.length > 0 || rootIconFallback,
    icons.length > 0
      ? `hicolor sizes: ${icons.map((icon) => icon.sizeDir).join(", ")}`
      : rootIconFallback
        ? "root icon symlink(s) present (epoch.png/.DirIcon)"
        : "no icons found in AppImage",
  );
}

function validateAppImageListing(listing, checks, artifact) {
  // unsquashfs -ls 输出行类似 "squashfs-root/AppRun"（前缀随版本可能是目录名或 inode 信息）。
  const names = new Set(
    listing
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("(") && !line.endsWith(":"))
      .map((line) => {
        const marker = line.indexOf("/");
        return marker >= 0 ? line.slice(marker + 1) : line;
      }),
  );
  const has = (name) => names.has(name) || [...names].some((entry) => entry.endsWith(`/${name}`));
  const required = [
    "AppRun",
    EXPECTED.desktopEntryName,
    EXPECTED.executableName,
    "resources/app.asar",
  ];
  const missing = required.filter((name) => !has(name));
  record(
    checks,
    artifact,
    "listing-required-files",
    missing.length === 0,
    missing.length === 0
      ? `required files present in listing (${required.join(", ")})`
      : `missing in AppImage listing: ${missing.join(", ")}`,
  );
  record(
    checks,
    artifact,
    "listing-icons",
    [...names].some(
      (entry) => entry.includes("icons/hicolor/") && entry.endsWith(`/${EXPECTED.executableName}.png`),
    ) ||
      has(`${EXPECTED.executableName}.png`) ||
      has(".DirIcon"),
    "no epoch icons found in AppImage listing",
  );
  // list-only 模式无法读取 desktop entry 内容，Name=/Icon= 检查降级为“无法执行”并显式记录。
  record(
    checks,
    artifact,
    "desktop-content-degraded",
    false,
    "list-only mode: desktop entry Name/Icon content checks skipped (runtime extraction unavailable)",
  );
}

function finishArtifactReport(report, artifact, filePath, sizeBytes, mode, checks) {
  const entry = {
    file: basename(filePath),
    sizeBytes,
    mode,
    ok: checks.every((check) => check.ok),
    checks,
  };
  report.artifacts[artifact] = entry;
  return entry;
}

// ---------------------------------------------------------------------------
// 共检：SHA256SUMS
// ---------------------------------------------------------------------------
async function validateChecksums({ distDir, report }) {
  const checks = [];
  const artifact = "checksums";
  const sumsPath = join(distDir, "SHA256SUMS");
  if (
    record(
      checks,
      artifact,
      "sha256sums-present",
      existsSync(sumsPath),
      existsSync(sumsPath) ? "" : `${sumsPath} missing (run build-linux-release.sh first)`,
    ) === false
  ) {
    report.sharedChecks = checks;
    return checks;
  }

  const entries = new Map();
  for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line.trim());
    if (match) {
      entries.set(match[2], match[1]);
    }
  }
  record(
    checks,
    artifact,
    "sha256sums-parsable",
    entries.size > 0,
    entries.size > 0 ? `${entries.size} entries` : "SHA256SUMS has no parsable entries",
  );

  for (const [artifactKey, artifactEntry] of Object.entries(report.artifacts)) {
    const recorded = entries.get(artifactEntry.file);
    if (
      record(
        checks,
        artifact,
        `sha256-listed-${artifactKey}`,
        Boolean(recorded),
        recorded ? "" : `${artifactEntry.file} not listed in SHA256SUMS`,
      )
    ) {
      const actual = artifactEntry.sha256 ?? (await sha256File(join(distDir, artifactEntry.file)));
      artifactEntry.sha256 = actual;
      record(
        checks,
        artifact,
        `sha256-match-${artifactKey}`,
        actual === recorded,
        actual === recorded
          ? `${artifactEntry.file} sha256 ok`
          : `${artifactEntry.file} sha256 mismatch: SHA256SUMS=${recorded} actual=${actual}`,
      );
    }
  }
  report.sharedChecks = checks;
  return checks;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
  const distDir = resolve(options.dist ?? join(repoRoot, "packages", "desktop", "dist"));
  let expectedVersion = options.version;
  if (!expectedVersion) {
    const rootPackageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    expectedVersion = rootPackageJson.version;
  }

  if (options.arch !== "x64" if (options.arch !== "x64" if (options.arch !== "x64" if (options.arch !== "x64" if (options.arch !== "x64") {if (options.arch !== "x64") { options.arch !== "arm64") {if (options.arch !== "x64") { options.arch !== "arm64") {if (options.arch !== "x64") { options.arch !== "arm64") {if (options.arch !== "x64" if (options.arch !== "x64") {if (options.arch !== "x64") { options.arch !== "arm64") { options.arch !== "arm64") {
    console.error(
      `[validate-artifacts] 仅支持 x64 和 arm64（当前 --arch ${options.arch}）`,
    );
    process.exit(2);
  }

  const debPath = join(distDir, `Epoch-${expectedVersion}-linux-${options.arch === "arm64" ? "arm64" : "amd64"}.deb`);
  const appImagePath = join(distDir, `Epoch-${expectedVersion}-linux-${options.arch === "arm64" ? "aarch64" : "x86_64"}.AppImage`);
  const missingFiles = [
    existsSync(debPath) ? null : debPath,
    existsSync(appImagePath) ? null : appImagePath,
  ].filter(Boolean);
  if (missingFiles.length > 0) {
    console.error(`[validate-artifacts] 产物缺失：\n- ${missingFiles.join("\n- ")}`);
    process.exit(2);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    distDir,
    expected: {
      version: expectedVersion,
      arch: options.arch,
      debArch: EXPECTED.debArch,
      productName: EXPECTED.productName,
      packageName: EXPECTED.packageName,
      executableName: EXPECTED.executableName,
    },
    artifacts: {},
    notes: [],
  };

  const debEntry = await validateDeb({ debPath, expectedVersion, report });
  const appImageEntry = await validateAppImage({
    appImagePath,
    report,
    notes: report.notes,
  });
  const checksumChecks = await validateChecksums({ distDir, report });

  report.ok =
    debEntry.ok && appImageEntry.ok && checksumChecks.every((check) => check.ok);

  const reportPath = resolve(options.report ?? join(distDir, "validation-report.json"));
  mkdirSync(distDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const totalChecks =
    debEntry.checks.length + appImageEntry.checks.length + checksumChecks.length;
  const failedChecks = [
    ...debEntry.checks,
    ...appImageEntry.checks,
    ...checksumChecks,
  ].filter((check) => !check.ok);
  console.log(
    `[validate-artifacts] checks: ${totalChecks - failedChecks.length}/${totalChecks} passed; report: ${reportPath}`,
  );
  if (!report.ok) {
    console.error(
      `[validate-artifacts] 校验失败（${failedChecks.length} 项）：\n- ${failedChecks
        .map((check) => check.id)
        .join("\n- ")}`,
    );
    process.exit(1);
  }
  console.log("[validate-artifacts] Epoch linux 产物校验通过");
}

main().catch((error) => {
  console.error(`[validate-artifacts] ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
