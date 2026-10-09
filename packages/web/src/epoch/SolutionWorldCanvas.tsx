/**
 * SolutionWorldCanvas — world-dominant 全幅世界画布（W005 req #3）。
 *
 * 画布是主工作区（full-bleed），fixture 即开即现；导航/选择/图层通过
 * useSolutionWorld 的 renderer-neutral session 编排。画布只承接 pointer/wheel
 * 事件并把它们转成 NavigationInput/HitTestInput——不含任何 Babylon 类型
 * （ARCHITECTURE-LOCK #6：渲染器是可替换适配器）。
 */
import type { SolutionWorldApi } from "./useSolutionWorld.js";

export function SolutionWorldCanvas({ api }: { api: SolutionWorldApi }): React.ReactElement {
  const phase = api.state.phase;
  return (
    <canvas
      ref={api.canvasRef}
      data-epoch-canvas="true"
      data-epoch-phase={phase}
      className="absolute inset-0 size-full touch-none"
      style={{ display: "block", width: "100%", height: "100%", outline: "none" }}
      onPointerDown={api.onPointerDown}
      onPointerMove={api.onPointerMove}
      onPointerUp={api.onPointerUp}
      onPointerCancel={api.onPointerUp}
      onWheel={api.onWheel}
      onContextMenu={api.onContextMenu}
      aria-label="Epoch construction solution world canvas"
      role="img"
    />
  );
}
