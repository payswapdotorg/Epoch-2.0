/**
 * epoch-world-model 契约测试：守卫对合法/非法样例的接受与拒绝。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProvenanceRef,
  isQuantityValue,
  isUnitOfMeasure,
  isWorldEntity,
  isWorldEntityMaterial,
  isWorldPresentationSeed,
  isWorldRelationship,
  isWorldRevision,
} from "../src/index.ts";

const validEntity = {
  entityId: "column-001",
  entityType: "column",
  label: "柱 C1",
  material: { type: "concrete", grade: "C40" },
  dimensions: { height: { value: 3.6, unit: "m" }, width: { value: 400, unit: "mm" } },
  quantity: { value: 0.576, unit: "m3" },
  phase: "structural",
  status: "as-built",
  costReference: "boq-3.2.1",
  constraints: ["con-1", "con-2"],
  provenance: [{ sourceId: "fixture", kind: "fixture" }],
};

const validRelationship = {
  relationshipId: "rel-001",
  kind: "supports",
  fromEntityId: "column-001",
  toEntityId: "beam-001",
  label: "支撑",
};

const validDigest = "f9b0c90957ac2112afdc906056e7bda94a80eed1ad525273610be93e65ef905e";

const validRevision = {
  worldId: "world-001",
  revisionId: "rev-001",
  digest: validDigest,
  entities: [validEntity],
  relationships: [validRelationship],
  presentationSeed: { seed: "seed-001" },
  provenance: [{ sourceId: "fixture", kind: "fixture" }],
};

test("isWorldEntity accepts a valid entity", () => {
  assert.equal(isWorldEntity(validEntity), true);
});

test("isWorldEntity accepts the minimal entity", () => {
  assert.equal(
    isWorldEntity({ entityId: "e", entityType: "wall", label: "墙" }),
    true,
  );
});

test("isWorldEntity rejects wrong types", () => {
  assert.equal(isWorldEntity(null), false);
  assert.equal(isWorldEntity("column"), false);
  assert.equal(isWorldEntity([]), false);
  assert.equal(isWorldEntity({ ...validEntity, entityId: 42 }), false);
  assert.equal(isWorldEntity({ ...validEntity, label: null }), false);
  assert.equal(isWorldEntity({ ...validEntity, material: "concrete" }), false);
  assert.equal(isWorldEntity({ ...validEntity, phase: 7 }), false);
});

test("isWorldEntity rejects missing mandatory fields", () => {
  assert.equal(isWorldEntity({ entityType: "column", label: "柱" }), false);
  assert.equal(isWorldEntity({ entityId: "column-001", label: "柱" }), false);
  assert.equal(isWorldEntity({ entityId: "column-001", entityType: "column" }), false);
});

test("isWorldEntity rejects bad units", () => {
  assert.equal(
    isWorldEntity({ ...validEntity, quantity: { value: 1, unit: "bogus" } }),
    false,
  );
  assert.equal(
    isWorldEntity({
      ...validEntity,
      dimensions: { height: { value: 3, unit: "meters" } },
    }),
    false,
  );
  assert.equal(
    isWorldEntity({ ...validEntity, quantity: { value: 1, unit: "" } }),
    false,
  );
});

test("isWorldEntity rejects malformed optional members", () => {
  assert.equal(isWorldEntity({ ...validEntity, constraints: ["ok", ""] }), false);
  assert.equal(isWorldEntity({ ...validEntity, constraints: "con-1" }), false);
  assert.equal(isWorldEntity({ ...validEntity, provenance: [{}] }), false);
  assert.equal(isWorldEntity({ ...validEntity, material: { type: "" } }), false);
});

test("isWorldEntityMaterial accepts/rejects", () => {
  assert.equal(isWorldEntityMaterial({ type: "concrete", grade: "C40" }), true);
  assert.equal(isWorldEntityMaterial({ type: "steel" }), true);
  assert.equal(isWorldEntityMaterial({ grade: "C40" }), false);
  assert.equal(isWorldEntityMaterial({ type: 1 }), false);
  assert.equal(isWorldEntityMaterial(null), false);
});

test("isWorldRelationship accepts a valid relationship", () => {
  assert.equal(isWorldRelationship(validRelationship), true);
});

test("isWorldRelationship rejects wrong/unknown kinds", () => {
  assert.equal(isWorldRelationship({ ...validRelationship, kind: "meshes-with" }), false);
  assert.equal(isWorldRelationship({ ...validRelationship, kind: 1 }), false);
});

test("isWorldRelationship rejects missing mandatory fields", () => {
  assert.equal(
    isWorldRelationship({ kind: "supports", fromEntityId: "a", toEntityId: "b" }),
    false,
  );
  assert.equal(
    isWorldRelationship({ relationshipId: "r", kind: "supports", fromEntityId: "a" }),
    false,
  );
});

test("isWorldRelationship rejects wrong types", () => {
  assert.equal(isWorldRelationship({ ...validRelationship, fromEntityId: 5 }), false);
  assert.equal(isWorldRelationship({ ...validRelationship, label: 9 }), false);
  assert.equal(isWorldRelationship({ ...validRelationship, provenance: "x" }), false);
});

test("isProvenanceRef accepts/rejects", () => {
  assert.equal(isProvenanceRef({ sourceId: "s", kind: "fixture" }), true);
  assert.equal(
    isProvenanceRef({ sourceId: "s", kind: "engine", engineId: "ifc", engineVersion: "1" }),
    true,
  );
  assert.equal(isProvenanceRef({ sourceId: "s", kind: "dream" }), false);
  assert.equal(isProvenanceRef({ kind: "fixture" }), false);
  assert.equal(isProvenanceRef({ sourceId: "", kind: "fixture" }), false);
  assert.equal(isProvenanceRef(null), false);
});

test("isWorldPresentationSeed accepts/rejects", () => {
  assert.equal(isWorldPresentationSeed({ seed: "s" }), true);
  assert.equal(isWorldPresentationSeed({ seed: "" }), false);
  assert.equal(isWorldPresentationSeed({}), false);
  assert.equal(isWorldPresentationSeed("s"), false);
});

test("isWorldRevision accepts a valid revision", () => {
  assert.equal(isWorldRevision(validRevision), true);
});

test("isWorldRevision rejects malformed digest", () => {
  assert.equal(isWorldRevision({ ...validRevision, digest: "abc" }), false);
  assert.equal(isWorldRevision({ ...validRevision, digest: 42 }), false);
  const upper = validDigest.toUpperCase();
  assert.equal(isWorldRevision({ ...validRevision, digest: upper }), false);
});

test("isWorldRevision rejects missing/wrong members", () => {
  assert.equal(isWorldRevision({ ...validRevision, entities: "many" }), false);
  assert.equal(isWorldRevision({ ...validRevision, relationships: [{}] }), false);
  assert.equal(isWorldRevision({ ...validRevision, presentationSeed: null }), false);
  assert.equal(isWorldRevision({ ...validRevision, provenance: null }), false);
  const { worldId, ...withoutWorldId } = validRevision;
  assert.equal(isWorldRevision(withoutWorldId), false);
});

test("isQuantityValue and isUnitOfMeasure accept/reject", () => {
  assert.equal(isQuantityValue({ value: 1.5, unit: "m3" }), true);
  assert.equal(isQuantityValue({ value: Number.NaN, unit: "m3" }), false);
  assert.equal(isQuantityValue({ value: 1.5, unit: "m" }), true);
  assert.equal(isQuantityValue({ value: "1.5", unit: "m" }), false);
  assert.equal(isQuantityValue({ unit: "m" }), false);
  assert.equal(isUnitOfMeasure("m"), true);
  assert.equal(isUnitOfMeasure("m2"), true);
  assert.equal(isUnitOfMeasure("deg"), true);
  assert.equal(isUnitOfMeasure("cubit"), false);
  assert.equal(isUnitOfMeasure(3), false);
});
