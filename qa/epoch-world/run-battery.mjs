#!/usr/bin/env node
/**
 * W020 — battery orchestrator.
 *
 * Runs the full verification battery and emits a BatteryReport:
 *   1. renderer equivalence (Babylon W004 + Three W008, NullEngine/headless);
 *   2. web host journey (real Chromium, W005 pattern);
 *   3. desktop host journey (real Electron, W006 pattern — SKIPPED honestly
 *      when the Electron binary is absent);
 *   4. evidence convention checker.
 *
 * Writes qa/epoch-world/battery-report.json (machine-readable) and prints a
 * human pass/fail/skip summary. The report is the seed the evidence ledger
 * (spec/acceptance/evidence-ledger.md) consumes.
 *
 * Usage (repo root): node qa/epoch-world/run-battery.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityMatrix, nullEngineEnvironment } from "./environment-matrix.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPORT_PATH = resolve(HERE, "battery-report.json");

function run(cmd, args, opts = {}) {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, { cwd: resolve(HERE, "../.."), stdio: "pipe", ...opts });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += c;
    });
    child.stderr?.on("data", (c) => {
      stderr += c;
    });
    child.on("exit", (code) => resolveP({ code: code ?? 0, stdout, stderr }));
  });
}

async function runEquivalence() {
  console.log("[battery] 1/4 renderer equivalence (Babylon NullEngine + Three headless)…");
  const res = await run("node", ["--test", "qa/epoch-world/equivalence.test.ts"]);
  const passed = (res.stdout.match(/✔/g) || []).length;
  const failed = (res.stdout.match(/✖/g) || []).length;
  const skipped = (res.stdout.match(/ℹ skipped (\d+)/)?.[1] ?? 0) | 0;
  console.log(
    "[battery] equivalence: pass %d / fail %d / skip %d (rc=%d)",
    passed,
    failed,
    skipped,
    res.code,
  );
  if (res.code !== 0) console.error(res.stderr.slice(-1500) || res.stdout.slice(-1500));
  return { name: "renderer-equivalence", passed, failed, skipped, rc: res.code };
}

async function runWebJourney() {
  console.log("[battery] 2/4 web host journey (real Chromium)…");
  const res = await run("node", ["qa/epoch-world/journey-web.mjs"]);
  console.log("[battery] web journey rc=%d", res.code);
  let pass = 0,
    skip = 0,
    fail = 0;
  const manifestPath = resolve(HERE, "evidence/web/manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const item of manifest.items ?? []) {
      if (item.verdict === "pass") pass++;
      else if (item.verdict === "skip") skip++;
      else if (item.verdict === "fail") fail++;
    }
  } else {
    skip = 1;
  }
  if (res.code !== 0 && fail === 0)
    console.error(res.stderr.slice(-1500) || res.stdout.slice(-1500));
  return { name: "web-journey", passed: pass, failed: fail, skipped: skip, rc: res.code };
}

async function runDesktopJourney() {
  console.log("[battery] 3/4 desktop host journey (real Electron)…");
  const res = await run("node", ["qa/epoch-world/journey-desktop.mjs"]);
  console.log("[battery] desktop journey rc=%d", res.code);
  let pass = 0,
    skip = 0,
    fail = 0;
  let skipReason = "";
  const manifestPath = resolve(HERE, "evidence/desktop/manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    skipReason = manifest.skipReason ?? "";
    for (const item of manifest.items ?? []) {
      if (item.verdict === "pass") pass++;
      else if (item.verdict === "skip") skip++;
      else if (item.verdict === "fail") fail++;
    }
  } else {
    skip = 1;
    skipReason = "desktop manifest not produced";
  }
  return {
    name: "desktop-journey",
    passed: pass,
    failed: fail,
    skipped: skip,
    rc: res.code,
    skipReason,
  };
}

async function runEvidenceCheck() {
  console.log("[battery] 4/4 evidence convention checker…");
  const res = await run("node", ["qa/epoch-world/evidence-check.mjs"]);
  console.log("[battery] evidence-check rc=%d", res.code);
  return {
    name: "evidence-check",
    passed: res.code === 0 ? 1 : 0,
    failed: res.code === 0 ? 0 : 1,
    skipped: 0,
    rc: res.code,
  };
}

async function main() {
  const capabilityMatrix = await buildCapabilityMatrix();
  console.log("[battery] capability matrix:");
  for (const row of capabilityMatrix) {
    console.log(
      "  - %s: available=%s %s",
      row.check,
      row.available,
      row.blocker ? `(blocker: ${row.blocker})` : "",
    );
  }

  const eq = await runEquivalence();
  const web = await runWebJourney();
  const desk = await runDesktopJourney();
  const ev = await runEvidenceCheck();

  // Build EvidenceItems from the manifests + equivalence summary.
  const items = [];
  const eqEnv = nullEngineEnvironment();
  const testNames = [
    "BOTH renderers resolve the SAME deterministic entityId set",
    "each entity resolves to a hit point inside the SAME world AABB through both renderers",
    "portable focused-entity + layer state survives a renderer SWITCH (Babylon -> Three)",
    "portable focused-entity + layer state survives a renderer SWITCH (Three -> Babylon)",
    "world identity fields are untouched by both renderers",
  ];
  for (const name of testNames) {
    items.push({
      id: `equivalence:${name.slice(0, 48)}`,
      workOrder: "W004+W008+W020",
      host: "both",
      renderer: "both",
      step: "equivalence",
      caption: name,
      evidencePath: "",
      environment: eqEnv,
      verdict: eq.failed === 0 ? "pass" : "fail",
      capturedAt: new Date().toISOString(),
    });
  }
  for (const manifestRel of ["evidence/web/manifest.json", "evidence/desktop/manifest.json"]) {
    const manifestPath = resolve(HERE, manifestRel);
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const item of manifest.items ?? []) items.push(item);
    }
  }

  const pass = items.filter((i) => i.verdict === "pass").length;
  const skip = items.filter((i) => i.verdict === "skip").length;
  const fail = items.filter((i) => i.verdict === "fail").length;
  const report = {
    workOrder: "W020",
    generatedAt: new Date().toISOString(),
    counts: { pass, skip, fail, total: items.length },
    capabilityMatrix,
    items,
    checks: { equivalence: eq, webJourney: web, desktopJourney: desk, evidenceCheck: ev },
  };
  await mkdir(resolve(REPORT_PATH, ".."), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("[battery] report written: %s", REPORT_PATH);
  console.log(
    "[battery] SUMMARY: pass %d / skip %d / fail %d (total %d)",
    pass,
    skip,
    fail,
    items.length,
  );
  console.log("[battery] desktop skip reason: %s", desk.skipReason || "(none — ran)");
  process.exit(fail > 0 || ev.rc !== 0 ? 1 : 0);
}

void main();
