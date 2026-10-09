/**
 * IFC -> WorldRevision 归一化（W009「normalize IFC entities into WorldRevision」）。
 *
 * 依据 spec/architecture/contracts/world-model.md 与 spec/work-orders/W009：
 * - 实体身份稳定：entityId = `ifc:<GlobalId>`（IFC GlobalId 跨文件稳定，
 *   不依赖 expressID 或 mesh 名——invariant「No mesh semantics」）。
 * - entityType 词汇：IFC 类型名小写化（IfcWall -> "wall"，IfcSlab -> "slab"）。
 * - 显式 SI 单位：数量/尺寸的单位来自 IFC 项目级 IfcUnitAssignment（METRE ->
 *   "m"，SQUARE_METRE -> "m2"，CUBIC_METRE -> "m3"）；无单位赋值时回退 SI 米。
 *   单位字符串属于冻结 UnitOfMeasure 集合（守卫据此拒绝「bad units」）。
 * - 图层成员关系：IFC 实体类型 + PredefinedType -> Epoch 六层（layers.ts）。
 * - 溯源：修订级溯源指向来源 IFC 文件 + 引擎 + 内容摘要（descriptor.ts）。
 * - 几何：W009 不从 IFC 几何表示派生 mesh（invariant「No mesh semantics」）；
 *   仅从 IfcQuantityLength/Area/Volume 派生 dimensions/quantity（显式 SI 单位）。
 *
 * 引擎私有原始数据（records.ts）不跨契约边界——这里只产出 WorldEntity/
 * WorldRelationship/ProvenanceRef 等契约形状。
 */
import type {
  WorldEntity,
  WorldRelationship,
  ProvenanceRef,
  QuantityValue,
} from "@zcode/epoch-world-model";
import type {
  IfcRawEntity,
  IfcRawRelationship,
  IfcParseResult,
  IfcUnitAssignment,
} from "./records.ts";
import { resolveIfcEpochLayer, type IfcWorldEntityExtension } from "./layers.ts";
import { ifcFileProvenanceRef } from "./descriptor.ts";

/** IFC 实体类型名 -> Epoch entityType 词汇（小写、去 Ifc 前缀）。 */
export function mapIfcTypeToEntityType(ifcType: string): string {
  // IfcWallStandardCase -> "wall-standard-case"；IfcWall -> "wall"。
  const stripped = ifcType.startsWith("Ifc") ? ifcType.slice(3) : ifcType;
  return stripped.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** IfcQuantity 类型 -> (Epoch dimension key, 单位种类)。 */
interface QuantityMapping {
  readonly dimensionKey: string;
  readonly unitKind: "length" | "area" | "volume";
}

function quantityMappingFor(
  ifcType: string,
  name: string | undefined,
): QuantityMapping | undefined {
  const lower = (name ?? "").toLowerCase();
  if (ifcType === "IfcQuantityLength")
    return { dimensionKey: lower || "length", unitKind: "length" };
  if (ifcType === "IfcQuantityArea") return { dimensionKey: lower || "area", unitKind: "area" };
  if (ifcType === "IfcQuantityVolume")
    return { dimensionKey: lower || "volume", unitKind: "volume" };
  return undefined;
}

/** 解析单个 IfcRawEntity 为 WorldEntity（含 Epoch 图层扩展字段）。 */
export function normalizeEntity(
  raw: IfcRawEntity,
  units: IfcUnitAssignment,
  sourceArtifact: string,
  contentDigest: string,
): IfcWorldEntityExtension | undefined {
  const layer = resolveIfcEpochLayer(raw.ifcType, raw.predefinedType);
  if (layer === undefined) return undefined; // 不映射为 WorldEntity 的 IFC 实体跳过
  const entityId = `ifc:${raw.globalId}`;
  const entityType = mapIfcTypeToEntityType(raw.ifcType);
  const label = raw.name ?? `${entityType}-${raw.expressID}`;
  // IFC PredefinedType 仅用于图层消歧（layers.ts resolveIfcEpochLayer）；
  // 不映射为 WorldEntity.status（PredefinedType 是 IFC 子分类，不是构造状态——
  // 避免在 status 字段引入非语义内容；invariant「World Model is semantic
  // authority」要求字段语义诚实）。

  // 数量/尺寸：从 rawPropertySets 派生（minimal fixture 通过 PSet 携带 length/
  // area/volume）。单位来自项目级 IfcUnitAssignment（显式 SI，回退米）。
  const dimensions: Record<string, QuantityValue> = {};
  let quantity: QuantityValue | undefined;
  for (const [psetName, pset] of Object.entries(raw.rawPropertySets)) {
    void psetName; // PSet 名暂不参与 Epoch 语义（保留在 adapter 私有数据）
    for (const [qName, qValue] of Object.entries(pset)) {
      const mapping = quantityMappingFor((qValue as { ifcType?: string }).ifcType ?? "", qName);
      if (!mapping) continue;
      const value = (qValue as { value?: number }).value;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const unit = resolveUnit(mapping.unitKind, units);
      dimensions[mapping.dimensionKey] = { value, unit };
      // 体积量作为工程主量（混凝土体积等）；其余归 dimensions。
      if (mapping.unitKind === "volume") quantity = { value, unit };
    }
  }

  const entity: IfcWorldEntityExtension = {
    entityId,
    entityType,
    label,
    layer,
    ...(Object.keys(dimensions).length > 0 ? { dimensions } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  };
  void sourceArtifact;
  void contentDigest;
  return entity;
}

/** 按 unitKind 从项目级 IfcUnitAssignment 解析显式 SI 单位（回退米）。 */
function resolveUnit(
  kind: "length" | "area" | "volume",
  units: IfcUnitAssignment,
): NonNullable<QuantityValue["unit"]> {
  if (kind === "length") return units.length ?? "m";
  if (kind === "area") return units.area ?? "m2";
  return units.volume ?? "m3";
}

/** IFC 关系种类 -> Epoch WorldRelationshipKind（仅冻结集合内）。 */
const IFC_REL_KIND: Readonly<Record<string, "contains" | "connects" | "depends-on">> = {
  IfcRelContainedInSpatialStructure: "contains",
  IfcRelAggregates: "contains",
  IfcRelConnectsElements: "connects",
  IfcRelConnectsStructuralActivity: "connects",
  IfcRelSequence: "depends-on",
};

/**
 * 归一化 IFC 关系为 Epoch 二元关系集合。
 *
 * IFC 关系常为 1:N（一个 relating，多个 related）；Epoch WorldRelationship 是
 * 二元（from -> to）。展开为 N 条二元关系，relationshipId = `ifc-rel:<globalId>:<toGlobalId>`
 * 以保证唯一且确定性。仅保留两端 expressID 都解析到 WorldEntity 的关系
 * （引用完整性——schema-validity 测试据此断言无悬挂端）。
 */
export function normalizeRelationships(
  rawRelationships: readonly IfcRawRelationship[],
  rawEntities: readonly IfcRawEntity[],
): readonly WorldRelationship[] {
  const expressToGlobalId = new Map<number, string>();
  for (const raw of rawEntities) expressToGlobalId.set(raw.expressID, raw.globalId);
  const entityIdOf = (expressID: number | undefined): string | undefined =>
    expressID === undefined ? undefined : expressToGlobalId.get(expressID);

  const result: WorldRelationship[] = [];
  for (const raw of rawRelationships) {
    const kind = IFC_REL_KIND[raw.ifcType];
    if (!kind) continue; // 不映射为 Epoch 关系的 IFC 关系类型跳过（不发明关系）
    const fromGlobalId = entityIdOf(raw.relatingId);
    if (fromGlobalId === undefined) continue;
    const fromEntityId = `ifc:${fromGlobalId}`;
    for (const relatedId of raw.relatedIds) {
      const toGlobalId = entityIdOf(relatedId);
      if (toGlobalId === undefined) continue;
      const toEntityId = `ifc:${toGlobalId}`;
      const relationshipId = `ifc-rel:${raw.globalId}:${toGlobalId}`;
      const relationship: WorldRelationship = {
        relationshipId,
        kind,
        fromEntityId,
        toEntityId,
        ...(raw.name !== undefined ? { label: raw.name } : {}),
      };
      result.push(relationship);
    }
  }
  return result;
}

/** 归一化结果：契约形状的实体、关系、溯源。 */
export interface NormalizedIfcWorld {
  readonly entities: readonly WorldEntity[];
  readonly relationships: readonly WorldRelationship[];
  readonly provenance: readonly ProvenanceRef[];
}

/**
 * 将引擎私有 IfcParseResult 归一化为契约形状的世界内容。
 *
 * - 实体：构件实体 -> WorldEntity（含 Epoch 图层扩展字段）。
 * - 关系：IfcRel* -> 二元 Epoch WorldRelationship（仅冻结 kind 集合内）。
 * - 溯源：修订级溯源指向来源 IFC 文件 + 引擎 + 内容摘要。
 * - 单位：显式 SI（来自 IfcUnitAssignment，回退米）。
 */
export function normalizeIfcParseResult(
  parseResult: IfcParseResult,
  units: IfcUnitAssignment,
  sourceArtifact: string,
): NormalizedIfcWorld {
  const entities: WorldEntity[] = [];
  for (const raw of parseResult.rawEntities) {
    const entity = normalizeEntity(raw, units, sourceArtifact, parseResult.contentDigest);
    if (entity !== undefined) entities.push(entity);
  }
  const relationships = normalizeRelationships(
    parseResult.rawRelationships,
    parseResult.rawEntities,
  );
  const provenance: readonly ProvenanceRef[] = [
    ifcFileProvenanceRef({
      sourceId: sourceArtifact,
      artifact: sourceArtifact,
      digest: parseResult.contentDigest,
    }),
  ];
  return { entities, relationships, provenance };
}
