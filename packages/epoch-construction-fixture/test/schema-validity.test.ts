/**
 * W002 验收测试（强制）：修订按冻结 world-model 守卫 schema 合法。
 *
 * 断言：isWorldRevision 成立；每个实体 isWorldEntity；每个关系 isWorldRelationship；
 * 溯源 isProvenanceRef；数量 isQuantityValue；单位在冻结集合内；digest 合法格式。
 * 注意：扩展字段（layer/geometry）不破坏 schema 合法性（守卫忽略未知字段，
 * 依据 world-model「The implementation may be richer」）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
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
import { buildVariantRevision } from "../src/index.ts";
import { CONSTRUCTION_FIXTURE_VARIANT_IDS } from "../src/index.ts";

for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
  test(`revision for variant "${variant}" is schema-valid per frozen guards`, () => {
    const revision = buildVariantRevision(variant);
    assert.equal(isWorldRevision(revision), true);
    assert.equal(isWorldDigest(revision.digest), true);
    assert.equal(isWorldPresentationSeed(revision.presentationSeed), true);
    assert.ok(revision.provenance.length >= 1, "revision provenance must carry fixture ref");
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
}

test("every relationship references existing entities in the revision", () => {
  for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
    const revision = buildVariantRevision(variant);
    const ids = new Set(revision.entities.map((entity) => entity.entityId));
    for (const relationship of revision.relationships) {
      assert.ok(
        ids.has(relationship.fromEntityId),
        `dangling from: ${relationship.relationshipId}`,
      );
      assert.ok(ids.has(relationship.toEntityId), `dangling to: ${relationship.relationshipId}`);
    }
  }
});

test("every entity carries a layer and renderer-neutral geometry seed", () => {
  for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
    const revision = buildVariantRevision(variant);
    for (const entity of revision.entities) {
      const fixtureEntity = entity as unknown as {
        layer: string;
        geometry: { kind: string; size: readonly number[]; position: readonly number[] };
      };
      assert.equal(typeof fixtureEntity.layer, "string");
      assert.ok(fixtureEntity.layer.length > 0, `entity ${entity.entityId} missing layer`);
      assert.ok(fixtureEntity.geometry, `entity ${entity.entityId} missing geometry seed`);
      assert.equal(typeof fixtureEntity.geometry.kind, "string");
      assert.ok(Array.isArray(fixtureEntity.geometry.size));
      assert.ok(Array.isArray(fixtureEntity.geometry.position));
    }
  }
});
