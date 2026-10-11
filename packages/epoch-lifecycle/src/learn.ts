/**
 * Learn-phase honesty: the Learn phase records structured notes comparing
 * what was planned with what actually happened, keyed by digests. It never
 * trains anything, never calls a model, never performs I/O and can never
 * mutate prior evidence — every produced state is deeply frozen and
 * deriveLearnings is a pure projection over the recorded events.
 */

import { appendEvent } from "./events.ts";
import { LifecycleError } from "./errors.ts";
import { assertStateShape, deepFreeze } from "./validate.ts";
import type { DerivedLearning, LearningNoteInput, LifecycleState } from "./index.ts";

/**
 * Record a structured learning note (planned digest vs actual digest vs
 * outcome) in the learn phase. Rejected everywhere else.
 */
export function recordLearningNote(state: LifecycleState, input: LearningNoteInput): LifecycleState {
  assertStateShape(state);
  const raw: unknown = input;
  if (raw === null || typeof raw !== "object") {
    throw new LifecycleError("invalid-event", "a learning note input must be an object", {});
  }
  if (state.phase !== "learn") {
    throw new LifecycleError(
      "event-phase-mismatch",
      `learning notes may only be recorded in the learn phase (currently "${state.phase}")`,
      { phase: state.phase },
    );
  }
  return appendEvent(state, {
    kind: "learning-note",
    note: input.note,
    subject: input.subject ?? null,
    provenance: input.provenance,
    evidence: input.evidence,
    learning: { plannedDigest: input.plannedDigest, actualDigest: input.actualDigest, outcome: input.outcome },
  });
}

/**
 * Derive the learning output as plain data. Pure: no training, no model
 * calls, no mutation of prior evidence; repeated calls agree exactly.
 */
export function deriveLearnings(state: LifecycleState): readonly DerivedLearning[] {
  assertStateShape(state);
  const notes: DerivedLearning[] = [];
  for (const event of state.events) {
    if (event.kind !== "learning-note") {
      continue;
    }
    const learning = event.learning;
    if (learning === null) {
      throw new LifecycleError("serialization", `learning-note event at step ${event.step} is missing its payload`, {
        step: event.step,
      });
    }
    notes.push({
      step: event.step,
      note: event.note,
      plannedDigest: learning.plannedDigest,
      actualDigest: learning.actualDigest,
      outcome: learning.outcome,
      evidence: [...event.evidence],
    });
  }
  return notes.map((note) => deepFreeze(note));
}
