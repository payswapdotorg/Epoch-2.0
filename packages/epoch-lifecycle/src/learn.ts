/**
 * Learn-phase honesty: structured notes comparing planned vs actual, keyed
 * by digests. Nothing here trains anything, calls a model or performs I/O;
 * learning output is derived data, honestly typed. Prior evidence is deeply
 * frozen and cannot be mutated after the fact.
 */

import { appendEvent } from "./events.ts";
import { LifecycleError } from "./errors.ts";
import type { DerivedLearning, LearningNoteInput, LifecycleState } from "./types.ts";
import { assertStateShape, deepFreeze } from "./validate.ts";

/** Record a structured learning note (planned vs actual vs outcome). Rejected outside the learn phase. */
export function recordLearningNote(state: LifecycleState, input: LearningNoteInput): LifecycleState {
  assertStateShape(state);
  if (state.phase !== "learn") {
    throw new LifecycleError("event-phase-mismatch", `learning notes may only be recorded in the learn phase (currently "${state.phase}")`, {
      phase: state.phase,
    });
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

/** Derive the learning output as plain data. Pure projection: no training, no model calls, no mutation. */
export function deriveLearnings(state: LifecycleState): readonly DerivedLearning[] {
  assertStateShape(state);
  const notes: DerivedLearning[] = [];
  for (const event of state.events) {
    if (event.kind !== "learning-note") {
      continue;
    }
    if (event.learning === null) {
      throw new LifecycleError("invalid-event", `learning-note event at step ${event.step} is missing its payload`, {
        step: event.step,
      });
    }
    notes.push({
      step: event.step,
      note: event.note,
      plannedDigest: event.learning.plannedDigest,
      actualDigest: event.learning.actualDigest,
      outcome: event.learning.outcome,
      evidence: [...event.evidence],
    });
  }
  return deepFreeze(notes);
}
