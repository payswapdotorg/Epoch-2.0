/**
 * 构建期开关：为真时安装包使用 Preview 身份，而后端环境仍由 `ZCODE_ENV` 单独决定。
 * 典型用法是 `ZCODE_ENV=production ZCODE_PREVIEW_IDENTITY=1`，得到一个连接生产后端、
 * 可与正式版并排安装的 `ZCode Preview`。
 */
export const ZCODE_PREVIEW_IDENTITY_ENV = "ZCODE_PREVIEW_IDENTITY";

/**
 * W036（Epoch Ubuntu 桌面发布）引入的第三身份：Epoch。
 *
 * 依据 spec/work-orders/W036-ubuntu-epoch-desktop-release.md 的产品法：
 * 安装包、窗口标题、desktop entry、可执行名、包名必须以 Epoch 面世；上游 ZCode
 * 仅作为内部技术底座与法定署名保留。身份轴与后端环境轴依然分离——
 * `ZCODE_ENV` 继续单独决定后端环境，Epoch 身份不隐式改写后端选择。
 *
 * 典型用法：`EPOCH_DESKTOP_IDENTITY=1 pnpm bundle -- --linux --x64`，
 * 得到 Epoch-<version>-linux-x64.deb / .AppImage。
 */
export const EPOCH_DESKTOP_IDENTITY_ENV = "EPOCH_DESKTOP_IDENTITY";

const PRODUCTION_IDENTITY = Object.freeze({
  flavor: "production",
  appId: "dev.zcode.app",
  productName: "ZCode",
  linuxExecutableName: "zcode",
  linuxPackageName: "zcode",
  cuaHelperInstallVariant: null,
});

const PREVIEW_IDENTITY = Object.freeze({
  flavor: "preview",
  appId: "dev.zcode.app.preview",
  productName: "ZCode Preview",
  linuxExecutableName: "zcode-preview",
  linuxPackageName: "zcode-preview",
  cuaHelperInstallVariant: "preview",
});

/**
 * Epoch 产品身份（W036）。appId 采用独立反向域名，保证与上游 ZCode 安装可并存、
 * 升级通道互不污染；Linux 可执行名与包名固定为小写 `epoch`（desktop entry 的
 * Icon=epoch 与 /usr/share/icons/hicolor/*/apps/epoch.png 命中规则见
 * electron-builder.config.js 的既有注释）。cuaHelperInstallVariant 沿用正式包
 * 的 null——Epoch 包不与 ZCode 的 helper 安装变体交叉。
 */
const EPOCH_IDENTITY = Object.freeze({
  flavor: "epoch",
  appId: "org.epoch.desktop",
  productName: "Epoch",
  linuxExecutableName: "epoch",
  linuxPackageName: "epoch",
  cuaHelperInstallVariant: null,
});

export const desktopProductIdentities = Object.freeze({
  production: PRODUCTION_IDENTITY,
  preview: PREVIEW_IDENTITY,
  epoch: EPOCH_IDENTITY,
});

function normalizeDesktopZCodeEnv(env) {
  return env.ZCODE_ENV?.trim().toLowerCase() === "production" ? "production" : "test";
}

/**
 * 开关只有一种开启拼写 `1`（`0` / 空 = 关闭），与 CI workflow 规则和 release 门的
 * `$ZCODE_PREVIEW_IDENTITY == "1"` 精确比较保持同一套语义。其它拼写在构建期直接失败，
 * 避免 `true` 之类在 YAML 路由层漏匹配、却在脚本层被当成开启，把 Preview 包打进生产验收目录。
 */
export function isPreviewIdentityRequested(env = process.env) {
  const value = env[ZCODE_PREVIEW_IDENTITY_ENV]?.trim() ?? "";
  if (value === "1") {
    return true;
  }
  if (value === "" || value === "0") {
    return false;
  }
  throw new Error(
    `invalid ${ZCODE_PREVIEW_IDENTITY_ENV}=${env[ZCODE_PREVIEW_IDENTITY_ENV]}; expected 1 or 0`,
  );
}

/**
 * Epoch 开关与 Preview 开关同一套严格拼写（`1` 开 / `0` 或空关 / 其它直接失败），
 * 避免任何 `true`/`yes` 变体在 CI 路由层漏匹配。Epoch 身份优先级最高：
 * 一旦请求 Epoch，即使 `ZCODE_PREVIEW_IDENTITY=1` 也不能把发布包降级回 ZCode 身份
 * （W036 验收法：发布产物绝不能以 ZCode 面世）。
 */
export function isEpochIdentityRequested(env = process.env) {
  const value = env[EPOCH_DESKTOP_IDENTITY_ENV]?.trim() ?? "";
  if (value === "1") {
    return true;
  }
  if (value === "" || value === "0") {
    return false;
  }
  throw new Error(
    `invalid ${EPOCH_DESKTOP_IDENTITY_ENV}=${env[EPOCH_DESKTOP_IDENTITY_ENV]}; expected 1 or 0`,
  );
}

/**
 * 产品身份（flavor）与后端环境（`ZCODE_ENV`）是两个轴：
 * - `ZCODE_ENV=test` 一律是 Preview，测试后端不能顶着正式 `ZCode` 身份覆盖用户的正式安装；
 * - `ZCODE_ENV=production` 默认是正式身份，显式 `ZCODE_PREVIEW_IDENTITY=1` 时改用 Preview 身份。
 * 未知 `ZCODE_ENV` 继续按 test 处理，和共享层 normalizeZCodeEnv 的 fail-safe 默认值一致。
 */
export function resolveDesktopProductFlavor(env = process.env) {
  // Epoch 优先（W036）：请求 Epoch 时不再回落 ZCode production/preview 身份，
  // 后端环境仍由 ZCODE_ENV 单独决定，两轴不合并。
  if (isEpochIdentityRequested(env)) {
    return "epoch";
  }
  if (isPreviewIdentityRequested(env)) {
    return "preview";
  }
  return normalizeDesktopZCodeEnv(env) === "production" ? "production" : "preview";
}

export function resolveDesktopProductIdentity(env = process.env) {
  return desktopProductIdentities[resolveDesktopProductFlavor(env)];
}

/**
 * 产物文件名后缀标记的是后端环境而不是身份：`_TEST` 只出现在测试后端的安装包上。
 * 生产后端的 Preview 包靠 productName（`ZCode Preview-<version>-...`）与正式包区分。
 */
export function resolveDesktopArtifactSuffix(env = process.env) {
  return normalizeDesktopZCodeEnv(env) === "test" ? "_TEST" : "";
}

/**
 * 返回 Windows Shell 使用的 AppUserModelId。
 *
 * 打包态必须复用 electron-builder 的 appId，否则快捷方式里的 AUMID、开始菜单索引
 * 和运行中的 Electron 进程会被 Windows 视为三个不同的应用。开发态继续保留旧身份，
 * 避免本地调试快捷方式和正式/Preview 安装包互相污染。
 */
export function resolveWindowsAppUserModelIdForFlavor(flavor, runtime = { isPackaged: true }) {
  if (runtime.isPackaged === false) {
    return "cn.aminer.zcode";
  }
  const identity = desktopProductIdentities[flavor === "preview" ? "preview" : flavor === "epoch" ? "epoch" : "production"];
  return identity.appId;
}

export function resolveWindowsAppUserModelId(env = process.env, runtime = { isPackaged: true }) {
  return resolveWindowsAppUserModelIdForFlavor(resolveDesktopProductFlavor(env), runtime);
}
