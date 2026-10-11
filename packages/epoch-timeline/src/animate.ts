/**
 * Derived, renderer-neutral animation (invariant 17: renderers consume this,
 * never re-derive it).
 *
 * Boundary events in the half-open day interval `(from.day, to.day]` are
 * reported as steps — one "appear" step per entity anchored at its earliest
 * construct-participation phase start, one "disappear" step anchored at its
 * earliest remove-participation phase start. `direction` tells the renderer
 * whether playback is forward or reverse (a reverse pass un-crosses the same
 * boundaries). Interpolation hints: `durationDays` (capped at the phase
 * length; zero-length phases are instant) and the easing constant.
 */
import { TimelineError } from "./errors.js";
import {
  DEFAULT_TIMELINE_EASING,
  DEFAULT_TRANSITION_DURATION_DAYS,
  type ConstructionPhase,
  type EntityPhaseMembership,
  type PhaseParticipationRole,
  type TimelineAnimation,
  type TimelineAnimationStep,
  type TimelineModel,
  type TimelinePosition,
} from "./contracts.js";
import { assertPhaseKnown, clonePosition, validatePosition } from "./position.js";
import { compareStrings, deepFreeze } from "./internal.js";

interface PhaseBoundary {
  readonly phaseId: string;
  readonly boundaryDay: number;
  readonly durationDays: number;
}

export function animateBetween(
  model: TimelineModel,
  from: TimelinePosition,
  to: TimelinePosition,
): TimelineAnimation {
  validatePosition(from, "from");
  validatePosition(to, "to");
  assertPhaseKnown(model, from.activePhaseId, "from");
  assertPhaseKnown(model, to.activePhaseId, "to");

  const forward = to.day >= from.day;
  const lower = forward ? from.day : to.day;
  const upper = forward ? to.day : from.day;

  const phasesById = new Map<string, ConstructionPhase>();
  for (const phase of model.phases) {
    phasesById.set(phase.id, phase);
  }

  const steps: TimelineAnimationStep[] = [];
  for (const membership of model.entityMembership) {
    const appear = earliestBoundary(membership, phasesById, "construct");
    if (appear !== undefined && crossesInterval(appear.boundaryDay, lower, upper)) {
      steps.push(stepFor(membership.entityId, "appear", appear));
    }
    const disappear = earliestBoundary(membership, phasesById, "remove");
    if (disappear !== undefined && crossesInterval(disappear.boundaryDay, lower, upper)) {
      steps.push(stepFor(membership.entityId, "disappear", disappear));
    }
  }
  steps.sort(
    (a, b) =>
      a.boundaryDay - b.boundaryDay ||
      compareStrings(a.entityId, b.entityId) ||
      compareStrings(a.kind, b.kind),
  );

  return deepFreeze({
    from: clonePosition(from),
    to: clonePosition(to),
    direction: forward ? "forward" : "reverse",
    steps: deepFreeze(steps),
  });
}

function earliestBoundary(
  membership: EntityPhaseMembership,
  phasesById: ReadonlyMap<string, ConstructionPhase>,
  role: PhaseParticipationRole,
): PhaseBoundary | undefined {
  let best: PhaseBoundary | undefined;
  for (const participation of membership.phases) {
    if (participation.role !== role) {
      continue;
    }
    const phase = phasesById.get(participation.phaseId);
    if (phase === undefined) {
      throw new TimelineError(
        "model-invalid",
        "membership references a phase that is not part of the model",
        { entityId: membership.entityId, phaseId: participation.phaseId },
      );
    }
    const candidate: PhaseBoundary = {
      phaseId: phase.id,
      boundaryDay: phase.startDay,
      durationDays: Math.max(
        0,
        Math.min(phase.endDay - phase.startDay, DEFAULT_TRANSITION_DURATION_DAYS),
      ),
    };
    if (
      best === undefined ||
      candidate.boundaryDay < best.boundaryDay ||
      (candidate.boundaryDay === best.boundaryDay && compareStrings(candidate.phaseId, best.phaseId) < 0)
    ) {
      best = candidate;
    }
  }
  return best;
}

function crossesInterval(day: number, lower: number, upper: number): boolean {
  return day > lower && day <= upper;
}

function stepFor(
  entityId: string,
  kind: "appear" | "disappear",
  boundary: PhaseBoundary,
): TimelineAnimationStep {
  return deepFreeze({
    entityId,
    kind,
    phaseId: boundary.phaseId,
    boundaryDay: boundary.boundaryDay,
    durationDays: boundary.durationDays,
    easing: DEFAULT_TIMELINE_EASING,
  });
}
