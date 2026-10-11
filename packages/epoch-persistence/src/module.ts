/**
 * epoch-persistence 模块清单。
 *
 * 依据 spec/work-orders/W021-durable-persistence.md 与 ARCHITECTURE-LOCK
 * #4（世界模型是唯一语义权威——本包原样存取权威修订，不派生不合并不修复）、
 * #14（一个职责一个权威——store 是唯一持久记录，缓存非权威）、
 * #17（确定性——内容寻址、无时间戳载荷、同修订同字节）。
 *
 * 消费冻结契约的公开入口（不深引用）：epoch-world-model（WorldRevision/
 * 摘要权威）、epoch-solution-contract（W003 tab 身份投影）。不导入任何
 * 引擎/渲染器实现类型；provider-neutral 端口允许外部 DB 适配器后续接入。
 * 依赖声明与 architecture-policy.yaml 的 epoch-persistence 条目保持一致。
 */
export const epochPersistenceModule = {
  id: "epoch-persistence",
  requires: ["epoch-world-model", "epoch-solution-contract"],
  provides: ["durable-world-store", "surface-identity-continuity"],
  publicEntrypoints: ["index.ts"],
} as const;
