#!/usr/bin/env node
/**
 * W036-W3 — 验收聚合器：把品牌审计报告 + 旅程 manifest + 安装启动检查结果
 * 汇总为 evidence/acceptance-report.json（机器可读）与 acceptance-summary.md（人类可读），
 * 并给出总体 PASS/FAIL 裁决。
 *
 * 裁决法（spec/acceptance/ubuntu-epoch-desktop-release.md）：
 * - 任一检查 fail → 总体 FAIL；
 * - 任一关键检查 skipped（如 Worker 2 的 install-launch-check.sh 尚未就位）→ 总体 FAIL
 *   （跳过的检查必须阻塞发布，直到 TL 取得真实窗口证据或记录批准的等效验证）；
 * - releaseReady 额外要求 deb 与 appimage 两种产物都经过品牌审计 + 真实窗口旅程且全部通过。
 *
 * 用法：
 *   node qa/epoch-ubuntu-release/aggregate.mjs --out <dir> \
 *     [--brand-audit <brand-audit.json>]... [--journey <manifest.json>]... \
 *     [--install-launch-status <install-launch-status.json>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

function usage(exitCode) {
  console.log(
    [
      "用法: node qa/epoch-ubuntu-release/aggregate.mjs --out <dir> [--brand-audit <json>]... [--journey <manifest.json>]... [--install-launch-status <json>]",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = { out: null, brandAudits: [], journeys: [], installLaunchStatus: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") options.out = argv[++index];
    else if (arg === "--brand-audit") options.brandAudits.push(argv[++index]);
    else if (arg === "--journey") options.journeys.push(argv[++index]);
    else if (arg === "--install-launch-status") options.installLaunchStatus = argv[++index];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`未知参数: ${arg}`);
      usage(2);
    }
  }
  if (!options.out) {
    console.error("--out <dir> 必填（聚合报告输出目录）");
    usage(2);
  }
  return options;
}

function absolute(path) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = absolute(options.out);
  mkdirSync(outDir, { recursive: true });
  const checks = [];

  // ---------- 品牌审计 ----------
  for (const auditPath of options.brandAudits) {
    if (!existsSync(auditPath)) {
      checks.push({
        id: `brand-audit:${auditPath}`,
        kind: "brand-audit",
        status: "fail",
        summary: `报告文件不存在: ${auditPath}`,
        reportPath: auditPath,
      });
      continue;
    }
    const audit = readJson(auditPath);
    for (const artifact of audit.artifacts ?? []) {
      const failedChecks = (artifact.checks ?? []).filter((check) => check.status === "fail");
      checks.push({
        id: `brand-audit:${artifact.kind}:${artifact.fileName}`,
        kind: "brand-audit",
        artifactKind: artifact.kind,
        artifact: artifact.path,
        status: artifact.verdict === "pass" ? "pass" : "fail",
        summary:
          artifact.verdict === "pass"
            ? `品牌审计通过（sha256=${artifact.sha256}）`
            : `${failedChecks.length} 项失败：${(artifact.blockingFindings ?? [])
                .map((finding) => `[${finding.check}] ${finding.detail}`)
                .join("；")
                .slice(0, 400)}`,
        reportPath: auditPath,
        sha256: artifact.sha256 ?? null,
        bytes: artifact.bytes ?? null,
      });
    }
  }

  // ---------- 旅程 manifest ----------
  for (const manifestPath of options.journeys) {
    if (!existsSync(manifestPath)) {
      checks.push({
        id: `journey:${manifestPath}`,
        kind: "journey",
        status: "fail",
        summary: `manifest 文件不存在: ${manifestPath}`,
        reportPath: manifestPath,
      });
      continue;
    }
    const manifest = readJson(manifestPath);
    const failedSteps = (manifest.steps ?? []).filter((step) => step.status === "fail");
    checks.push({
      id: `journey:${manifest.mode}`,
      kind: "journey",
      mode: manifest.mode ?? null,
      status: manifest.pass === true ? "pass" : "fail",
      summary:
        manifest.pass === true
          ? `真实 Electron 窗口旅程通过（${(manifest.steps ?? []).length} 步；${manifest.identity?.windowTitle ? `标题=${manifest.identity.windowTitle}；` : ""}${manifest.identity?.electronVersion ? `electron=${manifest.identity.electronVersion}；` : ""}sha256=${manifest.artifact?.sha256 ?? "n/a"}）`
          : `${failedSteps.length} 步失败：${failedSteps
              .map((step) => `${step.step}（${(step.error ?? "").slice(0, 200)}）`)
              .join("；")
              .slice(0, 500)}`,
      reportPath: manifestPath,
      artifact: manifest.artifact?.path ?? null,
      environment: manifest.environment ?? null,
    });
  }

  // ---------- 安装/启动检查（Worker 2 的 linux-release 脚本） ----------
  if (options.installLaunchStatus && existsSync(options.installLaunchStatus)) {
    const status = readJson(options.installLaunchStatus);
    // 保留 skipped 分类（验收法要求显式记录跳过并阻塞发布，而非吞并为 fail）。
    const mapped =
      status.status === "pass" ? "pass" : status.status === "skipped" ? "skipped" : "fail";
    checks.push({
      id: "install-launch-check",
      kind: "install-launch",
      status: mapped,
      summary: `install-launch-check: ${status.status}${status.note ? `（${status.note}）` : ""}${status.results ? `；明细见 ${status.results}` : ""}`,
      reportPath: options.installLaunchStatus,
      log: status.log ?? null,
      results: status.results ?? null,
    });
  } else if (options.installLaunchStatus) {
    checks.push({
      id: "install-launch-check",
      kind: "install-launch",
      status: "fail",
      summary: `install-launch 状态文件不存在: ${options.installLaunchStatus}`,
      reportPath: options.installLaunchStatus,
    });
  } else {
    checks.push({
      id: "install-launch-check",
      kind: "install-launch",
      status: "skipped",
      summary:
        "未提供 install-launch 状态（packages/desktop/scripts/linux-release/install-launch-check.sh 尚未就位或未运行）——按验收法，跳过的检查阻塞发布",
    });
  }

  // ---------- 裁决 ----------
  const counts = {
    pass: checks.filter((check) => check.status === "pass").length,
    fail: checks.filter((check) => check.status === "fail").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
  };
  const verdict = counts.fail === 0 && counts.skipped === 0 ? "pass" : "fail";
  const artifactKindsAudited = new Set(
    checks.filter((check) => check.kind === "brand-audit" && check.status === "pass").map((check) => check.artifactKind),
  );
  const journeyModesPassed = new Set(
    checks.filter((check) => check.kind === "journey" && check.status === "pass").map((check) => check.mode),
  );
  const releaseReady =
    artifactKindsAudited.has("deb") &&
    artifactKindsAudited.has("appimage") &&
    journeyModesPassed.has("deb") &&
    journeyModesPassed.has("appimage");

  const report = {
    workOrder: "W036 — Ubuntu Epoch Desktop Release",
    generatedAt: new Date().toISOString(),
    verdict,
    releaseReady,
    kinds: {
      brandAuditPassed: [...artifactKindsAudited],
      journeyPassed: [...journeyModesPassed],
    },
    counts,
    checks,
    law: "No skipped critical desktop journey may be recorded as a passing release (spec/acceptance/ubuntu-epoch-desktop-release.md).",
  };

  const reportPath = join(outDir, "acceptance-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // ---------- 人类可读摘要 ----------
  const lines = [];
  const banner = verdict === "pass" ? "PASS" : "FAIL";
  lines.push(`# W036 Ubuntu Epoch Desktop Release — 验收总门：${banner}`);
  lines.push("");
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(
    `- 总体裁决：**${banner}**（pass=${counts.pass} / fail=${counts.fail} / skipped=${counts.skipped}）`,
  );
  lines.push(`- 发布就绪（deb+AppImage 均通过审计与真实窗口旅程）：**${releaseReady ? "YES" : "NO"}**`);
  lines.push("");
  lines.push("## 检查明细");
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
  lines.push("| 验收清单项（spec/acceptance） | 本报告证据 |");
  lines.push("| --- | --- |");
  const journeyPassEvidence = checks
    .filter((check) => check.kind === "journey" && check.status === "pass")
    .map((check) => `\`${check.reportPath}\``)
    .join("、");
  const brandPassEvidence = checks
    .filter((check) => check.kind === "brand-audit" && check.status === "pass")
    .map((check) => `\`${check.reportPath}\``)
    .join("、");
  const installEvidence = checks.find((check) => check.kind === "install-launch");
  lines.push(
    `| 真实安装 Electron 旅程通过（Real installed Electron journey passes） | ${
      journeyPassEvidence || "⬜ 无证据"
    } |`,
  );
  lines.push(
    `| deb/AppImage 存在、非空、匹配校验和（.deb and .AppImage exist, non-empty, match checksums） | ${
      brandPassEvidence || "⬜ 无证据"
    }（SHA-256 已记录在各报告；对 release-manifest 的比对在发布时进行） |`,
  );
  lines.push(
    `| deb 可装可启、AppImage 可跑（.deb installs+launches; AppImage runs, non-root） | ${
      installEvidence?.status === "pass"
        ? `\`${installEvidence.reportPath}\``
        : "⬜ 未通过（install-launch-check）"
    } |`,
  );
  lines.push("| 干净检出 + 冻结安装、包测试/typecheck/lint/架构检查 | ⬜ 本报告不覆盖（构建管线证据，由 TL 在发布工作流留存） |");
  lines.push("| 未内嵌密钥/测试凭据 | ⬜ 本报告不覆盖（发布前由 TL 复核 asar 与产物） |");
  lines.push("| GitHub Release 存在、资产可下载、校验和可验、发布说明完整 | ⬜ 发布阶段（D 门），在发布后验证 |");
  lines.push("| 下载直链已验证 | ⬜ 发布阶段（D 门），在发布后验证 |");
  lines.push("");
  lines.push("## 验收法");
  lines.push("");
  lines.push(`> ${report.law}`);
  lines.push("");
  const summaryPath = join(outDir, "acceptance-summary.md");
  writeFileSync(summaryPath, lines.join("\n"), "utf8");

  console.log(`[aggregate] verdict: ${banner} (pass=${counts.pass} fail=${counts.fail} skipped=${counts.skipped})`);
  console.log(`[aggregate] report: ${reportPath}`);
  console.log(`[aggregate] summary: ${summaryPath}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

main();
