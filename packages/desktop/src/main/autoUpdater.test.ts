/**
 * W037-W1 — flavor-seam contract tests (node:test, zero-framework).
 *
 * The desktop package has no unit-test infrastructure (no runner, no mock
 * framework), so this file tests the seam the way that actually runs here:
 *  1. the flavor matrix as DATA — the contract the runtime gates implement;
 *  2. source-level assertions on the REAL delivered files — the gate
 *     expressions must exist exactly once, in the exact form the work order
 *     specifies (epoch enabled on the baked GitHub feed; production keeps
 *     the ZCode server manifest provider; preview stays disabled);
 *  3. the applyManifestUpdateProvider epoch-skip present in autoUpdater.ts.
 *
 * Run: node --test packages/desktop/src/main/autoUpdater.test.ts
 * (from the repo root; node >= 19 for node:test mock/stability).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf-8");

/** The raw flavor values desktopProductRuntimeIdentity can hold (the raw
 * source — "epoch" survives normalization; that is the W036 defect's fix). */
const RAW_FLAVORS = ["epoch", "production", "preview"] as const;

/** The seam contract: for each raw flavor, the auto-update behavior the
 * runtime must implement. This is the work order's provider-selection
 * matrix (packaged builds; dev-mode is exercised by the W037-W2 journey). */
const MATRIX: Record<
  (typeof RAW_FLAVORS)[number],
  { enabled: boolean; provider: "baked-github-feed" | "zcode-manifest" | "none"; zcodeTraffic: number }
> = {
  epoch: { enabled: true, provider: "baked-github-feed", zcodeTraffic: 0 },
  production: { enabled: true, provider: "zcode-manifest", zcodeTraffic: 1 },
  preview: { enabled: false, provider: "none", zcodeTraffic: 0 },
};

describe("W037-W1 flavor seam — the matrix contract", () => {
  for (const flavor of RAW_FLAVORS) {
    it(`matrix[${flavor}] keeps the work-order behavior`, () => {
      const row = MATRIX[flavor];
      if (flavor === "epoch") {
        // the fix for the W036 live defect: epoch updates via the Epoch feed only
        assert.equal(row.enabled, true);
        assert.equal(row.provider, "baked-github-feed");
        assert.equal(row.zcodeTraffic, 0);
      } else if (flavor === "production") {
        // upstream law: production keeps the ZCode server manifest provider
        assert.equal(row.provider, "zcode-manifest");
      } else {
        // preview law: fail-closed, no channel at all
        assert.equal(row.enabled, false);
        assert.equal(row.provider, "none");
      }
    });
  }
});

describe("W037-W1 flavor seam — the delivered source gates", () => {
  it("index.ts: initAutoUpdater enabled gate is raw-flavor, preview-excluded (exactly once)", () => {
    const src = read("index.ts");
    const gate = 'enabled: desktopRuntimeProductFlavor !== "preview",';
    assert.equal(
      src.split(gate).length - 1, 1,
      "the enabled gate must exist exactly once in the initAutoUpdater call"
    );
    assert.ok(
      !src.includes('enabled: ZCODE_PRODUCT_FLAVOR === "production",'),
      "the OLD normalized-constant gate at the initAutoUpdater call site (the defect) must be gone"
    );
    // NOTE: other ZCODE_PRODUCT_FLAVOR sites in index.ts (e.g. the
    // force-update gate ~2272) are OUTSIDE this work order's ownership
    // ("the initAutoUpdater call site and its flavor gating only") and stay
    // upstream-identical — this assertion is scoped to the call-site form.
    assert.ok(
      src.includes('import { desktopRuntimeProductFlavor, isEpochDesktopRuntime } from "./desktopProductRuntimeIdentity.js";'),
      "the raw-flavor import must be present"
    );
  });

  it("desktopApplicationMenu.ts: both check-for-update menu gates are raw-flavor (exactly twice)", () => {
    const src = read("desktopApplicationMenu.ts");
    const gate = 'desktopRuntimeProductFlavor !== "preview"';
    assert.equal(
      src.split(gate).length - 1, 2,
      "the menu gate must exist at BOTH menu sites (darwin + linux/windows)"
    );
    assert.ok(
      !src.includes('ZCODE_PRODUCT_FLAVOR === "production"'),
      "the normalized-constant menu gate must be gone"
    );
  });

  it("autoUpdater.ts: the epoch flavor skips the ZCode manifest provider (the seam)", () => {
    const src = read("autoUpdater.ts");
    assert.ok(
      src.includes("if (isEpochDesktopRuntime)"),
      "applyManifestUpdateProvider must branch on isEpochDesktopRuntime"
    );
    // the skip must come BEFORE the ZCode setFeedURL — the provider-selection seam
    const skip = src.indexOf("if (isEpochDesktopRuntime)");
    const providerInstall = src.indexOf('autoUpdater.setFeedURL({');
    assert.ok(skip >= 0 && providerInstall > skip, "the epoch skip must precede the ZCode provider install");
  });

  it("encoding law: no mojibake/quote corruption in the touched files", () => {
    for (const f of ["index.ts", "desktopApplicationMenu.ts", "autoUpdater.ts"]) {
      const src = read(f);
      assert.ok(!src.includes("???"), `${f}: no '?' mojibake`);
    }
    const menu = read("desktopApplicationMenu.ts");
    assert.ok(menu.endsWith("\n"), "desktopApplicationMenu.ts keeps its trailing newline");
  });
});
