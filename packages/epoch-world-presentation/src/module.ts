/**
 * epoch-world-presentation 模块清单：渲染器中立的表现投影契约。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 index.ts。
 */
export const epochWorldPresentationModule = {
  id: "epoch-world-presentation",
  requires: ["epoch-world-model"],
  provides: ["world-presentation-contract", "portable-renderer-state"],
  publicEntrypoints: ["index.ts"],
} as const;
