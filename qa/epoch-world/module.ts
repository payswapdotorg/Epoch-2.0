/**
 * W020 — qa/epoch-world module manifest.
 *
 * The standing verification and evidence battery: real-browser/Electron
 * acceptance journeys through BOTH merged hosts (web W005 + desktop W006),
 * renderer equivalence checks across BOTH merged renderers (Babylon W004 +
 * Three W008), a machine-checkable evidence convention + checker, and the
 * honest environment capability matrix. Seeded results flow into
 * spec/acceptance/evidence-ledger.md.
 *
 * Runs (repo root):
 * - `node --test qa/epoch-world/equivalence.test.ts` — renderer equivalence
 *   (NullEngine/headless real adapter paths; no GPU/browser needed).
 * - `node qa/epoch-world/journey-web.mjs` — real Chromium Web host journey.
 * - `node qa/epoch-world/journey-desktop.mjs` — real Electron Desktop journey.
 * - `node qa/epoch-world/evidence-check.mjs` — evidence convention checker.
 * - `node qa/epoch-world/run-battery.mjs` — orchestrator + battery report.
 *
 * This module is a script/contract surface; it consumes frozen public
 * entrypoints of @zcode/epoch-renderer-babylon, @zcode/epoch-renderer-three,
 * @zcode/epoch-world-presentation and @zcode/epoch-renderer-contract read-only
 * and never edits them.
 */
export const epochWorldModule = {
  id: "epoch-world",
  requires: [
    "epoch-renderer-babylon",
    "epoch-renderer-three",
    "epoch-world-presentation",
    "epoch-renderer-contract",
  ],
  provides: ["verification-battery", "evidence-ledger-seed"],
  publicEntrypoints: [
    "run-battery.mjs",
    "equivalence.test.ts",
    "journey-web.mjs",
    "journey-desktop.mjs",
    "evidence-check.mjs",
  ],
} as const;
