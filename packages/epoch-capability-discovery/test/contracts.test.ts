import { describe, expect, it } from 'vitest';
import type { WorldRevision } from '@zcode/epoch-world-model';
import {
  DEFAULT_PROMOTION_THRESHOLDS,
  NEUTRAL_CAPABILITY_ROLES,
  canonicalDigest,
  canonicalJSON,
  deepFreeze,
  defaultDiscoveryPolicy,
  definePolicy,
  evidenceOf,
  revisionEvidence,
} from '../src/index.ts';
import type { CapabilityEvidence, DiscoveredCapability } from '../src/index.ts';

const PROVIDER_TOKENS = [
  'gpt',
  'claude',
  'gemini',
  'llama',
  'mistral',
  'openai',
  'anthropic',
  'deepseek',
  'qwen',
  'sonnet',
  'opus',
  'haiku',
];

describe('provider-neutral discovery contracts', () => {
  it('CapabilityRole declarations carry no provider or model names', () => {
    for (const role of NEUTRAL_CAPABILITY_ROLES) {
      const text = canonicalJSON(role).toLowerCase();
      for (const token of PROVIDER_TOKENS) {
        expect(text, `role ${role.id} must not mention "${token}"`).not.toContain(token);
      }
      expect(role.id.startsWith('capability.role/')).toBe(true);
      expect(role.label.length).toBeGreaterThan(0);
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  it('CapabilityEvidence is provenance-bearing, digest-keyed and free of world content', () => {
    const evidence: CapabilityEvidence = {
      kind: 'task.completed',
      payloadDigest: 'a'.repeat(64),
      sourceRefs: [{ lifecycleEventDigest: 'b'.repeat(64) }],
      subject: { kind: 'task', digest: 'c'.repeat(64) },
    };
    expect(Object.keys(evidence).sort()).toEqual(['kind', 'payloadDigest', 'sourceRefs', 'subject']);
    expect(evidence.payloadDigest).toHaveLength(64);
    expect(evidence.sourceRefs[0]?.lifecycleEventDigest).toHaveLength(64);
    const serialized = canonicalJSON(evidence);
    expect(serialized).not.toContain('content');
    expect(serialized).not.toContain('revision');
    expect(JSON.parse(serialized)).toEqual(JSON.parse(JSON.stringify(evidence)));
  });

  it('DiscoveredCapability is data: JSON round-trips and carries no callable members', () => {
    const capability: DiscoveredCapability = {
      id: 'capability/abc',
      roleId: 'capability.role/solution-synthesis',
      scope: { appliesTo: ['task'] },
      confidence: 0.75,
      evidenceRefs: ['d'.repeat(64)],
      provenance: [{ lifecycleEventDigest: 'e'.repeat(64) }],
      discoveredAtStep: 3,
    };
    expect(JSON.parse(JSON.stringify(capability))).toEqual(capability);
    const hasCallable = (value: unknown): boolean => {
      if (typeof value === 'function') return true;
      if (value === null || typeof value !== 'object') return false;
      return Object.values(value).some((child) => hasCallable(child));
    };
    expect(hasCallable(capability)).toBe(false);
  });

  it('DiscoveryRule and DiscoveryPolicy are data, not behavior', () => {
    const policy = defaultDiscoveryPolicy();
    expect(() => canonicalJSON(policy)).not.toThrow();
    expect(canonicalJSON(policy)).toContain('"weight"');
    for (const rule of policy.rules) {
      expect(rule.match).toBeTypeOf('object');
      expect(rule.candidate.roleId.startsWith('capability.role/')).toBe(true);
      expect(Array.isArray(rule.candidate.scope.appliesTo)).toBe(true);
    }
  });

  it('DiscoveryPolicy validation rejects malformed policies', () => {
    expect(DEFAULT_PROMOTION_THRESHOLDS.minEvidenceCount).toBeGreaterThan(0);
    expect(() => definePolicy({ rules: [], enabledRuleIds: ['nope'] })).toThrow(/enabled rule id/);
    const base = defaultDiscoveryPolicy();
    expect(() => definePolicy({ rules: [...base.rules, ...base.rules] })).toThrow(/duplicate rule id/);
    expect(() =>
      definePolicy({
        rules: [
          {
            id: 'r1',
            description: 'x',
            match: {},
            candidate: { roleId: 'capability.role/x', scope: { appliesTo: ['task'] } },
            weight: 2,
          },
        ],
      }),
    ).toThrow(/weight/);
    expect(() =>
      definePolicy({
        rules: base.rules,
        promotion: { minEvidenceCount: 0, minConfidence: 0.5, maxConfidence: 1 },
      }),
    ).toThrow(/minEvidenceCount/);
    expect(() =>
      definePolicy({
        rules: base.rules,
        promotion: { minEvidenceCount: 3, minConfidence: 0.9, maxConfidence: 0.5 },
      }),
    ).toThrow(/maxConfidence/);
  });

  it('evidenceOf and revisionEvidence construct digest-keyed evidence without world content', () => {
    const evidence = evidenceOf({
      kind: 'task.completed',
      payloadDigest: 'a'.repeat(64),
      lifecycleEventDigest: 'b'.repeat(64),
      subjectKind: 'task',
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(evidence.sourceRefs).toEqual([{ lifecycleEventDigest: 'b'.repeat(64) }]);
    expect(evidence.subject?.kind).toBe('task');

    const revisionLike = deepFreeze({ id: 'r', entities: [] });
    const revisionEv = revisionEvidence(revisionLike as unknown as WorldRevision);
    expect(revisionEv.kind).toBe('revision.evaluated');
    expect(revisionEv.payloadDigest).toBe(canonicalDigest(revisionLike));
    expect(revisionEv.sourceRefs).toEqual([{ revisionDigest: revisionEv.payloadDigest }]);
    expect(JSON.parse(canonicalJSON(revisionEv))).not.toHaveProperty('world');
    expect(JSON.parse(canonicalJSON(revisionEv))).not.toHaveProperty('entities');
  });
});
