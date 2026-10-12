import type { Digest, FormatId, LicenseId, Semver, ToolId } from "./brands.js";
import type { NativeProcessKind } from "./descriptor.js";
import type { CopyleftKind } from "./license.js";
import type { FormatClass } from "./formats.js";

export interface ToolMatrixEntry {
  readonly toolId: ToolId;
  readonly toolName: string;
  readonly toolVersion: Semver;
  readonly processKind: NativeProcessKind;
  readonly licenseId: LicenseId | null;
  readonly copyleft: CopyleftKind | null;
  readonly importFormats: readonly FormatId[];
  readonly exportFormats: readonly FormatId[];
  readonly exchangeRecordCount: number;
}

export interface FormatCoverage {
  readonly formatId: FormatId;
  readonly formatClass: FormatClass | null;
  readonly importTools: readonly ToolId[];
  readonly exportTools: readonly ToolId[];
}

export interface CapabilityMatrixSummary {
  readonly kind: "capability-matrix-summary";
  readonly toolCount: number;
  readonly tools: readonly ToolMatrixEntry[];
  readonly formats: readonly FormatCoverage[];
  readonly totalExchangeRecords: number;
  readonly summary: string;
  readonly digest: Digest;
}
