/**
 * SolutionInspector — 选中实体的语义投影面板（W005 req #5）。
 *
 * 选择经渲染器交互映射解析到 Epoch entityId（interaction.md「Acceptance」：
 * 选中一个 column 必须解析为该 column 的规范身份并驱动下游投影）。本面板
 * 从世界模型（WorldEntity 冻结契约）读取语义字段——label/entityType/phase/
 * status/material/dimensions/quantity/provenance——绝不从 mesh 名推断身份。
 * 图层成员来自表现节点（renderer-neutral），非 mesh 元数据。
 */
import type { WorldEntity, QuantityValue } from "@zcode/epoch-world-model";
import type { SolutionWorldApi } from "./useSolutionWorld.js";

function formatQuantity(q: QuantityValue): string {
  return `${q.value} ${q.unit}`;
}

function EntityField({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1.5">
      <span className="text-ui-xs text-foreground-subtlest">{label}</span>
      <span className="text-ui-sm text-foreground text-right break-all">{value}</span>
    </div>
  );
}

function renderEntityBody(entity: WorldEntity, layer: string | null): React.ReactElement {
  const dimensions = entity.dimensions
    ? Object.entries(entity.dimensions)
        .map(([key, qty]) => `${key}: ${formatQuantity(qty)}`)
        .join("  ")
    : "—";
  const provenance =
    entity.provenance && entity.provenance.length > 0
      ? entity.provenance.map((p) => p.sourceId).join(", ")
      : "—";
  const material = entity.material
    ? entity.material.grade
      ? `${entity.material.type} · ${entity.material.grade}`
      : entity.material.type
    : "—";
  return (
    <div className="flex flex-col">
      <EntityField label="Label" value={entity.label} />
      <EntityField label="Entity type" value={entity.entityType} />
      <EntityField label="Layer" value={layer ?? "—"} />
      <EntityField label="Phase" value={entity.phase ?? "—"} />
      <EntityField label="Status" value={entity.status ?? "—"} />
      <EntityField label="Material" value={material} />
      <EntityField
        label="Quantity"
        value={entity.quantity ? formatQuantity(entity.quantity) : "—"}
      />
      <EntityField label="Dimensions" value={dimensions} />
      <EntityField label="Provenance" value={provenance} />
      <EntityField label="Entity ID" value={entity.entityId} />
    </div>
  );
}

export function SolutionInspector({ api }: { api: SolutionWorldApi }): React.ReactElement {
  const entity = api.selectedEntity;
  const layer = api.selectedLayer;
  return (
    <aside
      data-epoch-inspector="true"
      className="pointer-events-auto flex max-h-[60dvh] w-72 flex-col overflow-hidden rounded-lg border border-card-border bg-card text-foreground shadow-lg"
      aria-label="Epoch solution inspector"
    >
      <header className="flex items-center justify-between border-b border-card-border px-3 py-2">
        <h2 className="text-ui-caption font-medium">Inspector</h2>
        <span
          className={`size-1.5 rounded-full ${entity ? "bg-success" : "bg-foreground-subtlest"}`}
          aria-hidden="true"
        />
      </header>
      <div className="max-h-96 overflow-y-auto px-3 py-2">
        {entity ? (
          renderEntityBody(entity, layer)
        ) : (
          <p className="py-6 text-center text-ui-xs text-foreground-subtle">
            Click an element in the world to inspect its engineering semantics.
          </p>
        )}
      </div>
    </aside>
  );
}
