/**
 * W007 — Downstream projection link panel (additive over W005 inspector).
 *
 * Surfaces for the selected entity: its layer, phase, properties, and at least
 * one downstream projection (BOQ-ish quantity rollup read from the world model's
 * quantities, or a constraint/finding reference). PROJECTION ONLY (invariant #13):
 * never a second BOQ authority (invariant #14).
 *
 * Read directly from the world model via projectEntityDownstream — no second
 * semantic store.
 */
import {
  projectEntityDownstream,
  type EntityDownstreamProjection,
} from "@zcode/epoch-solution-runtime";
import type { WorldEntity } from "@zcode/epoch-world-model";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { SolutionWorldApi } from "./useSolutionWorld.js";

interface Props {
  world: SolutionWorldApi;
}

export function SolutionDownstreamProjection({ world }: Props): React.ReactElement | null {
  const presentation: WorldPresentation | null = world.state.openResult?.presentation ?? null;
  const entity: WorldEntity | null = world.selectedEntity;
  const projection: EntityDownstreamProjection | null = projectEntityDownstream(
    presentation,
    entity,
  );
  if (!projection) return null;
  return (
    <aside
      data-epoch-projection="w007"
      className="pointer-events-auto flex max-h-[60dvh] w-72 flex-col overflow-hidden rounded-lg border border-card-border bg-card text-foreground shadow-lg"
      aria-label="Epoch W007 downstream projection link"
    >
      <header className="flex items-center justify-between border-b border-card-border px-3 py-2">
        <h2 className="text-ui-caption font-medium">Downstream projection</h2>
        <span className="text-ui-xs text-foreground-subtlest">W007</span>
      </header>
      <div className="max-h-96 overflow-y-auto px-3 py-2">
        <div className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1.5">
          <span className="text-ui-xs text-foreground-subtlest">Layer</span>
          <span className="text-ui-sm text-foreground text-right break-all">
            {projection.layer ?? "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1.5">
          <span className="text-ui-xs text-foreground-subtlest">Phase</span>
          <span className="text-ui-sm text-foreground text-right break-all">
            {projection.phase ?? "—"}
          </span>
        </div>
        <div className="border-b border-border/40 py-1.5">
          <div className="text-ui-xs text-foreground-subtlest">Properties</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {Object.entries(projection.properties).map(([key, value]) => (
              <li key={key} className="flex items-baseline justify-between gap-2 text-ui-xs">
                <span className="text-foreground-subtlest">{key}</span>
                <span className="text-foreground text-right break-all">{value}</span>
              </li>
            ))}
            {Object.keys(projection.properties).length === 0 ? (
              <li className="text-ui-xs text-foreground-subtlest">—</li>
            ) : null}
          </ul>
        </div>
        <div className="border-b border-border/40 py-1.5">
          <div className="text-ui-xs text-foreground-subtlest">
            BOQ-ish quantity (read from world model)
          </div>
          <div className="text-ui-sm text-foreground">
            {projection.quantity ? `${projection.quantity.value} ${projection.quantity.unit}` : "—"}
          </div>
        </div>
        <div className="py-1.5">
          <div className="text-ui-xs text-foreground-subtlest">Constraint references</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {projection.constraintRefs.map((ref) => (
              <li key={ref} className="text-ui-xs text-foreground">
                <code>{ref}</code>
              </li>
            ))}
            {projection.constraintRefs.length === 0 ? (
              <li className="text-ui-xs text-foreground-subtlest">—</li>
            ) : null}
          </ul>
        </div>
      </div>
    </aside>
  );
}
