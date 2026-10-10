/**
 * epoch-environment-surface 身份键：直接复用 application-environment 包
 * 的 environmentSessionIdentityKey（同语义）。本文件提供本地化别名以避免
 * 控制器跨包导入散点。
 */
export {
  environmentSessionIdentityKey as environmentSurfaceIdentityKey,
  type EnvironmentSessionIdentity as EnvironmentSurfaceIdentity,
} from "@zcode/epoch-application-environment";
