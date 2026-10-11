import { expect } from "vitest";
import {
  applyTransition,
  authorizeRelease,
  captureReferenceBehavior,
  digestBenchmarkDescriptor,
  digestCandidateExport,
  digestDemonstration,
  digestRefOf,
  evaluateAlternatives,
  evaluateIntake,
  evaluateRightsGate,
  openLifecycle,
  planBenchmark,
  planBuild,
  selectFoundation,
  type AlternativesAnalysis,
  type BehaviorCaseCapture,
  type DigestRef,
  type FoundationOption,
  type MiniAppDescriptor,
  type ReleaseGateRecord,
  type ReleasePackage,
  type ReproductionLifecycle,
  type ReproductionRequest,
  type Result,
  type RightsGate,
} from "../../packages/epoch-capability-reproduction/src/index";

type DemonstrationLike = Parameters<typeof digestDemonstration>[0];
type BenchmarkDescriptorLike = Parameters<typeof digestBenchmarkDescriptor>[0];
type CandidateExportLike = Parameters<typeof digestCandidateExport>[0];

export function unwrap<T, C extends string>(result: Result<T, C>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`unexpected refusal: ${result.reason}`);
}

export function assertRefusal<T, C extends string>(
  result: Result<T, C>,
  code: C,
): void {
  if (result.ok) {
    throw new Error(`expected refusal with ${code}, got a value`);
  }
  expect(result.codes).toContain(code);
}

export function seedRef(seed: string): DigestRef {
  return digestRefOf({ seed });
}

export function validRequest(): ReproductionRequest {
  return {
    requestId: "req-001",
    capabilityId: "capability.pdf-export",
    gap: "missing",
    gapEvidenceRefs: [seedRef("gap-evidence")],
    scope: {
      includes: ["pdf-export.surface"],
      excludes: ["pdf-export.legacy-cli"],
    },
    requester: "station-ops",
    rationale:
      "No existing capability renders PDF exports on the workbench surface.",
  };
}

export function validAlternatives(): AlternativesAnalysis {
  return {
    requestId: "req-001",
    alternatives: [
      {
        optionId: "alt-native",
        kind: "native-commercial",
        name: "Commercial PDF Suite",
        license: "proprietary",
        rightsStatus: "negotiation-required",
        provenance: {
          origin: "vendor:pdf-suite",
          sourceRef: seedRef("pdf-suite"),
          declaredLicenses: ["proprietary"],
        },
      },
      {
        optionId: "alt-oss",
        kind: "open-source",
        name: "Open PDF Renderer",
        license: "permissive",
        rightsStatus: "cleared",
        provenance: {
          origin: "https://registry.example/open-pdf-renderer",
          sourceRef: seedRef("open-pdf"),
          declaredLicenses: ["MIT"],
        },
      },
      {
        optionId: "alt-std",
        kind: "standards-based",
        name: "ISO 32000 reference implementation",
        license: "permissive",
        rightsStatus: "cleared",
        provenance: {
          origin: "standards-body:iso-32000",
          sourceRef: seedRef("iso-32000"),
          declaredLicenses: ["MIT"],
        },
      },
    ],
    decisionRationale:
      "No alternative satisfies the bounded scope without proprietary rights.",
  };
}

export function clearedRightsGate(): RightsGate {
  return {
    requestId: "req-001",
    checks: [
      {
        subject: "open-pdf-renderer sources",
        subjectKind: "source",
        requiredRights: ["use", "modify"],
        heldRights: ["use", "modify", "distribute"],
        licenseRef: seedRef("mit-license"),
        remediationPlanRef: null,
      },
    ],
    protectedSources: [],
  };
}

export function blockedRightsGate(): RightsGate {
  return {
    requestId: "req-001",
    checks: [
      {
        subject: "proprietary dataset",
        subjectKind: "dataset",
        requiredRights: ["use", "redistribute"],
        heldRights: ["use"],
        licenseRef: null,
        remediationPlanRef: null,
      },
    ],
    protectedSources: [],
  };
}

export function fakeDemonstration(id: string): DemonstrationLike {
  return {
    kind: "demonstration",
    id,
    activity: "capability.pdf-export",
  } as unknown as DemonstrationLike;
}

export function fakeBenchmarkDescriptor(): BenchmarkDescriptorLike {
  return {
    benchmarkId: "bench-pdf-export",
    differentials: [],
  } as unknown as BenchmarkDescriptorLike;
}

export function fakeCandidateExport(): CandidateExportLike {
  return {
    candidateId: "candidate-pdf-export",
    artifacts: [],
  } as unknown as CandidateExportLike;
}

export function validBehaviorCases(): BehaviorCaseCapture[] {
  return [
    {
      caseId: "case-1",
      demonstrationRef: digestDemonstration(fakeDemonstration("demo-1")),
      expectation: "Exported PDF contains the demonstrated page set.",
      approvers: ["reviewer-a", "reviewer-b"],
      approvalRef: seedRef("approval-1"),
    },
    {
      caseId: "case-2",
      demonstrationRef: digestDemonstration(fakeDemonstration("demo-2")),
      expectation: "Export errors surface as typed workbench events.",
      approvers: ["reviewer-a"],
      approvalRef: seedRef("approval-2"),
    },
  ];
}

export function validReferenceCapture(): {
  readonly contractId: string;
  readonly capabilityId: string;
  readonly cases: readonly BehaviorCaseCapture[];
} {
  return {
    contractId: "rbc-pdf-export",
    capabilityId: "capability.pdf-export",
    cases: validBehaviorCases(),
  };
}

export function foundationOptions(): FoundationOption[] {
  return [
    {
      foundationId: "foundation-copyleft",
      dependencies: [
        {
          name: "left-core",
          version: "1.0.0",
          license: "GPL-3.0",
          classification: "copyleft",
          origin: "registry:left-core",
        },
      ],
    },
    {
      foundationId: "foundation-permissive",
      dependencies: [
        {
          name: "free-core",
          version: "2.0.0",
          license: "MIT",
          classification: "permissive",
          origin: "registry:free-core",
        },
        {
          name: "free-util",
          version: "1.1.0",
          license: "Apache-2.0",
          classification: "permissive",
          origin: "registry:free-util",
        },
      ],
    },
    {
      foundationId: "foundation-proprietary",
      dependencies: [
        {
          name: "closed-core",
          version: "3.0.0",
          license: "proprietary",
          classification: "proprietary",
          origin: "vendor:closed",
        },
      ],
    },
  ];
}

export function validDescriptor(): MiniAppDescriptor {
  return {
    appId: "miniapp.pdf-export",
    displayName: "PDF Export",
    version: "1.0.0",
    capabilityId: "capability.pdf-export",
    integrationMode: "epoch-workbench-surface",
    surface: {
      surfaceAuthority: "@zcode/epoch-application-environment",
      environmentContractRef: seedRef("w028-environment-contract"),
      surfaceId: "surface.document-export",
      entrypoint: "mini-app://pdf-export/main",
      requestedCapabilities: ["workbench.surface.open"],
    },
    foundationRef: seedRef("foundation-choice"),
    behaviorContractRef: seedRef("behavior-contract"),
  };
}

export function greenGates(): ReleaseGateRecord[] {
  const names: readonly string[] = [
    "rights",
    "quality",
    "security",
    "safety",
    "license",
    "provenance",
  ];
  return names.map((name) => ({
    gate: name as ReleaseGateRecord["gate"],
    status: "green" as const,
    evidence: [seedRef(`gate-${name}`)],
  }));
}

export function redQualityGates(): ReleaseGateRecord[] {
  return greenGates().map((gate) =>
    gate.gate === "quality" ? { ...gate, status: "red" as const } : gate,
  );
}

export function releasePackage(): ReleasePackage {
  return {
    version: "1.0.0",
    limits: {
      allowedSurfaces: ["surface.document-export"],
      dataAccess: ["read:demonstrations"],
      expiryCondition: "until benchmark descriptor revision",
    },
    descriptor: validDescriptor(),
  };
}

export function releaseTransition() {
  const reference = unwrap(captureReferenceBehavior(validReferenceCapture()));
  const benchmarkPlan = unwrap(
    planBenchmark({
      descriptorRef: digestBenchmarkDescriptor(fakeBenchmarkDescriptor()),
      caseSetRef: reference.caseSet.setRef,
      candidateRef: digestCandidateExport(fakeCandidateExport()),
    }),
  );
  return {
    kind: "release" as const,
    evidence: [seedRef("evidence-release")],
    benchmarkPlanRef: benchmarkPlan.planRef,
    authorization: unwrap(authorizeRelease(greenGates())),
    release: releasePackage(),
  };
}

export function runToBenchmark(): ReproductionLifecycle {
  const request = validRequest();
  const reference = unwrap(captureReferenceBehavior(validReferenceCapture()));
  const foundation = unwrap(selectFoundation(foundationOptions()));
  let lifecycle = unwrap(openLifecycle(request));
  lifecycle = unwrap(
    applyTransition(lifecycle, {
      kind: "intake-accepted",
      evidence: [seedRef("evidence-intake-accepted")],
      verdict: evaluateIntake(request),
    }),
  );
  lifecycle = unwrap(
    applyTransition(lifecycle, {
      kind: "alternatives-recorded",
      evidence: [seedRef("evidence-alternatives")],
      analysisRef: unwrap(evaluateAlternatives(validAlternatives()))
        .analysisRef,
    }),
  );
  lifecycle = unwrap(
    applyTransition(lifecycle, {
      kind: "rights-cleared",
      evidence: [seedRef("evidence-rights")],
      gate: unwrap(evaluateRightsGate(clearedRightsGate())),
    }),
  );
  lifecycle = unwrap(
    applyTransition(lifecycle, {
      kind: "reference-captured",
      evidence: [seedRef("evidence-reference")],
      contractRef: reference.contractRef,
    }),
  );
  lifecycle = unwrap(
    applyTransition(lifecycle, {
      kind: "foundation-selected",
      evidence: [seedRef("evidence-foundation")],
      choiceRef: foundation.choiceRef,
    }),
  );
  const buildPlan = unwrap(
    planBuild({
      planId: "build-001",
      foundationRef: foundation.choiceRef,
      workItems: ["implement pdf exporter for the workbench surface"],
      plannedOutputs: ["mini-app://pdf-export/main"],
    }),
  );
  lifecycle = unwrap(
    applyTransition(lifecycle, {
      kind: "build-planned",
      evidence: [seedRef("evidence-build")],
      planRef: buildPlan.planRef,
    }),
  );
  return lifecycle;
}

export function runGovernedPath(): ReproductionLifecycle {
  return unwrap(applyTransition(runToBenchmark(), releaseTransition()));
}
