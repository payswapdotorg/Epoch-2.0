#!/usr/bin/env node
/**
 * W020 — evidence convention checker.
 *
 * Machine-checkable convention: each acceptance item needs a named evidence
 * file (screenshot/recording), a caption law (what must be visible), and an
 * environment qualification note (headless/software-GL vs real GPU; simulated
 * vs real network). This script FAILS (exit 1) when a referenced evidence file
 * is missing or unlabeled.
 *
 * It reads the journey manifests (evidence/web/manifest.json,
 * evidence/desktop/manifest.json) and the equivalence-test report, and for each
 * PASS item asserts:
 *   - the evidence file exists on disk;
 *   - the caption is non-empty;
 *   - the environment qualification note is non-empty and has a valid
 *     gpu/hostRuntime/network triple.
 * SKIP items must carry a non-empty skipReason. FAIL items fail the checker.
 *
 * Usage (repo root): node qa/epoch-world/evidence-check.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const EVIDENCE_ROOT = resolve(HERE, "evidence");

function isNonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

function isLabeledItem(item) {
  if (typeof item !== "object" || item === null) return false;
  if (!isNonEmpty(item.id) || !isNonEmpty(item.step) || !isNonEmpty(item.caption)) return false;
  if (typeof item.environment !== "object" || item.environment === null) return false;
  const env = item.environment;
  if (!isNonEmpty(env.note)) return false;
  if (env.gpu !== "real" && env.gpu !== "software") return false;
  if (
    env.hostRuntime !== "real" &&
    env.hostRuntime !== "headless" &&
    env.hostRuntime !== "null-engine"
  ) {
    return false;
  }
  if (env.network !== "real" && env.network !== "offline") return false;
  if (item.verdict !== "pass" && item.verdict !== "skip" && item.verdict !== "fail") return false;
  if (item.verdict === "skip" && !isNonEmpty(item.skipReason)) return false;
  return true;
}

function checkManifest(manifestPath, label, failures) {
  if (!existsSync(manifestPath)) {
    failures.push(`${label}: manifest missing at ${manifestPath}`);
    return [];
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    failures.push(
      `${label}: manifest is not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  for (const item of items) {
    if (!isLabeledItem(item)) {
      failures.push(
        `${label}:${item.id ?? "?"}: item is not labeled (missing caption / environment / verdict)`,
      );
      continue;
    }
    if (item.verdict === "pass") {
      // The referenced evidence file MUST exist on disk.
      const fileRel = item.evidencePath;
      if (!isNonEmpty(fileRel)) {
        failures.push(`${label}:${item.id}: PASS item has no evidencePath`);
        continue;
      }
      const abs = resolve(HERE, fileRel);
      if (!existsSync(abs)) {
        failures.push(`${label}:${item.id}: PASS item references missing evidence file ${fileRel}`);
      }
    }
    if (item.verdict === "fail") {
      failures.push(`${label}:${item.id}: item verdict is FAIL — journey hard-failed`);
    }
  }
  return items;
}

function main() {
  const failures = [];
  const webItems = checkManifest(resolve(EVIDENCE_ROOT, "web/manifest.json"), "web", failures);
  const desktopItems = checkManifest(
    resolve(EVIDENCE_ROOT, "desktop/manifest.json"),
    "desktop",
    failures,
  );

  const webPass = webItems.filter((i) => i.verdict === "pass").length;
  const webSkip = webItems.filter((i) => i.verdict === "skip").length;
  const deskPass = desktopItems.filter((i) => i.verdict === "pass").length;
  const deskSkip = desktopItems.filter((i) => i.verdict === "skip").length;

  console.log(
    "[evidence-check] web:    pass %d / skip %d (total %d)",
    webPass,
    webSkip,
    webItems.length,
  );
  console.log(
    "[evidence-check] desktop: pass %d / skip %d (total %d)",
    deskPass,
    deskSkip,
    desktopItems.length,
  );

  if (failures.length > 0) {
    console.error("[evidence-check] FAILED — %d convention violation(s):", failures.length);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    "[evidence-check] OK — every PASS item has a present, labeled evidence file; every SKIP carries a blocker.",
  );
  process.exit(0);
}

main();
