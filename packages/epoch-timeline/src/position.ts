/**
 * Timeline positions and their portable serialization.
 *
 * A position is plain, serializable data (invariant 12 portability): the
 * clamped day ordinal it was computed at, the active phase id, the
 * fractional progress within that phase and the progress across the whole
 * construction span. Out-of-span days are clamped (documented projection,
 * not a repair); non-finite days are typed errors.
 */
import { canonicalJson } from "./canonical.js";
import { TimelineError } from "./errors.js";
import type {
  ConstructionPhase,
  TimelineModel,
  TimelinePosition,
} from "./contracts.js";
import {
  clamp01,
  deepFreeze,
  isPlainObject,
  requireFiniteNumber,
  requireNonEmptyString,
  requireUnitNumber,
} from "./internal.js";

const POSITION_SUBJECT = "timeline position";

/**
 * Compute the position at `dayOrdinal`. The active phase is the most
 * recently started phase whose start day is `<= day` (ties broken by the
 * sort order — later end day, then id); inside a schedule gap the completed
 * earlier phase stays active at progress 1.
 */
export function positionAt(
  model: TimelineModel,
  dayOrdinal: number,
): TimelinePosition {
  if (typeof dayOrdinal !== "number" || !Number.isFinite(dayOrdinal)) {
    throw new TimelineError(
      "day-invalid",
      "day ordinal must be a finite number",
    );
  }
  const day = Math.min(Math.max(dayOrdinal, model.firstDay), model.lastDay);
  const active = selectActivePhase(model.phases, day);
  const phaseSpan = active.endDay - active.startDay;
  const phaseProgress =
    phaseSpan > 0
      ? clamp01((day - active.startDay) / phaseSpan)
      : day >= active.endDay
        ? 1
        : 0;
  const span = model.lastDay - model.firstDay;
  const totalProgress =
    span > 0
      ? clamp01((day - model.firstDay) / span)
      : day >= model.lastDay
        ? 1
        : 0;
  return deepFreeze({
    day,
    activePhaseId: active.id,
    phaseProgress,
    totalProgress,
  });
}

function selectActivePhase(
  phases: readonly ConstructionPhase[],
  day: number,
): ConstructionPhase {
  let active: ConstructionPhase | undefined;
  for (const phase of phases) {
    if (phase.startDay <= day) {
      active = phase;
    } else {
      break;
    }
  }
  const fallback = active ?? phases[0];
  if (fallback === undefined) {
    throw new TimelineError(
      "model-invalid",
      "timeline model carries no phases",
    );
  }
  return fallback;
}

/** Canonical (byte-deterministic) serialization of a timeline position. */
export function serializePosition(position: TimelinePosition): string {
  return canonicalJson({
    activePhaseId: position.activePhaseId,
    day: position.day,
    phaseProgress: position.phaseProgress,
    totalProgress: position.totalProgress,
  });
}

/** Parse a serialized position; corrupt data surfaces as a typed error. */
export function parsePosition(json: string): TimelinePosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new TimelineError(
      "position-invalid",
      "timeline position JSON is not parseable",
      {
        reason: String(err),
      },
    );
  }
  if (!isPlainObject(parsed)) {
    throw new TimelineError(
      "position-invalid",
      "timeline position must be a JSON object",
    );
  }
  const day = requireFiniteNumber(
    parsed,
    "day",
    "position-invalid",
    POSITION_SUBJECT,
  );
  const activePhaseId = requireNonEmptyString(
    parsed,
    "activePhaseId",
    "position-invalid",
    POSITION_SUBJECT,
  );
  const phaseProgress = requireUnitNumber(
    parsed,
    "phaseProgress",
    "position-invalid",
    POSITION_SUBJECT,
  );
  const totalProgress = requireUnitNumber(
    parsed,
    "totalProgress",
    "position-invalid",
    POSITION_SUBJECT,
  );
  return deepFreeze({ day, activePhaseId, phaseProgress, totalProgress });
}

/** Defensive copy of a position (frozen). */
export function clonePosition(position: TimelinePosition): TimelinePosition {
  return deepFreeze({
    day: position.day,
    activePhaseId: position.activePhaseId,
    phaseProgress: position.phaseProgress,
    totalProgress: position.totalProgress,
  });
}

/** Runtime validation of a foreign position object. */
export function validatePosition(position: unknown, label: string): void {
  const subject = `${POSITION_SUBJECT} "${label}"`;
  if (!isPlainObject(position)) {
    throw new TimelineError(
      "position-invalid",
      `${subject} must be a plain object`,
    );
  }
  requireFiniteNumber(position, "day", "position-invalid", subject);
  requireNonEmptyString(position, "activePhaseId", "position-invalid", subject);
  requireUnitNumber(position, "phaseProgress", "position-invalid", subject);
  requireUnitNumber(position, "totalProgress", "position-invalid", subject);
}

/** Assert that `phaseId` belongs to `model`. */
export function assertPhaseKnown(
  model: TimelineModel,
  phaseId: string,
  label: string,
): void {
  if (!model.phases.some((phase) => phase.id === phaseId)) {
    throw new TimelineError(
      "phase-unknown",
      `${label} references phase "${phaseId}" which is not part of the timeline model`,
      { phaseId },
    );
  }
}
