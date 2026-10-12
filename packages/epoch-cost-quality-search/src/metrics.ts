import { compareStrings } from "./internal/compare.js";

/**
 * Metric readings and the deterministic worst-case composition of predicted
 * metrics from capability declarations. Values are always DATA: this module
 * never invents a metric value.
 */

/** Direction of "better" for a metric. */
export type MetricDirection = "minimize" | "maximize";

/** Provenance of a metric value. */
export type MetricBasis =
  "capability-declaration" | "measured" | "declared-estimate";

/** A single predicted or measured metric value for a subject. */
export interface MetricReading {
  readonly metricId: string;
  readonly value: number;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly basis: MetricBasis;
}

/**
 * A quality attribute declared by a registered capability for one metric
 * (W023/W027-style declaration data — this package only composes it).
 */
export interface QualityAttribute {
  readonly metricId: string;
  readonly value: number;
  readonly unit: string;
  readonly direction: MetricDirection;
}

/** Why a metric could not be composed for an approach. */
export interface MetricCompositionIssue {
  readonly kind: "direction-conflict" | "unit-conflict";
  readonly metricId: string;
  readonly detail: string;
}

export interface ComposedPredictions {
  /** Composed readings for unambiguous metrics, ordered by metricId. */
  readonly readings: readonly MetricReading[];
  /** Typed issues for metrics that could not be composed. */
  readonly issues: readonly MetricCompositionIssue[];
}

/** One capability's declared attributes, keyed by the capability id. */
export interface PredictionContribution {
  readonly capabilityId: string;
  readonly attributes: readonly QualityAttribute[];
}

/**
 * Deterministic worst-case composition:
 * - every contributor to a metric must agree on unit and direction;
 * - `minimize` metrics predict the LARGEST declared value (the slowest
 *   contributor bounds the approach);
 * - `maximize` metrics predict the SMALLEST declared value.
 * Conflicted metrics are excluded from `readings` and reported in `issues`.
 */
export function composePredictedMetrics(
  contributions: readonly PredictionContribution[],
): ComposedPredictions {
  const byMetric = new Map<string, MetricAccumulator>();
  const issues: MetricCompositionIssue[] = [];

  for (const contribution of contributions) {
    for (const attribute of contribution.attributes) {
      const metricId = attribute.metricId;
      let accumulator = byMetric.get(metricId);
      if (accumulator === undefined) {
        accumulator = {
          metricId,
          unit: attribute.unit,
          direction: attribute.direction,
          worst: attribute.value,
          contributors: [contribution.capabilityId],
          directionConflict: false,
          unitConflict: false,
        };
        byMetric.set(metricId, accumulator);
        continue;
      }
      const contributors = [
        ...accumulator.contributors,
        contribution.capabilityId,
      ];
      if (
        accumulator.direction !== attribute.direction &&
        !accumulator.directionConflict
      ) {
        accumulator.directionConflict = true;
        issues.push({
          kind: "direction-conflict",
          metricId,
          detail:
            `contributors ${contributors.join(", ")} declare directions ` +
            `"${accumulator.direction}" and "${attribute.direction}"`,
        });
      }
      if (accumulator.unit !== attribute.unit && !accumulator.unitConflict) {
        accumulator.unitConflict = true;
        issues.push({
          kind: "unit-conflict",
          metricId,
          detail:
            `contributors ${contributors.join(", ")} declare units ` +
            `"${accumulator.unit}" and "${attribute.unit}"`,
        });
      }
      accumulator.worst =
        attribute.direction === "minimize"
          ? Math.max(accumulator.worst, attribute.value)
          : Math.min(accumulator.worst, attribute.value);
      accumulator.contributors.push(contribution.capabilityId);
    }
  }

  const readings: MetricReading[] = [];
  for (const accumulator of byMetric.values()) {
    if (accumulator.directionConflict || accumulator.unitConflict) {
      continue;
    }
    readings.push({
      metricId: accumulator.metricId,
      value: accumulator.worst,
      unit: accumulator.unit,
      direction: accumulator.direction,
      basis: "capability-declaration",
    });
  }
  readings.sort((a, b) => compareStrings(a.metricId, b.metricId));
  issues.sort(
    (a, b) =>
      compareStrings(a.metricId, b.metricId) || compareStrings(a.kind, b.kind),
  );
  return { readings, issues };
}

/** First reading for `metricId`, or undefined (documented: first match wins). */
export function findReading(
  readings: readonly MetricReading[],
  metricId: string,
): MetricReading | undefined {
  for (const reading of readings) {
    if (reading.metricId === metricId) {
      return reading;
    }
  }
  return undefined;
}

interface MetricAccumulator {
  readonly metricId: string;
  unit: string;
  direction: MetricDirection;
  worst: number;
  contributors: string[];
  directionConflict: boolean;
  unitConflict: boolean;
}
