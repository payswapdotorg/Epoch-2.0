export interface VerificationCommand {
  readonly commandId: string;
  readonly argv: readonly string[];
  readonly cwd: string;             // relative to repo root, e.g. "."
  readonly purpose: string;
  readonly expectedExitCode: number;
  readonly expectedStdoutIncludes?: readonly string[];
}

export interface PlanStep {
  readonly stepId: string;             // "step-001"
  readonly summary: string;
  readonly change: PlanChange;          // typed diff action
  readonly verification: readonly VerificationCommand[];
}

export type PlanChange =
  | { readonly kind: "introduce"; readonly capabilityId: string; readonly role: string }
  | { readonly kind: "retire"; readonly capabilityId: string; readonly role: string }
  | { readonly kind: "replace"; readonly fromCapabilityId: string; readonly toCapabilityId: string; readonly role: string }
  | { readonly kind: "verify-only" };

export interface ImplementationPlan {
  readonly planId: string;
  readonly subjectId: string;          // candidateId being implemented
  readonly baselineId: string;
  readonly revision: WorldRevisionRef;
  readonly candidateDigest: string;
  readonly steps: readonly PlanStep[];
  readonly planDigest: string;         // sha256 over canonical body (plan minus planDigest)
}
