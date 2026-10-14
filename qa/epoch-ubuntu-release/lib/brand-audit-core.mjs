/* eslint-disable max-lines -- the repo convention for long release scripts (see scripts/bundle.mjs); the journey/audit keep their step logic together on purpose. */
/**
 * W036-W3 — 打包产物品牌审计核心（.deb 与 .AppImage）。
 *
 * 检查面（每个产物产出 checks 数组 + verdict + blockingFindings）：
 * - 文件名规则 / 存在 / 非空 / SHA-256；
 * - deb：dpkg-deb --info（Package 必须为 epoch；Description 不得以 ZCode 为产品名；
 *   Maintainer 缺失即失败，含 ZCode 记 warning——上游联系方式属署名例外）；
 * - deb：dpkg-deb --contents + 解包校验（/opt/Epoch/epoch 可执行位、epoch.desktop、
 *   hicolor 各尺寸 apps/epoch.png、resources/app.asar 存在）；
 * - AppImage：--appimage-extract 解包（无需 FUSE），AppRun 可执行位、顶层 epoch.desktop
 *   （Name=Epoch / Icon=epoch / Exec 含 AppRun 或 epoch）、.DirIcon / epoch.png、app.asar；
 * - app.asar 身份与显著字符串扫描（无依赖；可选 --skip-asar-scan 显式跳过并记录）：
 *   根 package.json productName 必须为 Epoch（app.getName() 来源）；
 *   out/renderer/index.html <title> 必须为 Epoch（窗口标题来源）；
 *   out/** + 根 package.json 中显著 ZCode chrome 字面量 → 违规。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { openSync, closeSync, readSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  ARTIFACT_NAME_PATTERN,
  DEB_LAYOUT,
  EPOCH_IDENTITY,
  VALID_DESKTOP_CATEGORIES,
  classifyTextContent,
} from "./brand-rules.mjs";
import { scanAsarOwnCode } from "./asar-scan.mjs";

const READ_CHUNK = 1024 * 1024;

/** 采集命令输出（同步；审计命令均为短命工具）。 */
function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error) : null,
  };
}

/** 同步 sha256（审计产物 <2GB，分块同步读）。 */
function sha256Sync(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(READ_CHUNK);
    for (;;) {
      const read = readSync(fd, buffer, 0, READ_CHUNK, null);
      if (read <= 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

/** 解析 dpkg-deb --info 的控制字段（输出整体缩进 1 空格；含 Description 续行）。 */
function parseDpkgInfo(stdout) {
  const fields = {};
  let current = null;
  for (const rawLine of stdout.split("\n")) {
    // dpkg-deb --info 会给整个字段块加 1 个前导空格；先剥掉再解析。
    let line = rawLine.replace(/\r$/, "");
    if (line.startsWith(" ")) line = line.slice(1);
    if (/^[ \t]/.test(line) && current) {
      fields[current] = `${fields[current] ?? ""}\n${line.trim()}`;
      continue;
    }
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (match) {
      current = match[1];
      fields[current] = match[2];
    } else if (line.trim() === "") {
      current = null;
    }
  }
  return fields;
}

/** 解析 .desktop INI（扁平 Key=Value，忽略注释/分组头；同名键取首个）。 */
function parseDesktopEntry(text) {
  const entry = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in entry)) entry[key] = value;
  }
  return entry;
}

function newChecks() {
  const checks = [];
  return {
    checks,
    add(id, status, detail) {
      checks.push({ id, status, detail });
    },
  };
}

function pushFinding(list, checkId, detail) {
  list.push({ check: checkId, detail });
}

/** 产物级公共检查：文件名规则 / 存在 / 非空 / sha256。 */
function auditArtifactBasics(path) {
  const rec = newChecks();
  const blockingFindings = [];
  const warnings = [];
  const name = basename(path);
  const nameMatch = name.match(ARTIFACT_NAME_PATTERN);
  rec.add(
    "artifact-name-pattern",
    nameMatch ? "pass" : "fail",
    nameMatch
      ? `文件名符合 Epoch-<version>-linux-<arch> 规则（version=${nameMatch[1]}，arch=${nameMatch[2]}）`
      : `文件名不符合规则（期望 ^Epoch-<version>-linux-(x64|amd64|x86_64|arm64|aarch64)(_TEST)?\\.(deb|AppImage)$）：${name}`,
  );
  if (!nameMatch) pushFinding(blockingFindings, "artifact-name-pattern", name);
  if (nameMatch?.groups === undefined && nameMatch?.[3] === "_TEST") {
    warnings.push("文件名带 _TEST 后缀（测试后端构建）——发布产物应为生产后端构建");
  }
  if (!existsSync(path)) {
    rec.add("artifact-exists", "fail", `产物不存在: ${path}`);
    pushFinding(blockingFindings, "artifact-exists", path);
    return { rec, blockingFindings, warnings, bytes: 0, sha256: null };
  }
  const stats = statSync(path);
  if (stats.size < 1024 * 1024) {
    rec.add("artifact-nonempty", "fail", `产物过小（${stats.size} 字节）`);
    pushFinding(blockingFindings, "artifact-nonempty", `${path} (${stats.size}B)`);
  } else {
    rec.add("artifact-nonempty", "pass", `${stats.size} 字节`);
  }
  const sha256 = sha256Sync(path);
  rec.add("artifact-sha256", "pass", sha256);
  return { rec, blockingFindings, warnings, bytes: stats.size, sha256 };
}

/** 元数据文本（Description / Comment）中的显著 ZCode 产品引用检查。 */
function checkMetadataProminence(rec, blockingFindings, label, value) {
  if (!value) return;
  const classification = classifyTextContent(value);
  for (const violation of classification.violations) {
    rec.add(
      `${label}-prominence`,
      "fail",
      `${label} 中出现显著 ZCode 产品引用（${violation.patternId}）：${violation.snippet}`,
    );
    pushFinding(blockingFindings, `${label}-prominence`, `${label}: ${violation.snippet}`);
  }
}

/** app.asar 身份 + 显著字符串扫描（deb/AppImage 共用）。 */
function auditAsar(rec, blockingFindings, warnings, asarPath, { skipAsarScan }) {
  const section = {
    present: existsSync(asarPath),
    path: asarPath,
    scanMode: null,
    skipNote: null,
    rootPackage: null,
    rendererTitle: null,
    violations: [],
    exceptionCounts: {},
    reviewItems: [],
  };
  if (!section.present) {
    rec.add("asar-present", "fail", `app.asar 缺失: ${asarPath}`);
    pushFinding(blockingFindings, "asar-present", asarPath);
    return section;
  }
  rec.add("asar-present", "pass", asarPath);

  if (skipAsarScan) {
    section.scanMode = "skipped";
    section.skipNote =
      "skipped-asar-scan（调用方显式 --skip-asar-scan；包内身份与显著字符串未验证）";
    rec.add("asar-scan", "warn", section.skipNote);
    warnings.push(section.skipNote);
    return section;
  }

  const scan = scanAsarOwnCode(asarPath);
  section.scanMode = scan.mode;
  section.rootPackage = scan.rootPackage;
  section.rendererTitle = scan.rendererTitle;
  section.violations = scan.violations;
  section.exceptionCounts = scan.exceptionCounts;
  section.reviewItems = scan.reviewItems;

  if (scan.parseError) {
    rec.add("asar-scan", "fail", `asar 头解析失败，无法验证包内身份：${scan.parseError}`);
    pushFinding(blockingFindings, "asar-scan", scan.parseError);
    return section;
  }

  // 1) 根 package.json：Electron app.getName() 的来源（productName 优先于 name）。
  if (!scan.rootPackage) {
    rec.add("asar-root-package", "fail", "无法读取 app.asar 根 package.json（缺失或损坏）");
    pushFinding(blockingFindings, "asar-root-package", "package.json unreadable");
  } else {
    const { productName, name, description } = scan.rootPackage;
    if (productName !== EPOCH_IDENTITY.productName) {
      rec.add(
        "asar-root-productName",
        "fail",
        `根 package.json productName=${JSON.stringify(productName)}（期望 "Epoch"）——这是打包态 app.getName() 的初值来源（运行期 app.setName 会覆盖；修复：electron-builder.config.js extraMetadata 增加 productName，或 Worker 2 更新 packages/desktop/package.json）`,
      );
      pushFinding(blockingFindings, "asar-root-productName", `productName=${productName}`);
    } else {
      rec.add("asar-root-productName", "pass", 'productName="Epoch"');
    }
    // name 是内部 scoped 包名（@zcode/desktop），属允许例外，仅记录。
    rec.add("asar-root-package-name", "pass", `name=${name ?? "null"}（内部命名空间，允许）`);
    if (description) {
      checkMetadataProminence(rec, blockingFindings, "asar-root-description", description);
    }
  }

  // 2) renderer 入口标题：窗口标题来源（document.title → BrowserWindow 标题）。
  if (typeof scan.rendererTitle !== "string") {
    rec.add(
      "asar-renderer-title",
      "fail",
      "无法读取 out/renderer/index.html <title>（窗口标题来源）",
    );
    pushFinding(blockingFindings, "asar-renderer-title", "index.html <title> unreadable");
  } else if (scan.rendererTitle !== EPOCH_IDENTITY.productName) {
    rec.add(
      "asar-renderer-title",
      "fail",
      `out/renderer/index.html <title>=${JSON.stringify(scan.rendererTitle)}（期望 "Epoch"）——document.title 决定窗口标题`,
    );
    pushFinding(blockingFindings, "asar-renderer-title", `<title>=${scan.rendererTitle}`);
  } else {
    rec.add("asar-renderer-title", "pass", '<title>="Epoch"');
  }

  // 3) 显著 ZCode chrome 字面量（out/** + 根 package.json）。
  if (scan.violations.length > 0) {
    for (const violation of scan.violations.slice(0, 40)) {
      rec.add(`asar-chrome[${violation.patternId}]`, "fail", `${violation.file}: ${violation.snippet}`);
    }
    pushFinding(
      blockingFindings,
      "asar-prominent-chrome",
      `${scan.violations.length} 处显著 ZCode chrome 字面量（首条：${scan.violations[0].file}: ${scan.violations[0].snippet}）`,
    );
    if (scan.violations.length > 40) {
      warnings.push(`显著字符串违规共 ${scan.violations.length} 条，报告截断至 40 条`);
    }
  } else {
    rec.add(
      "asar-prominent-chrome",
      "pass",
      `自有代码范围扫描 ${scan.scannedFiles} 个文件，0 违规（跳过二进制 ${scan.skippedBinary}，超限 ${scan.skippedOversize}，范围外 ${scan.outOfScope}）`,
    );
  }
  return section;
}

/** 校验 desktop entry 字段（Name/Icon/Exec/Categories/Terminal/Comment）。 */
function auditDesktopEntry(rec, blockingFindings, warnings, scope, entry) {
  const name = entry.Name;
  if (name !== EPOCH_IDENTITY.productName) {
    rec.add(`${scope}-desktop-name`, "fail", `Name=${JSON.stringify(name)}（期望 "Epoch"）`);
    pushFinding(blockingFindings, `${scope}-desktop-name`, `Name=${name}`);
  } else {
    rec.add(`${scope}-desktop-name`, "pass", 'Name="Epoch"');
  }
  const icon = entry.Icon;
  if (icon !== EPOCH_IDENTITY.iconName) {
    rec.add(`${scope}-desktop-icon`, "fail", `Icon=${JSON.stringify(icon)}（期望 "epoch"）`);
    pushFinding(blockingFindings, `${scope}-desktop-icon`, `Icon=${icon}`);
  } else {
    rec.add(`${scope}-desktop-icon`, "pass", 'Icon="epoch"');
  }
  if (entry.Exec === undefined) {
    rec.add(`${scope}-desktop-exec`, "fail", "Exec 字段缺失");
    pushFinding(blockingFindings, `${scope}-desktop-exec`, "Exec missing");
  } else {
    const ok =
      scope === "deb"
        ? /\/epoch(\s|$)/.test(entry.Exec)
        : /(^|[/\w])AppRun(\s|$)|(^|[/\w])epoch(\s|$)/.test(entry.Exec);
    if (!ok) {
      rec.add(
        `${scope}-desktop-exec`,
        "fail",
        `Exec=${JSON.stringify(entry.Exec)} 未指向 epoch 可执行（deb 期望含 /opt/Epoch/epoch；AppImage 期望 AppRun/epoch）`,
      );
      pushFinding(blockingFindings, `${scope}-desktop-exec`, `Exec=${entry.Exec}`);
    } else {
      rec.add(`${scope}-desktop-exec`, "pass", `Exec=${entry.Exec}`);
    }
  }
  const categories = (entry.Categories ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const valid = categories.filter((item) => VALID_DESKTOP_CATEGORIES.has(item));
  if (categories.length === 0) {
    rec.add(`${scope}-desktop-categories`, "fail", "Categories 缺失");
    pushFinding(blockingFindings, `${scope}-desktop-categories`, "Categories missing");
  } else if (valid.length === 0) {
    rec.add(
      `${scope}-desktop-categories`,
      "fail",
      `Categories=${entry.Categories} 不含任何 freedesktop 注册主类别`,
    );
    pushFinding(blockingFindings, `${scope}-desktop-categories`, entry.Categories);
  } else if (!valid.includes("Development")) {
    rec.add(
      `${scope}-desktop-categories`,
      "warn",
      `Categories=${entry.Categories} 合法但非 Development（electron-builder.config.js 配置为 Development）`,
    );
    warnings.push(`desktop entry Categories=${entry.Categories}`);
  } else {
    rec.add(`${scope}-desktop-categories`, "pass", `Categories=${entry.Categories}`);
  }
  if (entry.Terminal !== undefined && entry.Terminal !== "false") {
    rec.add(`${scope}-desktop-terminal`, "warn", `Terminal=${entry.Terminal}（期望 false）`);
    warnings.push(`desktop entry Terminal=${entry.Terminal}`);
  }
  if (entry.Comment) {
    checkMetadataProminence(rec, blockingFindings, `${scope}-desktop-comment`, entry.Comment);
  }
}

/** 在目录中定位 desktop entry（返回 { fileName, entry } 或 null）。 */
function findDesktopEntryIn(dir) {
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir).filter((name) => name.endsWith(".desktop"));
  if (names.length === 0) return null;
  const text = readFileSync(join(dir, names[0]), "utf8");
  return { fileName: names[0], entry: parseDesktopEntry(text) };
}

function isExecutableBitSet(path) {
  try {
    return (statSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** dpkg-deb --contents 列表项（每行格式 `权限 属主 大小 日期 ./路径`；提取路径部分）。 */
function debContentsList(stdout) {
  const entries = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(/(?:^|\s)\.\/(.*)$/);
    if (match && match[1]) entries.push(match[1]);
  }
  return entries;
}

function finish(result, rec) {
  result.checks = rec.checks;
  result.verdict = rec.checks.some((check) => check.status === "fail") ? "fail" : "pass";
  return result;
}

/** 审计 .deb。 */
export function auditDeb(path, options) {
  const { rec, blockingFindings, warnings, bytes, sha256 } = auditArtifactBasics(path);
  const result = {
    kind: "deb",
    path,
    fileName: basename(path),
    bytes,
    sha256,
    dpkg: null,
    desktopEntry: null,
    icons: { hicolorMatches: [] },
    executable: null,
    asar: null,
    checks: null,
    verdict: "fail",
    blockingFindings,
    warnings,
  };
  if (!existsSync(path)) {
    return finish(result, rec);
  }

  // 1) dpkg-deb --info
  const info = runCapture("dpkg-deb", ["--info", path]);
  if (info.code !== 0) {
    rec.add("dpkg-info", "fail", `dpkg-deb --info 退出 ${info.code}: ${info.stderr.slice(0, 300)}`);
    pushFinding(blockingFindings, "dpkg-info", `exit ${info.code}`);
    return finish(result, rec);
  }
  const fields = parseDpkgInfo(info.stdout);
  result.dpkg = {
    package: fields.Package ?? null,
    version: fields.Version ?? null,
    architecture: fields.Architecture ?? null,
    maintainer: fields.Maintainer ?? null,
    description: fields.Description ?? null,
    homepage: fields.Homepage ?? null,
  };
  if (fields.Package !== EPOCH_IDENTITY.packageName) {
    rec.add("dpkg-package", "fail", `Package=${JSON.stringify(fields.Package)}（期望 "epoch"）`);
    pushFinding(blockingFindings, "dpkg-package", `Package=${fields.Package}`);
  } else {
    rec.add("dpkg-package", "pass", 'Package="epoch"');
  }
  if (!fields.Maintainer) {
    rec.add("dpkg-maintainer", "fail", "Maintainer 缺失（deb 元数据必须可解析）");
    pushFinding(blockingFindings, "dpkg-maintainer", "missing");
  } else if (/zcode/i.test(fields.Maintainer)) {
    // 上游联系方式：法定署名例外（不判失败）；提示 TL 可在发布元数据中改为 Epoch 方向。
    rec.add(
      "dpkg-maintainer",
      "warn",
      `Maintainer=${fields.Maintainer} 含 ZCode——按上游署名例外放行；建议发布元数据改为 Epoch 方向`,
    );
    warnings.push(`deb Maintainer=${fields.Maintainer}（上游署名例外，warn）`);
  } else {
    rec.add("dpkg-maintainer", "pass", `Maintainer=${fields.Maintainer}`);
  }
  if (fields.Description) {
    checkMetadataProminence(rec, blockingFindings, "dpkg-description", fields.Description);
  }
  if (fields.Architecture && fields.Architecture !== "amd64") {
    warnings.push(`deb Architecture=${fields.Architecture}（x86_64 目标为 amd64）`);
  }

  // 2) dpkg-deb --contents
  const contents = runCapture("dpkg-deb", ["--contents", path]);
  if (contents.code !== 0) {
    rec.add("dpkg-contents", "fail", `dpkg-deb --contents 退出 ${contents.code}`);
    pushFinding(blockingFindings, "dpkg-contents", `exit ${contents.code}`);
    return finish(result, rec);
  }
  const files = debContentsList(contents.stdout);
  if (!files.includes(DEB_LAYOUT.executable)) {
    rec.add(
      "deb-executable-path",
      "fail",
      `数据段缺少 ${DEB_LAYOUT.executable}（electron-builder Linux 默认 /opt/${EPOCH_IDENTITY.productName}/${EPOCH_IDENTITY.executableName}）`,
    );
    pushFinding(blockingFindings, "deb-executable-path", DEB_LAYOUT.executable);
  } else {
    rec.add("deb-executable-path", "pass", `/${DEB_LAYOUT.executable}`);
  }
  if (!files.includes(DEB_LAYOUT.asar)) {
    rec.add("deb-asar-path", "fail", `数据段缺少 ${DEB_LAYOUT.asar}`);
    pushFinding(blockingFindings, "deb-asar-path", DEB_LAYOUT.asar);
  } else {
    rec.add("deb-asar-path", "pass", `/${DEB_LAYOUT.asar}`);
  }
  const hicolorMatches = files.filter((item) =>
    /^usr\/share\/icons\/hicolor\/[^/]+\/apps\/epoch\.png$/.test(item),
  );
  result.icons.hicolorMatches = hicolorMatches;
  if (hicolorMatches.length === 0) {
    rec.add(
      "deb-hicolor-icons",
      "fail",
      "未安装 usr/share/icons/hicolor/*/apps/epoch.png（Icon=epoch 需要按该名字命中 hicolor）",
    );
    pushFinding(blockingFindings, "deb-hicolor-icons", "hicolor/*/apps/epoch.png missing");
  } else {
    rec.add("deb-hicolor-icons", "pass", hicolorMatches.join(", "));
  }
  const desktopEntries = files.filter(
    (item) => item.startsWith("usr/share/applications/") && item.endsWith(".desktop"),
  );
  if (
    desktopEntries.length !== 1 ||
    desktopEntries[0] !== `usr/share/applications/${EPOCH_IDENTITY.desktopEntryName}`
  ) {
    rec.add(
      "deb-desktop-entry-file",
      "fail",
      `desktop entry 应为唯一文件 usr/share/applications/${EPOCH_IDENTITY.desktopEntryName}，实际: ${desktopEntries.join(", ") || "无"}`,
    );
    pushFinding(blockingFindings, "deb-desktop-entry-file", desktopEntries.join(", ") || "none");
  } else {
    rec.add(
      "deb-desktop-entry-file",
      "pass",
      `usr/share/applications/${EPOCH_IDENTITY.desktopEntryName}`,
    );
  }

  // 3) 解包到临时目录做内容级校验
  const extractDir = mkdtempSync(join(tmpdir(), "epoch-brand-deb-"));
  try {
    const extract = runCapture("dpkg-deb", ["-x", path, extractDir]);
    if (extract.code !== 0) {
      rec.add("dpkg-extract", "fail", `dpkg-deb -x 退出 ${extract.code}: ${extract.stderr.slice(0, 300)}`);
      pushFinding(blockingFindings, "dpkg-extract", `exit ${extract.code}`);
      return finish(result, rec);
    }
    const executableAbs = join(extractDir, DEB_LAYOUT.executable);
    if (existsSync(executableAbs)) {
      result.executable = {
        path: DEB_LAYOUT.executable,
        executableBit: isExecutableBitSet(executableAbs),
      };
      if (!result.executable.executableBit) {
        rec.add("deb-executable-bit", "fail", `${DEB_LAYOUT.executable} 缺少可执行位`);
        pushFinding(blockingFindings, "deb-executable-bit", DEB_LAYOUT.executable);
      } else {
        rec.add("deb-executable-bit", "pass", "可执行位 0o111");
      }
    }
    const desktop = findDesktopEntryIn(join(extractDir, "usr", "share", "applications"));
    if (!desktop) {
      rec.add("deb-desktop-entry", "fail", "解包目录中找不到 usr/share/applications/*.desktop");
      pushFinding(blockingFindings, "deb-desktop-entry", "desktop entry missing in data");
    } else {
      result.desktopEntry = { fileName: desktop.fileName, fields: desktop.entry };
      auditDesktopEntry(rec, blockingFindings, warnings, "deb", desktop.entry);
    }
    const asarAbs = join(extractDir, DEB_LAYOUT.asar);
    result.asar = auditAsar(rec, blockingFindings, warnings, asarAbs, options);
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
  return finish(result, rec);
}

/** 审计 .AppImage。 */
export function auditAppImage(path, options) {
  const { rec, blockingFindings, warnings, bytes, sha256 } = auditArtifactBasics(path);
  const result = {
    kind: "appimage",
    path,
    fileName: basename(path),
    bytes,
    sha256,
    appimage: { extractExitCode: null },
    desktopEntry: null,
    icons: { topLevelPng: [], dirIcon: false },
    executable: null,
    asar: null,
    checks: null,
    verdict: "fail",
    blockingFindings,
    warnings,
  };
  if (!existsSync(path)) {
    return finish(result, rec);
  }

  // AppImage type-2 runtime 支持 --appimage-extract（不需要 FUSE）；解包到临时目录。
  chmodSync(path, 0o755);
  const extractDir = mkdtempSync(join(tmpdir(), "epoch-brand-ai-"));
  const squashRoot = join(extractDir, "squashfs-root");
  try {
    const extract = runCapture(path, ["--appimage-extract"], { cwd: extractDir });
    result.appimage.extractExitCode = extract.code;
    if (extract.code !== 0 || !existsSync(squashRoot)) {
      rec.add(
        "appimage-extract",
        "fail",
        `--appimage-extract 退出 ${extract.code}（stderr: ${extract.stderr.slice(0, 300)}）`,
      );
      pushFinding(blockingFindings, "appimage-extract", `exit ${extract.code}`);
      return finish(result, rec);
    }
    rec.add("appimage-extract", "pass", "squashfs-root 解包成功");

    const appRun = join(squashRoot, "AppRun");
    if (!existsSync(appRun)) {
      rec.add("appimage-apprun", "fail", "AppRun 缺失");
      pushFinding(blockingFindings, "appimage-apprun", "AppRun missing");
    } else if (!isExecutableBitSet(appRun)) {
      rec.add("appimage-apprun-bit", "fail", "AppRun 缺少可执行位");
      pushFinding(blockingFindings, "appimage-apprun-bit", "AppRun");
    } else {
      rec.add("appimage-apprun", "pass", "AppRun 存在且可执行");
    }

    const desktop = findDesktopEntryIn(squashRoot);
    if (!desktop) {
      rec.add("appimage-desktop-entry", "fail", "squashfs-root 顶层缺少 .desktop 文件");
      pushFinding(blockingFindings, "appimage-desktop-entry", "top-level .desktop missing");
    } else {
      result.desktopEntry = { fileName: desktop.fileName, fields: desktop.entry };
      if (desktop.fileName !== EPOCH_IDENTITY.desktopEntryName) {
        rec.add(
          "appimage-desktop-entry-file",
          "fail",
          `desktop 文件名应为 ${EPOCH_IDENTITY.desktopEntryName}，实际 ${desktop.fileName}`,
        );
        pushFinding(blockingFindings, "appimage-desktop-entry-file", desktop.fileName);
      } else {
        rec.add("appimage-desktop-entry-file", "pass", desktop.fileName);
      }
      auditDesktopEntry(rec, blockingFindings, warnings, "appimage", desktop.entry);
    }

    const topLevel = readdirSync(squashRoot);
    const topLevelPng = topLevel.filter((name) => /^epoch\.png$/i.test(name));
    result.icons.topLevelPng = topLevelPng;
    result.icons.dirIcon = topLevel.includes(".DirIcon");
    if (topLevelPng.length === 0) {
      rec.add("appimage-icon-png", "fail", "squashfs-root 顶层缺少 epoch.png");
      pushFinding(blockingFindings, "appimage-icon-png", "epoch.png missing");
    } else {
      rec.add("appimage-icon-png", "pass", topLevelPng.join(", "));
    }
    if (!result.icons.dirIcon) {
      rec.add("appimage-diricon", "fail", ".DirIcon 缺失");
      pushFinding(blockingFindings, "appimage-diricon", ".DirIcon missing");
    } else {
      rec.add("appimage-diricon", "pass", ".DirIcon 存在");
    }
    if (topLevelPng.length === 0 && !existsSync(join(squashRoot, "usr", "share", "icons"))) {
      warnings.push("AppImage 内未发现 epoch.png / hicolor 图标目录");
    }

    result.executable = existsSync(appRun)
      ? { path: "AppRun", executableBit: isExecutableBitSet(appRun) }
      : null;
    const asarAbs = join(squashRoot, "resources", "app.asar");
    result.asar = auditAsar(rec, blockingFindings, warnings, asarAbs, options);
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
  return finish(result, rec);
}
