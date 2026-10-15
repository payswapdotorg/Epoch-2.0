# W037 更新通道验收总门 — FAIL

- 生成时间：2026-10-15T08:37:23.181Z
- 总体裁决：**FAIL**（pass=2 / fail=3 / skipped=0）

| 检查 | 类型 | 状态 | 摘要 |
| --- | --- | --- | --- |
| feed-audit:deb:Epoch-3.14.3-linux-amd64.deb | feed-audit | pass | 烘烤 feed = GitHub provider payswapdotorg/Epoch-2.0（sha256=12f4dd48f346ade35a5ada7d24ce125a19c2b619c0612749c8330793a8d7d309） |
| feed-audit:appimage:Epoch-3.14.3-linux-x86_64.AppImage | feed-audit | pass | 烘烤 feed = GitHub provider payswapdotorg/Epoch-2.0（sha256=3196261af8cb3cbd3581e1989e833baecf7b8857e1e15a9f7df8648b5e0efdf9） |
| network-assertion:appimage | network-assertion | fail | 2 项失败：epoch-feed-hit（更新尝试应命中 Epoch feed 主机（api.github.com/github.com 资产域）；观察窗内命中 0 次）；manifest-provider-runtime-absent（主进程日志实测：[auto-update] service manifest provider applied —— ZCode manifest provider 被安装（W037-W1 seam 缺陷的运行时证据）） |
| network-assertion:deb | network-assertion | fail | 3 项失败：epoch-feed-hit（更新尝试应命中 Epoch feed 主机（api.github.com/github.com 资产域）；观察窗内命中 0 次）；zero-zcode-update-traffic（更新尝试对 ZCode 端点（zcode.z.ai）命中 1 次（必须为 0））；manifest-provider-runtime-absent（主进程日志实测：[auto-update] service manifest provider applie |
| dev-update-journey | dev-journey | fail | 未通过部分: appJourney: feed-manifest-requested,update-available-surfaced,downloading-progress-observed,ready-staged-on-disk,staged-sha512-match,downloaded-menu-state,feed-file-downloaded,no-zcode-update-traffic |

## 证据 → 验收清单映射

| 验收清单项 | 证据 |
| --- | --- |
| 静态：烘烤 app-update.yml = GitHub provider payswapdotorg/Epoch-2.0 | `/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/update-channel/feed-audit.json`、`/home/z/Epoch-2.0/qa/epoch-ubuntu-release/evidence/update-channel/feed-audit.json` |
| 网络：真实窗口更新检查只命中 Epoch feed；ZCode 更新流量为 0 | ⬜ 无通过证据（预修复构建上为实测 FAIL —— 线上缺陷证据） |
| 旅程：密封 dev 更新流 check→available→downloading→ready(staged) | ⬜ 无通过证据（预修复构建上为实测 FAIL —— W037-W1 seam 证据） |

## 验收法

> No skipped critical desktop journey may be recorded as a passing release (W036 law); pre-fix FAILs are honest evidence of the W037 live defect, never green-washed.
