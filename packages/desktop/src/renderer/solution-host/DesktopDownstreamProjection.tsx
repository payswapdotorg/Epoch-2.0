/**
 * W007 — Desktop downstream projection link (additive over W006 inspector).
 *
 * Surfaces for the selected entity: its layer, phase, properties, and at least
 * one downstream projection (BOQ-ish quantity rollup read from the world model's
 * quantities, or a constraint/finding reference). PROJECTION ONLY (invariant #13):
 * never a second BOQ authority (invariant #14).
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type { EntityInspectorData } from "./DesktopSolutionHostTypes.js";
import { inspectorRowStyle } from "./desktopSolutionHostStyles.js";

interface Props {
  inspector: EntityInspectorData;
  revision: WorldRevision | null;
}

export function DesktopDownstreamProjection({ inspector, revision }: Props): React.ReactElement {
  const entity = revision?.entities.find((e) => e.entityId === inspector.entityId);
  const constraintRefs =
    (entity as { constraints?: readonly string[] } | undefined)?.constraints ?? [];
  return (
    <>
      <div style={inspectorRowStyle}>
        <strong>Downstream projection</strong>
      </div>
      <div style={inspectorRowStyle}>
        BOQ-ish quantity: {inspector.quantity ?? "—"} (read from world model)
      </div>
      <div style={inspectorRowStyle}>
        constraint refs:
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {constraintRefs.length > 0 ? (
            constraintRefs.map((ref) => (
              <li key={ref}>
                <code>{ref}</code>
              </li>
            ))
          ) : (
            <li>—</li>
          )}
        </ul>
      </div>
    </>
  );
}
