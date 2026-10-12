import type { CurrencyCode, Digest, EntityDigest, Iso8601, KebabId, MoneyMinor } from "./shared.js";
import type { MeasureKind, Quantity, QuantityTakeoff, UnitOfMeasure } from "./quantity.js";

/**
 * BOQ types. Line items are keyed to canonical entity digests and their
 * quantities are cross-checked against quantity takeoff records by the
 * compileBoq machine — there is no second quantity ledger.
 */

/** Reference to an EXTERNAL price source, by digest — no pricing data in-package. */
export interface CostReference {
  /** Digest of the external price-source record (provenance by digest). */
  readonly priceSourceDigest: Digest;
  /** Unit price in integer minor units of a single currency. */
  readonly unitPrice: MoneyMinor;
  readonly priceBasisNote?: string;
}

/** Raw (unbranded) input for a cost reference. */
export interface CostReferenceInput {
  readonly priceSourceDigest: string;
  readonly unitPriceMinor: number;
  readonly currency: string;
  readonly priceBasisNote?: string;
}

/** One BOQ line item, keyed to a canonical entity digest. */
export interface BoqLineItem {
  readonly itemId: KebabId;
  readonly entityDigest: EntityDigest;
  /** The quantity takeoff record this item draws its quantity from. */
  readonly takeoffId: KebabId;
  readonly description: string;
  readonly quantity: Quantity;
  readonly cost: CostReference;
  readonly sectionId: KebabId;
}

/** Raw (unbranded) input for a line item. */
export interface BoqItemInput {
  readonly itemId: string;
  readonly entityDigest: string;
  readonly takeoffId: string;
  readonly description: string;
  readonly measureKind: MeasureKind;
  readonly value: number;
  readonly cost: CostReferenceInput;
  readonly sectionId: string;
}

/** A declared BOQ section. */
export interface BoqSection {
  readonly sectionId: KebabId;
  readonly title: string;
}

/** Raw (unbranded) input for a section. */
export interface BoqSectionInput {
  readonly sectionId: string;
  readonly title: string;
}

/** Typed grouping law: how compileBoq materializes groups. */
export type BoqGroupingLaw = { readonly kind: "by-section" } | { readonly kind: "by-entity" };

/** Typed rollup law: which totals compileBoq materializes. */
export type BoqRollupLaw =
  | { readonly kind: "document-total" }
  | { readonly kind: "per-group-totals" };

/** Quantity rollup entry: exact sum within one measure kind (canonical unit). */
export interface QuantityRollupEntry {
  readonly measureKind: MeasureKind;
  readonly unit: UnitOfMeasure;
  readonly totalValue: number;
}

/**
 * Cost rollup entry per currency. totalMinor is the EXACT unrounded sum of
 * quantity.value × unit price minor units; currencies are never mixed or
 * converted and no rounding policy is applied in-package.
 */
export interface CostRollupEntry {
  readonly currency: CurrencyCode;
  readonly totalMinor: number;
}

/** A compiled group with its item ids (and totals when the law asks for them). */
export interface BoqGroup {
  readonly groupKind: "section" | "entity";
  /** sectionId (kebab id) or entityDigest (hex). */
  readonly groupKey: string;
  readonly itemIds: readonly KebabId[];
  readonly quantityTotals: readonly QuantityRollupEntry[];
  readonly costTotals: readonly CostRollupEntry[];
}

/** A deterministically compiled BOQ document. */
export interface BoqDocument {
  readonly documentId: KebabId;
  readonly revision: number;
  /** Input timestamp — never generated. */
  readonly compiledAt: Iso8601;
  readonly grouping: BoqGroupingLaw;
  readonly rollup: BoqRollupLaw;
  readonly sections: readonly BoqSection[];
  readonly items: readonly BoqLineItem[];
  readonly groups: readonly BoqGroup[];
  readonly documentQuantityTotals: readonly QuantityRollupEntry[];
  readonly documentCostTotals: readonly CostRollupEntry[];
}

/** Input for the compileBoq machine. */
export interface BoqCompileInput {
  readonly documentId: string;
  readonly revision: number;
  readonly compiledAt: string;
  readonly grouping: BoqGroupingLaw;
  readonly rollup: BoqRollupLaw;
  readonly sections: readonly BoqSectionInput[];
  readonly items: readonly BoqItemInput[];
  /** Takeoff records for cross-checking (may be a superset of what is referenced). */
  readonly takeoffs: readonly QuantityTakeoff[];
}

/** Typed rejections of the compileBoq machine. */
export type BoqCompileRejection =
  | { readonly kind: "invalid-document-id"; readonly documentId: string }
  | { readonly kind: "invalid-revision"; readonly revision: number }
  | { readonly kind: "invalid-compiled-at"; readonly compiledAt: string }
  | { readonly kind: "invalid-grouping-law"; readonly grouping: string }
  | { readonly kind: "invalid-rollup-law"; readonly rollup: string }
  | { readonly kind: "invalid-section"; readonly index: number; readonly reason: string }
  | { readonly kind: "duplicate-section-id"; readonly sectionId: string }
  | { readonly kind: "invalid-item"; readonly index: number; readonly reason: string }
  | { readonly kind: "duplicate-item-id"; readonly itemId: string }
  | { readonly kind: "dangling-section-ref"; readonly itemId: string; readonly sectionId: string }
  | { readonly kind: "dangling-takeoff-ref"; readonly itemId: string; readonly takeoffId: string }
  | {
      readonly kind: "takeoff-quantity-mismatch";
      readonly itemId: string;
      readonly takeoffId: string;
    }
  | {
      readonly kind: "takeoff-entity-mismatch";
      readonly itemId: string;
      readonly takeoffId: string;
    }
  | { readonly kind: "empty-items" };
