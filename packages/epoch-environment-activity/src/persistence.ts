/**
 * Persistence binding (W029 task 5).
 *
 * Episodes, demonstrations and candidate exports persist through the W021
 * WorldStore port keyed by digest; restoring re-attaches by digest (the
 * restored payload is validated and its recomputed digest must equal the
 * key it was stored under).
 *
 * WorldStorePort is the structural mirror of the W021 digest-keyed store
 * surface (put/get by digest). bindWorldStore() accepts any structurally
 * compatible store, including the W021 WorldStore port itself; no
 * provider-specific API is assumed (provider-neutral contract).
 */

import {
  type CanonicalValue,
  digestRecord,
  errorMessage,
  isNonEmptyString,
} from "./canonical.js";
import { deepFreeze } from "./freeze.js";
import {
  type ActivityEpisode,
  episodeDigest,
  isActivityEpisode,
} from "./episodes.js";
import {
  type Demonstration,
  demonstrationDigest,
  isDemonstration,
} from "./demonstrations.js";
import {
  type CandidateExport,
  candidateDigest,
  isCandidateExport,
} from "./candidates.js";
import { PersistenceBindingError } from "./errors.js";

export const ACTIVITY_STORE_SCHEMA = "epoch-environment-activity/v1" as const;

export type StoredKind = "episode" | "demonstration" | "candidate-export";

export interface StoredEnvelope {
  readonly schema: typeof ACTIVITY_STORE_SCHEMA;
  readonly kind: StoredKind;
  readonly digest: string;
  readonly payload: CanonicalValue;
}

/**
 * Structural port mirroring the W021 WorldStore's digest-keyed surface.
 * Implementations may be synchronous or asynchronous.
 */
export interface WorldStorePort {
  put(envelope: StoredEnvelope): void | Promise<void>;
  get(
    digest: string,
  ): StoredEnvelope | null | undefined | Promise<StoredEnvelope | null | undefined>;
}

export interface ActivityPersistenceBinding {
  saveEpisode(episode: ActivityEpisode): Promise<string>;
  saveDemonstration(demonstration: Demonstration): Promise<string>;
  saveCandidateExport(candidate: CandidateExport): Promise<string>;
  restoreEpisode(digest: string): Promise<ActivityEpisode>;
  restoreDemonstration(digest: string): Promise<Demonstration>;
  restoreCandidateExport(digest: string): Promise<CandidateExport>;
}

export function bindWorldStore(store: WorldStorePort): ActivityPersistenceBinding {
  const save = async (
    kind: StoredKind,
    value: object,
    digest: string,
  ): Promise<string> => {
    const envelope: StoredEnvelope = deepFreeze({
      schema: ACTIVITY_STORE_SCHEMA,
      kind,
      digest,
      payload: value as unknown as CanonicalValue,
    });
    await store.put(envelope);
    return digest;
  };
  const restore = async (
    digest: string,
    kind: StoredKind,
    what: string,
    guard: (value: unknown) => boolean,
  ): Promise<unknown> => {
    if (!isNonEmptyString(digest)) {
      throw new PersistenceBindingError("digest must be a non-empty string");
    }
    const found = await store.get(digest);
    if (found === null || found === undefined) {
      throw new PersistenceBindingError(`${what} not found for digest ${digest}`);
    }
    if (found.schema !== ACTIVITY_STORE_SCHEMA) {
      throw new PersistenceBindingError(
        `unexpected store schema '${String(found.schema)}' for digest ${digest}`,
      );
    }
    if (found.kind !== kind) {
      throw new PersistenceBindingError(
        `stored record kind '${String(found.kind)}' does not match requested kind '${kind}' for digest ${digest}`,
      );
    }
    if (found.digest !== digest) {
      throw new PersistenceBindingError(
        `stored digest '${String(found.digest)}' does not match the requested key '${digest}'`,
      );
    }
    let recomputed: string;
    try {
      recomputed = digestRecord(found.payload);
    } catch (error) {
      throw new PersistenceBindingError(
        `${what} payload for digest ${digest} is not canonical JSON data: ${errorMessage(error)}`,
      );
    }
    if (recomputed !== digest) {
      throw new PersistenceBindingError(
        `${what} digest mismatch: payload digests to '${recomputed}' but was stored under '${digest}'`,
      );
    }
    if (!guard(found.payload)) {
      throw new PersistenceBindingError(
        `${what} payload for digest ${digest} failed validation`,
      );
    }
    return deepFreeze(found.payload);
  };
  return {
    saveEpisode: async (episode) => {
      if (!isActivityEpisode(episode)) {
        throw new PersistenceBindingError(
          "saveEpisode requires a valid ActivityEpisode",
        );
      }
      return save("episode", episode, episodeDigest(episode));
    },
    saveDemonstration: async (demonstration) => {
      if (!isDemonstration(demonstration)) {
        throw new PersistenceBindingError(
          "saveDemonstration requires a valid Demonstration",
        );
      }
      return save("demonstration", demonstration, demonstrationDigest(demonstration));
    },
    saveCandidateExport: async (candidate) => {
      if (!isCandidateExport(candidate)) {
        throw new PersistenceBindingError(
          "saveCandidateExport requires a valid CandidateExport",
        );
      }
      return save("candidate-export", candidate, candidateDigest(candidate));
    },
    restoreEpisode: async (digest) =>
      (await restore(digest, "episode", "episode", isActivityEpisode)) as ActivityEpisode,
    restoreDemonstration: async (digest) =>
      (await restore(
        digest,
        "demonstration",
        "demonstration",
        isDemonstration,
      )) as Demonstration,
    restoreCandidateExport: async (digest) =>
      (await restore(
        digest,
        "candidate-export",
        "candidate export",
        isCandidateExport,
      )) as CandidateExport,
  };
}
