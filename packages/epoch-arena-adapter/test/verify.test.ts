import test from "node:test";
import assert from "node:assert/strict";
import { sealReturnPackage } from "../src/return.js";
import { acceptanceFromQualification } from "../src/task.js";
import type { AcceptanceSpec } from "../src/types-task.js";
import { standardCriterionVerifier, verifyReturn } from "../src/verify.js";
import {
  CLOCK,
  goodDraft,
  makeTaskPackage,
  partialDraft,
  tamperAttestation,
} from "./fixtures.js";

type Draft = Parameters<typeof sealReturnPackage>[0];
type Task = Parameters<typeof sealReturnPackage>[1];

function seal(draft: Draft, task: Task, submittedAt = CLOCK.submittedAt) {
  return sealReturnPackage(draft, task, {
    arena: "simulated",
    channel: "test",
    submittedAt,
  });
}

function specFor(task: Task): AcceptanceSpec {
  return acceptanceFromQualification(task.qualification, task.digest);
}

test("a fully compliant return verifies", () => {
  const task = makeTaskPackage();
  const ret = seal(goodDraft(task), task);
  const v = verifyReturn(
    ret,
    specFor(task),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(v.kind, "verified");
  if (v.kind === "verified") {
    assert.equal(v.acceptanceFraction, 1);
    assert.equal(v.outcomes.length, 4);
    assert.equal(v.outcomes.every((o) => o.status === "met"), true);
    assert.equal(v.returnDigest, ret.digest);
  }
});

test("must-have unmet rejects with a typed reason", () => {
  const task = makeTaskPackage();
  const draft = goodDraft(task);
  const noAnalysis = {
    ...draft,
    deliverables: [{ ...draft.deliverables[1] }],
  };
  const ret = seal(noAnalysis, task);
  const v = verifyReturn(
    ret,
    specFor(task),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(v.kind, "rejected");
  if (v.kind === "rejected") {
    assert.equal(
      v.reasons.some(
        (r) => r.type === "must-have-unmet" && r.criterionId === "must-analysis",
      ),
      true,
    );
  }
});

test("must-haves can never be partially met", () => {
  const task = makeTaskPackage();
  const ret = seal(partialDraft(task), task); // exactly one deliverable
  const spec: AcceptanceSpec = {
    expectedTaskPackageDigest: task.digest,
    deadlineAt: task.qualification.deadlineAt,
    criteria: [
      {
        id: "must-two",
        kind: "must-have",
        description: "two deliverables",
        check: { type: "deliverable-count", min: 2 },
      },
    ],
  };
  const v = verifyReturn(ret, spec, standardCriterionVerifier, CLOCK.verifiedAt);
  assert.equal(v.kind, "rejected");
  if (v.kind === "rejected") {
    assert.equal(
      v.reasons.some(
        (r) => r.type === "must-have-unmet" && r.criterionId === "must-two",
      ),
      true,
    );
  }
});

test("acceptable partial: should-have at or above its floor", () => {
  const task = makeTaskPackage();
  const ret = seal(partialDraft(task), task);
  const v = verifyReturn(
    ret,
    specFor(task),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(v.kind, "partial");
  if (v.kind === "partial") {
    assert.equal(v.acceptable, true);
    assert.equal(v.acceptanceFraction, 0.75);
    assert.equal(
      v.reasons.every((r) => r.type === "should-have-partial" && r.meetsFloor),
      true,
    );
    assert.equal(v.met.length, 2);
    assert.equal(v.partial.length, 2);
    assert.equal(v.unmet.length, 0);
  }
});

test("below-floor partial is not acceptable", () => {
  const task = makeTaskPackage();
  const ret = seal(partialDraft(task), task); // 1 claim
  const spec: AcceptanceSpec = {
    expectedTaskPackageDigest: task.digest,
    deadlineAt: task.qualification.deadlineAt,
    criteria: [
      {
        id: "must-conf",
        kind: "must-have",
        description: "confidence",
        check: { type: "min-confidence", min: 0.7 },
      },
      {
        id: "should-claims-3",
        kind: "should-have",
        description: "three claims",
        check: { type: "evidence-backed-claims", minClaims: 3 },
        partialFloor: 0.5,
      },
    ],
  };
  const v = verifyReturn(ret, spec, standardCriterionVerifier, CLOCK.verifiedAt);
  assert.equal(v.kind, "partial");
  if (v.kind === "partial") {
    assert.equal(v.acceptable, false);
    assert.equal(
      v.reasons.some((r) => r.type === "should-have-partial" && !r.meetsFloor),
      true,
    );
  }
});

test("unmet should-have yields a non-acceptable partial, not a rejection", () => {
  const task = makeTaskPackage();
  const ret = seal(goodDraft(task), task); // no patch-proposal deliverable
  const spec: AcceptanceSpec = {
    expectedTaskPackageDigest: task.digest,
    deadlineAt: "2026-03-01T00:00:00Z",
    criteria: [
      {
        id: "should-patch",
        kind: "should-have",
        description: "patch proposal present",
        check: { type: "deliverable-kind-present", kind: "patch-proposal" },
        partialFloor: 0,
      },
    ],
  };
  const v = verifyReturn(ret, spec, standardCriterionVerifier, CLOCK.verifiedAt);
  assert.equal(v.kind, "partial");
  if (v.kind === "partial") {
    assert.equal(v.acceptable, false);
    assert.equal(v.reasons.some((r) => r.type === "should-have-unmet"), true);
  }
});

test("late submission rejects with deadline evidence", () => {
  const task = makeTaskPackage();
  const ret = seal(goodDraft(task), task, "2026-03-02T00:00:00Z");
  const v = verifyReturn(
    ret,
    specFor(task),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(v.kind, "rejected");
  if (v.kind === "rejected") {
    const late = v.reasons.find((r) => r.type === "late-submission");
    assert.notEqual(late, undefined);
    if (late !== undefined && late.type === "late-submission") {
      assert.equal(late.deadline, "2026-03-01T00:00:00Z");
      assert.equal(late.submittedAt, "2026-03-02T00:00:00Z");
    }
  }
});

test("structural tampering rejects before criteria are evaluated", () => {
  const task = makeTaskPackage();
  const ret = tamperAttestation(seal(goodDraft(task), task));
  const v = verifyReturn(
    ret,
    specFor(task),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(v.kind, "rejected");
  if (v.kind === "rejected") {
    assert.equal(v.reasons.some((r) => r.type === "digest-mismatch"), true);
  }
});

test("wrong task provenance rejects", () => {
  const taskA = makeTaskPackage();
  const taskB = makeTaskPackage("2026-02-02T09:00:00Z");
  const ret = seal(goodDraft(taskA), taskA);
  const spec = acceptanceFromQualification(taskB.qualification, taskB.digest);
  const v = verifyReturn(ret, spec, standardCriterionVerifier, CLOCK.verifiedAt);
  assert.equal(v.kind, "rejected");
  if (v.kind === "rejected") {
    assert.equal(
      v.reasons.some((r) => r.type === "task-package-mismatch"),
      true,
    );
  }
});

test("empty criteria verify trivially", () => {
  const task = makeTaskPackage();
  const ret = seal(goodDraft(task), task);
  const spec: AcceptanceSpec = {
    expectedTaskPackageDigest: task.digest,
    deadlineAt: "2026-03-01T00:00:00Z",
    criteria: [],
  };
  const v = verifyReturn(ret, spec, standardCriterionVerifier, CLOCK.verifiedAt);
  assert.equal(v.kind, "verified");
});

test("verifyReturn rejects invalid verifiedAt input", () => {
  const task = makeTaskPackage();
  const ret = seal(goodDraft(task), task);
  assert.throws(
    () =>
      verifyReturn(ret, specFor(task), standardCriterionVerifier, "yesterday"),
    TypeError,
  );
});
