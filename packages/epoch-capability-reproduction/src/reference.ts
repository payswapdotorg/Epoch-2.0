import type {
  BehaviorCaseCapture,
  BehaviorCaseSet,
  ReferenceBehaviorContract,
  Result,
} from "./contract";
import { digestRefOf, isDigestRef } from "./digest";
import { ok, refuse } from "./result";

export type ReferenceReasonCode =
  | "empty-contract"
  | "no-cases"
  | "duplicate-case"
  | "empty-expectation"
  | "missing-approvers"
  | "invalid-ref";

export interface ReferenceCaptureInput {
  readonly contractId: string;
  readonly capabilityId: string;
  readonly cases: readonly BehaviorCaseCapture[];
}

/**
 * Capture the approved reference behavior contract from W029 demonstrations.
 * Demonstrations bind by digest ref only; the factory never re-states them.
 */
export function captureReferenceBehavior(
  input: ReferenceCaptureInput,
): Result<ReferenceBehaviorContract, ReferenceReasonCode> {
  if (input.contractId.trim() === "" || input.capabilityId.trim() === "") {
    return refuse(
      "empty-contract",
      "contractId and capabilityId must be non-empty",
    );
  }
  if (input.cases.length === 0) {
    return refuse("no-cases", "at least one behavior case is required");
  }
  const seen = new Set<string>();
  for (const capture of input.cases) {
    if (capture.caseId.trim() === "") {
      return refuse("empty-contract", "caseId must be non-empty");
    }
    if (seen.has(capture.caseId)) {
      return refuse("duplicate-case", `duplicate caseId: ${capture.caseId}`);
    }
    seen.add(capture.caseId);
    if (!isDigestRef(capture.demonstrationRef)) {
      return refuse(
        "invalid-ref",
        `case ${capture.caseId} has a malformed demonstration ref`,
      );
    }
    if (capture.expectation.trim() === "") {
      return refuse(
        "empty-expectation",
        `case ${capture.caseId} has no expectation`,
      );
    }
    if (capture.approvers.length === 0) {
      return refuse(
        "missing-approvers",
        `case ${capture.caseId} has no approvers`,
      );
    }
    if (!isDigestRef(capture.approvalRef)) {
      return refuse(
        "invalid-ref",
        `case ${capture.caseId} has a malformed approval ref`,
      );
    }
  }
  const caseSet: BehaviorCaseSet = {
    capabilityId: input.capabilityId,
    cases: input.cases,
    setRef: digestRefOf(input.cases),
  };
  return ok({
    contractId: input.contractId,
    capabilityId: input.capabilityId,
    caseSet,
    contractRef: digestRefOf({
      contractId: input.contractId,
      capabilityId: input.capabilityId,
      setRef: caseSet.setRef,
    }),
  });
}
