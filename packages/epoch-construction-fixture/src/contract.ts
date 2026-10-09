/**
 * epoch-construction-fixture 公开契约：确定性构造 fixture 重建引擎的公共表面。
 *
 - 只允许从 index.ts import；跨模块不得深引用内部文件。
 - 实现 @zcode/epoch-reconstruction-contract 冻结的 ReconstructionEngine；
 - 世界内容遵循 @zcode/epoch-world-model 冻结契约（实体/关系/修订/摘要/溯源/单位）。
 */
export {
  CONSTRUCTION_LAYERS,
  CONSTRUCTION_LAYER_SET,
  CONSTRUCTION_LAYER_DESCRIPTIONS,
  isConstructionLayerId,
} from "./layers.ts";
export type { ConstructionLayerId } from "./layers.ts";

export {
  isGeometrySeed,
} from "./geometry.ts";
export type { GeometrySeed, GeometryKind, ConstructionFixtureEntity } from "./geometry.ts";

export {
  CONSTRUCTION_FIXTURE_ENGINE_ID,
  CONSTRUCTION_FIXTURE_ENGINE_VERSION,
  CONSTRUCTION_FIXTURE_ENGINE_NAME,
  CONSTRUCTION_FIXTURE_WORLD_ID,
  CONSTRUCTION_FIXTURE_CONTENT_REF,
  CONSTRUCTION_FIXTURE_INPUT_KINDS,
  CONSTRUCTION_FIXTURE_VARIANT_IDS,
  CONSTRUCTION_FIXTURE_VARIANT_SET,
  CONSTRUCTION_FIXTURE_CAPABILITIES,
  CONSTRUCTION_FIXTURE_DESCRIPTOR,
  CONSTRUCTION_PHASES,
  isConstructionFixtureVariantId,
  fixtureProvenanceRef,
} from "./descriptor.ts";
export type {
  ConstructionFixtureVariantId,
  ConstructionPhase,
} from "./descriptor.ts";

export {
  CONSTRUCTION_FIXTURE_AGENTS,
  CONSTRUCTION_FIXTURE_CONSTRAINTS,
  CONSTRUCTION_FIXTURE_FINDINGS,
  agentById,
  constraintById,
  findingById,
} from "./semantics.ts";
export type {
  ConstructionFixtureAgent,
  ConstructionFixtureConstraint,
  ConstructionFixtureFinding,
} from "./semantics.ts";

export {
  createConstructionFixtureEngine,
  buildVariantEntities,
  buildVariantRelationships,
  buildVariantRevision,
} from "./engine.ts";
