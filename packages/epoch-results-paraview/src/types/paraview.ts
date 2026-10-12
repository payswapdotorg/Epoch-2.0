import type { Sha256Hex } from "./branded.js";
import type { DigestRef, ValueRange } from "./dataset.js";

export const PARAVIEW_COLOR_MAPS = [
  "cool-to-warm",
  "viridis",
  "magma",
  "plasma",
  "inferno",
  "grayscale",
  "rainbow",
  "blue-to-red",
] as const;
export type ParaViewColorMapName = (typeof PARAVIEW_COLOR_MAPS)[number];

export const PARAVIEW_REPRESENTATIONS = [
  "surface",
  "surface-with-edges",
  "wireframe",
  "points",
  "volume",
] as const;
export type ParaViewRepresentation = (typeof PARAVIEW_REPRESENTATIONS)[number];

export const PARAVIEW_FILTER_KINDS = [
  "slice",
  "clip",
  "glyph",
  "streamline",
  "contour",
  "threshold",
] as const;
export type ParaViewFilterKind = (typeof PARAVIEW_FILTER_KINDS)[number];

export type Vector3 = readonly [number, number, number];

/** Which field is colored, with which map, range mode and opacity. */
export interface ColorMapAssignment {
  readonly fieldName: string;
  readonly colorMap: ParaViewColorMapName;
  readonly rangeMode: "automatic" | "manual";
  readonly manualRange?: ValueRange;
  readonly invert: boolean;
  readonly opacity: number;
}

export interface SliceFilter {
  readonly kind: "slice";
  readonly id: string;
  readonly appliesTo?: string;
  readonly planeNormal: Vector3;
  readonly origin: Vector3;
}

export interface ClipFilter {
  readonly kind: "clip";
  readonly id: string;
  readonly appliesTo?: string;
  readonly planeNormal: Vector3;
  readonly origin: Vector3;
  readonly insideOut: boolean;
}

export interface GlyphFilter {
  readonly kind: "glyph";
  readonly id: string;
  readonly appliesTo?: string;
  readonly vectorFieldName: string;
  readonly scaleFactor: number;
  readonly glyphShape: "arrow" | "sphere" | "cone";
}

export interface StreamlineFilter {
  readonly kind: "streamline";
  readonly id: string;
  readonly appliesTo?: string;
  readonly vectorFieldName: string;
  readonly seedPoints: readonly Vector3[];
  readonly stepLength: number;
  readonly maxSteps: number;
  readonly integrationDirection: "forward" | "backward" | "both";
}

export interface ContourFilter {
  readonly kind: "contour";
  readonly id: string;
  readonly appliesTo?: string;
  readonly fieldName: string;
  readonly isoValues: readonly number[];
}

export interface ThresholdFilter {
  readonly kind: "threshold";
  readonly id: string;
  readonly appliesTo?: string;
  readonly fieldName: string;
  readonly min: number;
  readonly max: number;
}

export type ParaViewFilter =
  | SliceFilter
  | ClipFilter
  | GlyphFilter
  | StreamlineFilter
  | ContourFilter
  | ThresholdFilter;

/** Provenance: which provider plugin a visualization state came from. */
export interface ParaViewPluginRef {
  readonly schemaVersion: 1;
  readonly pluginName: string;
  readonly provider: string;
  readonly version: string;
  readonly capability: string;
  readonly stateDescriptorDigest?: Sha256Hex;
}

/** Typed builder parameters for a plugin ref. */
export interface ParaViewPluginRefParams {
  readonly pluginName: string;
  readonly provider: string;
  readonly version: string;
  readonly capability: string;
  readonly stateDescriptorDigest?: Sha256Hex;
}

/** Provider-neutral description of a visualization state; data, not execution. */
export interface ParaViewStateDescriptor {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly datasetRefs: readonly DigestRef[];
  readonly representation: ParaViewRepresentation;
  readonly colorMap: ColorMapAssignment;
  readonly filters: readonly ParaViewFilter[];
  readonly pluginRefs: readonly ParaViewPluginRef[];
  readonly notes?: readonly string[];
}

export type ParaViewPluginRefRejection =
  | { readonly kind: "invalid-schema-version"; readonly message: string }
  | { readonly kind: "invalid-plugin-name"; readonly message: string }
  | { readonly kind: "invalid-plugin-provider"; readonly message: string }
  | { readonly kind: "invalid-plugin-version"; readonly message: string }
  | { readonly kind: "invalid-plugin-capability"; readonly message: string }
  | { readonly kind: "invalid-descriptor-ref"; readonly message: string };

export type ParaViewPluginRefValidation =
  | { readonly ok: true; readonly value: ParaViewPluginRef }
  | { readonly ok: false; readonly rejections: readonly ParaViewPluginRefRejection[] };

export type ParaViewStateRejection =
  | { readonly kind: "invalid-schema-version"; readonly message: string }
  | { readonly kind: "invalid-id"; readonly message: string }
  | { readonly kind: "invalid-title"; readonly message: string }
  | { readonly kind: "missing-dataset-refs"; readonly message: string }
  | { readonly kind: "invalid-dataset-ref"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-representation"; readonly message: string }
  | { readonly kind: "invalid-color-assignment"; readonly message: string }
  | { readonly kind: "invalid-color-field"; readonly message: string }
  | { readonly kind: "invalid-color-map"; readonly colorMap: string; readonly message: string }
  | { readonly kind: "invalid-range-mode"; readonly message: string }
  | { readonly kind: "invalid-color-range"; readonly message: string }
  | { readonly kind: "invalid-invert"; readonly message: string }
  | { readonly kind: "invalid-opacity"; readonly message: string }
  | { readonly kind: "invalid-filters"; readonly message: string }
  | { readonly kind: "invalid-filter"; readonly index: number; readonly message: string }
  | {
      readonly kind: "unknown-filter-kind";
      readonly index: number;
      readonly kindName: string;
      readonly message: string;
    }
  | { readonly kind: "duplicate-filter-id"; readonly filterId: string; readonly message: string }
  | {
      readonly kind: "unknown-filter-chain";
      readonly index: number;
      readonly filterId: string;
      readonly appliesTo: string;
      readonly message: string;
    }
  | { readonly kind: "invalid-plane-normal"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-origin"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-inside-out"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-filter-field"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-glyph-scale"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-glyph-shape"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-seed-points"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-step-length"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-max-steps"; readonly index: number; readonly message: string }
  | {
      readonly kind: "invalid-integration-direction";
      readonly index: number;
      readonly message: string;
    }
  | { readonly kind: "empty-iso-values"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-iso-values"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-threshold-range"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-plugin-refs"; readonly message: string }
  | { readonly kind: "invalid-plugin-ref"; readonly index: number; readonly message: string }
  | { readonly kind: "invalid-notes"; readonly message: string };

export type ParaViewStateValidation =
  | { readonly ok: true; readonly value: ParaViewStateDescriptor }
  | { readonly ok: false; readonly rejections: readonly ParaViewStateRejection[] };
