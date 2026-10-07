/**
 * epoch-solution-contract 引擎元数据面。
 *
 * 依据 spec/architecture/contracts/solution-surface.md「Engine neutrality」：
 * Surface 可以展示引擎元数据，但不得按引擎实现类型分支。合法形态是
 * registry.get(engineId) + 描述符驱动渲染；非法形态是按 id 硬编码导入
 * 引擎实现。因此引擎元数据 = 重建引擎描述符（引擎注册表是唯一发现路径）。
 */
import type { ReconstructionEngineDescriptor } from "@zcode/epoch-reconstruction-contract";
import { isReconstructionEngineDescriptor } from "@zcode/epoch-reconstruction-contract";

/** Surface 可展示的引擎元数据（即引擎描述符）。 */
export type SolutionEngineMetadata = ReconstructionEngineDescriptor;

/** 元数据守卫（委托描述符守卫）。 */
export function isSolutionEngineMetadata(value: unknown): value is SolutionEngineMetadata {
  return isReconstructionEngineDescriptor(value);
}
