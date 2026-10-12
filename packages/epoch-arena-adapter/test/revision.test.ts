import test from "node:test";
import assert from "node:assert/strict";
import { sealReturnPackage } from "../src/return.js";
import { proposeWorldRevision } from "../src/revision.js";
import { acceptanceFromQualification } from "../src/task.js";
import type { AcceptanceSpec } from "../src/types-task.js";
import type { WorldChange } from "../src/types-verdict.js";
import { standardCriterionVerifier, verifyReturn } from "../src/verify.js";
import {
  CLOCK,
  emptyDraft,
  goodDraft,
  makeTaskPackage,
  partialDraft,
} from "./fixtures.js";

const PROPOSED_AT = CLOCK.proposedAt;

function verifiedGood() {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(goodDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const verification = verifyReturn(
    ret,
    acceptanceFromQualification(task.qualification, task.digest),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  return { task, ret, verification };
}

test("an accepted return yields a digest-sealed world-revision proposal", () => {
  const { task, ret, verification } = verifiedGood();
  const result = proposeWorldRevision(task, ret, verification, {
    createdAt: PROPOSED_AT,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const p = result.proposal;
    assert.match(p.proposalId, /^wrp_[0-9a-f]{16}$/);
    assert.equal(p.schemaVersion, "1");
    assert.equal(p.basedOn.taskPackageDigest, task.digest);
    assert.equal(p.basedOn.returnDigest, ret.digest);
    assert.equal(p.basedOn.outcome, "verified");
    assert.equal(p.basedOn.acceptanceFraction, 1);
    const gapLinks = p.changes.filter(
      (c): c is Extract<WorldChange, { changeKind: "link-capability-gap" }> =>
        c.changeKind === "link-capability-gap",
    );
    assert.equal(gapLinks.length, 1);
    assert.equal(gapLinks[0].gapDigest, task.gapRefs[0].capabilityGapDigest);
    assert.equal(gapLinks[0].gapId, "gap-001");
    assert.equal(
      p.changes.some((c) => c.changeKind === "append-knowledge"),
      true,
    );
  }
});

test("a rejected return blocks the proposal with a typed reason", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(emptyDraft(), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const verification = verifyReturn(
    ret,
    acceptanceFromQualification(task.qualification, task.digest),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(verification.kind, "rejected");
  const result = proposeWorldRevision(task, ret, verification, {
    createdAt: PROPOSED_AT,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.blocked, [
      { type: "return-rejected", returnDigest: ret.digest },
    ]);
  }
});

test("an unacceptable partial blocks the proposal", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(partialDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
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
  const verification = verifyReturn(
    ret,
    spec,
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(verification.kind, "partial");
  if (verification.kind === "partial") {
    assert.equal(verification.acceptable, false);
  }
  const result = proposeWorldRevision(task, ret, verification, {
    createdAt: PROPOSED_AT,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.blocked, [
      {
        type: "partial-not-acceptable",
        returnDigest: ret.digest,
        acceptanceFraction: (1 + 1 / 3) / 2,
      },
    ]);
  }
});

test("an acceptable partial yields a proposal marked partial", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(partialDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const verification = verifyReturn(
    ret,
    acceptanceFromQualification(task.qualification, task.digest),
    standardCriterionVerifier,
    CLOCK.verifiedAt,
  );
  assert.equal(verification.kind, "partial");
  const result = proposeWorldRevision(task, ret, verification, {
    createdAt: PROPOSED_AT,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.proposal.basedOn.outcome, "partial");
    assert.equal(result.proposal.basedOn.acceptanceFraction, 0.75);
  }
});

test("extra changes are appended and proposals are deterministic", () => {
  const { task, ret, verification } = verifiedGood();
  const extra: WorldChange[] = [
    {
      changeKind: "append-knowledge",
      topic: "extra",
      content: "an additional note from the host",
    },
  ];
  const a = proposeWorldRevision(task, ret, verification, {
    createdAt: PROPOSED_AT,
    extraChanges: extra,
  });
  const b = proposeWorldRevision(task, ret, verification, {
    createdAt: PROPOSED_AT,
    extraChanges: extra,
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (a.ok && b.ok) {
    assert.equal(a.proposal.digest, b.proposal.digest);
    assert.equal(a.proposal.proposalId, b.proposal.proposalId);
    assert.equal(
      a.proposal.changes.some(
        (c) => c.changeKind === "append-knowledge" && c.topic === "extra",
      ),
      true,
    );
  }
});

test("invalid createdAt throws", () => {
  const { task, ret, verification } = verifiedGood();
  assert.throws(
    () => proposeWorldRevision(task, ret, verification, { createdAt: "soon" }),
    TypeError,
  );
});
