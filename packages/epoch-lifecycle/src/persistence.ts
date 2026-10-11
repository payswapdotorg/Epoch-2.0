/**
 * Persistence binding THROUGH the W021 WorldStore port — the port is
 * consumed, storage is never re-implemented here. Lifecycle snapshots are
 * stored as canonical strings keyed by their own state digest, alongside
 * revision lineage in the same store. The lifecycle NEVER writes world
 * revisions; it only references them by digest. Restoring re-attaches BY
 * DIGEST, never by mutable pointer, and tampered bytes are detected.
 *
 * The exact W021 WorldStore method surface could not be read in the
 * authoring environment, so bindWorldStore probes the digest-addressed
 * string pairs put/get, save/load, putArtifact/getArtifact and
 * saveArtifact/loadArtifact and throws a typed persistence-binding error
 * naming what it probed when none matches. If the real port differs, adapt
 * THIS FILE ONLY.
 */

import type { WorldStore } from "@zcode/epoch-persistence";
import { canonicalizeLifecycleState, digestOfCanonical, parseLifecycleState } from "./canonical.ts";
import { LifecycleError } from "./errors.ts";
import type { LifecycleSnapshot, LifecycleSnapshotStore, LifecycleState } from "./types.ts";
import { assertStateShape, deepFreeze } from "./validate.ts";

export const LIFECYCLE_SNAPSHOT_FORMAT = "zcode.epoch-lifecycle.snapshot/1";

const SNAPSHOT_KEY_PREFIX = "epoch-lifecycle:snapshot:";

export function lifecycleSnapshotKey(stateDigest: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${stateDigest}`;
}

const PROBED_PAIRS: readonly (readonly [string, string])[] = [
  ["put", "get"],
  ["save", "load"],
  ["putArtifact", "getArtifact"],
  ["saveArtifact", "loadArtifact"],
];

type PortFunction = (this: unknown, ...args: unknown[]) => unknown;

function asPortRecord(value: unknown): Record<string, unknown> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    throw new LifecycleError("persistence-binding", "a WorldStore port must be an object", { actual: typeof value });
  }
  return value as Record<string, unknown>;
}

/** Adapt a WorldStore port into the digest-addressed snapshot store this package needs. */
export function bindWorldStore(worldStore: WorldStore): LifecycleSnapshotStore {
  const record = asPortRecord(worldStore);
  const probed: string[] = [];
  for (const [writeName, readName] of PROBED_PAIRS) {
    const write: unknown = record[writeName];
    const read: unknown = record[readName];
    probed.push(`${writeName}/${readName}`);
    if (typeof write === "function" && typeof read === "function") {
      const writeFn = write as PortFunction;
      const readFn = read as PortFunction;
      return {
        put: async (key: string, bytes: string): Promise<void> => {
          await Promise.resolve(writeFn.call(worldStore, key, bytes));
        },
        get: async (key: string): Promise<string | null> => {
          const value = await Promise.resolve(readFn.call(worldStore, key));
          return typeof value === "string" ? value : null;
        },
      };
    }
  }
  throw new LifecycleError(
    "persistence-binding",
    `cannot bind a lifecycle snapshot store: none of the probed write/read pairs (${probed.join(", ")}) exist on the provided WorldStore`,
    { probed },
  );
}

/** Persist a lifecycle snapshot THROUGH the port, keyed by the state digest. Returns the snapshot envelope. */
export async function saveLifecycle(store: LifecycleSnapshotStore, state: LifecycleState): Promise<LifecycleSnapshot> {
  assertStateShape(state);
  const canonicalBytes = canonicalizeLifecycleState(state);
  const stateDigest = digestOfCanonical(canonicalBytes);
  const snapshot: LifecycleSnapshot = {
    format: LIFECYCLE_SNAPSHOT_FORMAT,
    stateDigest,
    canonicalBytes,
    anchorKind: state.anchor.kind,
    anchorDigest: state.anchor.digest,
    policyId: state.policyId,
    phase: state.phase,
    step: state.step,
  };
  await store.put(lifecycleSnapshotKey(stateDigest), canonicalBytes);
  return deepFreeze(snapshot);
}

/** Re-attach to a lifecycle state by digest. Unknown digests yield null; tampered bytes are a typed error. */
export async function restoreLifecycle(store: LifecycleSnapshotStore, stateDigest: string): Promise<LifecycleState | null> {
  const bytes = await store.get(lifecycleSnapshotKey(stateDigest));
  if (bytes === null) {
    return null;
  }
  const actualDigest = digestOfCanonical(bytes);
  if (actualDigest !== stateDigest) {
    throw new LifecycleError("serialization", "stored lifecycle bytes do not hash to the requested digest (tampered or mis-keyed)", {
      requested: stateDigest,
      actual: actualDigest,
    });
  }
  return parseLifecycleState(bytes);
}
