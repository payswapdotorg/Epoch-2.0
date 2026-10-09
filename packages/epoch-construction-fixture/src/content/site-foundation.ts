/**
 * SITE + FOUNDATION 层实体（baseline 变体）。
 *
 * 坐标系：X=东西（+东），Y=上，Z=南北（+南）。建筑占地 6m×4m（X[-3,3], Z[-2,2]），
 * 地块 12m×10m。所有尺寸/位置单位为米（SI）。确定性字面量，无随机/时间。
 */
import type { ConstructionFixtureEntity } from "../geometry.ts";
import type { ConstructionLayerId } from "../layers.ts";
import { authorRef, box, mat, plane, line, q } from "./helpers.ts";

const SITE: ConstructionLayerId = "SITE";
const FOUNDATION: ConstructionLayerId = "FOUNDATION";

export function siteFoundationEntities(): readonly ConstructionFixtureEntity[] {
  return [
    {
      entityId: "site-plot",
      entityType: "site-plot",
      label: "Site Plot Boundary",
      layer: SITE,
      geometry: plane(12, 10, 0, 0, 0),
      dimensions: { length: q(12, "m"), width: q(10, "m") },
      quantity: { value: 120, unit: "m2" },
      phase: "site-works",
      status: "proposed",
      provenance: [authorRef("agent-site-manager")],
    },
    {
      entityId: "site-access-road",
      entityType: "access-road",
      label: "Vehicular Access Road",
      layer: SITE,
      geometry: plane(4, 6, 0, 0, 4),
      dimensions: { length: q(6, "m"), width: q(4, "m") },
      quantity: { value: 24, unit: "m2" },
      phase: "site-works",
      provenance: [authorRef("agent-site-manager")],
    },
    {
      entityId: "site-staging-area",
      entityType: "staging-area",
      label: "Material Staging Yard",
      layer: SITE,
      geometry: plane(5, 4, 4.5, 0, -3.5),
      dimensions: { length: q(5, "m"), width: q(4, "m") },
      quantity: { value: 20, unit: "m2" },
      phase: "site-works",
      provenance: [authorRef("agent-site-manager")],
    },
    {
      entityId: "site-perimeter-fence",
      entityType: "fence",
      label: "Perimeter Security Fence",
      layer: SITE,
      geometry: line(44, 0.02, 0, 0.9, 0),
      material: mat("chain-link"),
      dimensions: { perimeter: q(44, "m") },
      quantity: { value: 44, unit: "m" },
      phase: "site-works",
      provenance: [authorRef("agent-site-manager")],
    },
    {
      entityId: "site-office-temp",
      entityType: "temp-office",
      label: "Temporary Site Office",
      layer: SITE,
      geometry: box(3, 2.4, 3, 4.5, 1.2, 3.5),
      material: mat("prefab-panel"),
      dimensions: { length: q(3, "m"), width: q(3, "m"), height: q(2.4, "m") },
      phase: "site-works",
      provenance: [authorRef("agent-site-manager")],
    },
    {
      entityId: "foundation-subgrade",
      entityType: "subgrade",
      label: "Prepared Subgrade",
      layer: FOUNDATION,
      geometry: box(8, 0.3, 6, 0, -0.65, 0),
      material: mat("engineered-fill", "GB1"),
      dimensions: { length: q(8, "m"), width: q(6, "m"), thickness: q(0.3, "m") },
      quantity: { value: 14.4, unit: "m3" },
      phase: "substructure",
      status: "proposed",
      constraints: ["constraint-slab-bearing-150kPa"],
      provenance: [authorRef("agent-structural-engineer"), authorRef("agent-site-manager")],
    },
    stripFooting("foundation-strip-footing-south", "Strip Footing South", 0, 2),
    stripFooting("foundation-strip-footing-north", "Strip Footing North", 0, -2),
    {
      entityId: "foundation-strip-footing-east",
      entityType: "strip-footing",
      label: "Strip Footing East",
      layer: FOUNDATION,
      geometry: box(0.6, 0.6, 4, 3, -0.3, 0),
      material: mat("concrete", "C30"),
      dimensions: { length: q(4, "m"), width: q(0.6, "m"), thickness: q(0.6, "m") },
      quantity: { value: 1.44, unit: "m3" },
      phase: "substructure",
      constraints: ["constraint-slab-bearing-150kPa"],
      provenance: [authorRef("agent-structural-engineer")],
    },
    {
      entityId: "foundation-strip-footing-west",
      entityType: "strip-footing",
      label: "Strip Footing West",
      layer: FOUNDATION,
      geometry: box(0.6, 0.6, 4, -3, -0.3, 0),
      material: mat("concrete", "C30"),
      dimensions: { length: q(4, "m"), width: q(0.6, "m"), thickness: q(0.6, "m") },
      quantity: { value: 1.44, unit: "m3" },
      phase: "substructure",
      constraints: ["constraint-slab-bearing-150kPa"],
      provenance: [authorRef("agent-structural-engineer")],
    },
    padFooting("foundation-pad-footing-1", "Pad Footing 1 (SE)", 3, 2),
    padFooting("foundation-pad-footing-2", "Pad Footing 2 (NE)", 3, -2),
    padFooting("foundation-pad-footing-3", "Pad Footing 3 (SW)", -3, 2),
    padFooting("foundation-pad-footing-4", "Pad Footing 4 (NW)", -3, -2),
    {
      entityId: "foundation-ground-slab",
      entityType: "slab",
      label: "Ground-bearing Slab",
      layer: FOUNDATION,
      geometry: box(6, 0.15, 4, 0, -0.075, 0),
      material: mat("concrete", "C30"),
      dimensions: { length: q(6, "m"), width: q(4, "m"), thickness: q(0.15, "m") },
      quantity: { value: 3.6, unit: "m3" },
      phase: "substructure",
      status: "proposed",
      constraints: ["constraint-slab-bearing-150kPa"],
      provenance: [authorRef("agent-structural-engineer")],
    },
  ];
}

function stripFooting(
  entityId: string,
  label: string,
  x: number,
  z: number,
): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "strip-footing",
    label,
    layer: FOUNDATION,
    geometry: box(6, 0.6, 0.6, x, -0.3, z),
    material: mat("concrete", "C30"),
    dimensions: { length: q(6, "m"), width: q(0.6, "m"), thickness: q(0.6, "m") },
    quantity: { value: 2.16, unit: "m3" },
    phase: "substructure",
    constraints: ["constraint-slab-bearing-150kPa"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}

function padFooting(
  entityId: string,
  label: string,
  x: number,
  z: number,
): ConstructionFixtureEntity {
  return {
    entityId,
    entityType: "pad-footing",
    label,
    layer: FOUNDATION,
    geometry: box(0.8, 0.5, 0.8, x, -0.25, z),
    material: mat("concrete", "C30"),
    dimensions: { length: q(0.8, "m"), width: q(0.8, "m"), thickness: q(0.5, "m") },
    quantity: { value: 0.32, unit: "m3" },
    phase: "substructure",
    constraints: ["constraint-slab-bearing-150kPa"],
    provenance: [authorRef("agent-structural-engineer")],
  };
}
