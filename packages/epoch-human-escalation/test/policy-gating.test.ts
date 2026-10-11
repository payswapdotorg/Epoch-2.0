import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EscalationError,
  advanceStep,
  init,
  openRequests,
  request,
  resolve,
} from "../src/index.js";
import { baseQuestion, fullResponse, openPolicy } from "./helpers.js";

test("init rejects an invalid policy with a typed policy-invalid error", () => {
  assert.throws(
    () => init(openPolicy({ minEvidenceRefs: -1 })),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "policy-invalid",
  );
  assert.throws(
    () => init(openPolicy({ allowedQuestionKinds: [] })),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "policy-invalid",
  );
});

test("request rejects a question kind not allowed by the policy (question-kind-not-allowed)", () => {
  const state = init(openPolicy({ allowedQuestionKinds: ["procedural"] }));
  assert.throws(
    () => request(state, baseQuestion({ kind: "factual" })),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "question-kind-not-allowed",
  );
});

test("request rejects too few evidence refs (question-invalid)", () => {
  const state = init(openPolicy({ minEvidenceRefs: 2 }));
  assert.throws(
    () =>
      request(state, baseQuestion({ evidence: [{ digest: "a".repeat(64) }] })),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "question-invalid" &&
      error.details.some((d) => d.field === "evidence"),
  );
});

test("request rejects too few context snapshots (question-invalid)", () => {
  const state = init(openPolicy({ minContextSnapshots: 1 }));
  assert.throws(
    () => request(state, baseQuestion({ contextSnapshots: [] })),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "question-invalid" &&
      error.details.some((d) => d.field === "contextSnapshots"),
  );
});

test("request rejects a question body outside the policy length bounds (question-invalid)", () => {
  const tooShort = init(openPolicy({ minQuestionBodyChars: 10 }));
  assert.throws(
    () => request(tooShort, baseQuestion({ body: "short" })),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "question-invalid",
  );
  const tooLong = init(openPolicy({ maxQuestionBodyChars: 5 }));
  assert.throws(
    () =>
      request(
        tooLong,
        baseQuestion({ body: "This body is far too long for the policy." }),
      ),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "question-invalid",
  );
});

test("request rejects when maxOpenRequests is reached (rate-limit-exceeded)", () => {
  const state = init(
    openPolicy({
      rateLimits: { maxOpenRequests: 1, maxNewRequestsPerStep: 5 },
    }),
  );
  const afterFirst = request(state, baseQuestion()).state;
  assert.equal(openRequests(afterFirst).length, 1);
  assert.throws(
    () =>
      request(
        afterFirst,
        baseQuestion({ body: "A second open request exceeds the budget." }),
      ),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "rate-limit-exceeded",
  );
});

test("request rejects when maxNewRequestsPerStep is reached for the current step (rate-limit-exceeded)", () => {
  const state = init(
    openPolicy({
      rateLimits: { maxOpenRequests: 10, maxNewRequestsPerStep: 1 },
    }),
  );
  const afterFirst = request(state, baseQuestion()).state;
  assert.equal(openRequests(afterFirst).length, 1);
  assert.equal(afterFirst.step, 0);
  assert.throws(
    () =>
      request(
        afterFirst,
        baseQuestion({
          body: "A second request in the same step exceeds the budget.",
        }),
      ),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "rate-limit-exceeded",
  );
});

test("advanceStep re-opens the rate window for new requests", () => {
  let state = init(
    openPolicy({
      rateLimits: { maxOpenRequests: 10, maxNewRequestsPerStep: 1 },
    }),
  );
  state = request(state, baseQuestion()).state;
  state = advanceStep(state);
  const second = request(
    state,
    baseQuestion({ body: "Allowed again in the next step." }),
  );
  assert.equal(second.request.openedAtStep, 1);
});

test("changing the allowed question kinds flips acceptance of the same question (changed behavior)", () => {
  const allowing = init(
    openPolicy({ allowedQuestionKinds: ["factual", "procedural"] }),
  );
  const denying = init(openPolicy({ allowedQuestionKinds: ["procedural"] }));
  const question = baseQuestion({ kind: "factual" });
  assert.equal(
    request(allowing, question).request.kind === question.kind,
    true,
  );
  assert.throws(
    () => request(denying, question),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "question-kind-not-allowed",
  );
});

test("minConfidence flips the same response between accepted and rejected (changed behavior)", () => {
  const response = fullResponse("req-00000001", { confidence: "medium" });
  const lowPolicy = openPolicy({ minConfidence: "low" });
  const highPolicy = openPolicy({ minConfidence: "high" });
  const low = resolve(request(init(lowPolicy), baseQuestion()).state, response);
  assert.equal(low.outcome.kind, "accepted");
  const high = resolve(
    request(init(highPolicy), baseQuestion()).state,
    response,
  );
  assert.equal(high.outcome.kind, "rejected");
  assert.equal(
    high.outcome.kind === "rejected" ? high.outcome.reason : "",
    "confidence-below-threshold",
  );
  assert.equal(high.state.requests["req-00000001"].status, "open");
  assert.equal(high.state.requests["req-00000001"].rejectionCount, 1);
});

test("requireExpertiseOverlap flips acceptance on expertise mismatch (changed behavior)", () => {
  const policy = openPolicy({ requireExpertiseOverlap: true });
  const mismatchedProfile = {
    expertise: ["legal"],
    provenance: {
      providerId: "test-provider",
      expertKey: "expert-7",
      declaredExpertise: ["legal"],
    },
  };
  const state = request(
    init(policy),
    baseQuestion({ requestedExpertise: ["ifc"] }),
  ).state;
  const mismatched = resolve(
    state,
    fullResponse("req-00000001", { answeredBy: mismatchedProfile }),
  );
  assert.equal(mismatched.outcome.kind, "rejected");
  assert.equal(
    mismatched.outcome.kind === "rejected" ? mismatched.outcome.reason : "",
    "expertise-mismatch",
  );
  const matched = resolve(state, fullResponse("req-00000001"));
  assert.equal(matched.outcome.kind, "accepted");
});
