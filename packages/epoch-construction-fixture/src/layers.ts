/**
 * 构造图层词汇（W002 fixture 六层）。
 *
 * 依据 spec/work-orders/W002：Site / Foundation / Structure / Envelope / MEP /
 * Finishes。每个可见实体携带 layer 成员关系（WorldEntity 冻结契约未提供 layer
 * 字段，此处以扩展字段携带——守卫忽略未知字段，故 schema 仍合法；layer 不参与
 * 摘要，属投影/分类数据，但确定性）。
 */
export const CONSTRUCTION_LAYERS = [
  "SITE",
  "FOUNDATION",
  "STRUCTURE",
  "ENVELOPE",
  "MEP",
  "FINISHES",
] as const;

export type ConstructionLayerId = (typeof CONSTRUCTION_LAYERS)[number];

export const CONSTRUCTION_LAYER_SET: ReadonlySet<string> = new Set<string>(
  CONSTRUCTION_LAYERS,
);

export function isConstructionLayerId(value: unknown): value is ConstructionLayerId {
  return typeof value === "string" && CONSTRUCTION_LAYER_SET.has(value);
}

/** 图层的人类可读描述（供呈现层与文档使用）。 */
export const CONSTRUCTION_LAYER_DESCRIPTIONS: Readonly<Record<ConstructionLayerId, string>> = {
  SITE: "Site, access and staging elements",
  FOUNDATION: "Substructure and ground-bearing elements",
  STRUCTURE: "Primary load-bearing frame and slabs",
  ENVELOPE: "Walls, doors, windows and roof enclosure",
  MEP: "Mechanical, electrical and plumbing systems",
  FINISHES: "Applied floor, wall, ceiling and protective finishes",
};
