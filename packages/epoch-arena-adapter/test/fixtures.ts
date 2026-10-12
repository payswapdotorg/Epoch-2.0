/**
 * Shared fixtures (pure data + builders; no test registrations here so
 * that importing from other test files never duplicates tests).
 */
import { buildArenaTaskPackage } from "../src/task.js";
import type { SimulationClock } from "../src/simulate.js";
import type {
  EvidenceSource,
  RedactionRule,
  ReusePolicy,
} from "../src/types-core.js";
import type {
  ArenaReturnDraft,
  ArenaReturnPackage,
  ExpertDeclaration,
} from "../src/types-return.js";
import type {
  ArenaTaskPackage,
  QualificationMetadata,
} from "../src/types-task.js";

export const REDACTION_RULES: readonly RedactionRule[] = [
  {
    ruleId: "redact-live-token",
    literal: "sk-live-SECRET123",
    replacement: "[REDACTED-TOKEN]",
  },
  {
    ruleId: "redact-email",
    literal: "expert@corp.example",
    replacement: "[REDACTED-EMAIL]",
  },
];

export const SOURCES: readonly EvidenceSource[] = [
  {
    sourceId: "gap-record-1",
    kind: "capability-gap",
    tags: ["gap", "payments"],
    payload: {
      kind: "json",
      value: {
        gapId: "gap-001",
        owner: "expert@corp.example",
        summary: "refund-flow knowledge missing",
      },
    },
  },
  {
    sourceId: "demo-1",
    kind: "demonstration",
    tags: ["demo", "payments"],
    payload: {
      kind: "text",
      text: "Demo transcript: refund executed with token sk-live-SECRET123 in sandbox.",
    },
  },
  {
    sourceId: "esc-1",
    kind: "escalation-exchange",
    tags: ["escalation", "internal"],
    payload: {
      kind: "text",
      text: "Internal escalation notes involving expert@corp.example.",
    },
  },
  {
    sourceId: "log-1",
    kind: "environment-log",
    tags: ["ops"],
    payload: { kind: "text", text: "unrelated ops log" },
  },
  {
    sourceId: "demo-2",
    kind: "demonstration",
    tags: ["demo", "payments"],
    payload: { kind: "text", text: "Second demo: chargeback flow." },
  },
];

export const REUSE_POLICY: ReusePolicy = {
  allowedScopes: [
    "capability-promotion",
    "demonstration-capture",
    "world-revision",
  ],
  mandatoryConditions: ["retain provenance digests"],
};

export const CLOCK: SimulationClock = {
  submittedAt: "2026-02-15T12:00:00Z",
  verifiedAt: "2026-02-15T12:05:00Z",
  proposedAt: "2026-02-15T12:10:00Z",
  decidedAt: "2026-02-15T12:15:00Z",
};

export function makeQualification(): QualificationMetadata {
  return {
    scope: {
      objective: "Produce a decision procedure for EU card refund handling",
      domains: ["payments"],
      includesTags: ["gap", "demo", "payments"],
      excludesTags: ["internal"],
      outOfScope: ["live customer PII"],
    },
    budget: {
      currency: "usd",
      maxCents: 50000,
      maxWallClockHours: 72,
      maxEvidenceItems: 3,
    },
    deadlineAt: "2026-03-01T00:00:00Z",
    acceptance: [
      {
        id: "must-analysis",
        kind: "must-have",
        description: "At least one analysis deliverable",
        check: { type: "deliverable-kind-present", kind: "analysis" },
      },
      {
        id: "must-confidence",
        kind: "must-have",
        description: "Expert confidence >= 0.7",
        check: { type: "min-confidence", min: 0.7 },
      },
      {
        id: "should-count",
        kind: "should-have",
        description: "Two deliverables provided",
        check: { type: "deliverable-count", min: 2 },
        partialFloor: 0.5,
      },
      {
        id: "should-claims",
        kind: "should-have",
        description: "Two evidence-backed claims",
        check: { type: "evidence-backed-claims", minClaims: 2 },
        partialFloor: 0.5,
      },
    ],
    requiredExpertise: [{ area: "payments", minYears: 5, credentialRefs: [] }],
  };
}

export function makeTaskPackage(
  createdAt = "2026-02-01T09:00:00Z",
): ArenaTaskPackage {
  return buildArenaTaskPackage({
    createdAt,
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
}

function expertDeclaration(): ExpertDeclaration {
  return {
    expertId: "expert-7f3a",
    expertiseAreas: ["payments"],
    conflictOfInterest: "none-declared",
    confidence: 0.85,
    limitations: ["sandbox-only evidence"],
    attestation: "I attest this analysis is my own independent work.",
    declaredAt: "2026-02-10T00:00:00Z",
  };
}

export function goodDraft(task: ArenaTaskPackage): ArenaReturnDraft {
  const gapEv = task.evidence[0];
  const demoEv = task.evidence[1];
  return {
    deliverables: [
      {
        deliverableId: "d1",
        kind: "analysis",
        claims: [
          {
            claimId: "c1",
            statement: "Refund flow needs idempotency keys",
            supportedByEvidence: [gapEv.payloadDigest],
          },
        ],
        payload: {
          kind: "text",
          text: "Analysis: use idempotency keys per refund intent.",
        },
      },
      {
        deliverableId: "d2",
        kind: "report",
        claims: [
          {
            claimId: "c2",
            statement: "The demo confirms the procedure",
            supportedByEvidence: [demoEv.payloadDigest],
          },
        ],
        payload: {
          kind: "text",
          text: "Report summarizing the demo-backed procedure.",
        },
      },
    ],
    declaration: expertDeclaration(),
    reusePermissionRequested: {
      kind: "granted",
      scopes: ["capability-promotion", "demonstration-capture"],
      conditions: ["attribute the pseudonymous expert id"],
    },
  };
}

export function partialDraft(task: ArenaTaskPackage): ArenaReturnDraft {
  const gapEv = task.evidence[0];
  return {
    deliverables: [
      {
        deliverableId: "d1",
        kind: "analysis",
        claims: [
          {
            claimId: "c1",
            statement: "Refund flow needs idempotency keys",
            supportedByEvidence: [gapEv.payloadDigest],
          },
        ],
        payload: { kind: "text", text: "Analysis only; report pending." },
      },
    ],
    declaration: expertDeclaration(),
    reusePermissionRequested: {
      kind: "granted",
      scopes: ["capability-promotion", "demonstration-capture"],
      conditions: ["attribute the pseudonymous expert id"],
    },
  };
}

export function emptyDraft(): ArenaReturnDraft {
  return {
    deliverables: [],
    declaration: {
      expertId: "expert-0000",
      expertiseAreas: [],
      conflictOfInterest: "none-declared",
      confidence: 0.5,
      limitations: [],
      attestation: "No deliverables produced.",
      declaredAt: "2026-02-10T00:00:00Z",
    },
    reusePermissionRequested: { kind: "unspecified" },
  };
}

export function tamperAttestation(ret: ArenaReturnPackage): ArenaReturnPackage {
  return {
    ...ret,
    declaration: { ...ret.declaration, attestation: "tampered after sealing" },
  };
}
