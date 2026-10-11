/**
 * Structural port slices for the frozen W021 / W022 / W023 packages.
 *
 * These interfaces describe ONLY the members this package consumes, using
 * TypeScript structural typing. Hosts pass the real objects exported by the
 * frozen packages' public entrypoints; nothing here imports, edits or mutates
 * them. If a frozen public entrypoint changes shape, only these slices need
 * adjusting (integration concern — recorded as a question for the Tech Lead).
 */

/** Consumed slice of the W021 `WorldStore` port (digest-keyed byte storage). */
export interface WorldStorePort {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

/** Read-only slice of a W022 lifecycle event (Learn-phase detection). */
export interface LifecycleEventView {
  readonly phase: string;
  readonly kind?: string;
  readonly revisionDigest?: string;
}

/** Read-only slice of W023 discovered-capability tags. */
export interface CapabilityView {
  readonly id?: string;
  readonly tags: readonly string[];
}

/** Read-only source of discovered capabilities (W023). */
export interface CapabilitySourcePort {
  discovered(): readonly CapabilityView[];
}

/** Read-only view of a world revision (audit context only; NEVER written). */
export interface WorldRevisionView {
  readonly revisionDigest: string;
  readonly step?: number;
}
