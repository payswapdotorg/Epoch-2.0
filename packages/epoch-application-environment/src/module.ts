/**
 * epoch-application-environment 模块清单：provider 中立的环境契约层。
 *
 * 依赖声明与 architecture-policy.yaml 提议保持一致；对外只暴露 index.ts。
 * 零运行时依赖；不引入任何 provider/渲染器/UI 实现类型。
 */
export const epochApplicationEnvironmentModule = {
  id: "epoch-application-environment",
  requires: [],
  provides: [
    "environment-descriptor",
    "environment-registry",
    "environment-session-contract",
    "environment-capability-planes",
    "environment-privacy-policy",
  ],
  publicEntrypoints: ["index.ts"],
} as const;
