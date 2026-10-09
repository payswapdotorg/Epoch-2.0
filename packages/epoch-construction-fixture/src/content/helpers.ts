/**
 * 内容构建辅助：紧凑的确定性构造器（减少重复字面量，保持内容文件可读）。
 *
 * 全部为纯函数、无副作用、无随机/时间——相同输入恒产生相同输出。
 */
import type { QuantityValue, ProvenanceRef } from "@zcode/epoch-world-model";
import type { GeometrySeed } from "../geometry.ts";

/** 显式单位数量值（SI）。 */
export function q(value: number, unit: QuantityValue["unit"]): QuantityValue {
  return { value, unit };
}

/** 材质（类型 + 可选等级）。 */
export function mat(type: string, grade?: string): { type: string; grade?: string } {
  return grade === undefined ? { type } : { type, grade };
}

/** box 原语种子（尺寸单位米）。 */
export function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotation?: readonly [number, number, number],
): GeometrySeed {
  return { kind: "box", size: [w, h, d], position: [x, y, z], rotation };
}

/** cylinder 原语种子（[半径, 高]，米）。 */
export function cylinder(radius: number, h: number, x: number, y: number, z: number): GeometrySeed {
  return { kind: "cylinder", size: [radius, h], position: [x, y, z] };
}

/** plane 原语种子（[宽, 长]，米；可带旋转表示倾斜面如坡屋顶）。 */
export function plane(
  w: number,
  len: number,
  x: number,
  y: number,
  z: number,
  rotation?: readonly [number, number, number],
): GeometrySeed {
  return { kind: "plane", size: [w, len], position: [x, y, z], rotation };
}

/** line 原语种子（细长盒近似管线/导线走向，[长, 直径]，米）。 */
export function line(
  length: number,
  diameter: number,
  x: number,
  y: number,
  z: number,
  rotation?: readonly [number, number, number],
): GeometrySeed {
  return { kind: "line", size: [length, diameter], position: [x, y, z], rotation };
}

/**
 * 作者（agent）溯源引用：sourceId = agentId，kind = "author"。
 * 实体的 provenance 携带它即建立 agent 引用（W002「at least two agents」）。
 */
export function authorRef(agentId: string): ProvenanceRef {
  return { sourceId: agentId, kind: "author" };
}
