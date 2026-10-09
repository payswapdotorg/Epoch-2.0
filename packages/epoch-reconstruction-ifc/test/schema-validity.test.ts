/**
 * W009 验收测试（强制）：修订按冻结 world-model 守卫 schema 合法。
 *
 * 断言：isWorldRevision 成立；每个实体 isWorldEntity；每个关系 isWorldRelationship；
 * 溯源 isProvenanceRef；数量 isQuantityValue；单位在冻结集合内；digest 合法格式。
 * 注意：扩展字段（layer）不破坏 schema 合法性（守卫忽略未知字段，依据
 * world-model「The implementation may be richer」）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  isWorldRevision,
  isWorldEntity,
  isWorldRelationship,
  isProvenanceRef,
  isQuantityValue,
  isUnitOfMeasure,
  isWorldDigest,
  isWorldPresentationSeed,
  isProvenanceKind,
} from "@zcode/epoch-world-model";
import { createIfcReconstructionEngine } from "../src/index.ts";
import type { ReconstructionContext } from "@zcode/epoch-reconstruction-contract";

const CONTEXT: ReconstructionContext = { workspaceKey: "ws-ifc-test" };

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/pump-house.ifc",
);

test("revision is schema-valid per frozen guards", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  assert.equal(isWorldRevision(revision), true);
  assert.equal(isWorldDigest(revision.digest), true);
  assert.equal(isWorldPresentationSeed(revision.presentationSeed), true);
  assert.ok(revision.provenance.length >= 1, "revision provenance must carry file ref");
  for (const ref of revision.provenance) {
    assert.equal(isProvenanceRef(ref), true);
    assert.equal(isProvenanceKind(ref.kind), true);
  }
  for (const entity of revision.entities) {
    assert.equal(isWorldEntity(entity), true, `entity ${entity.entityId} must be schema-valid`);
    assert.equal(typeof entity.entityId, "string");
    assert.equal(typeof entity.entityType, "string");
    assert.equal(typeof entity.label, "string");
    if (entity.dimensions !== undefined) {
      for (const quantity of Object.values(entity.dimensions)) {
        assert.equal(isQuantityValue(quantity), true);
        assert.equal(isUnitOfMeasure(quantity.unit), true);
      }
    }
    if (entity.quantity !== undefined) {
      assert.equal(isQuantityValue(entity.quantity), true);
      assert.equal(isUnitOfMeasure(entity.quantity.unit), true);
    }
    if (entity.provenance !== undefined) {
      for (const ref of entity.provenance) assert.equal(isProvenanceRef(ref), true);
    }
  }
  for (const relationship of revision.relationships) {
    assert.equal(isWorldRelationship(relationship), true);
  }
});

test("every relationship references existing entities in the revision", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const ids = new Set(revision.entities.map((entity) => entity.entityId));
  assert.ok(revision.relationships.length > 0, "fixture must produce at least one relationship");
  for (const relationship of revision.relationships) {
    assert.ok(ids.has(relationship.fromEntityId), `dangling from: ${relationship.relationshipId}`);
    assert.ok(ids.has(relationship.toEntityId), `dangling to: ${relationship.relationshipId}`);
  }
});

test("every entity carries an Epoch layer (adapter-private extension field)", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  for (const entity of revision.entities) {
    const ifcEntity = entity as unknown as { layer: string };
    assert.equal(typeof ifcEntity.layer, "string");
    assert.ok(ifcEntity.layer.length > 0, `entity ${entity.entityId} missing layer`);
    assert.ok(
      ["SITE", "FOUNDATION", "STRUCTURE", "ENVELOPE", "MEP", "FINISHES"].includes(ifcEntity.layer),
      `entity ${entity.entityId} has unknown layer ${ifcEntity.layer}`,
    );
  }
});

test("entityIds are stable and content-addressed (ifc:<GlobalId>)", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  for (const entity of revision.entities) {
    assert.ok(
      entity.entityId.startsWith("ifc:"),
      `entityId must be ifc:<GlobalId>, got ${entity.entityId}`,
    );
    const globalId = entity.entityId.slice("ifc:".length);
    assert.ok(globalId.length > 0, "GlobalId portion must be non-empty");
  }
});

test("the fixture produces the six canonical building-element types", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const types = new Set(revision.entities.map((entity) => entity.entityType));
  for (const expected of ["slab", "wall", "column", "beam", "door", "window"]) {
    assert.ok(types.has(expected), `expected entity type ${expected} in revision`);
  }
});
