/**
 * epoch-solution-runtime 模块清单：宿主无关 Solution 运行时组合。
 *
 * W007 边界法：消费冻结契约（renderer-contract、world-presentation、
 * solution-contract、world-model），不导入任何引擎/渲染器实现类型。
 * 不按 engineId 分支；不新增 surface 类型（ARCHITECTURE-LOCK #2/#8）。
 * 依赖声明与 architecture-policy.yaml 的 epoch-solution-runtime 条目保持一致。
 */
export const epochSolutionRuntimeModule = {
  id: "epoch-solution-runtime",
  requires: [
    "epoch-renderer-contract",
    "epoch-world-presentation",
    "epoch-solution-contract",
    "epoch-world-model",
  ],
  provides: ["solution-runtime-composition"],
  publicEntrypoints: ["index.ts"],
} as const;
