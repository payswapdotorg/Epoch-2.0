/**
 * Opaque digest anchors pairing frozen-package artifacts (world revisions,
 * persisted solutions, solution surfaces) with lifecycle identity. The
 * frozen packages are consumed TYPE-ONLY here (import type — fully erased at
 * runtime): their objects are never serialized into lifecycle state and
 * never read beyond the digest that the authoritative packages themselves
 * computed. Identity is digest-based, never a mutable pointer.
 */

import type { PersistedRevision, PersistedSolution, SessionSurfaceIdentity } from "@zcode/epoch-persistence";
import type { SolutionSurfaceState } from "@zcode/epoch-solution-contract";
import type { WorldRevision } from "@zcode/epoch-world-model";
import { LifecycleError } from "./errors.ts";
import type { LifecycleAnchor, LifecycleAnchorKind } from "./types.ts";
import { deepFreeze, isNonEmptyString, isPlainObject } from "./validate.ts";

function anchorFrom(value: unknown, kind: LifecycleAnchorKind): LifecycleAnchor {
  if (isNonEmptyString(value)) {
    const anchor: LifecycleAnchor = { kind, digest: value };
    return deepFreeze(anchor);
  }
  if (isPlainObject(value) && isNonEmptyString(value.digest)) {
    const anchor: LifecycleAnchor = { kind, digest: value.digest };
    return deepFreeze(anchor);
  }
  throw new LifecycleError("invalid-anchor", `cannot derive a digest for a ${kind} anchor`, { kind });
}

/** Anchor a lifecycle to a world revision by digest (type-only consumption of the world model). */
export function attachRevision(revision: WorldRevision | PersistedRevision | string | { readonly digest: string }): LifecycleAnchor {
  return anchorFrom(revision, "revision");
}

/** Anchor a lifecycle to a persisted solution / session surface identity / surface state by digest. */
export function attachSolution(
  solution: PersistedSolution | SessionSurfaceIdentity | SolutionSurfaceState | string | { readonly digest: string },
): LifecycleAnchor {
  return anchorFrom(solution, "solution");
}

/** Anchor a lifecycle to a solution surface state by digest. */
export function attachSurface(surface: SolutionSurfaceState | string | { readonly digest: string }): LifecycleAnchor {
  return anchorFrom(surface, "surface");
}
