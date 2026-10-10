/**
 * epoch-desktop-journey 模块清单：Desktop 宿主的真实窗口旅程证据跑批。
 *
 * 依据 spec/work-orders/W006 + W007 acceptance law：open -> world -> navigate ->
 * select -> inspect(含投影) -> isolate -> section/plan -> measure/annotate 必须在
 * 真实 Electron 窗口中成立，并按编号截图 + manifest.json 落盘到 evidence/。
 *
 * 运行方式（仓库根）：`node qa/epoch-desktop/journey.mjs`（W006 旅程）与
 * `node qa/epoch-desktop/w007-journey.mjs`（W007 全项旅程）。
 * 本模块是证据跑批（.mjs 脚本 + 截图产物），不导出运行时 API。
 */
export const epochDesktopJourneyModule = {
  id: "epoch-desktop-journey",
  requires: ["desktop-solution-host"],
  provides: ["desktop-journey-evidence"],
  publicEntrypoints: ["journey.mjs", "w007-journey.mjs"],
} as const;
