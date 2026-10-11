/**
 * Lifecycle policies: which phase-to-phase transitions a deployment allows.
 * The default policy is the standard forward chain plus the explicit rework
 * loops Verify→Understand and Observe→Plan. Policies are data; the machine
 * only reads them.
 */

import { LifecycleError } from "./errors.ts";
import { isLifecyclePhaseId, phaseOrdinal } from "./phases.ts";
import { deepFreeze, isNonEmptyString, isPlainObject } from "./validate.ts";
import type { LifecycleEdge, LifecycleEdgeKind, LifecyclePhaseId, LifecyclePolicy } from "./index.ts";

export const DEFAULT_LIFECYCLE_POLICY_ID = "default";

function forwardEdge(from: LifecyclePhaseId, to: LifecyclePhaseId): LifecycleEdge {
  return { from, to, kind: "forward" };
}

function reworkEdge(from: LifecyclePhaseId, to: LifecyclePhaseId): LifecycleEdge {
  return { from, to, kind: "rework" };
}

export const DEFAULT_LIFECYCLE_POLICY: LifecyclePolicy = deepFreeze({
  id: DEFAULT_LIFECYCLE_POLICY_ID,
  edges: [
    forwardEdge("understand", "decide"),
    forwardEdge("decide", "plan"),
    forwardEdge("plan", "acquire"),
    forwardEdge("acquire", "realize"),
    forwardEdge("realize", "observe"),
    forwardEdge("observe", "verify"),
    forwardEdge("verify", "forecast"),
    forwardEdge("forecast", "close"),
    forwardEdge("close", "learn"),
    reworkEdge("verify", "understand"),
    reworkEdge("observe", "plan"),
  ],
});

export function edgeKey(edge: LifecycleEdge): string {
  return `${edge.from}->${edge.to}`;
}

export function findEdge(
  policy: LifecyclePolicy,
  from: LifecyclePhaseId,
  to: LifecyclePhaseId,
): LifecycleEdge | undefined {
  return policy.edges.find((edge) => edge.from === from && edge.to === to);
}

export function isReworkTransition(from: LifecyclePhaseId, to: LifecyclePhaseId): boolean {
  return phaseOrdinal(to) < phaseOrdinal(from);
}

const EDGE_KINDS: readonly LifecycleEdgeKind[] = ["forward", "rework"];

function isEdgeKind(value: unknown): value is LifecycleEdgeKind {
  return typeof value === "string" && EDGE_KINDS.includes(value as LifecycleEdgeKind);
}

/**
 * Validate a policy as data: non-empty id, non-empty edges, valid phases,
 * no self-edges, no duplicates, forward edges must be adjacent steps of the
 * canonical chain, rework edges must return to an earlier phase.
 */
export function validateLifecyclePolicy(policy: unknown): asserts policy is LifecyclePolicy {
  if (!isPlainObject(policy)) {
    throw new LifecycleError("invalid-policy", "a lifecycle policy must be a plain object", {});
  }
  if (!isNonEmptyString(policy.id)) {
    throw new LifecycleError("invalid-policy", "a lifecycle policy requires a non-empty id", { id: policy.id });
  }
  if (!Array.isArray(policy.edges) || policy.edges.length === 0) {
    throw new LifecycleError("invalid-policy", `policy "${policy.id}" requires a non-empty edges array`, {
      id: policy.id,
    });
  }
  const seen = new Set<string>();
  for (const candidate of policy.edges) {
    const edge: unknown = candidate;
    if (!isPlainObject(edge)) {
      throw new LifecycleError("invalid-policy", `policy "${policy.id}" contains a malformed edge`, { id: policy.id });
    }
    if (!isLifecyclePhaseId(edge.from) || !isLifecyclePhaseId(edge.to)) {
      throw new LifecycleError("invalid-policy", `policy "${policy.id}" contains an edge with an unknown phase`, {
        id: policy.id,
        from: edge.from,
        to: edge.to,
      });
    }
    if (!isEdgeKind(edge.kind)) {
      throw new LifecycleError("invalid-policy", `policy "${policy.id}" contains an edge with kind "${String(edge.kind)}"`, {
        id: policy.id,
        kind: edge.kind,
      });
    }
    if (edge.from === edge.to) {
      throw new LifecycleError("invalid-policy", `policy "${policy.id}" contains a self-edge on "${edge.from}"`, {
        id: policy.id,
        from: edge.from,
      });
    }
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) {
      throw new LifecycleError("invalid-policy", `policy "${policy.id}" declares the edge "${key}" twice`, {
        id: policy.id,
        edge: key,
      });
    }
    seen.add(key);
    const distance = phaseOrdinal(edge.to) - phaseOrdinal(edge.from);
    if (edge.kind === "forward" && distance !== 1) {
      throw new LifecycleError(
        "invalid-policy",
        `policy "${policy.id}" marks "${key}" as forward but it is not an adjacent step of the canonical chain`,
        { id: policy.id, edge: key, distance },
      );
    }
    if (edge.kind === "rework" && distance >= 0) {
      throw new LifecycleError(
        "invalid-policy",
        `policy "${policy.id}" marks "${key}" as rework but it does not return to an earlier phase`,
        { id: policy.id, edge: key, distance },
      );
    }
  }
}
