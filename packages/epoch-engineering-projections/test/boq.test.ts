import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuantityTakeoff, compileBoq } from "../src/index.js";
import type { BoqCompileInput, QuantityTakeoff, TakeoffInput } from "../src/index.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const entityA = hex("a");
const entityB = hex("b");

function okTakeoff(input: TakeoffInput): QuantityTakeoff {
  const result = buildQuantityTakeoff(input);
  if (!result.ok) {
    throw new Error(`takeoff rejected: ${JSON.stringify(result.rejection)}`);
  }
  return result.value;
}

const takeoffWall: TakeoffInput = {
  takeoffId: "takeoff-wall-w1-length",
  entityDigest: entityA,
  method: { kind: "centerline-length", elementLabel: "wall W1 centerline" },
  basis: { kind: "geometry", geometryDigest: hex("c") },
  measureKind: "length",
  value: 5.5,
  recordedAt: "2025-06-01T09:00:00Z",
};

const takeoffSlab: TakeoffInput = {
  takeoffId: "takeoff-slab-s1-area",
  entityDigest: entityA,
  method: { kind: "footprint-area" },
  basis: { kind: "parametric", recordDigest: hex("c") },
  measureKind: "area",
  value: 12,
  recordedAt: "2025-06-01T09:05:00Z",
};

const takeoffBeam: TakeoffInput = {
  takeoffId: "takeoff-beam-b1-length",
  entityDigest: entityB,
  method: { kind: "centerline-length" },
  basis: { kind: "geometry", geometryDigest: hex("c") },
  measureKind: "length",
  value: 3,
  recordedAt: "2025-06-01T09:10:00Z",
};

function baseInput(): BoqCompileInput {
  return {
    documentId: "boq-structural-01",
    revision: 2,
    compiledAt: "2025-06-02T10:00:00Z",
    grouping: { kind: "by-section" },
    rollup: { kind: "per-group-totals" },
    sections: [{ sectionId: "concrete", title: "Concrete works" }],
    items: [
      {
        itemId: "boq-item-wall-w1",
        entityDigest: entityA,
        takeoffId: "takeoff-wall-w1-length",
        description: "Concrete wall W1",
        measureKind: "length",
        value: 5.5,
        cost: { priceSourceDigest: hex("d"), unitPriceMinor: 1000, currency: "EUR" },
        sectionId: "concrete",
      },
      {
        itemId: "boq-item-slab-s1",
        entityDigest: entityA,
        takeoffId: "takeoff-slab-s1-area",
        description: "Ground slab S1",
        measureKind: "area",
        value: 12,
        cost: { priceSourceDigest: hex("e"), unitPriceMinor: 250, currency: "EUR" },
        sectionId: "concrete",
      },
    ],
    takeoffs: [okTakeoff(takeoffWall), okTakeoff(takeoffSlab)],
  };
}

test("compiles a by-section BOQ with per-group and document totals", () => {
  const result = compileBoq(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const document = result.value;
  assert.equal(document.documentId, "boq-structural-01");
  assert.equal(document.compiledAt, "2025-06-02T10:00:00Z");
  assert.deepEqual(
    document.items.map((item) => item.itemId),
    ["boq-item-slab-s1", "boq-item-wall-w1"],
  );
  assert.deepEqual(document.sections, [{ sectionId: "concrete", title: "Concrete works" }]);
  assert.equal(document.groups.length, 1);
  const group = document.groups[0];
  assert.ok(group !== undefined);
  assert.deepEqual(group, {
    groupKind: "section",
    groupKey: "concrete",
    itemIds: ["boq-item-slab-s1", "boq-item-wall-w1"],
    quantityTotals: [
      { measureKind: "area", unit: "m2", totalValue: 12 },
      { measureKind: "length", unit: "m", totalValue: 5.5 },
    ],
    costTotals: [{ currency: "EUR", totalMinor: 8500 }],
  });
  assert.deepEqual(document.documentQuantityTotals, group.quantityTotals);
  assert.deepEqual(document.documentCostTotals, [{ currency: "EUR", totalMinor: 8500 }]);
});

test("compiles a by-entity BOQ with per-entity groups", () => {
  const result = compileBoq({
    documentId: "boq-structural-02",
    revision: 1,
    compiledAt: "2025-06-02T11:00:00Z",
    grouping: { kind: "by-entity" },
    rollup: { kind: "per-group-totals" },
    sections: [
      { sectionId: "concrete", title: "Concrete works" },
      { sectionId: "steel", title: "Steel works" },
    ],
    items: [
      {
        itemId: "boq-item-wall-w1",
        entityDigest: entityA,
        takeoffId: "takeoff-wall-w1-length",
        description: "Concrete wall W1",
        measureKind: "length",
        value: 5.5,
        cost: { priceSourceDigest: hex("d"), unitPriceMinor: 1000, currency: "EUR" },
        sectionId: "concrete",
      },
      {
        itemId: "boq-item-slab-s1",
        entityDigest: entityA,
        takeoffId: "takeoff-slab-s1-area",
        description: "Ground slab S1",
        measureKind: "area",
        value: 12,
        cost: { priceSourceDigest: hex("e"), unitPriceMinor: 250, currency: "EUR" },
        sectionId: "concrete",
      },
      {
        itemId: "boq-item-beam-b1",
        entityDigest: entityB,
        takeoffId: "takeoff-beam-b1-length",
        description: "Steel beam B1",
        measureKind: "length",
        value: 3,
        cost: { priceSourceDigest: hex("d"), unitPriceMinor: 100, currency: "EUR" },
        sectionId: "steel",
      },
    ],
    takeoffs: [okTakeoff(takeoffWall), okTakeoff(takeoffSlab), okTakeoff(takeoffBeam)],
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const groups = result.value.groups;
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    groupKind: "entity",
    groupKey: entityA,
    itemIds: ["boq-item-slab-s1", "boq-item-wall-w1"],
    quantityTotals: [
      { measureKind: "area", unit: "m2", totalValue: 12 },
      { measureKind: "length", unit: "m", totalValue: 5.5 },
    ],
    costTotals: [{ currency: "EUR", totalMinor: 8500 }],
  });
  assert.deepEqual(groups[1], {
    groupKind: "entity",
    groupKey: entityB,
    itemIds: ["boq-item-beam-b1"],
    quantityTotals: [{ measureKind: "length", unit: "m", totalValue: 3 }],
    costTotals: [{ currency: "EUR", totalMinor: 300 }],
  });
});

test("the document-total rollup law leaves group totals empty", () => {
  const result = compileBoq({ ...baseInput(), rollup: { kind: "document-total" } });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  const group = result.value.groups[0];
  assert.ok(group !== undefined);
  assert.equal(group.quantityTotals.length, 0);
  assert.equal(group.costTotals.length, 0);
  assert.deepEqual(result.value.documentCostTotals, [{ currency: "EUR", totalMinor: 8500 }]);
  assert.deepEqual(result.value.documentQuantityTotals, [
    { measureKind: "area", unit: "m2", totalValue: 12 },
    { measureKind: "length", unit: "m", totalValue: 5.5 },
  ]);
});

test("rejects a dangling takeoff reference", () => {
  const base = baseInput();
  const result = compileBoq({
    ...base,
    items: [{ ...base.items[0]!, takeoffId: "takeoff-missing" }, base.items[1]!],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "dangling-takeoff-ref",
    itemId: "boq-item-wall-w1",
    takeoffId: "takeoff-missing",
  });
});

test("rejects a quantity that does not match its takeoff record", () => {
  const base = baseInput();
  const result = compileBoq({
    ...base,
    items: [{ ...base.items[0]!, value: 6 }, base.items[1]!],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "takeoff-quantity-mismatch",
    itemId: "boq-item-wall-w1",
    takeoffId: "takeoff-wall-w1-length",
  });
});

test("rejects an entity digest that does not match its takeoff record", () => {
  const base = baseInput();
  const result = compileBoq({
    ...base,
    items: [{ ...base.items[0]!, entityDigest: entityB }, base.items[1]!],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "takeoff-entity-mismatch",
    itemId: "boq-item-wall-w1",
    takeoffId: "takeoff-wall-w1-length",
  });
});

test("rejects duplicate item ids", () => {
  const base = baseInput();
  const result = compileBoq({ ...base, items: [base.items[0]!, base.items[0]!] });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "duplicate-item-id", itemId: "boq-item-wall-w1" });
});

test("rejects a dangling section reference", () => {
  const base = baseInput();
  const result = compileBoq({
    ...base,
    items: [{ ...base.items[0]!, sectionId: "steel" }, base.items[1]!],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "dangling-section-ref",
    itemId: "boq-item-wall-w1",
    sectionId: "steel",
  });
});

test("keeps cost totals separated per currency", () => {
  const result = compileBoq({
    documentId: "boq-mixed-01",
    revision: 1,
    compiledAt: "2025-06-02T12:00:00Z",
    grouping: { kind: "by-section" },
    rollup: { kind: "per-group-totals" },
    sections: [{ sectionId: "general", title: "General works" }],
    items: [
      {
        itemId: "boq-item-pipe-p1",
        entityDigest: entityA,
        takeoffId: "takeoff-pipe-p1-length",
        description: "Pipe P1",
        measureKind: "length",
        value: 2,
        cost: { priceSourceDigest: hex("d"), unitPriceMinor: 50, currency: "EUR" },
        sectionId: "general",
      },
      {
        itemId: "boq-item-duct-d1",
        entityDigest: entityB,
        takeoffId: "takeoff-duct-d1-length",
        description: "Duct D1",
        measureKind: "length",
        value: 3,
        cost: { priceSourceDigest: hex("e"), unitPriceMinor: 100, currency: "USD" },
        sectionId: "general",
      },
    ],
    takeoffs: [
      okTakeoff({ ...takeoffWall, takeoffId: "takeoff-pipe-p1-length", value: 2 }),
      okTakeoff({ ...takeoffBeam, takeoffId: "takeoff-duct-d1-length", value: 3 }),
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.deepEqual(result.value.documentCostTotals, [
    { currency: "EUR", totalMinor: 100 },
    { currency: "USD", totalMinor: 300 },
  ]);
  assert.deepEqual(result.value.documentQuantityTotals, [
    { measureKind: "length", unit: "m", totalValue: 5 },
  ]);
});

test("rejects an empty items list", () => {
  const result = compileBoq({ ...baseInput(), items: [] });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, { kind: "empty-items" });
});
