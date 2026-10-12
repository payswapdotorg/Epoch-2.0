import type { Digest, EntityDigest, Iso8601, KebabId } from "./shared.js";

/**
 * The quantities law: measure kinds, canonical units, EXPLICIT takeoff
 * methods (never implied) and measurement bases. Every takeoff record
 * carries its method and its basis.
 */

/** Measure kinds recognised by the quantities law. */
export const MEASURE_KINDS = ["length", "area", "volume", "count", "mass", "time"] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

/** Canonical units of measure — exactly one unit per measure kind. */
export const UNITS_OF_MEASURE = ["m", "m2", "m3", "count", "kg", "h"] as const;
export type UnitOfMeasure = (typeof UNITS_OF_MEASURE)[number];

/** Typed law: the one canonical unit for each measure kind. */
export const UNIT_FOR_MEASURE_KIND = {
  area: "m2",
  count: "count",
  length: "m",
  mass: "kg",
  time: "h",
  volume: "m3",
} as const satisfies Readonly<Record<MeasureKind, UnitOfMeasure>>;

/** A typed quantity: measure kind + value; the unit is derived, never free. */
export interface Quantity {
  readonly measureKind: MeasureKind;
  /** Finite, non-negative. */
  readonly value: number;
  readonly unit: UnitOfMeasure;
}

/** Typed law: the measure kind each takeoff method kind produces. */
export const TAKEOFF_METHOD_MEASURE_KIND = {
  "boundary-area": "area",
  "centerline-length": "length",
  "duration-time": "time",
  "footprint-area": "area",
  "schedule-mass": "mass",
  "solid-volume": "volume",
  "unit-count": "count",
} as const satisfies Readonly<Record<string, MeasureKind>>;

export type TakeoffMethodKind = keyof typeof TAKEOFF_METHOD_MEASURE_KIND;

/** A takeoff method as explicit data — never implied. */
export type TakeoffMethod =
  | { readonly kind: "centerline-length"; readonly elementLabel?: string }
  | { readonly kind: "boundary-area"; readonly boundaryLabel?: string }
  | { readonly kind: "footprint-area" }
  | { readonly kind: "solid-volume" }
  | { readonly kind: "unit-count"; readonly unitLabel?: string }
  | { readonly kind: "schedule-mass" }
  | { readonly kind: "duration-time" };

/** What a quantity was measured from — the measurement basis. */
export type MeasurementBasis =
  | { readonly kind: "geometry"; readonly geometryDigest: Digest }
  | { readonly kind: "parametric"; readonly recordDigest: Digest }
  | { readonly kind: "manual-survey"; readonly surveyId: KebabId; readonly surveyedAt: Iso8601 };

/** Raw (unbranded) input mirror of MeasurementBasis. */
export type RawMeasurementBasis =
  | { readonly kind: "geometry"; readonly geometryDigest: string }
  | { readonly kind: "parametric"; readonly recordDigest: string }
  | { readonly kind: "manual-survey"; readonly surveyId: string; readonly surveyedAt: string };

/** A quantity takeoff record: explicit method + explicit basis + value. */
export interface QuantityTakeoff {
  readonly takeoffId: KebabId;
  readonly entityDigest: EntityDigest;
  readonly method: TakeoffMethod;
  readonly basis: MeasurementBasis;
  readonly quantity: Quantity;
  /** Input timestamp — never generated. */
  readonly recordedAt: Iso8601;
  readonly note?: string;
}

/** Input for the buildQuantityTakeoff machine. */
export interface TakeoffInput {
  readonly takeoffId: string;
  readonly entityDigest: string;
  readonly method: TakeoffMethod;
  readonly basis: RawMeasurementBasis;
  readonly measureKind: MeasureKind;
  readonly value: number;
  readonly recordedAt: string;
  readonly note?: string;
}

/** Typed rejections of the buildQuantityTakeoff machine. */
export type TakeoffRejection =
  | { readonly kind: "invalid-takeoff-id"; readonly takeoffId: string }
  | { readonly kind: "invalid-entity-digest"; readonly entityDigest: string }
  | { readonly kind: "invalid-method"; readonly reason: string }
  | { readonly kind: "invalid-basis"; readonly reason: string }
  | { readonly kind: "invalid-measure-kind"; readonly measureKind: string }
  | { readonly kind: "invalid-value"; readonly value: number }
  | {
      readonly kind: "method-kind-mismatch";
      readonly methodKind: string;
      readonly measureKind: string;
    }
  | { readonly kind: "invalid-recorded-at"; readonly recordedAt: string }
  | { readonly kind: "invalid-note"; readonly note: string };
