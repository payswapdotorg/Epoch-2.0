import { canonicalDigest, deepFreeze } from "./canonical.js";
import type {
  DiscoveryOverview,
  DiscoveryState,
  EvidenceKindCount,
  RoleCount,
} from "./types.js";

/**
 * Read-only projection of a discovery state: counts, accepted roles and an
 * evidence summary. Any host can render this without importing machine
 * internals. Deterministic ordering (count desc / roleId asc; kind asc).
 */
export function overviewOf(state: DiscoveryState): DiscoveryOverview {
  const roles = new Map<string, number>();
  for (const capability of state.capabilities) {
    roles.set(capability.roleId, (roles.get(capability.roleId) ?? 0) + 1);
  }
  const kinds = new Map<string, number>();
  for (const observation of state.observations) {
    kinds.set(
      observation.evidenceKind,
      (kinds.get(observation.evidenceKind) ?? 0) + 1,
    );
  }
  const acceptedRoles: RoleCount[] = [...roles.entries()]
    .map(([roleId, count]) => ({ roleId, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.roleId < b.roleId ? -1 : a.roleId > b.roleId ? 1 : 0),
    );
  const evidenceKinds: EvidenceKindCount[] = [...kinds.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const overview: DiscoveryOverview = {
    sessionId: state.sessionId,
    step: state.step,
    stateDigest: canonicalDigest(state),
    policyDigest: state.policyDigest,
    evidenceObserved: state.history.length,
    observationCount: state.observations.length,
    acceptedCapabilityCount: state.capabilities.length,
    rejectedCandidateCount: state.rejections.length,
    acceptedRoles,
    evidenceKinds,
  };
  return deepFreeze(overview);
}
