import type { CurrencyCode, EntityDigest, Iso8601, KebabId, Result } from "../types/shared.js";
import {
  compareStrings,
  isCurrencyCode,
  isDigest,
  isIso8601,
  isKebabId,
  isMeasureKind,
  isNonEmptyString,
  isNonNegativeFiniteNumber,
  isNonNegativeInteger,
  ok,
  reject,
} from "../validate.js";
import { UNIT_FOR_MEASURE_KIND } from "../types/quantity.js";
import type { MeasureKind, QuantityTakeoff } from "../types/quantity.js";
import type {
  BoqCompileInput,
  BoqCompileRejection,
  BoqDocument,
  BoqGroup,
  BoqItemInput,
  BoqLineItem,
  BoqSection,
  CostRollupEntry,
  QuantityRollupEntry,
} from "../types/boq.js";

type BoqResult = Result<BoqDocument, BoqCompileRejection>;

/**
 * Deterministic machine compiling a BOQ document. Quantities are
 * cross-checked against the referenced takeoff records (no duplicate
 * quantity ledger); cost references point to external price sources by
 * digest; rollups are exact single-currency sums per measure kind.
 */
export function compileBoq(input: BoqCompileInput): BoqResult {
  if (!isKebabId(input.documentId)) {
    return reject({ kind: "invalid-document-id", documentId: input.documentId });
  }
  if (!isNonNegativeInteger(input.revision)) {
    return reject({ kind: "invalid-revision", revision: input.revision });
  }
  if (!isIso8601(input.compiledAt)) {
    return reject({ kind: "invalid-compiled-at", compiledAt: input.compiledAt });
  }
  const groupingKind = String((input.grouping as { readonly kind: unknown }).kind);
  if (groupingKind !== "by-section" && groupingKind !== "by-entity") {
    return reject({ kind: "invalid-grouping-law", grouping: groupingKind });
  }
  const rollupKind = String((input.rollup as { readonly kind: unknown }).kind);
  if (rollupKind !== "document-total" && rollupKind !== "per-group-totals") {
    return reject({ kind: "invalid-rollup-law", rollup: rollupKind });
  }
  if (input.items.length === 0) {
    return reject({ kind: "empty-items" });
  }

  const sectionTitles = new Map<string, string>();
  for (const [index, section] of input.sections.entries()) {
    if (!isKebabId(section.sectionId)) {
      return reject({
        kind: "invalid-section",
        index,
        reason: `sectionId is not a kebab id: ${section.sectionId}`,
      });
    }
    if (!isNonEmptyString(section.title)) {
      return reject({
        kind: "invalid-section",
        index,
        reason: "section title must be a non-empty string",
      });
    }
    if (sectionTitles.has(section.sectionId)) {
      return reject({ kind: "duplicate-section-id", sectionId: section.sectionId });
    }
    sectionTitles.set(section.sectionId, section.title);
  }

  const takeoffById = new Map<string, QuantityTakeoff>();
  for (const takeoff of input.takeoffs) {
    if (!takeoffById.has(takeoff.takeoffId)) {
      takeoffById.set(takeoff.takeoffId, takeoff);
    }
  }

  const seenItemIds = new Set<string>();
  const items: BoqLineItem[] = [];
  for (const [index, rawItem] of input.items.entries()) {
    if (!sectionTitles.has(rawItem.sectionId)) {
      return reject({
        kind: "dangling-section-ref",
        itemId: rawItem.itemId,
        sectionId: rawItem.sectionId,
      });
    }
    const item = buildItem(rawItem);
    if (typeof item === "string") {
      return reject({ kind: "invalid-item", index, reason: item });
    }
    if (seenItemIds.has(item.itemId)) {
      return reject({ kind: "duplicate-item-id", itemId: item.itemId });
    }
    seenItemIds.add(item.itemId);
    const takeoff = takeoffById.get(item.takeoffId);
    if (takeoff === undefined) {
      return reject({
        kind: "dangling-takeoff-ref",
        itemId: item.itemId,
        takeoffId: item.takeoffId,
      });
    }
    if (takeoff.entityDigest !== item.entityDigest) {
      return reject({
        kind: "takeoff-entity-mismatch",
        itemId: item.itemId,
        takeoffId: item.takeoffId,
      });
    }
    if (
      takeoff.quantity.measureKind !== item.quantity.measureKind ||
      takeoff.quantity.value !== item.quantity.value
    ) {
      return reject({
        kind: "takeoff-quantity-mismatch",
        itemId: item.itemId,
        takeoffId: item.takeoffId,
      });
    }
    items.push(item);
  }

  const sortedItems = [...items].sort((left, right) => compareStrings(left.itemId, right.itemId));
  const sortedSections: BoqSection[] = input.sections
    .map((section) => ({ sectionId: section.sectionId as KebabId, title: section.title }))
    .sort((left, right) => compareStrings(left.sectionId, right.sectionId));

  const groupKind: "section" | "entity" =
    input.grouping.kind === "by-section" ? "section" : "entity";
  const itemIdsByGroupKey = new Map<string, KebabId[]>();
  for (const item of sortedItems) {
    const groupKey = groupKind === "section" ? item.sectionId : item.entityDigest;
    const existing = itemIdsByGroupKey.get(groupKey);
    if (existing === undefined) {
      itemIdsByGroupKey.set(groupKey, [item.itemId]);
    } else {
      existing.push(item.itemId);
    }
  }
  const includeGroupTotals = input.rollup.kind === "per-group-totals";
  const groups: BoqGroup[] = [];
  for (const groupKey of [...itemIdsByGroupKey.keys()].sort(compareStrings)) {
    const groupItemIds = itemIdsByGroupKey.get(groupKey) ?? [];
    const groupItems = sortedItems.filter(
      (item) => (groupKind === "section" ? item.sectionId : item.entityDigest) === groupKey,
    );
    groups.push({
      groupKind,
      groupKey,
      itemIds: groupItemIds,
      quantityTotals: includeGroupTotals ? quantityTotals(groupItems) : [],
      costTotals: includeGroupTotals ? costTotals(groupItems) : [],
    });
  }

  return ok({
    documentId: input.documentId as KebabId,
    revision: input.revision,
    compiledAt: input.compiledAt as Iso8601,
    grouping: input.grouping,
    rollup: input.rollup,
    sections: sortedSections,
    items: sortedItems,
    groups,
    documentQuantityTotals: quantityTotals(sortedItems),
    documentCostTotals: costTotals(sortedItems),
  });
}

function buildItem(rawItem: BoqItemInput): BoqLineItem | string {
  if (!isKebabId(rawItem.itemId)) {
    return `itemId is not a kebab id: ${rawItem.itemId}`;
  }
  if (!isDigest(rawItem.entityDigest)) {
    return `entityDigest is not a digest: ${rawItem.entityDigest}`;
  }
  if (!isKebabId(rawItem.takeoffId)) {
    return `takeoffId is not a kebab id: ${rawItem.takeoffId}`;
  }
  if (!isNonEmptyString(rawItem.description)) {
    return "description must be a non-empty string";
  }
  if (!isKebabId(rawItem.sectionId)) {
    return `sectionId is not a kebab id: ${rawItem.sectionId}`;
  }
  if (!isMeasureKind(rawItem.measureKind)) {
    return `measureKind is not declared: ${String(rawItem.measureKind)}`;
  }
  if (!isNonNegativeFiniteNumber(rawItem.value)) {
    return "value must be finite and non-negative";
  }
  const cost = buildCost(rawItem.cost);
  if (typeof cost === "string") {
    return cost;
  }
  const measureKind: MeasureKind = rawItem.measureKind;
  return {
    itemId: rawItem.itemId,
    entityDigest: rawItem.entityDigest as unknown as EntityDigest,
    takeoffId: rawItem.takeoffId,
    description: rawItem.description,
    quantity: { measureKind, value: rawItem.value, unit: UNIT_FOR_MEASURE_KIND[measureKind] },
    cost,
    sectionId: rawItem.sectionId,
  };
}

function buildCost(rawCost: BoqItemInput["cost"]): BoqLineItem["cost"] | string {
  if (!isDigest(rawCost.priceSourceDigest)) {
    return `priceSourceDigest is not a digest: ${rawCost.priceSourceDigest}`;
  }
  if (!isNonNegativeInteger(rawCost.unitPriceMinor)) {
    return "unitPriceMinor must be a non-negative integer";
  }
  if (!isCurrencyCode(rawCost.currency)) {
    return `currency is not a three-letter code: ${rawCost.currency}`;
  }
  if (rawCost.priceBasisNote !== undefined && !isNonEmptyString(rawCost.priceBasisNote)) {
    return "priceBasisNote must be a non-empty string when present";
  }
  return {
    priceSourceDigest: rawCost.priceSourceDigest,
    unitPrice: { amountMinor: rawCost.unitPriceMinor, currency: rawCost.currency },
    priceBasisNote: rawCost.priceBasisNote,
  };
}

function quantityTotals(items: readonly BoqLineItem[]): QuantityRollupEntry[] {
  const sums = new Map<MeasureKind, number>();
  for (const item of items) {
    const measureKind = item.quantity.measureKind;
    sums.set(measureKind, (sums.get(measureKind) ?? 0) + item.quantity.value);
  }
  return [...sums.entries()]
    .sort(([leftKind], [rightKind]) => compareStrings(leftKind, rightKind))
    .map(([measureKind, totalValue]) => ({
      measureKind,
      unit: UNIT_FOR_MEASURE_KIND[measureKind],
      totalValue,
    }));
}

function costTotals(items: readonly BoqLineItem[]): CostRollupEntry[] {
  const sums = new Map<string, number>();
  for (const item of items) {
    const currency: string = item.cost.unitPrice.currency;
    sums.set(
      currency,
      (sums.get(currency) ?? 0) + item.quantity.value * item.cost.unitPrice.amountMinor,
    );
  }
  return [...sums.entries()]
    .sort(([leftCurrency], [rightCurrency]) => compareStrings(leftCurrency, rightCurrency))
    .map(([currency, totalMinor]) => ({ currency: currency as CurrencyCode, totalMinor }));
}
