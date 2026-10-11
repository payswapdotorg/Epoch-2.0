/**
 * W025 module manifest — provider-neutral human expert escalation.
 * Follows the monorepo module-manifest pattern (W021/W011/W012/W018/W023/W024/W029).
 * Frozen-neighbor modules are consumed through structural port slices
 * (read-only); `requires` records architecture provenance.
 */
export const epochHumanEscalationModule = {
  id: 'epoch-human-escalation',
  requires: ['epoch-world-model', 'epoch-persistence', 'epoch-lifecycle'],
  provides: [
    'policy-gated escalation machine',
    'typed question/response protocol',
    'provenance-bearing expert responses',
    'rate limits as policy data',
    'digest-keyed persistence',
    'learn notes',
  ],
  publicEntrypoints: ['index.ts'],
} as const;
