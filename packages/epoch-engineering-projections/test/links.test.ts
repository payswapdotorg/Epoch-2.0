import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConstraint,
  buildFinding,
  buildLinkIndex,
  buildQuantityTakeoff,
  deriveInspectorView,
} from "../src/index.js";
import type {
  BoqLineItem,
  ConstraintInput,
  CurrencyCode,
  Digest,
  EntityDigest,
  FindingInput,
  InspectorProjectionInput,
  KebabId,
  TakeoffInput,
} from "../src/index.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const entityA = hex("a");
const entityB = hex("b");

function okValue<V>(result: { ok: boolean; value?: V; rejection?: unknown }, label: string): V {
  assert.equal(result.ok, true, `${label} failed`);
  if (!result.ok) {
    throw new Error(`${label} rejected: ${JSON.stringify(result.rejection)}`);
  }
  return result.value as V;
}

const viewInput: InspectorProjectionInput = {
  viewId: "view-wall-w1",
  entityDigest: entityA,
  revision: 1,
  panels: [
    {
      panelId: "panel-identity",
      title: "Identity",
      fields: [{ kind: "text", label: "Name", value: "Wall W1" }],
    },
  ],
  measurements: [
    {
      annotationId: "annot-w1-length",
      measureKind: "length",
      value: 5.5,
      takeoffId: "takeoff-wall-w1-length",
    },
  ],
  derivedFrom: [hex("f")],
};

const takeoffInput: TakeoffInput = {
  takeoffId: "takeoff-wall-w1-length",
  entityDigest: entityA,
  method: { kind: "centerline-length", elementLabel: "wall W1 centerline" },
  basis: { kind: "geometry", geometryDigest: hex("c") },
  measureKind: "length",
  value: 5.5,
  recordedAt: "2025-06-01T09:00:00Z",
};

const constraintInput: ConstraintInput = {
  constraintId: "constraint-corridor-clearance",
  entityDigest: entityA,
  kind: { kind: "clearance", requiredLengthM: 1.2 },
};

const findingInput: FindingInput = {
  findingId: "finding-wall-w1-cover",
  entityDigest: entityA,
  severity: "major",
  title: "Insufficient cover on wall W1",
  evidence: [hex("e")],
  constraintRefs: ["constraint-corridor-clearance"],
  boqItemRefs: ["boq-item-wall-w1"],
  raisedAt: "2025-06-03T08:00:00Z",
};

const boqItem: BoqLineItem = {
  itemId: "boq-item-wall-w1" as KebabId,
  entityDigest: entityA as EntityDigest,
  takeoffId: "takeoff-wall-w1-length" as KebabId,
  description: "Concrete wall W1",
  quantity: { measureKind: "length", value: 5.5, unit: "m" },
  cost: {
    priceSourceDigest: hex("d") as Digest,
    unitPrice: { amountMinor: 1000, currency: "EUR" as CurrencyCode },
  },
  sectionId: "concrete" as KebabId,
};

const boqItemB: BoqLineItem = {
  itemId: "boq-item-beam-b1" as KebabId,
  entityDigest: entityB as EntityDigest,
  takeoffId: "takeoff-beam-b1-length" as KebabId,
  description: "Steel beam B1",
  quantity: { measureKind: "length", value: 3, unit: "m" },
  cost: {
    priceSourceDigest: hex("d") as Digest,
    unitPrice: { amountMinor: 100, currency: "EUR" as CurrencyCode },
  },
  sectionId: "steel" as KebabId,
};

test("builds the bidirectional link index for one entity", () => {
  const view = okValue(deriveInspectorView(viewInput), "view");
  const takeoff = okValue(buildQuantityTakeoff(takeoffInput), "takeoff");
  const constraint = okValue(buildConstraint(constraintInput), "constraint");
  const finding = okValue(buildFinding(findingInput), "finding");
  const result = buildLinkIndex({
    inspectorViews: [view],
    takeoffs: [takeoff],
    constraints: [constraint],
    boqItems: [boqItem],
    findings: [finding],
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.equal(result.value.byEntity.length, 1);
  const links = result.value.byEntity[0];
  assert.ok(links !== undefined);
  assert.deepEqual(links, {
    entityDigest: entityA,
    inspectorViewIds: ["view-wall-w1"],
    takeoffIds: ["takeoff-wall-w1-length"],
    constraintIds: ["constraint-corridor-clearance"],
    boqItemIds: ["boq-item-wall-w1"],
    findingIds: ["finding-wall-w1-cover"],
  });
});

test("builds sorted entries per entity digest", () => {
  const view = okValue(deriveInspectorView(viewInput), "view");
  const takeoffA = okValue(buildQuantityTakeoff(takeoffInput), "takeoffA");
  const takeoffB = okValue(
    buildQuantityTakeoff({
      ...takeoffInput,
      takeoffId: "takeoff-beam-b1-length",
      entityDigest: entityB,
      value: 3,
    }),
    "takeoffB",
  );
  const constraint = okValue(buildConstraint(constraintInput), "constraint");
  const finding = okValue(buildFinding(findingInput), "finding");
  const result = buildLinkIndex({
    inspectorViews: [view],
    takeoffs: [takeoffA, takeoffB],
    constraints: [constraint],
    boqItems: [boqItem],
    findings: [finding],
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected success");
  }
  assert.equal(result.value.byEntity.length, 2);
  assert.equal(result.value.byEntity[0]?.entityDigest, entityA);
  assert.equal(result.value.byEntity[1]?.entityDigest, entityB);
  assert.deepEqual(result.value.byEntity[1]?.takeoffIds, ["takeoff-beam-b1-length"]);
  assert.deepEqual(result.value.byEntity[1]?.inspectorViewIds, []);
});

test("rejects a dangling takeoff reference from a view measurement", () => {
  const view = okValue(
    deriveInspectorView({
      ...viewInput,
      measurements: [
        {
          annotationId: "annot-w1-length",
          measureKind: "length",
          value: 5.5,
          takeoffId: "takeoff-missing",
        },
      ],
    }),
    "view",
  );
  const takeoff = okValue(buildQuantityTakeoff(takeoffInput), "takeoff");
  const result = buildLinkIndex({
    inspectorViews: [view],
    takeoffs: [takeoff],
    constraints: [],
    boqItems: [],
    findings: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "dangling-takeoff-ref",
    viewId: "view-wall-w1",
    takeoffId: "takeoff-missing",
  });
});

test("rejects a cross-entity takeoff reference from a view measurement", () => {
  const view = okValue(
    deriveInspectorView({
      ...viewInput,
      measurements: [
        {
          annotationId: "annot-w1-length",
          measureKind: "length",
          value: 3,
          takeoffId: "takeoff-beam-b1-length",
        },
      ],
    }),
    "view",
  );
  const takeoffB = okValue(
    buildQuantityTakeoff({
      ...takeoffInput,
      takeoffId: "takeoff-beam-b1-length",
      entityDigest: entityB,
      value: 3,
    }),
    "takeoffB",
  );
  const result = buildLinkIndex({
    inspectorViews: [view],
    takeoffs: [takeoffB],
    constraints: [],
    boqItems: [],
    findings: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "cross-entity-takeoff-ref",
    viewId: "view-wall-w1",
    takeoffId: "takeoff-beam-b1-length",
    entityDigest: entityA,
  });
});

test("rejects a dangling constraint reference from a finding", () => {
  const takeoff = okValue(buildQuantityTakeoff(takeoffInput), "takeoff");
  const finding = okValue(
    buildFinding({ ...findingInput, constraintRefs: ["constraint-missing"] }),
    "finding",
  );
  const result = buildLinkIndex({
    inspectorViews: [],
    takeoffs: [takeoff],
    constraints: [],
    boqItems: [boqItem],
    findings: [finding],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "dangling-constraint-ref",
    findingId: "finding-wall-w1-cover",
    constraintId: "constraint-missing",
  });
});

test("rejects a cross-entity BOQ item reference from a finding", () => {
  const constraint = okValue(buildConstraint(constraintInput), "constraint");
  const finding = okValue(
    buildFinding({ ...findingInput, boqItemRefs: ["boq-item-beam-b1"] }),
    "finding",
  );
  const result = buildLinkIndex({
    inspectorViews: [],
    takeoffs: [],
    constraints: [constraint],
    boqItems: [boqItemB],
    findings: [finding],
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected rejection");
  }
  assert.deepEqual(result.rejection, {
    kind: "cross-entity-boq-item-ref",
    findingId: "finding-wall-w1-cover",
    itemId: "boq-item-beam-b1",
    entityDigest: entityA,
  });
});
