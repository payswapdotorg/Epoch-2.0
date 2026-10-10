/**
 * epoch-reconstruction-policy 模块清单：任务条件化重建策略（profiles + sufficiency）。
 * 依赖声明与 architecture-policy.yaml 提议保持一致；对外只暴露 index.ts。
 */
export const epochReconstructionPolicyModule = {
  id: "epoch-reconstruction-policy",
  requires: ["epoch-world-model"],
  provides: [
    "reconstruction-policy-contract",
    "reconstruction-profile-registry",
    "reconstruction-sufficiency",
    "reconstruction-profiles",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
