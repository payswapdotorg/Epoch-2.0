/**
 * Persistence binding THROUGH the W021 WorldStore port (consume the port,
 * never re-implement storage).
 *
 * Lifecycle snapshots are stored as canonical strings keyed by their own
 * state digest, in the same WorldStore that holds revision lineage — the
 * lifecycle only ever writes its own namespaced snapshot keys and NEVER
 * writes world revisions; it references them by digest. Restoring a solution
 * re-attaches to its lifecycle state BY DIGEST, never by mutable pointer.
 *
 * The frozen W021 port's exact method names could not be read in the
 * authoring environment, so bindWorldStore probes the common digest-addressed
 * string write/read pairs and throws a typed `persistence-binding` error
 * naming what it probed when none matches. If the real port differs, adapt
 * THIS FILE ONLY.
 */

import type { WorldStore } from "@zcode/epoch-persistence";
import { canonicalizeLifecycleState, digestOfCanonical, parseLifecycleState } from "./canonical.ts";
import { LifecycleError } from "./errors.ts";
import { assertStateShape, deepFreeze, isNonEmptyString } from "./validate.ts";
import type { LifecycleSnapshot, LifecycleSnapshotStore, LifecycleState, LifecycleStateDigest } from "./index.ts";

export const LIFECYCLE_SNAPSHOT_FORMAT = "zcode.epoch-lifecycle.snapshot/1";

const SNAPSHOT_KEY_PREFIX = "epoch-lifecycle:snapshot:";

function snapshotKeyOf(stateDigest: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${stateDigest}`;
}

type StoreWrite = (key: string, bytes: string) => unknown;
type StoreRead = (key: string) => unknown;

const PROBED_PAIRS: readonly (readonly [string, string])[] = [
  ["put", "get"],
  ["save", "load"],
  ["putArtifact", "getArtifact"],
  ["saveArtifact", "loadArtifact"],
  ["write", "read"],
];

/**
 * Adapt a WorldStore port into the digest-addressed snapshot store this
 * package needs. Probes put/get, save/load, putArtifact/getArtifact,
 *
