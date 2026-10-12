import { sha256Canonical } from "../canonical.js";
import {
  toFormatId,
  toKebabId,
  toNonEmptyString,
  toSemver,
  toToolId,
  toUtcTimestamp,
} from "../validate.js";
import { BLENDER_TOOL_ID, FREECAD_TOOL_ID, descriptorDigest } from "./descriptor.js";
import type { Digest } from "../types/brands.js";
import type { NativeToolDescriptor } from "../types/descriptor.js";
import type {
  ArgvBinding,
  ArgvToken,
  InvocationContract,
  InvocationPlan,
  InvocationPlanInput,
  InvocationPurpose,
} from "../types/invocation.js";

export const INVOCATION_PURPOSES: readonly InvocationPurpose[] = [
  "import-geometry",
  "export-geometry",
  "convert-geometry",
  "inspect-scene",
  "run-script",
];

export function buildBlenderInvocationContract(
  descriptor: NativeToolDescriptor,
): InvocationContract {
  if (descriptor.toolId !== BLENDER_TOOL_ID) {
    throw new Error("buildBlenderInvocationContract expects the blender-bpy-headless descriptor");
  }
  return {
    kind: "invocation-contract",
    contractId: toKebabId("blender-bpy-headless-standard"),
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    toolDescriptorDigest: descriptorDigest(descriptor),
    purposes: [...INVOCATION_PURPOSES],
    argvTemplate: [
      { kind: "literal", value: "--background" },
      { kind: "literal", value: "--factory-startup" },
      { kind: "literal", value: "--python" },
      { kind: "placeholder", name: toKebabId("script-path"), required: true, repeatable: false },
      { kind: "literal", value: "--python-exit-code" },
      { kind: "literal", value: "1" },
      { kind: "literal", value: "--" },
      { kind: "placeholder", name: toKebabId("script-args"), required: false, repeatable: true },
    ],
    stdin: { kind: "none", records: [] },
    stdoutCapture: {
      maxBytes: 8388608,
      truncation: "drop-head",
      expectsJsonStatusLine: true,
      notes: [
        'the script must emit a final JSON status line like {"status":"ok"} or {"status":"error","reason":"..."}',
        "truncation drops the head so the final status line survives",
      ],
    },
    stderrCapture: {
      maxBytes: 2097152,
      truncation: "drop-head",
      expectsJsonStatusLine: false,
      notes: ["stderr carries diagnostics only"],
    },
    timeout: {
      minTimeoutMs: 1000,
      defaultTimeoutMs: 120000,
      maxTimeoutMs: 1800000,
      onTimeout: "kill-process-tree",
    },
    sandbox: {
      networkAccess: "denied",
      requiresDisplay: false,
      gpuAccess: "allowed",
      readableRoots: ["<workdir>/in/", "<workdir>/scripts/"],
      writableRoots: ["<workdir>/out/", "<workdir>/tmp/"],
      allowedEnvironmentVariables: [
        "PATH",
        "HOME",
        "TMPDIR",
        "BLENDER_USER_CONFIG_DIR",
        "BLENDER_USER_SCRIPTS_DIR",
      ],
      notes: [
        "path placeholders like <workdir> are substituted by the host before execution",
        "constraints are declarative; the host enforces them at spawn time",
      ],
    },
    exitCodes: descriptor.exitCodes,
    honestyNotes: [
      "argv here is data; only the host may spawn the binary",
      "Blender startup logs can interleave with script output; the JSON status line must be the final line",
    ],
  };
}

export function buildFreecadInvocationContract(
  descriptor: NativeToolDescriptor,
): InvocationContract {
  if (descriptor.toolId !== FREECAD_TOOL_ID) {
    throw new Error("buildFreecadInvocationContract expects the freecad-console descriptor");
  }
  return {
    kind: "invocation-contract",
    contractId: toKebabId("freecad-console-standard"),
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    toolDescriptorDigest: descriptorDigest(descriptor),
    purposes: [...INVOCATION_PURPOSES],
    argvTemplate: [
      { kind: "placeholder", name: toKebabId("script-path"), required: true, repeatable: false },
      { kind: "placeholder", name: toKebabId("script-args"), required: false, repeatable: true },
    ],
    stdin: { kind: "none", records: [] },
    stdoutCapture: {
      maxBytes: 8388608,
      truncation: "drop-head",
      expectsJsonStatusLine: true,
      notes: [
        'the script must emit a final JSON status line like {"status":"ok"} or {"status":"error","reason":"..."}',
        "FreeCADCmd can exit 0 on script failure, so the status line is the primary success signal",
      ],
    },
    stderrCapture: {
      maxBytes: 2097152,
      truncation: "drop-head",
      expectsJsonStatusLine: false,
      notes: ["stderr carries diagnostics only"],
    },
    timeout: {
      minTimeoutMs: 1000,
      defaultTimeoutMs: 300000,
      maxTimeoutMs: 3600000,
      onTimeout: "kill-process-tree",
    },
    sandbox: {
      networkAccess: "denied",
      requiresDisplay: false,
      gpuAccess: "denied",
      readableRoots: ["<workdir>/in/", "<workdir>/scripts/"],
      writableRoots: ["<workdir>/out/", "<workdir>/tmp/"],
      allowedEnvironmentVariables: ["PATH", "HOME", "TMPDIR", "FREECAD_USER_HOME"],
      notes: [
        "path placeholders like <workdir> are substituted by the host before execution",
        "constraints are declarative; the host enforces them at spawn time",
      ],
    },
    exitCodes: descriptor.exitCodes,
    honestyNotes: [
      "argv here is data; only the host may spawn the binary",
      "argument forwarding to sys.argv varies slightly across FreeCAD versions",
    ],
  };
}

export function invocationContractDigest(contract: InvocationContract): Digest {
  return sha256Canonical(contract);
}

export function buildInvocationPlan(input: InvocationPlanInput): InvocationPlan {
  if (!INVOCATION_PURPOSES.includes(input.purpose)) {
    throw new Error(`unknown invocation purpose: ${JSON.stringify(input.purpose)}`);
  }
  if (typeof input.requestedGpu !== "boolean") {
    throw new Error("requestedGpu must be a boolean");
  }
  if (!Number.isFinite(input.requestedTimeoutMs)) {
    throw new Error("requestedTimeoutMs must be a finite number");
  }
  return {
    kind: "invocation-plan",
    planId: toKebabId(input.planId),
    toolId: toToolId(input.toolId),
    toolVersion: toSemver(input.toolVersion),
    contractId: toKebabId(input.contractId),
    purpose: input.purpose,
    argvBindings: input.argvBindings.map((binding) => {
      if (typeof binding !== "object" || binding === null) {
        throw new Error("argv bindings must be objects");
      }
      return {
        name: toKebabId(binding.name),
        values: binding.values.map((value) => {
          if (typeof value !== "string") {
            throw new Error("argv binding values must be strings");
          }
          return value;
        }),
      };
    }),
    requestedTimeoutMs: input.requestedTimeoutMs,
    requestedGpu: input.requestedGpu,
    requestedWritePaths: input.requestedWritePaths.map((path) => {
      if (typeof path !== "string" || path.length === 0) {
        throw new Error("requested write paths must be non-empty strings");
      }
      return path;
    }),
    inputFormat: input.inputFormat === null ? null : toFormatId(input.inputFormat),
    outputFormat: input.outputFormat === null ? null : toFormatId(input.outputFormat),
    createdAtUtc: toUtcTimestamp(input.createdAtUtc),
    notes: (input.notes ?? []).map((note) => toNonEmptyString(note)),
  };
}

export function invocationPlanDigest(plan: InvocationPlan): Digest {
  return sha256Canonical(plan);
}

export function resolveArgv(
  template: readonly ArgvToken[],
  bindings: readonly ArgvBinding[],
): readonly string[] {
  const argv: string[] = [];
  for (const token of template) {
    if (token.kind === "literal") {
      argv.push(token.value);
      continue;
    }
    const binding = bindings.find((candidate) => candidate.name === token.name);
    if (binding === undefined) {
      if (token.required) {
        throw new Error(`resolveArgv: missing required binding "${token.name}"`);
      }
      continue;
    }
    argv.push(...binding.values);
  }
  return argv;
}
