/**
 * epoch-world-interaction 测量注册表实现。
 *
 * W007：测量是世界锚定的投影态（invariant #13/#14——不写回世界/解权威，
 * 不成为第二个 BOQ）。from/to 锚定语义实体和/或世界坐标；value 为 SI 单位
 * （米）欧氏距离；displayValue 格式化为 "3.42 m" 形式。
 *
 * 测量 id 稳定：确定性前缀 "m:" + 递增序号；不依赖随机/时间戳（除 createdAt
 * 用于排序，但 id 不含时间戳——投影态可序列化）。
 */
import type { Vec3 } from "@zcode/epoch-world-presentation";
import type { SolutionMeasurementPoint } from "@zcode/epoch-solution-contract";
import type { MeasurementRegistry, WorldMeasurement } from "./contract.ts";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y) && isFiniteNumber(candidate.z);
}

function isMeasurementPoint(value: unknown): value is SolutionMeasurementPoint {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.entityId !== undefined && typeof candidate.entityId !== "string") return false;
  if (candidate.point !== undefined && !isVec3(candidate.point)) return false;
  return candidate.entityId !== undefined || candidate.point !== undefined;
}

/** 解析测量点为世界坐标：优先 worldPoint；否则从坐标映射查实体锚点。 */
function resolvePoint(
  point: SolutionMeasurementPoint,
  entityPoints: ReadonlyMap<string, Vec3>,
): Vec3 | null {
  if (point.point) return point.point;
  if (point.entityId) {
    const resolved = entityPoints.get(point.entityId);
    if (resolved) return resolved;
  }
  return null;
}

/** 欧氏距离（米）。 */
function euclideanDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 格式化为 SI 单位字符串：保留 2 位小数 + 空格 + "m"。 */
function formatSiMeters(value: number): string {
  if (!Number.isFinite(value)) return "— m";
  return `${value.toFixed(2)} m`;
}

/**
 * 创建测量注册表。
 *
 * @param entityPoints 实体 -> 世界坐标映射（由宿主从 fixture geometry 注入；
 *        用于解析只锚定 entityId 的测量点）。可省略——此时测量必须显式给 worldPoint。
 */
export function createMeasurementRegistry(options?: {
  readonly entityPoints?: ReadonlyMap<string, Vec3>;
  readonly now?: () => number;
}): MeasurementRegistry {
  const entityPoints = options?.entityPoints ?? new Map<string, Vec3>();
  const now = options?.now ?? (() => Date.now());
  const measurements = new Map<string, WorldMeasurement>();
  let sequence = 0;

  function createLinear(
    from: SolutionMeasurementPoint,
    to: SolutionMeasurementPoint,
  ): WorldMeasurement {
    if (!isMeasurementPoint(from)) {
      throw new TypeError("epoch-world-interaction: invalid measurement `from` point");
    }
    if (!isMeasurementPoint(to)) {
      throw new TypeError("epoch-world-interaction: invalid measurement `to` point");
    }
    const fromPoint = resolvePoint(from, entityPoints);
    const toPoint = resolvePoint(to, entityPoints);
    const value = fromPoint && toPoint ? euclideanDistance(fromPoint, toPoint) : 0;
    sequence += 1;
    const measurementId = `m:${sequence}`;
    const measurement: WorldMeasurement = {
      measurementId,
      kind: "linear",
      from,
      to,
      value,
      displayValue: formatSiMeters(value),
      createdAt: now(),
    };
    measurements.set(measurementId, measurement);
    return measurement;
  }

  return {
    createLinear,
    getById: (id) => measurements.get(id),
    list: () => [...measurements.values()].sort((a, b) => a.createdAt - b.createdAt),
    remove: (id) => measurements.delete(id),
    clear: () => {
      measurements.clear();
      sequence = 0;
    },
  };
}
