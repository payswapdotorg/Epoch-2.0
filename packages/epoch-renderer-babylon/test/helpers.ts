/**
 * epoch-renderer-babylon 包内测试共享工具：确定性测试表现 + 扫描拾取。
 *
 * 测试表现为 test-local（不依赖 epoch-construction-fixture——另一 worker
 * 并发拥有的面）。全部几何用内建自描述格式，digest 由 sha256 内容派生。
 */
import { createHash } from "node:crypto";
import type { RendererHit } from "@zcode/epoch-renderer-contract";

export interface TestNodeSpec {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly translation: { readonly x: number; readonly y: number; readonly z: number };
  readonly box?: { readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number };
  readonly layerIds: readonly string[];
  readonly selectable?: boolean;
  readonly focusable?: boolean;
  readonly visibility?: "visible" | "hidden";
}

export function boxRef(sizeX: number, sizeY: number, sizeZ: number): string {
  return JSON.stringify({ sizeX, sizeY, sizeZ });
}

export function buildTestPresentation(
  worldId: string,
  specs: readonly TestNodeSpec[],
): Record<string, unknown> {
  const nodes = specs.map((spec) => ({
    presentationId: spec.presentationId,
    ...(spec.entityId !== undefined ? { entityId: spec.entityId } : {}),
    ...(spec.parentPresentationId !== undefined
      ? { parentPresentationId: spec.parentPresentationId }
      : {}),
    transform: { translation: spec.translation },
    representations: spec.box
      ? [
          {
            representationId: `${spec.presentationId}-rep-0`,
            kind: "mesh",
            format: "epoch.box@1",
            ref: boxRef(spec.box.sizeX, spec.box.sizeY, spec.box.sizeZ),
          },
        ]
      : [],
    visibility: spec.visibility ?? "visible",
    interaction: {
      selectable: spec.selectable ?? true,
      focusable: spec.focusable ?? true,
      layerIds: spec.layerIds,
    },
  }));
  return {
    worldId,
    revisionId: "rev-001",
    digest: createHash("sha256").update(JSON.stringify(nodes)).digest("hex"),
    projectionMode: "3d",
    nodes,
  };
}

/** 扫描虚拟视口，返回每个可点击身份（entityId 优先，否则 presentationId）
 * 的首个命中像素与命中点。 */
export async function scanForEntityHits(
  hitTest: (input: { x: number; y: number }) => Promise<RendererHit | null>,
  viewport: { width: number; height: number },
  step = 4,
): Promise<Map<string, { x: number; y: number; hit: RendererHit }>> {
  const found = new Map<string, { x: number; y: number; hit: RendererHit }>();
  for (let y = 0; y < viewport.height; y += step) {
    for (let x = 0; x < viewport.width; x += step) {
      const hit = await hitTest({ x, y });
      if (!hit) continue;
      const key = hit.entityId ?? hit.presentationId;
      if (!found.has(key)) found.set(key, { x, y, hit });
    }
  }
  return found;
}

/** 断言命中点位于世界 AABB 内（带浮点容差；点击↔实体绑定的几何证明）。 */
export function pointInsideAabb(
  point: { x: number; y: number; z: number },
  aabb: { min: [number, number, number]; max: [number, number, number] },
): boolean {
  const epsilon = 1e-6;
  return (
    point.x >= aabb.min[0] - epsilon &&
    point.x <= aabb.max[0] + epsilon &&
    point.y >= aabb.min[1] - epsilon &&
    point.y <= aabb.max[1] + epsilon &&
    point.z >= aabb.min[2] - epsilon &&
    point.z <= aabb.max[2] + epsilon
  );
}
