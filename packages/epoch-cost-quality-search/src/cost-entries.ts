import {
  isFiniteNumber,
  isNonEmptyString,
  isObject,
} from "./internal/guards.js";

/**
 * Lifecycle cost entry model (W033), part 1 of the cost module: entry and
 * conversion declarations plus their field-level validation. Aggregation
 * lives in ./cost.ts. This split is a line-limit artifact only: the public
 * surface is re-exported from ./cost.ts and the semantics are unchanged
 * (validation rules, issue kinds and messages are byte-identical).
 */

export type CostCategory = "human" | "operating" | "maintenance" | "other";

export type CostUncertainty =
  | { readonly kind: "point" }
  | { readonly kind: "range"; readonly low: number; readonly high: number };

export interface CostEntry {
  readonly entryId: string;
  readonly subjectId: string;
  readonly category: CostCategory;
  readonly description: string;
  /** Provenance: who or what asserted this cost. */
  readonly source: string;
  /** ISO calendar date (YYYY-MM-DD) the cost was asserted or observed. */
  readonly asOfDate: string;
  /** ISO-4217-style currency code (three uppercase letters). */
  readonly currency: string;
  /** Declared amount in `currency` units (>= 0). */
  readonly amount: number;
  readonly uncertainty: CostUncertainty;
}

export interface LifecycleCost {
  readonly subjectId: string;
  readonly entries: readonly CostEntry[];
}

export interface CurrencyConversion {
  readonly from: string;
  readonly to: string;
  /** Finite positive multiplier — declared data, never fetched. */
  readonly rate: number;
}

export type CostIssue =
  | { readonly kind: "duplicate-entry-id"; readonly entryId: string }
  | {
      readonly kind: "invalid-entry";
      readonly entryId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "subject-mismatch";
      readonly entryId: string;
      readonly ledgerSubjectId: string;
      readonly entrySubjectId: string;
    }
  | {
      readonly kind: "invalid-conversion";
      readonly from: string;
      readonly to: string;
      readonly detail: string;
    }
  | {
      readonly kind: "duplicate-conversion";
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: "invalid-reporting-currency";
      readonly currency: string;
      readonly detail: string;
    };

export const COST_CATEGORIES: readonly string[] = [
  "human",
  "operating",
  "maintenance",
  "other",
];

export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function entryProblem(entry: CostEntry): string | null {
  if (!isNonEmptyString(entry.entryId)) {
    return "entryId must be a non-empty string";
  }
  if (!isNonEmptyString(entry.subjectId)) {
    return "subjectId must be a non-empty string";
  }
  if (
    typeof entry.category !== "string" ||
    !COST_CATEGORIES.includes(entry.category)
  ) {
    return `unknown category "${String(entry.category)}"`;
  }
  if (!isNonEmptyString(entry.description)) {
    return "description must be a non-empty string";
  }
  if (!isNonEmptyString(entry.source)) {
    return "source must be a non-empty string (cost provenance)";
  }
  if (!isNonEmptyString(entry.asOfDate) || !isValidIsoDate(entry.asOfDate)) {
    return "asOfDate must be an ISO calendar date (YYYY-MM-DD)";
  }
  if (
    typeof entry.currency !== "string" ||
    !CURRENCY_PATTERN.test(entry.currency)
  ) {
    return "currency must be three uppercase letters";
  }
  if (!isFiniteNumber(entry.amount) || entry.amount < 0) {
    return "amount must be a finite number >= 0";
  }
  if (!isObject(entry.uncertainty)) {
    return "uncertainty must be declared (point or range)";
  }
  const uncertainty = entry.uncertainty as unknown as CostUncertainty;
  if (uncertainty.kind === "point") {
    return null;
  }
  if (uncertainty.kind === "range") {
    if (!isFiniteNumber(uncertainty.low) || !isFiniteNumber(uncertainty.high)) {
      return "range bounds must be finite numbers";
    }
    if (uncertainty.low < 0 || uncertainty.low > uncertainty.high) {
      return "range bounds must satisfy 0 <= low <= high";
    }
    return null;
  }
  return 'uncertainty kind must be "point" or "range"';
}

export function conversionProblem(conversion: CurrencyConversion): string | null {
  if (
    !isNonEmptyString(conversion.from) ||
    !CURRENCY_PATTERN.test(conversion.from)
  ) {
    return "from must be a three-letter uppercase currency code";
  }
  if (
    !isNonEmptyString(conversion.to) ||
    !CURRENCY_PATTERN.test(conversion.to)
  ) {
    return "to must be a three-letter uppercase currency code";
  }
  if (conversion.from === conversion.to) {
    return "from and to must differ";
  }
  if (!isFiniteNumber(conversion.rate) || conversion.rate <= 0) {
    return "rate must be a finite number > 0";
  }
  return null;
}

export function entryIdOf(entry: CostEntry): string {
  return isNonEmptyString(entry.entryId) ? entry.entryId : "<missing>";
}

/** Format-level check only: month 01-12, day 01-31 (no calendar validation). */
export function isValidIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}
