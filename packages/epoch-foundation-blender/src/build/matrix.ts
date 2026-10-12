import { sha256Canonical } from "../canonical.js";
import { compareStrings, sortedUnique } from "../validate.js";
import { formatCatalogEntry } from "./formats.js";
import { exportableFormats, importableFormats } from "./descriptor.js";
import type { CapabilityMatrixSummary, FormatCoverage, ToolMatrixEntry } from "../types/matrix.js";
import type { GeometryExchangeRecord } from "../types/exchange.js";
import type { LicenseRecord } from "../types/license.js";
import type { NativeToolDescriptor } from "../types/descriptor.js";
import type { Digest } from "../types/brands.js";

export function summarizeCapabilityMatrix(input: {
  readonly descriptors: readonly NativeToolDescriptor[];
  readonly exchangeRecords: readonly GeometryExchangeRecord[];
  readonly licenseRecords: readonly LicenseRecord[];
}): CapabilityMatrixSummary {
  const descriptors = [...input.descriptors].sort((a, b) => compareStrings(a.toolId, b.toolId));
  const tools: readonly ToolMatrixEntry[] = descriptors.map((descriptor) => {
    const license =
      input.licenseRecords.find(
        (candidate) =>
          candidate.toolId === descriptor.toolId &&
          candidate.toolVersion === descriptor.toolVersion,
      ) ?? null;
    return {
      toolId: descriptor.toolId,
      toolName: descriptor.toolName,
      toolVersion: descriptor.toolVersion,
      processKind: descriptor.processKind,
      licenseId: license === null ? null : license.licenseId,
      copyleft: license === null ? null : license.copyleft,
      importFormats: importableFormats(descriptor),
      exportFormats: exportableFormats(descriptor),
      exchangeRecordCount: input.exchangeRecords.filter(
        (record) =>
          record.toolId === descriptor.toolId && record.toolVersion === descriptor.toolVersion,
      ).length,
    };
  });
  const formatIds = sortedUnique(
    descriptors.flatMap((descriptor) => descriptor.formats.map((support) => support.formatId)),
  );
  const formats: readonly FormatCoverage[] = formatIds.map((formatId) => {
    const catalogEntry = formatCatalogEntry(formatId);
    return {
      formatId,
      formatClass: catalogEntry === null ? null : catalogEntry.formatClass,
      importTools: descriptors
        .filter((descriptor) => importableFormats(descriptor).includes(formatId))
        .map((descriptor) => descriptor.toolId),
      exportTools: descriptors
        .filter((descriptor) => exportableFormats(descriptor).includes(formatId))
        .map((descriptor) => descriptor.toolId),
    };
  });
  const toolCount = tools.length;
  const totalExchangeRecords = input.exchangeRecords.length;
  const summary = `${toolCount} tools, ${formats.length} formats, ${totalExchangeRecords} exchange records`;
  const digest: Digest = sha256Canonical({
    kind: "capability-matrix-summary",
    toolCount,
    tools,
    formats,
    totalExchangeRecords,
    summary,
  });
  return {
    kind: "capability-matrix-summary",
    toolCount,
    tools,
    formats,
    totalExchangeRecords,
    summary,
    digest,
  };
}
