/**
 * MEP + FINISHES 层实体（baseline 变体）。
 *
 * MEP：配电箱 + 照明(2) + 导线 + 给水 + 排水 + 风管 + 空调外机。
 * FINISHES：地砖 + 吊顶 + 四墙内抹灰。所有尺寸/位置 SI 米。确定性字面量。
 */
import type { ConstructionFixtureEntity } from "../geometry.ts";
import type { ConstructionLayerId } from "../layers.ts";
import { authorRef, box, line, mat, q } from "./helpers.ts";

const MEP: ConstructionLayerId = "MEP";
const FINISHES: ConstructionLayerId = "FINISHES";

export function mepFinishesEntities(): readonly ConstructionFixtureEntity[] {
  return [
    {
      entityId: "mep-distribution-board",
      entityType: "electrical-panel",
      label: "Distribution Board",
      layer: MEP,
      geometry: box(0.6, 0.9, 0.2, -2.9, 1.5, 1.9),
      material: mat("steel", "powder-coated"),
      dimensions: { width: q(0.6, "m"), height: q(0.9, "m"), depth: q(0.2, "m") },
      phase: "services",
      status: "proposed",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    lightFixture("mep-light-fixture-1", "Light Fixture 1", -1.0),
    lightFixture("mep-light-fixture-2", "Light Fixture 2", 1.0),
    {
      entityId: "mep-conduit-run",
      entityType: "conduit",
      label: "Electrical Conduit Run",
      layer: MEP,
      geometry: line(4, 0.02, 0, 2.9, 1.0),
      material: mat("pvc"),
      dimensions: { length: q(4, "m"), diameter: q(0.02, "m") },
      phase: "services",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    {
      entityId: "mep-supply-pipe",
      entityType: "pipe",
      label: "Water Supply Pipe",
      layer: MEP,
      geometry: line(3, 0.025, -2.9, 0.5, 1.0),
      material: mat("PE", "PE100"),
      dimensions: { length: q(3, "m"), diameter: q(0.025, "m") },
      phase: "services",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    {
      entityId: "mep-drain-run",
      entityType: "drain-pipe",
      label: "Floor Drainage Run",
      layer: MEP,
      geometry: line(5, 0.1, 0, -0.2, 1.9),
      material: mat("uPVC"),
      dimensions: { length: q(5, "m"), diameter: q(0.1, "m") },
      phase: "services",
      status: "flagged",
      constraints: ["constraint-fire-rating-60"],
      provenance: [authorRef("agent-mep-coordinator")],
    },
    {
      entityId: "mep-hvac-duct",
      entityType: "duct",
      label: "HVAC Supply Duct",
      layer: MEP,
      geometry: box(0.4, 0.3, 4, 0, 2.7, 0),
      material: mat("galvanized-steel"),
      dimensions: { width: q(0.4, "m"), height: q(0.3, "m"), length: q(4, "m") },
      phase: "services",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    {
      entityId: "mep-hvac-unit",
      entityType: "hvac-unit",
      label: "HVAC Outdoor Unit",
      layer: MEP,
      geometry: box(0.8, 0.6, 0.4, 4, 0.3, 2),
      material: mat("steel"),
      dimensions: { width: q(0.8, "m"), height: q(0.6, "m"), depth: q(0.4, "m") },
      phase: "services",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    {
      entityId: "finishes-floor-tile",
      entityType: "floor-finish",
      label: "Porcelain Floor Finish",
      layer: FINISHES,
      geometry: box(5.8, 0.04, 3.8, 0, 0.02, 0),
      material: mat("porcelain-tile"),
      dimensions: { length: q(5.8, "m"), width: q(3.8, "m"), thickness: q(0.04, "m") },
      quantity: { value: 22.04, unit: "m2" },
      phase: "fitout",
      provenance: [authorRef("agent-site-manager")],
    },
    {
      entityId: "finishes-ceiling",
      entityType: "ceiling-finish",
      label: "Suspended Ceiling",
      layer: FINISHES,
      geometry: box(5.8, 0.05, 3.8, 0, 2.95, 0),
      material: mat("mineral-tile"),
      dimensions: { length: q(5.8, "m"), width: q(3.8, "m"), thickness: q(0.05, "m") },
      quantity: { value: 22.04, unit: "m2" },
      phase: "fitout",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    plaster("finishes-plaster-south", "Interior Plaster South", 0, 1.45, 1.89, true),
    plaster("finishes-plaster-north", "Interior Plaster North", 0, 1.45, -1.89, true),
    plaster("finishes-plaster-east", "Interior Plaster East", 2.89, 1.45, 0, false),
    plaster("finishes-plaster-west", "Interior Plaster West", -2.89, 1.45, 0, false),
  ];
}

function lightFixture(entityId: string, label: string, x: number): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "light-fixture",
    label,
    layer: MEP,
    geometry: box(1.2, 0.1, 0.2, x, 2.9, 0),
    material: mat("led"),
    dimensions: { length: q(1.2, "m"), width: q(0.2, "m"), height: q(0.1, "m") },
    phase: "services",
    status: "proposed",
    provenance: [authorRef("agent-mep-coordinator")],
  };
}

function plaster(
  entityId: string,
  label: string,
  x: number,
  y: number,
  z: number,
  isNorthSouth: boolean,
): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "plaster",
    label,
    layer: FINISHES,
    geometry: isNorthSouth ? box(5.8, 2.9, 0.02, x, y, z) : box(0.02, 2.9, 3.8, x, y, z),
    material: mat("gypsum-plaster"),
    dimensions: isNorthSouth
      ? { length: q(5.8, "m"), height: q(2.9, "m"), thickness: q(0.02, "m") }
      : { length: q(3.8, "m"), height: q(2.9, "m"), thickness: q(0.02, "m") },
    phase: "fitout",
    provenance: [authorRef("agent-site-manager")],
  };
}
