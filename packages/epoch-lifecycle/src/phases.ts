/**
 * Canonical phase catalog for the universal engineering lifecycle (W022):
 * Understand → Decide → Plan → Acquire → Realize → Observe/Actualize →
 * Verify → Forecast → Close → Learn.
 *
 * The catalog is DATA, not behavior: entry and exit criteria are strings a
 * host can render or a policy can reference. Nothing here executes work.
 */

import { LifecycleError } from "./errors.ts";
import type { LifecyclePhaseDefinition, LifecyclePhaseId } from "./index.ts";

export const LIFECYCLE_PHASE_ORDER: readonly LifecyclePhaseId[] = [
  "understand",
  "decide",
  "plan",
  "acquire",
  "realize",
  "observe",
  "verify",
  "forecast",
  "close",
  "learn",
];

const PHASE_TABLE: Record<LifecyclePhaseId, LifecyclePhaseDefinition> = {
  understand: {
    id: "understand",
    name: "Understand",
    entryCriteria: ["problem statement referenced by digest", "context evidence recorded by digest"],
    exitCriteria: ["shared understanding recorded as evidence by digest"],
  },
  decide: {
    id: "decide",
    name: "Decide",
    entryCriteria: ["understanding evidence available by digest"],
    exitCriteria: ["decision recorded with alternatives and rationale"],
  },
  plan: {
    id: "plan",
    name: "Plan",
    entryCriteria: ["decision evidence available by digest"],
    exitCriteria: ["plan items recorded, each with an expected-outcome digest"],
  },
  acquire: {
    id: "acquire",
    name: "Acquire",
    entryCriteria: ["plan items reference acquirable inputs by digest"],
    exitCriteria: ["acquired inputs recorded with provenance"],
  },
  realize: {
    id: "realize",
    name: "Realize",
    entryCriteria: ["acquired inputs available by digest"],
    exitCriteria: ["realized work recorded against plan items"],
  },
  observe: {
    id: "observe",
    name: "Observe/Actualize",
    entryCriteria: ["realized work available for observation"],
    exitCriteria: ["observations recorded as evidence by digest"],
  },
  verify: {
    id: "verify",
    name: "Verify",
    entryCriteria: ["observations available for verification"],
    exitCriteria: ["verification results recorded as evidence by digest"],
  },
  forecast: {
    id: "forecast",
    name: "Forecast",
    entryCriteria: ["verified evidence available by digest"],
    exitCriteria: ["forecast recorded with a stated confidence basis"],
  },
  close: {
    id: "close",
    name: "Close",
    entryCriteria: ["forecast recorded"],
    exitCriteria: ["closure summary recorded; handover evidence referenced by digest"],
  },
  learn: {
    id: "learn",
    name: "Learn",
    entryCriteria: ["closed work available for retrospective"],
    exitCriteria: ["learning notes recorded as planned-vs-actual digest pairs"],
  },
};

export const LIFECYCLE_PHASE_BY_ID: Readonly<Record<LifecyclePhaseId, LifecyclePhaseDefinition>> = Object.freeze(PHASE_TABLE);

export function phaseDefinitionOf(id: LifecyclePhaseId): LifecyclePhaseDefinition {
  const definition: unknown = LIFECYCLE_PHASE_BY_ID[id];
  if (definition === null || typeof definition !== "object") {
    throw new LifecycleError("unknown-phase", `no definition for lifecycle phase "${id}"`, { id });
  }
  return definition as LifecyclePhaseDefinition;
}

export const LIFECYCLE_PHASES: readonly LifecyclePhaseDefinition[] = LIFECYCLE_PHASE_ORDER.map((id) =>
  phaseDefinitionOf(id),
);

export function isLifecyclePhaseId(value: unknown): value is LifecyclePhaseId {
  return typeof value === "string" && LIFECYCLE_PHASE_ORDER.includes(value as LifecyclePhaseId);
}

export function phaseOrdinal(id: LifecyclePhaseId): number {
  const index = LIFECYCLE_PHASE_ORDER.indexOf(id);
  if (index < 0) {
    throw new LifecycleError("unknown-phase", `unknown lifecycle phase "${id}"`, { id });
  }
  return index;
}
