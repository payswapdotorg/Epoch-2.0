/**
 * epoch-renderer-three 模块清单：Three.js 交互式渲染器适配器。
 *
 * W008 冻结边界：three（与 @types/three）只允许在本包 src 内导入；
 * 公开入口只暴露冻结契约类型再导出 + 适配器工厂。依赖声明与
 * architecture-policy.yaml 的 epoch-renderer-three 条目保持一致。
 */
export const threeRendererModule = {
  id: "epoch-renderer-three",
  requires: ["epoch-renderer-contract", "epoch-world-presentation"],
  provides: ["renderer-three-adapter"],
  publicEntrypoints: ["index.ts"],
} as const;
