import type {
  DigestRef,
  IntakeVerdict,
  LifecycleTransitionKind,
  ReleaseLimits,
  ReleasePackage,
  ReleaseRecord,
  ReproductionLifecycle,
  ReproductionPhase,
  ReproductionRequest,
  RightsGateResult,
  Result,
  TransitionRecord,
} from "./contract";
import { canonicalJson, digestRefOf, isDigestRef, sha256Hex } from "./digest";
import { ok, refuse } from "./result";
import { authorizeRelease, type ReleaseAuthorization } from "./gates";
import { validateMiniAppDescriptor } from "./surface";

export type LifecycleErrorCode =
  | "wrong-phase"
  | "invalid-transition"
  | "insufficient-evidence"
  | "invalid-ref"
  | "invalid-request"
  | "invalid-descriptor"
  | "gate-blocked"
  | "release-unauthorized"
  | "rollback-mismatch";

export interface RollbackInput {
  readonly reason: string;
  readonly evidence: readonly DigestRef[];
  readonly preserved: ReleaseLimits | null;
}

export type LifecycleTransition =
  | {
      readonly kind: "intake-accepted";
      readonly evidence: readonly DigestRef[];
      readonly verdict: IntakeVerdict;
    }
  | {
      readonly kind: "intake-rejected";
      readonly evidence: readonly DigestRef[];
      readonly verdict: IntakeVerdict;
    }
  | {
      readonly kind: "alternatives-recorded";
      readonly evidence: readonly DigestRef[];
      readonly analysisRef: DigestRef;
    }
  | {
      readonly kind: "rights-cleared";
      readonly evidence: readonly DigestRef[];
      readonly gate: RightsGateResult;
    }
  | {
      readonly kind: "reference-captured";
      readonly evidence: readonly DigestRef[];
      readonly contractRef: DigestRef;
    }
  | {
      readonly kind: "foundation-selected";
      readonly evidence: readonly DigestRef[];
      readonly choiceRef: DigestRef;
    }
  | {
      readonly kind: "build-planned";
      readonly evidence: readonly DigestRef[];
      readonly planRef: DigestRef;
    }
  | {
      readonly kind: "release";
      readonly evidence: readonly DigestRef[];
      readonly benchmarkPlanRef: DigestRef;
      readonly authorization: ReleaseAuthorization;
      readonly release: ReleasePackage;
    }
  | {
      readonly kind: "rollback";
      readonly input: RollbackInput;
    };

type IntakeAccepted = Extract<
  LifecycleTransition,
  { readonly kind: "intake-accepted" }
>;
type IntakeRejected = Extract<
  LifecycleTransition,
  { readonly kind: "intake-rejected" }
>;
type RightsCleared = Extract<
  LifecycleTransition,
  { readonly kind: "rights-cleared" }
>;
type ReleaseTransition = Extract<
  LifecycleTransition,
  { readonly kind: "release" }
>;

interface TransitionRoute {
  readonly from: ReproductionPhase;
  readonly to: ReproductionPhase;
}

const ROUTES: Readonly<
  Record<LifecycleTransitionKind, TransitionRoute | null>
> = {
  "intake-accepted": { from: "intake", to: "alternatives" },
  "intake-rejected": { from: "intake", to: "rejected" },
  "alternatives-recorded": { from: "alternatives", to: "rights-gate" },
  "rights-cleared": { from: "rights-gate", to: "reference-capture" },
  "reference-captured": { from: "reference-capture", to: "foundation" },
  "foundation-selected": { from: "foundation", to: "build" },
  "build-planned": { from: "build", to: "benchmark" },
  release: { from: "benchmark", to: "released" },
  rollback: null,
};

const ROLLBACK_ALLOWED_FROM: readonly ReproductionPhase[] = [
  "build",
  "benchmark",
  "released",
];

const TERMINAL_PHASES: readonly ReproductionPhase[] = [
  "rejected",
  "released",
  "rolled-back",
];

export function isTerminalPhase(phase: ReproductionPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

/** Open a lifecycle at the intake phase; the request digest binds all later verdicts. */
export function openLifecycle(
  request: ReproductionRequest,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (request.requestId.trim() === "" || request.capabilityId.trim() === "") {
    return refuse(
      "invalid-request",
      "requestId and capabilityId must be non-empty",
    );
  }
  return ok({
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    requestRef: digestRefOf(request),
    phase: "intake",
    history: [],
    release: null,
    rollback: null,
  });
}

/**
 * Deterministic phase machine. Every transition is evidence-keyed (digest
 * refs), phase-ordered, and validated; release additionally requires an
 * unforgeable all-gates-green authorization and a workbench-bound descriptor.
 */
export function applyTransition(
  lifecycle: ReproductionLifecycle,
  transition: LifecycleTransition,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (transition.kind === "rollback") {
    return applyRollback(lifecycle, transition.input);
  }
  const route = ROUTES[transition.kind];
  if (route === null) {
    return refuse("invalid-transition", `no route for ${transition.kind}`);
  }
  if (lifecycle.phase !== route.from) {
    return refuse(
      "wrong-phase",
      `${transition.kind} requires phase ${route.from}, lifecycle is in ${lifecycle.phase}`,
    );
  }
  const evidenceFailure = evidenceFailureOf(transition.evidence);
  if (evidenceFailure !== null) {
    return refuse(
      evidenceFailure,
      `${transition.kind} requires valid evidence refs`,
    );
  }
  switch (transition.kind) {
    case "intake-accepted":
      return acceptIntake(lifecycle, transition);
    case "intake-rejected":
      return rejectIntake(lifecycle, transition);
    case "alternatives-recorded":
      return passRef(
        lifecycle,
        "alternatives-recorded",
        route.to,
        transition.evidence,
        transition.analysisRef,
      );
    case "rights-cleared":
      return clearRights(lifecycle, transition);
    case "reference-captured":
      return passRef(
        lifecycle,
        "reference-captured",
        route.to,
        transition.evidence,
        transition.contractRef,
      );
    case "foundation-selected":
      return passRef(
        lifecycle,
        "foundation-selected",
        route.to,
        transition.evidence,
        transition.choiceRef,
      );
    case "build-planned":
      return passRef(
        lifecycle,
        "build-planned",
        route.to,
        transition.evidence,
        transition.planRef,
      );
    case "release":
      return applyRelease(lifecycle, transition);
  }
}

function evidenceFailureOf(
  evidence: readonly DigestRef[],
): LifecycleErrorCode | null {
  if (evidence.length === 0) {
    return "insufficient-evidence";
  }
  for (const ref of evidence) {
    if (!isDigestRef(ref)) {
      return "invalid-ref";
    }
  }
  return null;
}

function acceptIntake(
  lifecycle: ReproductionLifecycle,
  transition: IntakeAccepted,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (transition.verdict.outcome !== "accept") {
    return refuse(
      "invalid-transition",
      "intake verdict does not accept the request",
    );
  }
  if (transition.verdict.requestRef.digest !== lifecycle.requestRef.digest) {
    return refuse("invalid-ref", "intake verdict does not reference this request");
  }
  return ok(
    append(lifecycle, "intake-accepted", "alternatives", transition.evidence, {
      verdict: transition.verdict,
    }),
  );
}

function rejectIntake(
  lifecycle: ReproductionLifecycle,
  transition: IntakeRejected,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (transition.verdict.outcome !== "reject") {
    return refuse(
      "invalid-transition",
      "intake verdict does not reject the request",
    );
  }
  if (transition.verdict.requestRef.digest !== lifecycle.requestRef.digest) {
    return refuse("invalid-ref", "intake verdict does not reference this request");
  }
  return ok(
    append(lifecycle, "intake-rejected", "rejected", transition.evidence, {
      verdict: transition.verdict,
    }),
  );
}

function clearRights(
  lifecycle: ReproductionLifecycle,
  transition: RightsCleared,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (transition.gate.state !== "cleared") {
    return refuse(
      "gate-blocked",
      `rights gate is ${transition.gate.state} (blocked: ${transition.gate.blockedSubjects.join(", ")})`,
    );
  }
  return ok(
    append(
      lifecycle,
      "rights-cleared",
      "reference-capture",
      transition.evidence,
      { gate: transition.gate },
    ),
  );
}

function passRef(
  lifecycle: ReproductionLifecycle,
  kind: LifecycleTransitionKind,
  to: ReproductionPhase,
  evidence: readonly DigestRef[],
  ref: DigestRef,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (!isDigestRef(ref)) {
    return refuse("invalid-ref", `${kind} requires a valid record ref`);
  }
  return ok(append(lifecycle, kind, to, evidence, { ref }));
}

function applyRelease(
  lifecycle: ReproductionLifecycle,
  transition: ReleaseTransition,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (transition.release.version.trim() === "") {
    return refuse("invalid-transition", "release requires a version");
  }
  if (!isDigestRef(transition.benchmarkPlanRef)) {
    return refuse("invalid-ref", "release requires a benchmark plan ref");
  }
  const descriptorCheck = validateMiniAppDescriptor(
    transition.release.descriptor,
  );
  if (!descriptorCheck.ok) {
    return refuse(
      "invalid-descriptor",
      `mini-app descriptor rejected: ${descriptorCheck.reason}`,
    );
  }
  const recheck = authorizeRelease(transition.authorization.gates);
  if (!recheck.ok) {
    return refuse(
      "release-unauthorized",
      `release authorization failed re-verification: ${recheck.reason}`,
    );
  }
  const descriptorRef = descriptorCheck.value.descriptorRef;
  const releaseRecord: ReleaseRecord = {
    version: transition.release.version,
    limits: transition.release.limits,
    descriptorRef,
    gateRefs: transition.authorization.gateRefs,
    releaseKey: sha256Hex(
      canonicalJson({
        version: transition.release.version,
        limits: transition.release.limits,
        descriptorRef,
        gateRefs: transition.authorization.gateRefs,
      }),
    ),
  };
  const next = append(lifecycle, "release", "released", transition.evidence, {
    release: transition.release,
    gateRefs: transition.authorization.gateRefs,
  });
  return ok({ ...next, release: releaseRecord });
}

function applyRollback(
  lifecycle: ReproductionLifecycle,
  input: RollbackInput,
): Result<ReproductionLifecycle, LifecycleErrorCode> {
  if (!ROLLBACK_ALLOWED_FROM.includes(lifecycle.phase)) {
    return refuse(
      "wrong-phase",
      `rollback is not allowed from ${lifecycle.phase}`,
    );
  }
  const evidenceFailure = evidenceFailureOf(input.evidence);
  if (evidenceFailure !== null) {
    return refuse(evidenceFailure, "rollback requires valid evidence refs");
  }
  if (input.reason.trim() === "") {
    return refuse("invalid-transition", "rollback requires a reason");
  }
  let fromVersion: string | null = null;
  let preservedLimits: ReleaseLimits | null = input.preserved;
  if (lifecycle.phase === "released") {
    const release = lifecycle.release;
    if (release === null) {
      return refuse("rollback-mismatch", "released phase has no release record");
    }
    if (input.preserved === null) {
      return refuse(
        "rollback-mismatch",
        "rolling back a release must preserve its limits",
      );
    }
    if (canonicalJson(input.preserved) !== canonicalJson(release.limits)) {
      return refuse(
        "rollback-mismatch",
        "preserved limits do not match the release record",
      );
    }
    fromVersion = release.version;
    preservedLimits = release.limits;
  }
  const rollbackRecord = {
    fromPhase: lifecycle.phase,
    fromVersion,
    preservedLimits,
    reason: input.reason,
    rollbackKey: sha256Hex(
      canonicalJson({
        fromPhase: lifecycle.phase,
        fromVersion,
        preservedLimits,
        reason: input.reason,
      }),
    ),
  };
  const next = append(lifecycle, "rollback", "rolled-back", input.evidence, {
    reason: input.reason,
    preserved: preservedLimits,
    fromVersion,
  });
  return ok({ ...next, rollback: rollbackRecord });
}

function append(
  lifecycle: ReproductionLifecycle,
  kind: LifecycleTransitionKind,
  to: ReproductionPhase,
  evidence: readonly DigestRef[],
  payload: unknown,
): ReproductionLifecycle {
  const transitionKey = sha256Hex(
    canonicalJson({ kind, from: lifecycle.phase, to, evidence, payload }),
  );
  const record: TransitionRecord = {
    kind,
    from: lifecycle.phase,
    to,
    evidence,
    transitionKey,
  };
  return { ...lifecycle, phase: to, history: [...lifecycle.history, record] };
}
