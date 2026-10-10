/**
 * W020 — shared journey helpers (web + desktop).
 *
 * Extracted so each journey script stays under the repo's 400-line lint cap and
 * both hosts share the SAME evidence convention: each step produces an
 * EvidenceItem with a caption law + honest environment qualification, written
 * to a manifest.json the evidence-checker consumes.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
export const EVIDENCE_ROOT = resolve(HERE, "evidence");

export const CHROMIUM_CANDIDATES = [
  "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome",
  "/home/z/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/headless_shell",
  "/home/z/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/headless_shell",
];

export function log(scope, message) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[w020-${scope} ${stamp}] ${message}`);
}

export function resolveChromiumExecutable() {
  const fromEnv = process.env.EPOCH_WEB_CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export function startVite(filter, baseUrl, label) {
  log("vite", `starting ${filter} dev (${label} at ${baseUrl})`);
  const child = spawn("pnpm", ["--filter", filter, "dev"], {
    cwd: REPO_ROOT,
    env: { ...process.env, ZCODE_ENV: "test" },
    stdio: "pipe",
  });
  const stderrChunks = [];
  child.stdout?.on("data", (c) => {
    const s = String(c);
    if (/Local:|ready in/i.test(s)) log("vite", s.trim().split("\n")[0]);
  });
  child.stderr?.on("data", (c) => stderrChunks.push(c));
  child.readyStderr = () => Buffer.concat(stderrChunks).toString("utf8").slice(-2000);
  return child;
}

export async function captureEvidence(page, dir, item) {
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `${item.id}.png`);
  try {
    await page.screenshot({ path, fullPage: false });
    item.evidencePath = `evidence/${item.host === "web" ? "web" : "desktop"}/${item.id}.png`;
    item.verdict = "pass";
  } catch (err) {
    item.verdict = "fail";
    item.skipReason = `screenshot capture failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  item.capturedAt = new Date().toISOString();
  log("capture", `${item.id}: ${item.verdict} — ${item.caption}`);
  return item;
}

export function makeItem({ id, host, step, caption, environment }) {
  return {
    id,
    workOrder: host === "web" ? "W005+W007" : "W006+W007",
    host,
    renderer: "babylon",
    step,
    caption,
    evidencePath: "",
    environment,
    verdict: "skip",
    capturedAt: "",
  };
}

export async function writeManifest(manifestPath, manifest) {
  await mkdir(resolve(manifestPath, ".."), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  log("manifest", `wrote ${manifestPath}`);
}
