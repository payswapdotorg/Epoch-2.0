import { describe, expect, it } from 'vitest';
import type { LifecycleEvent } from '@zcode/epoch-lifecycle';
import { canonicalJSON, defaultDiscoveryPolicy, init, lifecycleEvidence } from '../src/index.ts';
import type { CapabilityEvidence, DiscoveryMachine, DiscoveryState } from '../src/index.ts';

function sampleEvidence(i: number): CapabilityEvidence[] {
  return [
    {
      kind: 'task.completed',
      payloadDigest: `a${i}`.padEnd(64, '0'),
      sourceRefs: [{ lifecycleEventDigest: `a${i}`.padEnd(64, '0') }],
    },
    {
      kind: 'task.failed',
      payloadDigest: `b${i}`.padEnd(64, '0'),
      sourceRefs: [{ lifecycleEventDigest: `b${i}`.padEnd(64, '0') }],
    },
    { kind: 'interaction.observed', payloadDigest: `c${i}`.padEnd(64, '0'), sourceRefs: [] },
  ];
}

function runSequence(sequence: readonly CapabilityEvidence[]): { machine: DiscoveryMachine; state: DiscoveryState } {
  const machine = init(defaultDiscoveryPolicy());
  let state = machine.initialState();
  for (const ev of sequence) {
    state = machine.evaluate(state, ev).state;
  }
  return { machine, state };
}

describe('determinism of the discovery machine', () => {
  it('identical evidence sequences yield byte-identical canonical state serializations', () => {
    const first = runSequence(sampleEvidence(1));
    const second = runSequence(sampleEvidence(1));
    expect(canonicalJSON(first.state)).toBe(canonicalJSON(second.state));
  });

  it('identical evidence sequences yield identical state digests and capability ids', () => {
    const first = runSequence(sampleEvidence(2));
    const second = runSequence(sampleEvidence(2));
    expect(first.machine.stateDigestOf(first.state)).toBe(second.machine.stateDigestOf(second.state));
    expect(canonicalJSON(first.state.capabilities)).toBe(canonicalJSON(second.state.capabilities));
  });

  it('independently initialized machines converge on the same outcome for the same evidence', () => {
    const a = runSequence(sampleEvidence(3));
    const b = runSequence(sampleEvidence(3));
    expect(a.state.capabilities.map((capability) => capability.id)).toEqual(
      b.state.capabilities.map((capability) => capability.id),
    );
  });

  it('the state carries no timestamps or environment-derived fields', () => {
    const { state } = runSequence(sampleEvidence(4));
    expect(Object.keys(state).sort()).toEqual([
      'capabilities',
      'history',
      'observations',
      'policyDigest',
      'rejections',
      'sessionId',
      'step',
    ]);
    const serialized = canonicalJSON(state);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(serialized).not.toContain('timestamp');
    expect(serialized).not.toContain('Date');
  });

  it('evidence key insertion order does not affect the evidence digest', () => {
    const machine = init(defaultDiscoveryPolicy());
    const one = { kind: 'task.completed', payloadDigest: 'k'.repeat(64), sourceRefs: [{ label: 'x' }] };
    const two = { sourceRefs: [{ label: 'x' }], payloadDigest: 'k'.repeat(64), kind: 'task.completed' };
    expect(machine.evidenceDigestOf(one)).toBe(machine.evidenceDigestOf(two));
  });

  it('lifecycle-derived evidence streams are deterministic across runs', () => {
    const events = [
      { digest: '1'.repeat(64), kind: 'task.completed' },
      { digest: '2'.repeat(64), kind: 'task.failed' },
    ] as unknown as LifecycleEvent[];
    expect(canonicalJSON(lifecycleEvidence(events))).toBe(canonicalJSON(lifecycleEvidence(events)));
  });
});
