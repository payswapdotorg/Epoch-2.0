import { sha256Canonical } from "../canonical.js";
import { toFormatId, toPositiveInteger, toSemver, toToolId } from "../validate.js";
import { BLENDER_LICENSE_ID, FREECAD_LICENSE_ID } from "./license.js";
import type { Digest, FormatId, ToolId } from "../types/brands.js";
import type { NativeToolDescriptor, ToolFormatSupport } from "../types/descriptor.js";

export const BLENDER_TOOL_ID: ToolId = toToolId("blender-bpy-headless");
export const FREECAD_TOOL_ID: ToolId = toToolId("freecad-console");

const BLENDER_FORMATS: readonly ToolFormatSupport[] = [
  {
    formatId: toFormatId("3mf"),
    direction: "both",
    viaWhat: "3MF add-on (must be enabled in preferences)",
    requiresAddon: true,
    fidelitySummary: "mesh geometry and materials; no BRep",
  },
  {
    formatId: toFormatId("abc"),
    direction: "both",
    viaWhat: "built-in Alembic importer/exporter",
    requiresAddon: false,
    fidelitySummary: "animated tessellated caches",
  },
  {
    formatId: toFormatId("blend"),
    direction: "both",
    viaWhat: "native document",
    requiresAddon: false,
    fidelitySummary: "full native scene: meshes, curves, modifiers",
  },
  {
    formatId: toFormatId("dae"),
    direction: "both",
    viaWhat: "built-in Collada importer/exporter",
    requiresAddon: false,
    fidelitySummary: "scene graph with transforms and materials",
  },
  {
    formatId: toFormatId("fbx"),
    direction: "both",
    viaWhat: "built-in FBX importer/exporter",
    requiresAddon: false,
    fidelitySummary: "scene graph, armatures, animations",
  },
  {
    formatId: toFormatId("gltf"),
    direction: "both",
    viaWhat: "built-in glTF 2.0 importer/exporter",
    requiresAddon: false,
    fidelitySummary: "glTF 2.0 scenes with PBR materials",
  },
  {
    formatId: toFormatId("obj"),
    direction: "both",
    viaWhat: "built-in Wavefront OBJ importer/exporter",
    requiresAddon: false,
    fidelitySummary: "mesh, normals, UVs, MTL materials; unitless",
  },
  {
    formatId: toFormatId("ply"),
    direction: "both",
    viaWhat: "built-in Stanford PLY importer/exporter",
    requiresAddon: false,
    fidelitySummary: "mesh or point cloud with vertex colors",
  },
  {
    formatId: toFormatId("stl"),
    direction: "both",
    viaWhat: "built-in STL importer/exporter",
    requiresAddon: false,
    fidelitySummary: "unitless triangle mesh only",
  },
  {
    formatId: toFormatId("usd"),
    direction: "both",
    viaWhat: "built-in USD importer/exporter",
    requiresAddon: false,
    fidelitySummary: "USD scenes; Hydra-based pipeline",
  },
  {
    formatId: toFormatId("x3d"),
    direction: "both",
    viaWhat: "built-in X3D importer/exporter",
    requiresAddon: false,
    fidelitySummary: "VRML-lineage scene graph",
  },
];

const FREECAD_FORMATS: readonly ToolFormatSupport[] = [
  {
    formatId: toFormatId("3mf"),
    direction: "export",
    viaWhat: "Mesh workbench 3MF export (lib3mf)",
    requiresAddon: false,
    fidelitySummary: "mesh export; import support varies by version",
  },
  {
    formatId: toFormatId("brep"),
    direction: "both",
    viaWhat: "Part workbench BRep I/O (OCCT)",
    requiresAddon: false,
    fidelitySummary: "exact OCCT BRep solids",
  },
  {
    formatId: toFormatId("fcstd"),
    direction: "both",
    viaWhat: "native document",
    requiresAddon: false,
    fidelitySummary: "full parametric document tree",
  },
  {
    formatId: toFormatId("gltf"),
    direction: "export",
    viaWhat: "glTF export workbench (add-on)",
    requiresAddon: true,
    fidelitySummary: "tessellated mesh export",
  },
  {
    formatId: toFormatId("ifc"),
    direction: "both",
    viaWhat: "BIM workbench (IfcOpenShell)",
    requiresAddon: false,
    fidelitySummary: "BIM models; requires the IfcOpenShell module",
  },
  {
    formatId: toFormatId("iges"),
    direction: "both",
    viaWhat: "Part workbench IGES I/O (OCCT)",
    requiresAddon: false,
    fidelitySummary: "legacy BRep exchange",
  },
  {
    formatId: toFormatId("obj"),
    direction: "both",
    viaWhat: "Mesh workbench OBJ I/O",
    requiresAddon: false,
    fidelitySummary: "tessellated meshes; unitless",
  },
  {
    formatId: toFormatId("ply"),
    direction: "both",
    viaWhat: "Mesh workbench PLY I/O",
    requiresAddon: false,
    fidelitySummary: "tessellated meshes",
  },
  {
    formatId: toFormatId("step"),
    direction: "both",
    viaWhat: "Part workbench STEP I/O (OCCT)",
    requiresAddon: false,
    fidelitySummary: "BRep with units and assembly structure",
  },
  {
    formatId: toFormatId("stl"),
    direction: "both",
    viaWhat: "Mesh/Part STL I/O",
    requiresAddon: false,
    fidelitySummary: "unitless triangle mesh",
  },
];

export function buildBlenderToolDescriptor(input: {
  readonly toolVersion: string;
  readonly descriptorRevision?: number;
}): NativeToolDescriptor {
  const toolVersion = toSemver(input.toolVersion);
  const descriptorRevision =
    input.descriptorRevision === undefined ? 1 : toPositiveInteger(input.descriptorRevision);
  return {
    kind: "native-tool-descriptor",
    toolId: BLENDER_TOOL_ID,
    toolName: "Blender",
    toolVersion,
    processKind: "bpy-headless",
    descriptorRevision,
    argv: {
      binaryName: "blender",
      binaryAliases: [],
      versionProbeArgv: ["--version"],
      headlessFlags: ["--background", "--factory-startup"],
      scriptFlag: "--python",
      scriptArgumentStyle: "flag-value",
      trailingArgsSeparator: "--",
      requiresPythonExitCodeFlag: true,
      shapeNotes: [
        "--python-exit-code 1 must be passed so uncaught script errors produce a non-zero exit status",
        "tokens after the -- separator are forwarded to the script via sys.argv",
      ],
    },
    formats: BLENDER_FORMATS,
    exitCodes: {
      successCode: 0,
      rules: [
        {
          code: 1,
          meaning: "CLI error, or uncaught Python exception when --python-exit-code 1 is passed",
        },
      ],
      unmappedCodeMeaning:
        "any other non-zero exit code; treat as failure and consult captured stderr",
      honestyNotes: [
        "without --python-exit-code, Blender can exit 0 after an uncaught script error; the contract template always includes the flag",
        "exit codes above 1 are not contractually documented by Blender",
      ],
    },
    licenseId: BLENDER_LICENSE_ID,
    capabilities: [
      "python-scripting-bpy",
      "headless-rendering-cycles",
      "mesh-modeling",
      "scene-graph-io",
      "addon-ecosystem",
    ],
    environmentRequirements: [
      "a Blender 4.x binary available on the host PATH",
      "no display server required when --background is used",
      "add-ons beyond factory startup must be installed and enabled explicitly",
    ],
    honestyNotes: [
      "binary availability and exact version are environment facts the host must probe before planning",
      "importer and exporter behavior varies with enabled add-ons; --factory-startup reduces but does not eliminate variance",
    ],
  };
}

export function buildFreecadToolDescriptor(input: {
  readonly toolVersion: string;
  readonly descriptorRevision?: number;
}): NativeToolDescriptor {
  const toolVersion = toSemver(input.toolVersion);
  const descriptorRevision =
    input.descriptorRevision === undefined ? 1 : toPositiveInteger(input.descriptorRevision);
  return {
    kind: "native-tool-descriptor",
    toolId: FREECAD_TOOL_ID,
    toolName: "FreeCAD",
    toolVersion,
    processKind: "console-mode",
    descriptorRevision,
    argv: {
      binaryName: "FreeCADCmd",
      binaryAliases: ["freecadcmd"],
      versionProbeArgv: ["--version"],
      headlessFlags: [],
      scriptFlag: null,
      scriptArgumentStyle: "positional",
      trailingArgsSeparator: null,
      requiresPythonExitCodeFlag: false,
      shapeNotes: [
        "the script path is the first positional argument",
        "additional arguments are forwarded to the script via sys.argv; forwarding details vary slightly across FreeCAD versions",
        "if --version is not supported by the installed build, probe by running a script that prints FreeCAD.Version()",
      ],
    },
    formats: FREECAD_FORMATS,
    exitCodes: {
      successCode: 0,
      rules: [{ code: 1, meaning: "fatal runtime error or explicit sys.exit(1) from the script" }],
      unmappedCodeMeaning: "any other non-zero exit code; treat as failure",
      honestyNotes: [
        "FreeCADCmd can exit 0 even when a script fails unless the script explicitly calls sys.exit with a non-zero code",
        "the stdout JSON status line required by the invocation contract is the primary success signal",
      ],
    },
    licenseId: FREECAD_LICENSE_ID,
    capabilities: [
      "python-scripting",
      "brep-import-export",
      "parametric-modeling",
      "occt-geometry-kernel",
    ],
    environmentRequirements: [
      "a FreeCADCmd console binary available on the host PATH (distribution package names vary)",
      "the IfcOpenShell python module present for IFC support",
    ],
    honestyNotes: [
      "binary availability and exact version are environment facts the host must probe before planning",
      "workbench and dependency availability varies by distribution package and build options",
    ],
  };
}

export function descriptorDigest(descriptor: NativeToolDescriptor): Digest {
  return sha256Canonical(descriptor);
}

export function importableFormats(descriptor: NativeToolDescriptor): readonly FormatId[] {
  return descriptor.formats
    .filter((support) => support.direction !== "export")
    .map((support) => support.formatId);
}

export function exportableFormats(descriptor: NativeToolDescriptor): readonly FormatId[] {
  return descriptor.formats
    .filter((support) => support.direction !== "import")
    .map((support) => support.formatId);
}
