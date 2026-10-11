import { describe, expect, it } from "vitest";
import {
  captureReferenceBehavior,
  digestRefOf,
  evaluateAlternatives,
  evaluateIntake,
  evaluateRightsGate,
  planBenchmark,
  planBuild,
  selectFoundation,
  type DependencyInventoryEntry,
  type DigestRef,
  type FoundationOption,
  type RightsGate,
} from "../../packages/epoch-capability-reproduction/src/index";
import {
  assertRefusal,
  blockedRightsGate,
  clearedRightsGate,
  foundationOptions,
  seedRef,
  unwrap,
  validAlternatives,
  validBehaviorCases,
  validReferenceCapture,
  validRequest,
} from "./factories";

describe("intake", () => {
  it("accepts a bounded request with gap evidence", () => {
    const verdict = evaluateIntake(validRequest());
    expect(verdict.outcome).toBe("accept");
    expect(verdict.codes).toEqual(["accepted"]);
    expect(verdict.requestRef.digest).toBe(digestRefOf(validRequest()).digest);
  });

  it("rejects a request without gap evidence", () => {
    const request = { ...validRequest(), gapEvidenceRefs: [] };
    assertRefusal(evaluateIntake(request), "missing-gap-evidence");
    // @ts-expect-error outcome narrowed by refusal shape below
    const verdict = evaluateIntake(request);
    expect(verdict.outcome).toBe("reject");
  });

  it("rejects an unbounded scope", () => {
    const request = {
      ...validRequest(),
      scope: { includes: [] as string[], excludes: [] as string[] },
    };
    assertRefusal(evaluateIntake(request), "unbounded-scope");
  });

  it("rejects a wildcard capability", () => {
    const request = { ...validRequest(), capabilityId: "*" };
    assertRefusal(evaluateIntake(request), "wildcard-capability");
  });

  it("rejects a scope conflict", () => {
    const request = {
      ...validRequest(),
      scope: {
        includes: ["pdf-export.surface"],
        excludes: ["pdf-export.surface"],
      },
    };
    assertRefusal(evaluateIntake(request), "scope-conflict");
  });
});

describe("alternatives", () => {
  it("accepts a decision-grade analysis with a digest", () => {
    const analysis = validAlternatives();
    const result = unwrap(evaluateAlternatives(analysis));
    expect(result.analysisRef.digest).toBe(digestRefOf(analysis).digest);
  });

  it("rejects too few alternatives", () => {
    const single = [validAlternatives().alternatives[0]!];
    assertRefusal(
      evaluateAlternatives({
        ...validAlternatives(),
        alternatives: single,
      }),
      "too-few-alternatives",
    );
  });

  it("rejects an unknown license classification", () => {
    const base = validAlternatives();
    const unclassified = {
      ...base.alternatives[1]!,
      license: "unknown" as const,
    };
    assertRefusal(
      evaluateAlternatives({
        ...base,
        alternatives: [unclassified, base.alternatives[2]!],
      }),
      "unclassified-license",
    );
  });
});

describe("rights gate", () => {
  it("clears when every required right is held", () => {
    const result = unwrap(evaluateRightsGate(clearedRightsGate()));
    expect(result.state).toBe("cleared");
    expect(result.blockedSubjects).toEqual([]);
    expect(result.checks[0]!.status).toBe("cleared");
  });

  it("blocks when required rights are absent without a remediation plan", () => {
    const result = unwrap(evaluateRightsGate(blockedRightsGate()));
    expect(result.state).toBe("blocked");
    expect(result.blockedSubjects).toEqual(["proprietary dataset"]);
    expect(result.checks[0]!.missingRights).toEqual(["redistribute"]);
  });

  it("stays negotiation-required when a remediation plan is attached", () => {
    const gate: RightsGate = {
      requestId: "req-001",
      checks: [
        {
          subject: "branding assets",
          subjectKind: "branding",
          requiredRights: ["use"],
          heldRights: [],
          licenseRef: null,
          remediationPlanRef: seedRef("remediation"),
        },
      ],
      protectedSources: [],
    };
    const result = unwrap(evaluateRightsGate(gate));
    expect(result.state).toBe("negotiation-required");
    expect(result.checks[0]!.status).toBe("negotiation-required");
  });

  it("keeps protected sources inaccessible without authorization and review", () => {
    const gate: RightsGate = {
      ...clearedRightsGate(),
      protectedSources: [
        {
          subject: "legacy-binary",
          purpose: "decompilation",
          authorizationRefs: [],
          reviewRefs: [],
        },
      ],
    };
    const result = unwrap(evaluateRightsGate(gate));
    expect(result.state).toBe("blocked");
    expect(result.blockedSubjects).toContain("legacy-binary");
    expect(result.protectedAccess[0]!.access).toBe("inaccessible");
  });

  it("authorizes a protected source once authorization and review are attached", () => {
    const gate: RightsGate = {
      ...clearedRightsGate(),
      protectedSources: [
        {
          subject: "legacy-binary",
          purpose: "inspection",
          authorizationRefs: [seedRef("authorization")],
          reviewRefs: [seedRef("review")],
        },
      ],
    };
    const result = unwrap(evaluateRightsGate(gate));
    expect(result.state).toBe("cleared");
    expect(result.protectedAccess[0]!.access).toBe("authorized");
  });
});

describe("reference behavior capture", () => {
  it("captures approved cases from W029 demonstrations by digest", () => {
    const contract = unwrap(captureReferenceBehavior(validReferenceCapture()));
    expect(contract.caseSet.cases).toHaveLength(2);
    expect(contract.caseSet.cases[0]!.demonstrationRef.algorithm).toBe(
      "sha256",
    );
    expect(contract.contractRef.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an empty case set", () => {
    assertRefusal(
      captureReferenceBehavior({
        ...validReferenceCapture(),
        cases: [],
      }),
      "no-cases",
    );
  });

  it("rejects an unapproved case", () => {
    const cases = validBehaviorCases();
    const unapproved = { ...cases[1]!, approvers: [] as string[] };
    assertRefusal(
      captureReferenceBehavior({
        ...validReferenceCapture(),
        cases: [cases[0]!, unapproved],
      }),
      "missing-approvers",
    );
  });
});

describe("foundation selection", () => {
  it("selects the fewest-restrictive eligible foundation", () => {
    const choice = unwrap(selectFoundation(foundationOptions()));
    expect(choice.selected.foundationId).toBe("foundation-permissive");
    expect(choice.policy).toBe(
      "fewest-restrictive-then-smallest-then-stable-id",
    );
  });

  it("breaks ties by size then stable id", () => {
    const dep = (name: string): DependencyInventoryEntry => ({
      name,
      version: "1.0.0",
      license: "MIT",
      classification: "permissive",
      origin: `registry:${name}`,
    });
    const lean: FoundationOption = {
      foundationId: "c-lean",
      dependencies: [dep("only-core")],
    };
    const wideZ: FoundationOption = {
      foundationId: "z-wide",
      dependencies: [dep("core-a"), dep("core-b")],
    };
    const wideA: FoundationOption = {
      foundationId: "a-wide",
      dependencies: [dep("core-c"), dep("core-d")],
    };
    expect(
      unwrap(selectFoundation([wideZ, wideA, lean])).selected.foundationId,
    ).toBe("c-lean");
    expect(unwrap(selectFoundation([wideZ, wideA])).selected.foundationId).toBe(
      "a-wide",
    );
  });

  it("refuses when every option is ineligible", () => {
    const proprietaryOnly = [foundationOptions()[2]!];
    assertRefusal(selectFoundation(proprietaryOnly), "no-eligible-foundation");
  });
});

describe("planning records", () => {
  it("records a build plan with a digest", () => {
    const plan = unwrap(
      planBuild({
        planId: "build-001",
        foundationRef: seedRef("foundation-choice"),
        workItems: ["implement exporter"],
        plannedOutputs: ["mini-app://pdf-export/main"],
      }),
    );
    expect(plan.planRef.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a build plan without work items or outputs", () => {
    assertRefusal(
      planBuild({
        planId: "build-002",
        foundationRef: seedRef("foundation-choice"),
        workItems: [],
        plannedOutputs: ["mini-app://pdf-export/main"],
      }),
      "no-work-items",
    );
    assertRefusal(
      planBuild({
        planId: "build-003",
        foundationRef: seedRef("foundation-choice"),
        workItems: ["implement exporter"],
        plannedOutputs: [],
      }),
      "no-outputs",
    );
  });

  it("binds a benchmark plan to descriptor, case set and candidate", () => {
    const contract = unwrap(captureReferenceBehavior(validReferenceCapture()));
    const plan = unwrap(
      planBenchmark({
        descriptorRef: seedRef("benchmark-descriptor"),
        caseSetRef: contract.caseSet.setRef,
        candidateRef: seedRef("candidate"),
      }),
    );
    expect(plan.planRef.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a benchmark plan with malformed refs", () => {
    const malformed: DigestRef = { algorithm: "sha256", digest: "not-hex" };
    assertRefusal(
      planBenchmark({
        descriptorRef: malformed,
        caseSetRef: seedRef("case-set"),
        candidateRef: seedRef("candidate"),
      }),
      "invalid-ref",
    );
  });
});
