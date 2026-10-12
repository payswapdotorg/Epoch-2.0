import { toFormatId } from "../validate.js";
import type { FormatCatalogEntry, FormatClass } from "../types/formats.js";

function catalogEntry(
  formatId: string,
  formatClass: FormatClass,
  extensions: readonly string[],
  carriesBRep: boolean,
  notes: readonly string[],
): FormatCatalogEntry {
  return { formatId: toFormatId(formatId), formatClass, extensions, carriesBRep, notes };
}

export const FORMAT_CATALOG: readonly FormatCatalogEntry[] = [
  catalogEntry("3mf", "mesh", [".3mf"], false, [
    "mesh-only packaging format; add-on support varies by tool",
  ]),
  catalogEntry("abc", "geometry-cache", [".abc"], false, [
    "Alembic animated caches; tessellated geometry only",
  ]),
  catalogEntry("blend", "native-document", [".blend"], false, [
    "Blender native document; meshes and curves, not exact BRep solids",
  ]),
  catalogEntry("brep", "brep", [".brep"], true, ["OCCT native BRep serialization"]),
  catalogEntry("dae", "scene-graph", [".dae"], false, ["Collada scene graph"]),
  catalogEntry("fbx", "scene-graph", [".fbx"], false, [
    "proprietary Autodesk scene format; SDK-based I/O",
  ]),
  catalogEntry("fcstd", "native-document", [".FCStd"], false, [
    "FreeCAD native document; parametric tree and objects",
  ]),
  catalogEntry("gltf", "scene-graph", [".gltf", ".glb"], false, [
    "glTF 2.0 scene graph; semantics owned by the glTF sibling package",
  ]),
  catalogEntry("ifc", "bim-model", [".ifc", ".ifcxml", ".ifczip"], true, [
    "building information models; semantics owned by the IFC sibling package",
  ]),
  catalogEntry("iges", "brep", [".iges", ".igs"], true, [
    "legacy BRep exchange; superseded by STEP for most flows",
  ]),
  catalogEntry("obj", "mesh", [".obj"], false, [
    "unitless polygon mesh plus MTL material references",
  ]),
  catalogEntry("ply", "mesh", [".ply"], false, ["point/mesh format; can carry vertex colors"]),
  catalogEntry("step", "brep", [".step", ".stp"], true, [
    "ISO 10303 BRep exchange; carries units and assembly structure",
  ]),
  catalogEntry("stl", "mesh", [".stl"], false, [
    "unitless triangle soup; no materials or hierarchy",
  ]),
  catalogEntry("usd", "scene-graph", [".usd", ".usda", ".usdc", ".usdz"], false, [
    "OpenUSD scene description; semantics owned by the OpenUSD sibling package",
  ]),
  catalogEntry("x3d", "scene-graph", [".x3d"], false, ["ISO VRML successor scene graph"]),
];

export function knownFormatIds(): readonly string[] {
  return FORMAT_CATALOG.map((entry) => entry.formatId);
}

export function isKnownFormatId(value: string): boolean {
  return FORMAT_CATALOG.some((entry) => entry.formatId === value);
}

export function formatCatalogEntry(formatId: string): FormatCatalogEntry | null {
  return FORMAT_CATALOG.find((entry) => entry.formatId === formatId) ?? null;
}
