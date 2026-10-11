import { TextEncoder } from 'node:util';
import type { EscalationPolicy, EscalationState } from './contracts.js';
import { EscalationError } from './errors.js';
import { digestOf, parseState, serializeState, stateDigest } from './serialize.js';
import type { WorldStorePort } from './ports.js';

/**
 * Persistence binding: escalation sessions persist THROUGH the W021 WorldStore
 * port, keyed by the digest of the state they contain (digest-keyed audit).
 * This package consumes the port; it does not re-implement W021 storage.
 *
 * `InMemoryWorldStore` is a minimal port-conforming double for tests and demos.
 * Production hosts pass the real W021 WorldStore adapter instead (see the
 * question for the Tech Lead in the work report).
 */

export const ESCALATION_STORE_PREFIX = 'epoch.escalation/session/';

export function sessionKey(digest: string): string {
  return `${ESCALATION_STORE_PREFIX}${digest}`;
}

/** Persists a state snapshot under its own digest. Returns the digest (the restore handle). */
export async function persistState(store: WorldStorePort, state: EscalationState): Promise<string> {
  const digest = stateDigest(state);
  const bytes = new TextEncoder().encode(serializeState(state));
  await store.put(sessionKey(digest), bytes);
  return digest;
}

/**
 * Restores a state snapshot by digest (or full key). Verifies the digest key
 * against the content, and optionally that the session's policy matches.
 * Typed errors: 'state-corrupt', 'policy-mismatch'.
 */
export async function restoreState(
  store: WorldStorePort,
  keyOrDigest: string,
  options: { readonly policy?: EscalationPolicy } = {},
): Promise<EscalationState> {
  const key = keyOrDigest.startsWith(ESCALATION_STORE_PREFIX) ? keyOrDigest : sessionKey(keyOrDigest);
  const bytes = await store.get(key);
  if (bytes === null) {
    throw new EscalationError('state-corrupt', `no escalation session persisted at key ${key}`);
  }
  const state = parseState(bytes);
  const digest = stateDigest(state);
  const expected = key.slice(ESCALATION_STORE_PREFIX.length);
  if (expected !== digest) {
    throw new EscalationError(
      'state-corrupt',
      `digest key mismatch: key says ${expected}, content digests to ${digest}`,
    );
  }
  if (options.policy !== undefined && state.policyDigest !== digestOf(options.policy)) {
    throw new EscalationError('policy-mismatch', 'restored session was created under a different escalation policy');
  }
  return state;
}

/** Minimal in-memory double conforming to the WorldStore port slice (test/demo use). */
export class InMemoryWorldStore implements WorldStorePort {
  private readonly entries = new Map<string, Uint8Array>();
  private readonly putKeys: string[] = [];

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.entries.set(key, new Uint8Array(bytes));
    this.putKeys.push(key);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const found = this.entries.get(key);
    return found === undefined ? null : new Uint8Array(found);
  }

  keys(): readonly string[] {
    return [...this.entries.keys()].sort();
  }

  putCount(): number {
    return this.putKeys.length;
  }
}
