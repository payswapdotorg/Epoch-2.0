/**
 * Public timeline contracts for `@zcode/epoch-timeline`.
 *
 * The timeline is a projection authority over world revisions
 * (ARCHITECTURE-LOCK invariants 1, 4, 17): it organizes WHEN entities appear
 * in the construction story, never WHAT they are. World content, semantics
 * and identity stay owned by the world model; renderers derive animation
 * from this package instead of re-deriving it themselves.
 */

/** Easing hints carried by derived animation steps. */
export type TimelineEasing = "linear" | "smoothstep";

/** How an entity participates in a phase. */
export type PhaseParticipationRole = "construct" | "remove";

/** Phase id used by the honest single-phase fallback model. */
export const AS_BUILT_PHASE_ID = "as-built";

/** Phase name used by the honest single-phase fallback model. */
export const AS_BUILT_PHASE_NAME = "As-built";

/** Default transition length (in ordinal days) used for interpolation hints. */
export const DEFAULT_TRANSITION_DURATION_DAYS = 1;

/** Default interpolation easing carried by derived animation steps. */
export const DEFAULT_TIMELINE_EASING: TimelineEasing = "smoothstep";

/**
 * A construction phase on the timeline.
 *
 * The planned extent is a calendar-free ordinal day range
 * `[startDay, endDay]` (inclusive on both ends); ordinals keep the model
 * deterministic and portable across hosts.
 */
export interface ConstructionPhase {
  /** Stable, deterministic phase identifier (never random). */
  readonly id: string;
  /** Human-facing phase name. */
  readonly name: string;
  /** Planned extent start as an ordinal day (`>= 0`). */
  readonly startDay: number;
  /** Planned extent end as an ordinal day (`>= startDay`). */
  readonly endDay: number;
  /** Sorted, unique ids of entities that participate in this phase. */
  readonly participantEntityIds: readonly string[];
}

/** A single entity's participation in one phase. */
export interface EntityPhaseParticipation {
  readonly phaseId: string;
  readonly role: PhaseParticipationRole;
}

/** Per-entity phase membership derived from a world revision. */
export interface EntityPhaseMembership {
  readonly entityId: string;
  /** Sorted by `(phaseId, role)`. Never empty for a membership entry. */
  readonly phases: readonly EntityPhaseParticipation[];
}

/** The timeline model: construction phases projected over one world revision. */
export interface TimelineModel {
  /** Digest of the world revision this model was derived from. */
  readonly worldDigest: string;
  /** Digest of this model's canonical serialization (determinism law). */
  readonly modelDigest: string;
  /** Phases sorted by `(startDay, endDay, id)`. Always non-empty. */
  readonly phases: readonly ConstructionPhase[];
  /** Phase membership sorted by `entityId`. Empty when every entity is ambient. */
  readonly entityMembership: readonly EntityPhaseMembership[];
  /**
   * Sorted ids of entities that carry no phase data. They are visible across
   * the whole timeline (site context / as-built surroundings) but are members
   * of no phase — the timeline never invents phases for them.
   */
  readonly ambientEntityIds: readonly string[];
  /** First day covered by the model (`min(phase.startDay)`). */
  readonly firstDay: number;
  /** Last day covered by the model (`max(phase.endDay)`). */
  readonly lastDay: number;
}

/** A portable, serializable timeline position (invariant 12 portability). */
export interface TimelinePosition {
  /** The (clamped) day ordinal this position was computed at. */
  readonly day: number;
  /** Id of the active phase at `day`. */
  readonly activePhaseId: string;
  /** Fractional progress within the active phase, in `[0, 1]`. */
  readonly phaseProgress: number;
  /** Progress across the whole construction span, in `[0, 1]`. */
  readonly totalProgress: number;
}

/**
 * A timeline cursor: a position bound to the world revision digest the
 * timeline was derived from. A timeline is ALWAYS bound to a specific
 * revision by digest — never a mutable pointer.
 */
export interface TimelineCursor {
  readonly position: TimelinePosition;
  readonly worldDigest: string;
}

/** One renderer-neutral animation step for one entity. */
export interface TimelineAnimationStep {
  readonly entityId: string;
  readonly kind: "appear" | "disappear";
  /** Phase whose boundary triggers the step. */
  readonly phaseId: string;
  /** Day the transition is anchored at (the phase start day). */
  readonly boundaryDay: number;
  /** Transition length in days (`0` = instant). */
  readonly durationDays: number;
  readonly easing: TimelineEasing;
}

/** Derived, renderer-neutral animation data between two positions. */
export interface TimelineAnimation {
  readonly from: TimelinePosition;
  readonly to: TimelinePosition;
  /** `"forward"` when `to.day >= from.day`, else `"reverse"`. */
  readonly direction: "forward" | "reverse";
  /** Steps sorted by `(boundaryDay, entityId, kind)`. */
  readonly steps: readonly TimelineAnimationStep[];
}

/**
 * Structural input port for a world revision (`WorldRevision` from
 * `@zcode/epoch-world-model`).
 *
 * The timeline owns this anti-corruption boundary: both fields are optional
 * so the frozen world-model contract stays assignable; anything the port
 * does not recognize surfaces as a typed `TimelineError`, never as a silent
 * repair. Entity payloads are validated structurally at runtime (see
 * `src/ingest.ts` for the recognized construction-attribute shapes).
 */
export interface TimelineRevisionInput {
  /** Entity collection of the revision. */
  readonly entities?: readonly unknown[];
  /** Revision digest, when the revision carries one. */
  readonly digest?: string;
}
