import test from "node:test";
import assert from "node:assert/strict";
import {
  returnPackageDigest,
  sealReturnPackage,
  validateReturnPackage,
} from "../src/return.js";
import { buildArenaTaskPackage } from "../src/task.js";
import {
  CLOCK,
  emptyDraft,
  goodDraft,
  makeQualification,
  makeTaskPackage,
  REDACTION_RULES,
  SOURCES,
  tamperAttestation,
} from "./fixtures.js";

function sealWith(draft: Parameters<typeof sealReturnPackage>[0]) {
  const task = makeTaskPackage();
  return sealReturnPackage(draft, task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
}

test("sealing produces a digest-consistent return", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(goodDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  assert.match(ret.returnId, /^ret_[0-9a-f]{16}$/);
  assert.equal(returnPackageDigest(ret), ret.digest);
  assert.equal(ret.provenance.taskPackageDigest, task.digest);
  assert.equal(ret.provenance.arena, "simulated");
});

test("validation passes for a well-formed return", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(goodDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  assert.equal(validateReturnPackage(ret, task).ok, true);
});

test("tampering after sealing breaks the digest", () => {
  const ret = tamperAttestation(sealWith(goodDraft(makeTaskPackage())));
  const validation = validateReturnPackage(ret, makeTaskPackage());
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(
      validation.issues.some((i) => i.type === "digest-mismatch"),
      true,
    );
  }
});

test("validating against a different task package reports mismatch", () => {
  const taskA = makeTaskPackage();
  const taskB = buildArenaTaskPackage({
    createdAt: "2026-02-02T09:00:00Z",
    gapRefs: [
      {
        gapId: "gap-001",
        capabilityGapDigest: "ab".repeat(32),
        title: "EU card refund flow",
      },
    ],
    sources: SOURCES,
    redactionRules: REDACTION_RULES,
    qualification: makeQualification(),
  });
  const ret = sealReturnPackage(goodDraft(taskA), taskA, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const validation = validateReturnPackage(ret, taskB);
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(
      validation.issues.some((i) => i.type === "task-package-mismatch"),
      true,
    );
  }
});

test("empty deliverables are flagged on receipt", () => {
  const ret = sealWith(emptyDraft());
  const validation = validateReturnPackage(ret, makeTaskPackage());
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(
      validation.issues.some((i) => i.type === "no-deliverables"),
      true,
    );
  }
});

test("unknown evidence references in claims are flagged", () => {
  const task = makeTaskPackage();
  const draft = goodDraft(task);
  const bad = {
    ...draft,
    deliverables: [
      {
        ...draft.deliverables[0],
        claims: [
          {
            claimId: "c-bad",
            statement: "backed by nothing known",
            supportedByEvidence: ["f".repeat(64)],
          },
        ],
      },
    ],
  };
  const ret = sealReturnPackage(bad, task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const validation = validateReturnPackage(ret, task);
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(
      validation.issues.some(
        (i) =>
          i.type === "claim-evidence-ref-unknown" &&
          i.evidenceDigest === "f".repeat(64),
      ),
      true,
    );
  }
});

test("out-of-range confidence and empty attestation are flagged", () => {
  const task = makeTaskPackage();
  const draft = goodDraft(task);
  const badConf = {
    ...draft,
    declaration: { ...draft.declaration, confidence: 1.5 },
  };
  const retConf = sealReturnPackage(badConf, task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const confValidation = validateReturnPackage(retConf, task);
  assert.equal(confValidation.ok, false);
  if (!confValidation.ok) {
    assert.equal(
      confValidation.issues.some(
        (i) => i.type === "invalid-confidence" && i.value === 1.5,
      ),
      true,
    );
  }
  const badAtt = {
    ...draft,
    declaration: { ...draft.declaration, attestation: "   " },
  };
  const retAtt = sealReturnPackage(badAtt, task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const attValidation = validateReturnPackage(retAtt, task);
  assert.equal(attValidation.ok, false);
  if (!attValidation.ok) {
    assert.equal(
      attValidation.issues.some((i) => i.type === "empty-attestation"),
      true,
    );
  }
});
