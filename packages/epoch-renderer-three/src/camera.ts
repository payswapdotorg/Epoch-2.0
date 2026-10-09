/**
 * epoch-renderer-three 相机与导航数学。
 *
 * 导航语义（frozen renderer-contract NavigationInput）：
 * - orbit：yaw/pitch 增量（deg）——直接作用于球坐标 theta/phi（基于 current
 *   状态增量，与 Babylon ArcRotateCamera alpha/beta += 同语义）；
 * - pan：屏幕像素增量（CSS px，y 向下）——按当前视距换算世界位移，
 *   拖拽内容跟随指针（相机目标反向移动）；
 * - zoom：factor>1 拉近——radius /= factor；
 * - frame：无 entityIds = 复位到挂载时的 home 视角（reset 能力——home 不可变，
 *   不受 navigate 影响）；有 entityIds = 保持当前朝向、框选目标实体；
 * - look-at：设定目标点（可选相机位置）。
 *
 * 状态法则（与 Babylon 对称）：
 * - `home`：挂载时的初始 CameraState 快照，永不突变——frame（无 ids）的
 *   reset 基准。
 * - `current`：当前 CameraState，navigate 后更新——orbit/zoom/pan 的增量
 *   基准。dispose 即消失；不写回表现源，不影响世界身份。
 *
 * 全部数学为纯浮点运算：同输入同相机状态 ⇒ 同结果（确定性）。
 *
 * 相机坐标系：Three.js 右手坐标系，Y 朝上。球坐标：
 *   position.x = target.x + radius * sin(phi) * cos(theta)
 *   position.y = target.y + radius * cos(phi)
 *   position.z = target.z + radius * sin(phi) * sin(theta)
 * 其中 phi 为与 +Y 轴的夹角（polar），theta 为在 XZ 平面内的方位角。
 * home：theta=-PI/2（从 -Z 方向俯瞰）、phi=PI/3（仰角 30°），与 W004
 * Babylon ArcRotateCamera(home alpha=-PI/2, beta=PI/3) 同视角。
 */
import { PerspectiveCamera, Vector3 } from "three";
import type { Group } from "three";
import type { NavigationInput } from "@zcode/epoch-renderer-contract";
import {
  computeBoundsForRecords,
  computeWorldBounds,
  type SceneMapping,
  type WorldAabb,
} from "./scene-build.ts";

const FIELD_OF_VIEW_RAD = 0.8;
const HOME_THETA = -Math.PI / 2;
const HOME_PHI = Math.PI / 3;
const FRAME_MARGIN = 1.15;
const PHI_EPSILON = 0.01;

/** 相机球坐标状态（home 不可变；current 可变）。 */
export interface CameraState {
  readonly theta: number;
  readonly phi: number;
  readonly radius: number;
  readonly target: Vector3;
}

/** 挂载时的 home（复位）视角——不可变快照。 */
export type CameraHome = CameraState;

/** 计算用于框选球半径的视距。 */
function fitRadiusForSphere(sphereRadius: number, aspect: number): number {
  const verticalHalf = FIELD_OF_VIEW_RAD / 2;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect);
  const limitingHalf = Math.min(verticalHalf, horizontalHalf);
  return (sphereRadius / Math.sin(limitingHalf)) * FRAME_MARGIN;
}

/** 球坐标 → 笛卡尔位置（相对 target）。 */
function sphericalToCartesian(
  radius: number,
  theta: number,
  phi: number,
  target: Vector3,
  out: Vector3,
): Vector3 {
  const sinPhi = Math.sin(phi);
  out.set(
    target.x + radius * sinPhi * Math.cos(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * sinPhi * Math.sin(theta),
  );
  return out;
}

/** 从 AABB 推导中心 + 球半径。 */
function boundsToSphere(bounds: WorldAabb): { center: Vector3; radius: number } {
  const center = new Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
  const radius = bounds.min.distanceTo(bounds.max) / 2;
  return { center, radius: radius > 0 ? radius : 10 };
}

/** 把球坐标状态写入 PerspectiveCamera（位置 + 朝向 + 投影/世界矩阵）。 */
function applyCameraState(camera: PerspectiveCamera, state: CameraState): void {
  const position = new Vector3();
  sphericalToCartesian(state.radius, state.theta, state.phi, state.target, position);
  camera.position.copy(position);
  camera.up.set(0, 1, 0);
  camera.lookAt(state.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** 创建会话相机并返回 home 视角（挂载即处于 home）。 */
export function createSessionCamera(
  root: Group,
  viewport: { width: number; height: number },
): { camera: PerspectiveCamera; home: CameraHome } {
  const bounds = computeWorldBounds(root);
  const sphere = boundsToSphere(bounds);
  const aspect = viewport.width / viewport.height;
  const radius = fitRadiusForSphere(sphere.radius, aspect);
  const camera = new PerspectiveCamera(
    (FIELD_OF_VIEW_RAD * 180) / Math.PI,
    aspect,
    Math.max(0.01, radius / 1000),
    radius * 200,
  );
  const home: CameraHome = {
    theta: HOME_THETA,
    phi: HOME_PHI,
    radius,
    target: sphere.center.clone(),
  };
  applyCameraState(camera, home);
  return { camera, home };
}

/** 从相机当前位置反推 theta（相对给定 target）。 */
function thetaFromCamera(camera: PerspectiveCamera, target: Vector3): number {
  const offset = new Vector3().subVectors(camera.position, target);
  return Math.atan2(offset.z, offset.x);
}

/** 从相机当前位置反推 phi（相对给定 target）。 */
function phiFromCamera(camera: PerspectiveCamera, target: Vector3): number {
  const offset = new Vector3().subVectors(camera.position, target);
  const length = offset.length();
  if (length === 0) return HOME_PHI;
  return Math.acos(offset.y / length);
}

/** 保持当前朝向，框选实体集合（无解析结果时返回 null 表示未动作）。 */
function frameEntitiesState(
  camera: PerspectiveCamera,
  mapping: SceneMapping,
  viewport: { width: number; height: number },
  entityIds: readonly string[],
): CameraState | null {
  const presentationIds: string[] = [];
  for (const entityId of entityIds) {
    const records = mapping.presentationIdsByEntityId.get(entityId);
    if (records) presentationIds.push(...records);
  }
  if (presentationIds.length === 0) return null;
  const bounds = computeBoundsForRecords(mapping, presentationIds);
  if (!bounds) return null;
  const sphere = boundsToSphere(bounds);
  const aspect = viewport.width / viewport.height;
  const radius = fitRadiusForSphere(sphere.radius, aspect);
  // 保持当前 theta/phi（朝向不变），只移动 target 与 radius。
  const state: CameraState = {
    theta: thetaFromCamera(camera, sphere.center),
    phi: phiFromCamera(camera, sphere.center),
    radius,
    target: sphere.center.clone(),
  };
  applyCameraState(camera, state);
  return state;
}

function panCamera(
  camera: PerspectiveCamera,
  current: CameraState,
  deltaX: number,
  deltaY: number,
  viewport: { width: number; height: number },
): CameraState {
  const height = viewport.height > 0 ? viewport.height : 1;
  const worldPerPixel = (2 * current.radius * Math.tan(FIELD_OF_VIEW_RAD / 2)) / height;
  // 相机右向与上向（世界空间）—— PerspectiveCamera.matrixWorld 的列 0/1。
  const elements = camera.matrixWorld.elements;
  const right = new Vector3(elements[0], elements[4], elements[8]).normalize();
  const up = new Vector3(elements[1], elements[5], elements[9]).normalize();
  const target = current.target.clone();
  // 拖拽内容跟随指针：相机目标反向移动（屏幕 dx>0 → 内容右移 → target 左移）。
  target.addScaledVector(right, -deltaX * worldPerPixel);
  target.addScaledVector(up, deltaY * worldPerPixel);
  const state: CameraState = {
    theta: current.theta,
    phi: current.phi,
    radius: current.radius,
    target,
  };
  applyCameraState(camera, state);
  return state;
}

/**
 * 导航分发：invalid 输入由调用方（session）先行拒绝，这里假定合法。
 * 返回新的 current 状态（home 不变——reset 时返回 home 副本）。
 */
export function applyNavigation(
  camera: PerspectiveCamera,
  home: CameraHome,
  current: CameraState,
  mapping: SceneMapping,
  viewport: { width: number; height: number },
  input: NavigationInput,
): CameraState {
  if (input.kind === "orbit") {
    const nextTheta = current.theta + ((input.deltaYawDeg ?? 0) * Math.PI) / 180;
    const rawPhi = current.phi + ((input.deltaPitchDeg ?? 0) * Math.PI) / 180;
    const nextPhi = Math.min(Math.PI - PHI_EPSILON, Math.max(PHI_EPSILON, rawPhi));
    const state: CameraState = {
      theta: nextTheta,
      phi: nextPhi,
      radius: current.radius,
      target: current.target.clone(),
    };
    applyCameraState(camera, state);
    return state;
  }
  if (input.kind === "pan") {
    return panCamera(camera, current, input.deltaX ?? 0, input.deltaY ?? 0, viewport);
  }
  if (input.kind === "zoom") {
    const factor = input.factor && input.factor > 0 ? input.factor : 1;
    const state: CameraState = {
      theta: current.theta,
      phi: current.phi,
      radius: current.radius / factor,
      target: current.target.clone(),
    };
    applyCameraState(camera, state);
    return state;
  }
  if (input.kind === "frame") {
    if (input.entityIds && input.entityIds.length > 0) {
      const framed = frameEntitiesState(camera, mapping, viewport, input.entityIds);
      return framed ?? current;
    }
    // reset：回到挂载时的不可变 home（不受 navigate 影响）。
    applyCameraState(camera, home);
    return {
      theta: home.theta,
      phi: home.phi,
      radius: home.radius,
      target: home.target.clone(),
    };
  }
  if (input.kind === "look-at") {
    const target = new Vector3(input.target.x, input.target.y, input.target.z);
    const position = input.position
      ? new Vector3(input.position.x, input.position.y, input.position.z)
      : camera.position.clone();
    camera.position.copy(position);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return {
      theta: thetaFromCamera(camera, target),
      phi: phiFromCamera(camera, target),
      radius: position.distanceTo(target),
      target: target.clone(),
    };
  }
  return current;
}
