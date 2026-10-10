/**
 * desktop-solution-host 公开契约：Desktop 宿主组合根的对外类型面。
 *
 * - 对外仅暴露 DesktopSolutionHost 组件（packages/desktop 的窗口装配层 import 它）；
 *   跨模块不得深引用本目录内部文件。
 * - 宿主组合根消费 W003 SolutionSurfaceController（生命周期权威）+ W002 fixture
 *   引擎 + W004 Babylon 适配器 + W007 runtime/interaction；本契约只冻结宿主对外
 *   形态，不冻结引擎/渲染器实现类型（ARCHITECTURE-LOCK #2/#8）。
 * - 选择解析链（spec/acceptance/interaction.md）：pointer -> renderer.hitTest ->
 *   RendererHit -> entityId -> 语义权威；UI 不得从 mesh 名推断身份。
 */
import type { EntityInspectorData } from "./DesktopSolutionHostTypes";

/** Desktop Solution 宿主组件：零配置挂载即打开参考解（W006 acceptance law）。 */
export declare const DesktopSolutionHost: () => import("react").JSX.Element;

export type { EntityInspectorData };
