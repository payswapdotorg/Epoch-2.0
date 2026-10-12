import type { Digest, FormatId, KebabId, Semver, ToolId, UtcTimestamp } from "./brands.js";
import type { ExitCodeContract } from "./descriptor.js";

export type ArgvToken =
  | { readonly kind: "literal"; readonly value: string }
  | {
      readonly kind: "placeholder";
      readonly name: KebabId;
      readonly required: boolean;
      readonly repeatable: boolean;
    };

export interface ArgvBinding {
  readonly name: KebabId;
  readonly values: readonly string[];
}

export interface StdinRecord {
  readonly name: KebabId;
  readonly shapeSummary: string;
  readonly required: boolean;
}

export interface StdinProtocol {
  readonly kind: "none" | "json-lines";
  readonly records: readonly StdinRecord[];
}

export type CaptureTruncation = "drop-head" | "drop-tail" | "reject-oversize";

export interface CaptureShape {
  readonly maxBytes: number;
  readonly truncation: CaptureTruncation;
  readonly expectsJsonStatusLine: boolean;
  readonly notes: readonly string[];
}

export interface TimeoutPolicy {
  readonly minTimeoutMs: number;
  readonly defaultTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly onTimeout: "kill-process-tree";
}

export type GpuAccessPolicy = "allowed" | "denied" | "unspecified";

export interface SandboxConstraints {
  readonly networkAccess: "denied";
  readonly requiresDisplay: false;
  readonly gpuAccess: GpuAccessPolicy;
  readonly readableRoots: readonly string[];
  readonly writableRoots: readonly string[];
  readonly allowedEnvironmentVariables: readonly string[];
  readonly notes: readonly string[];
}

export type InvocationPurpose =
  | "import-geometry"
  | "export-geometry"
  | "convert-geometry"
  | "inspect-scene"
  | "run-script";

export interface InvocationContract {
  readonly kind: "invocation-contract";
  readonly contractId: KebabId;
  readonly toolId: ToolId;
  readonly toolVersion: Semver;
  readonly toolDescriptorDigest: Digest;
  readonly purposes: readonly InvocationPurpose[];
  readonly argvTemplate: readonly ArgvToken[];
  readonly stdin: StdinProtocol;
  readonly stdoutCapture: CaptureShape;
  readonly stderrCapture: CaptureShape;
  readonly timeout: TimeoutPolicy;
  readonly sandbox: SandboxConstraints;
  readonly exitCodes: ExitCodeContract;
  readonly honestyNotes: readonly string[];
}

export interface InvocationPlan {
  readonly kind: "invocation-plan";
  readonly planId: KebabId;
  readonly toolId: ToolId;
  readonly toolVersion: Semver;
  readonly contractId: KebabId;
  readonly purpose: InvocationPurpose;
  readonly argvBindings: readonly ArgvBinding[];
  readonly requestedTimeoutMs: number;
  readonly requestedGpu: boolean;
  readonly requestedWritePaths: readonly string[];
  readonly inputFormat: FormatId | null;
  readonly outputFormat: FormatId | null;
  readonly createdAtUtc: UtcTimestamp;
  readonly notes: readonly string[];
}

export interface InvocationPlanInput {
  readonly planId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly contractId: string;
  readonly purpose: InvocationPurpose;
  readonly argvBindings: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly requestedTimeoutMs: number;
  readonly requestedGpu: boolean;
  readonly requestedWritePaths: readonly string[];
  readonly inputFormat: string | null;
  readonly outputFormat: string | null;
  readonly createdAtUtc: string;
  readonly notes?: readonly string[];
}
