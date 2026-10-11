import type { BRepShape, GeometryKernelDescriptor } from './contracts.ts';
import type { Mesh, TessellationOptions } from './tessellate.ts';
import { tessellateShape } from './tessellate.ts';

export interface GeometryProvenanceRef {
  /** Digest of the canonical BRepShape serialization — the semantic anchor. */
  readonly geometryDigest: string;
  readonly kernelId: string;
  readonly kernelVersion: string;
}

export interface GeometryPresentationData {
  readonly kind: 'geometry-presentation';
  readonly mesh: Mesh;
  readonly provenance: GeometryProvenanceRef;
}

export type ProjectionOptions = TessellationOptions;

/**
 * Derive-only world-model bridge (READ-ONLY direction).
 * Produces WorldEntity-SHAPED presentation data: triangulated facets plus a
 * provenance reference to the geometry digest. The world model remains the
 * single semantic authority — this bridge derives, never owns. It is pure and
 * never constructs, reads or mutates a WorldRevision.
 */
export function projectShape(
  shape: BRepShape,
  geometryDigest: string,
  kernel: Pick<GeometryKernelDescriptor, 'id' | 'version'>,
  options: ProjectionOptions = {},
): GeometryPresentationData {
  return {
    kind: 'geometry-presentation',
    mesh: tessellateShape(shape, options),
    provenance: { geometryDigest, kernelId: kernel.id, kernelVersion: kernel.version },
  };
}

/**
 * Projects into an entity constructed by a CALLER-SUPPLIED factory. The world
 * model (via the frozen contract) owns entity construction; geometry only
 * supplies derived, provenance-anchored data. No revision is ever touched.
 */
export function projectToWorldEntity<T>(
  shape: BRepShape,
  geometryDigest: string,
  kernel: Pick<GeometryKernelDescriptor, 'id' | 'version'>,
  makeEntity: (data: GeometryPresentationData) => T,
  options: ProjectionOptions = {},
): T {
  return makeEntity(projectShape(shape, geometryDigest, kernel, options));
}
