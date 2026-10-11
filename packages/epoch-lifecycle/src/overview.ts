/**
 * The read-only lifecycle projection. Hosts render lifecycle views from
 * LifecycleOverview without importing machine internals. Projecting never
 * mutates the state; the result is deeply frozen derived data.
 */

import { LifecycleError } from "./errors.ts";
import { LIFECYCLE_PHASE_ORDER, phaseDefinitionOf, phaseOrdinal } from "./phases.ts";
import type { LifecycleOverview, LifecyclePhaseId, LifecyclePhaseSummary, LifecycleState } from "./types.ts";
import { assertStateShape, deepFreeze } from "./validate.ts";

interface MutablePhaseSummary {
  id: LifecyclePhaseId;
  name: string;
  status: "current" | "visited" | "pending";
  visits: number;
  eventCount: number;
  evidenceCount: number;
  enteredAtStep: number | null;
  exitedAtStep: number | null;
}

export function projectLifecycleOverview(state: LifecycleState): LifecycleOverview {
  assertStateShape(state);
  const summaries = new Map<LifecyclePhaseId, MutablePhaseSummary>();
  for (const id of LIFECYCLE_PHASE_ORDER) {
    summaries.set(id, {
      id,
      name: phaseDefinitionOf(id).name,
      status: "pending",
      visits: 0,
      eventCount: 0,
      evidenceCount: 0,
      enteredAtStep: null,
      exitedAtStep: null,
    });
  }
  const initial = summaries.get("understand");
  if (initial === undefined) {
    throw new LifecycleError("unknown-phase", "the phase catalog is missing the initial phase", {});
  }
  initial.visits = 1;
  initial.enteredAtStep = 0;

  for (const event of state.events) {
    const summary = summaries.get(event.phase);
    if (summary === undefined) {
      throw new LifecycleError("unknown-phase", `an event references unknown phase "${String(event.phase)}"`, {
        phase: event.phase,
      });
    }
    summary.eventCount += 1;
    summary.evidenceCount += event.evidence.length;
  }

  let reworkCount = 0;
  for (const transition of state.transitions) {
    const from = summaries.get(transition.from);
    const to = summaries.get(transition.to);
    if (from === undefined || to === undefined) {
      throw new LifecycleError("unknown-phase", "a transition references an unknown phase", {
        from: transition.from,
        to: transition.to,
      });
    }
    from.exitedAtStep = transition.step;
    to.visits += 1;
    to.enteredAtStep = transition.step;
    to.evidenceCount += transition.evidence.length;
    if (phaseOrdinal(transition.to) < phaseOrdinal(transition.from)) {
      reworkCount += 1;
    }
  }

  const evidenceDigests = new Set<string>();
  for (const transition of state.transitions) {
    for (const digest of transition.evidence) {
      evidenceDigests.add(digest);
    }
  }
  let learningNoteCount = 0;
  let learningAsPlanned = 0;
  let learningDeviations = 0;
  for (const event of state.events) {
    for (const digest of event.evidence) {
      evidenceDigests.add(digest);
    }
    if (event.learning !== null) {
      evidenceDigests.add(event.learning.plannedDigest);
      evidenceDigests.add(event.learning.actualDigest);
      if (event.kind === "learning-note") {
        learningNoteCount += 1;
        if (event.learning.outcome === "as-planned") {
          learningAsPlanned += 1;
        }
        if (event.learning.outcome === "deviation") {
          learningDeviations += 1;
        }
      }
    }
  }

  const phases: LifecyclePhaseSummary[] = LIFECYCLE_PHASE_ORDER.map((id) => {
    const summary = summaries.get(id);
    if (summary === undefined) {
      throw new LifecycleError("unknown-phase", `the phase catalog is missing "${id}"`, { id });
    }
    summary.status = summary.id === state.phase ? "current" : summary.visits > 0 ? "visited" : "pending";
    return { ...summary };
  });

  const overview: LifecycleOverview = {
    anchor: state.anchor,
    policyId: state.policyId,
    currentPhase: state.phase,
    currentPhaseName: phaseDefinitionOf(state.phase).name,
    step: state.step,
    transitionCount: state.transitions.length,
    eventCount: state.events.length,
    reworkCount,
    visitedPhaseCount: phases.filter((summary) => summary.visits > 0).length,
    evidenceDigests: [...evidenceDigests].sort(),
    learningNoteCount,
    learningAsPlanned,
    learningDeviations,
    phases,
  };
  return deepFreeze(overview);
}
