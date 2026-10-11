import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { authorizeReuse, defineReusePolicy } from "../../packages/epoch-capability-learning/dist/index.js";
import type {
  CandidateRight,
  ReuseBasis,
  ReuseLevel,
  ReusePolicyDraft,
} from "../../packages/epoch-capability-learning/dist/index.js";
import { makeCandidate, projectContext, rejectedCandidate } from "./helpers.js";

interface DraftOverrides {
  level?: ReuseLevel;
  rights?: readonly CandidateRight[];
  declaringProjectId?: string;
  declaredBy?: string;
  basis?: ReuseBasis;
}

function draft(overrides: DraftOverrides): ReusePolicyDraft {
  return {
    level: overrides.level ?? "project-local",
    rights: overrides.rights ?? ["reuse-in-replays", "derive-revisions", "promote-to-capability"],
    declaringProjectId: overrides.declaringProjectId ?? "proj/epoch",
    declaringOrganizationId: "org/zcode",
    declaredBy: overrides.declaredBy ?? "human/alice",
    basis:
      overrides.basis ?? {
        kind: "demonstration-provenance",
        detail: "learned from a verified W029 demonstration",
      },
  };
}

test("defines a policy within its level envelope", () => {
  const definition = defineReusePolicy(draft({}));
  ok(definition.kind === "defined");
  ok(/^[0-9a-f]{64}$/.test(definition.policy.policyDigest));
  strictEqual(definition.policy.level, "project-local");
  deepStrictEqual(definition.policy.rights, [
    "reuse-in-replays",
    "derive-revisions",
    "promote-to-capability",
  ]);
});

test("rejects a right outside the level envelope", () => {
  const definition = defineReusePolicy(draft({ level: "project-local", rights: ["redistribute"] }));
  ok(definition.kind === "rejected");
  strictEqual(definition.reason, "right-exceeds-level-envelope");
});

test("rejects duplicate rights", () => {
  const definition = defineReusePolicy(
    draft({ rights: ["reuse-in-replays", "reuse-in-replays"] }),
  );
  ok(definition.kind === "rejected");
  strictEqual(definition.reason, "duplicate-rights");
});

test("rejects incomplete policy declarations", () => {
  const cases: Array<[ReusePolicyDraft, string]> = [
    [draft({ declaringProjectId: "" }), "missing-identifiers"],
    [draft({ declaredBy: "" }), "missing-declarer"],
    [draft({ basis: { kind: "owner-declaration", detail: " " } }), "missing-basis"],
  ];
  for (const [badDraft, reason] of cases) {
    const definition = defineReusePolicy(badDraft);
    ok(definition.kind === "rejected");
    strictEqual(definition.reason, reason);
  }
});

test("permits a declared right inside the declaring context", () => {
  const decision = authorizeReuse(makeCandidate(), {
    right: "reuse-in-replays",
    context: projectContext,
  });
  ok(decision.kind === "permitted");
  strictEqual(decision.level, "project-local");
});

test("denies an undeclared right", () => {
  const decision = authorizeReuse(makeCandidate(), {
    right: "reuse-in-evaluations",
    context: projectContext,
  });
  ok(decision.kind === "denied");
  strictEqual(decision.reason, "right-not-declared");
});

test("denies project-local reuse outside the declaring project", () => {
  const decision = authorizeReuse(makeCandidate(), {
    right: "reuse-in-replays",
    context: { kind: "project", projectId: "proj/other", organizationId: "org/zcode" },
  });
  ok(decision.kind === "denied");
  strictEqual(decision.reason, "context-outside-policy-level");
});

test("denies organization-shared reuse outside the organization", () => {
  const definition = defineReusePolicy(
    draft({ level: "organization-shared", rights: ["reuse-in-replays", "reuse-in-evaluations"] }),
  );
  ok(definition.kind === "defined");
  const candidate = { ...makeCandidate(), reuse: definition.policy };
  const decision = authorizeReuse(candidate, {
    right: "reuse-in-replays",
    context: { kind: "organization", projectId: "proj/any", organizationId: "org/other" },
  });
  ok(decision.kind === "denied");
  strictEqual(decision.reason, "context-outside-policy-level");
});

test("a public policy permits reuse in any context", () => {
  const definition = defineReusePolicy(
    draft({ level: "public", rights: ["reuse-in-replays", "redistribute"] }),
  );
  ok(definition.kind === "defined");
  const candidate = { ...makeCandidate(), reuse: definition.policy };
  const decision = authorizeReuse(candidate, {
    right: "redistribute",
    context: { kind: "public", projectId: "proj/anywhere", organizationId: "org/anywhere" },
  });
  ok(decision.kind === "permitted");
});

test("denies promotion while generalization is pending", () => {
  const decision = authorizeReuse(makeCandidate(), {
    right: "promote-to-capability",
    context: projectContext,
  });
  ok(decision.kind === "denied");
  strictEqual(decision.reason, "candidate-generalization-pending");
});

test("a rejected candidate may only be reused to derive revisions", () => {
  const candidate = rejectedCandidate();
  const replay = authorizeReuse(candidate, {
    right: "reuse-in-replays",
    context: projectContext,
  });
  ok(replay.kind === "denied");
  strictEqual(replay.reason, "candidate-rejected");
  const revision = authorizeReuse(candidate, {
    right: "derive-revisions",
    context: projectContext,
  });
  ok(revision.kind === "permitted");
});
