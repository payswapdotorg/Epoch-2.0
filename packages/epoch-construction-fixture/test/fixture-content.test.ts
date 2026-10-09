/**
 * W002 测试：fixture 内容满足 work-order 最小语义集。
 *
 - 六层（SITE/FOUNDATION/STRUCTURE/ENVELOPE/MEP/FINISHES）均有实体；
 - 结构柱/梁/板；墙/门/窗/屋顶；电气/照明；给排水/HVAC；场地/通道/堆场；
 - 至少 2 agent、1 finding、1 constraint、2 variant；
 - 实体携带 phase（构造阶段）；单位为 SI。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVariantRevision } from "../src/index.ts";
import { buildVariantEntities } from "../src/index.ts";
import {
  CONSTRUCTION_LAYERS,
  CONSTRUCTION_FIXTURE_AGENTS,
  CONSTRUCTION_FIXTURE_CONSTRAINTS,
  CONSTRUCTION_FIXTURE_FINDINGS,
  CONSTRUCTION_FIXTURE_VARIANT_IDS,
} from "../src/index.ts";

function entityTypes(revision: ReturnType<typeof buildVariantRevision>): Set<string> {
  return new Set(revision.entities.map((entity) => entity.entityType));
}

function layerCounts(revision: ReturnType<typeof buildVariantRevision>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entity of revision.entities) {
    const layer = (entity as unknown as { layer: string }).layer;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  return counts;
}

test("all six construction layers are present with entities", () => {
  for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
    const revision = buildVariantRevision(variant);
    const counts = layerCounts(revision);
    for (const layer of CONSTRUCTION_LAYERS) {
      assert.ok((counts.get(layer) ?? 0) > 0, `variant ${variant} missing layer ${layer}`);
    }
  }
});

test("structure layer contains columns, beams and a slab", () => {
  const revision = buildVariantRevision("baseline");
  const types = entityTypes(revision);
  assert.ok(types.has("column"), "missing column");
  assert.ok(types.has("beam"), "missing beam");
  assert.ok(types.has("slab"), "missing slab");
});

test("envelope layer contains walls, door, windows and roof", () => {
  const revision = buildVariantRevision("baseline");
  const types = entityTypes(revision);
  assert.ok(types.has("wall"));
  assert.ok(types.has("door"));
  assert.ok(types.has("window"));
  assert.ok(types.has("roof"));
  const walls = revision.entities.filter((entity) => entity.entityType === "wall");
  assert.ok(walls.length >= 4, "expected at least 4 walls");
});

test("MEP layer contains electrical/lighting and plumbing/HVAC/drainage representation", () => {
  const revision = buildVariantRevision("baseline");
  const types = entityTypes(revision);
  assert.ok(types.has("electrical-panel"), "missing electrical panel");
  assert.ok(types.has("light-fixture"), "missing lighting");
  assert.ok(types.has("pipe") || types.has("drain-pipe"), "missing plumbing");
  assert.ok(types.has("drain-pipe"), "missing drainage");
  assert.ok(types.has("duct") || types.has("hvac-unit"), "missing HVAC");
});

test("site layer contains access and staging elements", () => {
  const revision = buildVariantRevision("baseline");
  const types = entityTypes(revision);
  assert.ok(types.has("access-road"), "missing access road");
  assert.ok(types.has("staging-area"), "missing staging area");
  assert.ok(types.has("site-plot"), "missing site plot");
});

test("at least two agents are referenced via author provenance", () => {
  for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
    const revision = buildVariantRevision(variant);
    const authorIds = new Set<string>();
    for (const entity of revision.entities) {
      if (entity.provenance) {
        for (const ref of entity.provenance) {
          if (ref.kind === "author") authorIds.add(ref.sourceId);
        }
      }
    }
    assert.ok(authorIds.size >= 2, `variant ${variant} needs >=2 agents, got ${authorIds.size}`);
    assert.ok(authorIds.size <= CONSTRUCTION_FIXTURE_AGENTS.length);
  }
  assert.ok(CONSTRUCTION_FIXTURE_AGENTS.length >= 2);
});

test("at least one constraint is attached to entities", () => {
  const revision = buildVariantRevision("baseline");
  const constraintIds = new Set<string>();
  for (const entity of revision.entities) {
    if (entity.constraints) for (const constraint of entity.constraints) constraintIds.add(constraint);
  }
  assert.ok(constraintIds.size >= 1, "expected at least one constraint id on entities");
  assert.ok(CONSTRUCTION_FIXTURE_CONSTRAINTS.length >= 1);
  for (const constraintId of constraintIds) {
    assert.ok(
      CONSTRUCTION_FIXTURE_CONSTRAINTS.some((item) => item.constraintId === constraintId),
      `constraint ${constraintId} has no definition`,
    );
  }
});

test("at least one finding is encoded as a clashes-with relationship", () => {
  const revision = buildVariantRevision("baseline");
  const clashes = revision.relationships.filter((relationship) => relationship.kind === "clashes-with");
  assert.ok(clashes.length >= 1, "expected at least one clashes-with finding relationship");
  assert.ok(CONSTRUCTION_FIXTURE_FINDINGS.length >= 1);
  const clashLabels = clashes.map((relationship) => relationship.label).filter(Boolean);
  const findingIds = CONSTRUCTION_FIXTURE_FINDINGS.map((finding) => finding.findingId);
  const overlap = clashLabels.filter((label) => findingIds.includes(label!));
  assert.ok(overlap.length >= 1, "clash relationship should reference a defined finding");
});

test("at least two variants produce distinct revisions", () => {
  assert.ok(CONSTRUCTION_FIXTURE_VARIANT_IDS.length >= 2);
  const digests = CONSTRUCTION_FIXTURE_VARIANT_IDS.map((variant) => buildVariantRevision(variant).digest);
  assert.equal(new Set(digests).size, digests.length, "variant digests must be distinct");
});

test("entities carry construction phases", () => {
  for (const variant of CONSTRUCTION_FIXTURE_VARIANT_IDS) {
    const revision = buildVariantRevision(variant);
    const phased = revision.entities.filter((entity) => entity.phase !== undefined);
    assert.ok(phased.length >= 1, `variant ${variant} has no phased entities`);
  }
});

test("quantities and dimensions use explicit SI units", () => {
  const revision = buildVariantRevision("baseline");
  const siUnits = new Set(["m", "cm", "mm", "m2", "m3", "kg", "t", "deg", "count", "s", "min", "h"]);
  for (const entity of revision.entities) {
    if (entity.dimensions) {
      for (const quantity of Object.values(entity.dimensions)) {
        assert.ok(siUnits.has(quantity.unit), `entity ${entity.entityId} non-SI unit ${quantity.unit}`);
      }
    }
    if (entity.quantity) {
      assert.ok(siUnits.has(entity.quantity.unit), `entity ${entity.entityId} non-SI quantity unit`);
    }
  }
});

test("alternate variant removes flat roof and adds pitched roof elements", () => {
  const baseline = buildVariantRevision("baseline");
  const alternate = buildVariantRevision("alternate-pitched-roof");
  const baselineIds = new Set(baseline.entities.map((entity) => entity.entityId));
  const alternateIds = new Set(alternate.entities.map((entity) => entity.entityId));
  assert.ok(baselineIds.has("structure-roof-slab"));
  assert.ok(baselineIds.has("envelope-roof-flat"));
  assert.ok(!alternateIds.has("structure-roof-slab"), "flat roof slab must be removed in alternate");
  assert.ok(!alternateIds.has("envelope-roof-flat"), "flat roof membrane must be removed in alternate");
  assert.ok(alternateIds.has("structure-beam-ridge"), "ridge beam must be added in alternate");
  assert.ok(alternateIds.has("envelope-roof-slope-south"));
  assert.ok(alternateIds.has("envelope-roof-slope-north"));
});

test("entity count per layer is believable", () => {
  const baseline = buildVariantRevision("baseline");
  const counts = layerCounts(baseline);
  assert.ok((counts.get("SITE") ?? 0) >= 3);
  assert.ok((counts.get("FOUNDATION") ?? 0) >= 4);
  assert.ok((counts.get("STRUCTURE") ?? 0) >= 6, "structure needs columns+beams+slab");
  assert.ok((counts.get("ENVELOPE") ?? 0) >= 7, "envelope needs walls+door+windows+roof");
  assert.ok((counts.get("MEP") ?? 0) >= 5);
  assert.ok((counts.get("FINISHES") ?? 0) >= 3);
  const total = buildVariantEntities("baseline").length;
  assert.ok(total >= 30, `expected believable fixture, got ${total} entities`);
});
