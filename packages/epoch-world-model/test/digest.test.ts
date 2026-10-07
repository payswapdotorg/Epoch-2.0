/**
 * epoch-world-model 契约测试：确定性摘要。
 *
 * 覆盖：同输入稳定（同进程多次）、键序不变性、集合序不变性、
 * 不同输入产生不同摘要、hex 格式、pin 向量（跨运行稳定性）、
 * revisionId/presentationSeed 不参与、跨进程确定性。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  canonicalizeWorld,
  computeWorldDigest,
  isWorldDigest,
} from "../src/index.ts";

const execFileAsync = promisify(execFileCallback);

const fixtureWorld = {
  worldId: "epoch-fixture-alpha",
  entities: [
    {
      entityId: "entity-b",
      entityType: "wall",
      label: "Wall B",
      dimensions: { thickness: { value: 200, unit: "mm" } },
      quantity: { value: 1.5, unit: "m3" },
      constraints: ["con-2", "con-1"],
      provenance: [{ sourceId: "src-b", kind: "file", artifact: "b.ifc" }],
    },
    {
      entityId: "entity-a",
      entityType: "column",
      label: "Column A",
      material: { type: "concrete", grade: "C40" },
      phase: "structural",
    },
  ],
  relationships: [
    {
      relationshipId: "rel-2",
      kind: "supports",
      fromEntityId: "entity-a",
      toEntityId: "entity-b",
    },
    {
      relationshipId: "rel-1",
      kind: "contains",
      fromEntityId: "entity-b",
      toEntityId: "entity-a",
    },
  ],
  provenance: [{ sourceId: "fixture", kind: "fixture" }],
};

/** 固定向量：跨进程/跨运行稳定性的锚点（算法变更即失败，需重新冻结）。 */
const PINNED_DIGEST = "f9b0c90957ac2112afdc906056e7bda94a80eed1ad525273610be93e65ef905e";

test("digest is stable for repeated computation in-process", () => {
  const first = computeWorldDigest(fixtureWorld);
  const second = computeWorldDigest(fixtureWorld);
  const third = computeWorldDigest(structuredClone(fixtureWorld));
  assert.equal(first, second);
  assert.equal(first, third);
});

test("digest matches the pinned vector (cross-run stability)", () => {
  assert.equal(computeWorldDigest(fixtureWorld), PINNED_DIGEST);
});

test("digest is 64-char lowercase hex", () => {
  const digest = computeWorldDigest(fixtureWorld);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(isWorldDigest(digest), true);
  assert.equal(isWorldDigest(digest.toUpperCase()), false);
  assert.equal(isWorldDigest("zz"), false);
});

test("key insertion order does not change the digest", () => {
  // 同一语义内容、不同键插入顺序（对象/嵌套对象均反序构建）。
  const reordered = {
    provenance: [{ kind: "fixture", sourceId: "fixture" }],
    relationships: [
      {
        toEntityId: "entity-a",
        fromEntityId: "entity-b",
        kind: "contains",
        relationshipId: "rel-1",
      },
      {
        toEntityId: "entity-b",
        fromEntityId: "entity-a",
        kind: "supports",
        relationshipId: "rel-2",
      },
    ],
    entities: [
      {
        provenance: [{ artifact: "b.ifc", kind: "file", sourceId: "src-b" }],
        constraints: ["con-2", "con-1"],
        quantity: { unit: "m3", value: 1.5 },
        dimensions: { thickness: { unit: "mm", value: 200 } },
        label: "Wall B",
        entityType: "wall",
        entityId: "entity-b",
      },
      {
        phase: "structural",
        material: { grade: "C40", type: "concrete" },
        label: "Column A",
        entityType: "column",
        entityId: "entity-a",
      },
    ],
    worldId: "epoch-fixture-alpha",
  };
  assert.equal(computeWorldDigest(reordered), PINNED_DIGEST);
});

test("collection order does not change the digest", () => {
  const shuffled = structuredClone(fixtureWorld);
  shuffled.entities.reverse();
  shuffled.relationships.reverse();
  shuffled.provenance.reverse();
  const entityB = shuffled.entities.find((entity) => entity.entityId === "entity-b");
  if (entityB && entityB.constraints) entityB.constraints.reverse();
  assert.equal(computeWorldDigest(shuffled), PINNED_DIGEST);
});

test("different semantic content produces a different digest", () => {
  const renamed = structuredClone(fixtureWorld);
  renamed.entities[1]!.label = "Column A2";
  assert.notEqual(computeWorldDigest(renamed), PINNED_DIGEST);

  const changedQuantity = structuredClone(fixtureWorld);
  changedQuantity.entities[0]!.quantity = { value: 1.6, unit: "m3" };
  assert.notEqual(computeWorldDigest(changedQuantity), PINNED_DIGEST);

  const changedUnit = structuredClone(fixtureWorld);
  changedQuantity.entities[0]!.quantity = { value: 1.5, unit: "m3" };
  changedUnit.entities[0]!.quantity = { value: 1.5, unit: "L" };
  assert.notEqual(computeWorldDigest(changedUnit), PINNED_DIGEST);

  const changedWorldId = structuredClone(fixtureWorld);
  changedWorldId.worldId = "epoch-fixture-beta";
  assert.notEqual(computeWorldDigest(changedWorldId), PINNED_DIGEST);

  const droppedRelationship = structuredClone(fixtureWorld);
  droppedRelationship.relationships.pop();
  assert.notEqual(computeWorldDigest(droppedRelationship), PINNED_DIGEST);
});

test("revisionId, digest and presentationSeed do not participate", () => {
  const asRevisionA = {
    ...fixtureWorld,
    revisionId: "rev-001",
    digest: PINNED_DIGEST,
    presentationSeed: { seed: "seed-001" },
  };
  const asRevisionB = {
    ...fixtureWorld,
    revisionId: "rev-999",
    digest: "0".repeat(64),
    presentationSeed: { seed: "seed-999" },
  };
  assert.equal(computeWorldDigest(asRevisionA), computeWorldDigest(asRevisionB));
  assert.equal(computeWorldDigest(asRevisionA), PINNED_DIGEST);
});

test("presence is semantic: absent vs empty optional content differs", () => {
  const withoutConstraints = {
    worldId: "w",
    entities: [{ entityId: "e", entityType: "wall", label: "W" }],
    relationships: [],
  };
  const withEmptyConstraints = {
    worldId: "w",
    entities: [{ entityId: "e", entityType: "wall", label: "W", constraints: [] }],
    relationships: [],
  };
  assert.notEqual(
    computeWorldDigest(withoutConstraints),
    computeWorldDigest(withEmptyConstraints),
  );
});

test("unknown fields are dropped from the canonical form", () => {
  const withNoise = {
    ...fixtureWorld,
    extraTopLevel: "noise",
    entities: fixtureWorld.entities.map((entity) => ({ ...entity, meshName: "mesh_001" })),
  };
  assert.equal(computeWorldDigest(withNoise), PINNED_DIGEST);
});

test("canonicalizeWorld emits sorted, whitespace-free canonical JSON", () => {
  const minimal = { worldId: "w", entities: [], relationships: [] };
  assert.equal(
    canonicalizeWorld(minimal),
    '{"entities":[],"relationships":[],"worldId":"w"}',
  );
  // 无空白：值内空格之外不得有任何结构空白（分隔符前后都不允许）。
  assert.equal(/\s/.test(canonicalizeWorld(minimal)), false);
  const full = canonicalizeWorld(fixtureWorld);
  assert.equal(/[\{\}\[\],:]\s|\s[\{\}\[\],:]/.test(full), false);
  // entities 按 entityId 排序（entity-a 在前），constraints 排序（con-1 在前）。
  const entityAIndex = full.indexOf('"entityId":"entity-a"');
  const entityBIndex = full.indexOf('"entityId":"entity-b"');
  const con1Index = full.indexOf('"con-1"');
  const con2Index = full.indexOf('"con-2"');
  assert.ok(entityAIndex >= 0 && entityBIndex > entityAIndex);
  assert.ok(con1Index >= 0 && con2Index > con1Index);
});

test("non-finite numbers are rejected", () => {
  const withNaN = {
    worldId: "w",
    entities: [{ entityId: "e", entityType: "wall", label: "W", quantity: { value: Number.NaN, unit: "m" } }],
    relationships: [],
  };
  assert.throws(() => computeWorldDigest(withNaN), TypeError);
});

test("digest is identical across processes", async () => {
  const modulePath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const script = [
    `import { computeWorldDigest } from ${JSON.stringify(modulePath)};`,
    "process.stdout.write(computeWorldDigest(JSON.parse(process.argv[1])));",
  ].join("\n");
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "-e", script, "--", JSON.stringify(fixtureWorld)],
    { encoding: "utf8" },
  );
  assert.equal(stdout, PINNED_DIGEST);
});
