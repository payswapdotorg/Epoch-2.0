/**
 * epoch-application-environment provider 契约：attach() 工厂。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「environment
 * descriptors, registry and session lifecycle」与验收点 2：provider 通过
 * descriptor 注册；不为新 provider 引入新 surface 类型。
 *
 * EnvironmentProvider 是 provider 实现的接口；它返回 descriptor + attach()
 * 工厂。EnvironmentRegistry.register(provider) 把一个 provider 加入注册表；
 * surface 通过 registry.resolve(providerId) 取 provider，再 provider.attach()
 * 产出 EnvironmentSession。
 */
import type { EnvironmentAttachRequest } from "./descriptor.ts";
import type { EnvironmentDescriptor } from "./descriptor.ts";
import type { EnvironmentSession } from "./session.ts";

/**
 * EnvironmentProvider：provider 实现此接口。
 *
 * - descriptor()：返回该 provider 的能力声明卡（id 唯一；surface 不按 id 分支）。
 * - attach(request)：经 surface 校验后的 attach 调用；provider 产出
 *   EnvironmentSession。provider 在 attach 内部校验 request（例如 remote host
 *   可达性、敏感数据策略满足度）；拒绝时抛错（surface 把异常映射为 attach
 *   failure，不静默降级——验收点 1 simulation 必须显式）。
 */
export interface EnvironmentProvider {
  descriptor(): EnvironmentDescriptor;
  attach(request: EnvironmentAttachRequest): Promise<EnvironmentSession>;
}

export function isEnvironmentProvider(value: unknown): value is EnvironmentProvider {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.descriptor !== "function") return false;
  if (typeof candidate.attach !== "function") return false;
  return true;
}
