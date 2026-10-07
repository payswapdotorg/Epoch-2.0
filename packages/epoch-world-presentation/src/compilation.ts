/**
 * epoch-world-presentation 表现编译类型。
 *
 * 依据 spec/architecture/contracts/world-presentation.md「Compilation」：
 * WorldRevision -> 规范表现编译 -> WorldPresentation -> 渲染器适配器。
 * 渲染器不得修改规范表现源（W001 冻结类型；编译器实现属 W002/W007）。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type { WorldPresentationNode } from "./presentation-node.ts";
import { isWorldPresentationNode } from "./presentation-node.ts";
import type { WorldProjectionMode } from "./representation.ts";
import { isWorldProjectionMode } from "./representation.ts";

/**
 * 世界表现：某次世界修订在某投影模式下的渲染器中立投影。
 * worldId/revisionId/digest 回指语义来源——渲染器切换不得改变语义身份。
 */
export interface WorldPresentation {
  readonly worldId: string;
  readonly revisionId: string;
  readonly digest: string;
  readonly projectionMode: WorldProjectionMode;
  readonly nodes: readonly WorldPresentationNode[];
}

/** 表现守卫。 */
export function isWorldPresentation(value: unknown): value is WorldPresentation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.worldId !== "string" || candidate.worldId.length === 0) return false;
  if (typeof candidate.revisionId !== "string" || candidate.revisionId.length === 0) return false;
  if (typeof candidate.digest !== "string" || candidate.digest.length === 0) return false;
  if (!isWorldProjectionMode(candidate.projectionMode)) return false;
  if (!Array.isArray(candidate.nodes)) return false;
  if (!candidate.nodes.every((node) => isWorldPresentationNode(node))) return false;
  return true;
}

/** 编译选项：目标投影模式（缺省 3d）。 */
export interface PresentationCompileOptions {
  readonly projectionMode?: WorldProjectionMode;
}

/**
 * 表现编译器：把语义修订投影为渲染器中立表现。
 * 返回 Promise：大体量世界的几何归一化可能异步；编译必须确定性
 * （同修订+同种子+同模式 => 同表现）。
 */
export interface PresentationCompiler {
  compile(revision: WorldRevision, options?: PresentationCompileOptions): Promise<WorldPresentation>;
}
