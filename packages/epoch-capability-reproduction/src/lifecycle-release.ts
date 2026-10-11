// Release and rollback transition logic for the reproduction lifecycle (W031).
// Split out of lifecycle.ts so every file stays under the 400-line law:
// this module owns the release impossibility re-verification and the
// rollback record construction. Behavior is unchanged.

import type {
  ReleaseLimits,
  ReleaseRecord,
  ReproductionLifecycle,
  Result,
} from "./contract";
import { canonicalJson, isDigestRef, sha256Hex } from "./digest";
import { ok, refuse } from "./result";
import { authorizeRelease } from "./gates";
import { validateMiniAppDescriptor } from "./surface";
import { append, evidenceFailureOf } from "./lifecycle-evidence";
import {
  ROLLBACK_ALLOWED_FROM,
  type LifecycleErrorCode,
  type LifecycleTransition,
  type RollbackInput,
} from "./lifecycle-states";

/** The release variant of LifecycleTransition. */
export type ReleaseTransition = Extract<
  LifecycleTransition,
  { readonly kind: "release" }
>;

/**
 * Apply a release transition: the descriptor must bind to the W028 workbench
 * surface, and the all-gates-green authorization is re-verified here, so a
 * forged token cannot smuggle a failing gate through.
 */
export function applyRelease(
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

/**
 * Apply a rollback transition. Rolling back a released lifecycle must
 * preserve the exact release limits; rolling back from build or benchmark
 * carries no version. The rollback key digests the preserved metadata.
 */
export function applyRollback(
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
