/**
 * IFC 属性集与数量提取（W009，引擎私有，配合 parser.ts）。
 *
 * web-ifc 0.0.78 怪癖：IfcQuantityLength/Area/Volume 的数值（LengthValue 等）
 * 落在 Formula.value 字符串里，直接数值字段为 type-only 占位；Unit 引用为
 * null。这里取 Formula.value 解析为 number；单位由归一化时项目级
 * IfcUnitAssignment 提供（显式 SI，见 normalization.ts）。
 *
 * 提取路径：IfcRelDefinesByProperties -> IfcPropertySet -> IfcQuantityLength/
 * Area/Volume。按 expressID 索引到构件实体，附加到 rawPropertySets（引擎
 * 私有，不跨契约边界——见 records.ts）。
 */
import type { IfcAPI } from "web-ifc";
import type { IfcRawEntity } from "./records.ts";
import { unwrapRef, unwrapRefList, unwrapString, extractQuantityNumber } from "./values.ts";

/** PSet 缓存项：PSet 名 + quantity 引用列表。 */
interface PSetCacheEntry {
  readonly name: string;
  readonly quantityRefs: readonly number[];
}

/** 数量提取结果：类型 + 名 + 数值。 */
interface QuantityExtraction {
  readonly ifcType: string;
  readonly name: string;
  readonly value: number;
}

/** 数量类型 -> 数值字段名（web-ifc 字段）。 */
const QUANTITY_VALUE_FIELD: Readonly<Record<string, string>> = {
  IfcQuantityLength: "LengthValue",
  IfcQuantityArea: "AreaValue",
  IfcQuantityVolume: "VolumeValue",
};

/**
 * 提取属性集与数量并附加到对应构件实体的 rawPropertySets。
 *
 * - 先扫 IfcRelDefinesByProperties 建立 实体 expressID -> PSet expressIDs 索引。
 * - 再按需懒加载 PSet（名 + HasProperties 引用列表）与 quantity（类型/名/值）。
 * - 把解析出的 quantity 写回 entity.rawPropertySets（重建不可变记录）。
 */
export function extractPropertySets(
  api: IfcAPI,
  modelID: number,
  entityByExpressID: Map<number, IfcRawEntity>,
): void {
  const psetCache = new Map<number, PSetCacheEntry>();
  const entityToPSets = new Map<number, number[]>();

  // 第一遍：建立 实体 -> PSet 索引。
  try {
    const code = api.GetTypeCodeFromName("IFCRELDEFINESBYPROPERTIES");
    const ids = api.GetLineIDsWithType(modelID, code);
    for (let i = 0; i < ids.size(); i += 1) {
      const relID = ids.get(i);
      let line: Record<string, unknown>;
      try {
        line = api.GetLine(modelID, relID, false) as Record<string, unknown>;
      } catch {
        continue;
      }
      const relatedObjects = unwrapRefList(line.RelatedObjects);
      const psetRef = unwrapRef(line.RelatingPropertyDefinition);
      if (psetRef === undefined) continue;
      for (const objID of relatedObjects) {
        if (!entityByExpressID.has(objID)) continue; // 只索引构件实体
        const list = entityToPSets.get(objID) ?? [];
        if (!list.includes(psetRef)) list.push(psetRef);
        entityToPSets.set(objID, list);
      }
    }
  } catch {
    return; // 无 IfcRelDefinesByProperties 时跳过
  }

  // 第二遍：懒加载 PSet 名 + quantity 引用。
  const loadPSet = (psetID: number): PSetCacheEntry | undefined => {
    const cached = psetCache.get(psetID);
    if (cached) return cached;
    let line: Record<string, unknown>;
    try {
      line = api.GetLine(modelID, psetID, false) as Record<string, unknown>;
    } catch {
      return undefined;
    }
    const name = unwrapString(line.Name) ?? `PSet-${psetID}`;
    const refs = unwrapRefList(line.HasProperties);
    const entry: PSetCacheEntry = { name, quantityRefs: refs };
    psetCache.set(psetID, entry);
    return entry;
  };

  // 第三遍：懒加载单个 quantity（类型/名/值）。
  const loadQuantity = (qID: number): QuantityExtraction | undefined => {
    let line: Record<string, unknown>;
    try {
      line = api.GetLine(modelID, qID, false) as Record<string, unknown>;
    } catch {
      return undefined;
    }
    const ifcType = line.constructor?.name ?? "";
    const valueField = QUANTITY_VALUE_FIELD[ifcType];
    if (valueField === undefined) return undefined; // 非 length/area/volume 量跳过
    const name = unwrapString(line.Name) ?? ifcType;
    const num = extractQuantityNumber(line, valueField);
    if (num === undefined) return undefined;
    return { ifcType, name, value: num };
  };

  // 第四遍：把 quantity 附加到对应构件实体的 rawPropertySets（重建不可变记录）。
  for (const [entityID, psetIDs] of entityToPSets) {
    const entity = entityByExpressID.get(entityID);
    if (!entity) continue;
    const propertySets: Record<string, Record<string, unknown>> = {};
    for (const psetID of psetIDs) {
      const pset = loadPSet(psetID);
      if (!pset) continue;
      const props: Record<string, unknown> = {};
      for (const qID of pset.quantityRefs) {
        const q = loadQuantity(qID);
        if (!q) continue;
        props[q.name] = { ifcType: q.ifcType, value: q.value };
      }
      if (Object.keys(props).length > 0) propertySets[pset.name] = props;
    }
    if (Object.keys(propertySets).length > 0) {
      // 重建 raw entity 以附加 propertySets（不可变记录 -> 重建）。
      entityByExpressID.set(entityID, { ...entity, rawPropertySets: propertySets });
    }
  }
}
