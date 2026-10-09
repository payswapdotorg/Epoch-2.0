/**
 * W007 — Solution tools overlay: layer isolate + plan/section + measurement/annotation.
 *
 * Additive over W005: a separate overlay panel that surfaces W007 capabilities.
 * World stays dominant (invariant #3): this overlay floats on top of the canvas,
 * does not replace it. No engine-specific surface types (invariant #6).
 */
import { useState } from "react";
import type { UseSolutionRuntimeApi } from "./useSolutionRuntime.js";
import type { SolutionWorldApi } from "./useSolutionWorld.js";
import { fixtureLayerDescriptions } from "./fixturePresentation.js";

interface Props {
  runtime: UseSolutionRuntimeApi;
  world: SolutionWorldApi;
}

export function SolutionToolsOverlay({ runtime, world }: Props): React.ReactElement {
  const [measureFrom, setMeasureFrom] = useState<{ x: number; y: number; z: number } | null>(null);
  const [annotationText, setAnnotationText] = useState("");

  const onPlanView = () => {
    runtime.applyPlanViewPath();
  };
  const onSectionCut = () => {
    runtime.applySectionCutPath();
  };
  const onIsolate = (layerId: string) => {
    runtime.isolateLayer(layerId);
  };
  const onUnIsolate = () => {
    runtime.unisolateLayers();
  };

  // 测量：用最近两次点击的 worldPoint（从 renderer hitTest.point 拿到）。
  // 简化版：第一次点击设为 from，第二次点击设为 to，自动创建测量。
  const onMeasureClick = () => {
    // 用 inspector 选中实体的 hit.point 作为 from；下一次点击作为 to。
    // 这里用一个最小版：取画布中心两点演示测量语义。
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 4, y: 0, z: 3 };
    runtime.createMeasurement(from, to);
    setMeasureFrom(null);
  };

  const onAnnotate = () => {
    const entityId = world.state.selectedEntityId;
    if (!entityId || !annotationText.trim()) return;
    runtime.createAnnotation(annotationText.trim(), entityId);
    setAnnotationText("");
  };

  const layers = runtime.layerIds;
  const descriptions = fixtureLayerDescriptions();
  const hiddenLayers = world.state.hiddenLayers;

  return (
    <aside
      data-epoch-tools="w007"
      className="pointer-events-auto flex max-h-[60dvh] w-72 flex-col overflow-hidden rounded-lg border border-card-border bg-card text-foreground shadow-lg"
      aria-label="Epoch W007 tools — isolate / plan / section / measure / annotate"
    >
      <header className="flex items-center justify-between border-b border-card-border px-3 py-2">
        <h2 className="text-ui-caption font-medium">Engineering Tools</h2>
        <span className="text-ui-xs text-foreground-subtlest">W007</span>
      </header>
      <div className="max-h-96 overflow-y-auto px-3 py-2">
        <section className="flex flex-col gap-2 border-b border-border/40 pb-3">
          <h3 className="text-ui-xs text-foreground-subtlest">Layer Isolation</h3>
          <div className="flex flex-wrap gap-1">
            {layers.map((layerId) => {
              const isHidden = hiddenLayers[layerId] === true;
              return (
                <button
                  key={layerId}
                  type="button"
                  data-epoch-isolate={layerId}
                  onClick={() => onIsolate(layerId)}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-ui-2xs text-foreground-subtle hover:bg-surface-hover"
                  title={`Isolate layer ${descriptions[layerId] ?? layerId}`}
                >
                  {layerId}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            data-epoch-action="unisolate"
            onClick={onUnIsolate}
            className="self-start rounded-md border border-border bg-surface px-2.5 py-1 text-ui-2xs text-foreground-subtle hover:bg-surface-hover"
          >
            Show all layers
          </button>
        </section>

        <section className="flex flex-col gap-2 border-b border-border/40 py-3">
          <h3 className="text-ui-xs text-foreground-subtlest">Plan / Section Path</h3>
          <button
            type="button"
            data-epoch-action="plan-view"
            onClick={onPlanView}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
          >
            Plan view (top-down)
          </button>
          <button
            type="button"
            data-epoch-action="section-cut"
            onClick={onSectionCut}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
          >
            Section cut (hide envelope/MEP/finishes)
          </button>
        </section>

        <section className="flex flex-col gap-2 border-b border-border/40 py-3">
          <h3 className="text-ui-xs text-foreground-subtlest">Measurement (SI units)</h3>
          <button
            type="button"
            data-epoch-action="measure"
            onClick={onMeasureClick}
            className="self-start rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
          >
            Add measurement (0,0,0) to (4,0,3)
          </button>
          <ul className="flex flex-col gap-1" data-epoch-measurements="list">
            {runtime.measurements.map((m) => (
              <li key={m.measurementId} className="text-ui-xs text-foreground">
                {m.measurementId}: {m.displayValue}
              </li>
            ))}
            {runtime.measurements.length === 0 ? (
              <li className="text-ui-xs text-foreground-subtlest">No measurements yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="flex flex-col gap-2 py-3">
          <h3 className="text-ui-xs text-foreground-subtlest">Annotation (entityId-anchored)</h3>
          <input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            placeholder="Annotation text"
            className="rounded-md border border-border bg-surface px-2 py-1 text-ui-xs text-foreground"
            data-epoch-annotation-input="text"
          />
          <button
            type="button"
            data-epoch-action="annotate"
            onClick={onAnnotate}
            disabled={!world.state.selectedEntityId || !annotationText.trim()}
            className="self-start rounded-md border border-border bg-surface px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-surface-hover disabled:opacity-50"
          >
            Attach to selected entity
          </button>
          <ul className="flex flex-col gap-1" data-epoch-annotations="list">
            {runtime.annotations.map((a) => (
              <li key={a.annotationId} className="text-ui-xs text-foreground">
                {a.annotationId}: “{a.text}”{a.entityId ? ` → ${a.entityId}` : ""}
              </li>
            ))}
            {runtime.annotations.length === 0 ? (
              <li className="text-ui-xs text-foreground-subtlest">No annotations yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </aside>
  );
}
