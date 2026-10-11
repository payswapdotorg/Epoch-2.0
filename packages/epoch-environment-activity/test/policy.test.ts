import { test } from "node:test";
import assert from "node:assert/strict";

import {
  InvalidPolicyError,
  PolicyViolationError,
  captureDecision,
  consentGranted,
  crossProjectReuseAllowed,
  makeCapturePolicy,
  policyDigest,
  retentionAllowed,
  scopeDecision,
} from "../src/index.js";

const base = {
  policyId: "pol-1",
  subject: "user-1",
  environmentId: "env-1",
  scope: {
    includedEventKinds: ["*"] as readonly string[],
    excludedEventKinds: ["input.key"] as readonly string[],
    includedInitiators: ["human", "agent", "application"] as const,
  },
  consent: { consentId: "c-1", subject: "user-1", state: "granted" as const },
  retention: { allowed: true },
  reuse: { allowed: true, projects: ["*"] as readonly string[] },
};

test("makeCapturePolicy validates scope, consent and permission shapes", () => {
  const policy = makeCapturePolicy(base);
  assert.equal(policy.type, "capture-policy");
  assert.equal(consentGranted(policy), true);
  assert.throws(
    () =>
      makeCapturePolicy({
        ...base,
        scope: { ...base.scope, includedInitiators: ["system" as never] },
      }),
    InvalidPolicyError,
  );
  assert.throws(
    () =>
      makeCapturePolicy({
        ...base,
        consent: { ...base.consent, subject: "someone-else" },
      }),
    InvalidPolicyError,
  );
  assert.throws(
    () => makeCapturePolicy({ ...base, reuse: { allowed: "yes" as never } }),
    InvalidPolicyError,
  );
});

test("scope exclusion wins over inclusion; the wildcard captures non-excluded kinds", () => {
  const policy = makeCapturePolicy(base);
  assert.deepEqual(scopeDecision(policy.scope, "command.invoked", "human"), {
    capturable: true,
    reason: "in-scope",
  });
  assert.deepEqual(scopeDecision(policy.scope, "input.key", "human"), {
    capturable: false,
    reason: "excluded-kind",
  });
  const narrow = makeCapturePolicy({
    ...base,
    scope: {
      includedEventKinds: ["command.invoked"],
      excludedEventKinds: [],
      includedInitiators: ["human"],
    },
  });
  assert.deepEqual(scopeDecision(narrow.scope, "view.changed", "human"), {
    capturable: false,
    reason: "kind-not-included",
  });
  assert.deepEqual(scopeDecision(narrow.scope, "command.invoked", "agent"), {
    capturable: false,
    reason: "initiator-not-included",
  });
});

test("captureDecision enforces consent and scope for every initiator", () => {
  const granted = makeCapturePolicy(base);
  const withdrawn = makeCapturePolicy({
    ...base,
    consent: { ...base.consent, state: "withdrawn" },
  });
  assert.deepEqual(captureDecision([granted], "command.invoked", "agent"), {
    recordable: true,
    reason: "granted-in-scope",
    authorizingPolicy: granted,
  });
  const withdrawnDecision = captureDecision(
    [withdrawn],
    "command.invoked",
    "human",
  );
  assert.equal(withdrawnDecision.recordable, false);
  assert.equal(withdrawnDecision.reason, "consent-not-granted");
  const excluded = captureDecision([granted], "input.key", "human");
  assert.equal(excluded.recordable, false);
  assert.equal(excluded.reason, "excluded-kind");
  const noPolicy = captureDecision([], "command.invoked", "human");
  assert.equal(noPolicy.recordable, false);
  assert.equal(noPolicy.reason, "no-applicable-policy");
});

test("retention and reuse are separate permissions (retention is not reuse)", () => {
  const retentionYesReuseNo = makeCapturePolicy({
    ...base,
    retention: { allowed: true },
    reuse: { allowed: false, projects: [] },
  });
  assert.equal(retentionAllowed(retentionYesReuseNo), true);
  assert.equal(
    crossProjectReuseAllowed(retentionYesReuseNo, "proj-A", "proj-B"),
    false,
  );
  // Flipping retention does not change the reuse decision.
  const retentionNoReuseNo = makeCapturePolicy({
    ...base,
    retention: { allowed: false },
    reuse: { allowed: false, projects: [] },
  });
  assert.equal(retentionAllowed(retentionNoReuseNo), false);
  assert.equal(
    crossProjectReuseAllowed(retentionNoReuseNo, "proj-A", "proj-B"),
    false,
  );
  // Flipping reuse does not change the retention decision.
  const retentionYesReuseYes = makeCapturePolicy({
    ...base,
    retention: { allowed: true },
    reuse: { allowed: true, projects: ["proj-B"] },
  });
  assert.equal(retentionAllowed(retentionYesReuseYes), true);
  assert.equal(
    crossProjectReuseAllowed(retentionYesReuseYes, "proj-A", "proj-B"),
    true,
  );
  // Retention-denied policies still parse and validate — the laws are distinct.
  assert.equal(consentGranted(retentionNoReuseNo), true);
});

test("crossProjectReuseAllowed honors project lists and same-project reuse", () => {
  const listed = makeCapturePolicy({
    ...base,
    reuse: { allowed: true, projects: ["proj-B"] },
  });
  assert.equal(crossProjectReuseAllowed(listed, "proj-A", "proj-A"), true);
  assert.equal(crossProjectReuseAllowed(listed, "proj-A", "proj-B"), true);
  assert.equal(crossProjectReuseAllowed(listed, "proj-A", "proj-C"), false);
  const denied = makeCapturePolicy({
    ...base,
    reuse: { allowed: false, projects: ["proj-B"] },
  });
  assert.equal(crossProjectReuseAllowed(denied, "proj-A", "proj-B"), false);
  assert.equal(crossProjectReuseAllowed(denied, "proj-A", "proj-A"), true);
  // PolicyViolationError is the error family used for permission violations.
  assert.ok(new PolicyViolationError("x") instanceof Error);
});

test("policyDigest is deterministic and key-order independent", () => {
  const a = makeCapturePolicy(base);
  const b = makeCapturePolicy({
    reuse: { allowed: true, projects: ["*"] },
    retention: { allowed: true },
    consent: { consentId: "c-1", subject: "user-1", state: "granted" },
    scope: {
      includedInitiators: ["human", "agent", "application"],
      excludedEventKinds: ["input.key"],
      includedEventKinds: ["*"],
    },
    environmentId: "env-1",
    subject: "user-1",
    policyId: "pol-1",
  });
  assert.equal(policyDigest(a), policyDigest(b));
  const changed = makeCapturePolicy({
    ...base,
    policyId: "pol-2",
  });
  assert.notEqual(policyDigest(a), policyDigest(changed));
});
