/**
 * 确定性构造 fixture 重建引擎（W002 交付物）。
 *
 * 实现 @zcode/epoch-reconstruction-contract 冻结的 ReconstructionEngine：
 * descriptor() + open() + ReconstructionSession(snapshot/close + apply/subscribe)。
 *
 * 确定性保证：无网络、无 Date.now()、无 Math.random()；所有标识为字面量或由
 * 内容摘要派生。相同输入 -> 相同实体集 -> 相同摘要（经冻结 computeWorldDigest）。
 */
import type {
  ReconstructionEngine,
  ReconstructionSession,
  ReconstructionInput,
  ReconstructionContext,
  ReconstructionOperation,
  ReconstructionEvent,
} from "@zcode/epoch-reconstruction-contract";
import type {
  WorldRevision,
  WorldEntity,
  WorldRelationship,
} from "@zcode/epoch-world-model";
import { computeWorldDigest } from "@zcode/epoch-world-model";
import type { ConstructionFixtureEntity } from "./geometry.ts";
import { CONSTRUCTION_FIXTURE_DESCRIPTOR } from "./descriptor.ts";
import {
  CONSTRUCTION_FIXTURE_ENGINE_ID,
  CONSTRUCTION_FIXTURE_WORLD_ID,
  fixtureProvenanceRef,
  isConstructionFixtureVariantId,
  type ConstructionFixtureVariantId,
} from "./descriptor.ts";
import { siteFoundationEntities } from "./content/site-foundation.ts";
import { structureEnvelopeEntities } from "./content/structure-envelope.ts";
import { mepFinishesEntities } from "./content/mep-finishes.ts";
import { alternateRoofEntities, BASELINE_FLAT_ROOF_ENTITY_IDS } from "./content/alternate.ts";
import { allRelationships } from "./content/relationships.ts";

/** 构造指定变体的实体集（确定性，无副作用）。 */
export function buildVariantEntities(
  variant: ConstructionFixtureVariantId,
): readonly ConstructionFixtureEntity[] {
  const base = [
    ...siteFoundationEntities(),
    ...structureEnvelopeEntities(),
    ...mepFinishesEntities(),
  ];
  if (variant === "baseline") return base;
  const removed = new Set<string>(BASELINE_FLAT_ROOF_ENTITY_IDS);
  return [...base.filter((entity) => !removed.has(entity.entityId)), ...alternateRoofEntities()];
}

/** 按变体实体存在性过滤关系超集（保证关系集与实体集一致）。 */
export function buildVariantRelationships(
  entities: readonly ConstructionFixtureEntity[],
): readonly WorldRelationship[] {
  const ids = new Set(entities.map((entity) => entity.entityId));
  return allRelationships().filter(
    (relationship) => ids.has(relationship.fromEntityId) && ids.has(relationship.toEntityId),
  );
}

/** 构造变体的世界修订（确定性摘要 + 确定性 revisionId/presentationSeed）。 */
export function buildVariantRevision(variant: ConstructionFixtureVariantId): WorldRevision {
  const entities = buildVariantEntities(variant);
  const relationships = buildVariantRelationships(entities);
  const worldSource = {
    worldId: CONSTRUCTION_FIXTURE_WORLD_ID,
    entities: entities as readonly WorldEntity[],
    relationships,
    provenance: [fixtureProvenanceRef()],
  };
  const digest = computeWorldDigest(worldSource);
  return {
    worldId: CONSTRUCTION_FIXTURE_WORLD_ID,
    revisionId: `rev-${variant}-${digest.slice(0, 12)}`,
    digest,
    entities: worldSource.entities,
    relationships,
    presentationSeed: { seed: `${CONSTRUCTION_FIXTURE_WORLD_ID}:${variant}` },
    provenance: [fixtureProvenanceRef()],
  };
}

/** 从 engine-native 输入解析变体（默认 baseline）。 */
function variantFromInput(input: ReconstructionInput): ConstructionFixtureVariantId {
  if (input.kind !== "engine-native") {
    throw new TypeError(
      `construction fixture engine rejects non engine-native input kind: ${input.kind}`,
    );
  }
  if (input.engineId !== CONSTRUCTION_FIXTURE_ENGINE_ID) {
    throw new TypeError(
      `construction fixture engine rejects engineId: ${input.engineId}`,
    );
  }
  const payload = (input.payload ?? {}) as { variant?: unknown };
  if (payload.variant === undefined) return "baseline";
  if (!isConstructionFixtureVariantId(payload.variant)) {
    throw new TypeError(`unknown construction fixture variant: ${String(payload.variant)}`);
  }
  return payload.variant;
}

/** 构造 fixture 引擎实例（每次返回新实例，状态隔离）。 */
export function createConstructionFixtureEngine(): ReconstructionEngine {
  return new ConstructionFixtureEngine();
}

class ConstructionFixtureEngine implements ReconstructionEngine {
  descriptor() {
    return CONSTRUCTION_FIXTURE_DESCRIPTOR;
  }

  async open(input: ReconstructionInput, _context: ReconstructionContext): Promise<ReconstructionSession> {
    const variant = variantFromInput(input);
    const revision = buildVariantRevision(variant);
    return new ConstructionFixtureSession(variant, revision);
  }
}

class ConstructionFixtureSession implements ReconstructionSession {
  private variant: ConstructionFixtureVariantId;
  private revision: WorldRevision;
  private closed = false;
  private readonly listeners = new Set<(event: ReconstructionEvent) => void>();

  constructor(variant: ConstructionFixtureVariantId, revision: WorldRevision) {
    this.variant = variant;
    this.revision = revision;
  }

  async snapshot(): Promise<WorldRevision> {
    this.assertNotClosed();
    return this.revision;
  }

  async apply(operation: ReconstructionOperation): Promise<WorldRevision> {
    this.assertNotClosed();
    if (operation.kind !== "select-variant") {
      throw new TypeError(`unsupported operation kind: ${operation.kind}`);
    }
    const variant = (operation.payload ?? {}) as { variant?: unknown };
    if (!isConstructionFixtureVariantId(variant.variant)) {
      throw new TypeError(`unknown variant in select-variant operation: ${String(variant.variant)}`);
    }
    this.variant = variant.variant;
    this.revision = buildVariantRevision(this.variant);
    this.emit({ type: "revision", revision: this.revision });
    return this.revision;
  }

  subscribe(listener: (event: ReconstructionEvent) => void): () => void {
    this.assertNotClosed();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error("construction fixture session is closed");
    }
  }

  private emit(event: ReconstructionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 监听器异常不破坏会话（隔离故障）。
      }
    }
  }
}
