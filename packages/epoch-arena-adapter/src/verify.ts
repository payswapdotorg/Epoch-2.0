/**
 * Deterministic verification of a return against acceptance criteria.
 * Expert output is never trusted because it came from an expert.
 */
import { isValidIso8601Utc } from "./canonical.js";
import { returnPackageDigest } from "./return.js";
import type { ArenaReturnPackage } from "./types-return.js";
import type {
  AcceptanceCriterion,
  AcceptanceSpec,
  CriterionCheck,
} from "./types-task.js";
import type {
  CriterionOutcome,
  CriterionVerifier,
  PartialReason,
  RejectionReason,
  ReturnVerification,
} from "./types-verdict.js";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function countClaims(ret: ArenaReturnPackage): number {
  return ret.deliverables.reduce((n, d) => n + d.claims.length, 0);
}

function evaluateCheck(check: CriterionCheck, ret: ArenaReturnPackage): number {
  switch (check.type) {
    case "deliverable-count":
      return check.min <= 0 ? 1 : clamp01(ret.deliverables.length / check.min);
    case "deliverable-kind-present":
      return ret.deliverables.some((d) => d.kind === check.kind) ? 1 : 0;
    case "evidence-backed-claims":
      return check.minClaims <= 0
        ? 1
        : clamp01(countClaims(ret) / check.minClaims);
    case "min-confidence": {
      const c = ret.declaration.confidence;
      if (!Number.isFinite(c)) {
        return 0;
      }
      return c >= check.min ? 1 : clamp01(c / check.min);
    }
  }
}

/**
 * The standard deterministic criterion verifier shipped with the
 * adapter. Callers may inject their own (still pure) verifier.
 */
export function standardCriterionVerifier(
  criterion: AcceptanceCriterion,
  ret: ArenaReturnPackage,
): CriterionOutcome {
  const raw = clamp01(evaluateCheck(criterion.check, ret));
  if (criterion.kind === "must-have") {
    const met = raw >= 1;
    return {
      criterionId: criterion.id,
      kind: "must-have",
      status: met ? "met" : "unmet",
      fraction: met ? 1 : 0,
      detail: `must-have '${criterion.id}' (${criterion.check.type})`,
    };
  }
  let status: "met" | "partial" | "unmet";
  if (raw >= 1) {
    status = "met";
  } else if (raw > 0) {
    status = "partial";
  } else {
    status = "unmet";
  }
  return {
    criterionId: criterion.id,
    kind: "should-have",
    status,
    fraction: raw,
    detail: `should-have '${criterion.id}' (${criterion.check.type}) fraction=${raw}`,
  };
}

/** Deterministic verification of a sealed return. */
export function verifyReturn(
  ret: ArenaReturnPackage,
  acceptance: AcceptanceSpec,
  verifier: CriterionVerifier,
  verifiedAt: string,
): ReturnVerification {
  if (!isValidIso8601Utc(verifiedAt)) {
    throw new TypeError("verifiedAt must be ISO-8601 UTC");
  }
  const reasons: RejectionReason[] = [];
  if (ret.schemaVersion !== "1") {
    reasons.push({
      type: "schema-version-unsupported",
      supported: "1",
      actual: ret.schemaVersion,
    });
  }
  const expectedDigest = returnPackageDigest(ret);
  if (expectedDigest !== ret.digest) {
    reasons.push({
      type: "digest-mismatch",
      field: "digest",
      expected: expectedDigest,
      actual: ret.digest,
    });
  }
  if (ret.provenance.taskPackageDigest !== acceptance.expectedTaskPackageDigest) {
    reasons.push({
      type: "task-package-mismatch",
      expected: acceptance.expectedTaskPackageDigest,
      actual: ret.provenance.taskPackageDigest,
    });
  }
  if (ret.deliverables.length === 0) {
    reasons.push({ type: "no-deliverables" });
  }
  const confidence = ret.declaration.confidence;
  if (!(confidence >= 0 && confidence <= 1)) {
    reasons.push({ type: "invalid-confidence", value: confidence });
  }
  if (ret.declaration.attestation.trim().length === 0) {
    reasons.push({
      type: "invalid-declaration",
      detail: "declaration.attestation is empty",
    });
  }
  if (reasons.length > 0) {
    return { kind: "rejected", returnDigest: ret.digest, reasons, verifiedAt };
  }
  if (
    Date.parse(ret.provenance.submittedAt) > Date.parse(acceptance.deadlineAt)
  ) {
    return {
      kind: "rejected",
      returnDigest: ret.digest,
      reasons: [
        {
          type: "late-submission",
          deadline: acceptance.deadlineAt,
          submittedAt: ret.provenance.submittedAt,
        },
      ],
      verifiedAt,
    };
  }
  const outcomes = acceptance.criteria.map((c) => verifier(c, ret));
  const mustHaveUnmet = outcomes.filter(
    (o) => o.kind === "must-have" && o.status !== "met",
  );
  if (mustHaveUnmet.length > 0) {
    return {
      kind: "rejected",
      returnDigest: ret.digest,
      reasons: mustHaveUnmet.map((o) => ({
        type: "must-have-unmet" as const,
        criterionId: o.criterionId,
        detail: o.detail,
      })),
      verifiedAt,
    };
  }
  const met = outcomes.filter((o) => o.status === "met");
  const partial = outcomes.filter((o) => o.status === "partial");
  const unmet = outcomes.filter((o) => o.status === "unmet");
  if (partial.length === 0 && unmet.length === 0) {
    return {
      kind: "verified",
      returnDigest: ret.digest,
      outcomes,
      acceptanceFraction: 1,
      verifiedAt,
    };
  }
  const byId = new Map(acceptance.criteria.map((c) => [c.id, c]));
  const floorOf = (criterionId: string): number => {
    const criterion = byId.get(criterionId);
    return criterion !== undefined && criterion.kind === "should-have"
      ? criterion.partialFloor
      : 0;
  };
  const reasonsPartial: PartialReason[] = [];
  for (const o of partial) {
    reasonsPartial.push({
      type: "should-have-partial",
      criterionId: o.criterionId,
      fraction: o.fraction,
      floor: floorOf(o.criterionId),
      meetsFloor: o.fraction >= floorOf(o.criterionId),
    });
  }
  for (const o of unmet) {
    reasonsPartial.push({
      type: "should-have-unmet",
      criterionId: o.criterionId,
    });
  }
  const acceptable =
    unmet.length === 0 &&
    partial.every((o) => o.fraction >= floorOf(o.criterionId));
  const acceptanceFraction =
    outcomes.length === 0
      ? 1
      : outcomes.reduce((sum, o) => sum + o.fraction, 0) / outcomes.length;
  return {
    kind: "partial",
    returnDigest: ret.digest,
    met,
    partial,
    unmet,
    acceptanceFraction,
    acceptable,
    reasons: reasonsPartial,
    verifiedAt,
  };
}
