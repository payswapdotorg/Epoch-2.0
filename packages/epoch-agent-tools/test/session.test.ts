/**
 * W024 — Agent Tools: session descriptor contract tests.
 */
import { describe, expect, it } from 'vitest';
import { IllegalCommandError } from '../src/errors.js';
import { command, createHarness, fullAuthorization, openSession } from './helpers/harness.js';

describe('AgentSessionDescriptor', () => {
  it('starts empty with no open solution', () => {
    const harness = createHarness();
    const descriptor = harness.dispatcher.createSession('session-1');
    expect(descriptor).toEqual({
      sessionId: 'session-1',
      openSolution: null,
      auditRefs: [],
      commandCount: 0,
      lastCommandDigest: null,
      outcomeCounts: { succeeded: 0, denied: 0 },
    });
  });

  it('tracks audit refs by digest in first-dispatch order', async () => {
    const harness = createHarness();
    await openSession(harness);
    const select = await harness.dispatcher.dispatch(
      command('solution.select', 'session-1', 'token-1', 'c-1') as never,
      fullAuthorization(),
    );
    const observe = await harness.dispatcher.dispatch(
      command('solution.observe', 'session-1', 'token-1', 'c-2') as never,
      fullAuthorization(),
    );
    const descriptor = harness.dispatcher.getSession('session-1');
    expect(descriptor.auditRefs).toEqual([select.commandDigest, observe.commandDigest]);
    expect(descriptor.lastCommandDigest).toBe(observe.commandDigest);
  });

  it('does not duplicate the ref for a replayed command', async () => {
    const harness = createHarness();
    await openSession(harness);
    const first = await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
    await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
    const descriptor = harness.dispatcher.getSession('session-1');
    expect(descriptor.auditRefs.filter((digest) => digest === first.commandDigest)).toHaveLength(1);
  });

  it('returns defensive copies — mutating them does not affect dispatcher state', async () => {
    const harness = createHarness();
    await openSession(harness);
    const descriptor = harness.dispatcher.getSession('session-1');
    descriptor.auditRefs.push('forged');
    const fresh = harness.dispatcher.getSession('session-1');
    expect(fresh.auditRefs).not.toContain('forged');
  });

  it('rejects empty session ids', () => {
    const harness = createHarness();
    expect(() => harness.dispatcher.createSession('')).toThrow(IllegalCommandError);
  });

  it('throws SessionNotFoundError for unknown sessions on getSession', () => {
    const harness = createHarness();
    expect(() => harness.dispatcher.getSession('nope')).toThrow();
  });
});
