/**
 * epoch-renderer-contract 模块清单：交互式渲染器适配器契约。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 */
export const epochRendererContractModule = {
  id: "epoch-renderer-contract",
  requires: ["epoch-world-presentation", "epoch-world-model"],
  provides: ["renderer-contract"],
  publicEntrypoints: ["index.ts"],
} as const;
