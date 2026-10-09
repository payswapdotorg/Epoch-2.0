/**
 * IFC -> Epoch 图层词汇映射（W009「layer membership」）。
 *
 * Epoch 复用 W002 冻结的六层 SITE/FOUNDATION/STRUCTURE/ENVELOPE/MEP/FINISHES
 * 构造图层（per spec/work-orders/W002 与 epoch-construction-fixture 的
 * CONSTRUCTION_LAYERS）。IFC 的 PredefinedType 与 IFC 实体类型不直接等于
 * Epoch 图层——这里提供从 IFC 实体类型到 Epoch 图层的 sensible mapping。
 *
 * 映射依据（IFC4 entity semantics -> Epoch construction layer）：
 * - IfcSite/IfcRoad/IfcPavement/IfcSpace 这类场地与外部要素 -> SITE
 * - IfcSlab(.BASESLAB.)/IfcFooting/IfcPile/IfcBeamStandardCase(.FOUNDATION.)
 *   -> FOUNDATION
 * - IfcColumn/IfcBeam/IfcMember/IfcSlab(.FLOOR.)/IfcWall/IfcWallStandardCase
 *   -> STRUCTURE
 * - IfcWall(. curtain)/IfcCurtainWall/IfcDoor/IfcWindow/IfcRoof/
 *   IfcSlab(.ROOF.) -> ENVELOPE
 * - IfcFlowSegment/IfcFlowFitting/IfcDistributionElement/IfcPipeSegment/
 *   IfcDuctSegment/IfcCableSegment -> MEP
 * - IfcCovering/IfcSpace(. finish)/IfcFurniture/IfcSurfaceFeature -> FINISHES
 *
 * 未覆盖的 IFC 实体类型（如 IfcProject/IfcUnitAssignment/IfcGeometric-
 * RepresentationContext/IfcCartesianPoint 等非构件实体）不映射到任何图层——
 * 这些是 IFC 项目结构/几何/单位，不产出 WorldEntity（见 normalization.ts）。
 */
import type { WorldEntity } from "@zcode/epoch-world-model";

/** Epoch 冻结的六层构造图层（与 epoch-construction-fixture 对齐）。 */
export const IFC_EPOCH_LAYERS = [
  "SITE",
  "FOUNDATION",
  "STRUCTURE",
  "ENVELOPE",
  "MEP",
  "FINISHES",
] as const;

export type IfcEpochLayerId = (typeof IFC_EPOCH_LAYERS)[number];

export const IFC_EPOCH_LAYER_SET: ReadonlySet<string> = new Set<string>(IFC_EPOCH_LAYERS);

export function isIfcEpochLayerId(value: unknown): value is IfcEpochLayerId {
  return typeof value === "string" && IFC_EPOCH_LAYER_SET.has(value);
}

/**
 * IFC 实体类型名（IFC4，如 "IfcWall"、"IfcSlab"）-> Epoch 图层。
 * 返回 undefined 表示该 IFC 实体不映射为 WorldEntity（项目结构/几何/单位等）。
 *
 * 这是 adapter 私有映射——图层作为扩展字段携带在 WorldEntity 上（守卫忽略
 * 未知字段，故 schema 仍合法；layer 不参与世界摘要，属投影/分类数据），
 * 与 W002 fixture 的 layer 扩展字段约定一致。
 */
const IFC_ENTITY_LAYER_MAP: Readonly<Record<string, IfcEpochLayerId>> = {
  // SITE — 场地与外部要素
  IfcSite: "SITE",
  IfcRoad: "SITE",
  IfcPavement: "SITE",
  IfcSurfaceFeature: "FINISHES",
  // FOUNDATION — 基础
  IfcFooting: "FOUNDATION",
  IfcPile: "FOUNDATION",
  // STRUCTURE — 承重结构与楼层
  IfcWall: "STRUCTURE",
  IfcWallStandardCase: "STRUCTURE",
  IfcColumn: "STRUCTURE",
  IfcColumnStandardCase: "STRUCTURE",
  IfcBeam: "STRUCTURE",
  IfcBeamStandardCase: "STRUCTURE",
  IfcMember: "STRUCTURE",
  IfcSlab: "STRUCTURE", // 默认 STRUCTURE；BASESLAB/ROOF 子类在 normalize 时按 PredefinedType 重映射
  // ENVELOPE — 围护（门窗幕墙屋面）
  IfcCurtainWall: "ENVELOPE",
  IfcDoor: "ENVELOPE",
  IfcWindow: "ENVELOPE",
  IfcRoof: "ENVELOPE",
  // MEP — 机电
  IfcPipeSegment: "MEP",
  IfcDuctSegment: "MEP",
  IfcCableSegment: "MEP",
  IfcFlowSegment: "MEP",
  IfcFlowFitting: "MEP",
  IfcDistributionElement: "MEP",
  // FINISHES — 装修
  IfcCovering: "FINISHES",
  IfcFurniture: "FINISHES",
};

/**
 * 按实体类型 + PredefinedType 解析图层。PredefinedType 优先用于消歧
 * （IfcSlab 的 .BASESLAB. -> FOUNDATION，.ROOF. -> ENVELOPE，否则 STRUCTURE）。
 */
export function resolveIfcEpochLayer(
  ifcEntityType: string,
  predefinedType: string | undefined,
): IfcEpochLayerId | undefined {
  if (ifcEntityType === "IfcSlab") {
    const p = predefinedType?.toUpperCase() ?? "";
    if (p.includes("BASESLAB") || p.includes("BASE_SLAB")) return "FOUNDATION";
    if (p.includes("ROOF")) return "ENVELOPE";
    return "STRUCTURE";
  }
  if (ifcEntityType === "IfcWall") {
    const p = predefinedType?.toUpperCase() ?? "";
    if (p.includes("CURTAIN") || p.includes("PARTITIONING")) return "ENVELOPE";
    return "STRUCTURE";
  }
  return IFC_ENTITY_LAYER_MAP[ifcEntityType];
}

/**
 * Epoch 图层的人类可读描述（供呈现层与文档使用，与 W002 fixture 对齐）。
 */
export const IFC_EPOCH_LAYER_DESCRIPTIONS: Readonly<Record<IfcEpochLayerId, string>> = {
  SITE: "Site, access and staging elements",
  FOUNDATION: "Substructure and ground-bearing elements",
  STRUCTURE: "Primary load-bearing frame and slabs",
  ENVELOPE: "Walls, doors, windows and roof enclosure",
  MEP: "Mechanical, electrical and plumbing systems",
  FINISHES: "Applied floor, wall, ceiling and protective finishes",
};

/**
 * 扩展 WorldEntity：在冻结 WorldEntity 之上叠加 Epoch 图层成员关系。
 * layer 是 adapter 私有扩展字段（守卫忽略未知字段，不参与摘要）；与 W002
 * fixture 的 ConstructionFixtureEntity.layer 约定一致——投影/分类数据，
 * 确定性。
 */
export interface IfcWorldEntityExtension extends WorldEntity {
  /** Epoch 图层成员关系（adapter 私有扩展；不参与摘要）。 */
  readonly layer: IfcEpochLayerId;
}
