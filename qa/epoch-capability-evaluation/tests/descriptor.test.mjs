import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptorDigestOf, validateBenchmarkDescriptor } from "./under-test.mjs";
import { NOT_A_DIGEST, M_FAIL, M_MEM, M_PASS, descriptorFixture } from "./fixtures.mjs";

test("accepts a well-formed descriptor and returns its digest", () => {
  const descriptor = descriptorFixture();
  const validation = validateBenchmarkDescriptor(descriptor);
  assert.equal(validation.ok, true);
  assert.match(validation.descriptorDigest, /^[0-9a-f]{64}$/);
  assert.equal(validation.descriptorDigest, descriptorDigestOf(descriptor));
});

test("rejects metrics outside the class selection", () => {
  const base = descriptorFixture();
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({
      metricSelections: [
        ...base.metricSelections,
        { metricId: "ux/interaction-response-ms", weight: 0.1, qualificationThreshold: 100 },
      ],
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/metric-not-selected-for-class");
});

test("rejects duplicate metric selections", () => {
  const base = descriptorFixture();
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({ metricSelections: [...base.metricSelections, base.metricSelections[0]] }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/duplicate-metric");
});

test("rejects weights outside (0,1]", () => {
  const zero = validateBenchmarkDescriptor(descriptorFixture({ metricSelections: [{ metricId: M_PASS, weight: 0 }] }));
  assert.equal(zero.ok, false);
  assert.equal(zero.rejection.code, "descriptor/invalid-weight");
  const big = validateBenchmarkDescriptor(descriptorFixture({ metricSelections: [{ metricId: M_PASS, weight: 1.5 }] }));
  assert.equal(big.ok, false);
  assert.equal(big.rejection.code, "descriptor/invalid-weight");
});

test("rejects bands where superiorityMargin does not exceed comparableTolerance", () => {
  const base = descriptorFixture();
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({
      metricSelections: base.metricSelections.map((selection) =>
        selection.metricId === M_PASS
          ? { ...selection, differential: { comparableTolerance: 0.05, superiorityMargin: 0.05 } }
          : selection,
      ),
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/invalid-differential-band");
});

test("rejects hard constraints on unselected metrics", () => {
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({
      hardConstraints: [{ metricId: M_MEM, kind: "maximum", value: 512, rationale: "memory ceiling" }],
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/hard-constraint-unknown-metric");
});

test("rejects out-of-range thresholds for ratio-unit metrics", () => {
  const base = descriptorFixture();
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({
      metricSelections: base.metricSelections.map((selection) =>
        selection.metricId === M_PASS ? { ...selection, qualificationThreshold: 1.2 } : selection,
      ),
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/invalid-threshold");
});

test("rejects qualification policies exceeding the selection counts", () => {
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({
      qualificationPolicy: { minQualifiedMetrics: 4, minDifferentialMetrics: 3, evidenceRequired: true },
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/invalid-qualification-policy");
});

test("rejects malformed corpus references", () => {
  const base = descriptorFixture();
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({ corpus: { ...base.corpus, corpusDigest: NOT_A_DIGEST } }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/corpus-ref-malformed");
});

test("rejects hard constraints with empty rationales", () => {
  const validation = validateBenchmarkDescriptor(
    descriptorFixture({
      hardConstraints: [{ metricId: M_FAIL, kind: "maximum", value: 0.02, rationale: " " }],
    }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.rejection.code, "descriptor/invalid-hard-constraint");
});
