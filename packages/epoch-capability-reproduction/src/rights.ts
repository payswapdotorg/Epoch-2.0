import type {
  DigestRef,
  ProtectedSourceAccess,
  ProtectedSourceRequest,
  Result,
  RightsCheckInput,
  RightsCheckResult,
  RightsGate,
  RightsGateResult,
  RightsGateState,
} from "./contract";
import { digestRefOf, isDigestRef } from "./digest";
import { ok, refuse } from "./result";

export type RightsReasonCode = "invalid-ref";

/**
 * Derive a single check: required rights not held block the subject unless a
 * remediation plan is attached, in which case the check stays un-clearable
 * as negotiation-required.
 */
export function evaluateRightsCheck(
  input: RightsCheckInput,
): RightsCheckResult {
  const missingRights: string[] = [];
  for (const right of input.requiredRights) {
    if (!input.heldRights.includes(right)) {
      missingRights.push(right);
    }
  }
  let status: RightsGateState;
  if (missingRights.length === 0) {
    status = "cleared";
  } else if (input.remediationPlanRef !== null) {
    status = "negotiation-required";
  } else {
    status = "blocked";
  }
  return { input, missingRights, status };
}

/**
 * Protected-source inspection/decompilation stays INACCESSIBLE until specific
 * authorization and review records are attached.
 */
export function evaluateProtectedSource(
  request: ProtectedSourceRequest,
): ProtectedSourceAccess {
  const authorizationRef = firstValidRef(request.authorizationRefs);
  const reviewRef = firstValidRef(request.reviewRefs);
  if (authorizationRef === null || reviewRef === null) {
    return {
      subject: request.subject,
      access: "inaccessible",
      authorizationRef: null,
      reviewRef: null,
    };
  }
  return {
    subject: request.subject,
    access: "authorized",
    authorizationRef,
    reviewRef,
  };
}

/** Evaluate the whole gate: any blocked check or inaccessible protected source blocks. */
export function evaluateRightsGate(
  gate: RightsGate,
): Result<RightsGateResult, RightsReasonCode> {
  for (const check of gate.checks) {
    if (check.licenseRef !== null && !isDigestRef(check.licenseRef)) {
      return refuse(
        "invalid-ref",
        `license ref for ${check.subject} is malformed`,
      );
    }
    if (
      check.remediationPlanRef !== null &&
      !isDigestRef(check.remediationPlanRef)
    ) {
      return refuse(
        "invalid-ref",
        `remediation plan ref for ${check.subject} is malformed`,
      );
    }
  }
  const checks = gate.checks.map((check) => evaluateRightsCheck(check));
  const protectedAccess = gate.protectedSources.map((source) =>
    evaluateProtectedSource(source),
  );
  const blockedSubjects: string[] = [];
  let state: RightsGateState = "cleared";
  for (const check of checks) {
    if (check.status === "blocked") {
      state = "blocked";
      blockedSubjects.push(check.input.subject);
    } else if (check.status === "negotiation-required" && state === "cleared") {
      state = "negotiation-required";
    }
  }
  for (const access of protectedAccess) {
    if (access.access === "inaccessible") {
      state = "blocked";
      blockedSubjects.push(access.subject);
    }
  }
  return ok({
    state,
    checks,
    protectedAccess,
    blockedSubjects,
    gateRef: digestRefOf({ gate, state }),
  });
}

function firstValidRef(refs: readonly DigestRef[]): DigestRef | null {
  for (const ref of refs) {
    if (isDigestRef(ref)) {
      return ref;
    }
  }
  return null;
}
