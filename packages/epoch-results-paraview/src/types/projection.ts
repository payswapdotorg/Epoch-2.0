import type { Sha256Hex } from "./branded.js";
import type { DigestRef } from "./dataset.js";

export const PROJECTION_DERIVATION_KINDS = [
  "simulation-solver-output",
  "post-processed",
  "measured",
  "derived-analytic",
  "interpolated",
  "aggregated",
] as const;
export type ProjectionDerivationKind = (typeof PROJECTION_DERIVATION_KINDS)[number];

/** How a result dataset derives from world-model inputs. */
export interface ProjectionDerivation {
  readonly kind: ProjectionDerivationKind;
  readonly statement: string;
  readonly inputRefs: readonly DigestRef[];
}

/**
 * Projection law made structural: binds a result dataset digest to a
 * world-model entity digest with a declared derivation. The authority marker
 * makes "never silently replace baseline world state" checkable.
 */
export interface ResultProjectionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly datasetRef: DigestRef;
  readonly worldEntityRef: DigestRef;
  readonly derivation: ProjectionDerivation;
  readonly authority: "projection-only";
}

/** Typed builder parameters for a projection record. */
export interface ResultProjectionInput {
  readonly id: string;
  readonly datasetDigest: Sha256Hex;
  readonly worldEntityOwnerPackage: string;
  readonly worldEntityDigest: Sha256Hex;
  readonly derivationKind: ProjectionDerivationKind;
  readonly derivationStatement: string;
  readonly inputDigests: readonly DigestRef[];
}

export interface DerivationKindCount {
  readonly kind: ProjectionDerivationKind;
  readonly count: number;
}

/** Deterministic coverage summary over projection records. */
export interface ProjectionCoverageSummary {
  readonly totalRecords: number;
  readonly distinctWorldEntities: number;
  readonly distinctDatasets: number;
  readonly distinctInputArtifacts: number;
  readonly byDerivationKind: readonly DerivationKindCount[];
  readonly projectedWorldEntityDigests: readonly string[];
}

export type ResultProjectionRejection =
  | { readonly kind: "invalid-schema-version"; readonly message: string }
  | { readonly kind: "invalid-id"; readonly message: string }
  | { readonly kind: "invalid-dataset-ref"; readonly message: string }
  | { readonly kind: "invalid-world-entity-ref"; readonly message: string }
  | { readonly kind: "invalid-authority"; readonly message: string }
  | { readonly kind: "invalid-derivation"; readonly message: string }
  | {
      readonly kind: "unknown-derivation-kind";
      readonly derivation: string;
      readonly message: string;
    }
  | { readonly kind: "invalid-derivation-statement"; readonly message: string }
  | { readonly kind: "empty-derivation-inputs"; readonly message: string }
  | { readonly kind: "invalid-input-ref"; readonly index: number; readonly message: string }
  | { readonly kind: "duplicate-input-ref"; readonly ref: string; readonly message: string };

export type ResultProjectionValidation =
  | { readonly ok: true; readonly value: ResultProjectionRecord }
  | { readonly ok: false; readonly rejections: readonly ResultProjectionRejection[] };
