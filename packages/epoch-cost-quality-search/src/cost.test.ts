import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateLifecycleCosts,
  type CostEntry,
  type LifecycleCost,
} from "./index.js";

const usdEntry = (
  entryId: string,
  overrides: Partial<CostEntry> = {},
): CostEntry => ({
  entryId,
  subjectId: "cand-1",
  category: "human",
  description: "engineering effort",
  source: "team estimate",
  asOfDate: "2026-01-15",
  currency: "USD",
  amount: 100,
  uncertainty: { kind: "point" },
  ...overrides,
});

const ledger = (entries: readonly CostEntry[]): LifecycleCost => ({
  subjectId: "cand-1",
  entries,
});

describe("aggregateLifecycleCosts", () => {
  it("sums point and range entries without rounding", () => {
    const result = aggregateLifecycleCosts(
      ledger([
        usdEntry("e1", { amount: 0.1 }),
        usdEntry("e2", { category: "operating", amount: 0.2 }),
        usdEntry("e3", {
          category: "operating",
          amount: 50,
          uncertainty: { kind: "range", low: 40, high: 60 },
        }),
      ]),
      "USD",
    );
    assert.deepEqual(result.issues, []);
    assert.equal(result.aggregate.convertedEntryCount, 3);
    assert.equal(result.aggregate.totalPoint, 0.1 + 0.2 + 50);
    assert.equal(result.aggregate.totalLow, 0.1 + 0.2 + 40);
    assert.equal(result.aggregate.totalHigh, 0.1 + 0.2 + 60);
  });

  it("reports per-category totals in deterministic order", () => {
    const result = aggregateLifecycleCosts(
      ledger([
        usdEntry("e1", { amount: 0.1 }),
        usdEntry("e2", { category: "operating", amount: 0.2 }),
        usdEntry("e3", {
          category: "operating",
          amount: 50,
          uncertainty: { kind: "range", low: 40, high: 60 },
        }),
      ]),
      "USD",
    );
    assert.deepEqual(result.aggregate.byCategory, [
      { category: "human", point: 0.1, low: 0.1, high: 0.1 },
      {
        category: "operating",
        point: 0.2 + 50,
        low: 0.2 + 40,
        high: 0.2 + 60,
      },
    ]);
  });

  it("applies declared currency conversions without rounding", () => {
    const result = aggregateLifecycleCosts(
      ledger([usdEntry("e1", { currency: "EUR", amount: 100 })]),
      "USD",
      [{ from: "EUR", to: "USD", rate: 1.1 }],
    );
    assert.deepEqual(result.issues, []);
    assert.equal(result.aggregate.reportingCurrency, "USD");
    assert.equal(result.aggregate.totalPoint, 100 * 1.1);
  });

  it("excludes unconvertible currencies and lists them", () => {
    const result = aggregateLifecycleCosts(
      ledger([
        usdEntry("e1", { currency: "GBP", amount: 5 }),
        usdEntry("e2", { amount: 7 }),
      ]),
      "USD",
    );
    assert.deepEqual(result.issues, []);
    assert.equal(result.aggregate.convertedEntryCount, 1);
    assert.equal(result.aggregate.totalPoint, 7);
    assert.deepEqual(result.aggregate.unconvertedCurrencies, ["GBP"]);
  });

  it("validates dates, currencies, amounts and uncertainty bounds", () => {
    const result = aggregateLifecycleCosts(
      ledger([
        usdEntry("e1", { asOfDate: "2026-13-01" }),
        usdEntry("e2", { currency: "usd" }),
        usdEntry("e3", {
          uncertainty: { kind: "range", low: 5, high: 2 },
        }),
        usdEntry("e4", { amount: -1 }),
      ]),
      "USD",
    );
    assert.equal(result.aggregate.convertedEntryCount, 0);
    assert.equal(result.aggregate.totalPoint, 0);
    assert.deepEqual(
      result.issues.map((issue) => issue.kind),
      ["invalid-entry", "invalid-entry", "invalid-entry", "invalid-entry"],
    );
    assert.deepEqual(
      result.issues.map((issue) =>
        issue.kind === "invalid-entry" ? issue.entryId : "",
      ),
      ["e1", "e2", "e3", "e4"],
    );
  });

  it("reports duplicate entry ids and subject mismatches", () => {
    const result = aggregateLifecycleCosts(
      ledger([
        usdEntry("e1"),
        usdEntry("e2", { subjectId: "cand-2" }),
        usdEntry("e1"),
      ]),
      "USD",
    );
    assert.deepEqual(result.issues, [
      { kind: "duplicate-entry-id", entryId: "e1" },
      {
        kind: "subject-mismatch",
        entryId: "e2",
        ledgerSubjectId: "cand-1",
        entrySubjectId: "cand-2",
      },
    ]);
    assert.equal(result.aggregate.convertedEntryCount, 1);
    assert.equal(result.aggregate.totalPoint, 100);
  });

  it("rejects invalid reporting currencies and conversion tables", () => {
    const badCurrency = aggregateLifecycleCosts(
      ledger([usdEntry("e1")]),
      "usd",
    );
    assert.deepEqual(
      badCurrency.issues.map((issue) => issue.kind),
      ["invalid-reporting-currency"],
    );
    assert.equal(badCurrency.aggregate.totalPoint, 0);

    const duplicateRate = aggregateLifecycleCosts(
      ledger([usdEntry("e1", { currency: "EUR", amount: 100 })]),
      "USD",
      [
        { from: "EUR", to: "USD", rate: 1.1 },
        { from: "EUR", to: "USD", rate: 1.1 },
      ],
    );
    assert.deepEqual(
      duplicateRate.issues.map((issue) => issue.kind),
      ["duplicate-conversion"],
    );
    assert.equal(duplicateRate.aggregate.totalPoint, 100 * 1.1);

    const zeroRate = aggregateLifecycleCosts(
      ledger([usdEntry("e1", { currency: "EUR", amount: 100 })]),
      "USD",
      [{ from: "EUR", to: "USD", rate: 0 }],
    );
    assert.deepEqual(
      zeroRate.issues.map((issue) => issue.kind),
      ["invalid-conversion"],
    );
    assert.deepEqual(zeroRate.aggregate.unconvertedCurrencies, ["EUR"]);
    assert.equal(zeroRate.aggregate.convertedEntryCount, 0);
  });
});
