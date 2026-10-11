/**
 * The entity visibility law: which entities exist (built / not-yet-built /
 * removed) at a given timeline state is a DERIVED projection, exposed as an
 * entity-id set. It never mutates the world revision and never mutates the
 * model — hosts layer it as a view filter.
 *
 * Semantics per entity:
 *   - ambient entities (no phase data) are visible at every day;
 *   - appear day  = min startDay over "construct" participations; an entity
 *                   with NO construct participation pre-exists and is
 *                   visible from the beginning of the timeline;
 *   - remove day  = min startDay over "remove" participations
 *                   (none -> never removed);
 *   - visible iff `day >= appearDay && day < removeDay`
 *     (appearance is inclusive at the phase start day — a not-yet-built
 *     entity is hidden while `day < startDay`; removal takes effect AT the
 *     removal phase start day — the entity is gone from that day on).
 */
import { TimelineError } from "./errors.js";
import type {
  ConstructionPhase,
  EntityPhaseParticipation,
  TimelineCursor,
  TimelineModel,
  TimelinePosition,
} from "./contracts.js";
import { assertPhaseKnown, clonePosition, validatePosition } from "./position.js";
import { deepFreeze } from "./internal.js";

export function visibilityAtDay(model: TimelineModel, day: number): ReadonlySet<string> {
  if (typeof day !== "number" || !Number.isFinite(day)) {
    throw new TimelineError("day-invalid", "day ordinal must be a finite number");
  }
  const phasesById = indexPhases(model);
  const visible = new Set<string>(model.ambientEntityIds);
  for (const membership of model.entityMembership) {
    if (isEntityVisibleAtDay(membership.entityId, membership.phases, phasesById, day)) {
      visible.add(membership.entityId);
    }
  }
  return visible;
}

function isEntityVisibleAtDay(
  entityId: string,
  participations: readonly EntityPhaseParticipation[],
  phasesById: ReadonlyMap<string, ConstructionPhase>,
  day: number,
): boolean {
  // Tracked from +Infinity and lowered by Math.min so that the EARLIEST
  // participation boundary wins; the "no construct participation" case is
  // resolved explicitly below (pre-existing entity, visible from the start).
  let constructStart = Number.POSITIVE_INFINITY;
  let removeDay = Number.POSITIVE_INFINITY;
  let hasConstruct = false;
  for (const participation of participations) {
    const phase = phasesById.get(participation.phaseId);
    if (phase === undefined) {
      throw new TimelineError(
        "model-invalid",
        `membership of entity "${entityId}" references unknown phase`,
        { entityId, phaseId: participation.phaseId },
      );
    }
    if (participation.role === "construct") {
      hasConstruct = true;
      constructStart = Math.min(constructStart, phase.startDay);
    } else {
      removeDay = Math.min(removeDay, phase.startDay);
    }
  }
  const appearDay = hasConstruct ? constructStart : Number.NEGATIVE_INFINITY;
  return day >= appearDay && day < removeDay;
}

function indexPhases(model: TimelineModel): ReadonlyMap<string, ConstructionPhase> {
  const map = new Map<string, ConstructionPhase>();
  for (const phase of model.phases) {
    map.set(phase.id, phase);
  }
  return map;
}

/** The package-level visibility projection: a pure view filter. */
export function visibleEntities(
  model: TimelineModel,
  position: TimelinePosition,
): ReadonlySet<string> {
  validatePosition(position, "position");
  assertPhaseKnown(model, position.activePhaseId, "position");
  return visibilityAtDay(model, position.day);
}

/** Bind a position to the model's world revision digest (a frozen cursor). */
export function bindCursor(model: TimelineModel, position: TimelinePosition): TimelineCursor {
  validatePosition(position, "position");
  assertPhaseKnown(model, position.activePhaseId, "position");
  return deepFreeze({ position: clonePosition(position), worldDigest: model.worldDigest });
}

/** Whether a cursor is bound to the given model's world revision. */
export function cursorIsBound(cursor: TimelineCursor, model: TimelineModel): boolean {
  return cursor.worldDigest === model.worldDigest;
}

/** Visibility through a cursor; mismatched digests surface as typed errors. */
export function visibleEntitiesAtCursor(
  model: TimelineModel,
  cursor: TimelineCursor,
): ReadonlySet<string> {
  if (!cursorIsBound(cursor, model)) {
    throw new TimelineError(
      "revision-mismatch",
      "cursor is not bound to this model's world revision",
      { cursorWorldDigest: cursor.worldDigest, modelWorldDigest: model.worldDigest },
    );
  }
  return visibleEntities(model, cursor.position);
}
