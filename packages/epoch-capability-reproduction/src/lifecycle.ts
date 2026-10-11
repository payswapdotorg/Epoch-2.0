// Orchestrator for the reproduction lifecycle (W031).
// Split out of the former monolith so every file stays under the 400-line
// law: this module owns openLifecycle, the applyTransition dispatch, and the
// intake/rights/simple-ref handlers. Behavior is unchanged.

import type {
  DigestRef,
  LifecycleTransitionKind,
  ReproductionLifecycle,
  ReproductionPhase,
  ReproductionRequest,
  Result,
} from "./contract";
import { digestRefOf, isDigestRef } from "./digest";
import { ok, refuse } from "./result";
import {
  ROUTES,
  type LifecycleErrorCode,
  type LifecycleTransition,
} from "./lifecycle-states";
import { append, evidenceFailureOf } from "./lifecycle-evidence";
import { applyRelease, applyRollback } from "./lifecycle-release";

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

/**
 * Open a lifecycle at the intake phase; the request digest binds all later
 * verdicts to this exact request.
 */
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
