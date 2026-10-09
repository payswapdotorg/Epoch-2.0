/**
 * 渲染器中立的几何种子（W002「Renderer-neutral geometry」）。
 *
 * 几何作为「数据」携带：box/cylinder/plane 参数 + 位置/旋转变换，全部为纯
 * 数值（米），绝不携带 mesh / scene-node / 引擎对象（依据 world-model 契约
 * 「No mesh semantics」）。这是投影种子而非语义身份；不参与世界摘要（摘要只
 * 覆盖冻结契约的规范字段），但确定性——相同输入恒产生相同种子。
 */
import type { ConstructionLayerId } from "./layers.ts";
import type { WorldEntity } from "@zcode/epoch-world-model";

/** 几何种类（渲染器据此决定参数化原语，而非从 mesh 名推断语义）。 */
export type GeometryKind = "box" | "cylinder" | "plane" | "line" | "point";

/** 参数化几何种子：渲染器中立的原语 + 变换。 */
export interface GeometrySeed {
  readonly kind: GeometryKind;
  /** 原语尺寸（米），含义随 kind：box->[w,h,d]；cylinder->[radius,height]；plane->[w,d]。 */
  readonly size: readonly number[];
  /** 世界坐标位置 [x,y,z]（米）。 */
  readonly position: readonly [number, number, number];
  /** 旋转（度），按 [rx,ry,rz]；省略表示无旋转。 */
  readonly rotation?: readonly [number, number, number];
}

function isNumberArray(value: unknown, min: number): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isPosition(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFinite);
}

export function isGeometrySeed(value: unknown): value is GeometrySeed {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.kind !== "string" ||
    !["box", "cylinder", "plane", "line", "point"].includes(candidate.kind)
  ) {
    return false;
  }
  if (!isNumberArray(candidate.size, 1)) return false;
  if (!isPosition(candidate.position)) return false;
  if (candidate.rotation !== undefined && !isPosition(candidate.rotation)) return false;
  return true;
}

/** 构造 fixture 扩展实体：在冻结 WorldEntity 之上叠加 layer 与几何种子。 */
export interface ConstructionFixtureEntity extends WorldEntity {
  /** 图层成员关系（每实体必填；扩展字段，守卫忽略，不参与摘要）。 */
  readonly layer: ConstructionLayerId;
  /** 渲染器中立几何种子（数据，非 mesh 对象；扩展字段，不参与摘要）。 */
  readonly geometry: GeometrySeed;
}
