/**
 * epoch-desktop-journey 公开契约：旅程跑批的对外形态（脚本契约，非运行时 API）。
 *
 * - `node qa/epoch-desktop/journey.mjs` — W006 验收旅程：以 playwright-core
 *   `_electron` 启动真实 Electron 窗口，依次证明 open/world/navigate/select/
 *   inspect/layers，截图写 qa/epoch-desktop/evidence/01..06*.png + manifest.json。
 * - `node qa/epoch-desktop/w007-journey.mjs` — W007 验收旅程：同一 harness 扩展，
 *   追加 inspect-with-projection / layer-isolate / plan-section / measure-annotate，
 *   截图写 qa/epoch-desktop/evidence/w007/。
 * - 退出码：0 = 全部步骤完成且产物已写盘；非 0 = 旅程失败或被跳过（环境缺
 *   Electron/显示时以非 0 退出并写明原因）。
 * - 产物契约：manifest.json 记录每步的 testid 断言、截图路径与时间戳；截图是
 *   验收证据（visualization-first），不是装饰。
 */
export interface JourneyManifestEntry {
  readonly step: string;
  readonly screenshot: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface JourneyManifest {
  readonly journey: "w006" | "w007";
  readonly entries: readonly JourneyManifestEntry[];
  readonly generatedAt: string;
}
