import { createHash } from "node:crypto";
import {
  applyGeneralization,
  defineMeasurementSnapshot,
  defineReusePolicy,
  extractLearningCandidate,
  validateGeneralization,
} from "../../packages/epoch-capability-learning/dist/index.js";
import type {
  BehaviorDraft,
  GeneralizationValidation,
  HeldOutReplayCase,
  HumanIntervention,
  LearningCandidate,
  MeasurementSnapshot,
  OriginalReplayCase,
  ReplayObservation,
  ReuseContext,
  ReusePolicy,
  RollbackPlan,
  RollbackTrigger,
  ScopeDimension,
} from "../../packages/epoch-capability-learning/dist/index.js";

export function hex(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export const capabilityAlpha = {
  capabilityId: "cap/alpha",
  capabilityDigest: hex("capability-alpha"),
};

export const capabilityBeta = {
  capabilityId: "cap/beta",
  capabilityDigest: hex("capability-beta"),
};

export const episodeOne = {
  episodeId: "ep-001",
  interventionDigest: hex("intervention-001"),
  occurredInEpoch: "epoch-e02",
};

export const alice: HumanIntervention = {
  actorId: "human/alice",
  role: "operator",
  interventionDigest: hex("human-alice-001"),
};

export const bob: HumanIntervention = {
  actorId: "human/bob",
  role: "reviewer",
  interventionDigest: hex("human-bob-001"),
};

export const projectContext: ReuseContext = {
  kind: "project",
  projectId: "proj/epoch",
  organizationId: "org/zcode",
};

export function projectPolicy(declaredBy: string = "human/alice"): ReusePolicy {
  const definition = defineReusePolicy({
    level: "project-local",
    rights: ["reuse-in-replays", "derive-revisions", "promote-to-capability"],
    declaringProjectId: "proj/epoch",
    declaringOrganizationId: "org/zcode",
    declaredBy,
    basis: {
      kind: "demonstration-provenance",
      detail: "learned from a verified W029 demonstration in proj/epoch",
    },
  });
  if (definition.kind !== "defined") {
    throw new Error(`fixture reuse policy rejected: ${definition.reason}`);
  }
  return definition.policy;
}

export function draftBehavior(): BehaviorDraft {
  return {
    capability: capabilityAlpha,
    intent: "request the missing evidence before acting on an episode",
    preconditions: [{ kind: "evidence", description: "the episode record is loaded" }],
    steps: [
      {
        stepId: "step/observe",
        kind: "observe",
        description: "read the episode record",
        usesCapabilityId: null,
      },
      {
        stepId: "step/request",
        kind: "request-evidence",
        description: "request the missing evidence",
        usesCapabilityId: null,
      },
      {
        stepId: "step/verify",
        kind: "verify-outcome",
        description: "verify the recorded outcome",
        usesCapabilityId: null,
      },
    ],
    postconditions: [{ kind: "evidence", description: "the missing evidence is recorded" }],
  };
}

export function makeCandidate(): LearningCandidate {
  const extraction = extractLearningCandidate({
    source: {
      exportDigest: hex("w029-export-001"),
      demonstrationDigest: hex("w029-demo-001"),
      outcomeDigest: hex("w029-outcome-001"),
      episodeId: "ep-001",
      verification: "verified",
      outcome: "success",
    },
    behavior: draftBehavior(),
    reuse: projectPolicy(),
    authoredBy: "human/alice",
  });
  if (extraction.kind !== "extracted") {
    throw new Error(`fixture candidate rejected: ${extraction.reason}`);
  }
  return extraction.candidate;
}

export function variantCandidate(): LearningCandidate {
  const behavior = draftBehavior();
  const extraction = extractLearningCandidate({
    source: {
      exportDigest: hex("w029-export-002"),
      demonstrationDigest: hex("w029-demo-002"),
      outcomeDigest: hex("w029-outcome-002"),
      episodeId: "ep-002",
      verification: "verified",
      outcome: "success",
    },
    behavior: { ...behavior, intent: "verify evidence provenance before reuse" },
    reuse: projectPolicy(),
    authoredBy: "human/carol",
  });
  if (extraction.kind !== "extracted") {
    throw new Error(`fixture variant rejected: ${extraction.reason}`);
  }
  return extraction.candidate;
}

export const dims = (value: string): ScopeDimension[] => [
  { dimension: "environment", value },
];

export const pass = (seed: string): ReplayObservation => ({
  kind: "pass",
  observationDigest: hex(seed),
});

export const fail = (seed: string): ReplayObservation => ({
  kind: "fail",
  observationDigest: hex(seed),
  failureKinds: ["wrong-evidence-requested"],
});

export const inconclusive = (seed: string): ReplayObservation => ({
  kind: "inconclusive",
  observationDigest: hex(seed),
  cause: "replay environment unavailable",
});

export function originalCase(
  linkedDemonstrationDigest: string,
  dimensions: ScopeDimension[],
  observed: ReplayObservation | null,
): OriginalReplayCase {
  return {
    kind: "original",
    caseId: "case/original",
    linkedDemonstrationDigest,
    dimensions,
    environmentRef: "env/ci",
    observed,
  };
}

export function heldOutCase(
  caseId: string,
  representative: boolean,
  dimensions: ScopeDimension[],
  observed: ReplayObservation | null,
): HeldOutReplayCase {
  return {
    kind: "held-out",
    caseId,
    representative,
    dimensions,
    environmentRef: "env/ci",
    observed,
  };
}

function appliedCandidate(
  candidate: LearningCandidate,
  validation: GeneralizationValidation,
): LearningCandidate {
  const application = applyGeneralization(candidate, validation);
  if (application.kind !== "applied") {
    throw new Error(`fixture application refused: ${application.reason}`);
  }
  return application.candidate;
}

export function generalizingCandidate(): LearningCandidate {
  const candidate = makeCandidate();
  const validation = validateGeneralization(
    candidate,
    [
      originalCase(candidate.source.demonstrationDigest, dims("ci"), pass("obs-original")),
      heldOutCase("case/held-ci", true, dims("ci"), pass("obs-held-ci")),
    ],
    null,
  );
  if (validation.kind !== "generalized") {
    throw new Error(`fixture generalization failed: ${validation.reason}`);
  }
  return appliedCandidate(candidate, validation);
}

export function rejectedCandidate(): LearningCandidate {
  const candidate = makeCandidate();
  const validation = validateGeneralization(candidate, [], null);
  if (validation.kind !== "rejected") {
    throw new Error("fixture rejection failed");
  }
  return appliedCandidate(candidate, validation);
}

export interface SnapshotOptions {
  readonly epochRef?: string;
  readonly qualityScore?: number;
  readonly safetyScore?: number;
  readonly incidents?: number;
  readonly routine?: number;
  readonly expert?: number;
  readonly qualified?: boolean;
}

export function makeSnapshot(options: SnapshotOptions = {}): MeasurementSnapshot {
  const definition = defineMeasurementSnapshot({
    epochRef: options.epochRef ?? "epoch-e03",
    evaluation: {
      decisionDigest: hex("w030-decision-001"),
      outcome: options.qualified === false ? "not-qualified" : "qualified",
    },
    quality: {
      score: options.qualityScore ?? 0.8,
      benchmarkRef: "bench/quality-v1",
      sampleCount: 12,
    },
    safety: {
      score: options.safetyScore ?? 0.99,
      incidents: options.incidents ?? 0,
      evidenceDigest: hex("safety-evidence-001"),
    },
    interventionCost: {
      routineInterventions: options.routine ?? 2,
      expertEscalations: options.expert ?? 1,
      meanStepsPerEpisode: 4.5,
    },
    measurementBasis: "post-promotion observation window",
  });
  if (definition.kind !== "defined") {
    throw new Error(`fixture snapshot rejected: ${definition.reason}`);
  }
  return definition.snapshot;
}

export function rollbackPlan(author: HumanIntervention): RollbackPlan {
  return {
    previousStateRef: "state/pre-promotion-001",
    triggers: [
      { metric: "quality", comparator: "drops-below", threshold: 0.5 },
      { metric: "intervention-cost", comparator: "rises-above", threshold: 40 },
    ],
    authoredBy: author,
  };
}

export const qualityTrigger = (threshold: number): RollbackTrigger => ({
  metric: "quality",
  comparator: "drops-below",
  threshold,
});
