/**
 * The universal engineering lifecycle state machine (W022): pure and
 * deterministic. Identical operation sequences produce byte-identical
 * canonical serializations and identical digests (invariant 17); state
 * carries monotonic step counters and digest refs only — no timestamps.
 * Illegal transitions raise typed LifecycleError values, never silent
 * corrections. The machine organizes work AROUND the world-model authority;
 * it never writes world revisions — it references them by digest.
 */

import { appendEvent } from "./events.ts";
import { LifecycleError } from "./errors.ts";
import { isLifecyclePhaseId } from "./phases.ts";
import { projectLifecycleOverview } from "./overview.ts";
import { DEFAULT_LIFECYCLE_POLICY, findEdge, validateLifecyclePolicy } from "./policy.ts";
import type {
  LifecycleAnchor,
  LifecycleMachine,
  LifecyclePolicy,
  LifecycleState,
  LifecycleTransition,
  LifecycleTransitionRequest,
} from "./types.ts";
import { assertAnchor, assertStateShape, assertTransitionShape, deepFreeze, isNonEmptyString } from "./validate.ts";

function openState(policy: LifecyclePolicy, anchor: LifecycleAnchor): LifecycleState {
  assertAnchor(anchor);
  const initial: LifecycleState = {
    anchor: { kind: anchor.kind, digest: anchor.digest },
    policyId: policy.id,
    phase: "understand",
    step: 0,
    enteredPhaseAtStep: 0,
    transitions: [],
    events: [],
  };
  return deepFreeze(initial);
}

function applyTransition(policy: LifecyclePolicy, state: LifecycleState, transition: LifecycleTransition): LifecycleState {
  assertStateShape(state);
  if (state.policyId !== policy.id) {
    throw new LifecycleError("invalid-transition", `the state is governed by policy "${state.policyId}" but this machine enforces "${policy.id}"`, {
      statePolicyId: state.policyId,
      machinePolicyId: policy.id,
    });
  }
  assertTransitionShape(transition);
  if (transition.from !== state.phase) {
    throw new LifecycleError("phase-mismatch", `transition starts in "${transition.from}" but the solution is in "${state.phase}"`, {
      from: transition.from,
      to: transition.to,
      activePhase: state.phase,
    });
  }
  if (transition.step !== state.step + 1) {
    throw new LifecycleError("step-mismatch", `transition step ${transition.step} does not continue state step ${state.step}`, {
      transitionStep: transition.step,
      stateStep: state.step,
    });
  }
  if (!isNonEmptyString(transition.reason)) {
    throw new LifecycleError("missing-reason", "a transition requires a non-empty reason", { step: transition.step });
  }
  if (transition.evidence.length === 0) {
    throw new LifecycleError("missing-evidence", "a transition requires at least one evidence digest", { step: transition.step });
  }
  if (!transition.evidence.every((digest) => isNonEmptyString(digest))) {
    throw new LifecycleError("invalid-evidence", "every evidence entry must be a non-empty digest string", {
      step: transition.step,
    });
  }
  const edge = findEdge(policy, transition.from, transition.to);
  if (edge === undefined) {
    throw new LifecycleError("illegal-edge", `policy "${policy.id}" does not allow "${transition.from}" -> "${transition.to}"`, {
      policyId: policy.id,
      from: transition.from,
      to: transition.to,
      allowedTargets: policy.edges
        .filter((candidate) => candidate.from === transition.from)
        .map((candidate) => candidate.to),
    });
  }
  const next: LifecycleState = {
    anchor: state.anchor,
    policyId: state.policyId,
    phase: transition.to,
    step: transition.step,
    enteredPhaseAtStep: transition.step,
    transitions: [
      ...state.transitions,
      deepFreeze({
        from: transition.from,
        to: transition.to,
        step: transition.step,
        reason: transition.reason,
        evidence: [...transition.evidence],
      }),
    ],
    events: state.events,
  };
  return deepFreeze(next);
}

function advanceState(policy: LifecyclePolicy, state: LifecycleState, request: LifecycleTransitionRequest): LifecycleState {
  assertStateShape(state);
  if (!isLifecyclePhaseId(request.to)) {
    throw new LifecycleError("invalid-transition", `advance target "${String(request.to)}" is not a lifecycle phase`, {
      to: request.to,
    });
  }
  if (!Array.isArray(request.evidence)) {
    throw new LifecycleError("invalid-evidence", "advance requires an evidence array of digest refs", {});
  }
  return applyTransition(policy, state, {
    from: state.phase,
    to: request.to,
    step: state.step + 1,
    reason: request.reason,
    evidence: [...request.evidence],
  });
}

/** Create a machine bound to a validated policy (defaults to the standard policy). */
export function init(policy: LifecyclePolicy = DEFAULT_LIFECYCLE_POLICY): LifecycleMachine {
  validateLifecyclePolicy(policy);
  const bound: LifecyclePolicy = {
    id: policy.id,
    edges: policy.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
  };
  const machine: LifecycleMachine = {
    policy: deepFreeze(bound),
    open: (anchor) => openState(bound, anchor),
    apply: (state, transition) => applyTransition(bound, state, transition),
    advance: (state, request) => advanceState(bound, state, request),
    record: (state, request) => appendEvent(state, request),
    phaseOf: (state) => {
      assertStateShape(state);
      return state.phase;
    },
    historyOf: (state) => {
      assertStateShape(state);
      return state.transitions;
    },
    eventsOf: (state) => {
      assertStateShape(state);
      return state.events;
    },
    overviewOf: (state) => projectLifecycleOverview(state),
  };
  return deepFreeze(machine);
}
