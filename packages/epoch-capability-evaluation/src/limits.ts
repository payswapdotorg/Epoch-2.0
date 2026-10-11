// Known-limit validation (known limits are reported, never hidden).

import type { KnownLimit, KnownLimitRejection } from "./contract.js";
import { isSha256Digest } from "./digest.js";
import { lookupMetricDescriptor } from "./catalog.js";

export function validateKnownLimit(
  limit: KnownLimit,
): KnownLimitRejection | null {
  if (
    typeof limit.id !== "string" ||
    limit.id.trim() === "" ||
    typeof limit.scope !== "string" ||
    limit.scope.trim() === ""
  ) {
    return {
      code: "limit/invalid",
      detail: "limit id/scope must be non-empty strings",
    };
  }
  if (limit.affectedMetrics.length === 0) {
    return {
      code: "limit/invalid",
      detail: `limit ${limit.id} must affect at least one metric`,
    };
  }
  for (const metricId of limit.affectedMetrics) {
    if (lookupMetricDescriptor(metricId) === null) {
      return {
        code: "limit/invalid",
        detail: `limit ${limit.id} references unknown metric ${metricId}`,
      };
    }
  }
  if (typeof limit.mitigation !== "string" || limit.mitigation.trim() === "") {
    return {
      code: "limit/invalid",
      detail: `limit ${limit.id} mitigation must be a non-empty string ("none" when unmitigated)`,
    };
  }
  if (
    !Number.isInteger(limit.acknowledgedAtEpoch) ||
    limit.acknowledgedAtEpoch < 0
  ) {
    return {
      code: "limit/invalid",
      detail: `limit ${limit.id} acknowledgedAtEpoch must be a non-negative integer`,
    };
  }
  if (
    limit.evidenceDigest !== undefined &&
    !isSha256Digest(limit.evidenceDigest)
  ) {
    return {
      code: "limit/invalid",
      detail: `limit ${limit.id} evidenceDigest is malformed`,
    };
  }
  return null;
}

export function validateKnownLimits(
  limits: readonly KnownLimit[],
): KnownLimitRejection | null {
  const seen = new Set<string>();
  for (const limit of limits) {
    const rejection = validateKnownLimit(limit);
    if (rejection !== null) {
      return rejection;
    }
    if (seen.has(limit.id)) {
      return {
        code: "limit/invalid",
        detail: `duplicate limit id ${limit.id}`,
      };
    }
    seen.add(limit.id);
  }
  return null;
}
