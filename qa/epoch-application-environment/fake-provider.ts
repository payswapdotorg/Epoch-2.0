/**
 * W028 acceptance harness — shared fake provider / fake session factory.
 *
 * 一个最小、确定性的 fake EnvironmentProvider：用于驱动 EnvironmentSurfaceController
 * 走完 attach/detach/observe/control/semantic/lost/denied 路径，无需真实外部软件。
 *
 * 该 fake 故意把每个 plane 的子能力 + 可用性 + mode 上限 + sensitiveDataNeeds
 * 暴露成构造参数，让每个验收点测试可以构造「刚好够走某条路径」的 provider。
 *
 * 测试用 `node --test` 直接执行 src（Node 24 原生剥离类型），内部导入必须
 * 带 .ts 后缀。本文件路径是 qa/epoch-application-environment/，导入相对根的
 * packages/epoch-application-environment/src/index.ts。
 */
import type {
  AutonomyMode,
  EnvironmentAttachRequest,
  EnvironmentDescriptor,
  EnvironmentHealthSnapshot,
  EnvironmentOperationRequest,
  EnvironmentOperationResult,
  EnvironmentProvider,
  EnvironmentSession,
  PlaneCapabilityDeclaration,
  SensitiveDataPolicy,
} from "../../packages/epoch-application-environment/src/index.ts";
import {
  createEnvironmentRegistry,
  DEFAULT_SENSITIVE_DATA_POLICY,
  type EnvironmentRegistry,
} from "../../packages/epoch-application-environment/src/index.ts";

export interface FakeProviderOptions {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly runtime: "local" | "remote";
  readonly planes: readonly PlaneCapabilityDeclaration[];
  readonly maxAutonomyMode: AutonomyMode;
  readonly adapterSeams: readonly ("screen" | "ui" | "native")[];
  readonly simulation: boolean;
  readonly sensitiveDataNeeds:
    | "default-exclude"
    | "task-scoped"
    | "explicit-allowlist"
    | "full-trust";
  /** 可选：attach 时自定义抛错（模拟 remote host 不可达 / 权限被拒）。 */
  readonly attachBehavior?: (request: EnvironmentAttachRequest) => AttachOutcome;
}

export type AttachOutcome =
  | { readonly kind: "ok"; readonly session: EnvironmentSession }
  | { readonly kind: "throw"; readonly error: Error }
  | { readonly kind: "lost-after-attach"; readonly delayMs: number };

/**
 * 构造一个 fake session：observe/control/semantic 三平面记录调用次数与最近一次
 * payload；detach 幂等；status() 暴露 attach 状态；可选 onLostConnection 通知。
 */
export interface FakeSessionOptions {
  readonly descriptor: EnvironmentDescriptor;
  readonly mode: AutonomyMode;
  readonly sensitiveDataPolicy: SensitiveDataPolicy;
  readonly ownerTaskId: string | null;
  readonly workspaceKey: string;
  readonly sessionId: string;
  /** 可选：observe/control/semantic 返回自定义结果。 */
  readonly observeResult?: (request: EnvironmentOperationRequest) => EnvironmentOperationResult;
  readonly controlResult?: (request: EnvironmentOperationRequest) => EnvironmentOperationResult;
  readonly semanticResult?: (request: EnvironmentOperationRequest) => EnvironmentOperationResult;
  /** 初始 health 快照。默认 attached + ok。 */
  readonly initialHealth?: EnvironmentHealthSnapshot;
}

export interface FakeSession extends EnvironmentSession {
  /** observe 调用次数。 */
  observeCalls: () => number;
  /** control 调用次数。 */
  controlCalls: () => number;
  /** semantic 调用次数。 */
  semanticCalls: () => number;
  /** detach 调用次数。 */
  detachCalls: () => number;
  /** 最近一次 observe 请求（如有）。 */
  lastObserveRequest: () => EnvironmentOperationRequest | null;
  /** 强制把会话置为 lost（用于 lost connection 测试）。 */
  forceLost: (reason?: string) => void;
  /** 强制把会话置为 stale（用于 stale session 测试）。 */
  forceStale: (reason?: string) => void;
  /** 触发 onLostConnection 订阅者（如有）。 */
  emitLost: (snapshot: EnvironmentHealthSnapshot) => void;
}

export function createFakeSession(options: FakeSessionOptions): FakeSession {
  let observeCount = 0;
  let controlCount = 0;
  let semanticCount = 0;
  let detachCount = 0;
  let lastObserve: EnvironmentOperationRequest | null = null;
  let health: EnvironmentHealthSnapshot = options.initialHealth ?? {
    status: "attached",
    health: "ok",
    unavailablePlanes: [],
    reason: null,
  };
  const lostHandlers = new Set<(snapshot: EnvironmentHealthSnapshot) => void>();
  return {
    descriptor: options.descriptor,
    mode: options.mode,
    sensitiveDataPolicy: options.sensitiveDataPolicy,
    ownerTaskId: options.ownerTaskId,
    workspaceKey: options.workspaceKey,
    sessionId: options.sessionId,
    status: () => health,
    async observe(request) {
      observeCount += 1;
      lastObserve = request;
      return (
        options.observeResult?.(request) ?? {
          status: "ok",
          data: { echoed: request.payload },
        }
      );
    },
    async control(request) {
      controlCount += 1;
      return (
        options.controlResult?.(request) ?? {
          status: "ok",
          data: { echoed: request.payload },
        }
      );
    },
    async semantic(request) {
      semanticCount += 1;
      return (
        options.semanticResult?.(request) ?? {
          status: "ok",
          data: { echoed: request.payload },
        }
      );
    },
    async detach() {
      detachCount += 1;
      health = {
        status: "detached",
        health: "unreachable",
        unavailablePlanes: options.descriptor.planes.map((p) => p.plane),
        reason: "detached",
      };
    },
    onLostConnection(handler) {
      lostHandlers.add(handler);
      return () => {
        lostHandlers.delete(handler);
      };
    },
    observeCalls: () => observeCount,
    controlCalls: () => controlCount,
    semanticCalls: () => semanticCount,
    detachCalls: () => detachCount,
    lastObserveRequest: () => lastObserve,
    forceLost: (reason = "lost-connection") => {
      health = {
        status: "lost",
        health: "degraded",
        unavailablePlanes: options.descriptor.planes
          .filter((p) => p.plane !== "observe")
          .map((p) => p.plane),
        reason,
      };
      for (const handler of lostHandlers) {
        handler(health);
      }
    },
    forceStale: (reason = "stale-session") => {
      health = {
        status: "stale",
        health: "degraded",
        unavailablePlanes: [],
        reason,
      };
      for (const handler of lostHandlers) {
        handler(health);
      }
    },
    emitLost: (snapshot) => {
      health = snapshot;
      for (const handler of lostHandlers) {
        handler(snapshot);
      }
    },
  };
}

export function createFakeProvider(options: FakeProviderOptions): EnvironmentProvider & {
  /** 该 provider 被调用 attach 的次数。 */
  attachCalls: () => number;
  /** 最近一次 attach 请求。 */
  lastAttachRequest: () => EnvironmentAttachRequest | null;
  /** 最近一次 attach 产出的 session（用于测试断言）。 */
  lastSession: () => FakeSession | null;
} {
  let attachCount = 0;
  let lastRequest: EnvironmentAttachRequest | null = null;
  let lastProduced: FakeSession | null = null;
  const descriptor: EnvironmentDescriptor = {
    id: options.id,
    name: options.name,
    version: options.version,
    runtime: options.runtime,
    planes: options.planes,
    maxAutonomyMode: options.maxAutonomyMode,
    adapterSeams: options.adapterSeams,
    simulation: options.simulation,
    sensitiveDataNeeds: options.sensitiveDataNeeds,
  };
  return {
    descriptor: () => descriptor,
    async attach(request) {
      attachCount += 1;
      lastRequest = request;
      const behavior = options.attachBehavior;
      if (behavior) {
        const outcome = behavior(request);
        if (outcome.kind === "throw") throw outcome.error;
      }
      const sessionId = `${request.providerId}:${request.workspaceKey}:${request.initiator}:${
        request.ownerTaskId ?? ""
      }`;
      const session = createFakeSession({
        descriptor,
        mode: request.mode,
        sensitiveDataPolicy: request.sensitiveDataPolicy ?? DEFAULT_SENSITIVE_DATA_POLICY,
        ownerTaskId: request.ownerTaskId ?? null,
        workspaceKey: request.workspaceKey,
        sessionId,
      });
      lastProduced = session;
      return session;
    },
    attachCalls: () => attachCount,
    lastAttachRequest: () => lastRequest,
    lastSession: () => lastProduced,
  };
}

/**
 * 一个通用 observe/control/semantic 三平面都齐全的 descriptor，用于多数测试。
 * maxAutonomyMode=full 让 mode 兼容性校验不挡路，由具体测试在 attach 时显式
 * 选 mode 来验证 observe-only 等门控。
 */
export function fullCapabilityDescriptor(
  overrides: Partial<FakeProviderOptions> = {},
): FakeProviderOptions {
  return {
    id: "fake-application",
    name: "Fake Application",
    version: "1.0.0",
    runtime: "local",
    planes: [
      {
        plane: "observe",
        operations: ["list-windows", "read-window", "screenshot"],
        available: true,
      },
      {
        plane: "control",
        operations: ["click", "type", "scroll"],
        available: true,
      },
      {
        plane: "semantic",
        operations: ["bind-entity", "query-relation"],
        available: true,
      },
    ],
    maxAutonomyMode: "full",
    adapterSeams: ["screen", "ui", "native"],
    simulation: false,
    sensitiveDataNeeds: "default-exclude",
    ...overrides,
  };
}

/**
 * 构造一个简单的 EnvironmentSurfaceRuntime（注入 createEnvironmentRegistry + 一组
 * provider）。createSessionId / createTabId 缺省——控制器用默认派生。
 */
export function createRuntimeWith(providers: readonly EnvironmentProvider[]): {
  registry: EnvironmentRegistry;
} {
  const registry = createEnvironmentRegistry();
  for (const p of providers) registry.register(p);
  return { registry };
}

/**
 * 构造一个 OperationRequest，省略每次写 5 个字段。
 */
export function op(
  plane: "observe" | "control" | "semantic",
  operation: string,
  initiator: "human" | "agent" = "agent",
  payload: unknown = {},
  requestId = `req-${Math.random().toString(36).slice(2, 8)}`,
): EnvironmentOperationRequest {
  return { plane, operation, initiator, payload, requestId };
}
