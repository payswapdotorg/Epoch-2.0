import type { Sha256Hex } from "./branded.js";

export const RESULT_FIELD_ASSOCIATIONS = ["point", "cell"] as const;
export type ResultFieldAssociation = (typeof RESULT_FIELD_ASSOCIATIONS)[number];

export const RESULT_FIELD_ENCODINGS = ["inline", "external"] as const;
export type ResultFieldEncoding = (typeof RESULT_FIELD_ENCODINGS)[number];

export const RESULT_FIELD_DATA_TYPES = ["float32", "float64", "int32", "uint8"] as const;
export type ResultFieldDataType = (typeof RESULT_FIELD_DATA_TYPES)[number];

export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

/** Registers the canonical units for a physical quantity within a dataset. */
export interface QuantityUnit {
  readonly quantity: string;
  readonly units: string;
  readonly description?: string;
}

/** Typed, digest-only reference to an artifact owned by another package. */
export interface DigestRef {
  readonly ownerPackage: string;
  readonly artifactKind: string;
  readonly digest: Sha256Hex;
}

export interface TimeStepRef {
  readonly index: number;
  readonly value?: number;
  readonly units?: string;
}

/** One typed scalar/vector/tensor field over the referenced mesh/topology. */
export interface ResultField {
  readonly name: string;
  readonly quantity: string;
  readonly units: string;
  readonly association: ResultFieldAssociation;
  readonly dataType: ResultFieldDataType;
  readonly encoding: ResultFieldEncoding;
  readonly componentCount: number;
  readonly valueRange: ValueRange;
  readonly values?: readonly number[];
  readonly externalPayloadRef?: Sha256Hex;
}

/** Result dataset read-model: typed fields over digests of owning artifacts. */
export interface ResultDataset {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly meshRefs: readonly DigestRef[];
  readonly quantityUnits: readonly QuantityUnit[];
  readonly fields: readonly ResultField[];
  readonly timeStep?: TimeStepRef;
  readonly sourceRef?: DigestRef;
}

export type ResultDatasetRejection =
  | { readonly kind: "invalid-schema-version"; readonly message: string }
  | { readonly kind: "invalid-id"; readonly message: string }
  | { readonly kind: "invalid-title"; readonly message: string }
  | { readonly kind: "invalid-description"; readonly message: string }
  | { readonly kind: "missing-mesh-refs"; readonly message: string }
  | { readonly kind: "invalid-mesh-ref"; readonly message: string }
  | { readonly kind: "invalid-quantity-units"; readonly message: string }
  | { readonly kind: "duplicate-quantity"; readonly message: string }
  | { readonly kind: "invalid-time-step"; readonly message: string }
  | { readonly kind: "invalid-source-ref"; readonly message: string }
  | { readonly kind: "missing-fields"; readonly message: string }
  | { readonly kind: "invalid-field"; readonly message: string }
  | { readonly kind: "duplicate-field-name"; readonly field: string; readonly message: string }
  | {
      readonly kind: "unknown-quantity";
      readonly field: string;
      readonly quantity: string;
      readonly message: string;
    }
  | {
      readonly kind: "unit-mismatch";
      readonly field: string;
      readonly quantity: string;
      readonly expectedUnits: string;
      readonly actualUnits: string;
      readonly message: string;
    }
  | {
      readonly kind: "unknown-association";
      readonly field: string;
      readonly association: string;
      readonly message: string;
    }
  | {
      readonly kind: "unknown-data-type";
      readonly field: string;
      readonly dataType: string;
      readonly message: string;
    }
  | {
      readonly kind: "unknown-encoding";
      readonly field: string;
      readonly encoding: string;
      readonly message: string;
    }
  | { readonly kind: "invalid-component-count"; readonly field: string; readonly message: string }
  | { readonly kind: "invalid-value-range"; readonly field: string; readonly message: string }
  | { readonly kind: "empty-field"; readonly field: string; readonly message: string }
  | { readonly kind: "values-length-mismatch"; readonly field: string; readonly message: string }
  | { readonly kind: "range-not-bounding"; readonly field: string; readonly message: string }
  | {
      readonly kind: "missing-external-payload-ref";
      readonly field: string;
      readonly message: string;
    }
  | { readonly kind: "unexpected-inline-values"; readonly field: string; readonly message: string };

export type ResultDatasetValidation =
  | { readonly ok: true; readonly value: ResultDataset }
  | { readonly ok: false; readonly rejections: readonly ResultDatasetRejection[] };
