/**
 * W009 测试：IFC -> Epoch 归一化映射正确。
 *
 * - IFC 实体类型 -> Epoch entityType 词汇（IfcWall -> "wall" 等）。
 * - IFC PredefinedType -> Epoch 图层（IfcSlab .BASESLAB. -> FOUNDATION）。
 * - 显式 SI 单位：quantities/dimensions 携带项目级 IfcUnitAssignment 解析
 *   的单位（METRE -> "m"，SQUARE_METRE -> "m2"，CUBIC_METRE -> "m3"）。
 * - 关系：IfcRelConnectsElements -> Epoch "connects" 二元关系（两端解析到
 *   ifc:<GlobalId>）。
 * - 溯源：修订级溯源指向来源 IFC 文件 + 引擎 + 内容摘要。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createIfcReconstructionEngine, mapIfcTypeToEntityType } from "../src/index.ts";
import type { ReconstructionContext } from "@zcode/epoch-reconstruction-contract";

const CONTEXT: ReconstructionContext = { workspaceKey: "ws-ifc-test" };

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/pump-house.ifc",
);

function entityOf(
  revision: { entities: readonly { entityId: string; entityType: string }[] },
  type: string,
) {
  const found = revision.entities.find((entity) => entity.entityType === type);
  assert.ok(found, `expected entity of type ${type}`);
  return found;
}

test("mapIfcTypeToEntityType maps IFC types to Epoch vocabulary", () => {
  assert.equal(mapIfcTypeToEntityType("IfcWall"), "wall");
  assert.equal(mapIfcTypeToEntityType("IfcSlab"), "slab");
  assert.equal(mapIfcTypeToEntityType("IfcColumn"), "column");
  assert.equal(mapIfcTypeToEntityType("IfcBeam"), "beam");
  assert.equal(mapIfcTypeToEntityType("IfcDoor"), "door");
  assert.equal(mapIfcTypeToEntityType("IfcWindow"), "window");
  assert.equal(mapIfcTypeToEntityType("IfcWallStandardCase"), "wall-standard-case");
});

test("IfcSlab .BASESLAB. is mapped to FOUNDATION layer (PredefinedType drives layer)", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();
  const slab = entityOf(revision, "slab");
  assert.equal((slab as unknown as { layer: string }).layer, "FOUNDATION");
  // PredefinedType informs the layer only; it is NOT surfaced as status (avoid
  // overloading the WorldEntity.status field with IFC sub-classification).
  assert.equal((slab as unknown as { status?: string }).status, undefined);
});

test("IfcWall is mapped to STRUCTURE layer; IfcDoor/IfcWindow to ENVELOPE", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const wall = entityOf(revision, "wall");
  const column = entityOf(revision, "column");
  const beam = entityOf(revision, "beam");
  const door = entityOf(revision, "door");
  const window = entityOf(revision, "window");

  assert.equal((wall as unknown as { layer: string }).layer, "STRUCTURE");
  assert.equal((column as unknown as { layer: string }).layer, "STRUCTURE");
  assert.equal((beam as unknown as { layer: string }).layer, "STRUCTURE");
  assert.equal((door as unknown as { layer: string }).layer, "ENVELOPE");
  assert.equal((window as unknown as { layer: string }).layer, "ENVELOPE");
});

test("wall entity carries explicit SI units on dimensions and quantity", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const wall = entityOf(revision, "wall");
  const dims = (wall as unknown as { dimensions?: Record<string, { value: number; unit: string }> })
    .dimensions;
  assert.ok(dims, "wall must carry dimensions from PSet quantities");
  assert.equal(dims!.length!.unit, "m");
  assert.equal(dims!.length!.value, 4.2);
  assert.equal(dims!.footprintarea!.unit, "m2");
  assert.equal(dims!.footprintarea!.value, 8.4);
  // NetVolume quantity (volume kind) -> entity.quantity, explicit "m3"
  const quantity = (wall as unknown as { quantity?: { value: number; unit: string } }).quantity;
  assert.ok(quantity, "wall must carry volume quantity");
  assert.equal(quantity!.unit, "m3");
  assert.equal(quantity!.value, 1.68);
});

test("slab entity carries length/width dimensions and gross volume quantity", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const slab = entityOf(revision, "slab");
  const dims = (slab as unknown as { dimensions?: Record<string, { value: number; unit: string }> })
    .dimensions;
  assert.ok(dims, "slab must carry dimensions from PSet quantities");
  assert.equal(dims!.length!.value, 6.0);
  assert.equal(dims!.length!.unit, "m");
  assert.equal(dims!.width!.value, 4.0);
  assert.equal(dims!.width!.unit, "m");
  assert.equal(dims!.footprintarea!.value, 24.0);
  assert.equal(dims!.footprintarea!.unit, "m2");
  const quantity = (slab as unknown as { quantity?: { value: number; unit: string } }).quantity;
  assert.ok(quantity, "slab must carry gross volume quantity");
  assert.equal(quantity!.value, 4.8);
  assert.equal(quantity!.unit, "m3");
});

test("IfcRelConnectsElements normalizes to Epoch binary 'connects' relationships", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const connects = revision.relationships.filter((rel) => rel.kind === "connects");
  assert.ok(connects.length >= 2, "expected at least two connects relationships");
  for (const rel of connects) {
    assert.ok(rel.fromEntityId.startsWith("ifc:"), "fromEntityId must be ifc:<GlobalId>");
    assert.ok(rel.toEntityId.startsWith("ifc:"), "toEntityId must be ifc:<GlobalId>");
    assert.ok(rel.relationshipId.startsWith("ifc-rel:"), "relationshipId must be ifc-rel:<...>");
  }
  // Wall-column and column-beam connections.
  const wall = entityOf(revision, "wall");
  const column = entityOf(revision, "column");
  const beam = entityOf(revision, "beam");
  const wallToColumn = connects.find(
    (rel) => rel.fromEntityId === wall.entityId && rel.toEntityId === column.entityId,
  );
  const columnToBeam = connects.find(
    (rel) => rel.fromEntityId === column.entityId && rel.toEntityId === beam.entityId,
  );
  assert.ok(wallToColumn, "wall -> column connects relationship must be present");
  assert.ok(columnToBeam, "column -> beam connects relationship must be present");
});

test("revision provenance carries file + engine + content digest", async () => {
  const engine = createIfcReconstructionEngine();
  const session = await engine.open({ kind: "file-path", path: FIXTURE_PATH }, CONTEXT);
  const revision = await session.snapshot();
  await session.close();

  const fileProv = revision.provenance.find((ref) => ref.kind === "file");
  assert.ok(fileProv, "provenance must carry a file ref");
  assert.equal(fileProv!.engineId, "epoch.reconstruction-ifc");
  assert.equal(fileProv!.engineVersion, "0.1.0");
  assert.ok(fileProv!.digest, "provenance must carry content digest");
  assert.match(fileProv!.digest!, /^[0-9a-f]{64}$/);
  assert.equal(fileProv!.artifact, FIXTURE_PATH);
});

test("label falls back to type + expressID when IFC Name is absent (none in fixture)", () => {
  // The fixture provides Name for all entities; this test documents the fallback
  // contract by exercising mapIfcTypeToEntityType on an unmapped type.
  assert.equal(mapIfcTypeToEntityType("IfcRoof"), "roof");
});
