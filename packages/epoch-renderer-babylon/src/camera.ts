/**
 * epoch-renderer-babylon 相机与导航数学。
 *
 * 导航语义（frozen renderer-contract NavigationInput）：
 * - orbit：yaw/pitch 增量（deg）——直接作用于 ArcRotateCamera alpha/beta；
 * - pan：屏幕像素增量（CSS px，y 向下）——按当前视距换算世界位移，
 *   拖拽内容跟随指针（相机目标反向移动）；
 * - zoom：factor>1 拉近——radius /= factor；
 * - frame：无 entityIds = 复位到挂载时的 home 视角（reset 能力）；
 *   有 entityIds = 保持当前朝向、框选目标实体；
 * - look-at：设定目标点（可选相机位置）。
 *
 * 全部数学为纯浮点运算：同输入同相机状态 ⇒ 同结果（确定性）。
 */
import { ArcRotateCamera, Matrix, Scene, Vector3 } from "@babylonjs/core";
import type { AbstractEngine } from "@babylonjs/core";
import type { NavigationInput } from "@zcode/epoch-renderer-contract";
import type { SceneMapping } from "./scene-build.ts";

/** 挂载时的 home（复位）视角。 */
export interface CameraHome {
  readonly alpha: number;
  readonly beta: number;
  readonly radius: number;
  readonly target: Vector3;
}

const FIELD_OF_VIEW_RAD = 0.8;
const HOME_ALPHA = -Math.PI / 2;
const HOME_BETA = Math.PI / 3;
const FRAME_MARGIN = 1.15;
const BETA_EPSILON = 0.01;

/** 世界包围球（全部 mesh 的世界 AABB 并集）。 */
export interface WorldBounds {
  readonly center: Vector3;
  readonly radius: number;
}

export function computeWorldBounds(scene: Scene): WorldBounds {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  for (const mesh of scene.meshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    const minimum = box.minimumWorld;
    const maximum = box.maximumWorld;
    if (min === null || max === null) {
      min = minimum.clone();
      max = maximum.clone();
    } else {
      min = Vector3.Minimize(min, minimum);
      max = Vector3.Maximize(max, maximum);
    }
  }
  if (min === null || max === null) return { center: Vector3.Zero(), radius: 10 };
  const center = Vector3.Center(min, max);
  const radius = Vector3.Distance(min, max) / 2;
  return { center, radius: radius > 0 ? radius : 10 };
}

function fitRadiusForSphere(sphereRadius: number, aspect: number): number {
  const verticalHalf = FIELD_OF_VIEW_RAD / 2;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect);
  const limitingHalf = Math.min(verticalHalf, horizontalHalf);
  return (sphereRadius / Math.sin(limitingHalf)) * FRAME_MARGIN;
}

/** 创建会话相机并返回 home 视角（挂载即处于 home）。 */
export function createSessionCamera(
  scene: Scene,
  engine: AbstractEngine,
  bounds: WorldBounds,
): { camera: ArcRotateCamera; home: CameraHome } {
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  const radius = fitRadiusForSphere(bounds.radius, aspect);
  const camera = new ArcRotateCamera("camera", HOME_ALPHA, HOME_BETA, radius, bounds.center, scene);
  camera.fov = FIELD_OF_VIEW_RAD;
  camera.minZ = Math.max(0.01, radius / 1000);
  camera.maxZ = radius * 200;
  camera.lowerRadiusLimit = Math.max(camera.minZ * 10, radius * 0.02);
  camera.upperRadiusLimit = radius * 20;
  camera.inertia = 0;
  camera.panningInertia = 0;
  camera.wheelPrecision = 0;
  return {
    camera,
    home: { alpha: HOME_ALPHA, beta: HOME_BETA, radius, target: bounds.center.clone() },
  };
}

/** 复位到 home 视角（reset）。setTarget 用 clone 模式，避免 Babylon 从
 * position→target 重算 alpha/beta/radius（那会破坏 home 语义）。 */
export function resetCameraToHome(camera: ArcRotateCamera, home: CameraHome): void {
  camera.alpha = home.alpha;
  camera.beta = home.beta;
  camera.radius = home.radius;
  camera.setTarget(home.target.clone(), false, false, true);
}

function boundsOfRecords(
  mapping: SceneMapping,
  presentationIds: readonly string[],
): WorldBounds | null {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  for (const presentationId of presentationIds) {
    const record = mapping.byPresentationId.get(presentationId);
    if (!record) continue;
    for (const mesh of record.meshes) {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      if (min === null || max === null) {
        min = box.minimumWorld.clone();
        max = box.maximumWorld.clone();
      } else {
        min = Vector3.Minimize(min, box.minimumWorld);
        max = Vector3.Maximize(max, box.maximumWorld);
      }
    }
  }
  if (min === null || max === null) return null;
  return {
    center: Vector3.Center(min, max),
    radius: Vector3.Distance(min, max) / 2,
  };
}

/** 保持当前朝向，框选实体集合（无解析结果时返回 false 表示未动作）。 */
export function frameEntities(
  camera: ArcRotateCamera,
  engine: AbstractEngine,
  mapping: SceneMapping,
  entityIds: readonly string[],
): boolean {
  const presentationIds: string[] = [];
  for (const entityId of entityIds) {
    const records = mapping.presentationIdsByEntityId.get(entityId);
    if (records) presentationIds.push(...records);
  }
  if (presentationIds.length === 0) return false;
  const bounds = boundsOfRecords(mapping, presentationIds);
  if (!bounds) return false;
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  // clone 模式：保持当前 alpha/beta/radius，只平移目标（框选不改朝向）。
  camera.setTarget(bounds.center.clone(), false, false, true);
  camera.radius = fitRadiusForSphere(bounds.radius, aspect);
  return true;
}

function panCamera(
  camera: ArcRotateCamera,
  deltaX: number,
  deltaY: number,
  clientHeight: number,
): void {
  const height = clientHeight > 0 ? clientHeight : 1;
  const worldPerPixel = (2 * camera.radius * Math.tan(FIELD_OF_VIEW_RAD / 2)) / height;
  const cameraWorld = Matrix.Invert(camera.getViewMatrix());
  const right = new Vector3(cameraWorld.m[0], cameraWorld.m[4], cameraWorld.m[8]).normalize();
  const up = new Vector3(cameraWorld.m[1], cameraWorld.m[5], cameraWorld.m[9]).normalize();
  const target = camera.getTarget().clone();
  target.subtractInPlace(right.scale((deltaX ?? 0) * worldPerPixel));
  target.addInPlace(up.scale((deltaY ?? 0) * worldPerPixel));
  // clone 模式：平移只移动目标，alpha/beta/radius（即相机朝向与视距）
  // 由 setTarget 的重算路径保持不变——否则 pan 会变成“原地重新瞄准”。
  camera.setTarget(target, false, false, true);
}

/** 导航分发：invalid 输入由调用方（session）先行拒绝，这里假定合法。 */
export function applyNavigation(
  camera: ArcRotateCamera,
  engine: AbstractEngine,
  home: CameraHome,
  mapping: SceneMapping,
  clientHeight: number,
  input: NavigationInput,
): void {
  if (input.kind === "orbit") {
    if (input.deltaYawDeg) camera.alpha += (input.deltaYawDeg * Math.PI) / 180;
    if (input.deltaPitchDeg) {
      const next = camera.beta + (input.deltaPitchDeg * Math.PI) / 180;
      camera.beta = Math.min(Math.PI - BETA_EPSILON, Math.max(BETA_EPSILON, next));
    }
    return;
  }
  if (input.kind === "pan") {
    panCamera(camera, input.deltaX ?? 0, input.deltaY ?? 0, clientHeight);
    return;
  }
  if (input.kind === "zoom") {
    const factor = input.factor && input.factor > 0 ? input.factor : 1;
    camera.radius = camera.radius / factor;
    return;
  }
  if (input.kind === "frame") {
    if (input.entityIds && input.entityIds.length > 0) {
      frameEntities(camera, engine, mapping, input.entityIds);
    } else {
      resetCameraToHome(camera, home);
    }
    return;
  }
  if (input.kind === "look-at") {
    if (input.position)
      camera.setPosition(new Vector3(input.position.x, input.position.y, input.position.z));
    camera.setTarget(new Vector3(input.target.x, input.target.y, input.target.z));
  }
}
