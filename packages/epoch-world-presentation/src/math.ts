/**
 * epoch-world-presentation 渲染器中立的三维数学载体。
 *
 * Vec3 是 world-presentation 的规范定义（Transform 需要）；renderer 契约
 * 从这里 re-export。四元数旋转让 Babylon/Three 两侧的适配器无需二次换算。
 */

/** 三维向量（右手坐标系，单位与语义世界一致——见 compilation 的编译归一）。 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 单位四元数旋转（w 为实部；归一化由编译/适配器保证）。 */
export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** 有限元变换：平移必填，旋转/缩放缺省为单位变换。 */
export interface Transform {
  readonly translation: Vec3;
  readonly rotation?: Quaternion;
  readonly scale?: Vec3;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Vec3 守卫。 */
export function isVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y) && isFiniteNumber(candidate.z);
}

/** 四元数守卫。 */
export function isQuaternion(value: unknown): value is Quaternion {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.z) &&
    isFiniteNumber(candidate.w)
  );
}

/** 变换守卫：translation 必填；rotation/scale 存在时必须合法。 */
export function isTransform(value: unknown): value is Transform {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isVec3(candidate.translation)) return false;
  if (candidate.rotation !== undefined && !isQuaternion(candidate.rotation)) return false;
  if (candidate.scale !== undefined && !isVec3(candidate.scale)) return false;
  return true;
}
