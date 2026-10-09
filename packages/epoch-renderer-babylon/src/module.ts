/**
 * epoch-renderer-babylon 模块清单：Babylon.js 交互式渲染器适配器。
 *
 * W004 冻结边界：@babylonjs/core 只允许在本包 src 内导入；公开入口只
 * 暴露冻结契约类型再导出 + 适配器工厂。依赖声明与 architecture-policy.yaml
 * 的 epoch-renderer-babylon 条目保持一致。
 */
export const babylonRendererModule = {
  id: "epoch-renderer-babylon",
  requires: ["epoch-renderer-contract", "epoch-world-presentation"],
  provides: ["renderer-babylon-adapter"],
  publicEntrypoints: ["index.ts"],
} as const;
