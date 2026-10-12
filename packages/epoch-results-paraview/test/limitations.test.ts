import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLimitationsReport,
  limitationAreaTitle,
  limitationsReportDigest,
} from "../src/build/limitations.js";
import { LIMITATION_AREAS } from "../src/types/limitations.js";

test("the limitations report carries honest, non-empty statements", () => {
  const report = buildLimitationsReport();
  assert.equal(report.reportId, "epoch-results-paraview-limitations");
  assert.ok(report.statements.length >= 5);
  for (const statement of report.statements) {
    assert.ok(statement.statement.length > 0);
    assert.ok(statement.mitigation.length > 0);
    assert.ok(LIMITATION_AREAS.includes(statement.area));
    assert.match(statement.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});

test("limitations report ids are unique", () => {
  const ids = buildLimitationsReport().statements.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the required limitation topics are present", () => {
  const ids = buildLimitationsReport().statements.map((s) => s.id);
  for (const required of [
    "no-paraview-runtime",
    "no-vtk-parsing",
    "host-dependent-ingestion-fidelity",
    "no-large-dataset-streaming",
  ]) {
    assert.ok(ids.includes(required), `missing limitation: ${required}`);
  }
});

test("the limitations digest is stable", () => {
  const first = limitationsReportDigest(buildLimitationsReport());
  const second = limitationsReportDigest(buildLimitationsReport());
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("limitationAreaTitle covers every area", () => {
  for (const area of LIMITATION_AREAS) {
    assert.ok(limitationAreaTitle(area).length > 0);
  }
});
