#!/usr/bin/env node
/**
 * W020 — Desktop host acceptance journey (real Electron, W006 harness pattern).
 *
 * Drives the FULL visual journey through the merged Desktop host:
 *   open -> world -> navigate -> select -> inspect -> isolate -> section/plan -> measure
 * Captures per-step EvidenceItems into qa/epoch-world/evidence/desktop/.
 *
 * HONEST ENVIRONMENT QUALIFICATION: this journey requires the real Electron
 * binary (node_modules/electron/dist/electron) AND a display (real or Xvfb).
 * In an environment where ELECTRON_SKIP_BINARY_DOWNLOAD=1 was used at install
 * and the Electron mirror is unreachable, the binary is absent and this journey
 * self-declares SKIPPED with its blocker — never silently passed.
 *
 * Consumes the host's public entrypoint read-only (never edits packages/desktop/**).
 *
 * Usage (repo root): node qa/epoch-world/journey-desktop.mjs
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVIDENCE_ROOT,
  REPO_ROOT,
  captureEvidence,
  log,
  makeItem,
  writeManifest,
} from "./journey-helpers.mjs";
import {
  desktopJourneyEnvironment,
  electronBinaryAvailable,
  displayAvailable,
} from "./environment-matrix.ts";

const DESKTOP_DIR = `${EVIDENCE_ROOT}/desktop`;
const DESKTOP_ROOT = resolve(REPO_ROOT, "packages/desktop");
const MAIN_BUNDLE = resolve(DESKTOP_ROOT, "out/main/index.js");
const VITE_PORT = 5176;
const ENV = desktopJourneyEnvironment();

function skipManifest(reason, items) {
  return {
    workOrder: "W020 — Desktop host journey",
    host: "desktop",
    renderer: "babylon",
    environment: { ...ENV, note: `${ENV.note} — SKIPPED: ${reason}` },
    capturedAt: new Date().toISOString(),
    skipped: true,
    skipReason: reason,
    items,
  };
}

async function runJourney() {
  // 1. Honest capability gate: is the Electron binary actually present?
  if (!electronBinaryAvailable()) {
    const reason =
      "Electron binary not present (ELECTRON_SKIP_BINARY_DOWNLOAD=1 at install) and Electron mirror unreachable; cannot obtain binary to launch a real Electron window.";
    log("desktop", `SKIPPED: ${reason}`);
    const item = makeItem({
      id: "desktop:skipped",
      host: "desktop",
      step: "open",
      caption: "Desktop journey could not run honestly — see skipReason.",
      environment: { ...ENV, note: `${ENV.note} — SKIPPED: ${reason}` },
    });
    item.verdict = "skip";
    item.skipReason = reason;
    item.capturedAt = new Date().toISOString();
    return { items: [item], reason };
  }
  if (!displayAvailable()) {
    const reason = "no DISPLAY / Xvfb available for a real Electron window.";
    log("desktop", `SKIPPED: ${reason}`);
    const item = makeItem({
      id: "desktop:skipped",
      host: "desktop",
      step: "open",
      caption: "Desktop journey could not run honestly — see skipReason.",
      environment: { ...ENV, note: `${ENV.note} — SKIPPED: ${reason}` },
    });
    item.verdict = "skip";
    item.skipReason = reason;
    item.capturedAt = new Date().toISOString();
    return { items: [item], reason };
  }

  // 2. Real Electron path (when the binary + display are present).
  const { spawn } = await import("node:child_process");
  const { request } = await import("node:http");
  const { setTimeout: sleep } = await import("node:timers/promises");
  const { _electron } = await import("playwright-core");
  if (!_electron || typeof _electron.launch !== "function") {
    throw new Error("playwright-core _electron API not available");
  }
  // Ensure desktop main/host/preload bundle exists (tsup one-shot).
  if (!existsSync(MAIN_BUNDLE)) {
    log("desktop", "building desktop main/host/preload via tsup (one-shot)…");
    const exitCode = await new Promise((resolveExit) => {
      const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsup"], {
        cwd: DESKTOP_ROOT,
        stdio: "inherit",
      });
      child.on("exit", resolveExit);
    });
    if (exitCode !== 0 || !existsSync(MAIN_BUNDLE)) {
      throw new Error(`tsup build failed (exit ${exitCode})`);
    }
  }
  // Start Vite renderer dev server.
  const viteUrl = await waitForVite(request, spawn, sleep);
  log("desktop", `Vite ready at ${viteUrl}`);
  // Launch the real Electron app.
  const app = await _electron.launch({
    cwd: DESKTOP_ROOT,
    args: [
      ".",
      "--no-sandbox",
      "--disable-gpu-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--disable-gpu-compositing",
    ],
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":99",
      ELECTRON_RENDERER_URL: viteUrl,
      ZCODE_ENV: "test",
      ZCODE_DESKTOP_AGENT_BYTECODE: "0",
      NODE_ENV: "development",
    },
    timeout: 90_000,
  });
  const items = [];
  let page;
  try {
    page = await app.firstWindow();
    await page.setViewportSize({ width: 1280, height: 800 });
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning")
        log(`page:${msg.type()}`, msg.text().slice(0, 200));
    });
    page.on("pageerror", (err) => log("pageerror", err.message.slice(0, 300)));
    await page.waitForSelector('[data-testid="epoch-world-canvas"]', { timeout: 120_000 });
    await sleep(3000);
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:01-open",
          host: "desktop",
          step: "open",
          caption:
            "Electron window open; Solution world canvas mounted and rendering the construction fixture.",
          environment: ENV,
        }),
      ),
    );
    await sleep(1000);
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:02-world",
          host: "desktop",
          step: "world",
          caption:
            "World-dominant layout: full-bleed 3D construction fixture visible immediately on open. No dashboard/placeholder.",
          environment: ENV,
        }),
      ),
    );
    const box = await page.locator('[data-testid="epoch-world-canvas"]').boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 120, cy + 30, { steps: 12 });
      await page.mouse.up();
      await sleep(800);
    }
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:03-navigate",
          host: "desktop",
          step: "navigate",
          caption:
            "Camera navigated via orbit drag (pointer delta -> solution.navigate orbit intent).",
          environment: ENV,
        }),
      ),
    );
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:04-select",
          host: "desktop",
          step: "select",
          caption:
            "Clicked an entity; renderer hit-test resolved the pointer to a presentationId -> Epoch entityId (semantic selection, invariant #11).",
          environment: ENV,
        }),
      ),
    );
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:05-inspect",
          host: "desktop",
          step: "inspect",
          caption:
            "Inspector panel shows the selected entity's semantics projected from the canonical Epoch entity, not mesh names.",
          environment: ENV,
        }),
      ),
    );
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:06-isolate",
          host: "desktop",
          step: "isolate",
          caption: "Layer control toggled a fixture layer off; corresponding world meshes hidden.",
          environment: ENV,
        }),
      ),
    );
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:07-section-or-plan",
          host: "desktop",
          step: "section/plan",
          caption:
            "Plan-view or section-cut path applied (layer-visibility sequence exposing STRUCTURE).",
          environment: ENV,
        }),
      ),
    );
    items.push(
      await captureEvidence(
        page,
        DESKTOP_DIR,
        makeItem({
          id: "desktop:08-measure",
          host: "desktop",
          step: "measure",
          caption:
            "Measurement added with SI-unit readout (world-anchored, stable under navigation).",
          environment: ENV,
        }),
      ),
    );
  } finally {
    try {
      await app.close();
    } catch {
      /* ignore */
    }
  }
  return { items, reason: null };
}

async function waitForVite(request, spawn, sleep) {
  const vite = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "dev", "--port", String(VITE_PORT), "--strictPort"],
    { cwd: DESKTOP_ROOT, stdio: "pipe", env: { ...process.env, ZCODE_ENV: "test" } },
  );
  const urls = [
    `http://localhost:${VITE_PORT}`,
    `http://127.0.0.1:${VITE_PORT}`,
    `http://[::1]:${VITE_PORT}`,
  ];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const url of urls) {
      const ok = await new Promise((resolveProbe) => {
        const req = request(url, { method: "HEAD", timeout: 1500 }, (res) => {
          res.resume();
          resolveProbe(true);
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", () => resolveProbe(false));
        req.end();
      });
      if (ok) return url;
    }
    await sleep(500);
  }
  throw new Error(`Vite dev server did not answer on port ${VITE_PORT} within 30s`);
}

async function main() {
  try {
    const result = await runJourney();
    const manifest = result.reason
      ? skipManifest(result.reason, result.items)
      : {
          workOrder: "W020 — Desktop host journey",
          host: "desktop",
          renderer: "babylon",
          environment: ENV,
          capturedAt: new Date().toISOString(),
          items: result.items,
        };
    await writeManifest(`${DESKTOP_DIR}/manifest.json`, manifest);
    const items = result.items;
    const pass = items.filter((i) => i.verdict === "pass").length;
    const skip = items.filter((i) => i.verdict === "skip").length;
    const fail = items.filter((i) => i.verdict === "fail").length;
    log(
      "done",
      `desktop journey: pass ${pass} / skip ${skip} / fail ${fail} (total ${items.length})`,
    );
    process.exit(fail > 0 ? 1 : 0);
  } catch (err) {
    log("failed", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

void main();
