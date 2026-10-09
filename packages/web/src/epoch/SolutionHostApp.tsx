/**
 * SolutionHostApp — Web 端 Solution 宿主顶层（W005 req #1/#3）。
 *
 * World-dominant 布局（ARCHITECTURE-LOCK #3）：画布全幅占据主工作区，fixture
 * 即开即现；导航/选择/图层控制悬浮在画布之上。绝不以 dashboard/空状态/占位
 * 替代世界。
 *
 * 工位面入口（req #1）：宿主以 W003 SolutionSurfaceController（生命周期权威）
 * 打开参考解，暴露与 Browser/Terminal 同级的 Solution surface（不新增 surface
 * 类型）。组合根在 useSolutionWorld 内构造，零用户配置（req #2）。
 */
import { useSolutionWorld } from "./useSolutionWorld.js";
import { useSolutionRuntime } from "./useSolutionRuntime.js";
import { SolutionWorldCanvas } from "./SolutionWorldCanvas.js";
import { SolutionInspector } from "./SolutionInspector.js";
import { SolutionLayerControls } from "./SolutionLayerControls.js";
import { SolutionToolsOverlay } from "./SolutionToolsOverlay.js";
import { SolutionDownstreamProjection } from "./SolutionDownstreamProjection.js";

function TopBar({ api }: { api: ReturnType<typeof useSolutionWorld> }): React.ReactElement {
  const tab = api.state.openResult?.tab;
  const revision = api.state.openResult?.revision;
  return (
    <header
      data-epoch-topbar="true"
      className="pointer-events-auto flex items-center gap-3 rounded-lg border border-card-border bg-card px-3 py-2 text-foreground shadow-lg"
    >
      <span className="inline-flex size-2 rounded-full bg-brand" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-ui-caption font-medium">
          {tab?.title ?? "Epoch Solution"}
        </span>
        <span className="truncate text-ui-xs text-foreground-subtlest">
          {tab ? `${tab.engineId} · ${tab.solutionId}` : "no solution open"}
          {revision ? ` · ${revision.entities.length} entities` : ""}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          data-epoch-action="reset-view"
          onClick={api.resetView}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
        >
          Reset view
        </button>
        <button
          type="button"
          data-epoch-action="reopen"
          onClick={() => void api.reopen()}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
        >
          Reopen
        </button>
      </div>
    </header>
  );
}

function ErrorBanner({
  api,
}: {
  api: ReturnType<typeof useSolutionWorld>;
}): React.ReactElement | null {
  if (api.state.phase !== "error" || !api.state.error) return null;
  return (
    <div
      data-epoch-error="true"
      className="pointer-events-auto flex max-w-md flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-foreground shadow-lg"
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
        <span className="text-ui-caption font-medium">Solution failed to open</span>
      </div>
      <p className="break-all text-ui-xs text-foreground-subtle">{api.state.error}</p>
      <button
        type="button"
        data-epoch-action="retry"
        onClick={() => void api.reopen()}
        className="self-start rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
      >
        Retry
      </button>
    </div>
  );
}

function OpenHint({
  api,
}: {
  api: ReturnType<typeof useSolutionWorld>;
}): React.ReactElement | null {
  if (api.state.phase !== "open") return null;
  return (
    <div
      data-epoch-hint="true"
      className="pointer-events-none rounded-md bg-background/70 px-2.5 py-1 text-ui-xs text-foreground-subtle"
      aria-hidden="true"
    >
      Drag to orbit · right-drag to pan · wheel to zoom · click to select
    </div>
  );
}

export function SolutionHostApp(): React.ReactElement {
  const api = useSolutionWorld();
  // W007 — runtime + interaction wiring (additive over W005; consumes openResult).
  const runtimeApi = useSolutionRuntime(
    api.state.openResult,
    api.state.openResult?.tab.engineId ?? "epoch-construction-fixture",
    // Cast: fixture entities carry layer + geometry extension fields; runtime only reads entityId + geometry.position.
    (api.state.openResult?.revision.entities ?? []) as unknown as ReadonlyArray<{
      entityId: string;
      geometry?: { position: readonly [number, number, number] };
    }>,
  );
  return (
    <div
      data-epoch-host="true"
      className="relative h-dvh min-h-dvh w-screen overflow-hidden bg-background text-foreground"
    >
      <SolutionWorldCanvas api={api} />
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
        <div className="flex justify-center">
          <TopBar api={api} />
        </div>
        <ErrorBanner api={api} />
        <div className="flex-1" />
        <div className="flex items-end justify-between gap-3">
          <SolutionLayerControls api={api} />
          <div className="flex flex-col items-end gap-2">
            <OpenHint api={api} />
            <SolutionInspector api={api} />
            {api.selectedEntity ? <SolutionDownstreamProjection world={api} /> : null}
            <SolutionToolsOverlay runtime={runtimeApi} world={api} />
          </div>
        </div>
      </div>
    </div>
  );
}
