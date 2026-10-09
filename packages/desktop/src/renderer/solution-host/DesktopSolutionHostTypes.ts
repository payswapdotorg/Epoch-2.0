/**
 * W007 — Desktop Solution Host shared types (extracted from DesktopSolutionHost.tsx
 * to satisfy architecture-policy maxFileLines: 400).
 *
 * Pure type definitions; no logic. Imported by DesktopSolutionHost.tsx and
 * DesktopDownstreamProjection.tsx.
 */

export interface EntityInspectorData {
  readonly entityId: string;
  readonly entityType: string;
  readonly label: string;
  readonly layer: string;
  readonly materialType?: string;
  readonly materialGrade?: string;
  readonly dimensions?: ReadonlyArray<readonly [string, string]>;
  readonly quantity?: string;
  readonly phase?: string;
  readonly status?: string;
}
