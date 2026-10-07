/**
 * epoch-world-model 公开契约：工程语义世界（实体/关系/修订/溯源/单位/摘要）。
 * 只允许从 index.ts import；跨模块不得深引用内部文件。
 */
export type {
  AngleUnit,
  AreaUnit,
  CountUnit,
  LengthUnit,
  MassUnit,
  QuantityValue,
  TimeUnit,
  UnitOfMeasure,
  VolumeUnit,
} from "./units.ts";
export {
  ANGLE_UNITS,
  AREA_UNITS,
  COUNT_UNITS,
  LENGTH_UNITS,
  MASS_UNITS,
  TIME_UNITS,
  UNIT_OF_MEASURE_SET,
  VOLUME_UNITS,
  isQuantityValue,
  isUnitOfMeasure,
} from "./units.ts";
export type { AreaValue, LengthValue, MassValue, VolumeValue } from "./units.ts";
export type { ProvenanceKind, ProvenanceRef } from "./provenance.ts";
export {
  PROVENANCE_KINDS,
  PROVENANCE_KIND_SET,
  isProvenanceKind,
  isProvenanceRef,
} from "./provenance.ts";
export type { WorldEntity, WorldEntityMaterial } from "./entity.ts";
export { isWorldEntity, isWorldEntityMaterial } from "./entity.ts";
export type { WorldRelationship, WorldRelationshipKind } from "./relationship.ts";
export {
  WORLD_RELATIONSHIP_KINDS,
  WORLD_RELATIONSHIP_KIND_SET,
  isWorldRelationship,
  isWorldRelationshipKind,
} from "./relationship.ts";
export type { WorldPresentationSeed, WorldRevision } from "./revision.ts";
export { isWorldPresentationSeed, isWorldRevision } from "./revision.ts";
export type { WorldDigestAlgorithm, WorldDigestSource } from "./digest.ts";
export {
  WORLD_DIGEST_ALGORITHM,
  WORLD_DIGEST_PATTERN,
  canonicalizeWorld,
  computeWorldDigest,
  isWorldDigest,
} from "./digest.ts";
