/**
 * epoch-reconstruction-contract 模块清单：重建引擎能力契约。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 */
export const epochReconstructionContractModule = {
  id: "epoch-reconstruction-contract",
  requires: ["epoch-world-model"],
  provides: ["reconstruction-engine-contract", "reconstruction-engine-registry"],
  publicEntrypoints: ["index.ts"],
} as const;
