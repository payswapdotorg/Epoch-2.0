# Epoch 更新通道静态 feed 审计 — PASS

- 生成时间: 2026-10-15T08:33:11.701Z
- 目标数: 2（pass=2 / fail=0）

## [PASS] deb — Epoch-3.14.3-linux-amd64.deb

- 路径: `/home/z/Epoch-2.0/packages/desktop/dist/Epoch-3.14.3-linux-amd64.deb`
- SHA-256: `12f4dd48f346ade35a5ada7d24ce125a19c2b619c0612749c8330793a8d7d309`
- flavor 识别（dpkg-deb --info Package）: `epoch`

```yaml
owner: payswapdotorg
repo: Epoch-2.0
provider: github
updaterCacheDirName: '@zcodedesktop-updater'
```

| 检查 | 状态 | 说明 |
| --- | --- | --- |
| artifact-exists | pass | 146920372 字节 sha256=12f4dd48f346ade35a5ada7d24ce125a19c2b619c0612749c8330793a8d7d309 |
| epoch-flavor | pass | deb Package="epoch" |
| resources-dir-present | pass | /tmp/epoch-feed-audit-1Ob6sj/opt/Epoch/resources |
| app-update-present | pass | /tmp/epoch-feed-audit-1Ob6sj/opt/Epoch/resources/app-update.yml |
| feed-provider-github | pass | provider="github" |
| feed-owner-repo | pass | owner=payswapdotorg repo=Epoch-2.0 |
| feed-generic-placeholder | pass | 非 generic provider（github） |
| feed-zcode-endpoint | pass | app-update.yml 无 zcode.z.ai |
| dev-app-update-baked | pass | resources 与 app.asar 均无 dev-app-update.yml |

## [PASS] appimage — Epoch-3.14.3-linux-x86_64.AppImage

- 路径: `/home/z/Epoch-2.0/packages/desktop/dist/Epoch-3.14.3-linux-x86_64.AppImage`
- SHA-256: `3196261af8cb3cbd3581e1989e833baecf7b8857e1e15a9f7df8648b5e0efdf9`
- flavor 识别（squashfs-root/epoch.desktop Name=）: `Epoch`

```yaml
owner: payswapdotorg
repo: Epoch-2.0
provider: github
updaterCacheDirName: '@zcodedesktop-updater'
```

| 检查 | 状态 | 说明 |
| --- | --- | --- |
| artifact-exists | pass | 198097016 字节 sha256=3196261af8cb3cbd3581e1989e833baecf7b8857e1e15a9f7df8648b5e0efdf9 |
| epoch-flavor | pass | desktop entry Name="Epoch" |
| resources-dir-present | pass | /tmp/epoch-feed-audit-aDZ8Nf/squashfs-root/resources |
| app-update-present | pass | /tmp/epoch-feed-audit-aDZ8Nf/squashfs-root/resources/app-update.yml |
| feed-provider-github | pass | provider="github" |
| feed-owner-repo | pass | owner=payswapdotorg repo=Epoch-2.0 |
| feed-generic-placeholder | pass | 非 generic provider（github） |
| feed-zcode-endpoint | pass | app-update.yml 无 zcode.z.ai |
| dev-app-update-baked | pass | resources 与 app.asar 均无 dev-app-update.yml |
