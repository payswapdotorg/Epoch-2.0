/**
 * ALTERNATE 变体（坡屋顶）增量实体。
 *
 * 变体语义：选择 alternate-pitched-roof 时，移除平屋面结构板与防水层，
 * 替换为脊梁 + 双坡屋面 + 山墙填充。实体集变化 -> 摘要变化（投影世界改变）。
 * 引擎按实体存在性过滤关系（见 relationships.ts + engine.ts），故平屋面关系自动剔除。
 */
import type { ConstructionFixtureEntity } from "../geometry.ts";
import type { ConstructionLayerId } from "../layers.ts";
import { authorRef, box, mat, plane, q } from "./helpers.ts";

const STRUCTURE: ConstructionLayerId = "STRUCTURE";
const ENVELOPE: ConstructionLayerId = "ENVELOPE";

/** baseline 平屋面需在 alternate 中移除的实体 id。 */
export const BASELINE_FLAT_ROOF_ENTITY_IDS = ["structure-roof-slab", "envelope-roof-flat"] as const;

export function alternateRoofEntities(): readonly ConstructionFixtureEntity[] {
  return [
    {
      entityId: "structure-beam-ridge",
      entityType: "beam",
      label: "Ridge Beam (pitched)",
      layer: STRUCTURE,
      geometry: box(6, 0.3, 0.3, 0, 3.8, 0),
      material: mat("glulam", "GL28h"),
      dimensions: { length: q(6, "m"), width: q(0.3, "m"), depth: q(0.3, "m") },
      quantity: { value: 0.54, unit: "m3" },
      phase: "superstructure",
      status: "alternate",
      constraints: ["constraint-headroom-2700mm"],
      provenance: [authorRef("agent-structural-engineer")],
    },
    roofSlope("envelope-roof-slope-south", "Pitched Roof Slope South", 1.0, [22, 0, 0]),
    roofSlope("envelope-roof-slope-north", "Pitched Roof Slope North", -1.0, [-22, 0, 0]),
    gableInfill("envelope-gable-east", "Gable Infill East", 3),
    gableInfill("envelope-gable-west", "Gable Infill West", -3),
  ];
}

function roofSlope(
  entityId: string,
  label: string,
  z: number,
  rotation: readonly [number, number, number],
): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "roof",
    label,
    layer: ENVELOPE,
    geometry: plane(6, 2.15, 0, 3.4, z, rotation),
    material: mat("metal-sheeting"),
    dimensions: { length: q(6, "m"), slopeLength: q(2.15, "m"), pitch: q(22, "deg") },
    quantity: { value: 12.9, unit: "m2" },
    phase: "envelope",
    status: "alternate",
    constraints: ["constraint-fire-rating-60"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}

function gableInfill(entityId: string, label: string, x: number): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "wall",
    label,
    layer: ENVELOPE,
    geometry: box(0.2, 0.8, 4, x, 3.4, 0),
    material: mat("masonry", "AAC"),
    dimensions: { thickness: q(0.2, "m"), height: q(0.8, "m"), length: q(4, "m") },
    phase: "envelope",
    status: "alternate",
    constraints: ["constraint-fire-rating-60"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}
