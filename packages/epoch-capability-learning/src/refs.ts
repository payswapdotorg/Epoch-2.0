/**
 * Digest-only references to records owned by other work orders.
 *
 * Authority law (no second semantic authority): the meaning of these records
 * stays with their owning packages — W023 `epoch-capability-discovery`
 * (capability declarations), W029 `epoch-environment-activity`
 * (demonstrations, outcomes, episodes, human interventions) and W030
 * `epoch-capability-evaluation` (qualification decisions, regression
 * semantics). This package never re-derives or re-embeds their content; it
 * references them by identity digest only.
 */

/** Reference to a W023 `DiscoveredCapability` declaration. */
export interface CapabilityRef {
  readonly capabilityId: string;
  readonly capabilityDigest: string;
}

/** Reference to a W029 recorded intervention episode. */
export interface InterventionRef {
  readonly episodeId: string;
  readonly interventionDigest: string;
  readonly occurredInEpoch: string;
}

/** Reference to a W029 demonstration record. */
export interface DemonstrationRef {
  readonly demonstrationDigest: string;
  readonly episodeId: string;
}

/**
 * Reference to a human intervention recorded by W029.
 *
 * This is the typed marker for human-in-the-loop actions: functions that
 * require a human actor accept a `HumanIntervention`, never a bare string.
 */
export interface HumanIntervention {
  readonly actorId: string;
  readonly role: string;
  readonly interventionDigest: string;
}
