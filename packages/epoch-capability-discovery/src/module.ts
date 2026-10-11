/**
 * Module manifest for @zcode/epoch-capability-discovery (W023),
 * following the W021/W011/W012 module-registration pattern.
 */
export const epochCapabilityDiscoveryModule = {
  id: 'epoch-capability-discovery',
  requires: ['epoch-world-model', 'epoch-persistence', 'epoch-lifecycle'],
  provides: [
    'evidence-derived capability discovery',
    'deterministic discovery machine',
    'digest-keyed persistence binding',
    'read-only lifecycle consumption',
    'discovery overview projection',
    'no-execution-authority',
  ],
  publicEntrypoints: ['index.ts'],
} as const;
