import type { Digest, EntityDigest, KebabId } from "./shared.js";
import type { MeasureKind, UnitOfMeasure } from "./quantity.js";

/**
 * Inspector read-model types. An InspectorView is a DERIVED projection:
 * canonical entity identity is the world-model digest (never re-defined
 * here), panels and measurement annotations are typed data, and provenance
 * is recorded as world-model record digests in `derivedFrom`.
 */

/** Typed panel field kinds projected onto an entity. */
export type PropertyPanelField =
  | { readonly kind: "text"; readonly label: string; readonly value: string }
  | {
      readonly kind: "number";
      readonly label: string;
      readonly value: number;
      readonly unit?: UnitOfMeasure;
    }
  | {
      readonly kind: "enum";
      readonly label: string;
      readonly value: string;
      readonly options: readonly string[];
    }
  | {
      readonly kind: "digest-ref";
      readonly label: string;
      readonly ref: Digest;
      readonly refKind: string;
    };

/** A named group of typed fields. */
export interface PropertyPanel {
  readonly panelId: KebabId;
  readonly title: string;
  readonly fields: readonly PropertyPanelField[];
}

/** A measurement annotation; the unit is derived from the measure kind. */
export interface MeasurementAnnotation {
  readonly annotationId: KebabId;
  readonly measureKind: MeasureKind;
  /** Finite, non-negative. */
  readonly value: number;
  readonly unit: UnitOfMeasure;
  /** Explicit link to the quantity takeoff record that measured this value. */
  readonly takeoffId: KebabId;
  readonly note?: string;
}

/** Per-entity inspection projection (read-model). */
export interface InspectorView {
  readonly viewId: KebabId;
  readonly entityDigest: EntityDigest;
  /** Non-negative revision of this projection. */
  readonly revision: number;
  readonly panels: readonly PropertyPanel[];
  readonly measurements: readonly MeasurementAnnotation[];
  /** Digests of the world-model records this view derives from. */
  readonly derivedFrom: readonly Digest[];
}

/** Raw (unbranded) input for a panel field. */
export type RawPropertyPanelField =
  | { readonly kind: "text"; readonly label: string; readonly value: string }
  | {
      readonly kind: "number";
      readonly label: string;
      readonly value: number;
      readonly unit?: string;
    }
  | {
      readonly kind: "enum";
      readonly label: string;
      readonly value: string;
      readonly options: readonly string[];
    }
  | {
      readonly kind: "digest-ref";
      readonly label: string;
      readonly ref: string;
      readonly refKind: string;
    };

/** Raw (unbranded) input for a panel. */
export interface RawPropertyPanel {
  readonly panelId: string;
  readonly title: string;
  readonly fields: readonly RawPropertyPanelField[];
}

/** Raw (unbranded) input for a measurement annotation. */
export interface RawMeasurementAnnotation {
  readonly annotationId: string;
  readonly measureKind: MeasureKind;
  readonly value: number;
  readonly takeoffId: string;
  readonly note?: string;
}

/** Input for the deriveInspectorView machine. */
export interface InspectorProjectionInput {
  readonly viewId: string;
  readonly entityDigest: string;
  readonly revision: number;
  readonly panels: readonly RawPropertyPanel[];
  readonly measurements: readonly RawMeasurementAnnotation[];
  readonly derivedFrom: readonly string[];
}

/** Typed rejections of the deriveInspectorView machine. */
export type InspectorProjectionRejection =
  | { readonly kind: "invalid-view-id"; readonly viewId: string }
  | { readonly kind: "invalid-entity-digest"; readonly entityDigest: string }
  | { readonly kind: "invalid-revision"; readonly revision: number }
  | { readonly kind: "empty-derived-from" }
  | { readonly kind: "invalid-derived-from"; readonly index: number; readonly digest: string }
  | { readonly kind: "invalid-panel"; readonly index: number; readonly reason: string }
  | { readonly kind: "duplicate-panel-id"; readonly panelId: string }
  | { readonly kind: "invalid-measurement"; readonly index: number; readonly reason: string }
  | { readonly kind: "duplicate-annotation-id"; readonly annotationId: string };
