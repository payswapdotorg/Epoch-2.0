/**
 * W024 — Agent Tools: read-only overview projection tests.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_COMMAND_KINDS, REQUIRED_SCOPES_BY_KIND } from '../src/kinds.js';
import { command, createHarness, fullAuthorization, openSession } from './helpers/harness.js';

describe('AgentToolsOverview projection', () => {
  it('is empty before any session exists', async () => {
    const harness = createHarness();
    const overview = await harness.dispatcher.overview();
    expect(overview.sessionCount).toBe(0);
    expect(overview.sessions).toEqual([]);
    expect(overview.audit).toEqual({ recordCount: 0, outcomeCounts: { succeeded: 0, denied: 0 } });
  });

  it('lists all available command kinds and their required scopes', async () => {
    const harness = createHarness();
    const overview = await harness.dispatcher.overview();
    expect(overview.availableCommandKinds).toEqual([...AGENT_COMMAND_KINDS]);
    expect(overview.requiredScopesByKind).toEqual(REQUIRED_SCOPES_BY_KIND);
  });

  it('summarizes sessions and the audit log', async () => {
    const harness = createHarness();
    await openSession(harness, 'session-1');
    harness.dispatcher.createSession('session-2');
    await harness.dispatcher.dispatch(
      command('solution.select', 'session-1', 'token-1', 'c-1') as never,
      fullAuthorization(),
    );
    await harness.dispatcher.dispatch(
      command('solution.observe', 'session-2', 'token-1', 'c-2') as never,
      fullAuthorization(),
    ).catch(() => undefined); // session-2 has no open solution -> illegal command, not audited
    const overview = await harness.dispatcher.overview();
    expect(overview.sessionCount).toBe(2);
    expect(overview.sessions.map((session) => session.sessionId)).toEqual(['session-1', 'session-2']);
    const session1 = overview.sessions.find((session) => session.sessionId === 'session-1');
    expect(session1?.commandCount).toBe(2);
    expect(session1?.openSolutionId).toBe('sol-1');
    expect(typeof session1?.lastCommandDigest).toBe('string');
    const session2 = overview.sessions.find((session) => session.sessionId === 'session-2');
    expect(session2?.commandCount).toBe(0);
    expect(session2?.openSolutionId).toBeNull();
  });

  it('counts denied records in the audit summary', async () => {
    const harness = createHarness();
    harness.dispatcher.createSession('session-1');
    await harness.dispatcher
      .dispatch(command('solution.open') as never, {
        tokenId: 'token-1',
        subject: 'agent-1',
        allowedCommands: [],
        scopes: [],
      })
      .catch(() => undefined);
    const overview = await harness.dispatcher.overview();
    expect(overview.audit.recordCount).toBe(1);
    expect(overview.audit.outcomeCounts).toEqual({ succeeded: 0, denied: 1 });
  });

  it('never mutates sessions or the audit log', async () => {
    const harness = createHarness();
    await openSession(harness);
    const before = harness.dispatcher.getSession('session-1');
    const recordsBefore = await harness.worldStore.listCommandRecords();
    await harness.dispatcher.overview();
    await harness.dispatcher.overview();
    const after = harness.dispatcher.getSession('session-1');
    const recordsAfter = await harness.worldStore.listCommandRecords();
    expect(after).toEqual(before);
    expect(recordsAfter).toEqual(recordsBefore);
  });
});
