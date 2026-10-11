import type { LifecycleEvent } from "@zcode/epoch-lifecycle";
import { canonicalDigest, deepFreeze } from "./canonical.js";
import type {
  CapabilityEvidence,
  DiscoveryNote,
  DiscoveryState,
  EvidenceDigest,
  EvidenceKind,
  EvidenceSourceRef,
} from "./types.js";

/**
 * W022 lifecycle integration — READ-ONLY.
 *
 * Discovery consumes LifecycleEvent evidence streams; evidence refs are
 * lifecycle event digests. Discovery never writes lifecycle state. Results
 * are exposed as structured Learn-phase notes (`discoveryNote`) that a host
 * may attach — never as world content.
 */

/**
 * Extracts the digest of a lifecycle event. W022 events are evidence-keyed
 * by digest; this reader checks the common field names and falls back to
 * the canonical digest of the event itself (still a digest of the event).
 */
export function lifecycleEventDigest(event: LifecycleEvent): EvidenceDigest {
  const record = event as unknown as Record<string, unknown>;
  for (const key of ["digest", "eventDigest", "evidenceDigest", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return canonicalDigest(event);
}

/** Derives a neutral evidence kind from a lifecycle event (namespaced under `lifecycle.`). */
export function lifecycleEvidenceKind(event: LifecycleEvent): EvidenceKind {
  const record = event as unknown as Record<string, unknown>;
  for (const key of ["kind", "type", "name"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0)
      return `lifecycle.${value}`;
  }
  return "lifecycle.transition";
}

/** Maps a read-only lifecycle event stream to digest-keyed capability evidence. */
export function lifecycleEvidence(
  events: readonly LifecycleEvent[],
): CapabilityEvidence[] {
  return events.map((event) => {
    const digest = lifecycleEventDigest(event);
    const sourceRef: EvidenceSourceRef = { lifecycleEventDigest: digest };
    const evidence: CapabilityEvidence = {
      kind: lifecycleEvidenceKind(event),
      payloadDigest: digest,
      sourceRefs: [sourceRef],
    };
    return deepFreeze(evidence);
  });
}

/**
 * Structured, provenance-bearing Learn-phase note for a discovery state.
 * Data only — JSON-serializable, digest-keyed, no world content.
 */
export function discoveryNote(state: DiscoveryState): DiscoveryNote {
  const capabilityIds = state.capabilities.map((capability) => capability.id);
  const roles = [
    ...new Set(state.capabilities.map((capability) => capability.roleId)),
  ].sort();
  const evidenceDigests = [
    ...new Set(
      state.observations.map((observation) => observation.payloadDigest),
    ),
  ].sort();
  const note: DiscoveryNote = {
    kind: "epoch.discovery-note",
    version: 1,
    sessionId: state.sessionId,
    step: state.step,
    stateDigest: canonicalDigest(state),
    capabilityIds,
    roles,
    evidenceDigests,
  };
  return deepFreeze(note);
}
