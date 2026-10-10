/**
 * epoch-application-environment 能力平面与自治模式。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md 与
 * ARCHITECTURE-LOCK 不变量 23/24（外部应用是带分隔能力的共享环境；provider
 * 通过 descriptor 注册而非新增 surface 类型）：
 *
 * - CapabilityPlane：观察/控制/语义三者分离的能力平面。一个 provider 可声明
 *   它支持哪些平面及该平面下的子能力——但平面之间不互相隐式授予（不变量 23）。
 * - AutonomyMode：observe-only / suggest / confirmation / bounded-autonomy /
 *   full。观察权限永不隐式授予控制（验收点 4）。
 *
 * 只导出类型 + 常量 + 守卫；零运行时依赖；不引入任何 provider 实现类型。
 */

/** 能力平面：观察、控制、语义三者严格分离。 */
export type CapabilityPlane = "observe" | "control" | "semantic";

export const CAPABILITY_PLANES: readonly CapabilityPlane[] = ["observe", "control", "semantic"];
export const CAPABILITY_PLANE_SET: ReadonlySet<CapabilityPlane> = new Set(CAPABILITY_PLANES);

export function isCapabilityPlane(value: unknown): value is CapabilityPlane {
  return typeof value === "string" && CAPABILITY_PLANE_SET.has(value as CapabilityPlane);
}

/**
 * 自治模式——agent 在该环境会话中允许的执行边界。
 *
 * observe-only：仅观察，不能发起任何控制/语义操作。
 * suggest：agent 可提议操作，但执行必须由人类确认；agent 不直接调用 control plane。
 * confirmation：agent 可发起控制操作，但每条都需人类确认；agent 不能跳过确认。
 * bounded-autonomy：agent 在声明的有界操作集合内自主执行；超界操作仍需确认。
 * full：完全自主。仅在被显式授权且 capabilities 授予后才生效。
 *
 * 验收点 4：read/observe 权限永不隐式授予 mutation——observe-only 模式下控制
 * 平面被显式拒绝，不因 capability 标志位而被旁路。
 */
export type AutonomyMode =
  | "observe-only"
  | "suggest"
  | "confirmation"
  | "bounded-autonomy"
  | "full";

export const AUTONOMY_MODES: readonly AutonomyMode[] = [
  "observe-only",
  "suggest",
  "confirmation",
  "bounded-autonomy",
  "full",
];
export const AUTONOMY_MODE_SET: ReadonlySet<AutonomyMode> = new Set(AUTONOMY_MODES);

export function isAutonomyMode(value: unknown): value is AutonomyMode {
  return typeof value === "string" && AUTONOMY_MODE_SET.has(value as AutonomyMode);
}

/**
 * 自治模式等级（用于「mode 不可旁路 capability」的检查：mode 隐含的最低 capability
 * 集必须存在；反之 mode 未授予时 capability 也不被允许调用）。值越大权限越宽。
 */
export const AUTONOMY_MODE_RANK: Readonly<Record<AutonomyMode, number>> = {
  "observe-only": 0,
  suggest: 1,
  confirmation: 2,
  "bounded-autonomy": 3,
  full: 4,
};

/** observe-only 模式永远不允许调用 control/semantic 平面（验收点 4 强制）。 */
export function modeAllowsPlane(mode: AutonomyMode, plane: CapabilityPlane): boolean {
  if (plane === "observe") return true;
  if (mode === "observe-only") return false;
  // suggest 模式：agent 可提议，但仍不直接调用 control 平面——只有 confirmation
  // 及以上才允许 control 平面被 agent 直接调用。suggest 模式下 control/semantic
  // 调用必须由人类发起（initiator = "human"，验收点 3）。
  if (mode === "suggest") return false;
  return true;
}

/**
 * Adapter seam：provider 实现与 surface/contract 之间的能力映射。
 *
 * screen / ui / native 是 adapter 的不同 seam——它们是 truthful capability levels
 * （provider 必须如实声明；不能宣称 screen 但实际只能给 ui）。surface 不假定任何
 * seam 默认值——任何缺失都视为「该 provider 不提供该 seam」。
 */
export type AdapterSeam = "screen" | "ui" | "native";

export const ADAPTER_SEAMS: readonly AdapterSeam[] = ["screen", "ui", "native"];
export const ADAPTER_SEAM_SET: ReadonlySet<AdapterSeam> = new Set(ADAPTER_SEAMS);

export function isAdapterSeam(value: unknown): value is AdapterSeam {
  return typeof value === "string" && ADAPTER_SEAM_SET.has(value as AdapterSeam);
}

/**
 * 一个平面的能力声明——provider 如实声明它在哪个平面提供哪些子能力。
 *
 * `available`：是否实际可用。`false` 表示「provider 知道这个能力存在但当前
 * 不可用」（source-gap / unsupported-signal / 远端 host 离线）。surface 不静默
 * 提升 available=false 为 available=true（验收点 7：denied/lost 必须显式状态）。
 */
export interface PlaneCapabilityDeclaration {
  readonly plane: CapabilityPlane;
  /** 该平面下 provider 实际能调用的子能力名称（provider 自己命名，truthful）。 */
  readonly operations: readonly string[];
  /** false 表示该平面当前不可用（远端离线/权限被拒/源 gap）；默认 true。 */
  readonly available: boolean;
}

export function isPlaneCapabilityDeclaration(value: unknown): value is PlaneCapabilityDeclaration {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isCapabilityPlane(candidate.plane)) return false;
  if (!Array.isArray(candidate.operations)) return false;
  if (!candidate.operations.every((op) => typeof op === "string" && op.length > 0)) return false;
  if (typeof candidate.available !== "boolean") return false;
  return true;
}
