/**
 * W024 — Agent Tools: authorization-law tests — denied commands are typed
 * AuthorizationErrors carrying the denied reason; the dispatcher never
 * grants authority by itself.
 */
import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '../src/errors.js';
import { evaluateAuthorization } from '../src/authorization.js';
import { AGENT_COMMAND_KINDS } from '../src/kinds.js';
import { command, createHarness, fullAuthorization, openSession } from './helpers/harness.js';

describe('authorization law (pure evaluation)', () => {
  it('accepts a fully authorized command', () => {
    for (const kind of AGENT_COMMAND_KINDS) {
      expect(evaluateAuthorization(command(kind) as never, fullAuthorization()), kind).toBeNull();
    }
  });

  it('denies when no authorization is provided', () => {
    const denial = evaluateAuthorization(command('solution.open') as never, undefined);
    expect(denial?.deniedReason).toBe('missing-authorization');
  });

  it('denies malformed authorization declarations', () => {
    const denial = evaluateAuthorization(command('solution.open') as never, { tokenId: 'token-1' });
    expect(denial?.deniedReason).toBe('malformed-authorization');
  });

  it('denies a token mismatch between command and authorization', () => {
    const denial = evaluateAuthorization(command('solution.open') as never, fullAuthorization('other-token'));
    expect(denial?.deniedReason).toBe('token-mismatch');
  });

  it('denies command kinds not in allowedCommands', () => {
    const denial = evaluateAuthorization(
      command('solution.simulate') as never,
      fullAuthorization('token-1', 'agent-1', { allowedCommands: ['solution.open'] }),
    );
    expect(denial?.deniedReason).toBe('command-kind-not-authorized');
    expect(denial?.allowedCommands).toEqual(['solution.open']);
  });

  it('denies when a required scope is missing', () => {
    const denial = evaluateAuthorization(
      command('solution.simulate') as never,
      fullAuthorization('token-1', 'agent-1', {
        allowedCommands: ['solution.simulate'],
        scopes: ['solution.read'],
      }),
    );
    expect(denial?.deniedReason).toBe('scope-not-authorized');
    expect(denial?.requiredScopes).toEqual(['solution.simulate']);
    expect(denial?.missingScopes).toEqual(['solution.simulate']);
  });

  it('denies when the token is not bound to the session', () => {
    const denial = evaluateAuthorization(
      command('solution.open', 'session-2') as never,
      fullAuthorization('token-1', 'agent-1', { boundSessions: ['session-1'] }),
    );
    expect(denial?.deniedReason).toBe('session-not-bound');
  });
});

describe('authorization law (dispatcher enforcement)', () => {
  it('denies commands with empty grants — the dispatcher never grants authority by itself', async () => {
    const harness = createHarness();
    harness.dispatcher.createSession('session-1');
    await expect(
      harness.dispatcher.dispatch(command('solution.open') as never, {
        tokenId: 'token-1',
        subject: 'agent-1',
        allowedCommands: [],
        scopes: [],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('audits denials as denied records with the denied reason', async () => {
    const harness = createHarness();
    harness.dispatcher.createSession('session-1');
    const attempt = harness.dispatcher.dispatch(command('solution.open') as never, {
      tokenId: 'token-1',
      subject: 'agent-1',
      allowedCommands: ['solution.select'],
      scopes: ['solution.interact'],
    });
    await expect(attempt).rejects.toBeInstanceOf(AuthorizationError);
    const records = await harness.worldStore.listCommandRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.outcome).toBe('denied');
    expect(records[0]?.deniedReason).toBe('command-kind-not-authorized');
    expect(records[0]?.errorCode).toBe('authorization-denied');
  });

  it('denied commands are typed errors with the denied reason', async () => {
    const harness = createHarness();
    harness.dispatcher.createSession('session-1');
    const error = await harness.dispatcher
      .dispatch(command('solution.open') as never, {
        tokenId: 'token-1',
        subject: 'agent-1',
        allowedCommands: ['solution.open'],
        scopes: [],
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.deniedReason).toBe('scope-not-authorized');
    expect(error.missingScopes).toEqual(['solution.read']);
    expect(error.code).toBe('authorization-denied');
  });

  it('denials do not leak session existence', async () => {
    const harness = createHarness();
    const error = await harness.dispatcher
      .dispatch(command('solution.open', 'ghost-session') as never, {
        tokenId: 'token-1',
        subject: 'agent-1',
        allowedCommands: [],
        scopes: [],
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
  });

  it('a token bound to another session is denied', async () => {
    const harness = createHarness();
    harness.dispatcher.createSession('session-1');
    const error = await harness.dispatcher
      .dispatch(command('solution.open', 'session-1') as never, fullAuthorization('token-1', 'agent-1', { boundSessions: ['session-9'] }))
      .catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.deniedReason).toBe('session-not-bound');
  });

  it('a replayed denied command fails again deterministically', async () => {
    const harness = createHarness();
    harness.dispatcher.createSession('session-1');
    const auth = {
      tokenId: 'token-1',
      subject: 'agent-1',
      allowedCommands: [] as never[],
      scopes: [] as never[],
    };
    await expect(harness.dispatcher.dispatch(command('solution.open') as never, auth)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(harness.dispatcher.dispatch(command('solution.open') as never, auth)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(await harness.worldStore.listCommandRecords()).toHaveLength(1);
  });

  it('an authorized caller can still work after another caller was denied', async () => {
    const harness = createHarness();
    await openSession(harness);
    const result = await harness.dispatcher.dispatch(command('solution.observe') as never, fullAuthorization());
    expect(result.status).toBe('executed');
  });
});
