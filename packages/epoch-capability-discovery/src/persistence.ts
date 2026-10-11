import type { WorldStore } from "@zcode/epoch-persistence";
import { canonicalDigest, canonicalJSON, deepFreeze } from "./canonical.js";
import type {
  Digest,
  DiscoveryMachine,
  DiscoveryState,
  DiscoveryStorePort,
  PersistedDiscoverySnapshot,
} from "./types.js";

export const SNAPSHOT_KIND = "epoch.discovery-snapshot";
export const SNAPSHOT_VERSION = 1;

/** Builds a digest-keyed snapshot of a discovery session state. */
export function snapshotOf(state: DiscoveryState): PersistedDiscoverySnapshot {
  const snapshot: PersistedDiscoverySnapshot = {
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    digest: canonicalDigest(state),
    sessionId: state.sessionId,
    policyDigest: state.policyDigest,
    state,
  };
  return deepFreeze(snapshot);
}

/**
 * Validates and hydrates a raw stored value as a discovery snapshot.
 * Returns null when the entry is foreign (not a discovery snapshot).
 * Throws when the entry claims to be a snapshot but is corrupt
 * (wrong version, missing fields, digest mismatch, header/state mismatch).
 */
export function restoreSnapshot(
  raw: unknown,
): PersistedDiscoverySnapshot | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.kind !== SNAPSHOT_KIND) return null;
  if (candidate.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `restoreSnapshot: unsupported snapshot version ${String(candidate.version)}`,
    );
  }
  const state = candidate.state;
  if (state === null || typeof state !== "object") {
    throw new Error("restoreSnapshot: snapshot.state must be an object");
  }
  const stateRecord = state as Record<string, unknown>;
  if (
    typeof stateRecord.sessionId !== "string" ||
    typeof stateRecord.policyDigest !== "string"
  ) {
    throw new Error(
      "restoreSnapshot: snapshot.state must carry sessionId and policyDigest",
    );
  }
  if (typeof candidate.digest !== "string" || candidate.digest.length === 0) {
    throw new Error(
      "restoreSnapshot: snapshot.digest must be a non-empty string",
    );
  }
  const recomputed = canonicalDigest(state);
  if (recomputed !== candidate.digest) {
    throw new Error(
      `restoreSnapshot: digest mismatch (key ${candidate.digest}, canonical ${recomputed})`,
    );
  }
  if (
    candidate.sessionId !== stateRecord.sessionId ||
    candidate.policyDigest !== stateRecord.policyDigest
  ) {
    throw new Error(
      "restoreSnapshot: snapshot header does not match its state",
    );
  }
  return deepFreeze(
    JSON.parse(canonicalJSON(candidate)),
  ) as PersistedDiscoverySnapshot;
}

export interface InMemoryDiscoveryStore extends DiscoveryStorePort {
  readonly size: number;
  clear(): void;
}

/** In-memory adapter for the discovery store port (tests and ephemeral hosts). */
export function createInMemoryDiscoveryStore(): InMemoryDiscoveryStore {
  const snapshots = new Map<Digest, PersistedDiscoverySnapshot>();
  const store: InMemoryDiscoveryStore = {
    save(snapshot: PersistedDiscoverySnapshot): void {
      restoreSnapshot(snapshot); // validates before storing
      snapshots.set(snapshot.digest, snapshot);
    },
    restore(digest: Digest): PersistedDiscoverySnapshot | null {
      return snapshots.get(digest) ?? null;
    },
    digests(): readonly Digest[] {
      return [...snapshots.keys()].sort();
    },
    get size(): number {
      return snapshots.size;
    },
    clear(): void {
      snapshots.clear();
    },
  };
  return store;
}

// ── WorldStore bridge ───────────────────────────────────────────────────────
//
// The W021 `WorldStore` port is CONSUMED here, never re-implemented. Because
// this package must bind to the frozen port without duplicating it, the
// bridge locates a save-like and a load-like method structurally. If the
// frozen port's method names are known precisely, this bridge can be
// tightened to a direct call (see questions for TL).

const SAVE_METHOD_NAMES = [
  "saveSnapshot",
  "save",
  "put",
  "write",
  "persist",
] as const;
const LOAD_METHOD_NAMES = [
  "loadSnapshot",
  "load",
  "get",
  "read",
  "restore",
] as const;
const LIST_METHOD_NAMES = ["listDigests", "digests", "list", "keys"] as const;

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

function pickMethod(
  store: UnknownRecord,
  names: readonly string[],
): UnknownFn | undefined {
  for (const name of names) {
    const candidate = store[name];
    if (typeof candidate === "function") {
      return candidate as UnknownFn;
    }
  }
  return undefined;
}

/** Binds a W021 WorldStore to the discovery store port (digest-keyed snapshots alongside revision lineage). */
export function bindWorldStore(worldStore: WorldStore): DiscoveryStorePort {
  if (worldStore === null || typeof worldStore !== "object") {
    throw new Error("bindWorldStore: WorldStore must be an object");
  }
  const record = worldStore as unknown as UnknownRecord;
  const save = pickMethod(record, SAVE_METHOD_NAMES);
  const load = pickMethod(record, LOAD_METHOD_NAMES);
  if (save === undefined || load === undefined) {
    const found = Object.keys(record).filter(
      (key) => typeof record[key] === "function",
    );
    throw new Error(
      `bindWorldStore: could not bind the WorldStore (need a save-like and a load-like method; found functions: [${
        found.length > 0 ? found.join(", ") : "none"
      }])`,
    );
  }
  const list = pickMethod(record, LIST_METHOD_NAMES);
  const port: DiscoveryStorePort = {
    async save(snapshot: PersistedDiscoverySnapshot): Promise<void> {
      restoreSnapshot(snapshot); // validate before persisting
      await save.call(worldStore, snapshot);
    },
    async restore(digest: Digest): Promise<PersistedDiscoverySnapshot | null> {
      const loaded = await load.call(worldStore, digest);
      return restoreSnapshot(loaded);
    },
  };
  if (list !== undefined) {
    port.digests = async (): Promise<readonly Digest[]> => {
      const result = await list.call(worldStore);
      return Array.isArray(result) ? result.map((value) => String(value)) : [];
    };
  }
  return port;
}

// ── Persistence facade ──────────────────────────────────────────────────────

export interface DiscoveryPersistence {
  save(state: DiscoveryState): Promise<PersistedDiscoverySnapshot>;
  /** Re-attaches BY DIGEST (never by mutable pointer); validates the canonical digest and policy binding. */
  restore(
    digest: Digest,
    machine: DiscoveryMachine,
  ): Promise<DiscoveryState | null>;
  snapshots(): Promise<readonly Digest[]>;
}

export function discoveryPersistence(
  store: DiscoveryStorePort,
): DiscoveryPersistence {
  return {
    async save(state: DiscoveryState): Promise<PersistedDiscoverySnapshot> {
      const snapshot = snapshotOf(state);
      await store.save(snapshot);
      return snapshot;
    },
    async restore(
      digest: Digest,
      machine: DiscoveryMachine,
    ): Promise<DiscoveryState | null> {
      const snapshot = restoreSnapshot(await store.restore(digest));
      if (snapshot === null) return null;
      if (snapshot.digest !== digest) {
        throw new Error(
          `discoveryPersistence.restore: snapshot digest ${snapshot.digest} does not match the requested digest ${digest}`,
        );
      }
      if (snapshot.state.policyDigest !== machine.policyDigest) {
        throw new Error(
          `discoveryPersistence.restore: snapshot policy ${snapshot.state.policyDigest} does not match the machine policy ${machine.policyDigest}`,
        );
      }
      if (machine.stateDigestOf(snapshot.state) !== digest) {
        throw new Error(
          "discoveryPersistence.restore: recomputed state digest does not match the snapshot digest",
        );
      }
      return snapshot.state;
    },
    async snapshots(): Promise<readonly Digest[]> {
      return store.digests ? await store.digests() : [];
    },
  };
}
