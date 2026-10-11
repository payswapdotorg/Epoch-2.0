import { compareStrings } from "./internal/compare.js";
import { canonicalDigest, isSha256Hex } from "./internal/digest.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isNonEmptyStringArray,
  isObject,
} from "./internal/guards.js";
import type {
  MetricDirection,
  PredictionContribution,
  QualityAttribute,
} from "./metrics.js";

/**
 * Registered capability declarations — the only raw material alternative
 * generation may compose from (W023/W027-style declaration refs).
 *
 * This package is NOT the semantic authority for what a capability does:
 * it validates the shape of declarations and composes predicted metrics
 * from `qualityAttributes` exactly as declared. There is no code path
 * that produces a metric value without a declaring capability behind it,
 * so generated alternatives can never invent behavior.
 */

export interface RegisteredCapability {
  readonly capabilityId: string;
  readonly name: string;
  readonly description: string;
  /** Provenance: the package or module that registered this declaration. */
  readonly provider: string;
  /**
   * Digest of the declaration as registered upstream, when known. Must be
   * lowercase hex SHA-256 when present; the registering package stays the
   * semantic authority for it (this package checks shape only).
   */
  readonly registrationDigest?: string;
  readonly tags: readonly string[];
  /** Declared quality attributes — at most one per metric id. */
  readonly qualityAttributes: readonly QualityAttribute[];
}

export type CapabilityIssue =
  | {
      readonly kind: "duplicate-capability-id";
      readonly capabilityId: string;
    }
  | {
      readonly kind: "invalid-capability";
      readonly capabilityId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "duplicate-attribute";
      readonly capabilityId: string;
      readonly metricId: string;
    };

export interface CapabilitiesIntake {
  /** Validated declarations, sorted by capabilityId. */
  readonly capabilities: readonly RegisteredCapability[];
  readonly issues: readonly CapabilityIssue[];
}

const METRIC_DIRECTIONS: readonly string[] = ["minimize", "maximize"];

/**
 * Intake gate: shape-validate declarations, drop duplicates (first
 * occurrence in input order wins) and invalid entries with typed issues.
 * A capability with any invalid or duplicated attribute is dropped whole.
 */
export function prepareCapabilities(
  list: readonly RegisteredCapability[],
): CapabilitiesIntake {
  const capabilities: RegisteredCapability[] = [];
  const issues: CapabilityIssue[] = [];
  const seenIds = new Set<string>();

  for (const entry of list) {
    if (!isObject(entry)) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: "<missing>",
        detail: "capability must be an object",
      });
      continue;
    }
    const capability = entry as unknown as RegisteredCapability;
    const detail = capabilityProblem(capability);
    if (detail !== null) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: isNonEmptyString(capability.capabilityId)
          ? capability.capabilityId
          : "<missing>",
        detail,
      });
      continue;
    }
    if (seenIds.has(capability.capabilityId)) {
      issues.push({
        kind: "duplicate-capability-id",
        capabilityId: capability.capabilityId,
      });
      continue;
    }
    const attributeIssues = attributeProblems(capability);
    if (attributeIssues.length > 0) {
      issues.push(...attributeIssues);
      continue;
    }
    seenIds.add(capability.capabilityId);
    capabilities.push(capability);
  }

  capabilities.sort((a, b) => compareStrings(a.capabilityId, b.capabilityId));
  issues.sort(compareCapabilityIssues);
  return { capabilities, issues };
}

/** First declaration with `capabilityId`, or undefined. */
export function findCapability(
  capabilities: readonly RegisteredCapability[],
  capabilityId: string,
): RegisteredCapability | undefined {
  for (const capability of capabilities) {
    if (capability.capabilityId === capabilityId) {
      return capability;
    }
  }
  return undefined;
}

/** Sorted, de-duplicated metric ids a capability declares attributes for. */
export function capabilityMetricIds(
  capability: RegisteredCapability,
): readonly string[] {
  const ids = capability.qualityAttributes.map((attribute) => attribute.metricId);
  return [...new Set(ids)].sort(compareStrings);
}

/** View of a capability as a prediction contribution (data unchanged). */
export function capabilityPredictionContribution(
  capability: RegisteredCapability,
): PredictionContribution {
  return {
    capabilityId: capability.capabilityId,
    attributes: capability.qualityAttributes.map((attribute) => ({
      ...attribute,
    })),
  };
}

/**
 * Content digest over the validated registry. Canonical view: entries
 * sorted by capabilityId, attributes sorted by metricId; tag order is
 * preserved (tag order is data). Equal registries serialize identically
 * regardless of object key order.
 */
export function registryDigest(
  capabilities: readonly RegisteredCapability[],
): string {
  const view = [...capabilities]
    .sort((a, b) => compareStrings(a.capabilityId, b.capabilityId))
    .map((capability) => ({
      capabilityId: capability.capabilityId,
      name: capability.name,
      description: capability.description,
      provider: capability.provider,
      registrationDigest:
        capability.registrationDigest === undefined
          ? null
          : capability.registrationDigest,
      tags: [...capability.tags],
      qualityAttributes: [...capability.qualityAttributes]
        .sort((a, b) => compareStrings(a.metricId, b.metricId))
        .map((attribute) => ({ ...attribute })),
    }));
  return canonicalDigest({ kind: "capability-registry", capabilities: view });
}

function capabilityProblem(capability: RegisteredCapability): string | null {
  if (!isNonEmptyString(capability.capabilityId)) {
    return "capabilityId must be a non-empty string";
  }
  if (!isNonEmptyString(capability.name)) {
    return "name must be a non-empty string";
  }
  if (!isNonEmptyString(capability.description)) {
    return "description must be a non-empty string";
  }
  if (!isNonEmptyString(capability.provider)) {
    return "provider must be a non-empty string";
  }
  if (
    capability.registrationDigest !== undefined &&
    (typeof capability.registrationDigest !== "string" ||
      !isSha256Hex(capability.registrationDigest))
  ) {
    return "registrationDigest must be lowercase hex SHA-256 when present";
  }
  if (!isNonEmptyStringArray(capability.tags)) {
    return "tags must be an array of non-empty strings";
  }
  if (!Array.isArray(capability.qualityAttributes)) {
    return "qualityAttributes must be an array";
  }
  return null;
}

function attributeProblems(
  capability: RegisteredCapability,
): CapabilityIssue[] {
  const issues: CapabilityIssue[] = [];
  const seenMetrics = new Set<string>();
  for (const raw of capability.qualityAttributes) {
    if (!isObject(raw)) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: capability.capabilityId,
        detail: "quality attribute must be an object",
      });
      continue;
    }
    const attribute = raw as unknown as QualityAttribute;
    if (!isNonEmptyString(attribute.metricId)) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: capability.capabilityId,
        detail: "attribute metricId must be a non-empty string",
      });
      continue;
    }
    if (!isFiniteNumber(attribute.value)) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: capability.capabilityId,
        detail: `attribute ${attribute.metricId}: value must be finite`,
      });
      continue;
    }
    if (!isNonEmptyString(attribute.unit)) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: capability.capabilityId,
        detail: `attribute ${attribute.metricId}: unit must be a non-empty string`,
      });
      continue;
    }
    if (
      typeof attribute.direction !== "string" ||
      !METRIC_DIRECTIONS.includes(attribute.direction)
    ) {
      issues.push({
        kind: "invalid-capability",
        capabilityId: capability.capabilityId,
        detail: `attribute ${attribute.metricId}: unknown direction`,
      });
      continue;
    }
    if (seenMetrics.has(attribute.metricId)) {
      issues.push({
        kind: "duplicate-attribute",
        capabilityId: capability.capabilityId,
        metricId: attribute.metricId,
      });
      continue;
    }
    seenMetrics.add(attribute.metricId);
  }
  return issues;
}

function compareCapabilityIssues(
  a: CapabilityIssue,
  b: CapabilityIssue,
): number {
  const byKind = compareStrings(a.kind, b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  const byId = compareStrings(a.capabilityId, b.capabilityId);
  if (byId !== 0) {
    return byId;
  }
  const aDetail = a.kind === "invalid-capability" ? a.detail : "";
  const bDetail = b.kind === "invalid-capability" ? b.detail : "";
  return compareStrings(aDetail, bDetail);
}
