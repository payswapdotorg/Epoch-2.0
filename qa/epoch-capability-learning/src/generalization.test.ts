import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import {
  applyGeneralization,
  declareScope,
  validateGeneralization,
} from "../../../packages/epoch-capability-learning/dist/index.js";
import {
  dims,
  fail,
  heldOutCase,
  inconclusive,
  makeCandidate,
  originalCase,
  pass,
  variantCandidate,
} from "./helpers.js";

test("generalizes when the original and all held-out cases pass", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
      heldOutCase("case/held-canary", false, dims("canary"), pass("obs-held-canary")),
    ],
    null,
  );
  ok(validation.kind === "generalized");
  deepStrictEqual(validation.validatedOn, [
    "case/original",
    "case/held-ci",
    "case/held-canary",
  ]);
  strictEqual(validation.heldOutTotal, 2);
  strictEqual(validation.heldOutPassed, 2);
  strictEqual(validation.representativeHeldOutPassed, true);
  ok(/^[0-9a-f]{64}$/.test(validation.validationDigest));
});

test("rejects a missing original case", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci"))],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "missing-original-case");
});

test("rejects duplicate original cases", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original-2")),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "duplicate-original-cases");
});

test("rejects an original case linked to a different demonstration", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(
        candidate.source.demonstrationDigest.replace(/^./, "f"),
        dims("ci"),
        pass("obs-original"),
      ),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "original-case-mismatch");
});

test("rejects a missing representative held-out case", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", false, dims("ci"), pass("obs-held-ci")),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "missing-held-out-representative-case");
});

test("rejects incomplete observations", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), null),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "incomplete-observations");
});

test("rejects an original-case failure", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), fail("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "original-case-failed");
});

test("rejects an inconclusive original case", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(
        candidate.source.demonstrationDigest,
        dims("ci"),
        inconclusive("obs-original"),
      ),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "original-case-inconclusive");
});

test("rejects held-out failure without a scope proposal (no silent narrowing)", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-prod", true, dims("prod"), fail("obs-held-prod")),
    ],
    null,
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "held-out-failed-without-scope-proposal");
});

test("scopes the candidate when failures sit outside the declared scope", () => {
  const candidate = makeCandidate();
  const scope = declareScope(dims("ci"), "human/alice");
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
      heldOutCase("case/held-prod", true, dims("prod"), fail("obs-held-prod")),
    ],
    scope,
  );
  ok(validation.kind === "scoped");
  strictEqual(validation.scope, scope);
  deepStrictEqual(validation.failingOutsideScope, ["case/held-prod"]);
  deepStrictEqual(validation.validatedInsideScope, ["case/held-ci"]);
  ok(/^[0-9a-f]{64}$/.test(validation.validationDigest));
});

test("rejects a scope that excludes the original case", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
      heldOutCase("case/held-prod", true, dims("prod"), fail("obs-held-prod")),
    ],
    declareScope(dims("prod"), "human/alice"),
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "scope-excludes-original-case");
});

test("rejects a failing case inside the proposed scope", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), fail("obs-held-ci")),
    ],
    declareScope(dims("ci"), "human/alice"),
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "failing-case-inside-proposed-scope");
});

test("rejects a scope without a passing representative held-out case inside it", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-staging", true, dims("staging"), pass("obs-held-staging")),
      heldOutCase("case/held-prod", true, dims("prod"), fail("obs-held-prod")),
    ],
    declareScope(dims("ci"), "human/alice"),
  );
  ok(validation.kind === "rejected");
  strictEqual(validation.reason, "scope-not-validated-on-held-out");
});

test("applyGeneralization refuses a foreign validation", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
    ],
    null,
  );
  ok(validation.kind === "generalized");
  const application = applyGeneralization(variantCandidate(), validation);
  ok(application.kind === "refused");
  strictEqual(application.reason, "candidate-mismatch");
});

test("applyGeneralization stamps the status and re-identifies the candidate", () => {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
    ],
    null,
  );
  ok(validation.kind === "generalized");
  const application = applyGeneralization(candidate, validation);
  ok(application.kind === "applied");
  const stamped = application.candidate.generalization;
  ok(stamped.kind === "generalized");
  deepStrictEqual(stamped.validatedOn, validation.validatedOn);
  ok(application.candidate.candidateId !== candidate.candidateId);
  strictEqual(application.candidate.candidateVersion, candidate.candidateVersion);
});
