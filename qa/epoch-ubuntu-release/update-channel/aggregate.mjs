#!/usr/bin/env node
/**
 * W037-W2 — 更新通道验收聚合器：汇总 feed-audit + 网络断言 + dev 旅程三部分
 * 为 evidence/update-channel/update-channel-report.json（机器可读）与
 * update-channel-summary.md（人类可读），并给出总体裁决。
 *
 * 裁决法（spec/acceptance/epoch-auto-update-channel.md + W036 法）：
 * - 任一检查 fail → 总体 FAIL；
 * - 任一部分 skipped → 总体 FAIL（跳过的关键旅程不得计为通过）；
 * - inconclusive-observation（网络断言观察层无命中）→ 总体 FAIL（无证据 ≠ 通过）。
 *
 * 用法：
 *   node qa/epoch-ubuntu-release/update-channel/aggregate.mjs --out <dir>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { writeEvidence, writeMarkdown } from "./lib/common.mjs";

function usage(exitCode) {
  console.log("用法: node qa/epoch-ubuntu-release/update-channel/aggregate.mjs --out <dir>");
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") options.out = argv[++index];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  if (!options.out) {
    console.error("--out <dir> 必填");
    usage(2);
  }
  return options;
}

function readJsonIf(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { parseError: String(error.message) };
  }
}

function flattenNetworkChecks(networkManifestDir, checks) {
  // network/<modeTag>/manifest.json 每个一份
  let modeTags = [];
  try {
    modeTags = readdirSync(networkManifestDir).filter((name) => {
      const candidate = join(networkManifestDir, name);
      return statSync(candidate).isDirectory() && existsSync(join(candidate, "manifest.json"));
    });
  } catch {
    // 目录不存在 → 无网络断言证据
  }
  if (modeTags.length === 0) {
    checks.push({
      id: "network-assertion",
      kind: "network-assertion",
      status: "skipped",
      summary: `未找到网络断言 manifest（${networkManifestDir} 下无 <mode>/manifest.json）——按验收法 skipped 阻塞总门`,
      reportPath: null,
    });
    return;
  }
  for (const modeTag of modeTags) {
    const manifestPath = join(networkManifestDir, modeTag, "manifest.json");
    const manifest = readJsonIf(manifestPath);
    if (!manifest || manifest.parseError) {
      checks.push({
        id: `network-assertion:${modeTag}`,
        kind: "network-assertion",
        status: "fail",
        summary: `manifest 不可读: ${manifestPath}`,
        reportPath: manifestPath,
      });
      continue;
    }
    const status =
      manifest.verdict === "pass" ? "pass" : manifest.verdict === "inconclusive-observation" ? "skipped" : "fail";
    const failed = (manifest.checks ?? []).filter((check) => check.status === "fail");
    checks.push({
      id: `network-assertion:${modeTag}`,
      kind: "network-assertion",
      mode: modeTag,
      status,
      summary:
        manifest.verdict === "pass"
          ? `真实窗口网络断言通过（epoch feed 命中 ${manifest.traffic?.epochFeedAttempts?.length ?? 0}；zcode 更新尝试 0）`
          : manifest.verdict === "inconclusive-observation"
            ? "观察层无任何命中（inconclusive）—— 无证据不等于通过，按 FAIL 处理"
            : `${failed.length} 项失败：${failed.map((check) => `${check.id}（${(check.detail ?? "").slice(0, 160)}）`).join("；").slice(0, 500)}`,
      reportPath: manifestPath,
      artifact: manifest.artifact?.path ?? null,
      environment: manifest.environment ?? null,
      preFixBuildNote: manifest.preFixBuildNote ?? null,
    });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = isAbsolute(options.out) ? options.out : resolve(process.cwd(), options.out);
  mkdirSync(outDir, { recursive: true });
  const checks = [];

  // ---------- 1. feed-audit ----------
  const feedAuditPath = join(outDir, "feed-audit.json");
  const feedAudit = readJsonIf(feedAuditPath);
  if (!feedAudit || feedAudit.parseError) {
    checks.push({
      id: "feed-audit",
      kind: "feed-audit",
      status: "skipped",
      summary: `feed-audit 报告缺失或不可读: ${feedAuditPath}（静态 feed 审计必须运行）`,
      reportPath: feedAuditPath,
    });
  } else {
    for (const artifact of feedAudit.artifacts ?? []) {
      checks.push({
        id: `feed-audit:${artifact.kind}:${artifact.fileName}`,
        kind: "feed-audit",
        artifactKind: artifact.kind,
        artifact: artifact.path,
        status: artifact.verdict === "pass" ? "pass" : "fail",
        summary:
          artifact.verdict === "pass"
            ? `烘烤 feed = GitHub provider ${feedAudit.expectedFeed.owner}/${feedAudit.expectedFeed.repo}（sha256=${artifact.sha256}）`
            : `${(artifact.blockingFindings ?? []).map((finding) => `[${finding.check}] ${finding.detail}`).join("；").slice(0, 400)}`,
        reportPath: feedAuditPath,
      });
    }
    if ((feedAudit.artifacts ?? []).length === 0) {
      checks.push({
        id: "feed-audit",
        kind: "feed-audit",
        status: "skipped",
        summary: "feed-audit 未审计任何产物",
        reportPath: feedAuditPath,
      });
    }
  }

  // ---------- 2. 网络断言 ----------
  flattenNetworkChecks(join(outDir, "network"), checks);

  // ---------- 3. dev 旅程 ----------
  const devJourneyPath = join(outDir, "dev-journey", "manifest.json");
  const devJourney = readJsonIf(devJourneyPath);
  if (!devJourney || devJourney.parseError) {
    checks.push({
      id: "dev-update-journey",
      kind: "dev-journey",
      status: "skipped",
      summary: `dev 旅程 manifest 缺失或不可读: ${devJourneyPath}（密封 dev 态旅程必须运行）`,
      reportPath: devJourneyPath,
    });
  } else {
    const status = devJourney.verdict === "pass" ? "pass" : devJourney.skipped === true ? "skipped" : "fail";
    const failedParts = [];
    if (devJourney.selfTest && devJourney.selfTest.verdict !== "pass") {
      failedParts.push(`feedFixtureSelfTest: ${(devJourney.selfTest.checks ?? []).filter((c) => c.status !== "pass").map((c) => c.id).join(",")}`);
    }
    if (devJourney.journey && devJourney.journey.verdict !== "pass") {
      failedParts.push(`appJourney: ${(devJourney.journey.checks ?? []).filter((c) => c.status !== "pass").map((c) => c.id).join(",")}`);
    }
    checks.push({
      id: "dev-update-journey",
      kind: "dev-journey",
      status,
      summary:
        status === "pass"
          ? `密封 dev 更新旅程通过（${devJourney.appVersion} → ${devJourney.fixture?.targetVersion ?? "?"}；staged 落盘 + sha512 校验）`
          : status === "skipped"
            ? devJourney.reason ?? "dev 旅程 skipped（验收法：跳过阻塞总门）"
            : `未通过部分: ${failedParts.join(" | ").slice(0, 500)}`,
      reportPath: devJourneyPath,
      preFixBuildNote: devJourney.journey?.preFixBuildNote ?? null,
    });
  }

  // ---------- 裁决 ----------
  const counts = {
    pass: checks.filter((check) => check.status === "pass").length,
    fail: checks.filter((check) => check.status === "fail").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
  };
  const verdict = counts.fail === 0 && counts.skipped === 0 ? "pass" : "fail";
  const report = {
    tool: "qa/epoch-ubuntu-release/update-channel/aggregate.mjs (W037-W2)",
    workOrder: "W037 — Epoch Auto-Update Channel（更新通道验收总门）",
    generatedAt: new Date().toISOString(),
    verdict,
    counts,
    checks,
    law: "No skipped critical desktop journey may be recorded as a passing release (W036 law); pre-fix FAILs are honest evidence of the W037 live defect, never green-washed.",
  };
  const reportPath = writeEvidence(outDir, "update-channel-report", report);

  const lines = [];
  lines.push(`# W037 更新通道验收总门 — ${verdict.toUpperCase()}`);
  lines.push("");
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 总体裁决：**${verdict.toUpperCase()}**（pass=${counts.pass} / fail=${counts.fail} / skipped=${counts.skipped}）`);
  lines.push("");
  lines.push("| 检查 | 类型 | 状态 | 摘要 |");
  lines.push("| --- | --- | --- | --- |");
  for (const check of checks) {
    const summary = String(check.summary ?? "").replace(/\|/g, "\\|").slice(0, 240);
    lines.push(`| ${check.id} | ${check.kind} | ${check.status} | ${summary} |`);
  }
  lines.push("");
  lines.push("## 证据 → 验收清单映射");
  lines.push("");
  lines.push("| 验收清单项 | 证据 |");
  lines.push("| --- | --- |");
  const feedEvidence = checks
    .filter((check) => check.kind === "feed-audit" && check.status === "pass")
    .map((check) => `\`${check.reportPath}\``)
    .join("、");
  const networkEvidence = checks
    .filter((check) => check.kind === "network-assertion" && check.status === "pass")
    .map((check) => `\`${check.reportPath}\``)
    .join("、");
  const devEvidence = checks
    .filter((check) => check.kind === "dev-journey" && check.status === "pass")
    .map((check) => `\`${check.reportPath}\``)
    .join("、");
  lines.push(`| 静态：烘烤 app-update.yml = GitHub provider payswapdotorg/Epoch-2.0 | ${feedEvidence || "⬜ 无通过证据"} |`);
  lines.push(`| 网络：真实窗口更新检查只命中 Epoch feed；ZCode 更新流量为 0 | ${networkEvidence || "⬜ 无通过证据（预修复构建上为实测 FAIL —— 线上缺陷证据）"} |`);
  lines.push(`| 旅程：密封 dev 更新流 check→available→downloading→ready(staged) | ${devEvidence || "⬜ 无通过证据（预修复构建上为实测 FAIL —— W037-W1 seam 证据）"} |`);
  lines.push("");
  lines.push("## 验收法");
  lines.push("");
  lines.push(`> ${report.law}`);
  lines.push("");
  const summaryPath = writeMarkdown(outDir, "update-channel-summary", lines.join("\n"));

  console.log(`[aggregate] verdict: ${verdict.toUpperCase()} (pass=${counts.pass} fail=${counts.fail} skipped=${counts.skipped})`);
  console.log(`[aggregate] report: ${reportPath}`);
  console.log(`[aggregate] summary: ${summaryPath}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

main();
