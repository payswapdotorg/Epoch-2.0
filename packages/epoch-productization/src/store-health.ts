import type {
  StoreIntegrityFindingCode,
  StoreIntegrityReport,
} from "./store-integrity.js";

/**
 * Projection of a StoreIntegrityReport into a deterministic health view.
 * Pure projection: no store access, no content, counts only.
 */

export type StoreHealthStatus = "healthy" | "degraded" | "corrupt";

export interface StoreHealthReport {
  readonly kind: "store-health-report";
  readonly status: StoreHealthStatus;
  readonly healthy: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly worlds: number;
  readonly records: number;
  readonly digestChecks: number;
  readonly digestMismatches: number;
  readonly unreadableEntries: number;
  readonly orphanReferences: number;
  readonly summary: string;
}

export function storeHealthReport(report: StoreIntegrityReport): StoreHealthReport {
  const errors = report.findings.filter((item) => item.severity === "error").length;
  const warnings = report.findings.filter((item) => item.severity === "warning").length;
  const status: StoreHealthStatus =
    errors > 0 ? "corrupt" : warnings > 0 ? "degraded" : "healthy";
  return Object.freeze({
    kind: "store-health-report" as const,
    status,
    healthy: status === "healthy",
    errorCount: errors,
    warningCount: warnings,
    worlds: report.worldsChecked,
    records: report.recordsChecked,
    digestChecks: report.digestChecks,
    digestMismatches: countCodes(report, ["world-digest-mismatch", "record-digest-mismatch"]),
    unreadableEntries: countCodes(report, ["world-unreadable", "record-unreadable"]),
    orphanReferences: countCodes(report, ["record-orphan-world", "record-orphan-parent"]),
    summary: `store health: ${status} (${errors} errors, ${warnings} warnings; ${report.worldsChecked} worlds, ${report.recordsChecked} records, ${report.digestChecks} digest checks)`,
  });
}

function countCodes(
  report: StoreIntegrityReport,
  codes: readonly StoreIntegrityFindingCode[],
): number {
  return report.findings.filter((item) => codes.includes(item.code)).length;
}
