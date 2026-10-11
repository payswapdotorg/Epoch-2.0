// Qualification status vocabulary + the typed transition lattice.
// Law: a capability moves UP only via benchmark evidence, one rung per benchmark run.

import type { QualificationStatus, TransitionDirection } from "./contract.js";

export const QUALIFICATION_STATUSES: readonly QualificationStatus[] =
  Object.freeze([
    "prototype",
    "named-task-qualified",
    "reference-comparable",
    "reference-superior",
  ]);

const RANK: Readonly<Record<QualificationStatus, number>> = Object.freeze({
  prototype: 0,
  "named-task-qualified": 1,
  "reference-comparable": 2,
  "reference-superior": 3,
});

const transitions: Record<QualificationStatus, readonly QualificationStatus[]> =
  {
    prototype: ["named-task-qualified"],
    "named-task-qualified": ["reference-comparable", "prototype"],
    "reference-comparable": ["reference-superior", "named-task-qualified"],
    "reference-superior": ["reference-comparable"],
  };

/** Adjacent-rung transition table; jumps of more than one rung are illegal. */
export const QUALIFICATION_TRANSITIONS: Readonly<
  Record<QualificationStatus, readonly QualificationStatus[]>
> = Object.freeze(transitions);

export function rankOf(status: QualificationStatus): number {
  return RANK[status];
}

/** Direction of a legal transition, or null for illegal transitions (e.g. two-rung jumps). */
export function transitionDirection(
  from: QualificationStatus,
  to: QualificationStatus,
): TransitionDirection | null {
  if (!QUALIFICATION_TRANSITIONS[from].includes(to)) {
    return null;
  }
  return RANK[to] > RANK[from] ? "promotion" : "regression";
}

/** One-rung demotion used for regression events; the ladder floors at prototype. */
export function stepDown(status: QualificationStatus): QualificationStatus {
  switch (status) {
    case "reference-superior":
      return "reference-comparable";
    case "reference-comparable":
      return "named-task-qualified";
    default:
      return "prototype";
  }
}

/** named-task-qualified or better is release-eligible status. */
export function isQualifiedStatus(status: QualificationStatus): boolean {
  return RANK[status] >= 1;
}

export function statusSatisfies(
  status: QualificationStatus,
  required: QualificationStatus,
): boolean {
  return RANK[status] >= RANK[required];
}
