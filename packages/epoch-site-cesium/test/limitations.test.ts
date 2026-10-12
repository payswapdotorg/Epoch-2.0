import assert from "node:assert/strict";
import { test } from "node:test";
import { SITE_LIMITATIONS } from "../src/types/limitations.js";
import { CONTRACT_NAME, CONTRACT_REVISION } from "../src/contract.js";
import { isKebabId } from "../src/validate.js";

test("limitations: report identifies this package and contract", () => {
  assert.equal(SITE_LIMITATIONS.kind, "limitations-report");
  assert.equal(SITE_LIMITATIONS.packageName, "@zcode/epoch-site-cesium");
  assert.equal(SITE_LIMITATIONS.contractName, CONTRACT_NAME);
  assert.equal(SITE_LIMITATIONS.contractRevision, CONTRACT_REVISION);
});

test("limitations: every limitation has a kebab id, known area and statement", () => {
  const areas = [
    "runtime",
    "rendering",
    "tiling",
    "streaming",
    "network",
    "datum",
    "elevation",
    "determinism",
    "authority",
  ];
  const seen = new Set<string>();
  for (const limitation of SITE_LIMITATIONS.limitations) {
    assert.ok(isKebabId(limitation.limitationId));
    assert.ok(areas.includes(limitation.area));
    assert.ok(limitation.statement.length > 20);
    assert.ok(!seen.has(limitation.limitationId));
    seen.add(limitation.limitationId);
  }
});

test("limitations: runtime, tiling/streaming, network and datum limits are recorded", () => {
  const ids = new Set(SITE_LIMITATIONS.limitations.map((l) => l.limitationId));
  assert.ok(ids.has("no-cesium-runtime"));
  assert.ok(ids.has("tiling-is-host-concern"));
  assert.ok(ids.has("streaming-is-host-concern"));
  assert.ok(ids.has("no-network"));
  assert.ok(ids.has("declared-datum-pairs-only"));
});

test("limitations: datum statement names the EPSG scope", () => {
  const datum = SITE_LIMITATIONS.limitations.find(
    (l) => l.limitationId === "declared-datum-pairs-only",
  );
  assert.ok(datum !== undefined);
  assert.ok(datum.statement.includes("4326"));
  assert.ok(datum.statement.includes("4979"));
});
