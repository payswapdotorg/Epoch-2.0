/**
 * W024 — Agent Tools: determinism tests — identical command sequences must
 * produce byte-identical audit serializations and identical digests, across
 * independent dispatcher instances and interleavings.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_COMMAND_KINDS } from '../src/kinds.js';
import { serializeAuditLog } from '../src/audit.js';
import { canonicalJson, sha256Hex } from '../src/hash.js';
import { command, createHarness, fullAuthorization, openSession } from './helpers/harness.js';

describe('determinism', () => {
  it('produces byte-identical audit serialization for identical command sequences', async () => {
    const runA = await runAllKinds();
    const runB = await runAllKinds();
    expect(runB).toEqual(runA);
  });

  it('produces identical audit logs across interleaved sessions with the same command order', async () => {
    const harnessA = createHarness();
    const harnessB = createHarness();
    for (const harness of [harnessA, harnessB]) {
      harness.dispatcher.createSession('session-1');
      harness.dispatcher.createSession('session-2');
      await harness.dispatcher.dispatch(command('solution.open', 'session-1', 'token-1') as never, fullAuthorization('token-1'));
      await harness.dispatcher.dispatch(command('solution.open', 'session-2', 'token-2') as never, fullAuthorization('token-2'));
      await harness.dispatcher.dispatch(
        command('solution.select', 'session-1', 'token-1', 'c-1') as never,
        fullAuthorization('token-1'),
      );
      await harness.dispatcher.dispatch(
        command('solution.select', 'session-2', 'token-2', 'c-1') as never,
        fullAuthorization('token-2'),
      );
    }
    const logA = serializeAuditLog(await harnessA.worldStore.listCommandRecords());
    const logB = serializeAuditLog(await harnessB.worldStore.listCommandRecords());
    expect(logA).toBe(logB);
  });

  it('canonicalJson sorts object keys and is stable for reordered properties', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('sha256Hex matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('command digests depend only on canonical content', async () => {
    const harness = createHarness();
    await openSession(harness);
    const first = await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
    const second = await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
    expect(second.commandDigest).toBe(first.commandDigest);
    expect(second.commandDigest).toBe(sha256Hex(canonicalJson(command('solution.select'))));
  });

  it('audit records embed the canonical command serialization', async () => {
    const harness = createHarness();
    await openSession(harness);
    await harness.dispatcher.dispatch(command('solution.select') as never, fullAuthorization());
    const record = (await harness.worldStore.listCommandRecords())[1];
    expect(record).toBeTruthy();
    expect(record?.command).toBe(canonicalJson(command('solution.select')));
    expect(record?.digest).toBe(sha256Hex(record?.command ?? ''));
  });
});

async function runAllKinds(): Promise<string> {
  const harness = createHarness();
  harness.dispatcher.createSession('session-1');
  for (const kind of AGENT_COMMAND_KINDS) {
    await harness.dispatcher.dispatch(command(kind) as never, fullAuthorization());
  }
  return serializeAuditLog(await harness.worldStore.listCommandRecords());
}
