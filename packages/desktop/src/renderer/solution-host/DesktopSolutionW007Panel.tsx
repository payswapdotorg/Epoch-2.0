/**
 * W007 — Desktop Solution tools panel (layer isolate + plan/section + measurement/annotation).
 *
 * Additive over W006: a separate inline-styled panel that surfaces W007 capabilities.
 * World stays dominant (invariant #3); this panel floats on top of the canvas.
 * No engine-specific surface types (invariant #6).
 */
import { useState } from "react";
import type { RendererSession } from "@zcode/epoch-renderer-contract";
import type { SolutionRuntime } from "@zcode/epoch-solution-runtime";
import type { WorldInteractionLayer } from "@zcode/epoch-world-interaction";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import {
  buttonStyle,
  inspectorRowStyle,
  linkButtonStyle,
  panelTitleStyle,
} from "./desktopSolutionHostStyles.js";

interface Props {
  runtime: SolutionRuntime;
  interaction: WorldInteractionLayer;
  layerIds: readonly string[];
  session: RendererSession | null;
  presentation: WorldPresentation | null;
  selectedEntityId: string | null;
}

export function DesktopSolutionW007Panel({
  runtime,
  interaction,
  layerIds,
  session,
  presentation,
  selectedEntityId,
}: Props): React.ReactElement {
  const [, forceRender] = useState(0);
  const [annotationText, setAnnotationText] = useState("");
  // Subscribe to runtime state changes (so measurement/annotation lists update).
  useState(() => {
    const unsubscribe = runtime.subscribe(() => forceRender((n) => n + 1));
    return () => unsubscribe;
  });

  const measurements = interaction.measurements.list();
  const annotations = interaction.annotations.list();

  const onIsolate = (layerId: string) => {
    for (const id of layerIds) {
      const visible = id === layerId;
      if (session) session.setVisibility({ layerId: id, visible });
      runtime.dispatch({ kind: "solution.setLayerVisibility", layerId: id, visible });
    }
  };
  const onUnIsolate = () => {
    for (const id of layerIds) {
      if (session) session.setVisibility({ layerId: id, visible: true });
      runtime.dispatch({ kind: "solution.setLayerVisibility", layerId: id, visible: true });
    }
  };
  const onPlanView = () => {
    if (!presentation || !session) return;
    const bounds = computeBounds(presentation);
    const path = interaction.computePlanViewPath(bounds);
    session.navigate({ kind: "look-at", target: path.target, position: path.position });
    session.navigate({ kind: "zoom", factor: path.zoomFactor });
  };
  const onSectionCut = () => {
    if (!presentation || !session) return;
    const bounds = computeBounds(presentation);
    const path = interaction.computeSectionCutPath(bounds);
    for (const layerId of path.hiddenLayerIds) {
      session.setVisibility({ layerId, visible: false });
      runtime.dispatch({ kind: "solution.setLayerVisibility", layerId, visible: false });
    }
    session.navigate({ kind: "look-at", target: path.target });
  };
  const onMeasure = () => {
    const m = interaction.measurements.createLinear(
      { point: { x: 0, y: 0, z: 0 } },
      { point: { x: 4, y: 0, z: 3 } },
    );
    runtime.addMeasurementRef(m.measurementId);
  };
  const onAnnotate = () => {
    if (!selectedEntityId || !annotationText.trim()) return;
    const ann = interaction.annotations.createNote(annotationText.trim(), {
      entityId: selectedEntityId,
    });
    if (ann) runtime.addAnnotationRef(ann.annotationId);
    setAnnotationText("");
  };

  return (
    <div data-testid="epoch-w007-panel" style={{ marginTop: 12 }}>
      <div style={panelTitleStyle}>W007 Tools</div>

      <div style={inspectorRowStyle}>
        <strong>Layer isolate</strong>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {layerIds.map((layerId) => (
          <button
            key={layerId}
            type="button"
            data-testid={`epoch-isolate-${layerId}`}
            onClick={() => onIsolate(layerId)}
            style={{ ...buttonStyle, fontSize: 11, padding: "3px 8px" }}
          >
            {layerId}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="epoch-unisolate"
        onClick={onUnIsolate}
        style={{ ...linkButtonStyle, marginBottom: 8 }}
      >
        Show all layers
      </button>

      <div style={inspectorRowStyle}>
        <strong>Plan / Section</strong>
      </div>
      <button
        type="button"
        data-testid="epoch-plan-view"
        onClick={onPlanView}
        style={{ ...buttonStyle, fontSize: 11, padding: "3px 8px", marginRight: 4 }}
      >
        Plan view
      </button>
      <button
        type="button"
        data-testid="epoch-section-cut"
        onClick={onSectionCut}
        style={{ ...buttonStyle, fontSize: 11, padding: "3px 8px" }}
      >
        Section cut
      </button>

      <div style={{ ...inspectorRowStyle, marginTop: 8 }}>
        <strong>Measurement</strong>
      </div>
      <button
        type="button"
        data-testid="epoch-measure"
        onClick={onMeasure}
        style={{ ...buttonStyle, fontSize: 11, padding: "3px 8px" }}
      >
        Add measurement
      </button>
      <ul data-testid="epoch-measurements" style={{ margin: "4px 0", paddingLeft: 18 }}>
        {measurements.map((m) => (
          <li key={m.measurementId} data-testid={`epoch-measurement-${m.measurementId}`}>
            {m.measurementId}: {m.displayValue}
          </li>
        ))}
      </ul>

      <div style={{ ...inspectorRowStyle, marginTop: 8 }}>
        <strong>Annotation</strong>
      </div>
      <input
        type="text"
        value={annotationText}
        onChange={(e) => setAnnotationText(e.target.value)}
        placeholder="Annotation text"
        data-testid="epoch-annotation-input"
        style={{
          width: "100%",
          padding: "3px 6px",
          fontSize: 11,
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 4,
          marginBottom: 4,
        }}
      />
      <button
        type="button"
        data-testid="epoch-annotate"
        onClick={onAnnotate}
        disabled={!selectedEntityId || !annotationText.trim()}
        style={{
          ...buttonStyle,
          fontSize: 11,
          padding: "3px 8px",
          opacity: !selectedEntityId || !annotationText.trim() ? 0.5 : 1,
        }}
      >
        Attach to entity
      </button>
      <ul data-testid="epoch-annotations" style={{ margin: "4px 0", paddingLeft: 18 }}>
        {annotations.map((a) => (
          <li key={a.annotationId} data-testid={`epoch-annotation-${a.annotationId}`}>
            {a.annotationId}: “{a.text}”{a.entityId ? ` → ${a.entityId}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function computeBounds(presentation: WorldPresentation): {
  center: { x: number; y: number; z: number };
  radius: number;
} {
  if (presentation.nodes.length === 0) {
    return { center: { x: 0, y: 0, z: 0 }, radius: 10 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const node of presentation.nodes) {
    const t = node.transform.translation;
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    minZ = Math.min(minZ, t.z);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
    maxZ = Math.max(maxZ, t.z);
  }
  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
  const radius = Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2, 1);
  return { center, radius };
}
