import type { FormatId, LicenseId, Semver, ToolId } from "./brands.js";

export type NativeProcessKind = "bpy-headless" | "console-mode";

export interface ExitCodeRule {
  readonly code: number;
  readonly meaning: string;
}

export interface ExitCodeContract {
  readonly successCode: 0;
  readonly rules: readonly ExitCodeRule[];
  readonly unmappedCodeMeaning: string;
  readonly honestyNotes: readonly string[];
}

export interface BinaryArgvShape {
  readonly binaryName: string;
  readonly binaryAliases: readonly string[];
  readonly versionProbeArgv: readonly string[];
  readonly headlessFlags: readonly string[];
  readonly scriptFlag: string | null;
  readonly scriptArgumentStyle: "flag-value" | "positional";
  readonly trailingArgsSeparator: string | null;
  readonly requiresPythonExitCodeFlag: boolean;
  readonly shapeNotes: readonly string[];
}

export type ToolFormatSupportDirection = "import" | "export" | "both";

export interface ToolFormatSupport {
  readonly formatId: FormatId;
  readonly direction: ToolFormatSupportDirection;
  readonly viaWhat: string;
  readonly requiresAddon: boolean;
  readonly fidelitySummary: string;
}

export interface NativeToolDescriptor {
  readonly kind: "native-tool-descriptor";
  readonly toolId: ToolId;
  readonly toolName: string;
  readonly toolVersion: Semver;
  readonly processKind: NativeProcessKind;
  readonly descriptorRevision: number;
  readonly argv: BinaryArgvShape;
  readonly formats: readonly ToolFormatSupport[];
  readonly exitCodes: ExitCodeContract;
  readonly licenseId: LicenseId;
  readonly capabilities: readonly string[];
  readonly environmentRequirements: readonly string[];
  readonly honestyNotes: readonly string[];
}
