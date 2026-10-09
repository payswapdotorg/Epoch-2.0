/**
 * SolutionLayerControls — fixture 六层可见性控制（W005 req #6）。
 *
 * 通过 renderer-neutral RendererSession.setVisibility 切换 fixture 的六个语义
 * 图层（SITE/FOUNDATION/STRUCTURE/ENVELOPE/MEP/FINISHES）。图层状态存活于
 * useSolutionWorld 的 React state（ephemeral 展示态），不写回世界/解权威
 * （ARCHITECTURE-LOCK #13：UI 是投影，不成为可见性权威）。
 */
import { fixtureLayerDescriptions, fixtureLayerIds } from "./fixturePresentation.js";
import type { SolutionWorldApi } from "./useSolutionWorld.js";

export function SolutionLayerControls({ api }: { api: SolutionWorldApi }): React.ReactElement {
  const layers = fixtureLayerIds();
  const descriptions = fixtureLayerDescriptions();
  return (
    <aside
      data-epoch-layers="true"
      className="pointer-events-auto flex w-60 flex-col overflow-hidden rounded-lg border border-card-border bg-card text-foreground shadow-lg"
      aria-label="Epoch solution layer controls"
    >
      <header className="flex items-center justify-between border-b border-card-border px-3 py-2">
        <h2 className="text-ui-caption font-medium">Layers</h2>
        <span className="text-ui-xs text-foreground-subtlest">6</span>
      </header>
      <ul className="flex flex-col">
        {layers.map((layerId) => {
          const hidden = api.state.hiddenLayers[layerId] === true;
          return (
            <li
              key={layerId}
              className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-ui-sm text-foreground">{layerId}</span>
                <span className="truncate text-ui-xs text-foreground-subtlest">
                  {descriptions[layerId] ?? ""}
                </span>
              </div>
              <button
                type="button"
                data-epoch-layer-toggle={layerId}
                aria-pressed={!hidden}
                aria-label={`Toggle layer ${layerId}`}
                onClick={() => api.toggleLayer(layerId, hidden)}
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border px-0.5 text-ui-2xs transition-colors ${
                  hidden ? "bg-surface text-foreground-subtlest" : "bg-success/20 text-foreground"
                }`}
              >
                <span
                  className={`size-4 rounded-full bg-current transition-transform ${
                    hidden ? "translate-x-0" : "translate-x-5"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
