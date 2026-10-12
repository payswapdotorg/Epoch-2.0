import type { Digest, EntityDigest, Iso8601, KebabId, Result } from "../types/shared.js";
import { FINDING_STATUS_TRANSITIONS } from "../types/finding.js";
import type {
  FindingInput,
  FindingRecord,
  FindingRejection,
  FindingStatusTransition,
  FindingTransitionRejection,
} from "../types/finding.js";
import {
  isDigest,
  isFindingSeverity,
  isFindingStatus,
  isIso8601,
  isKebabId,
  isNonEmptyString,
  ok,
  reject,
} from "../validate.js";

type FindingResult = Result<FindingRecord, FindingRejection>;
type TransitionResult = Result<FindingRecord, FindingTransitionRejection>;

/** Deterministic machine building an inspection finding record. */
export function buildFinding(input: FindingInput): FindingResult {
  if (!isKebabId(input.findingId)) {
    return reject({ kind: "invalid-finding-id", findingId: input.findingId });
  }
  if (!isDigest(input.entityDigest)) {
    return reject({ kind: "invalid-entity-digest", entityDigest: input.entityDigest });
  }
  if (!isFindingSeverity(input.severity)) {
    return reject({ kind: "invalid-severity", severity: String(input.severity) });
  }
  if (!isNonEmptyString(input.title)) {
    return reject({ kind: "invalid-title", title: input.title });
  }
  if (input.detail !== undefined && !isNonEmptyString(input.detail)) {
    return reject({ kind: "invalid-detail" });
  }
  if (input.evidence.length === 0) {
    return reject({ kind: "empty-evidence" });
  }
  const evidence: Digest[] = [];
  for (const [index, rawDigest] of input.evidence.entries()) {
    if (!isDigest(rawDigest)) {
      return reject({ kind: "invalid-evidence", index, digest: rawDigest });
    }
    evidence.push(rawDigest);
  }
  const constraintRefs: KebabId[] = [];
  for (const [index, rawRef] of input.constraintRefs.entries()) {
    if (!isKebabId(rawRef)) {
      return reject({ kind: "invalid-constraint-ref", index, constraintId: rawRef });
    }
    constraintRefs.push(rawRef);
  }
  const boqItemRefs: KebabId[] = [];
  for (const [index, rawRef] of input.boqItemRefs.entries()) {
    if (!isKebabId(rawRef)) {
      return reject({ kind: "invalid-boq-item-ref", index, itemId: rawRef });
    }
    boqItemRefs.push(rawRef);
  }
  if (!isIso8601(input.raisedAt)) {
    return reject({ kind: "invalid-raised-at", raisedAt: input.raisedAt });
  }
  return ok({
    findingId: input.findingId,
    entityDigest: input.entityDigest as unknown as EntityDigest,
    severity: input.severity,
    status: "open",
    title: input.title,
    detail: input.detail,
    evidence,
    constraintRefs,
    boqItemRefs,
    raisedAt: input.raisedAt as Iso8601,
    statusHistory: [],
  });
}

/**
 * Deterministic machine advancing the finding status along the DATA-declared
 * lifecycle (FINDING_STATUS_TRANSITIONS). The transition timestamp is an
 * input, never generated.
 */
export function advanceFindingStatus(
  finding: FindingRecord,
  nextStatus: string,
  at: string,
): TransitionResult {
  if (!isFindingStatus(nextStatus)) {
    return reject({ kind: "invalid-next-status", nextStatus });
  }
  if (!isIso8601(at)) {
    return reject({ kind: "invalid-at", at });
  }
  const legalTransitions = FINDING_STATUS_TRANSITIONS[finding.status];
  if (!legalTransitions.includes(nextStatus)) {
    return reject({ kind: "illegal-transition", from: finding.status, to: nextStatus });
  }
  const transition: FindingStatusTransition = {
    from: finding.status,
    to: nextStatus,
    at: at as Iso8601,
  };
  return ok({
    ...finding,
    status: nextStatus,
    statusHistory: [...finding.statusHistory, transition],
  });
}
