// Phase machine vocabulary for the reproduction lifecycle (W031).
// Split out of lifecycle.ts so every file stays under the 400-line law:
// this module owns states, transition kinds, the route table, and the
// terminal/rollback phase sets. Behavior is unchanged.

import type {
  DigestRef,
  IntakeVerdict,
  LifecycleTransitionKind,
  ReleaseLimits,
  ReleasePackage,
  ReproductionPhase,
  RightsGateResult,
} from "./contract";
import type { ReleaseAuthorization } from "./gates";

/** Failure codes for the phase machine. */
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

/** Rollback input: reason, evidence, and preserved limits (if any). */
export interface RollbackInput {
  readonly reason: string;
  readonly evidence: readonly DigestRef[];
  readonly preserved: ReleaseLimits | null;
}

/** Discriminated transition payloads; every transition is evidence-keyed. */
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

/** A route: which phase a transition kind starts from and lands in. */
export interface TransitionRoute {
  readonly from: ReproductionPhase;
  readonly to: ReproductionPhase;
}

/**
 * The deterministic route table. Rollback has no fixed route (it is allowed
 * from several phases and handled separately); every other kind has exactly
 * one legal source phase.
 */
export const ROUTES: Readonly<
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

/** Phases from which a rollback transition is legal. */
export const ROLLBACK_ALLOWED_FROM: readonly ReproductionPhase[] = [
  "build",
  "benchmark",
  "released",
];

const TERMINAL_PHASES: readonly ReproductionPhase[] = [
  "rejected",
  "released",
  "rolled-back",
];

/** True when the phase machine has reached a terminal phase. */
export function isTerminalPhase(phase: ReproductionPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}
