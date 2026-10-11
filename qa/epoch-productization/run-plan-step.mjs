#!/usr/bin/env node
/**
 * W026 release harness — QA artifact (NOT part of the package runtime).
 *
 * Executes the command DATA recorded in DeploymentPlan steps by calling
 * the pure verifiers exported from @zcode/epoch-productization
 * (compiled dist). This harness may read and write the local filesystem
 * for the sole purpose of wiring those verifiers; the package itself
 * never touches it.
 *
 * Modes:
 *   plan --version <v> --commit <sha> --targets <id,id,...> --out <path>
 *   manifest-template --plan <plan.json> --out <manifest.json>
 *   verify-manifest <manifest.json> <plan.json>
 *   verify-store --snapshot <store-snapshot.json>
 *   scan-secrets <root> [<root> ...]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as productization from "../../packages/epoch-productization/dist/src/index.js";

const IGNORE_MARKER = "epoch-scan-ignore";
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".cache",
]);
const SKIP_PATH = /(^|\/)(fixtures?|__fixtures__)(\/|$)/;
const MAX_FILE_BYTES = 512 * 1024;

const modes = {
  plan: runPlan,
  "manifest-template": runManifestTemplate,
  "verify-manifest": runVerifyManifest,
  "verify-store": runVerifyStore,
  "scan-secrets": runScanSecrets,
};

main();

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const handler = mode === undefined ? undefined : modes[mode];
  if (handler === undefined) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }
  try {
    process.exitCode = handler(argv.slice(1));
  } catch (error) {
    process.stderr.write(
      `harness error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

function runPlan(args) {
  const options = parseFlags(args);
  const version = options["--version"];
  const commit = options["--commit"];
  const targets = options["--targets"];
  const out = options["--out"];
  if (
    version === undefined ||
    commit === undefined ||
    targets === undefined ||
    out === undefined
  ) {
    process.stderr.write(
      "plan: --version, --commit, --targets and --out are required\n",
    );
    return 2;
  }
  const plan = productization.deriveDeploymentPlan({
    kind: "deployment-plan-input",
    version,
    commit,
    targetIds: targets
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== ""),
  });
  writeFileSync(out, `${productization.serializeDeploymentPlan(plan)}\n`);
  process.stdout.write(
    `plan: ${plan.targetIds.length} targets, ${plan.steps.length} steps, digest ${plan.planDigest}\n`,
  );
  return 0;
}

function runManifestTemplate(args) {
  const options = parseFlags(args);
  const planPath = options["--plan"];
  const out = options["--out"];
  if (planPath === undefined || out === undefined) {
    process.stderr.write("manifest-template: --plan and --out are required\n");
    return 2;
  }
  const plan = productization.parseDeploymentPlan(readText(planPath));
  if (plan === null) {
    process.stderr.write(
      "manifest-template: plan is invalid or its digest does not verify\n",
    );
    return 1;
  }
  const artifacts = [];
  for (const targetId of plan.targetIds) {
    const target = productization.findDeploymentTarget(targetId);
    if (target === undefined) {
      continue;
    }
    for (const role of target.requiredArtifacts) {
      artifacts.push({
        role,
        path: `artifacts/${targetId}/${role}.bin`,
        targetIds: [targetId],
        byteSize: 0,
        digest: { algorithm: "sha256", hex: "0".repeat(64) },
      });
    }
  }
  const skeleton = {
    kind: "package-manifest",
    version: plan.version,
    commit: plan.commit,
    artifacts,
  };
  const manifest = {
    ...skeleton,
    manifestDigest: productization.recomputeManifestDigest(skeleton),
  };
  writeFileSync(out, `${productization.serializePackageManifest(manifest)}\n`);
  process.stdout.write(
    `manifest-template: ${artifacts.length} placeholder artifacts (replace digests, sizes and paths with real values)\n`,
  );
  return 0;
}

function runVerifyManifest(args) {
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional.length < 2) {
    process.stderr.write(
      "verify-manifest: <manifest.json> <plan.json> are required\n",
    );
    return 2;
  }
  const manifest = readJson(positional[0]);
  const plan = productization.parseDeploymentPlan(readText(positional[1]));
  if (!productization.isPackageManifest(manifest)) {
    process.stderr.write(
      "verify-manifest: manifest JSON does not satisfy the PackageManifest shape\n",
    );
    return 1;
  }
  if (plan === null) {
    process.stderr.write(
      "verify-manifest: plan JSON is invalid or its digest does not verify\n",
    );
    return 1;
  }
  const report = productization.verifyManifestConsistency(manifest, plan);
  for (const finding of report.findings) {
    const where = finding.artifactPath === null ? "-" : finding.artifactPath;
    const target = finding.targetId === null ? "-" : finding.targetId;
    process.stdout.write(
      `manifest: ${finding.severity} ${finding.code} [${where}] [${target}] ${finding.message}\n`,
    );
  }
  process.stdout.write(
    `manifest-consistency: ${report.consistent ? "consistent" : "inconsistent"} (artifacts=${report.artifactCount}, targets=${report.targetCount}, findings=${report.findings.length})\n`,
  );
  return report.consistent ? 0 : 1;
}

function runVerifyStore(args) {
  const options = parseFlags(args);
  const snapshotPath = options["--snapshot"];
  if (snapshotPath === undefined) {
    process.stderr.write(
      "verify-store: --snapshot <store-snapshot.json> is required\n",
    );
    return 2;
  }
  const snapshot = readJson(snapshotPath);
  const worlds = Array.isArray(snapshot.worlds) ? snapshot.worlds : [];
  const findWorld = (worldId) =>
    worlds.find((world) => world.id === worldId);
  const recordsOf = (world) =>
    world === undefined || !Array.isArray(world.records) ? [] : world.records;
  const store = {
    listWorlds: () => worlds.map((world) => world.id),
    listRecords: (worldId) =>
      recordsOf(findWorld(worldId)).map((record) => record.id),
    readWorld: (worldId) => {
      const world = findWorld(worldId);
      return world === undefined ? null : world.content ?? null;
    },
    readRecord: (worldId, recordId) => {
      const record = recordsOf(findWorld(worldId)).find(
        (item) => item.id === recordId,
      );
      return record === undefined ? null : record.content ?? null;
    },
    declaredDigest: (worldId, recordId) => {
      const world = findWorld(worldId);
      if (recordId === null) {
        return world === undefined ? null : world.digest ?? null;
      }
      const record = recordsOf(world).find((item) => item.id === recordId);
      return record === undefined ? null : record.digest ?? null;
    },
  };
  const report = productization.verifyStoreIntegrity(store);
  for (const finding of report.findings) {
    const world = finding.worldId === null ? "-" : finding.worldId;
    const record = finding.recordId === null ? "-" : finding.recordId;
    process.stdout.write(
      `store: ${finding.severity} ${finding.code} [${world}] [${record}] ${finding.message}\n`,
    );
  }
  const health = productization.storeHealthReport(report);
  process.stdout.write(`${health.summary}\n`);
  return health.status === "corrupt" ? 1 : 0;
}

function runScanSecrets(args) {
  const roots = args.filter((arg) => !arg.startsWith("--"));
  if (roots.length === 0) {
    process.stderr.write("scan-secrets: at least one root path is required\n");
    return 2;
  }
  const files = [];
  for (const root of roots) {
    walk(root, files);
  }
  files.sort();
  let findingCount = 0;
  for (const file of files) {
    for (const finding of scanFile(file)) {
      findingCount += 1;
      process.stdout.write(
        `${file}:${finding.line}:${finding.column} ${finding.severity} ${finding.pattern} ${finding.preview}\n`,
      );
    }
  }
  process.stdout.write(
    `scan-secrets: ${findingCount} findings across ${files.length} files\n`,
  );
  return findingCount === 0 ? 0 : 1;
}

function walk(root, files) {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    process.stderr.write(`scan-secrets: skipping missing root ${root}\n`);
    return;
  }
  if (stats.isDirectory()) {
    const entries = readdirSync(root, { withFileTypes: true }).sort(
      (left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walk(join(root, entry.name), files);
    }
  } else if (stats.isFile() && !SKIP_PATH.test(root.replaceAll("\\", "/"))) {
    files.push(root);
  }
}

function scanFile(path) {
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    return [];
  }
  if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
    return [];
  }
  if (buffer.subarray(0, Math.min(8000, buffer.length)).includes(0)) {
    return [];
  }
  const text = buffer.toString("utf8");
  const marked = new Set();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(IGNORE_MARKER)) {
      marked.add(index + 1);
    }
  }
  return productization
    .scanForSecrets(text)
    .filter((finding) => !marked.has(finding.line));
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== undefined && arg.startsWith("--")) {
      const value = args[index + 1];
      if (value !== undefined && !value.startsWith("--")) {
        flags[arg] = value;
        index += 1;
      }
    }
  }
  return flags;
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function usage() {
  return [
    "usage: node qa/epoch-productization/run-plan-step.mjs <mode> [args]",
    "  plan --version <v> --commit <sha> --targets <id,id,...> --out <plan.json>",
    "  manifest-template --plan <plan.json> --out <manifest.json>",
    "  verify-manifest <manifest.json> <plan.json>",
    "  verify-store --snapshot <snapshot.json>",
    "  scan-secrets <root> [<root>...]",
    "",
  ].join("\n");
}
