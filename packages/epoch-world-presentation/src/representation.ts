/**
 * epoch-world-presentation 表现引用与投影模式。
 *
 * 依据 spec/architecture/contracts/world-presentation.md：一个节点可以
 * 表现 solid/mesh/point cloud/linework/annotation anchor/plan symbol/
 * section cut/generated proxy；投影模式支持 3D/plan/section-cutaway，
 * 未来 walk/XR 作为开放枚举加入。
 */

/** 表现种类（spec 冻结集合）。 */
export const REPRESENTATION_KINDS = [
  "solid",
  "mesh",
  "point-cloud",
  "linework",
  "annotation-anchor",
  "plan-symbol",
  "section-cut",
  "generated-proxy",
] as const;
export type RepresentationKind = (typeof REPRESENTATION_KINDS)[number];

/** 运行时校验集合。 */
export const REPRESENTATION_KIND_SET: ReadonlySet<string> = new Set<string>(REPRESENTATION_KINDS);

/** 表现种类守卫。 */
export function isRepresentationKind(value: unknown): value is RepresentationKind {
  return typeof value === "string" && REPRESENTATION_KIND_SET.has(value);
}

/**
 * 表现引用：指向一个可被渲染器适配器解析的几何/图元载荷。
 *
 * - representationId：表现身份（节点内唯一）。
 * - kind：表现种类。
 * - format：载荷格式标识（如 "epoch.triangles@1"；由渲染器 fabric 解析）。
 * - ref：载荷的不透明引用（内容寻址/存储键——渲染器不拥有语义）。
 */
export interface RepresentationRef {
  readonly representationId: string;
  readonly kind: RepresentationKind;
  readonly format: string;
  readonly ref: string;
}

/** 表现引用守卫。 */
export function isRepresentationRef(value: unknown): value is RepresentationRef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.representationId !== "string" || candidate.representationId.length === 0) {
    return false;
  }
  if (!isRepresentationKind(candidate.kind)) return false;
  if (typeof candidate.format !== "string" || candidate.format.length === 0) return false;
  if (typeof candidate.ref !== "string" || candidate.ref.length === 0) return false;
  return true;
}

/**
 * 投影模式：开放枚举。已冻结的内置模式为 3d / plan / section-cutaway；
 * 未来模式（walk、XR 等）以任意非空字符串进入，宿主按能力声明裁决，
 * 契约层不做闭合校验（见 spec「future walk/XR modes」）。
 */
export const WORLD_PROJECTION_MODES = ["3d", "plan", "section-cutaway"] as const;
export type KnownWorldProjectionMode = (typeof WORLD_PROJECTION_MODES)[number];
export type WorldProjectionMode = KnownWorldProjectionMode | (string & Record<never, never>);

/** 任意非空字符串都是合法（开放）投影模式。 */
export function isWorldProjectionMode(value: unknown): value is WorldProjectionMode {
  return typeof value === "string" && value.length > 0;
}

/** 是否为已冻结的内置投影模式。 */
export function isKnownWorldProjectionMode(value: unknown): value is KnownWorldProjectionMode {
  return (
    typeof value === "string" && WORLD_PROJECTION_MODES.includes(value as KnownWorldProjectionMode)
  );
}
