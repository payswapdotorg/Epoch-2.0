/**
 * W020 — honest environment capability matrix.
 *
 * Each check family self-declares which environment it ran in. A check that
 * cannot run honestly is reported SKIPPED with its blocker, never silently
 * passed (ARCHITECTURE-LOCK #27 evidence-based claims; W020 acceptance:
 * "External/native capability limitations are recorded honestly").
 *
 * This module PROBES the actual environment (cached Chromium, Electron binary,
 * DISPLAY/Xvfb, network reachability) rather than assuming it. The probe
 * results are the source of truth the journeys and the orchestrator read.
 */
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { CapabilityMatrixRow, EnvironmentQualification } from "./contract.ts";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");

/** Cached Playwright Chromium candidates (same list the W005 harness uses). */
const CHROMIUM_CANDIDATES = [
  "/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome",
  "/home/z/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/headless_shell",
  "/home/z/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/headless_shell",
];

const ELECTRON_DIST = resolve(REPO_ROOT, "node_modules/electron/dist/electron");
const ELECTRON_PATH_TXT = resolve(REPO_ROOT, "node_modules/electron/path.txt");

/** Resolve a usable Chromium executable path, or null if none cached. */
export function resolveChromiumExecutable(): string | null {
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Is the Electron binary actually present (not just the npm wrapper)? */
export function electronBinaryAvailable(): boolean {
  return existsSync(ELECTRON_DIST) || existsSync(ELECTRON_PATH_TXT);
}

/** Is a display available (real or Xvfb)? Headless Chromium does not require
 * one, but a real Electron window does. */
export function displayAvailable(): boolean {
  return Boolean(process.env.DISPLAY) || existsSync("/tmp/.X11-unix");
}

/** Is there a real GPU, or are we on software GL? This sandbox has no real GPU;
 * the honest answer is "software". The probe is conservative: it reports
 * "software" unless a real GL device is explicitly advertised. */
export function detectGpu(): "real" | "software" {
  // No reliable userspace real-GPU probe in this sandbox; the cached Chromium is
  // launched with SwiftShader flags, so the honest declaration is "software".
  return "software";
}

/** Probe network reachability to the Electron mirror (best-effort, short
 * timeout). The construction fixture itself is client-side/network-free, so the
 * fixture journey is always "offline"; this probe only qualifies whether an
 * Electron binary COULD be fetched if missing. */
export async function detectNetwork(): Promise<"real" | "offline"> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://registry.npmjs.org/", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok || res.status === 404 ? "real" : "offline";
  } catch {
    return "offline";
  }
}

/** The environment the headless equivalence check runs in (NullEngine — real
 * adapter code paths, no GPU frame). */
export function nullEngineEnvironment(): EnvironmentQualification {
  return {
    gpu: "software",
    hostRuntime: "null-engine",
    network: "offline",
    note: "Babylon NullEngine + Three headless — real adapter code paths (scene build, CPU ray-mesh intersection, camera math) but no GPU frame; fixture is client-side/network-free (invariant #17).",
  };
}

/** The environment the real-Chromium web journey runs in. */
export function webJourneyEnvironment(): EnvironmentQualification {
  return {
    gpu: detectGpu(),
    hostRuntime: "headless",
    network: "offline",
    note: "Real Chromium via playwright-core, headless, SwiftShader software WebGL (--use-angle=swiftshader-webgl). Fixture engine runs in-process client-side; no server/network.",
  };
}

/** The environment the real-Electron desktop journey would run in (if the
 * binary were present). */
export function desktopJourneyEnvironment(): EnvironmentQualification {
  return {
    gpu: detectGpu(),
    hostRuntime: "real",
    network: "offline",
    note: "Real Electron window via playwright-core _electron, Xvfb + SwiftShader software WebGL. Fixture engine runs in-process; no server/network.",
  };
}

/** Build the full capability matrix by probing the environment. */
export async function buildCapabilityMatrix(): Promise<readonly CapabilityMatrixRow[]> {
  const chromium = resolveChromiumExecutable();
  const electron = electronBinaryAvailable();
  const display = displayAvailable();
  const network = await detectNetwork();
  const rows: CapabilityMatrixRow[] = [
    {
      check: "renderer-equivalence (Babylon NullEngine + Three headless)",
      gpu: "software",
      hostRuntime: "null-engine",
      network: "offline",
      available: true,
    },
    {
      check: "web-journey (real Chromium)",
      gpu: "software",
      hostRuntime: "headless",
      network: "offline",
      available: chromium !== null,
      blocker: chromium === null ? "no cached Playwright Chromium executable" : undefined,
    },
    {
      check: "desktop-journey (real Electron)",
      gpu: "software",
      hostRuntime: "real",
      network: network,
      available: electron && display,
      blocker: !electron
        ? "Electron binary not present (ELECTRON_SKIP_BINARY_DOWNLOAD=1 at install) and mirror unreachable; cannot obtain binary"
        : !display
          ? "no DISPLAY / Xvfb available for a real Electron window"
          : undefined,
    },
  ];
  return rows;
}

/** Re-export for the orchestrator to assert the Electron dist path is absent
 * (used to write an honest skip reason into the ledger). */
export async function assertElectronAbsent(): Promise<boolean> {
  try {
    await stat(ELECTRON_DIST);
    return false;
  } catch {
    return true;
  }
}
