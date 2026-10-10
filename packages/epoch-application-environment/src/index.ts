/**
 * @zcode/epoch-application-environment 公共入口。
 *
 * W028 — Application Environment Fabric（provider 中立的环境契约层）：
 * environment descriptor / registry / session lifecycle，分离的
 * observe/control/semantic 三平面，mode + capability 双重门控，
 * sensitive-data 默认排除（验收点 1–7）。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md 与
 * ARCHITECTURE-LOCK 不变量 16/23/24：provider-neutral core；外部应用是带
 * 分隔能力的共享环境；provider 通过 descriptor 注册而非新增 surface 类型。
 *
 * 零运行时依赖；不引入任何 provider/渲染器/UI 实现类型。具体类型与守卫
 * 由 contract.ts 聚合再导出；contract.ts 进一步从 capability/descriptor/
 * status/privacy/session/provider/registry/identity 分文件加载，以遵守
 * architecture-policy.yaml 的 maxContractLines 上限。
 */
export * from "./contract.ts";
export { epochApplicationEnvironmentModule } from "./module.ts";
