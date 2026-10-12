import { compareStrings } from "./internal/compare.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isObject,
} from "./internal/guards.js";

/**
 * Lifecycle cost model (W033): entries carry source, date, currency and an
 * explicit uncertainty declaration; human, operating and maintenance costs
 * are all first-class categories. Aggregation is deterministic and NEVER
 * rounds: bounds and point estimates propagate as exact IEEE-754 doubles
 * and are reported as computed. A range entry's point estimate is
 * (low + high) / 2. Entries accumulate in entryId order so float addition
 * order is fully determined.
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

export interface CategoryTotal {
  readonly category: CostCategory;
  readonly point: number;
  readonly low: number;
  readonly high: number;
}

export interface CostAggregate {
  readonly subjectId: string;
  readonly reportingCurrency: string;
  readonly convertedEntryCount: number;
  readonly totalPoint: number;
  readonly totalLow: number;
  readonly totalHigh: number;
  readonly byCategory: readonly CategoryTotal[];
  /** Currencies present on entries but lacking a declared conversion. */
  readonly unconvertedCurrencies: readonly string[];
}

export interface CostAggregation {
  readonly aggregate: CostAggregate;
  readonly issues: readonly CostIssue[];
}

const COST_CATEGORIES: readonly string[] = [
  "human",
  "operating",
  "maintenance",
  "other",
];
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Aggregate one subject's ledger into the reporting currency.
 *
 * - entries are validated (typed issues exclude invalid entries);
 * - non-reporting currencies need a declared direct conversion rate,
 *   otherwise the entry is excluded and its currency is listed;
 * - totals accumulate in entryId order; nothing is ever rounded.
 */
export function aggregateLifecycleCosts(
  ledger: LifecycleCost,
  reportingCurrency: string,
  conversions: readonly CurrencyConversion[] = [],
): CostAggregation {
  if (
    typeof reportingCurrency !== "string" ||
    !CURRENCY_PATTERN.test(reportingCurrency)
  ) {
    return {
      aggregate: emptyAggregate(ledger.subjectId, reportingCurrency),
      issues: [
        {
          kind: "invalid-reporting-currency",
          currency: String(reportingCurrency),
          detail: "reporting currency must be three uppercase letters",
        },
      ],
    };
  }

  const issues: CostIssue[] = [];
  const rates = new Map<string, number>();
  const seenConversionKeys = new Set<string>();
  const sortedConversions = [...conversions].sort(
    (a, b) =>
      compareStrings(String(a.from), String(b.from)) ||
      compareStrings(String(a.to), String(b.to)),
  );
  for (const conversion of sortedConversions) {
    const from =
      typeof conversion.from === "string" ? conversion.from : "<invalid>";
    const to = typeof conversion.to === "string" ? conversion.to : "<invalid>";
    const problem = conversionProblem(conversion);
    if (problem !== null) {
      issues.push({ kind: "invalid-conversion", from, to, detail: problem });
      continue;
    }
    const key = `${conversion.from}->${conversion.to}`;
    if (seenConversionKeys.has(key)) {
      issues.push({ kind: "duplicate-conversion", from, to });
      continue;
    }
    seenConversionKeys.add(key);
    rates.set(key, conversion.rate);
  }

  const valid: CostEntry[] = [];
  const seenEntryIds = new Set<string>();
  const rawEntries: readonly unknown[] = Array.isArray(ledger.entries)
    ? ledger.entries
    : [];
  if (!Array.isArray(ledger.entries)) {
    issues.push({
      kind: "invalid-entry",
      entryId: "<container>",
      detail: "entries must be an array",
    });
  }
  for (const raw of rawEntries) {
    if (!isObject(raw)) {
      issues.push({
        kind: "invalid-entry",
        entryId: "<missing>",
        detail: "entry must be an object",
      });
      continue;
    }
    const entry = raw as unknown as CostEntry;
    const problem = entryProblem(entry);
    if (problem !== null) {
      issues.push({
        kind: "invalid-entry",
        entryId: entryIdOf(entry),
        detail: problem,
      });
      continue;
    }
    if (entry.subjectId !== ledger.subjectId) {
      issues.push({
        kind: "subject-mismatch",
        entryId: entry.entryId,
        ledgerSubjectId: ledger.subjectId,
        entrySubjectId: entry.subjectId,
      });
      continue;
    }
    if (seenEntryIds.has(entry.entryId)) {
      issues.push({ kind: "duplicate-entry-id", entryId: entry.entryId });
      continue;
    }
    seenEntryIds.add(entry.entryId);
    valid.push(entry);
  }

  const categoryTotals = new Map<CostCategory, CategoryTotal>();
  const unconverted = new Set<string>();
  let totalPoint = 0;
  let totalLow = 0;
  let totalHigh = 0;
  let convertedCount = 0;
  const sortedValid = [...valid].sort((a, b) =>
    compareStrings(a.entryId, b.entryId),
  );
  for (const entry of sortedValid) {
    let factor = 1;
    if (entry.currency !== reportingCurrency) {
      const rate = rates.get(`${entry.currency}->${reportingCurrency}`);
      if (rate === undefined) {
        unconverted.add(entry.currency);
        continue;
      }
      factor = rate;
    }
    const bounds = entryBounds(entry);
    const point = bounds.point * factor;
    const low = bounds.low * factor;
    const high = bounds.high * factor;
    const current = categoryTotals.get(entry.category);
    if (current === undefined) {
      categoryTotals.set(entry.category, {
        category: entry.category,
        point,
        low,
        high,
      });
    } else {
      categoryTotals.set(entry.category, {
        category: entry.category,
        point: current.point + point,
        low: current.low + low,
        high: current.high + high,
      });
    }
    totalPoint += point;
    totalLow += low;
    totalHigh += high;
    convertedCount += 1;
  }

  const byCategory = [...categoryTotals.values()].sort((a, b) =>
    compareStrings(a.category, b.category),
  );
  issues.sort(compareCostIssues);
  return {
    aggregate: {
      subjectId: ledger.subjectId,
      reportingCurrency,
      convertedEntryCount: convertedCount,
      totalPoint,
      totalLow,
      totalHigh,
      byCategory,
      unconvertedCurrencies: [...unconverted].sort(compareStrings),
    },
    issues,
  };
}

function emptyAggregate(subjectId: string, currency: string): CostAggregate {
  return {
    subjectId,
    reportingCurrency: currency,
    convertedEntryCount: 0,
    totalPoint: 0,
    totalLow: 0,
    totalHigh: 0,
    byCategory: [],
    unconvertedCurrencies: [],
  };
}

function entryBounds(entry: CostEntry): {
  point: number;
  low: number;
  high: number;
} {
  if (entry.uncertainty.kind === "point") {
    return { point: entry.amount, low: entry.amount, high: entry.amount };
  }
  return {
    point: (entry.uncertainty.low + entry.uncertainty.high) / 2,
    low: entry.uncertainty.low,
    high: entry.uncertainty.high,
  };
}

function entryProblem(entry: CostEntry): string | null {
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

function conversionProblem(conversion: CurrencyConversion): string | null {
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

function entryIdOf(entry: CostEntry): string {
  return isNonEmptyString(entry.entryId) ? entry.entryId : "<missing>";
}

/** Format-level check only: month 01-12, day 01-31 (no calendar validation). */
function isValidIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function compareCostIssues(a: CostIssue, b: CostIssue): number {
  const byKind = compareStrings(a.kind, b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  const byKey = compareStrings(costIssueKey(a), costIssueKey(b));
  if (byKey !== 0) {
    return byKey;
  }
  return compareStrings(
    a.kind === "invalid-entry" || a.kind === "invalid-conversion"
      ? a.detail
      : "",
    b.kind === "invalid-entry" || b.kind === "invalid-conversion"
      ? b.detail
      : "",
  );
}

function costIssueKey(issue: CostIssue): string {
  switch (issue.kind) {
    case "duplicate-entry-id":
    case "invalid-entry":
    case "subject-mismatch":
      return issue.entryId;
    case "invalid-conversion":
    case "duplicate-conversion":
      return `${issue.from}->${issue.to}`;
    case "invalid-reporting-currency":
      return issue.currency;
  }
}
