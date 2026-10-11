/**
 * epoch-persistence 测试 fixtures：确定性世界修订工厂。
 *
 * 依据 ARCHITECTURE-LOCK #17：测试数据零随机、零时间依赖——实体/关系/溯源
 * 全部由 (worldId, seed, revisionId) 确定性派生；摘要用冻结的
 * computeWorldDigest 计算（唯一摘要权威）。同一输入恒产生同一修订。
 */
import { computeWorldDigest } from "@zcode/epoch-world-model";
import type {
  ProvenanceRef,
  WorldEntity,
  WorldRelationship,
  WorldRevision,
} from "@zcode/epoch-world-model";
import type { EngineProvenance, PersistedRevision } from "../src/index.ts";
import { PERSISTENCE_FORMAT_VERSION } from "../src/index.ts";

/** 确定性字符串哈希（测试数据派生专用，非摘要权威）。 */
function seedCode(seed: string, salt: number): number {
  let hash = salt;
  for (const char of seed) {
    hash = (hash * 31 + char.codePointAt(0)!) % 0x10000;
  }
  return hash;
}

/** 由 seed+index 确定性派生一个合法语义实体。 */
export function fixtureEntity(seed: string, index: number): WorldEntity {
  const code = seedCode(seed, index + 1);
  const kind = ["column", "beam", "wall", "slab"][index % 4]!;
  return {
    entityId: `${seed}-entity-${index}`,
    entityType: kind,
    label: `${kind} ${index} (${seed})`,
    material: { type: "concrete", grade: `C${30 + (code % 10)}` },
    dimensions: {
      length: { value: 2 + (code % 400) / 100, unit: "m" },
      width: { value: 0.2 + (code % 50) / 100, unit: "m" },
    },
    quantity: { value: 0.5 + (code % 90) / 10, unit: "m3" },
    phase: ["foundation", "structure", "envelope"][index % 3]!,
    status: index % 2 === 0 ? "planned" : "installed",
    costReference: `cost-${seed}-${index}`,
    constraints: [`STR-${code % 9}`, `FIR-${(code + 1) % 7}`],
    provenance: [fixtureProvenance(seed, index)],
  };
}

/** 确定性溯源引用。 */
export function fixtureProvenance(seed: string, index: number): ProvenanceRef {
  return {
    sourceId: `test-source-${seed}`,
    kind: "fixture",
    artifact: `qa://epoch-persistence/${seed}/${index}`,
  };
}

/** 由 seed 确定性派生关系（实体数 ≥ 2 时生成链式关系）。 */
export function fixtureRelationships(seed: string, entityCount: number): WorldRelationship[] {
  const relationships: WorldRelationship[] = [];
  for (let index = 0; index + 1 < entityCount; index += 1) {
    relationships.push({
      relationshipId: `${seed}-rel-${index}`,
      kind: "supports",
      fromEntityId: `${seed}-entity-${index}`,
      toEntityId: `${seed}-entity-${index + 1}`,
      label: `supports ${index}`,
      provenance: [fixtureProvenance(seed, index)],
    });
  }
  return relationships;
}

/**
 * 确定性世界修订：entityCount 由 seed 长度派生（1..4），digest 由
 * computeWorldDigest 计算——同一 (worldId, seed, revisionId) 恒同修订。
 */
export function fixtureRevision(worldId: string, seed: string, revisionId: string): WorldRevision {
  const entityCount = 1 + (seed.length % 4);
  const entities = Array.from({ length: entityCount }, (_, index) => fixtureEntity(seed, index));
  const revision: Omit<WorldRevision, "digest"> = {
    worldId,
    revisionId,
    entities,
    relationships: fixtureRelationships(seed, entityCount),
    presentationSeed: { seed },
    provenance: [fixtureProvenance(seed, 0)],
  };
  return { ...revision, digest: computeWorldDigest(revision) };
}

/** 确定性引擎溯源。 */
export function fixtureEngine(engineId = "fixture-engine"): EngineProvenance {
  return {
    engineId,
    engineName: `Fixture Engine (${engineId})`,
    engineVersion: "1.0.0",
    runtime: "in-process",
  };
}

/** 组装一个可直接保存的 PersistedRevision。 */
export function fixturePersistedRevision(
  revision: WorldRevision,
  engine: EngineProvenance = fixtureEngine(),
  storeKind = "memory",
): PersistedRevision {
  return {
    revision,
    digest: revision.digest,
    engine,
    persistence: { formatVersion: PERSISTENCE_FORMAT_VERSION, storeKind },
  };
}
