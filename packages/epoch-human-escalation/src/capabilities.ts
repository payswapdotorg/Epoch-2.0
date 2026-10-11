import type {
  EscalationState,
  ExpertProfile,
  ExpertiseTag,
} from "./contracts.js";
import { openRequests } from "./machine.js";
import type { CapabilityView } from "./ports.js";

/**
 * W023 integration seam (read-only): open requests' requested expertise tags
 * are routed onto discovered capability tags. Inputs are never mutated.
 */

export interface ExpertiseMatch {
  readonly tag: ExpertiseTag;
  readonly matchingCapabilities: readonly CapabilityView[];
}

/** Read-only: routes open requests' requested expertise onto discovered capabilities. */
export function routeExpertise(
  state: EscalationState,
  capabilities: readonly CapabilityView[],
): readonly ExpertiseMatch[] {
  const wanted = new Set<ExpertiseTag>();
  for (const record of openRequests(state)) {
    for (const tag of record.request.question.requestedExpertise) {
      wanted.add(tag);
    }
  }
  const matches: ExpertiseMatch[] = [];
  for (const tag of [...wanted].sort()) {
    const matching = capabilities.filter((capability) =>
      capability.tags.includes(tag),
    );
    if (matching.length > 0) {
      matches.push({ tag, matchingCapabilities: matching });
    }
  }
  return matches;
}

/** Read-only: selects expert profiles whose expertise overlaps the requested tags. */
export function matchProfilesToTags(
  profiles: readonly ExpertProfile[],
  tags: readonly ExpertiseTag[],
): readonly ExpertProfile[] {
  const wanted = new Set<ExpertiseTag>(tags);
  return profiles.filter((profile) =>
    profile.expertise.some((tag) => wanted.has(tag)),
  );
}
