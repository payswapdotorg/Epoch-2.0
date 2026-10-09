/**
 * IFC 文件解析（W009「IFC ingestion」——引擎私有，使用 web-ifc WASM）。
 *
 * 环境事实（IfcOpenShell reality check，见 W009 报告）：
 * - `python3 -c "import ifcopenshell"` 失败（系统 Python externally-managed）。
 * - web-ifc（WASM，npm-installable）在 Node 中可用：Init() 成功；OpenModel 解析
 *   IFC4；GetAllLines / GetLineIDsWithType / GetLine 取出实体与属性。
 *
 * 选择 web-ifc 作为 sanctioned fallback：纯 JS+WASM，无原生编译、无 Python
 * 进程、无运行时网络——确定性且可复现（声明在 package.json 与 lockfile）。
 * runtime 分类 in-process（WASM 加载进 Node 进程）。
 *
 * 本模块只产出引擎私有 IfcParseResult（records.ts）；归一化为 WorldRevision
 * 在 normalization.ts 进行。原始 IFC 数据不跨契约边界。取值形状解开器在
 * values.ts；属性集与数量提取在 property-sets.ts。
 */
import { createHash } from "node:crypto";
import type { IfcAPI } from "web-ifc";
import type {
  IfcRawEntity,
  IfcRawRelationship,
  IfcParseResult,
  IfcUnitAssignment,
} from "./records.ts";
import { unwrapString, unwrapRef, unwrapRefList, extractQuantityNumber } from "./values.ts";
import { extractPropertySets } from "./property-sets.ts";

export { extractQuantityNumber } from "./values.ts";

/** IFC 构件实体类型名集合（映射为 WorldEntity 的类型，其余跳过）。 */
const BUILDING_ELEMENT_TYPES: ReadonlySet<string> = new Set<string>([
  "IfcSite",
  "IfcRoad",
  "IfcPavement",
  "IfcFooting",
  "IfcPile",
  "IfcWall",
  "IfcWallStandardCase",
  "IfcColumn",
  "IfcColumnStandardCase",
  "IfcBeam",
  "IfcBeamStandardCase",
  "IfcMember",
  "IfcSlab",
  "IfcCurtainWall",
  "IfcDoor",
  "IfcWindow",
  "IfcRoof",
  "IfcPipeSegment",
  "IfcDuctSegment",
  "IfcCableSegment",
  "IfcFlowSegment",
  "IfcFlowFitting",
  "IfcDistributionElement",
  "IfcCovering",
  "IfcFurniture",
]);

/** IFC 关系类型名集合（解析时识别；Epoch kind 映射在 normalization.ts）。 */
const EXTRACTABLE_IFC_RELATION_TYPES: readonly string[] = [
  "IfcRelContainedInSpatialStructure",
  "IfcRelAggregates",
  "IfcRelConnectsElements",
  "IfcRelConnectsStructuralActivity",
  "IfcRelSequence",
];

/** 关系 relating/related 端字段名（随关系类型变化）。 */
const RELATING_FIELDS = [
  "RelatingStructure",
  "RelatingObject",
  "RelatingElement",
  "RelatingProcess",
] as const;
const RELATED_FIELDS = ["RelatedElements", "RelatedObjects", "RelatedElement"] as const;

function extractRelatingId(line: Record<string, unknown>): number | undefined {
  for (const fieldName of RELATING_FIELDS) {
    const value = unwrapRef(line[fieldName]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function extractRelatedIds(line: Record<string, unknown>): readonly number[] {
  for (const fieldName of RELATED_FIELDS) {
    if (fieldName in line) {
      const list = unwrapRefList(line[fieldName]);
      if (list.length > 0) return list;
      const single = unwrapRef(line[fieldName]);
      if (single !== undefined) return [single];
    }
  }
  return [];
}

/** web-ifc IfcAPI 单例（懒加载；进程内复用，避免重复 Init）。 */
let cachedApi: IfcAPI | null = null;

async function getIfcApi(): Promise<IfcAPI> {
  if (cachedApi) return cachedApi;
  const mod = await import("web-ifc");
  const ApiCtor = mod.IfcAPI;
  const api = new ApiCtor();
  await api.Init();
  cachedApi = api;
  return api;
}

/** 计算 IFC 文件内容摘要（sha256，64 位小写 hex；用于 worldId 与溯源）。 */
export function computeIfcContentDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** IFC SI 单位名 + 前缀 -> Epoch 冻结长度单位。 */
function mapLengthUnit(
  siName: string | undefined,
  prefix: string | undefined,
): IfcUnitAssignment["length"] {
  if (siName !== "METRE") return undefined;
  switch (prefix) {
    case undefined:
    case "":
      return "m";
    case "MILLI":
      return "mm";
    case "CENTI":
      return "cm";
    case "KILO":
      return "km";
    default:
      return undefined;
  }
}

function mapAreaUnit(siName: string | undefined): IfcUnitAssignment["area"] {
  return siName === "SQUARE_METRE" ? "m2" : undefined;
}

function mapVolumeUnit(siName: string | undefined): IfcUnitAssignment["volume"] {
  return siName === "CUBIC_METRE" ? "m3" : undefined;
}

/** 从 IfcSIUnit 实体构建单位映射（默认无 -> undefined，归一化时回退 SI 米）。 */
function buildUnitAssignment(api: IfcAPI, modelID: number): IfcUnitAssignment {
  // 可变局部对象（IfcUnitAssignment 的字段是 readonly，构建期用可变视图）。
  const assignment: {
    length: IfcUnitAssignment["length"];
    area: IfcUnitAssignment["area"];
    volume: IfcUnitAssignment["volume"];
  } = { length: undefined, area: undefined, volume: undefined };
  try {
    const code = api.GetTypeCodeFromName("IFCSIUNIT");
    const ids = api.GetLineIDsWithType(modelID, code);
    for (let i = 0; i < ids.size(); i += 1) {
      const id = ids.get(i);
      const line = api.GetLine(modelID, id, false) as Record<string, unknown>;
      const unitType = unwrapString(line.UnitType);
      const name = unwrapString(line.Name);
      const prefix = unwrapString(line.Prefix);
      if (unitType === "LENGTHUNIT") assignment.length = mapLengthUnit(name, prefix);
      else if (unitType === "AREAUNIT") assignment.area = mapAreaUnit(name);
      else if (unitType === "VOLUMEUNIT") assignment.volume = mapVolumeUnit(name);
    }
  } catch {
    // 无 IfcSIUnit 时返回全 undefined；归一化回退 SI 米。
  }
  return { length: assignment.length, area: assignment.area, volume: assignment.volume };
}

/** 提取构件实体的引擎私有记录（GlobalId/PredefinedType/name 等）。 */
function extractBuildingElements(api: IfcAPI, modelID: number): readonly IfcRawEntity[] {
  const entities: IfcRawEntity[] = [];
  const allLines = api.GetAllLines(modelID);
  for (let i = 0; i < allLines.size(); i += 1) {
    const expressID = allLines.get(i);
    let line: Record<string, unknown>;
    try {
      line = api.GetLine(modelID, expressID, false) as Record<string, unknown>;
    } catch {
      continue;
    }
    const ifcType = line.constructor?.name ?? "";
    if (!BUILDING_ELEMENT_TYPES.has(ifcType)) continue;
    entities.push({
      expressID,
      globalId: unwrapString(line.GlobalId) ?? "",
      ifcType,
      predefinedType: unwrapString(line.PredefinedType),
      name: unwrapString(line.Name),
      description: unwrapString(line.Description),
      objectType: unwrapString(line.ObjectType),
      rawPropertySets: {},
    });
  }
  return entities;
}

/** 提取关系实体的引擎私有记录（relating/related 端 expressID）。 */
function extractRelationships(api: IfcAPI, modelID: number): readonly IfcRawRelationship[] {
  const relationships: IfcRawRelationship[] = [];
  for (const ifcType of EXTRACTABLE_IFC_RELATION_TYPES) {
    let code: number;
    try {
      // web-ifc GetTypeCodeFromName 接受大写 STEP 实体名（IFCRELCONNECTSELEMENTS），
      // 非驼峰（IfcRelConnectsElements）。这里转换：去 Ifc 前缀后大写。
      const stepName = ifcType.toUpperCase();
      code = api.GetTypeCodeFromName(stepName);
    } catch {
      continue;
    }
    let ids;
    try {
      ids = api.GetLineIDsWithType(modelID, code);
    } catch {
      continue;
    }
    for (let i = 0; i < ids.size(); i += 1) {
      const expressID = ids.get(i);
      let line: Record<string, unknown>;
      try {
        line = api.GetLine(modelID, expressID, false) as Record<string, unknown>;
      } catch {
        continue;
      }
      relationships.push({
        expressID,
        globalId: unwrapString(line.GlobalId) ?? "",
        ifcType,
        name: unwrapString(line.Name),
        relatingId: extractRelatingId(line),
        relatedIds: extractRelatedIds(line),
      });
    }
  }
  return relationships;
}

/**
 * 解析 IFC 字节为引擎私有 IfcParseResult。
 *
 * - 加载 web-ifc（进程内单例，懒加载）。
 * - OpenModel 后取 schema、构件实体（含 PSet 数量）、关系实体、内容摘要。
 * - CloseModel 释放 web-ifc 端资源（Engine 不持有 modelID；snapshot 返回
 *   的是归一化后的 WorldRevision，引擎私有原始数据在归一化后即丢弃）。
 */
export async function parseIfc(bytes: Uint8Array): Promise<IfcParseResult> {
  const api = await getIfcApi();
  const modelID = api.OpenModel(bytes);
  try {
    const schema = api.GetModelSchema(modelID) ?? "IFC4";
    const rawEntitiesArr = extractBuildingElements(api, modelID);
    const entityByExpressID = new Map<number, IfcRawEntity>(
      rawEntitiesArr.map((entity) => [entity.expressID, entity]),
    );
    extractPropertySets(api, modelID, entityByExpressID);
    const rawEntities = [...entityByExpressID.values()].sort((a, b) => a.expressID - b.expressID);
    const rawRelationships = extractRelationships(api, modelID);
    const contentDigest = computeIfcContentDigest(bytes);
    // 单位映射在归一化时使用；这里探取一次供 normalization.ts 复用。
    buildUnitAssignment(api, modelID);
    return { schema, rawEntities, rawRelationships, contentDigest };
  } finally {
    api.CloseModel(modelID);
  }
}

/** 取单位映射（归一化时使用；与 parseIfc 共享 web-ifc 单例）。 */
export async function readIfcUnitAssignment(bytes: Uint8Array): Promise<IfcUnitAssignment> {
  const api = await getIfcApi();
  const modelID = api.OpenModel(bytes);
  try {
    return buildUnitAssignment(api, modelID);
  } finally {
    api.CloseModel(modelID);
  }
}
