import { canonicalJson, compareStrings, sha256Hex } from "./canonical.js";
import type { DeploymentPlan } from "./deployment-plan.js";
import type { PackageManifest } from "./packaging.js";
import type { SecretFinding } from "./secret-scan.js";
import type { StoreIntegrityReport } from "./store-integrity.js";

/**
 * Privacy-safe telemetry contract.
 *
 * Safe by construction:
 * - an event carries ONLY a category label, a dotted name label, a
 *   non-negative count and a unit label — no world content, no user
 *   identifiers, no timestamps, no free-form text;
 * - the default policy is DISABLED, requires explicit opt-in, and may
 *   only sink LOCALLY (stderr or a local file). `remoteTransmission`
 *   is the literal type `false`: the contract has no remote shape;
 * - formatting is deterministic: fixed field order, canonical
 *   serialization, stable batch ordering.
 */

export type TelemetryEventCategory =
  | "release"
  | "deployment"
  | "integrity"
  | "security"
  | "packaging";

export type TelemetryUnit =
  | "gates"
  | "steps"
  | "targets"
  | "worlds"
  | "records"
  | "findings"
  | "artifacts"
  | "checks"
  | "events";

export interface TelemetryEvent {
  readonly kind: "telemetry-event";
  readonly category: TelemetryEventCategory;
  readonly name: string;
  readonly count: number;
  readonly unit: TelemetryUnit;
}

export class TelemetryContractError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`telemetry contract violation: ${violations.join("; ")}`);
    this.name = "TelemetryContractError";
    this.violations = violations;
  }
}

export const TELEMETRY_CATEGORIES: readonly TelemetryEventCategory[] = Object.freeze([
  "release",
  "deployment",
  "integrity",
  "security",
  "packaging",
]);

export const TELEMETRY_UNITS: readonly TelemetryUnit[] = Object.freeze([
  "gates",
  "steps",
  "targets",
  "worlds",
  "records",
  "findings",
  "artifacts",
  "checks",
  "events",
]);

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){0,4}$/;
const MAX_COUNT = 1_000_000_000;

export interface TelemetryEventInput {
  readonly category: TelemetryEventCategory | (string & {});
  readonly name: string;
  readonly count: number;
  readonly unit: TelemetryUnit | (string & {});
}

export function createTelemetryEvent(input: TelemetryEventInput): TelemetryEvent {
  const violations: string[] = [];
  if (!TELEMETRY_CATEGORIES.includes(input.category as TelemetryEventCategory)) {
    violations.push(`unknown category ${JSON.stringify(input.category)}`);
  }
  if (
    typeof input.name !== "string" ||
    !NAME_PATTERN.test(input.name) ||
    input.name.length > 64
  ) {
    violations.push("name must be dotted lowercase labels, at most 64 characters");
  }
  if (!Number.isInteger(input.count) || input.count < 0 || input.count > MAX_COUNT) {
    violations.push("count must be an integer between 0 and 1000000000");
  }
  if (!TELEMETRY_UNITS.includes(input.unit as TelemetryUnit)) {
    violations.push(`unknown unit ${JSON.stringify(input.unit)}`);
  }
  if (violations.length > 0) {
    throw new TelemetryContractError(violations);
  }
  return Object.freeze({
    kind: "telemetry-event" as const,
    category: input.category as TelemetryEventCategory,
    name: input.name,
    count: input.count,
    unit: input.unit as TelemetryUnit,
  });
}

export type TelemetrySinkKind = "local-stderr" | "local-file";

export interface TelemetryPolicy {
  readonly kind: "telemetry-policy";
  readonly enabled: boolean;
  readonly sink: TelemetrySinkKind;
  readonly sinkPath: string | null;
  readonly remoteTransmission: false;
  readonly payloadLaw: "counts-and-labels-only";
  readonly consent: "explicit-opt-in";
}

export const DEFAULT_TELEMETRY_POLICY: TelemetryPolicy = Object.freeze({
  kind: "telemetry-policy",
  enabled: false,
  sink: "local-stderr",
  sinkPath: null,
  remoteTransmission: false,
  payloadLaw: "counts-and-labels-only",
  consent: "explicit-opt-in",
});

export interface TelemetryPolicyInput {
  readonly enabled: boolean;
  readonly sink: TelemetrySinkKind | (string & {});
  readonly sinkPath: string | null;
}

export function createTelemetryPolicy(input: TelemetryPolicyInput): TelemetryPolicy {
  const violations: string[] = [];
  const sink = input.sink as TelemetrySinkKind;
  if (sink !== "local-stderr" && sink !== "local-file") {
    violations.push('sink must be "local-stderr" or "local-file" (remote sinks are impossible by contract)');
  }
  if (sink === "local-file" && (input.sinkPath === null || input.sinkPath === "")) {
    violations.push("a local-file sink requires a non-empty sinkPath");
  }
  if (sink === "local-stderr" && input.sinkPath !== null) {
    violations.push("a local-stderr sink must not declare a sinkPath");
  }
  if (input.sinkPath !== null && input.sinkPath.includes("..")) {
    violations.push("sinkPath must stay inside the workspace (no '..' segments)");
  }
  if (violations.length > 0) {
    throw new TelemetryContractError(violations);
  }
  return Object.freeze({
    kind: "telemetry-policy" as const,
    enabled: input.enabled,
    sink,
    sinkPath: input.sinkPath,
    remoteTransmission: false as const,
    payloadLaw: "counts-and-labels-only" as const,
    consent: "explicit-opt-in" as const,
  });
}

export function formatTelemetryLine(event: TelemetryEvent): string {
  return `epoch-telemetry|1|${event.category}|${event.name}|${event.count}|${event.unit}`;
}

export function formatTelemetryBatch(events: readonly TelemetryEvent[]): string {
  return [...events]
    .sort(compareEvents)
    .map((event) => formatTelemetryLine(event))
    .join("\n");
}

export function serializeTelemetryEvent(event: TelemetryEvent): string {
  return canonicalJson(event);
}

export function telemetryEventDigest(event: TelemetryEvent): string {
  return sha256Hex(serializeTelemetryEvent(event));
}

function compareEvents(left: TelemetryEvent, right: TelemetryEvent): number {
  const byCategory = compareStrings(left.category, right.category);
  if (byCategory !== 0) {
    return byCategory;
  }
  const byName = compareStrings(left.name, right.name);
  if (byName !== 0) {
    return byName;
  }
  const byUnit = compareStrings(left.unit, right.unit);
  if (byUnit !== 0) {
    return byUnit;
  }
  return left.count - right.count;
}

export function storeIntegritySummaryEvents(
  report: StoreIntegrityReport,
): readonly TelemetryEvent[] {
  return [
    createTelemetryEvent({
      category: "integrity",
      name: "store.integrity.worlds",
      count: report.worldsChecked,
      unit: "worlds",
    }),
    createTelemetryEvent({
      category: "integrity",
      name: "store.integrity.records",
      count: report.recordsChecked,
      unit: "records",
    }),
    createTelemetryEvent({
      category: "integrity",
      name: "store.integrity.digests",
      count: report.digestChecks,
      unit: "checks",
    }),
    createTelemetryEvent({
      category: "integrity",
      name: "store.integrity.findings",
      count: report.findings.length,
      unit: "findings",
    }),
  ];
}

export function secretScanSummaryEvent(
  findings: readonly SecretFinding[],
): TelemetryEvent {
  return createTelemetryEvent({
    category: "security",
    name: "secret.scan.findings",
    count: findings.length,
    unit: "findings",
  });
}

export function deploymentPlanSummaryEvents(
  plan: DeploymentPlan,
): readonly TelemetryEvent[] {
  const gates = plan.steps.filter((step) => step.kind === "gate").length;
  return [
    createTelemetryEvent({
      category: "deployment",
      name: "deployment.plan.steps",
      count: plan.steps.length,
      unit: "steps",
    }),
    createTelemetryEvent({
      category: "deployment",
      name: "deployment.plan.targets",
      count: plan.targetIds.length,
      unit: "targets",
    }),
    createTelemetryEvent({
      category: "deployment",
      name: "deployment.plan.gates",
      count: gates,
      unit: "gates",
    }),
  ];
}

export function packageManifestSummaryEvents(
  manifest: PackageManifest,
): readonly TelemetryEvent[] {
  return [
    createTelemetryEvent({
      category: "packaging",
      name: "package.manifest.artifacts",
      count: manifest.artifacts.length,
      unit: "artifacts",
    }),
  ];
}
