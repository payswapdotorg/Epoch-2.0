/**
 * epoch-environment-surface 模块清单：Application Environment Surface 生命周期控制器。
 *
 * 依赖 @zcode/epoch-application-environment 的 provider 中立契约；对外只暴露
 * index.ts。控制器是生命周期权威，provider 中立——通过依赖注入消费注册表
 * 与 provider attach()，不导入任何 provider 实现，不按 providerId 分支。
 */
export const epochEnvironmentSurfaceModule = {
  id: "epoch-environment-surface",
  requires: ["epoch-application-environment"],
  provides: ["environment-surface-lifecycle", "environment-surface-controller"],
  publicEntrypoints: ["index.ts"],
} as const;
