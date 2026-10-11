import { canonicalDigest, canonicalJSON, deepFreeze } from './canonical.js';
import { overviewOf } from './overview.js';
import { policyDigest, validatePolicy } from './policy.js';
import type {
  CapabilityEvidence,
  CapabilityId,
  CapabilityScope,
  Digest,
  DiscoveredCapability,
  DiscoveryEvaluation,
  DiscoveryHistoryEntry,
  DiscoveryMachine,
  DiscoveryOverview,
  DiscoveryPolicy,
  DiscoveryResult,
  DiscoveryState,
  EvidenceDigest,
  EvidenceSourceRef,
  ObservationRecord,
  PromotionThresholds,
  RejectedCandidate,
  RuleId,
  SessionId,
} from './types.js';

/**
 * W023 discovery machine: pure and deterministic.
 *
 * - `init(policy)` returns a stateless machine bound to the policy digest.
 * - `evaluate(state, evidence)` returns the advanced state plus the outcome.
 * - Identical evidence sequences produce byte-identical canonical state
 *   serializations and identical digests.
 * - State contains monotonic step counters and digest refs only — no timestamps.
 * - Discovery NEVER mutates world revisions and NEVER grants execution
 *   authority: a discovered capability is a declaration, not a callable.
 */
export function init(policy: DiscoveryPolicy): DiscoveryMachine {
  validatePolicy(policy);
  const frozenPolicy = deepFreeze(JSON.parse(canonicalJSON(policy))) as DiscoveryPolicy;
  const digest = policyDigest(frozenPolicy);

  const machine: DiscoveryMachine = {
    policy: frozenPolicy,
    policyDigest: digest,

    initialState(sessionId?: SessionId): DiscoveryState {
      const state: DiscoveryState = {
        sessionId: sessionId ?? `discovery-session/${digest}`,
        policyDigest: digest,
        step: 0,
        observations: [],
        capabilities: [],
        rejections: [],
        history: [],
      };
      return deepFreeze(state);
    },

    evaluate(state: DiscoveryState, evidence: CapabilityEvidence): DiscoveryEvaluation {
      if (state.policyDigest !== digest) {
        throw new Error(
          `evaluate: state policy digest ${state.policyDigest} does not match this machine's policy ${digest}`,
        );
      }
      assertEvidence(evidence);
      const evidenceDigest = canonicalDigest(evidence);
      const step = state.step + 1;
      const newObservations: ObservationRecord[] = [];
      const matchedRuleIds: RuleId[] = [];
      const accepted: DiscoveredCapability[] = [];
      const rejected: RejectedCandidate[] = [];
      const clonedSourceRefs = cloneSourceRefs(evidence.sourceRefs);

      for (const rule of frozenPolicy.rules) {
        if (!ruleMatches(rule, evidence)) continue;
        matchedRuleIds.push(rule.id);

        const enabled = frozenPolicy.enabledRuleIds.includes(rule.id);
        const priorOccurrences = countRuleObservations(state.observations, rule.id);
        const occurrences = priorOccurrences + 1;
        const evidenceRefs = ruleEvidenceDigests(state.observations, rule.id, evidence.payloadDigest);
        const provenance = ruleProvenance(state.observations, rule.id, clonedSourceRefs);
        const confidence = confidenceOf(occurrences, rule.weight, frozenPolicy.promotion);
        const candidate: DiscoveredCapability = deepFreeze({
          id: capabilityIdOf(rule.candidate.roleId, rule.candidate.scope, evidenceRefs),
          roleId: rule.candidate.roleId,
          scope: rule.candidate.scope,
          confidence,
          evidenceRefs,
          provenance,
          discoveredAtStep: step,
        });

        if (!enabled) {
          rejected.push({
            ruleId: rule.id,
            capability: candidate,
            reason: 'rule-not-enabled',
            detail: `rule ${rule.id} matched the evidence but is not enabled by the discovery policy`,
          });
          continue;
        }

        newObservations.push({
          step,
          ruleId: rule.id,
          ruleEnabled: true,
          evidenceKind: evidence.kind,
          payloadDigest: evidence.payloadDigest,
          sourceRefs: clonedSourceRefs,
        });

        const key = capabilityKey(candidate.roleId, candidate.scope);
        const alreadyAccepted = state.capabilities.some(
          (capability) => capabilityKey(capability.roleId, capability.scope) === key,
        );
        if (alreadyAccepted) {
          rejected.push({
            ruleId: rule.id,
            capability: candidate,
            reason: 'duplicate',
            detail: `role ${candidate.roleId} is already declared in this session; the accepted declaration keeps its original provenance`,
          });
          continue;
        }

        const ruleMinOccurrences = rule.match.minOccurrences ?? 1;
        const requiredOccurrences = Math.max(ruleMinOccurrences, frozenPolicy.promotion.minEvidenceCount);
        if (occurrences < requiredOccurrences) {
          rejected.push({
            ruleId: rule.id,
            capability: candidate,
            reason: 'below-min-evidence',
            detail: `${occurrences} matching observation(s) is below the required ${requiredOccurrences} (rule minOccurrences ${ruleMinOccurrences}, policy minEvidenceCount ${frozenPolicy.promotion.minEvidenceCount})`,
          });
          continue;
        }
        if (confidence < frozenPolicy.promotion.minConfidence) {
          rejected.push({
            ruleId: rule.id,
            capability: candidate,
            reason: 'below-min-confidence',
            detail: `confidence ${confidence} is below minConfidence ${frozenPolicy.promotion.minConfidence}`,
          });
          continue;
        }
        accepted.push(candidate);
      }

      const historyEntry: DiscoveryHistoryEntry = deepFreeze({
        step,
        evidenceDigest,
        matchedRuleIds: deepFreeze([...matchedRuleIds]),
        acceptedCapabilityIds: deepFreeze(accepted.map((capability) => capability.id)),
        rejectedRuleIds: deepFreeze(rejected.map((rejection) => rejection.ruleId)),
      });

      const nextState: DiscoveryState = deepFreeze({
        sessionId: state.sessionId,
        policyDigest: digest,
        step,
        observations: deepFreeze([...state.observations, ...newObservations]),
        capabilities: deepFreeze([...state.capabilities, ...accepted]),
        rejections: deepFreeze([...state.rejections, ...rejected]),
        history: deepFreeze([...state.history, historyEntry]),
      });

      const result: DiscoveryResult = deepFreeze({
        step,
        evidenceDigest,
        matchedRuleIds: deepFreeze([...matchedRuleIds]),
        accepted: deepFreeze([...accepted]),
        rejected: deepFreeze([...rejected]),
      });

      const evaluation: DiscoveryEvaluation = deepFreeze({
        previousStateDigest: canonicalDigest(state),
        state: nextState,
        result,
      });
      return evaluation;
    },

    historyOf(state: DiscoveryState): readonly DiscoveryHistoryEntry[] {
      return state.history;
    },

    overviewOf(state: DiscoveryState): DiscoveryOverview {
      return overviewOf(state);
    },

    stateDigestOf(state: DiscoveryState): Digest {
      return canonicalDigest(state);
    },

    evidenceDigestOf(evidence: CapabilityEvidence): Digest {
      return canonicalDigest(evidence);
    },
  };

  return deepFreeze(machine);
}

// ── internals ───────────────────────────────────────────────────────────────

function assertEvidence(evidence: CapabilityEvidence): void {
  if (evidence === null || typeof evidence !== 'object') {
    throw new Error('evaluate: evidence must be an object');
  }
  if (typeof evidence.kind !== 'string' || evidence.kind.length === 0) {
    throw new Error('evaluate: evidence.kind must be a non-empty string');
  }
  if (typeof evidence.payloadDigest !== 'string' || evidence.payloadDigest.length === 0) {
    throw new Error('evaluate: evidence.payloadDigest must be a non-empty string');
  }
  if (!Array.isArray(evidence.sourceRefs)) {
    throw new Error('evaluate: evidence.sourceRefs must be an array');
  }
  if (evidence.subject !== undefined && (typeof evidence.subject !== 'object' || evidence.subject === null)) {
    throw new Error('evaluate: evidence.subject must be an object when present');
  }
}

function ruleMatches(rule: DiscoveryPolicy['rules'][number], evidence: CapabilityEvidence): boolean {
  const match = rule.match;
  if (match.evidenceKind !== undefined && match.evidenceKind !== evidence.kind) return false;
  if (match.subjectKind !== undefined) {
    if (evidence.subject === undefined || evidence.subject.kind !== match.subjectKind) return false;
  }
  if (match.payloadDigestIn !== undefined && !match.payloadDigestIn.includes(evidence.payloadDigest)) return false;
  return true;
}

function countRuleObservations(observations: readonly ObservationRecord[], ruleId: RuleId): number {
  let count = 0;
  for (const observation of observations) {
    if (observation.ruleId === ruleId) count += 1;
  }
  return count;
}

function cloneSourceRefs(refs: readonly EvidenceSourceRef[]): EvidenceSourceRef[] {
  return refs.map((ref) => ({ ...ref }));
}

function ruleEvidenceDigests(
  observations: readonly ObservationRecord[],
  ruleId: RuleId,
  current: EvidenceDigest,
): EvidenceDigest[] {
  const digests = new Set<EvidenceDigest>();
  for (const observation of observations) {
    if (observation.ruleId === ruleId) digests.add(observation.payloadDigest);
  }
  digests.add(current);
  return [...digests].sort();
}

function ruleProvenance(
  observations: readonly ObservationRecord[],
  ruleId: RuleId,
  current: readonly EvidenceSourceRef[],
): EvidenceSourceRef[] {
  const seen = new Map<string, EvidenceSourceRef>();
  const add = (ref: EvidenceSourceRef): void => {
    seen.set(canonicalJSON(ref), { ...ref });
  };
  for (const observation of observations) {
    if (observation.ruleId === ruleId) {
      for (const ref of observation.sourceRefs) add(ref);
    }
  }
  for (const ref of current) add(ref);
  return [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, ref]) => ref);
}

/**
 * Deterministic confidence: pure IEEE-754 arithmetic only (no Math.exp or
 * other engine-varying functions). conf(n, w) = round6(nw / (nw + 1)),
 * clamped to maxConfidence.
 */
function confidenceOf(occurrences: number, weight: number, promotion: PromotionThresholds): number {
  const mass = occurrences * weight;
  const raw = mass <= 0 ? 0 : mass / (mass + 1);
  const rounded = Math.round(raw * 1e6) / 1e6;
  return Math.min(promotion.maxConfidence, rounded);
}

function capabilityKey(roleId: string, scope: CapabilityScope): string {
  return canonicalJSON([roleId, scope]);
}

/** Capability ids are DERIVED FROM EVIDENCE DIGESTS (plus role and scope), sorted for order-independence. */
function capabilityIdOf(
  roleId: string,
  scope: CapabilityScope,
  evidenceRefs: readonly EvidenceDigest[],
): CapabilityId {
  return `capability/${canonicalDigest({ basis: 'evidence', roleId, scope, evidenceRefs: [...evidenceRefs] })}`;
}
