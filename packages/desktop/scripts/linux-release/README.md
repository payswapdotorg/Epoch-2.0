# Epoch Linux Release 工具集（W036）

`packages/desktop/scripts/linux-release/` 维护 Epoch（Ubuntu 桌面发布，W036）的
Linux x86_64 打包驱动、产物机械校验与安装/启动演练。只复用仓库既有命令
（`pnpm build` / `pnpm bundle` / electron-builder），不引入新的构建入口。

## 文件

| 文件                    | 职责                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `build-linux-release.sh`| 端到端发布驱动：锁定 Epoch 身份 → 根 `pnpm build` → `pnpm bundle`（deb+AppImage）→ 生成 `SHA256SUMS` / `release-manifest.json` → 调校验器 |
| `validate-artifacts.mjs`| 发布前机械校验（dpkg-deb / AppImage 自解压；见脚本头注释的完整检查清单）|
| `install-launch-check.sh`| 非root安装/启动演练（真实 `sudo dpkg -i` 优先，`dpkg-deb -x` 降级；AppImage 用 `--appimage-extract-and-run`）|

## 命令（TL / 发布机执行顺序）

```bash
# 0) 前置：仓库根目录完成 pnpm install；node>=24、pnpm 10.33.2（见根 mise.toml）
# 1) 构建 + 清单 + 机械校验（任一失败即非零退出）
bash packages/desktop/scripts/linux-release/build-linux-release.sh
# 2) 安装/启动演练（普通用户；本机 Xvfb :99 或 xvfb-run 均可）
bash packages/desktop/scripts/linux-release/install-launch-check.sh
# （可选）单独重跑校验
node packages/desktop/scripts/linux-release/validate-artifacts.mjs \
  --dist packages/desktop/dist --arch x64
```

产物目录 `packages/desktop/dist`：

- `Epoch-<version>-linux-x64.deb`
- `Epoch-<version>-linux-x64.AppImage`
- `SHA256SUMS`（`sha256sum -c` 兼容格式）
- `release-manifest.json`（版本/commit/构建机/产物哈希骨架，发布前由 TL 补 tag/URL/验收证据）
- `validation-report.json`、`install-launch-results.json`（机器可读检查结果）

### 构建入口说明（重要）

- 身份：`EPOCH_DESKTOP_IDENTITY=1`（最高优先级）+ `ZCODE_ENV=production`（产物名不带
  `_TEST` 后缀）。两轴语义见 `packages/desktop/scripts/desktop-product-identity.mjs`。
- target 收窄：`ZCODE_LINUX_TARGETS=deb,AppImage`（`electron-builder.config.js` 提供；
  发布 runner 无 rpmbuild 时 rpm target 会直接失败）。默认不设置时仍为全量
  `AppImage,deb,rpm,pacman`，不影响既有 CI。
- `pnpm bundle` 的参数形式只有 `--os linux --arch x64` 或位置参数 `linux x64`；
  **不支持 `--linux --x64` 平台旗标**（`bundle.mjs` 的 parseArgs 会直接报“不支持的参数”）。
  便捷脚本：`pnpm --filter @zcode/desktop run bundle:linux:x64`。

## Desktop entry（deb 安装后 `/usr/share/applications/epoch.desktop`）

由 app-builder-lib `LinuxTargetHelper` 派生（已按 26.8.1 源码核对）：

```ini
[Desktop Entry]
Name=Epoch
Exec=/opt/Epoch/epoch %U
Terminal=false
Type=Application
Icon=epoch
StartupWMClass=Epoch
Comment=Epoch — Construction Engineering Workbench
MimeType=x-scheme-handler/zcode;
Categories=Science;Engineering;
```

- 图标安装为 `/usr/share/icons/hicolor/<size>/apps/epoch.png`（来自
  `packages/desktop/build/icons/<size>x<size>.png`，尺寸由文件名推导），`Icon=epoch`
  与之命中；AppImage 内部（squashfs-root）使用同一 desktop entry 与 `usr/share/icons` 布局。
- `MimeType` 的 `zcode://` 是上游兼容深度链接标识（W036 产品法允许的例外，不做全局改名）。
- `Categories` 必须以 freedesktop 注册主类别开头；`Engineering` 只是附加类别，
  因此 Epoch 使用 `Science;Engineering`。

## deb 元数据（dpkg -I）

| 字段        | 值                                                            |
| ----------- | ------------------------------------------------------------- |
| Package     | `epoch`                                                       |
| Version     | 仓库根 package.json 版本（`${version}` 同源）                 |
| Architecture| `amd64`                                                       |
| Maintainer  | `Epoch Desktop <epoch@users.noreply.github.com>`（出包仓库 payswapdotorg/Epoch-2.0 的 noreply 地址，无真实收件箱） |
| Homepage    | `https://github.com/payswapdotorg/Epoch-2.0`                  |
| Description | `Epoch — Construction Engineering Workbench`                  |
| Depends     | 见下                                                          |

Depends = app-builder-lib 26.8.1 默认集 + 追加项（`deb.fpm: ["-d","libgbm1","-d","libasound2"]`，
因为 `deb.depends` 会整组替换默认集合）：

```
libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils,
libatspi2.0-0, libuuid1, libsecret-1-0, libgbm1, libasound2
```

> 背景：electron-builder 的 deb 默认 Depends 不含 `libgbm1`/`libasound2`，但 Electron
> ELF 实际 DT_NEEDED 这两个库——最小化 Ubuntu 上会“安装成功、启动报
> `libgbm.so.1: cannot open shared object file`”。这与 rpm 侧追加
> `mesa-libgbm`/`alsa-lib` 是同一类修复。24.04 的 t64 重命名由过渡包
> （`libasound2` → `libasound2t64`、`libgtk-3-0` → `libgtk-3-0t64` 等）保持旧名可解析。

## Ubuntu 支持矩阵（x86_64）

| Ubuntu          | glibc | 内核 | 支持情况 |
| --------------- | ----- | ---- | -------- |
| 20.04 LTS       | 2.31  | 5.4  | 支持     |
| 22.04 LTS       | 2.35  | 5.15 | 支持     |
| 24.04 LTS       | 2.39  | 6.8  | 支持（依赖名走 t64 过渡包；deb 附带 electron-builder 的 AppArmor profile 处理非特权 user namespace） |

依据：Electron 41 需要 glibc ≥ 2.28；随包 native 预编译（node-pty `@lydell/*`、
ripgrep 等）把整包 glibc 下限抬到 2.28（见 `electron-builder.config.js` rpm 注释：
Electron 41 主二进制只引用到 2.25）。Ubuntu 20.04（glibc 2.31）是高于该下限的
最老仍在支持的 Ubuntu，故为支持矩阵下限。Debian 12/13 同样满足（本发布机的开发
验证即在 Debian 13 上进行），但官方支持口径以 Ubuntu LTS 为准。

### 所需系统库

- `.deb`：上表 Depends 全部由 dpkg 自动解析安装。
- `.AppImage`：无依赖元数据，需宿主已具备同一组运行库（Ubuntu Desktop 默认满足；
  最小化系统请 `sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6
  libatspi2.0-0 libuuid1 libsecret-1-0 libgbm1 libasound2`）。

## 已知限制

1. **仅 x86_64**：W036 首发只构建 linux x64；arm64 依赖工具链与 native 预编译验证，未在本发布中提供。
2. **AppImage 与 FUSE**：直接双击/执行 AppImage 需要 FUSE（`/dev/fuse`）；
   无 FUSE 环境用官方回退 `./Epoch-<version>-linux-x64.AppImage --appimage-extract-and-run`
   （`install-launch-check.sh` 即采用该方式）。
3. **无头环境**：启动演练需要 X（脚本自动复用 `DISPLAY`、常驻 Xvfb `:99` 或 `xvfb-run`）；
   演练附加 `--disable-gpu` 以适配无 GLX 的 Xvfb。真实桌面不需要该参数。
4. **沙箱**：Electron 沙箱依赖非特权 user namespace；Ubuntu 24.04 的 AppArmor 限制由
   deb 内置 apparmor profile 处理（postinst 安装）。若极端环境仍拒绝，演练脚本会以
   `--no-sandbox` 重试一次并如实记录；正式发布以无 `--no-sandbox` 启动为准。
5. **深度链接 scheme 保持 `zcode://`**：上游兼容标识（W036 允许例外），不是品牌残留。
6. **凭据**：施工世界演示无需任何密钥即可打开；Agent/后端相关能力可能需要 provider
   凭据（发布说明需如实说明）。
7. **自动更新**：Epoch flavor 未接正式更新源（当前 publish 配置是构建期占位），
   本发布不提供自动更新。
