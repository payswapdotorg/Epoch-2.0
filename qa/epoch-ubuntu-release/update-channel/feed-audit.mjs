#!/usr/bin/env node
/* eslint-disable max-lines -- 发布验收脚本按仓库惯例保持步骤逻辑集中（见 scripts/bundle.mjs）。 */
/**
 * W037-W2 — 静态 feed 审计：从真实构建产物中提取并断言烘烤的更新通道身份。
 *
 * 用法（仓库根执行）：
 *   node qa/epoch-ubuntu-release/update-channel/feed-audit.mjs --deb <path> [--appimage <path>]
 *        [--dist <distDir>] [--resources-dir <dir>] [--out <reportDir>]
 *
 * 断言面（每个产物产出 checks + verdict + blockingFindings，机器可读 JSON + 人类摘要）：
 * - epoch flavor 识别（deb Package=epoch / AppImage 顶层 desktop entry Name=Epoch）；
 * - resources/app-update.yml 必须存在（epoch 产物缺失 = FAIL）；
 * - provider=github 且 owner=payswapdotorg、repo=Epoch-2.0（W037 TL 预集成身份）；
 * - FAIL：generic 占位（provider=generic + localhost URL —— 上游 ZCode flavor 的烘烤形态）、
 *   zcode.z.ai、任何非 Epoch feed、epoch 产物缺失 app-update.yml；
 * - resources 下不得烘烤 dev-app-update.yml；app.asar 索引中也不得出现 dev-app-update.yml
 *   （复用 W036 brand-audit 的 asar/pickle 头解析技术，只读消费 ../lib/asar-scan.mjs）。
 *
 * --resources-dir：对仅含 app-update.yml 的裸目录做同样的断言（合成 PASS/FAIL 路径自测用）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  DEFAULT_EVIDENCE_ROOT,
  EPOCH_FEED,
  absolute,
  log,
  sha256OfFile,
  writeEvidence,
  writeMarkdown,
} from "./lib/common.mjs";
import { listAsarFiles, parseAsarHeader } from "../lib/asar-scan.mjs";

const GENERIC_PLACEHOLDER_HOSTS = ["localhost", "127.0.0.1"];

function usage(exitCode) {
  console.log(
    [
      "用法: node qa/epoch-ubuntu-release/update-channel/feed-audit.mjs --deb <path> [--deb <path2>]",
      "        [--appimage <path>] [--dist <distDir>] [--resources-dir <dir>] [--out <reportDir>]",
      "",
      "  --deb <path>          审计 .deb 产物（可多次）",
      "  --appimage <path>     审计 .AppImage 产物（可多次）",
      "  --dist <dir>          扫描目录下所有 Epoch-*-linux-*.deb/.AppImage（非递归）",
      "  --resources-dir <dir> 对裸 resources 目录（直接含 app-update.yml）执行同样断言（合成自测）",
      "  --out <dir>           报告输出目录（默认 qa/epoch-ubuntu-release/evidence/update-channel）",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { debs: [], appimages: [], dist: null, resourcesDirs: [], out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deb") options.debs.push(argv[++index]);
    else if (arg === "--appimage") options.appimages.push(argv[++index]);
    else if (arg === "--dist") options.dist = argv[++index];
    else if (arg === "--resources-dir") options.resourcesDirs.push(argv[++index]);
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  return options;
}

function collectFromDist(distDir) {
  const found = { debs: [], appimages: [] };
  if (!existsSync(distDir)) return found;
  const names = readdirSync(distDir)
    .filter((name) => /^Epoch-.*-linux-.*\.(deb|AppImage)$/.test(name))
    .sort();
  for (const name of names) {
    if (name.endsWith(".deb")) found.debs.push(join(distDir, name));
    else found.appimages.push(join(distDir, name));
  }
  return found;
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

/** 解析 app-update.yml（扁平 key: value）。 */
function parseAppUpdateYml(text) {
  const parsed = {};
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) parsed[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return parsed;
}

/** 检查一个已解包的 resources 目录（真实产物或合成目录共用核心断言）。 */
function auditResourcesDir(resourcesDir, rec, blockingFindings, warnings, { kind, fileName }) {
  const section = {
    resourcesDir,
    appUpdateYml: null,
    ymlInventory: [],
    asar: { present: null, devAppUpdateListed: null, fileCount: null },
  };
  if (!existsSync(resourcesDir)) {
    rec.add("resources-dir-present", "fail", `resources 目录不存在: ${resourcesDir}`);
    blockingFindings.push({ check: "resources-dir-present", detail: resourcesDir });
    return section;
  }
  rec.add("resources-dir-present", "pass", resourcesDir);

  // resources 下 yml 清单（update 配置面）
  const ymlNames = readdirSync(resourcesDir).filter(
    (name) => /\.ya?ml$/i.test(name) && statSync(join(resourcesDir, name)).isFile(),
  );
  section.ymlInventory = ymlNames;

  const appUpdatePath = join(resourcesDir, "app-update.yml");
  if (!existsSync(appUpdatePath)) {
    rec.add(
      "app-update-present",
      "fail",
      `epoch 产物缺少烘烤的 resources/app-update.yml —— W037 TL 预集成后 epoch flavor 构建必须携带 GitHub provider feed`,
    );
    blockingFindings.push({ check: "app-update-present", detail: "resources/app-update.yml missing" });
    return section;
  }
  rec.add("app-update-present", "pass", appUpdatePath);
  const appUpdateText = readFileSync(appUpdatePath, "utf8");
  const parsed = parseAppUpdateYml(appUpdateText);
  section.appUpdateYml = { path: appUpdatePath, text: appUpdateText, parsed };

  // 1) provider 身份
  if (parsed.provider !== EPOCH_FEED.provider) {
    rec.add(
      "feed-provider-github",
      "fail",
      `app-update.yml provider=${JSON.stringify(parsed.provider ?? null)}（期望 "github" —— payswapdotorg/Epoch-2.0 GitHub Releases）`,
    );
    blockingFindings.push({ check: "feed-provider-github", detail: `provider=${parsed.provider ?? null}` });
  } else {
    rec.add("feed-provider-github", "pass", 'provider="github"');
  }

  // 2) owner/repo（github provider 必备）
  const ownerOk = parsed.owner === EPOCH_FEED.owner;
  const repoOk = parsed.repo === EPOCH_FEED.repo;
  if (!ownerOk || !repoOk) {
    rec.add(
      "feed-owner-repo",
      "fail",
      `app-update.yml owner=${JSON.stringify(parsed.owner ?? null)} repo=${JSON.stringify(parsed.repo ?? null)}（期望 owner=${EPOCH_FEED.owner} repo=${EPOCH_FEED.repo}）`,
    );
    blockingFindings.push({
      check: "feed-owner-repo",
      detail: `owner=${parsed.owner ?? null} repo=${parsed.repo ?? null}`,
    });
  } else {
    rec.add("feed-owner-repo", "pass", `owner=${parsed.owner} repo=${parsed.repo}`);
  }

  // 3) generic 占位（上游 ZCode flavor 的烘烤形态：provider=generic + localhost url）
  const isGenericPlaceholder =
    parsed.provider === "generic" &&
    GENERIC_PLACEHOLDER_HOSTS.some((host) => String(parsed.url ?? "").startsWith(`http://${host}`));
  if (isGenericPlaceholder) {
    rec.add(
      "feed-generic-placeholder",
      "fail",
      `app-update.yml 是 generic 占位（provider=generic url=${parsed.url}）——epoch 产物绝不能携带上游占位 feed`,
    );
    blockingFindings.push({ check: "feed-generic-placeholder", detail: `url=${parsed.url}` });
  } else {
    rec.add(
      "feed-generic-placeholder",
      "pass",
      parsed.provider === "generic" ? "provider=generic 但未命中占位 host" : "非 generic provider（github）",
    );
  }

  // 4) zcode 端点
  if (/zcode\.z\.ai/i.test(appUpdateText)) {
    rec.add("feed-zcode-endpoint", "fail", "app-update.yml 含 zcode.z.ai —— 更新配置不得指向 ZCode 端点");
    blockingFindings.push({ check: "feed-zcode-endpoint", detail: "zcode.z.ai in app-update.yml" });
  } else {
    rec.add("feed-zcode-endpoint", "pass", "app-update.yml 无 zcode.z.ai");
  }

  // 5) dev-app-update.yml 不得烘烤进产物（resources 顶层 + asar 内）
  const devBakedTop = ymlNames.includes("dev-app-update.yml");
  if (devBakedTop) {
    rec.add(
      "dev-app-update-baked",
      "fail",
      "resources 顶层出现 dev-app-update.yml —— dev feed 是仓库内开发文件，不得进入发布产物",
    );
    blockingFindings.push({ check: "dev-app-update-baked", detail: "resources/dev-app-update.yml" });
  }
  const asarPath = join(resourcesDir, "app.asar");
  if (existsSync(asarPath)) {
    section.asar.present = true;
    const header = parseAsarHeader(asarPath);
    if (header.parseError) {
      warnings.push(`app.asar 头解析失败（dev-app-update-in-asar 检查降级为 warn）: ${header.parseError}`);
      rec.add("asar-parse", "warn", header.parseError);
      section.asar.devAppUpdateListed = null;
    } else {
      const files = listAsarFiles(header.index);
      section.asar.fileCount = files.length;
      const devInAsar = files.some((file) => file.path === "dev-app-update.yml");
      section.asar.devAppUpdateListed = devInAsar;
      if (devInAsar) {
        rec.add(
          "dev-app-update-in-asar",
          "fail",
          "app.asar 索引包含 dev-app-update.yml —— dev feed 不得打进包内",
        );
        blockingFindings.push({ check: "dev-app-update-in-asar", detail: "app.asar: dev-app-update.yml" });
      } else if (!devBakedTop) {
        rec.add("dev-app-update-baked", "pass", "resources 与 app.asar 均无 dev-app-update.yml");
      }
    }
  } else {
    section.asar.present = false;
    if (!devBakedTop) {
      rec.add("dev-app-update-baked", "pass", "resources 无 dev-app-update.yml（本目录无 app.asar 可查）");
    }
  }

  // 6) 其余 yml 的更新配置面审查（epoch 产物不得携带第二个指向 zcode/占位的更新 feed）
  for (const name of ymlNames) {
    if (name === "app-update.yml") continue;
    const text = readFileSync(join(resourcesDir, name), "utf8");
    const otherParsed = parseAppUpdateYml(text);
    const hasUpdateShape =
      otherParsed.provider !== undefined || otherParsed.url !== undefined || otherParsed.owner !== undefined;
    if (!hasUpdateShape) continue;
    const suspicious =
      /zcode\.z\.ai/i.test(text) ||
      (otherParsed.provider === "generic" &&
        GENERIC_PLACEHOLDER_HOSTS.some((host) => String(otherParsed.url ?? "").startsWith(`http://${host}`)));
    if (suspicious) {
      rec.add(
        `resources-yml[${name}]`,
        "fail",
        `resources/${name} 携带更新配置形状且指向 zcode/占位 —— 更新配置面必须是唯一 GitHub feed`,
      );
      blockingFindings.push({ check: `resources-yml[${name}]`, detail: `${kind}:${fileName}:${name}` });
    } else {
      warnings.push(`resources/${name} 含 provider/url 字段但未命中 zcode/占位（TL review）`);
    }
  }
  return section;
}

/** epoch flavor 识别（deb Package 字段 / AppImage 顶层 desktop entry Name）。 */
function detectFlavor(kind, extractRoot) {
  if (kind === "deb") {
    const control = spawnSync("dpkg-deb", ["--info", absolute(extractRoot.artifactPath)], {
      encoding: "utf8",
    });
    const packageField = control.stdout?.match(/^\s*Package:\s*(\S+)/m)?.[1] ?? null;
    return { flavor: packageField, via: "dpkg-deb --info Package" };
  }
  const desktopNames = readdirSync(extractRoot.squashRoot).filter((name) => name.endsWith(".desktop"));
  for (const name of desktopNames) {
    const text = readFileSync(join(extractRoot.squashRoot, name), "utf8");
    const nameField = text.match(/^Name=(.*)$/m)?.[1]?.trim() ?? null;
    if (nameField) return { flavor: nameField, via: `squashfs-root/${name} Name=` };
  }
  return { flavor: null, via: "no desktop entry found" };
}

function auditArtifact(path, kind) {
  const artifactAbs = absolute(path);
  const { rec, blockingFindings } = { rec: newChecks(), blockingFindings: [] };
  const warnings = [];
  const result = {
    kind,
    path: artifactAbs,
    fileName: basename(artifactAbs),
    bytes: null,
    sha256: null,
    flavor: null,
    appUpdate: null,
    checks: null,
    verdict: "fail",
    blockingFindings,
    warnings,
  };
  if (!existsSync(artifactAbs)) {
    rec.add("artifact-exists", "fail", `产物不存在: ${artifactAbs}`);
    blockingFindings.push({ check: "artifact-exists", detail: artifactAbs });
    result.checks = rec.checks;
    return result;
  }
  result.bytes = statSync(artifactAbs).size;
  result.sha256 = sha256OfFile(artifactAbs);
  rec.add("artifact-exists", "pass", `${result.bytes} 字节 sha256=${result.sha256}`);

  const runDir = mkdtempSync(join(tmpdir(), "epoch-feed-audit-"));
  try {
    if (kind === "deb") {
      const extract = spawnSync("dpkg-deb", ["-x", artifactAbs, runDir], { encoding: "utf8" });
      if (extract.status !== 0) {
        rec.add("dpkg-extract", "fail", `dpkg-deb -x 退出 ${extract.status}: ${extract.stderr.slice(0, 300)}`);
        blockingFindings.push({ check: "dpkg-extract", detail: `exit ${extract.status}` });
        result.checks = rec.checks;
        return result;
      }
      const flavorInfo = detectFlavor(kind, { artifactPath: artifactAbs });
      result.flavor = flavorInfo;
      if (flavorInfo.flavor !== "epoch") {
        rec.add(
          "epoch-flavor",
          "fail",
          `deb Package=${JSON.stringify(flavorInfo.flavor)}（期望 epoch）—— 本审计只针对 epoch flavor 产物`,
        );
        blockingFindings.push({ check: "epoch-flavor", detail: `Package=${flavorInfo.flavor}` });
      } else {
        rec.add("epoch-flavor", "pass", 'deb Package="epoch"');
      }
      result.appUpdate = auditResourcesDir(
        join(runDir, "opt", "Epoch", "resources"),
        rec,
        blockingFindings,
        warnings,
        { kind, fileName: result.fileName },
      );
    } else {
      chmodSync(artifactAbs, 0o755);
      const extract = spawnSync(artifactAbs, ["--appimage-extract"], {
        cwd: runDir,
        encoding: "utf8",
      });
      if (extract.status !== 0 || !existsSync(join(runDir, "squashfs-root"))) {
        rec.add(
          "appimage-extract",
          "fail",
          `--appimage-extract 退出 ${extract.status}: ${extract.stderr.slice(0, 300)}`,
        );
        blockingFindings.push({ check: "appimage-extract", detail: `exit ${extract.status}` });
        result.checks = rec.checks;
        return result;
      }
      const squashRoot = join(runDir, "squashfs-root");
      const flavorInfo = detectFlavor(kind, { squashRoot });
      result.flavor = flavorInfo;
      if (flavorInfo.flavor !== "Epoch") {
        rec.add(
          "epoch-flavor",
          "fail",
          `AppImage desktop entry Name=${JSON.stringify(flavorInfo.flavor)}（期望 Epoch）`,
        );
        blockingFindings.push({ check: "epoch-flavor", detail: `Name=${flavorInfo.flavor}` });
      } else {
        rec.add("epoch-flavor", "pass", 'desktop entry Name="Epoch"');
      }
      result.appUpdate = auditResourcesDir(join(squashRoot, "resources"), rec, blockingFindings, warnings, {
        kind,
        fileName: result.fileName,
      });
    }
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
  result.checks = rec.checks;
  result.verdict = rec.checks.some((check) => check.status === "fail") ? "fail" : "pass";
  return result;
}

function humanSummary(report) {
  const lines = [];
  lines.push(`# Epoch 更新通道静态 feed 审计 — ${report.verdict.toUpperCase()}`);
  lines.push("");
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- 目标数: ${report.artifacts.length}（pass=${report.counts.pass} / fail=${report.counts.fail}）`);
  lines.push("");
  for (const artifact of report.artifacts) {
    lines.push(`## [${artifact.verdict.toUpperCase()}] ${artifact.kind} — ${artifact.fileName}`);
    lines.push("");
    lines.push(`- 路径: \`${artifact.path}\``);
    lines.push(`- SHA-256: \`${artifact.sha256 ?? "n/a"}\``);
    if (artifact.flavor) {
      lines.push(`- flavor 识别（${artifact.flavor.via}）: \`${artifact.flavor.flavor}\``);
    }
    if (artifact.appUpdate?.appUpdateYml) {
      lines.push("");
      lines.push("```yaml");
      lines.push(artifact.appUpdate.appUpdateYml.text.trim());
      lines.push("```");
    }
    if (artifact.blockingFindings.length > 0) {
      lines.push("");
      lines.push("### Blocking findings");
      for (const finding of artifact.blockingFindings) {
        lines.push(`- [${finding.check}] ${finding.detail}`);
      }
    }
    if (artifact.warnings.length > 0) {
      lines.push("");
      lines.push("### Warnings（不判失败）");
      for (const warning of artifact.warnings) lines.push(`- ${warning}`);
    }
    lines.push("");
    lines.push("| 检查 | 状态 | 说明 |");
    lines.push("| --- | --- | --- |");
    for (const check of artifact.checks) {
      lines.push(`| ${check.id} | ${check.status} | ${check.detail.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let debs = options.debs.map(absolute);
  let appimages = options.appimages.map(absolute);
  if (options.dist) {
    const found = collectFromDist(absolute(options.dist));
    debs = [...new Set([...debs, ...found.debs])];
    appimages = [...new Set([...appimages, ...found.appimages])];
  }
  const artifacts = [];
  for (const path of debs) {
    log("feed-audit", `auditing deb: ${path}`);
    artifacts.push(auditArtifact(path, "deb"));
  }
  for (const path of appimages) {
    log("feed-audit", `auditing appimage: ${path}`);
    artifacts.push(auditArtifact(path, "appimage"));
  }
  // 合成 resources 目录模式（PASS/FAIL 路径自测）
  for (const dir of options.resourcesDirs.map(absolute)) {
    log("feed-audit", `auditing resources-dir: ${dir}`);
    const { rec, blockingFindings } = { rec: newChecks(), blockingFindings: [] };
    const warnings = [];
    const result = {
      kind: "resources-dir",
      path: dir,
      fileName: basename(dir),
      bytes: null,
      sha256: null,
      flavor: { flavor: "synthetic", via: "--resources-dir 模式（合成自测，无 flavor 识别）" },
      appUpdate: null,
      checks: null,
      verdict: "fail",
      blockingFindings,
      warnings,
    };
    result.appUpdate = auditResourcesDir(dir, rec, blockingFindings, warnings, {
      kind: "resources-dir",
      fileName: result.fileName,
    });
    result.checks = rec.checks;
    result.verdict = rec.checks.some((check) => check.status === "fail") ? "fail" : "pass";
    artifacts.push(result);
  }

  if (artifacts.length === 0) {
    console.error("未指定任何目标（--deb / --appimage / --dist / --resources-dir 至少一项）");
    usage(2);
  }

  const counts = {
    pass: artifacts.filter((artifact) => artifact.verdict === "pass").length,
    fail: artifacts.filter((artifact) => artifact.verdict === "fail").length,
  };
  const report = {
    tool: "qa/epoch-ubuntu-release/update-channel/feed-audit.mjs (W037-W2)",
    workOrder: "W037 — Epoch Auto-Update Channel（静态 feed 审计）",
    expectedFeed: EPOCH_FEED,
    generatedAt: new Date().toISOString(),
    artifacts,
    counts,
    verdict: counts.fail > 0 ? "fail" : "pass",
  };

  const outDir = options.out
    ? absolute(options.out)
    : DEFAULT_EVIDENCE_ROOT;
  const jsonPath = writeEvidence(outDir, "feed-audit", report);
  const mdPath = writeMarkdown(outDir, "feed-audit", humanSummary(report));

  console.log("");
  for (const artifact of artifacts) {
    const tag = artifact.verdict === "pass" ? "PASS" : "FAIL";
    console.log(`[feed-audit] ${tag} ${artifact.kind} ${artifact.fileName}`);
    for (const finding of artifact.blockingFindings) {
      console.log(`[feed-audit]   ✗ [${finding.check}] ${finding.detail}`);
    }
    for (const warning of artifact.warnings) {
      console.log(`[feed-audit]   ⚠ ${warning}`);
    }
  }
  console.log("");
  console.log(`[feed-audit] verdict: ${report.verdict.toUpperCase()} (${counts.pass} pass / ${counts.fail} fail)`);
  console.log(`[feed-audit] report: ${jsonPath}`);
  console.log(`[feed-audit] summary: ${mdPath}`);
  process.exit(report.verdict === "pass" ? 0 : 1);
}

main();
