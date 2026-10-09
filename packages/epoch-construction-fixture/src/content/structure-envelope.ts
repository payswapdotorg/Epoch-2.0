/**
 * STRUCTURE + ENVELOPE 层实体（baseline 变体：平屋顶）。
 *
 * 结构柱位于四角（±3, ±2），梁坐落于柱顶，结构屋面板坐落于梁上。
 * 围护：四墙 + 1 门 + 2 窗 + 平屋面防水层。确定性字面量。
 */
import type { ConstructionFixtureEntity } from "../geometry.ts";
import type { ConstructionLayerId } from "../layers.ts";
import { authorRef, box, mat, q } from "./helpers.ts";

const STRUCTURE: ConstructionLayerId = "STRUCTURE";
const ENVELOPE: ConstructionLayerId = "ENVELOPE";

export function structureEnvelopeEntities(): readonly ConstructionFixtureEntity[] {
  return [
    column("col-1", "Column 1 (SE)", 3, 2),
    column("col-2", "Column 2 (NE)", 3, -2),
    column("col-3", "Column 3 (SW)", -3, 2),
    column("col-4", "Column 4 (NW)", -3, -2),
    beam("beam-south", "Perimeter Beam South", 0, 3.15, 2, 6),
    beam("beam-north", "Perimeter Beam North", 0, 3.15, -2, 6),
    beam("beam-east", "Perimeter Beam East", 3, 3.15, 0, 4),
    beam("beam-west", "Perimeter Beam West", -3, 3.15, 0, 4),
    {
      entityId: "structure-roof-slab",
      entityType: "slab",
      label: "Structural Roof Slab (flat)",
      layer: STRUCTURE,
      geometry: box(6, 0.2, 4, 0, 3.4, 0),
      material: mat("concrete", "C35"),
      dimensions: { length: q(6, "m"), width: q(4, "m"), thickness: q(0.2, "m") },
      quantity: { value: 4.8, unit: "m3" },
      phase: "superstructure",
      status: "proposed",
      constraints: ["constraint-headroom-2700mm"],
      provenance: [authorRef("agent-structural-engineer")],
    },
    wall("wall-south", "South Wall", 0, 1.5, 2, 6),
    wall("wall-north", "North Wall", 0, 1.5, -2, 6),
    wall("wall-east", "East Wall", 3, 1.5, 0, 4),
    wall("wall-west", "West Wall", -3, 1.5, 0, 4),
    {
      entityId: "envelope-door-main",
      entityType: "door",
      label: "Personnel Door",
      layer: ENVELOPE,
      geometry: box(0.9, 2.1, 0.05, -1.5, 1.05, 2.0),
      material: mat("steel", "fire-rated"),
      dimensions: { width: q(0.9, "m"), height: q(2.1, "m"), thickness: q(0.05, "m") },
      phase: "envelope",
      status: "proposed",
      constraints: ["constraint-fire-rating-60"],
      provenance: [authorRef("agent-structural-engineer")],
    },
    windowEntity("envelope-window-1", "Window 1", -1.5, -2.0),
    windowEntity("envelope-window-2", "Window 2", 1.5, -2.0),
    {
      entityId: "envelope-roof-flat",
      entityType: "roof",
      label: "Flat Roof Membrane",
      layer: ENVELOPE,
      geometry: box(6.2, 0.05, 4.2, 0, 3.525, 0),
      material: mat("bituminous-membrane"),
      dimensions: { length: q(6.2, "m"), width: q(4.2, "m"), thickness: q(0.05, "m") },
      quantity: { value: 26.04, unit: "m2" },
      phase: "envelope",
      provenance: [authorRef("agent-structural-engineer")],
    },
  ];
}

function column(
  entityId: string,
  label: string,
  x: number,
  z: number,
): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "column",
    label,
    layer: STRUCTURE,
    geometry: box(0.3, 3.0, 0.3, x, 1.5, z),
    material: mat("concrete", "C40"),
    dimensions: { width: q(0.3, "m"), depth: q(0.3, "m"), height: q(3.0, "m") },
    quantity: { value: 0.27, unit: "m3" },
    phase: "superstructure",
    status: "proposed",
    constraints: ["constraint-headroom-2700mm"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}

function beam(
  entityId: string,
  label: string,
  x: number,
  y: number,
  z: number,
  length: number,
): ConstructionFixtureEntity {
  const isNorthSouth = length === 6;
  return {
    entityId,
    entityType: "beam",
    label,
    layer: STRUCTURE,
    geometry: isNorthSouth ? box(6, 0.3, 0.3, x, y, z) : box(0.3, 0.3, 4, x, y, z),
    material: mat("concrete", "C40"),
    dimensions: { length: q(length, "m"), width: q(0.3, "m"), depth: q(0.3, "m") },
    quantity: { value: 0.54, unit: "m3" },
    phase: "superstructure",
    constraints: ["constraint-headroom-2700mm"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}

function wall(
  entityId: string,
  label: string,
  x: number,
  y: number,
  z: number,
  length: number,
): ConstructionFixtureEntity {
  const isNorthSouth = length === 6;
  return {
    entityId,
    entityType: "wall",
    label,
    layer: ENVELOPE,
    geometry: isNorthSouth ? box(6, 3.0, 0.2, x, y, z) : box(0.2, 3.0, 4, x, y, z),
    material: mat("masonry", "AAC"),
    dimensions: { length: q(length, "m"), height: q(3.0, "m"), thickness: q(0.2, "m") },
    phase: "envelope",
    status: "proposed",
    constraints: ["constraint-fire-rating-60"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}

function windowEntity(
  entityId: string,
  label: string,
  x: number,
  z: number,
): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "window",
    label,
    layer: ENVELOPE,
    geometry: box(1.2, 1.0, 0.05, x, 1.6, z),
    material: mat("double-glazed-glass"),
    dimensions: { width: q(1.2, "m"), height: q(1.0, "m"), thickness: q(0.05, "m") },
    phase: "envelope",
    provenance: [authorRef("agent-structural-engineer")],
  };
}
