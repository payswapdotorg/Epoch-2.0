/**
 * epoch-world-model 溯源引用。
 *
 * 依据 spec/architecture/contracts/world-model.md「Provenance」：非 fixture 的
 * 重建来源必须可追溯到来源工件/引擎/版本（如可用）。溯源参与世界摘要的
 * 规范内容，因此这里不携带时间戳等非语义字段。
 */

/** 溯源来源类型（与 ReconstructionInput 的输入分类对应）。 */
export const PROVENANCE_KINDS = [
  "fixture",
  "file",
  "workspace-artifact",
  "remote-resource",
  "engine",
  "author",
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

/** 运行时校验集合。 */
export const PROVENANCE_KIND_SET: ReadonlySet<string> = new Set<string>(PROVENANCE_KINDS);

/** 溯源类型守卫。 */
export function isProvenanceKind(value: unknown): value is ProvenanceKind {
  return typeof value === "string" && PROVENANCE_KIND_SET.has(value);
}

/**
 * 溯源引用：指向一个语义内容的来源。
 *
 * - sourceId：来源标识（fixture id / 文件路径 / 工件 id / 远端 uri / 引擎 id / 作者 id）。
 * - artifact：来源工件的可寻址引用（路径、内容寻址等，如可用）。
 * - engineId / engineVersion：产生该内容的引擎与版本（如可用）。
 * - digest：来源工件的内容摘要（如可用）。
 */
export interface ProvenanceRef {
  readonly sourceId: string;
  readonly kind: ProvenanceKind;
  readonly artifact?: string;
  readonly engineId?: string;
  readonly engineVersion?: string;
  readonly digest?: string;
}

/** 溯源引用守卫：必填 sourceId/kind 合法，可选字段类型正确。 */
export function isProvenanceRef(value: unknown): value is ProvenanceRef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.sourceId !== "string" || candidate.sourceId.length === 0) return false;
  if (!isProvenanceKind(candidate.kind)) return false;
  if (candidate.artifact !== undefined && typeof candidate.artifact !== "string") return false;
  if (candidate.engineId !== undefined && typeof candidate.engineId !== "string") return false;
  if (candidate.engineVersion !== undefined && typeof candidate.engineVersion !== "string") {
    return false;
  }
  if (candidate.digest !== undefined && typeof candidate.digest !== "string") return false;
  return true;
}
