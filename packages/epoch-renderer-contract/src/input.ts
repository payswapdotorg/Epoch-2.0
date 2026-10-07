/**
 * epoch-renderer-contract 输入类型：导航/命中测试/可见性/聚焦。
 *
 * 依据 spec/architecture/contracts/renderer.md「Adapter interface」。
 * 这些输入是渲染器适配器的指令载体：renderer-neutral，只有字符串、
 * 数字与 Vec3——不得出现 Babylon/Three 类或句柄（interaction.md
 * 「Renderer neutrality」）。
 */
import type { Vec3 } from "@zcode/epoch-world-presentation";
import { isVec3 } from "@zcode/epoch-world-presentation";

/** 导航指令（判别联合；角度单位 deg，缩放因子 >0）。 */
export type NavigationInput =
  | {
      readonly kind: "orbit";
      readonly deltaYawDeg?: number;
      readonly deltaPitchDeg?: number;
    }
  | {
      readonly kind: "pan";
      readonly deltaX?: number;
      readonly deltaY?: number;
    }
  | {
      readonly kind: "zoom";
      readonly factor?: number;
    }
  | {
      readonly kind: "frame";
      readonly entityIds?: readonly string[];
    }
  | {
      readonly kind: "look-at";
      readonly target: Vec3;
      readonly position?: Vec3;
    };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFinite(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
  );
}

/** 导航输入守卫。 */
export function isNavigationInput(value: unknown): value is NavigationInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case "orbit":
      return isOptionalFinite(candidate.deltaYawDeg) && isOptionalFinite(candidate.deltaPitchDeg);
    case "pan":
      return isOptionalFinite(candidate.deltaX) && isOptionalFinite(candidate.deltaY);
    case "zoom":
      return isOptionalFinite(candidate.factor);
    case "frame":
      return candidate.entityIds === undefined || isNonEmptyStringArray(candidate.entityIds);
    case "look-at":
      return isVec3(candidate.target) && (candidate.position === undefined || isVec3(candidate.position));
    default:
      return false;
  }
}

/** 命中测试输入：挂载容器坐标系内的 CSS 像素点。 */
export interface HitTestInput {
  readonly x: number;
  readonly y: number;
}

/** 命中测试输入守卫。 */
export function isHitTestInput(value: unknown): value is HitTestInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y);
}

/** 图层可见性输入（作用域为语义图层 id）。 */
export interface VisibilityInput {
  readonly layerId: string;
  readonly visible: boolean;
}

/** 图层可见性输入守卫。 */
export function isVisibilityInput(value: unknown): value is VisibilityInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.layerId === "string" &&
    candidate.layerId.length > 0 &&
    typeof candidate.visible === "boolean"
  );
}

/**
 * 聚焦输入：entityId 与 presentationId 均缺省时表示清除聚焦；
 * 二者同给时以 entityId 为准（语义优先）。
 */
export interface FocusInput {
  readonly entityId?: string;
  readonly presentationId?: string;
}

/** 聚焦输入守卫。 */
export function isFocusInput(value: unknown): value is FocusInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.entityId !== undefined && typeof candidate.entityId !== "string") return false;
  if (
    candidate.presentationId !== undefined &&
    (typeof candidate.presentationId !== "string" || candidate.presentationId.length === 0)
  ) {
    return false;
  }
  return true;
}
