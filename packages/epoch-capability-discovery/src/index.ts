/**
 * @zcode/epoch-capability-discovery — public entrypoint (W023).
 *
 * Evidence-derived capability discovery on the W021/W022 authority spine:
 * deterministic machine, digest-keyed evidence, persistence through the
 * WorldStore port, read-only lifecycle consumption, declaration-only
 * results (no execution authority, no world mutation).
 */
export { CAPABILITY_DISCOVERY_DESCRIPTOR } from './descriptor.js';
export type { CapabilityDiscoveryDescriptor } from './descriptor.js';

export type * from './types.js';

export { canonicalDigest, canonicalJSON, deepFreeze } from './canonical.js';
export { sha256Hex } from './sha256.js';

export {
  DEFAULT_PROMOTION_THRESHOLDS,
  NEUTRAL_CAPABILITY_ROLES,
  defaultDiscoveryPolicy,
  definePolicy,
  policyDigest,
  validatePolicy,
} from './policy.js';

export { evidenceOf, revisionEvidence } from './evidence.js';
export { init } from './machine.js';
export { overviewOf } from './overview.js';

export {
  SNAPSHOT_KIND,
  SNAPSHOT_VERSION,
  bindWorldStore,
  createInMemoryDiscoveryStore,
  discoveryPersistence,
  restoreSnapshot,
  snapshotOf,
} from './persistence.js';
export type { DiscoveryPersistence, InMemoryDiscoveryStore } from './persistence.js';

export { discoveryNote, lifecycleEventDigest, lifecycleEvidence, lifecycleEvidenceKind } from './lifecycle.js';
