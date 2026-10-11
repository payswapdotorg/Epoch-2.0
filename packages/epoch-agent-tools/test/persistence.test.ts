/**
 * W024 — Agent Tools: persistence round-trip tests through the in-memory
 * WorldStore adapter — append-only records keyed by digest, and session
 * restore by digest.
 */
import { describe, expect, it } from 'vitest';
import {
  AuditRecordMismatchError,
  AuditRecordMissingError,
  SessionAlreadyExistsError,
} from '../src/errors.js';
import { command, copyAuditRecords, createHarness, fullAuthorization, openSession } from './helpers/harness.js';
import type { Harness } from './helpers/harness.js';

describe('persistence through the WorldStore port', () => {
  it('persists one append-only record per distinct command, keyed by digest', async () => {
    const harness = createHarness();
    await openSession(harness);
    await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
    await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization()); // replay
    await harness.dispatcher.dispatch(
      command('solution.select', 'session-1', 'token-1', 'c-2') as never,
      fullAuthorization(),
    );
    const records = await harness.worldStore.listCommandRecords();
    expect(records).toHaveLength(3); // open + select + distinct select
    const digests = new Set(records.map((record) => record.digest));
    expect(digests.size).toBe(records.length);
    for (const record of records) {
      expect(await harness.worldStore.getCommandRecord(record.digest)).toEqual(record);
    }
  });

  it('restores a session by digest and rebuilds tallies and the open solution', async () => {
    const harness = createHarness();
    const descriptor = await openSessionAndDispatch(harness);
    const restoredHarness = createHarness();
    await copyAuditRecords(harness.worldStore, restoredHarness.worldStore);
    const restored = await restoredHarness.dispatcher.restoreSession({
      sessionId: descriptor.sessionId,
      auditRefs: descriptor.auditRefs,
    });
    expect(restored.sessionId).toBe('session-1');
    expect(restored.commandCount).toBe(2);
    expect(restored.outcomeCounts).toEqual({ succeeded: 2, denied: 0 });
    expect(restored.openSolution?.solutionId).toBe('sol-1');
    expect(restored.auditRefs).toEqual(descriptor.auditRefs);
  });

  it('a restored session can continue dispatching', async () => {
    const harness = createHarness();
    const descriptor = await openSessionAndDispatch(harness);
    const restoredHarness = createHarness();
    await copyAuditRecords(harness.worldStore, restoredHarness.worldStore);
    await restoredHarness.dispatcher.restoreSession({
      sessionId: descriptor.sessionId,
      auditRefs: descriptor.auditRefs,
    });
    const result = await restoredHarness.dispatcher.dispatch(
      command('solution.observe', 'session-1', 'token-1', 'observe-1') as never,
      fullAuthorization(),
    );
    expect(result.status).toBe('executed');
    expect(result.value.observation.openSolution?.solutionId).toBe('sol-1');
  });

  it('rejects restore when a referenced digest is missing', async () => {
    const harness = createHarness();
    await expect(
      harness.dispatcher.restoreSession({ sessionId: 'session-1', auditRefs: ['deadbeef'] }),
    ).rejects.toBeInstanceOf(AuditRecordMissingError);
  });

  it('rejects restore when a record belongs to another session', async () => {
    const harness = createHarness();
    await openSession(harness);
    const record = (await harness.worldStore.listCommandRecords())[0];
    await expect(
      harness.dispatcher.restoreSession({ sessionId: 'session-9', auditRefs: [record.digest] }),
    ).rejects.toBeInstanceOf(AuditRecordMismatchError);
  });

  it('rejects restoring a session id that is already attached', async () => {
    const harness = createHarness();
    const descriptor = await openSessionAndDispatch(harness);
    await expect(
      harness.dispatcher.restoreSession({ sessionId: descriptor.sessionId, auditRefs: descriptor.auditRefs }),
    ).rejects.toBeInstanceOf(SessionAlreadyExistsError);
  });

  it('restores with denied records counted as denials', async () => {
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
    const descriptor = harness.dispatcher.getSession('session-1');
    const restoredHarness = createHarness();
    await copyAuditRecords(harness.worldStore, restoredHarness.worldStore);
    const restored = await restoredHarness.dispatcher.restoreSession({
      sessionId: 'session-1',
      auditRefs: descriptor.auditRefs,
    });
    expect(restored.outcomeCounts).toEqual({ succeeded: 0, denied: 1 });
    expect(restored.openSolution).toBeNull();
  });

  it('restores a session with no audit refs as an empty session', async () => {
    const harness = createHarness();
    const restored = await harness.dispatcher.restoreSession({ sessionId: 'session-1', auditRefs: [] });
    expect(restored.commandCount).toBe(0);
    expect(restored.openSolution).toBeNull();
    expect(restored.lastCommandDigest).toBeNull();
  });
});

async function openSessionAndDispatch(harness: Harness) {
  await openSession(harness);
  await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
  return harness.dispatcher.getSession('session-1');
}
