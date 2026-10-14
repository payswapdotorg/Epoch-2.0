#!/usr/bin/env node
/**
 * W036-W3 — Epoch Ubuntu 发布产物品牌审计（CLI 入口）。
 *
 * 用法（仓库根执行）：
 *   node qa/epoch-ubuntu-release/brand-audit.mjs --deb <path> [--deb <path2>]
 *        [--appimage <path>] [--dist <distDir>] [--out <reportDir>] [--skip-asar-scan]
 *
 * - --dist <dir>：扫描目录（非递归）下的 Epoch-*-linux-*.deb / .AppImage；
 * - 报告写入 <out>/brand-audit.json + brand-audit.md（默认 qa/epoch-ubuntu-release/evidence/）；
 * - 失败（任一产物存在 fail 检查）时退出码非 0，并列出精确 blocking findings；
 * - --skip-asar-scan：显式跳过 app.asar 内身份/显著字符串扫描（报告记录
 *   skipped-asar-scan；正常发布门不应使用）。
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { auditDeb, auditAppImage } from "./lib/brand-audit-core.mjs";

function usage(exitCode) {
  const text = [
    "用法: node qa/epoch-ubuntu-release/brand-audit.mjs --deb <path> [--deb <path2>] [--appimage <path>] [--dist <dir>] [--out <dir>] [--skip-asar-scan]",
    "",
    "  --deb <path>          审计 .deb 产物（可多次）",
    "  --appimage <path>     审计 .AppImage 产物（可多次）",
    "  --dist <dir>          扫描目录下所有 Epoch-*-linux-*.deb/.AppImage（非递归）",
    "  --out <dir>           报告输出目录（默认 qa/epoch-ubuntu-release/evidence）",
    "  --skip-asar-scan      显式跳过 app.asar 内身份/显著字符串扫描（记录 skipped-asar-scan）",
  ].join("\n");
  console.log(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { debs: [], appimages: [], dist: null, out: null, skipAsarScan: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deb") options.debs.push(argv[++index]);
    else if (arg === "--appimage") options.appimages.push(argv[++index]);
    else if (arg === "--dist") options.dist = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--skip-asar-scan") options.skipAsarScan = true;
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  return options;
}

/** --dist 目录扫描：收集 Epoch-*-linux-*.deb 与 *.AppImage（去重、按文件名排序）。 */
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

function humanSummary(report) {
  const lines = [];
  lines.push(`# Epoch Ubuntu 发布品牌审计 — ${report.verdict.toUpperCase()}`);
  lines.push("");
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- 产物数: ${report.artifacts.length}（pass=${report.counts.pass} / fail=${report.counts.fail}）`);
  lines.push("");
  for (const artifact of report.artifacts) {
    lines.push(`## [${artifact.verdict.toUpperCase()}] ${artifact.kind} — ${artifact.fileName}`);
    lines.push("");
    lines.push(`- 路径: \`${artifact.path}\``);
    lines.push(`- SHA-256: \`${artifact.sha256 ?? "n/a"}\``);
    lines.push(`- 大小: ${artifact.bytes} 字节`);
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
    if (artifact.asar) {
      lines.push("");
      lines.push(`### app.asar（${artifact.asar.scanMode ?? "n/a"}）`);
      if (artifact.asar.skipNote) lines.push(`- ${artifact.asar.skipNote}`);
      if (artifact.asar.rootPackage) {
        lines.push(
          `- 根 package.json: name=${artifact.asar.rootPackage.name} productName=${artifact.asar.rootPackage.productName}`,
        );
      }
      if (artifact.asar.rendererTitle !== null) {
        lines.push(`- out/renderer/index.html <title>: ${JSON.stringify(artifact.asar.rendererTitle)}`);
      }
      const exceptionEntries = Object.entries(artifact.asar.exceptionCounts ?? {});
      if (exceptionEntries.length > 0) {
        lines.push("- 允许例外命中: " + exceptionEntries.map(([id, n]) => `${id}=${n}`).join(", "));
      }
      if ((artifact.asar.reviewItems ?? []).length > 0) {
        lines.push("- Review 项（TL 裁量，不判失败；⚠=优先 review）：");
        for (const item of artifact.asar.reviewItems) {
          lines.push(
            `- ${item.priority ? "⚠ [priority] " : ""}${item.file}: ${item.snippet}${item.reason ? `（${item.reason}）` : ""}`,
          );
        }
      }
    }
    lines.push("");
    lines.push("### 检查明细");
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

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");

function main() {
  const options = parseArgs(process.argv.slice(2));
  let debs = options.debs.map((path) => (isAbsolute(path) ? path : resolve(process.cwd(), path)));
  let appimages = options.appimages.map((path) =>
    isAbsolute(path) ? path : resolve(process.cwd(), path),
  );
  if (options.dist) {
    const distDir = isAbsolute(options.dist) ? options.dist : resolve(process.cwd(), options.dist);
    const found = collectFromDist(distDir);
    debs = [...new Set([...debs, ...found.debs])];
    appimages = [...new Set([...appimages, ...found.appimages])];
  }
  if (debs.length === 0 && appimages.length === 0) {
    console.error("未指定任何产物（--deb / --appimage / --dist 至少一项）");
    usage(2);
  }

  const artifacts = [];
  for (const path of debs) {
    console.log(`[brand-audit] auditing deb: ${path}`);
    artifacts.push(auditDeb(path, { skipAsarScan: options.skipAsarScan }));
  }
  for (const path of appimages) {
    console.log(`[brand-audit] auditing appimage: ${path}`);
    artifacts.push(auditAppImage(path, { skipAsarScan: options.skipAsarScan }));
  }

  const counts = {
    pass: artifacts.filter((artifact) => artifact.verdict === "pass").length,
    fail: artifacts.filter((artifact) => artifact.verdict === "fail").length,
  };
  const report = {
    tool: "qa/epoch-ubuntu-release/brand-audit.mjs (W036-W3)",
    workOrder: "W036 — Ubuntu Epoch Desktop Release",
    generatedAt: new Date().toISOString(),
    skippedAsarScan: options.skipAsarScan,
    artifacts,
    counts,
    verdict: counts.fail > 0 ? "fail" : "pass",
  };

  const outDir = options.out
    ? isAbsolute(options.out)
      ? options.out
      : resolve(process.cwd(), options.out)
    : resolve(REPO_ROOT, "qa/epoch-ubuntu-release/evidence");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "brand-audit.json");
  const mdPath = join(outDir, "brand-audit.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, humanSummary(report), "utf8");

  // 人类可读摘要打到 stdout（逐产物 verdict + blocking findings）。
  console.log("");
  for (const artifact of artifacts) {
    const tag = artifact.verdict === "pass" ? "PASS" : "FAIL";
    console.log(`[brand-audit] ${tag} ${artifact.kind} ${artifact.fileName} (sha256=${artifact.sha256})`);
    for (const finding of artifact.blockingFindings) {
      console.log(`[brand-audit]   ✗ [${finding.check}] ${finding.detail}`);
    }
    for (const warning of artifact.warnings) {
      console.log(`[brand-audit]   ⚠ ${warning}`);
    }
  }
  console.log("");
  console.log(`[brand-audit] verdict: ${report.verdict.toUpperCase()} (${counts.pass} pass / ${counts.fail} fail)`);
  console.log(`[brand-audit] report: ${jsonPath}`);
  console.log(`[brand-audit] summary: ${mdPath}`);

  process.exit(report.verdict === "pass" ? 0 : 1);
}

main();
