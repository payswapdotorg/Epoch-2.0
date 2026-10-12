import test from "node:test";
import assert from "node:assert/strict";
import { sealReturnPackage } from "../src/return.js";
import { decideReuseRights } from "../src/reuse.js";
import type { ArenaReturnDraft } from "../src/types-return.js";
import {
  CLOCK,
  emptyDraft,
  goodDraft,
  makeTaskPackage,
  REUSE_POLICY,
} from "./fixtures.js";

const DECIDED_AT = CLOCK.decidedAt;

function sealedGood() {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(goodDraft(task), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  return { task, ret };
}

test("granted scopes intersected with policy yield reuse-permitted when fully covered", () => {
  const { ret } = sealedGood();
  const decision = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
  });
  assert.equal(decision.decision, "reuse-permitted");
  assert.deepEqual(decision.permittedScopes, [
    "capability-promotion",
    "demonstration-capture",
  ]);
  assert.equal(decision.basis.type, "expert-grant");
  assert.match(decision.decisionId, /^rrd_[0-9a-f]{16}$/);
  assert.ok(decision.conditions.includes("attribute the pseudonymous expert id"));
  assert.ok(decision.conditions.includes("retain provenance digests"));
});

test("grants beyond policy are restricted, not permitted", () => {
  const task = makeTaskPackage();
  const draft = goodDraft(task);
  const wide: ArenaReturnDraft = {
    ...draft,
    reusePermissionRequested: {
      kind: "granted",
      scopes: ["capability-promotion", "internal-analysis"],
      conditions: [],
    },
  };
  const ret = sealReturnPackage(wide, task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const decision = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
  });
  assert.equal(decision.decision, "reuse-restricted");
  assert.deepEqual(decision.permittedScopes, ["capability-promotion"]);
});

test("expert denial is honored", () => {
  const task = makeTaskPackage();
  const draft = goodDraft(task);
  const denied: ArenaReturnDraft = {
    ...draft,
    reusePermissionRequested: {
      kind: "denied",
      reason: "confidential client methodology",
    },
  };
  const ret = sealReturnPackage(denied, task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const decision = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
  });
  assert.equal(decision.decision, "reuse-denied");
  assert.deepEqual(decision.permittedScopes, []);
  assert.equal(decision.basis.type, "expert-denied");
  assert.equal(decision.promotionLink, undefined);
});

test("unspecified requests deny until clarified", () => {
  const task = makeTaskPackage();
  const ret = sealReturnPackage(emptyDraft(), task, {
    arena: "simulated",
    channel: "test",
    submittedAt: CLOCK.submittedAt,
  });
  const decision = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
  });
  assert.equal(decision.decision, "reuse-denied");
  assert.equal(decision.basis.type, "expert-unspecified");
  assert.ok(
    decision.conditions.some((c) => c.includes("clarify reuse permission")),
  );
});

test("promotion and demonstration links appear only for permitted scopes", () => {
  const { ret } = sealedGood();
  const linked = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
    gapDigest: "cd".repeat(32),
    demonstrationDigest: "ef".repeat(32),
  });
  assert.deepEqual(linked.promotionLink, {
    pipeline: "w032-capability-learning",
    gapDigest: "cd".repeat(32),
    status: "linked",
  });
  assert.deepEqual(linked.demonstrationLink, {
    pipeline: "w029-environment-activity",
    demonstrationDigest: "ef".repeat(32),
    status: "linked",
  });
  const bare = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
  });
  assert.equal(bare.promotionLink, undefined);
  assert.equal(bare.demonstrationLink, undefined);
});

test("reuse decisions are independent of verification outcome", () => {
  // A return whose digest was broken (verification would REJECT) still
  // gets its reuse decision recorded — the decision only records
  // permission; it never authorizes acting on the content.
  const { ret } = sealedGood();
  const tampered = { ...ret, digest: "0".repeat(64) };
  const decision = decideReuseRights(tampered, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
  });
  assert.equal(decision.decision, "reuse-permitted");
  assert.equal(decision.returnDigest, "0".repeat(64));
});

test("decisions are deterministic", () => {
  const { ret } = sealedGood();
  const a = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
    gapDigest: "cd".repeat(32),
  });
  const b = decideReuseRights(ret, {
    decidedAt: DECIDED_AT,
    policy: REUSE_POLICY,
    gapDigest: "cd".repeat(32),
  });
  assert.equal(a.digest, b.digest);
  assert.equal(a.decisionId, b.decisionId);
});

test("invalid decidedAt throws", () => {
  const { ret } = sealedGood();
  assert.throws(
    () => decideReuseRights(ret, { decidedAt: "soon", policy: REUSE_POLICY }),
    TypeError,
  );
});
