import type {
  DigestRef,
  IntakeVerdict,
  ReproductionRequest,
  ScopeDeclaration,
} from "./contract";
import { digestRefOf, isDigestRef } from "./digest";

export type IntakeReasonCode =
  | "accepted"
  | "empty-capability-id"
  | "wildcard-capability"
  | "missing-gap-evidence"
  | "unbounded-scope"
  | "scope-conflict"
  | "empty-rationale"
  | "unknown-requester";

const WILDCARD = "*";

/**
 * Deterministic reproduction necessity test. A request is accepted only when
 * it cites missing/inadequate capability evidence, declares a bounded scope,
 * and names a requester and rationale. The verdict digest binds to the request.
 */
export function evaluateIntake(request: ReproductionRequest): IntakeVerdict {
  const codes: IntakeReasonCode[] = [];
  if (request.capabilityId.trim() === "") {
    codes.push("empty-capability-id");
  }
  if (request.capabilityId === WILDCARD) {
    codes.push("wildcard-capability");
  }
  if (!hasGapEvidence(request.gapEvidenceRefs)) {
    codes.push("missing-gap-evidence");
  }
  if (!isBoundedScope(request.scope)) {
    codes.push("unbounded-scope");
  }
  if (hasScopeConflict(request.scope)) {
    codes.push("scope-conflict");
  }
  if (request.rationale.trim() === "") {
    codes.push("empty-rationale");
  }
  if (request.requester.trim() === "") {
    codes.push("unknown-requester");
  }
  const accepted = codes.length === 0;
  return {
    outcome: accepted ? "accept" : "reject",
    codes: accepted ? ["accepted"] : codes,
    requestRef: digestRefOf(request),
  };
}

function hasGapEvidence(refs: readonly DigestRef[]): boolean {
  return refs.length > 0 && refs.every((ref) => isDigestRef(ref));
}

function isBoundedScope(scope: ScopeDeclaration): boolean {
  const includes = scope.includes
    .map((item) => item.trim())
    .filter((item) => item !== "");
  return includes.length > 0 && !includes.includes(WILDCARD);
}

function hasScopeConflict(scope: ScopeDeclaration): boolean {
  const excluded = new Set(scope.excludes.map((item) => item.trim()));
  return scope.includes.some((item) => excluded.has(item.trim()));
}
