/**
 * CandidateExport (W029 task 4): a provenance-bearing candidate bundle for
 * capability learning — explicitly marked unverified/candidate.
 *
 * Laws:
 *  - producing a demonstration NEVER auto-promotes a capability; the only
 *    status this package can produce is "unverified-candidate" and there is
 *    no promote/verify/approve API here — promotion happens elsewhere, if
 *    ever, under separate authority;
 *  - retention must be permitted by EVERY contributing policy (an export is
 *    retained data);
 *  - cross-project reuse requires the explicit reuse permission of every
 *    contributing policy (retention ≠ reuse — separate permissions).
 */

import { digestRecord, isNonEmptyString } from "./canonical.js";
import type {
  CapturePolicy,
  DemonstrationCoverage,
  SessionRef,
} from "./contract.js";
import { deepFreeze } from "./freeze.js";
import { sameSession } from "./events.js";
import {
  type Demonstration,
  demonstrationDigest,
  isDemonstration,
} from "./demonstrations.js";
import {
  consentGranted,
  crossProjectReuseAllowed,
  isCapturePolicy,
  policyDigest,
  retentionAllowed,
} from "./policy.js";
import { InvalidCandidateError, PolicyViolationError } from "./errors.js";

export type CandidateStatus = "unverified-candidate";
export const CANDIDATE_STATUSES: readonly CandidateStatus[] = [
  "unverified-candidate",
];

export interface ProvenanceInfo {
  readonly originProject: string;
  readonly originatingSessions: readonly SessionRef[];
  readonly policyDigests: readonly string[];
  readonly consentSubjects: readonly string[];
  readonly allConsentGranted: boolean;
  readonly coverage: DemonstrationCoverage;
  readonly preparedBy: string;
  readonly externalRef: string | null;
  readonly notes: readonly string[];
}

export interface CandidatePermissions {
  readonly retentionAllowed: boolean;
  readonly crossProjectReuseAllowed: boolean;
  readonly reuseProjects: readonly string[];
}

export interface CandidateExport {
  readonly type: "candidate-export";
  readonly exportId: string;
  /** The ONLY status this package can produce — never verified/promoted. */
  readonly status: CandidateStatus;
  readonly demonstration: Demonstration;
  readonly demonstrationDigest: string;
  readonly provenance: ProvenanceInfo;
  readonly permissions: CandidatePermissions;
  readonly targetProject: string;
}

export interface CandidateExportInput {
  readonly exportId: string;
  readonly demonstration: Demonstration;
  readonly policies: readonly CapturePolicy[];
  readonly originProject: string;
  readonly targetProject: string;
  readonly preparedBy: string;
  readonly externalRef?: string | null;
  readonly notes?: readonly string[];
}

export function buildCandidateExport(
  input: CandidateExportInput,
): CandidateExport {
  if (input === null || typeof input !== "object") {
    throw new InvalidCandidateError("input must be an object");
  }
  if (!isNonEmptyString(input.exportId)) {
    throw new InvalidCandidateError("exportId must be a non-empty string");
  }
  if (!isNonEmptyString(input.preparedBy)) {
    throw new InvalidCandidateError("preparedBy must be a non-empty string");
  }
  if (!isNonEmptyString(input.originProject)) {
    throw new InvalidCandidateError("originProject must be a non-empty string");
  }
  if (!isNonEmptyString(input.targetProject)) {
    throw new InvalidCandidateError("targetProject must be a non-empty string");
  }
  if (!isDemonstration(input.demonstration)) {
    throw new InvalidCandidateError(
      "demonstration must be a valid Demonstration",
    );
  }
  if (!Array.isArray(input.policies) || input.policies.length === 0) {
    throw new InvalidCandidateError(
      "at least one contributing CapturePolicy is required",
    );
  }
  for (const policy of input.policies) {
    if (!isCapturePolicy(policy)) {
      throw new InvalidCandidateError(
        "policies must be valid CapturePolicy values",
      );
    }
  }
  for (const policy of input.policies) {
    if (!retentionAllowed(policy)) {
      throw new PolicyViolationError(
        `retention-not-permitted: policy '${policy.policyId}' does not permit retention of captured activity, so no durable candidate export can be produced from it`,
      );
    }
  }
  if (input.targetProject !== input.originProject) {
    for (const policy of input.policies) {
      if (
        !crossProjectReuseAllowed(
          policy,
          input.originProject,
          input.targetProject,
        )
      ) {
        throw new PolicyViolationError(
          `cross-project-reuse-not-permitted: policy '${policy.policyId}' does not permit reuse of captured activity in project '${input.targetProject}' (retention and reuse are separate permissions)`,
        );
      }
    }
  }
  const sessions: SessionRef[] = [];
  for (const episode of input.demonstration.episodes) {
    if (!sessions.some((session) => sameSession(session, episode.session))) {
      sessions.push(episode.session);
    }
  }
  const provenance: ProvenanceInfo = {
    originProject: input.originProject,
    originatingSessions: sessions,
    policyDigests: input.policies.map((policy) => policyDigest(policy)),
    consentSubjects: [
      ...new Set(input.policies.map((policy) => policy.subject)),
    ],
    allConsentGranted: input.policies.every((policy) => consentGranted(policy)),
    coverage: input.demonstration.coverage,
    preparedBy: input.preparedBy,
    externalRef: input.externalRef ?? null,
    notes: [...(input.notes ?? [])],
  };
  const candidate: CandidateExport = {
    type: "candidate-export",
    exportId: input.exportId,
    status: "unverified-candidate",
    demonstration: input.demonstration,
    demonstrationDigest: demonstrationDigest(input.demonstration),
    provenance,
    permissions: {
      retentionAllowed: input.policies.every((policy) =>
        retentionAllowed(policy),
      ),
      crossProjectReuseAllowed: input.policies.every((policy) =>
        crossProjectReuseAllowed(
          policy,
          input.originProject,
          input.targetProject,
        ),
      ),
      reuseProjects: [
        ...new Set(
          input.policies.flatMap((policy) => [...policy.reuse.projects]),
        ),
      ],
    },
    targetProject: input.targetProject,
  };
  validateCandidateExport(candidate);
  return deepFreeze(candidate);
}

export function validateCandidateExport(candidate: CandidateExport): void {
  if (candidate === null || typeof candidate !== "object") {
    throw new InvalidCandidateError("candidate must be an object");
  }
  if (candidate.type !== "candidate-export") {
    throw new InvalidCandidateError(
      'candidate.type must be "candidate-export"',
    );
  }
  if (candidate.status !== "unverified-candidate") {
    throw new InvalidCandidateError(
      'candidate status can only be "unverified-candidate" in this package; promotion never happens here',
    );
  }
  if (!isNonEmptyString(candidate.exportId)) {
    throw new InvalidCandidateError("exportId must be a non-empty string");
  }
  if (!isDemonstration(candidate.demonstration)) {
    throw new InvalidCandidateError(
      "candidate.demonstration must be a valid Demonstration",
    );
  }
  if (
    candidate.demonstrationDigest !==
    demonstrationDigest(candidate.demonstration)
  ) {
    throw new InvalidCandidateError(
      "demonstrationDigest does not match the embedded demonstration",
    );
  }
  if (!isNonEmptyString(candidate.targetProject)) {
    throw new InvalidCandidateError("targetProject must be a non-empty string");
  }
  const provenance = candidate.provenance;
  if (provenance === null || typeof provenance !== "object") {
    throw new InvalidCandidateError("provenance must be an object");
  }
  if (
    !isNonEmptyString(provenance.originProject) ||
    !isNonEmptyString(provenance.preparedBy)
  ) {
    throw new InvalidCandidateError(
      "provenance requires non-empty originProject and preparedBy",
    );
  }
  if (
    !Array.isArray(provenance.policyDigests) ||
    provenance.policyDigests.length === 0
  ) {
    throw new InvalidCandidateError(
      "provenance.policyDigests must be a non-empty array",
    );
  }
}

export function isCandidateExport(value: unknown): value is CandidateExport {
  try {
    validateCandidateExport(value as CandidateExport);
    return true;
  } catch {
    return false;
  }
}

export function candidateDigest(candidate: CandidateExport): string {
  return digestRecord(candidate);
}

/** Recompute the embedded demonstration digest and compare (integrity check). */
export function verifyCandidateIntegrity(candidate: CandidateExport): {
  ok: boolean;
  expected: string;
  actual: string;
} {
  const actual = demonstrationDigest(candidate.demonstration);
  const expected = candidate.demonstrationDigest;
  return { ok: actual === expected, expected, actual };
}
