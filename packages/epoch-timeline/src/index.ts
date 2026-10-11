/**
 * @zcode/epoch-timeline — the projection authority for construction phases
 * and portable timeline positions over world revisions.
 *
 * The world model stays the single semantic authority (invariants 1, 4):
 * this package organizes WHEN entities appear in the construction story,
 * never WHAT they are. Timeline cursors bind positions to a world revision
 * by digest (never a mutable pointer), visibility is a derived view filter,
 * renderer animation is derived from this authority (invariant 17), and
 * positions are portable across hosts/renderers (invariant 12).
 */
export {
  AS_BUILT_PHASE_ID,
  AS_BUILT_PHASE_NAME,
  DEFAULT_TIMELINE_EASING,
  DEFAULT_TRANSITION_DURATION_DAYS,
} from "./contracts.js";
export type {
  ConstructionPhase,
  EntityPhaseMembership,
  EntityPhaseParticipation,
  PhaseParticipationRole,
  TimelineAnimation,
  TimelineAnimationStep,
  TimelineCursor,
  TimelineEasing,
  TimelineModel,
  TimelinePosition,
  TimelineRevisionInput,
} from "./contracts.js";
export { TimelineError, isTimelineError } from "./errors.js";
export type { TimelineErrorCode } from "./errors.js";
export { canonicalJson } from "./canonical.js";
export { sha256Hex } from "./sha256.js";
export { TimelineBuilder } from "./builder.js";
export type { TimelineBuilderApi } from "./builder.js";
export { parseModel, serializeModel } from "./model.js";
export { parsePosition, positionAt, serializePosition } from "./position.js";
export { animateBetween } from "./animate.js";
export {
  bindCursor,
  cursorIsBound,
  visibleEntities,
  visibleEntitiesAtCursor,
  visibilityAtDay,
} from "./visibility.js";
