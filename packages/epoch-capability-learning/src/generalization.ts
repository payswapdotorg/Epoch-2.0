import { digestRecord } from "./hashing.js";
import { computeCandidateId } from "./candidates.js";
import type { LearningCandidate } from "./candidates.js";

/**
 * Held-out replay law (W032 §3).
 *
 * A candidate MUST be replayed against its original case AND at least one
 * representative held-out case. When held-out cases fail, the outcome is
 * either an EXPLICIT scope declaration (never a silent narrowing) or a
 * rejection. Replay observations are supplied by the caller — this package
 * has no execution authority and never runs replays itself.
 */

export interface ScopeDimension {
  readonly dimension: string;
  readonly value: string;
}

export interface ScopeDeclaration {
  readonly dimensions: readonly ScopeDimension[];
  readonly declaredBy: string;
  readonly declarationDigest: string;
}

export function declareScope(
  dimensions: readonly ScopeDimension[],
  declaredBy: string,
): ScopeDeclaration {
  const core = { dimensions: [...dimensions], declaredBy };
  return {
    ...core,
    declarationDigest: digestRecord("scope-declaration", core),
  };
}

export type ReplayObservation =
  | { readonly kind: "pass"; readonly observationDigest: string }
  | {
      readonly kind: "fail";
      readonly observationDigest: string;
      readonly failureKinds: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly observationDigest: string;
      readonly cause: string;
    };

/** The original case the candidate was learned from. */
export interface OriginalReplayCase {
  readonly kind: "original";
  readonly caseId: string;
  readonly linkedDemonstrationDigest: string;
  readonly dimensions: readonly ScopeDimension[];
  readonly environmentRef: string;
  readonly observed: ReplayObservation | null;
}

/** A held-out case, marked whether it is representative of the target domain. */
export interface HeldOutReplayCase {
  readonly kind: "held-out";
  readonly caseId: string;
  readonly representative: boolean;
  readonly dimensions: readonly ScopeDimension[];
  readonly environmentRef: string;
  readonly observed: ReplayObservation | null;
}

export type ReplayCase = OriginalReplayCase | HeldOutReplayCase;

export type GeneralizationRejection =
  | "missing-original-case"
  | "duplicate-original-cases"
  | "original-case-mismatch"
  | "missing-held-out-representative-case"
  | "incomplete-observations"
  | "original-case-failed"
  | "original-case-inconclusive"
  | "held-out-failed-without-scope-proposal"
  | "scope-excludes-original-case"
  | "failing-case-inside-proposed-scope"
  | "scope-not-validated-on-held-out";

export type GeneralizationValidation =
  | {
      readonly kind: "generalized";
      readonly validationDigest: string;
      readonly candidateId: string;
      readonly validatedOn: readonly string[];
      readonly heldOutTotal: number;
      readonly heldOutPassed: number;
      readonly representativeHeldOutPassed: boolean;
    }
  | {
      readonly kind: "scoped";
      readonly validationDigest: string;
      readonly candidateId: string;
      readonly scope: ScopeDeclaration;
      readonly failingOutsideScope: readonly string[];
      readonly validatedInsideScope: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly validationDigest: string;
      readonly candidateId: string;
      readonly reason: GeneralizationRejection;
      readonly detail: string;
    };

/**
 * The held-out replay law. Evaluation order: original-case presence and
 * linkage → representative held-out presence → observation completeness →
 * original-case outcome → held-out outcomes (generalized / scoped /
 * rejected). A proposed scope is only valid when the original case is inside
 * it, every failing case is outside it, and at least one representative
 * held-out case inside it passes — anything else is a rejection, never a
 * silent narrowing.
 */
export function validateGeneralization(
  candidate: LearningCandidate,
  cases: readonly ReplayCase[],
  scopeProposal: ScopeDeclaration | null,
): GeneralizationValidation {
  const candidateId = candidate.candidateId;
  let originalCase: OriginalReplayCase | null = null;
  const heldOut: HeldOutReplayCase[] = [];
  for (const replayCase of cases) {
    if (replayCase.kind === "original") {
      if (originalCase !== null) {
        return reject(
          candidateId,
          "duplicate-original-cases",
          `cases "${originalCase.caseId}" and "${replayCase.caseId}" both claim to be the original case`,
        );
      }
      originalCase = replayCase;
    } else {
      heldOut.push(replayCase);
    }
  }
  if (originalCase === null) {
    return reject(
      candidateId,
      "missing-original-case",
      "the original case must be replayed; a candidate may never be validated on held-out cases alone",
    );
  }
  if (
    originalCase.linkedDemonstrationDigest !==
    candidate.source.demonstrationDigest
  ) {
    return reject(
      candidateId,
      "original-case-mismatch",
      "the original case must be linked to the candidate's source demonstration digest",
    );
  }
  if (!heldOut.some((replayCase) => replayCase.representative)) {
    return reject(
      candidateId,
      "missing-held-out-representative-case",
      "at least one representative held-out case is required",
    );
  }
  const unobserved = cases
    .filter((replayCase) => replayCase.observed === null)
    .map((replayCase) => replayCase.caseId);
  if (unobserved.length > 0) {
    return reject(
      candidateId,
      "incomplete-observations",
      `replay observations missing for cases: ${unobserved.join(", ")}`,
    );
  }
  const original = originalCase.observed;
  if (original !== null && original.kind === "fail") {
    return reject(
      candidateId,
      "original-case-failed",
      `candidate fails its own original case (${original.failureKinds.join(", ")})`,
    );
  }
  if (original !== null && original.kind === "inconclusive") {
    return reject(
      candidateId,
      "original-case-inconclusive",
      `original case observation is inconclusive (${original.cause})`,
    );
  }
  const failing = heldOut.filter(
    (replayCase) =>
      replayCase.observed !== null && replayCase.observed.kind !== "pass",
  );
  if (failing.length === 0) {
    const passed = heldOut.filter(
      (replayCase) =>
        replayCase.observed !== null && replayCase.observed.kind === "pass",
    );
    const core = {
      candidateId,
      validatedOn: cases.map((replayCase) => replayCase.caseId),
      heldOutTotal: heldOut.length,
      heldOutPassed: passed.length,
      representativeHeldOutPassed: passed.some(
        (replayCase) => replayCase.representative,
      ),
    };
    return {
      kind: "generalized",
      validationDigest: digestRecord("generalization-validation", {
        kind: "generalized",
        ...core,
      }),
      ...core,
    };
  }
  if (scopeProposal === null) {
    return reject(
      candidateId,
      "held-out-failed-without-scope-proposal",
      `held-out cases failed (${failing.map((replayCase) => replayCase.caseId).join(", ")}); the candidate must be explicitly scoped or rejected — silent narrowing is forbidden`,
    );
  }
  const scope = scopeProposal;
  if (!caseInsideScope(originalCase.dimensions, scope)) {
    return reject(
      candidateId,
      "scope-excludes-original-case",
      "a scope declaration must still contain the original case",
    );
  }
  const failingInsideScope = failing.filter((replayCase) =>
    caseInsideScope(replayCase.dimensions, scope),
  );
  if (failingInsideScope.length > 0) {
    return reject(
      candidateId,
      "failing-case-inside-proposed-scope",
      `candidate fails within its own proposed scope (cases: ${failingInsideScope
        .map((replayCase) => replayCase.caseId)
        .join(", ")})`,
    );
  }
  const validatedInsideScope = heldOut.filter(
    (replayCase) =>
      replayCase.representative &&
      replayCase.observed !== null &&
      replayCase.observed.kind === "pass" &&
      caseInsideScope(replayCase.dimensions, scope),
  );
  if (validatedInsideScope.length === 0) {
    return reject(
      candidateId,
      "scope-not-validated-on-held-out",
      "the proposed scope contains no passing representative held-out case; narrowing that is not validated on held-out data is forbidden",
    );
  }
  const scopedCore = {
    candidateId,
    scope,
    failingOutsideScope: failing.map((replayCase) => replayCase.caseId),
    validatedInsideScope: validatedInsideScope.map(
      (replayCase) => replayCase.caseId,
    ),
  };
  return {
    kind: "scoped",
    validationDigest: digestRecord("generalization-validation", {
      kind: "scoped",
      ...scopedCore,
    }),
    ...scopedCore,
  };
}

function reject(
  candidateId: string,
  reason: GeneralizationRejection,
  detail: string,
): GeneralizationValidation {
  const core = { candidateId, reason, detail };
  return {
    kind: "rejected",
    validationDigest: digestRecord("generalization-validation", {
      kind: "rejected",
      ...core,
    }),
    ...core,
  };
}

function caseInsideScope(
  dimensions: readonly ScopeDimension[],
  scope: ScopeDeclaration,
): boolean {
  return scope.dimensions.every((scopeDimension) =>
    dimensions.some(
      (caseDimension) =>
        caseDimension.dimension === scopeDimension.dimension &&
        caseDimension.value === scopeDimension.value,
    ),
  );
}

/** Generalization status carried by a learning candidate. */
export type GeneralizationStatus =
  | { readonly kind: "pending" }
  | {
      readonly kind: "generalized";
      readonly validatedOn: readonly string[];
      readonly validationDigest: string;
    }
  | {
      readonly kind: "scoped";
      readonly scope: ScopeDeclaration;
      readonly validationDigest: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: GeneralizationRejection;
      readonly validationDigest: string;
    };

export type GeneralizationApplication =
  | { readonly kind: "applied"; readonly candidate: LearningCandidate }
  | {
      readonly kind: "refused";
      readonly reason: "candidate-mismatch";
      readonly detail: string;
    };

export function applyGeneralization(
  candidate: LearningCandidate,
  validation: GeneralizationValidation,
): GeneralizationApplication {
  if (validation.candidateId !== candidate.candidateId) {
    return {
      kind: "refused",
      reason: "candidate-mismatch",
      detail: `validation is bound to candidate ${validation.candidateId}, not ${candidate.candidateId}`,
    };
  }
  const generalization = statusFromValidation(validation);
  const core: Omit<LearningCandidate, "candidateId"> = {
    schemaVersion: candidate.schemaVersion,
    lineageId: candidate.lineageId,
    candidateVersion: candidate.candidateVersion,
    source: candidate.source,
    behavior: candidate.behavior,
    generalization,
    reuse: candidate.reuse,
    authoredBy: candidate.authoredBy,
    revisedFrom: candidate.revisedFrom,
  };
  return {
    kind: "applied",
    candidate: { candidateId: computeCandidateId(core), ...core },
  };
}

function statusFromValidation(
  validation: GeneralizationValidation,
): GeneralizationStatus {
  switch (validation.kind) {
    case "generalized":
      return {
        kind: "generalized",
        validatedOn: validation.validatedOn,
        validationDigest: validation.validationDigest,
      };
    case "scoped":
      return {
        kind: "scoped",
        scope: validation.scope,
        validationDigest: validation.validationDigest,
      };
    case "rejected":
      return {
        kind: "rejected",
        reason: validation.reason,
        validationDigest: validation.validationDigest,
      };
  }
}
