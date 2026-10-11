/**
 * @zcode/epoch-geometry-occt — W011 public entrypoint.
 * Provider-neutral precision B-Rep geometry port with an exact analytic adapter.
 * OCCT (opencascade.js) is NOT bundled here: the port is the deliverable; a real
 * native kernel plugs in later without touching the world model, renderers or hosts.
 * The world model stays the single semantic authority; the bridge derives, never owns.
 */
export * from './contracts.ts';
export { CANONICAL_SIGNIFICANT_DIGITS, canonicalNumber, canonicalStringify, contentDigest } from './canonical.ts';
export { GeometryError, InvalidGeometryError, UnknownShapeError, UnsupportedOperationError } from './errors.ts';
export type { GeometryKernel } from './kernel.ts';
export { ANALYTIC_KERNEL_DESCRIPTOR, createAnalyticKernel, createInMemoryTestKernel } from './kernel.ts';
export type { Mesh, TessellationOptions } from './tessellate.ts';
export { tessellateShape } from './tessellate.ts';
export type { GeometryPresentationData, GeometryProvenanceRef, ProjectionOptions } from './world-bridge.ts';
export { projectShape, projectToWorldEntity } from './world-bridge.ts';
export * from './integration-seams.ts';
