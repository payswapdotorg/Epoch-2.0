/**
 * epoch-world-interaction 标注注册表实现。
 *
 * W007：标注世界锚定（entityId 和/或世界坐标），survives navigation
 * （锚定不变，渲染器只换投影）。invariant #13：标注是投影态，不写回
 * 世界/解权威。
 *
 * 标注 id 稳定："a:" + 递增序号。文本必须非空（守卫拒绝空字符串）。
 */
import type { Vec3 } from "@zcode/epoch-world-presentation";
import type { AnnotationRegistry, WorldAnnotation } from "./contract.ts";

function isVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    typeof candidate.z === "number" &&
    Number.isFinite(candidate.z)
  );
}

export function createAnnotationRegistry(options?: {
  readonly now?: () => number;
}): AnnotationRegistry {
  const now = options?.now ?? (() => Date.now());
  const annotations = new Map<string, WorldAnnotation>();
  let sequence = 0;

  function createNote(
    text: string,
    anchor: { entityId?: string; point?: Vec3 },
  ): WorldAnnotation | null {
    if (typeof text !== "string" || text.length === 0) return null;
    if (anchor.entityId !== undefined && typeof anchor.entityId !== "string") return null;
    if (anchor.point !== undefined && !isVec3(anchor.point)) return null;
    if (anchor.entityId === undefined && anchor.point === undefined) return null;
    sequence += 1;
    const annotationId = `a:${sequence}`;
    const annotation: WorldAnnotation = {
      annotationId,
      kind: "note",
      text,
      ...(anchor.entityId !== undefined ? { entityId: anchor.entityId } : {}),
      ...(anchor.point !== undefined ? { point: anchor.point } : {}),
      createdAt: now(),
    };
    annotations.set(annotationId, annotation);
    return annotation;
  }

  return {
    createNote,
    getById: (id) => annotations.get(id),
    list: () => [...annotations.values()].sort((a, b) => a.createdAt - b.createdAt),
    remove: (id) => annotations.delete(id),
    clear: () => {
      annotations.clear();
      sequence = 0;
    },
  };
}
