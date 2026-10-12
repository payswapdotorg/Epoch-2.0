// Evidence keying for the reproduction lifecycle (W031).
// Split out of lifecycle.ts so every file stays under the 400-line law:
// this module owns evidence validation and the keyed transition append.
// Behavior is unchanged.

import type {
  DigestRef,
  LifecycleTransitionKind,
  ReproductionLifecycle,
  ReproductionPhase,
  TransitionRecord,
} from "./contract";
import { canonicalJson, isDigestRef, sha256Hex } from "./digest";
import type { LifecycleErrorCode } from "./lifecycle-states";

/**
 * Validate a transition's evidence refs. Returns null when the evidence is
 * acceptable, otherwise the failure code (empty evidence, malformed ref).
 */
export function evidenceFailureOf(
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

/**
 * Append a keyed transition record and advance the phase. The transitionKey
 * digests the kind, the from/to phases, the evidence refs, and the payload.
 */
export function append(
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
