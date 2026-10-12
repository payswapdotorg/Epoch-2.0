import { sha256Canonical } from "../canonical.js";
import {
  isBoolean,
  toDigest,
  toFormatId,
  toKebabId,
  toNonEmptyString,
  toSemver,
  toToolId,
} from "../validate.js";
import { BLENDER_TOOL_ID, FREECAD_TOOL_ID } from "./descriptor.js";
import type { Digest } from "../types/brands.js";
import type { NativeToolDescriptor } from "../types/descriptor.js";
import type {
  FormatFidelityFlags,
  GeometryExchangeInput,
  GeometryExchangeRecord,
  SemanticAuthorityKind,
  SemanticAuthorityRef,
} from "../types/exchange.js";

export const SEMANTIC_AUTHORITY_KINDS: readonly SemanticAuthorityKind[] = [
  "geometry-kernel",
  "world-model",
  "format-schema",
];

export const FIDELITY_FLAG_NAMES = [
  "meshGeometry",
  "brepGeometry",
  "materials",
  "textures",
  "normals",
  "uvCoordinates",
  "animations",
  "instancing",
  "sceneHierarchy",
  "unitsAndScaling",
  "metadata",
  "overallLossy",
] as const;

function toFidelityFlags(fidelity: FormatFidelityFlags): FormatFidelityFlags {
  if (typeof fidelity !== "object" || fidelity === null) {
    throw new Error("fidelity flags must be an object");
  }
  const flags = fidelity as unknown as Record<string, unknown>;
  for (const flagName of FIDELITY_FLAG_NAMES) {
    if (!isBoolean(flags[flagName])) {
      throw new Error(`fidelity flag "${flagName}" must be a boolean`);
    }
  }
  return fidelity;
}

function toFileExtension(value: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.startsWith(".")) {
    throw new Error(
      `file extension must be non-empty and start with a dot, got: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export function buildGeometryExchangeRecord(input: GeometryExchangeInput): GeometryExchangeRecord {
  if (input.direction !== "import" && input.direction !== "export") {
    throw new Error("direction must be import or export");
  }
  return {
    kind: "geometry-exchange-record",
    exchangeId: toKebabId(input.exchangeId),
    toolId: toToolId(input.toolId),
    toolVersion: toSemver(input.toolVersion),
    direction: input.direction,
    formatId: toFormatId(input.formatId),
    fileExtension: toFileExtension(input.fileExtension),
    fidelity: toFidelityFlags(input.fidelity),
    semanticAuthorityRefs: input.semanticAuthorityRefs.map((ref) => {
      if (typeof ref !== "object" || ref === null) {
        throw new Error("semantic authority references must be objects");
      }
      if (!SEMANTIC_AUTHORITY_KINDS.includes(ref.authorityKind)) {
        throw new Error(`unknown semantic authority kind: ${JSON.stringify(ref.authorityKind)}`);
      }
      return {
        authorityKind: ref.authorityKind,
        authorityId: toKebabId(ref.authorityId),
        authorityPackage: toNonEmptyString(ref.authorityPackage),
        workOrderRef: toNonEmptyString(ref.workOrderRef),
        recordDigest: toDigest(ref.recordDigest),
        relationship: toNonEmptyString(ref.relationship),
      };
    }),
    toolSupport: toNonEmptyString(input.toolSupport),
    knownLimitations: (input.knownLimitations ?? []).map((limitation) =>
      toNonEmptyString(limitation),
    ),
    honestyNotes: [
      "fidelity flags are advisory claims about this tool version, not guarantees",
      "format fidelity depends on the tool version, enabled add-ons, and file contents",
    ],
  };
}

export function exchangeRecordDigest(record: GeometryExchangeRecord): Digest {
  return sha256Canonical(record);
}

export function presetBlenderObjExport(
  descriptor: NativeToolDescriptor,
  authorityRefs: readonly SemanticAuthorityRef[],
): GeometryExchangeRecord {
  if (descriptor.toolId !== BLENDER_TOOL_ID) {
    throw new Error("presetBlenderObjExport expects the blender-bpy-headless descriptor");
  }
  return buildGeometryExchangeRecord({
    exchangeId: "blender-obj-export-default",
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    direction: "export",
    formatId: "obj",
    fileExtension: ".obj",
    fidelity: {
      meshGeometry: true,
      brepGeometry: false,
      materials: true,
      textures: true,
      normals: true,
      uvCoordinates: true,
      animations: false,
      instancing: false,
      sceneHierarchy: false,
      unitsAndScaling: false,
      metadata: false,
      overallLossy: true,
    },
    semanticAuthorityRefs: authorityRefs,
    toolSupport: "Blender built-in Wavefront OBJ exporter",
    knownLimitations: [
      "OBJ is unitless; scaling must be agreed out-of-band",
      "modifiers are applied (tessellated); no curve or BRep data survives",
      "no animation or instancing",
    ],
  });
}

export function presetFreecadStepExport(
  descriptor: NativeToolDescriptor,
  authorityRefs: readonly SemanticAuthorityRef[],
): GeometryExchangeRecord {
  if (descriptor.toolId !== FREECAD_TOOL_ID) {
    throw new Error("presetFreecadStepExport expects the freecad-console descriptor");
  }
  return buildGeometryExchangeRecord({
    exchangeId: "freecad-step-export-default",
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    direction: "export",
    formatId: "step",
    fileExtension: ".step",
    fidelity: {
      meshGeometry: false,
      brepGeometry: true,
      materials: true,
      textures: false,
      normals: false,
      uvCoordinates: false,
      animations: false,
      instancing: false,
      sceneHierarchy: true,
      unitsAndScaling: true,
      metadata: false,
      overallLossy: false,
    },
    semanticAuthorityRefs: authorityRefs,
    toolSupport: "FreeCAD Part workbench STEP exporter (OCCT)",
    knownLimitations: [
      "custom document properties are not exported; standard product names survive",
      "tessellated-only models must be converted to shapes before export",
      "tolerance-driven conversions can alter edge representations",
    ],
  });
}
