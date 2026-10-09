/**
 * epoch-solution-surface 模块清单：Solution Surface 生命周期控制器（实现模块）。
 *
 * 依赖冻结的 W001 契约（solution-contract + reconstruction-contract）；对外只暴露
 * index.ts。控制器是生命周期权威，引擎中立——通过依赖注入消费引擎注册表与会话工厂，
 * 不导入任何引擎实现，不按 engineId 分支。
 */
export const epochSolutionSurfaceModule = {
  id: "epoch-solution-surface",
  requires: ["epoch-solution-contract", "epoch-reconstruction-contract"],
  provides: ["solution-surface-lifecycle"],
  publicEntrypoints: ["index.ts"],
} as const;
