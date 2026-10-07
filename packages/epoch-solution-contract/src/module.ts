/**
 * epoch-solution-contract 模块清单：Solution Surface 契约。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 */
export const epochSolutionContractModule = {
  id: "epoch-solution-contract",
  requires: ["epoch-world-model", "epoch-reconstruction-contract", "epoch-world-presentation"],
  provides: ["solution-surface-contract", "solution-interaction-intents"],
  publicEntrypoints: ["index.ts"],
} as const;
