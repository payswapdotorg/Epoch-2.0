/**
 * W036 — main 进程运行时产品身份（epoch / preview / production）。
 *
 * 判定优先级（与 TL 拥有的 scripts/desktop-product-identity.mjs 构建期语义对齐）：
 * 1. 运行时显式 `EPOCH_DESKTOP_IDENTITY=1`（与构建期开关同义，允许在已安装的包上临时切换身份验证）；
 * 2. 构建期烧进 main bundle 的原始身份 define `__ZCODE_PRODUCT_FLAVOR__`
 *    （Epoch 构建由 resolveDesktopProductFlavor 解析为 "epoch"，随产物固化，安装后不再依赖环境变量）；
 * 3. 回落 @zcode/shared 的 `ZCODE_PRODUCT_FLAVOR`（production|preview 两档）。
 *
 * 为什么不能直接用 shared 的 `ZCODE_PRODUCT_FLAVOR`：shared 的 normalize 只认识
 * production|preview 两档，"epoch" 会被归一化掉（Epoch 包 + 生产后端会被折成 production），
 * main 进程必须读原始 define 才能在运行时保留 Epoch 身份。
 *
 * 为什么运行时宽松判定而不是复用 isEpochIdentityRequested：该函数对非 1/0 拼写直接 throw，
 * 构建期严格是防错包；安装后的运行期 throw 会把一个拼错的环境变量变成启动崩溃，得不偿失。
 * 拼写不合法时按未设置处理，与共享层 normalizeZCodeEnv 的 fail-safe 默认值同一思路。
 */
import { ZCODE_PRODUCT_FLAVOR } from "@zcode/shared";

// 与 scripts/desktop-product-identity.mjs 导出的 EPOCH_DESKTOP_IDENTITY_ENV 保持一致；
// 该常量是已提交的稳定接口，值变更时同步这里（scripts/ 不在本工单所有权内，不能直接 import）。
const EPOCH_DESKTOP_IDENTITY_RUNTIME_ENV = "EPOCH_DESKTOP_IDENTITY";

export type DesktopRuntimeProductFlavor = "production" | "preview" | "epoch";

declare const __ZCODE_PRODUCT_FLAVOR__: string;

// dev/单测等未构建环境下 define 不存在；与 shared/src/env.ts 相同的 typeof 守卫，避免 ReferenceError。
function readRawBuildProductFlavor(): string | undefined {
  return typeof __ZCODE_PRODUCT_FLAVOR__ !== "undefined" ? __ZCODE_PRODUCT_FLAVOR__ : undefined;
}

function isRuntimeEpochIdentityRequested(env: NodeJS.ProcessEnv): boolean {
  return env[EPOCH_DESKTOP_IDENTITY_RUNTIME_ENV]?.trim() === "1";
}

export function resolveDesktopRuntimeProductFlavor(
  rawBuildFlavor: string | undefined = readRawBuildProductFlavor(),
  env: NodeJS.ProcessEnv = process.env,
): DesktopRuntimeProductFlavor {
  if (isRuntimeEpochIdentityRequested(env) || rawBuildFlavor === "epoch") {
    return "epoch";
  }
  if (rawBuildFlavor === "production" || rawBuildFlavor === "preview") {
    return rawBuildFlavor;
  }
  return ZCODE_PRODUCT_FLAVOR;
}

export const desktopRuntimeProductFlavor: DesktopRuntimeProductFlavor =
  resolveDesktopRuntimeProductFlavor();

export const isEpochDesktopRuntime: boolean = desktopRuntimeProductFlavor === "epoch";

/**
 * 运行时产品名（用于 native dialog / menu 等直接拼接文案的场景）。
 * 与 desktopRuntimeEnv.runtimeApplicationName 保持同一身份轴，但这里不做
 * dev（"ZCode Dev"）/e2e 覆盖分支——native 文案只需品牌名本身。
 */
export const desktopRuntimeProductName: string = isEpochDesktopRuntime ? "Epoch" : "ZCode";
