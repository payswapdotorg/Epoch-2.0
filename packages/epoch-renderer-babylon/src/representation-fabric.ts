/**
 * epoch-renderer-babylon 表现解析织构（renderer fabric）。
 *
 * RepresentationRef.ref 对契约是不透明存储键；渲染器适配器负责按 format
 * 解析载荷（world-presentation 契约「由渲染器 fabric 解析」）。W004 内建
 * 自描述格式：ref 直接内联 JSON 载荷（无网络、确定性，测试与 W002 之前的
 * 过渡方案；未来内容寻址存储接入需扩展本织构，见交接说明）。
 *
 * 内建格式（ref 为 JSON 对象文本）：
 * - "epoch.box@1"       { "sizeX": m, "sizeY": m, "sizeZ": m }
 * - "epoch.triangles@1" { "positions": [x,y,z,...], "indices"?: [i,...] }
 * - "epoch.linework@1"  { "points": [x,y,z,...] }
 *
 * 未识别 format → "unsupported"（节点仍进入映射注册表，但不产生几何，
 * 因而不参与拾取）——渲染器绝不猜测语义。
 */
import type { RepresentationRef } from "@zcode/epoch-world-presentation";

/** 解析后的几何载荷（纯数据；Babylon 网格化在 scene-build 完成）。 */
export type ResolvedRepresentation =
  | { readonly kind: "box"; readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number }
  | {
      readonly kind: "triangles";
      readonly positions: readonly number[];
      readonly indices?: readonly number[];
    }
  | { readonly kind: "linework"; readonly points: readonly number[] }
  | { readonly kind: "unsupported"; readonly format: string };

const BOX_FORMAT = "epoch.box@1";
const TRIANGLES_FORMAT = "epoch.triangles@1";
const LINEWORK_FORMAT = "epoch.linework@1";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => isFiniteNumber(item));
}

function isFiniteTripleArray(value: unknown): value is number[] {
  return isFiniteNumberArray(value) && value.length > 0 && value.length % 3 === 0;
}

function isTriangleSoupArray(value: unknown): value is number[] {
  // 非索引三角形汤：每 9 个数一个完整三角形（3 顶点 × xyz）。
  return isFiniteNumberArray(value) && value.length > 0 && value.length % 9 === 0;
}

function parseRefJson(ref: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(ref);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 单个表现引用的解析（纯函数；非法载荷按 "unsupported" 处理）。 */
export function resolveRepresentation(representation: RepresentationRef): ResolvedRepresentation {
  if (representation.format === BOX_FORMAT) {
    const payload = parseRefJson(representation.ref);
    if (payload === null) return { kind: "unsupported", format: representation.format };
    const { sizeX, sizeY, sizeZ } = payload;
    if (!isFiniteNumber(sizeX) || !isFiniteNumber(sizeY) || !isFiniteNumber(sizeZ)) {
      return { kind: "unsupported", format: representation.format };
    }
    return { kind: "box", sizeX, sizeY, sizeZ };
  }
  if (representation.format === TRIANGLES_FORMAT) {
    const payload = parseRefJson(representation.ref);
    if (payload === null) return { kind: "unsupported", format: representation.format };
    const positions = payload.positions;
    if (payload.indices === undefined) {
      // 非索引三角形汤：必须由完整三角形（9 数 = 3 顶点）组成。
      if (!isTriangleSoupArray(positions)) {
        return { kind: "unsupported", format: representation.format };
      }
      return { kind: "triangles", positions };
    }
    const indices = payload.indices;
    if (!isFiniteTripleArray(positions)) {
      return { kind: "unsupported", format: representation.format };
    }
    // 索引必须是非空有限整数组且长度为 3 的倍数（完整三角形）。
    if (!isFiniteNumberArray(indices) || indices.length === 0 || indices.length % 3 !== 0) {
      return { kind: "unsupported", format: representation.format };
    }
    return { kind: "triangles", positions, indices };
  }
  if (representation.format === LINEWORK_FORMAT) {
    const payload = parseRefJson(representation.ref);
    if (payload === null) return { kind: "unsupported", format: representation.format };
    if (!isFiniteTripleArray(payload.points)) {
      return { kind: "unsupported", format: representation.format };
    }
    return { kind: "linework", points: payload.points };
  }
  return { kind: "unsupported", format: representation.format };
}

/** 内建格式清单（供测试与文档对齐）。 */
export const BABYLON_BUILTIN_REPRESENTATION_FORMATS = [
  BOX_FORMAT,
  TRIANGLES_FORMAT,
  LINEWORK_FORMAT,
] as const;
