/**
 * Canonical serialization, digests and strict parsing for lifecycle state.
 *
 * Canonical form: JSON with lexicographically sorted object keys, arrays in
 * log order, no whitespace, safe integers only. Identical operation
 * sequences therefore produce byte-identical serializations and identical
 * digests (invariant 17). parseLifecycleState strictly validates the schema
 * AND replays the log (steps exactly 1..N, each transition starting in the
 * active phase, each event belonging to the active phase, learn-phase rules)
 * before accepting restored bytes. Anything inconsistent is a typed error,
 * never a silent correction.
 */

import { sha256Hex } from "./digest.ts";
import { LifecycleError } from "./errors.ts";
import { isLifecyclePhaseId } from "./phases.ts";
import { isLifecycleAnchorKind, isLifecycleEventKind, isLearningOutcome } from "./types.ts";
import type {
  LifecycleAnchor,
  LifecycleEvent,
  LifecyclePhaseId,
  LifecycleState,
  LifecycleTransition,
  LearningNotePayload,
} from "./types.ts";
import { deepFreeze, isNonEmptyString, isPlainObject, isSafeNat } from "./validate.ts";

export function canonicalizeLifecycleState(state: LifecycleState): string {
  return canonicalValue(state, "state");
}

export function digestOfCanonical(canonicalBytes: string): string {
  return sha256Hex(canonicalBytes);
}

export function lifecycleStateDigest(state: LifecycleState): string {
  return digestOfCanonical(canonicalizeLifecycleState(state));
}

function canonicalValue(value: unknown, where: string): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new LifecycleError("serialization", `non-safe-integer number at ${where}`, { where, value });
    }
    return value.toString();
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalValue(item, `${where}[${index}]`)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key], `${where}.${key}`)}`)
      .join(",");
    return `{${body}}`;
  }
  throw new LifecycleError("serialization", `unsupported value at ${where}`, { where, type: typeof value });
}

function expectExactKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new LifecycleError("serialization", `unexpected key set at ${where}`, { where, actual, expected });
  }
}

function parseAnchorAt(value: unknown, where: string): LifecycleAnchor {
  if (!isPlainObject(value)) {
    throw new LifecycleError("serialization", `${where} must be an object`, { where });
  }
  expectExactKeys(value, ["kind", "digest"], where);
  if (!isLifecycleAnchorKind(value.kind)) {
    throw new LifecycleError("serialization", `${where}.kind is not an anchor kind`, { where, kind: value.kind });
  }
  if (!isNonEmptyString(value.digest)) {
    throw new LifecycleError("serialization", `${where}.digest must be a non-empty string`, { where });
  }
  return { kind: value.kind, digest: value.digest };
}

function parseLearningAt(value: unknown, where: string): LearningNotePayload {
  if (!isPlainObject(value)) {
    throw new LifecycleError("serialization", `${where} must be an object`, { where });
  }
  expectExactKeys(value, ["plannedDigest", "actualDigest", "outcome"], where);
  if (!isNonEmptyString(value.plannedDigest) || !isNonEmptyString(value.actualDigest)) {
    throw new LifecycleError("serialization", `${where} requires non-empty planned and actual digests`, { where });
  }
  if (!isLearningOutcome(value.outcome)) {
    throw new LifecycleError("serialization", `${where}.outcome must be "as-planned" or "deviation"`, {
      where,
      outcome: value.outcome,
    });
  }
  return { plannedDigest: value.plannedDigest, actualDigest: value.actualDigest, outcome: value.outcome };
}

function parseTransitionAt(value: unknown, where: string): LifecycleTransition {
  if (!isPlainObject(value)) {
    throw new LifecycleError("serialization", `${where} must be an object`, { where });
  }
  expectExactKeys(value, ["from", "to", "step", "reason", "evidence"], where);
  if (!isLifecyclePhaseId(value.from) || !isLifecyclePhaseId(value.to)) {
    throw new LifecycleError("serialization", `${where} references an unknown phase`, {
      where,
      from: value.from,
      to: value.to,
    });
  }
  if (!isSafeNat(value.step) || value.step < 1) {
    throw new LifecycleError("serialization", `${where}.step must be a positive safe integer`, { where, step: value.step });
  }
  if (!isNonEmptyString(value.reason)) {
    throw new LifecycleError("serialization", `${where}.reason must be a non-empty string`, { where });
  }
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || !value.evidence.every((digest) => isNonEmptyString(digest))) {
    throw new LifecycleError("serialization", `${where}.evidence must be a non-empty array of digest strings`, { where });
  }
  return { from: value.from, to: value.to, step: value.step, reason: value.reason, evidence: [...value.evidence] };
}

function parseEventAt(value: unknown, where: string): LifecycleEvent {
  if (!isPlainObject(value)) {
    throw new LifecycleError("serialization", `${where} must be an object`, { where });
  }
  expectExactKeys(value, ["kind", "phase", "step", "note", "subject", "provenance", "evidence", "learning"], where);
  if (!isLifecycleEventKind(value.kind)) {
    throw new LifecycleError("serialization", `${where}.kind is not a lifecycle event kind`, { where, kind: value.kind });
  }
  if (!isLifecyclePhaseId(value.phase)) {
    throw new LifecycleError("serialization", `${where}.phase is not a lifecycle phase`, { where, phase: value.phase });
  }
  if (!isSafeNat(value.step) || value.step < 1) {
    throw new LifecycleError("serialization", `${where}.step must be a positive safe integer`, { where, step: value.step });
  }
  if (!isNonEmptyString(value.note)) {
    throw new LifecycleError("serialization", `${where}.note must be a non-empty string`, { where });
  }
  const subject = value.subject === null ? null : parseAnchorAt(value.subject, `${where}.subject`);
  if (!Array.isArray(value.provenance) || value.provenance.length === 0 || !value.provenance.every((ref) => isNonEmptyString(ref))) {
    throw new LifecycleError("serialization", `${where}.provenance must be a non-empty array of strings`, { where });
  }
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || !value.evidence.every((digest) => isNonEmptyString(digest))) {
    throw new LifecycleError("serialization", `${where}.evidence must be a non-empty array of digest strings`, { where });
  }
  const learning = value.learning === null ? null : parseLearningAt(value.learning, `${where}.learning`);
  if ((value.kind === "learning-note") !== (learning !== null)) {
    throw new LifecycleError("serialization", `${where}: learning payload presence must match the learning-note kind`, {
      where,
      kind: value.kind,
    });
  }
  return {
    kind: value.kind,
    phase: value.phase,
    step: value.step,
    note: value.note,
    subject,
    provenance: [...value.provenance],
    evidence: [...value.evidence],
    learning,
  };
}

type ReplayOperation =
  | { readonly kind: "transition"; readonly step: number; readonly transition: LifecycleTransition }
  | { readonly kind: "event"; readonly step: number; readonly event: LifecycleEvent };

function replay(
  transitions: readonly LifecycleTransition[],
  events: readonly LifecycleEvent[],
  phase: LifecyclePhaseId,
  step: number,
  enteredPhaseAtStep: number,
): void {
  const operations: ReplayOperation[] = [
    ...transitions.map((transition): ReplayOperation => ({ kind: "transition", step: transition.step, transition })),
    ...events.map((event): ReplayOperation => ({ kind: "event", step: event.step, event })),
  ].sort((left, right) => left.step - right.step);
  const total = operations.length;
  if (step !== total) {
    throw new LifecycleError("step-mismatch", `state step ${step} does not match the ${total} logged operations`, {
      step,
      operations: total,
    });
  }
  let replayPhase: LifecyclePhaseId = "understand";
  let replayEnteredAt = 0;
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (operation === undefined) {
      throw new LifecycleError("serialization", "replay operation missing", { index });
    }
    if (operation.step !== index + 1) {
      throw new LifecycleError("step-mismatch", `operation steps must be exactly 1..${total}`, {
        expected: index + 1,
        actual: operation.step,
      });
    }
    if (operation.kind === "transition") {
      if (operation.transition.from !== replayPhase) {
        throw new LifecycleError(
          "phase-mismatch",
          `transition at step ${operation.step} starts in "${operation.transition.from}" but replay is in "${replayPhase}"`,
          { step: operation.step, from: operation.transition.from, replayPhase },
        );
      }
      replayPhase = operation.transition.to;
      replayEnteredAt = operation.step;
    } else {
      if (operation.event.phase !== replayPhase) {
        throw new LifecycleError(
          "phase-mismatch",
          `event at step ${operation.step} belongs to "${operation.event.phase}" but replay is in "${replayPhase}"`,
          { step: operation.step, phase: operation.event.phase, replayPhase },
        );
      }
      if (operation.event.kind === "learning-note" && replayPhase !== "learn") {
        throw new LifecycleError("event-phase-mismatch", `learning note recorded outside the learn phase at step ${operation.step}`, {
          step: operation.step,
          phase: replayPhase,
        });
      }
      if (replayPhase === "learn" && operation.event.kind !== "learning-note") {
        throw new LifecycleError("event-phase-mismatch", `only learning notes may be recorded in the learn phase (step ${operation.step})`, {
          step: operation.step,
          kind: operation.event.kind,
        });
      }
    }
  }
  if (replayPhase !== phase) {
    throw new LifecycleError("phase-mismatch", `replayed final phase "${replayPhase}" does not match state phase "${phase}"`, {
      replayPhase,
      phase,
    });
  }
  if (replayEnteredAt !== enteredPhaseAtStep) {
    throw new LifecycleError("step-mismatch", `replayed enteredPhaseAtStep ${replayEnteredAt} does not match ${enteredPhaseAtStep}`, {
      replayed: replayEnteredAt,
      enteredPhaseAtStep,
    });
  }
}

/** Parse and strictly validate restored lifecycle bytes; the log is replayed operation by operation. */
export function parseLifecycleState(bytes: string): LifecycleState {
  if (typeof bytes !== "string" || bytes.length === 0) {
    throw new LifecycleError("serialization", "lifecycle bytes must be a non-empty string", {});
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (cause) {
    throw new LifecycleError("serialization", "lifecycle bytes are not valid JSON", { cause: String(cause) });
  }
  if (!isPlainObject(parsed)) {
    throw new LifecycleError("serialization", "lifecycle bytes must encode a state object", {});
  }
  expectExactKeys(parsed, ["anchor", "policyId", "phase", "step", "enteredPhaseAtStep", "transitions", "events"], "state");
  const anchor = parseAnchorAt(parsed.anchor, "state.anchor");
  if (!isNonEmptyString(parsed.policyId)) {
    throw new LifecycleError("serialization", "state.policyId must be a non-empty string", {});
  }
  if (!isLifecyclePhaseId(parsed.phase)) {
    throw new LifecycleError("serialization", `state.phase "${String(parsed.phase)}" is not a lifecycle phase`, {
      phase: parsed.phase,
    });
  }
  if (!isSafeNat(parsed.step)) {
    throw new LifecycleError("serialization", "state.step must be a non-negative safe integer", { step: parsed.step });
  }
  if (!isSafeNat(parsed.enteredPhaseAtStep) || parsed.enteredPhaseAtStep > parsed.step) {
    throw new LifecycleError("serialization", "state.enteredPhaseAtStep must be a safe integer not later than step", {
      enteredPhaseAtStep: parsed.enteredPhaseAtStep,
      step: parsed.step,
    });
  }
  if (!Array.isArray(parsed.transitions) || !Array.isArray(parsed.events)) {
    throw new LifecycleError("serialization", "state.transitions and state.events must be arrays", {});
  }
  const transitions = parsed.transitions.map((value: unknown, index: number) =>
    parseTransitionAt(value, `state.transitions[${index}]`),
  );
  const events = parsed.events.map((value: unknown, index: number) => parseEventAt(value, `state.events[${index}]`));
  replay(transitions, events, parsed.phase, parsed.step, parsed.enteredPhaseAtStep);
  const state: LifecycleState = {
    anchor,
    policyId: parsed.policyId,
    phase: parsed.phase,
    step: parsed.step,
    enteredPhaseAtStep: parsed.enteredPhaseAtStep,
    transitions,
    events,
  };
  return deepFreeze(state);
}
