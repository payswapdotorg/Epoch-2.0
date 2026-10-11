import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRelease,
  validateBenchmarkDescriptor,
  validateCorpus,
} from "./under-test.mjs";
import {
  corpusFixture,
  cutFixture,
  descriptorFixture,
  referenceFixture,
  releaseCandidateFixture,
  releasePolicyFixture,
  run,
  supportingRef,
} from "./fixtures.mjs";

function reverseKeyOrder(value) {
  if (Array.isArray(value)) {
    return value.map(reverseKeyOrder);
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).reverse()) {
      out[key] = reverseKeyOrder(value[key]);
    }
    return out;
  }
  return value;
}

test("runBenchmark is byte-identical for identical inputs", () => {
  const descriptor = descriptorFixture();
  const cut = cutFixture();
  const reference = referenceFixture();
  const first = run(descriptor, cut, reference);
  const second = run(descriptor, cut, reference);
  assert.deepStrictEqual(first, second);
});

test("runBenchmark digests are independent of object key insertion order", () => {
  const descriptor = descriptorFixture();
  const cut = cutFixture();
  const reference = referenceFixture();
  const first = run(descriptor, cut, reference);
  const second = run(
    reverseKeyOrder(descriptor),
    reverseKeyOrder(cut),
    reverseKeyOrder(reference),
  );
  assert.equal(second.capabilityDigest, first.capabilityDigest);
  assert.equal(second.referenceDigest, first.referenceDigest);
  assert.equal(second.resultDigest, first.resultDigest);
  assert.deepStrictEqual(second, first);
});

test("the full pipeline is reproducible end to end", () => {
  const corpus = corpusFixture();
  const descriptor = descriptorFixture();
  const cut = cutFixture();
  const reference = referenceFixture();
  const pipeline = () => {
    const corpusValidation = validateCorpus(corpus);
    const descriptorValidation = validateBenchmarkDescriptor(descriptor);
    const result = run(descriptor, cut, reference);
    const verdict = evaluateRelease(
      releaseCandidateFixture({
        qualificationStatus: result.decision.to,
        supportingResults: [supportingRef(result, 180)],
      }),
      releasePolicyFixture(),
    );
    return { corpusValidation, descriptorValidation, result, verdict };
  };
  assert.deepStrictEqual(pipeline(), pipeline());
});
