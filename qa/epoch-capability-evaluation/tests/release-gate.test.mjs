import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRelease } from "./under-test.mjs";
import {
  cutFixture,
  descriptorFixture,
  referenceFixture,
  releaseCandidateFixture,
  releasePolicyFixture,
  run,
  severeLimitFixture,
  supportingRef,
} from "./fixtures.mjs";

test("approves a qualified candidate with fresh evidence", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  const candidate = releaseCandidateFixture({
    qualificationStatus: result.decision.to,
    supportingResults: [supportingRef(result, 180)],
  });
  const verdict = evaluateRelease(candidate, releasePolicyFixture());
  assert.equal(verdict.released, true);
  assert.equal(verdict.statusRequirementMet, true);
  assert.deepEqual(verdict.blockers, []);
});

test("blocks candidates below the required status", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  const candidate = releaseCandidateFixture({
    qualificationStatus: "prototype",
    supportingResults: [supportingRef(result, 180)],
  });
  const verdict = evaluateRelease(candidate, releasePolicyFixture());
  assert.equal(verdict.released, false);
  assert.equal(verdict.statusRequirementMet, false);
  assert.ok(verdict.blockers.some((blocker) => blocker.code === "release/status-below-required"));
});

test("blocks stale evidence", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  const candidate = releaseCandidateFixture({
    qualificationStatus: result.decision.to,
    supportingResults: [supportingRef(result, 100)],
  });
  const verdict = evaluateRelease(candidate, releasePolicyFixture());
  assert.equal(verdict.released, false);
  assert.deepEqual(verdict.staleEvidenceDigests, [result.resultDigest]);
  assert.ok(verdict.blockers.some((blocker) => blocker.code === "release/stale-evidence"));
});

test("blocks candidates without supporting results", () => {
  const candidate = releaseCandidateFixture({ supportingResults: [] });
  const verdict = evaluateRelease(candidate, releasePolicyFixture());
  assert.equal(verdict.released, false);
  assert.ok(verdict.blockers.some((blocker) => blocker.code === "release/no-supporting-results"));
});

test("blocks when a required benchmark is missing", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  const candidate = releaseCandidateFixture({
    qualificationStatus: result.decision.to,
    supportingResults: [supportingRef(result, 180)],
  });
  const verdict = evaluateRelease(candidate, releasePolicyFixture({ requiredBenchmarkIds: ["bench/other-fidelity"] }));
  assert.equal(verdict.released, false);
  assert.ok(verdict.blockers.some((blocker) => blocker.code === "release/missing-required-benchmark"));
});

test("blocks unqualified supporting results", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  const ref = supportingRef(result, 180);
  const candidate = releaseCandidateFixture({
    qualificationStatus: result.decision.to,
    supportingResults: [{ ...ref, decision: { ...ref.decision, qualifiedForRelease: false } }],
  });
  const verdict = evaluateRelease(candidate, releasePolicyFixture());
  assert.equal(verdict.released, false);
  assert.ok(verdict.blockers.some((blocker) => blocker.code === "release/unqualified-supporting-result"));
});

test("blocks unmitigated severe known limits but not mitigated ones", () => {
  const result = run(descriptorFixture(), cutFixture(), referenceFixture());
  const base = {
    qualificationStatus: result.decision.to,
    supportingResults: [supportingRef(result, 180)],
  };
  const unmitigated = evaluateRelease(
    releaseCandidateFixture({ ...base, knownLimits: [severeLimitFixture()] }),
    releasePolicyFixture(),
  );
  assert.equal(unmitigated.released, false);
  assert.ok(unmitigated.blockers.some((blocker) => blocker.code === "release/unmitigated-severe-limits"));
  const mitigated = evaluateRelease(
    releaseCandidateFixture({ ...base, knownLimits: [severeLimitFixture({ mitigation: "tracked-mitigation" })] }),
    releasePolicyFixture(),
  );
  assert.equal(mitigated.released, true);
});
