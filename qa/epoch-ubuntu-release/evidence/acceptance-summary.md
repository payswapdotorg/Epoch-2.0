# W036 Ubuntu Epoch Desktop Release — 验收总门：PASS

- 生成时间：2026-10-14T18:43:25.470Z
- 总体裁决：**PASS**（pass=5 / fail=0 / skipped=0）
- 发布就绪（deb+AppImage 均通过审计与真实窗口旅程）：**YES**

## 检查明细

| 检查 | 类型 | 状态 | 摘要 |
| --- | --- | --- | --- |
| brand-audit:deb:Epoch-3.14.3-linux-amd64.deb | brand-audit | pass | 品牌审计通过（sha256=36022eadc04b0fdd3a24871079ae60b4f9fd92ec34128978ad2fce231d2ae68f） |
| brand-audit:appimage:Epoch-3.14.3-linux-x86_64.AppImage | brand-audit | pass | 品牌审计通过（sha256=1984e53a87b791bd46d844e562e917c8502a54be67bab7d150f1c9c4b04df721） |
| journey:appimage | journey | pass | 真实 Electron 窗口旅程通过（10 步；标题=Epoch；electron=41.0.3；sha256=1984e53a87b791bd46d844e562e917c8502a54be67bab7d150f1c9c4b04df721） |
| journey:deb | journey | pass | 真实 Electron 窗口旅程通过（10 步；标题=Epoch；electron=41.0.3；sha256=36022eadc04b0fdd3a24871079ae60b4f9fd92ec34128978ad2fce231d2ae68f） |
| install-launch-check | install-launch | pass | install-launch-check: pass（install-launch-check.sh exit 0）；明细见 install-launch-results.json |

## 证据 → 验收清单映射

| 验收清单项（spec/acceptance） | 本报告证据 |
| --- | --- |
| 真实安装 Electron 旅程通过（Real installed Electron journey passes） | `/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/appimage/manifest.json`、`/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/deb/manifest.json` |
| deb/AppImage 存在、非空、匹配校验和（.deb and .AppImage exist, non-empty, match checksums） | `/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/brand-audit.json`、`/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/brand-audit.json`（SHA-256 已记录在各报告；对 release-manifest 的比对在发布时进行） |
| deb 可装可启、AppImage 可跑（.deb installs+launches; AppImage runs, non-root） | `/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/install-launch-status.json` |
| 干净检出 + 冻结安装、包测试/typecheck/lint/架构检查 | ⬜ 本报告不覆盖（构建管线证据，由 TL 在发布工作流留存） |
| 未内嵌密钥/测试凭据 | ⬜ 本报告不覆盖（发布前由 TL 复核 asar 与产物） |
| GitHub Release 存在、资产可下载、校验和可验、发布说明完整 | ⬜ 发布阶段（D 门），在发布后验证 |
| 下载直链已验证 | ⬜ 发布阶段（D 门），在发布后验证 |

## 验收法

> No skipped critical desktop journey may be recorded as a passing release (spec/acceptance/ubuntu-epoch-desktop-release.md).
