// Shared fixtures for the W030 capability-quality-lab test battery.
// All digests are well-formed sha256 hex strings; values are hand-checkable.

import assert from "node:assert/strict";
import { runBenchmark } from "./under-test.mjs";

export const DIGEST_A = "a".repeat(64);
export const DIGEST_B = "b".repeat(64);
export const DIGEST_C = "c".repeat(64);
export const DIGEST_D = "d".repeat(64);
export const DIGEST_E = "e".repeat(64);
export const NOT_A_DIGEST = "zzzz";

export const CLASS = "gltf-pipeline";

export const M_PASS = "correctness/conformance-pass-rate"; // higher-is-better, ratio
export const M_AGREE = "correctness/differential-agreement-rate"; // higher-is-better, ratio
export const M_COVER = "coverage/corpus-item-coverage"; // higher-is-better, ratio
export const M_FAIL = "reliability/failure-rate"; // lower-is-better, ratio
export const M_LAT = "performance/median-latency-ms"; // lower-is-better, ms, tolerance 5
export const M_MEM = "performance/peak-memory-mb"; // lower-is-better, MB, tolerance 16

export function measurement(metricId, value, digest = DIGEST_A, samples = 30) {
  return { metricId, value, samples, evidenceDigest: digest };
}

export function corpusFixture(overrides = {}) {
  return {
    kind: "benchmark-corpus",
    id: "corpus/gltf-reference-v1",
    version: 1,
    capabilityClass: CLASS,
    provenance: {
      repeatability: {
        kind: "deterministic-seeded",
        generatorId: "fixture-generator",
        generatorVersion: "1.0.0",
        seed: "seed-0001",
      },
      rights: { licenseId: "CC0-1.0", permitsBenchmarkUse: true, clarity: "clear" },
      notes: "fixture corpus",
    },
    items: [
      { id: "item-0001", contentDigest: DIGEST_A, bytes: 1024 },
      { id: "item-0002", contentDigest: DIGEST_B, bytes: 2048 },
      { id: "item-0003", contentDigest: DIGEST_C, bytes: 512 },
    ],
    ...overrides,
  };
}

export function descriptorFixture(overrides = {}) {
  return {
    kind: "benchmark-descriptor",
    id: "bench/gltf-fidelity",
    version: 2,
    capabilityClass: CLASS,
    corpus: { corpusId: "corpus/gltf-reference-v1", corpusVersion: 1, corpusDigest: DIGEST_D },
    metricSelections: [
      {
        metricId: M_PASS,
        weight: 0.3,
        qualificationThreshold: 0.95,
        differential: { comparableTolerance: 0.02, superiorityMargin: 0.05 },
      },
      {
        metricId: M_AGREE,
        weight: 0.2,
        qualificationThreshold: 0.9,
        differential: { comparableTolerance: 0.02, superiorityMargin: 0.05 },
      },
      { metricId: M_COVER, weight: 0.2, qualificationThreshold: 0.98 },
      { metricId: M_FAIL, weight: 0.1, qualificationThreshold: 0.01 },
      { metricId: M_LAT, weight: 0.2, qualificationThreshold: 250 },
    ],
    hardConstraints: [
      { metricId: M_FAIL, kind: "maximum", value: 0.02, rationale: "hard ceiling on unplanned failures" },
    ],
    qualificationPolicy: { minQualifiedMetrics: 4, minDifferentialMetrics: 2, evidenceRequired: true },
    notes: "fixture descriptor",
    ...overrides,
  };
}

export function cutFixture(overrides = {}) {
  return {
    kind: "capability-under-test",
    capabilityId: "capability/gltf-candidate",
    capabilityClass: CLASS,
    version: "1.4.2",
    currentStatus: "prototype",
    measurements: [
      measurement(M_PASS, 0.97, DIGEST_A),
      measurement(M_AGREE, 0.93, DIGEST_B),
      measurement(M_COVER, 0.99, DIGEST_C),
      measurement(M_FAIL, 0.005, DIGEST_D),
      measurement(M_LAT, 210, DIGEST_E),
    ],
    evidence: [
      { digest: DIGEST_A, source: "measurement-record", benchmarkId: "bench/gltf-fidelity", benchmarkVersion: 2, capturedAtEpoch: 100 },
      { digest: DIGEST_B, source: "measurement-record", benchmarkId: "bench/gltf-fidelity", benchmarkVersion: 2, capturedAtEpoch: 100 },
    ],
    knownLimits: [],
    ...overrides,
  };
}

export function referenceFixture(overrides = {}) {
  return {
    kind: "reference-run",
    referenceId: "capability/gltf-reference",
    referenceVersion: "3.2.0",
    benchmarkId: "bench/gltf-fidelity",
    benchmarkVersion: 2,
    measurements: [
      measurement(M_PASS, 0.96, DIGEST_A),
      measurement(M_AGREE, 0.92, DIGEST_B),
      measurement(M_COVER, 0.995, DIGEST_C),
      measurement(M_FAIL, 0.004, DIGEST_D),
      measurement(M_LAT, 200, DIGEST_E),
    ],
    recordedAtEpoch: 95,
    ...overrides,
  };
}

export function severeLimitFixture(overrides = {}) {
  return {
    id: "limit/large-corpus-memory",
    scope: "corpora above 100k items exceed the memory budget",
    affectedMetrics: [M_MEM],
    severity: "severe",
    mitigation: "none",
    acknowledgedAtEpoch: 90,
    ...overrides,
  };
}

export function supportingRef(result, capturedAtEpoch) {
  return {
    resultDigest: result.resultDigest,
    benchmarkId: result.benchmarkId,
    benchmarkVersion: result.benchmarkVersion,
    descriptorDigest: result.descriptorDigest,
    capturedAtEpoch,
    decision: result.decision,
  };
}

export function releaseCandidateFixture(overrides = {}) {
  return {
    kind: "release-candidate",
    capabilityId: "capability/gltf-candidate",
    capabilityClass: CLASS,
    version: "1.4.2",
    qualificationStatus: "named-task-qualified",
    supportingResults: [],
    knownLimits: [],
    ...overrides,
  };
}

export function releasePolicyFixture(overrides = {}) {
  return {
    requiredStatus: "named-task-qualified",
    currentEpoch: 200,
    maxEvidenceAgeEpochs: 50,
    requiredBenchmarkIds: ["bench/gltf-fidelity"],
    maxUnmitigatedSevereLimits: 0,
    ...overrides,
  };
}

export function run(descriptor, cut, reference) {
  const outcome = runBenchmark(descriptor, cut, reference);
  assert.ok(outcome.ok, `fixture benchmark must run: ${JSON.stringify(outcome.error)}`);
  return outcome.result;
}
