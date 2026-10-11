/**
 * Event recording for the lifecycle. Events are observable occurrences
 * INSIDE a phase; they never change the phase and never mutate world
 * content. Transitions and events share one monotonic step counter so the
 * whole log is totally ordered without timestamps.
 *
 * Phase rules enforced here (and mirrored by the parser's replay):
 * - learning-note events may only be recorded in the learn phase;
 * - the learn phase accepts ONLY structured learning notes.
 */

import { LifecycleError } from "./errors.ts";
import type { LearningNotePayload, LifecycleEvent, LifecycleEventKind, LifecycleEventRequest, LifecycleState } from "./index.ts";
import { assertAnchor, assertStateShape, deepFreeze, isLearningOutcome, isNonEmptyString } from "./validate.ts";

export const LIFECYCLE_EVENT_KINDS: readonly LifecycleEventKind[] = [
  "observation",
  "decision",
  "plan-item",
  "acquisition",
  "verification-result",
  "forecast",
  "learning-note",
];

export function isLifecycleEventKind(value: unknown): value is LifecycleEventKind {
  return typeof value === "string" && LIFECYCLE_EVENT_KINDS.includes(value as LifecycleEventKind);
}

function normalizeLearning(value: unknown): LearningNotePayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new LifecycleError(
      "invalid-event",
      "a learning payload must be an object with plannedDigest, actualDigest and outcome",
      { field: "learning" },
    );
  }
  const learning = value as Record<string, unknown>;
  if (!isNonEmptyString(learning.plannedDigest) || !isNonEmptyString(learning.actualDigest)) {
    throw new LifecycleError("invalid-event", "a learning payload requires non-empty planned and actual digests", {
      field: "learning",
    });
  }
  if (!isLearningOutcome(learning.outcome)) {
    throw new LifecycleError("invalid-event", `unknown learning outcome "${String(learning.outcome)}"`, {
      field: "learning",
      outcome: learning.outcome,
    });
  }
  return { plannedDigest: learning.plannedDigest, actualDigest: learning.actualDigest, outcome: learning.outcome };
}

/**
 * Validate an event request against the active state, stamp it with the
 * active phase and the next step, and return the new state. Pure: the input
 * state is never modified.
 */
export function appendEvent(state: LifecycleState, request: LifecycleEventRequest): LifecycleState {
  assertStateShape(state);
  const raw: unknown = request;
  if (raw === null || typeof raw !== "object") {
    throw new LifecycleError("invalid-event", "an event request must be an object", {});
  }
  if (!isLifecycleEventKind(request.kind)) {
    throw new LifecycleError("invalid-event", `unknown event kind "${String(request.kind)}"`, { kind: request.kind });
  }
  if (!isNonEmptyString(request.note)) {
    throw new LifecycleError("invalid-event", "an event requires a non-empty note", { field: "note", kind: request.kind });
  }
  if (
    !Array.isArray(request.provenance) ||
    request.provenance.length === 0 ||
    !request.provenance.every((ref) => isNonEmptyString(ref))
  ) {
    throw new LifecycleError("invalid-event", "an event requires at least one non-empty provenance ref", {
      field: "provenance",
      kind: request.kind,
    });
  }
  if (!Array.isArray(request.evidence) || request.evidence.length === 0) {
    throw new LifecycleError("missing-evidence", "an event requires at least one evidence digest", {
      field: "evidence",
      kind: request.kind,
    });
  }
  if (!request.evidence.every((digest) => isNonEmptyString(digest))) {
    throw new LifecycleError("invalid-evidence", "every event evidence entry must be a non-empty digest string", {
      field: "evidence",
      kind: request.kind,
    });
  }
  const subject = request.subject ?? null;
  if (subject !== null) {
    assertAnchor(subject);
  }
  const learning = normalizeLearning(request.learning);
  if (request.kind === "learning-note" && learning === null) {
    throw new LifecycleError("invalid-event", "learning-note events require a structured learning payload", {
      field: "learning",
    });
  }
  if (request.kind !== "learning-note" && learning !== null) {
    throw new LifecycleError("invalid-event", "only learning-note events may carry a learning payload", {
      field: "learning",
      kind: request.kind,
    });
  }
  if (request.kind === "learning-note" && state.phase !== "learn") {
    throw new LifecycleError(
      "event-phase-mismatch",
      `learning notes may only be recorded in the learn phase (currently "${state.phase}")`,
      { kind: request.kind, phase: state.phase },
    );
  }
  if (state.phase === "learn" && request.kind !== "learning-note") {
    throw new LifecycleError(
      "event-phase-mismatch",
      `the learn phase only records structured learning notes (got "${String(request.kind)}")`,
      { kind: request.kind, phase: state.phase },
    );
  }
  const event: LifecycleEvent = deepFreeze({
    kind: request.kind,
    phase: state.phase,
    step: state.step + 1,
    note: request.note,
    subject: subject === null ? null : { kind: subject.kind, digest: subject.digest },
    provenance: [...request.provenance],
    evidence: [...request.evidence],
    learning,
  });
  return deepFreeze({
    anchor: state.anchor,
    policyId: state.policyId,
    phase: state.phase,
    step: state.step + 1,
    enteredPhaseAtStep: state.enteredPhaseAtStep,
    transitions: state.transitions,
    events: [...state.events, event],
  });
}
