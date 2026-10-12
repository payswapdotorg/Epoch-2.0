import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildLimitationsReport, limitationsReportDigest } from "../src/index.js";

const AREAS = ["execution", "environment", "fidelity", "licensing", "semantics", "provenance"];

test("limitations report is sorted, populated, and honest", () => {
  const report = buildLimitationsReport("2025-06-01T00:00:00Z");
  assert.ok(report.limitations.length >= 10);
  const ids = report.limitations.map((l) => l.limitationId);
  assert.deepEqual([...ids].sort(), [...ids]);
  for (const limitation of report.limitations) {
    assert.ok(limitation.statement.length > 0);
    assert.ok(AREAS.includes(limitation.area));
  }
});

test("key honest limitations are present by id and timestamps are inputs", () => {
  const report = buildLimitationsReport("2025-06-01T00:00:00Z");
  const ids = new Set(report.limitations.map((l) => l.limitationId));
  assert.ok(ids.has("no-network-no-fs"));
  assert.ok(ids.has("no-license-advice"));
  assert.ok(ids.has("not-a-geometry-authority"));
  assert.ok(ids.has("binary-availability"));
  assert.ok(ids.has("cannot-verify-execution"));
  assert.equal(report.notLegalAdvice, true);
  assert.equal(report.recordedAtUtc, "2025-06-01T00:00:00Z");
  assert.equal(report.packageName, "@zcode/epoch-foundation-blender");
});

test("limitations digest is stable and bad timestamps are rejected", () => {
  const report = buildLimitationsReport("2025-06-01T00:00:00Z");
  assert.equal(
    limitationsReportDigest(report),
    limitationsReportDigest(buildLimitationsReport("2025-06-01T00:00:00Z")),
  );
  assert.match(limitationsReportDigest(report), /^[0-9a-f]{64}$/);
  assert.throws(() => buildLimitationsReport("yesterday"));
});
