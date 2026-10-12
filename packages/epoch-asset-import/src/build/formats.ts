import type {
  FidelityClass,
  FormatFeatureSupport,
  FormatId,
  ImportFormatDescriptor,
} from "../types/format.js";
import { isPlainObject, kebabId, nonEmptyString } from "../validate.js";

export type ImportFormatDescriptorInput = {
  readonly formatId: string;
  readonly displayName: string;
  readonly extensions: readonly string[];
  readonly features: FormatFeatureSupport;
  readonly fidelityClass: string;
  readonly notes: string;
};

const FIDELITY_CLASSES: readonly FidelityClass[] = [
  "full-fidelity",
  "meshes-materials",
  "meshes-only",
];

function isValidFeatures(features: FormatFeatureSupport): boolean {
  return (
    typeof features.meshes === "boolean" &&
    typeof features.materials === "boolean" &&
    typeof features.skeletons === "boolean" &&
    typeof features.animations === "boolean" &&
    typeof features.pbr === "boolean"
  );
}

export function importFormatDescriptor(input: ImportFormatDescriptorInput): ImportFormatDescriptor {
  if (!isPlainObject(input)) {
    throw new Error("importFormatDescriptor: input must be a plain object");
  }
  if (!kebabId(input.formatId)) {
    throw new Error(
      `importFormatDescriptor: formatId must be a kebab id: got ${JSON.stringify(input.formatId)}`,
    );
  }
  if (!nonEmptyString(input.displayName)) {
    throw new Error("importFormatDescriptor: displayName must be a non-empty string");
  }
  if (!Array.isArray(input.extensions) || input.extensions.length === 0) {
    throw new Error("importFormatDescriptor: extensions must be a non-empty array");
  }
  const extensions: readonly string[] = [...input.extensions];
  for (const extension of extensions) {
    if (typeof extension !== "string" || !/^\.[a-z0-9]+$/.test(extension)) {
      throw new Error(`importFormatDescriptor: invalid extension: ${JSON.stringify(extension)}`);
    }
  }
  if (!isPlainObject(input.features) || !isValidFeatures(input.features)) {
    throw new Error("importFormatDescriptor: features must be an object of five booleans");
  }
  if (!(FIDELITY_CLASSES as readonly string[]).includes(input.fidelityClass)) {
    throw new Error(
      `importFormatDescriptor: unknown fidelity class: ${JSON.stringify(input.fidelityClass)}`,
    );
  }
  if (!nonEmptyString(input.notes)) {
    throw new Error("importFormatDescriptor: notes must be a non-empty string");
  }
  return {
    formatId: input.formatId as FormatId,
    displayName: input.displayName,
    extensions,
    features: { ...input.features },
    fidelityClass: input.fidelityClass as FidelityClass,
    notes: input.notes,
  };
}

const RAW_FORMATS: readonly ImportFormatDescriptorInput[] = [
  {
    formatId: "obj",
    displayName: "Wavefront OBJ",
    extensions: [".obj"],
    features: { meshes: true, materials: true, skeletons: false, animations: false, pbr: false },
    fidelityClass: "meshes-materials",
    notes:
      "Assimp-documented surface: polygonal meshes plus MTL-linked materials; no skeletons, animations or PBR.",
  },
  {
    formatId: "fbx",
    displayName: "Autodesk FBX",
    extensions: [".fbx"],
    features: { meshes: true, materials: true, skeletons: true, animations: true, pbr: true },
    fidelityClass: "full-fidelity",
    notes:
      "Assimp-documented surface: meshes, materials, skeletons and animations; PBR channels where the source carries them (e.g. Stingray).",
  },
  {
    formatId: "gltf2",
    displayName: "glTF 2.0",
    extensions: [".gltf"],
    features: { meshes: true, materials: true, skeletons: true, animations: true, pbr: true },
    fidelityClass: "full-fidelity",
    notes:
      "Assimp-documented surface: full glTF 2.0 including PBR materials, skins and animations.",
  },
  {
    formatId: "glb",
    displayName: "glTF 2.0 Binary",
    extensions: [".glb"],
    features: { meshes: true, materials: true, skeletons: true, animations: true, pbr: true },
    fidelityClass: "full-fidelity",
    notes: "Binary container of glTF 2.0; same documented feature surface as gltf2.",
  },
  {
    formatId: "stl",
    displayName: "Stereolithography",
    extensions: [".stl"],
    features: { meshes: true, materials: false, skeletons: false, animations: false, pbr: false },
    fidelityClass: "meshes-only",
    notes:
      "Assimp-documented surface: bare triangle meshes; no materials, skeletons, animations or PBR.",
  },
  {
    formatId: "dae",
    displayName: "Collada",
    extensions: [".dae"],
    features: { meshes: true, materials: true, skeletons: true, animations: true, pbr: false },
    fidelityClass: "meshes-materials",
    notes:
      "Assimp-documented surface: meshes, materials, skinned skeletons and animations; no standardized PBR channel.",
  },
  {
    formatId: "ply",
    displayName: "Stanford PLY",
    extensions: [".ply"],
    features: { meshes: true, materials: true, skeletons: false, animations: false, pbr: false },
    fidelityClass: "meshes-materials",
    notes:
      "Assimp-documented surface: meshes with per-vertex color/material properties; no skeletons, animations or PBR.",
  },
  {
    formatId: "3ds",
    displayName: "Autodesk 3DS",
    extensions: [".3ds"],
    features: { meshes: true, materials: true, skeletons: false, animations: true, pbr: false },
    fidelityClass: "meshes-materials",
    notes:
      "Assimp-documented surface: meshes, materials and keyframe animations; no skeletons or PBR.",
  },
  {
    formatId: "x",
    displayName: "Microsoft DirectX X",
    extensions: [".x"],
    features: { meshes: true, materials: true, skeletons: true, animations: true, pbr: false },
    fidelityClass: "meshes-materials",
    notes: "Assimp-documented surface: meshes, materials, skeletons and animations; no PBR.",
  },
  {
    formatId: "off",
    displayName: "OFF",
    extensions: [".off"],
    features: { meshes: true, materials: false, skeletons: false, animations: false, pbr: false },
    fidelityClass: "meshes-only",
    notes:
      "Assimp-documented surface: bare polygonal meshes; no materials, skeletons, animations or PBR.",
  },
];

export const FORMAT_MATRIX: Readonly<Record<string, ImportFormatDescriptor>> = Object.fromEntries(
  RAW_FORMATS.map((raw): readonly [string, ImportFormatDescriptor] => [
    raw.formatId,
    importFormatDescriptor(raw),
  ]),
);

export function getFormatDescriptor(formatId: string): ImportFormatDescriptor | null {
  const descriptor: ImportFormatDescriptor | undefined = FORMAT_MATRIX[formatId];
  return descriptor === undefined ? null : descriptor;
}

export function listFormatIds(): string[] {
  return Object.keys(FORMAT_MATRIX).sort();
}
