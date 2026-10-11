/**
 * W024 — Agent Tools: engine-agnostic value payloads shared by the ports, the
 * results and the session descriptors.
 *
 * Everything in this module is plain JSON data. Results never carry renderer
 * objects (cameras, scenes, materials) — only value descriptions.
 */

/** A point/vector in solution space. Plain data — never a math-library object. */
export type Vec3 = readonly [number, number, number];

/** Engine-agnostic description of an open solution (value payload). */
export interface AgentSolutionInfo {
  readonly solutionId: string;
  readonly revision: string;
  readonly elementCount: number;
  readonly title?: string;
  readonly schemaVersion?: string;
}

export type AgentPropertyValue = string | number | boolean | null;

export interface AgentElementRelation {
  readonly elementId: string;
  readonly relation: string;
}

export interface AgentElementReport {
  readonly elementId: string;
  readonly type?: string;
  readonly name?: string;
  readonly properties?: Readonly<Record<string, AgentPropertyValue>>;
  readonly relations?: readonly AgentElementRelation[];
}

/** A viewpoint as plain values — deliberately NOT a renderer camera object. */
export interface AgentViewpoint {
  readonly target: Vec3;
  readonly direction: Vec3;
  readonly distance: number;
}

export interface AgentAnnotationSnapshot {
  readonly annotationId: string;
  readonly elementId?: string;
  readonly anchor?: Vec3;
  readonly text: string;
}

export interface AgentInteractionState {
  readonly selectedElementIds: readonly string[];
  readonly isolatedElementIds: readonly string[];
  readonly annotations: readonly AgentAnnotationSnapshot[];
  readonly viewpoint: AgentViewpoint | null;
}

export type AgentMeasurementReport =
  | { readonly kind: "distance"; readonly distance: number }
  | { readonly kind: "clear"; readonly clearedMeasurements: number };

export type AgentAnnotationReport =
  | { readonly action: "add"; readonly annotation: AgentAnnotationSnapshot }
  | { readonly action: "remove"; readonly annotationId: string };
