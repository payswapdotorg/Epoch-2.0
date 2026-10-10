/**
 * epoch-application-environment 注册表（provider 中立）。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「environment
 * descriptors, registry and session lifecycle」与验收点 2：provider 通过
 * descriptor 注册而非新增 workbench surface 类型。
 *
 * EnvironmentRegistry 是纯内存注册表（无副作用、无发现逻辑）；新增 provider
 * 不触碰 surface/控制器代码（验收点 2 的 surface 中立证明）。重复 id 视为
 * 编程错误，后注册覆盖先注册并保持注册顺序不变（幂等重装同实例安全）。
 */
import { isEnvironmentDescriptor } from "./descriptor.ts";
import type { EnvironmentDescriptor } from "./descriptor.ts";
import { isEnvironmentProvider } from "./provider.ts";
import type { EnvironmentProvider } from "./provider.ts";

/** 注册表契约。 */
export interface EnvironmentRegistry {
  /**
   * 注册 provider。结构非法抛 TypeError；descriptor.id 重复视为编程错误，
   * 后注册覆盖先注册并保持注册顺序不变（幂等重装同实例安全）。
   */
  register(provider: EnvironmentProvider): void;
  /** 按 descriptor.id 解析 provider；未知 id 抛错（surface 不静默降级）。 */
  resolve(providerId: string): EnvironmentProvider;
  /** 列出已注册 descriptor（按注册顺序；用于 UI 展示与日志）。 */
  list(): readonly EnvironmentDescriptor[];
  /** 按 descriptor.id 查询 descriptor；未知 id 返回 undefined。 */
  describe(providerId: string): EnvironmentDescriptor | undefined;
}

/** 纯内存注册表工厂。 */
export function createEnvironmentRegistry(): EnvironmentRegistry {
  const providers = new Map<string, EnvironmentProvider>();
  const order: string[] = [];
  return {
    register(provider: EnvironmentProvider): void {
      if (!isEnvironmentProvider(provider)) {
        throw new TypeError("register() expects a well-formed EnvironmentProvider");
      }
      const descriptor = provider.descriptor();
      if (!isEnvironmentDescriptor(descriptor)) {
        throw new TypeError(
          "EnvironmentProvider.descriptor() must return a well-formed EnvironmentDescriptor",
        );
      }
      if (!providers.has(descriptor.id)) order.push(descriptor.id);
      providers.set(descriptor.id, provider);
    },
    resolve(providerId: string): EnvironmentProvider {
      const provider = providers.get(providerId);
      if (provider === undefined) {
        throw new Error(`environment provider not registered: ${providerId}`);
      }
      return provider;
    },
    list(): readonly EnvironmentDescriptor[] {
      return order
        .map((id) => providers.get(id)?.descriptor())
        .filter((d): d is EnvironmentDescriptor => d !== undefined);
    },
    describe(providerId: string): EnvironmentDescriptor | undefined {
      return providers.get(providerId)?.descriptor();
    },
  };
}

/**
 * 校验 attach 时 mode 与 descriptor 兼容：mode rank 不能超过 descriptor
 * 的 maxAutonomyMode rank。surface 在 attach 前调用；不兼容直接抛错
 * （不静默降级到 observe-only——验收点 4 的 mode 是显式声明）。
 */
export function isModeCompatibleWithDescriptor(
  mode: EnvironmentDescriptor["maxAutonomyMode"],
  requestedMode: EnvironmentDescriptor["maxAutonomyMode"],
): boolean {
  // 复用 capability.ts 的 AUTONOMY_MODE_RANK；为避免循环依赖，按值本地复制
  // 一份（不变量改时同步——单元测试会捕获）。
  const RANK: Readonly<Record<string, number>> = {
    "observe-only": 0,
    suggest: 1,
    confirmation: 2,
    "bounded-autonomy": 3,
    full: 4,
  };
  return (RANK[requestedMode] ?? 0) <= (RANK[mode] ?? 0);
}
