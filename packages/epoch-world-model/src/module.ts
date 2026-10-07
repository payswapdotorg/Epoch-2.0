/**
 * epoch-world-model 模块清单：工程语义世界的最小冻结契约。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 */
export const epochWorldModelModule = {
  id: "epoch-world-model",
  requires: [],
  provides: ["world-model-contract", "world-digest"],
  publicEntrypoints: ["index.ts"],
} as const;
