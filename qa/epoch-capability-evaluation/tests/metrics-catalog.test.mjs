import { test } from "node:test";
import assert from "node:assert/strict";
import { METRIC_CATALOG, knownCapabilityClasses, metricIdsForClass } from "./under-test.mjs";

test("catalog covers all eight metric families", () => {
  const families = new Set(METRIC_CATALOG.map((metric) => metric.family));
  assert.equal(families.size, 8);
  for (const family of [
    "correctness",
    "engineering-tolerance",
    "coverage",
    "reliability",
    "performance",
    "recovery",
    "ux-accessibility",
    "lifecycle-cost",
  ]) {
    assert.ok(families.has(family), `missing family ${family}`);
  }
});

test("every per-class selection is a non-empty subset of the catalog", () => {
  const catalogIds = new Set(METRIC_CATALOG.map((metric) => metric.id));
  for (const classId of knownCapabilityClasses()) {
    const ids = metricIdsForClass(classId);
    assert.ok(ids !== null);
    assert.ok(ids.length > 0);
    for (const id of ids) {
      assert.ok(catalogIds.has(id), `${classId} selects unknown metric ${id}`);
    }
  }
});

test("no class selects every metric (no misleading universal score)", () => {
  for (const classId of knownCapabilityClasses()) {
    const ids = metricIdsForClass(classId);
    assert.ok(ids !== null);
    assert.ok(ids.length < METRIC_CATALOG.length, `${classId} selects the whole catalog`);
  }
});

test("class selections differ between classes", () => {
  const classes = knownCapabilityClasses();
  const signatures = new Set(classes.map((classId) => JSON.stringify(metricIdsForClass(classId))));
  assert.equal(signatures.size, classes.length);
});

test("metricIdsForClass returns null for unknown classes", () => {
  assert.equal(metricIdsForClass("warp-drive"), null);
  assert.equal(knownCapabilityClasses().includes("warp-drive"), false);
});

test("metric descriptors carry unique ids and finite tolerances", () => {
  const ids = METRIC_CATALOG.map((metric) => metric.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const metric of METRIC_CATALOG) {
    assert.ok(Number.isFinite(metric.regressionTolerance));
    assert.ok(metric.regressionTolerance >= 0);
    assert.ok(metric.description.length > 0);
  }
});
