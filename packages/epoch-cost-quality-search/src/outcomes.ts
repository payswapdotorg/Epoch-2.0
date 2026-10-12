import { compareStrings } from "./internal/compare.js";
import { canonicalDigest } from "./internal/digest.js";
import type { WorldRevisionRef } from "./generation.js";
import type { MetricReading } from "./metrics.js";

/**
 * Actual-versus-predicted outcome tracking (W033). Records are
 * digest-versioned: each record carries the digest of the prediction set
 * it compares against, and the record itself has a content digest, so an
 * outcome can always be tied to the exact predictions that were made.
 * Variances are signed and NEVER rounded.
 */

export interface ActualMeasurement {
  readonly metricId: string;
  readonly actualValue: number;
  readonly unit: string;
  readonly measuredDate: string;
  readonly source: string;
}

export interface ActualVersusPredicted {
  readonly recordId: string;
  readonly candidateId: string;
  readonly worldRevision: WorldRevisionRef;
  readonly predictions: readonly MetricReading[];
  /** Digest of `predictions` — the version link (see computePredictionsDigest). */
  readonly predictionsDigest: string;
  readonly actuals: readonly ActualMeasurement[];
  readonly recordedDate: string;
}

export interface VarianceEntry {
  readonly metricId: string;
  readonly predicted: number;
  readonly actual: number;
  readonly unit: string;
  /** actual - predicted, signed, unrounded. */
  readonly delta: number;
  /** delta / |predicted|; null when the prediction is exactly 0. */
  readonly relativeDelta: number | null;
}

export interface VarianceUnitMismatch {
  readonly metricId: string;
  readonly predictedUnit: string;
  readonly actualUnit: string;
}

export interface VarianceResult {
  /** Matched, unit-consistent variances, sorted by metricId. */
  readonly variances: readonly VarianceEntry[];
  /** Actual metric ids with no matching prediction, sorted. */
  readonly unmatchedActuals: readonly string[];
  /** Predicted metric ids with no matching actual, sorted. */
  readonly missingActuals: readonly string[];
  readonly unitMismatches: readonly VarianceUnitMismatch[];
}

/**
 * Digest over a prediction set in canonical metric order. Duplicate
 * metricIds serialize as given (first occurrence wins in variance
 * computation; the digest keeps them visible).
 */
export function computePredictionsDigest(
  predictions: readonly MetricReading[],
): string {
  return canonicalDigest(
    [...predictions]
      .sort((a, b) => compareStrings(a.metricId, b.metricId))
      .map((reading) => ({ ...reading })),
  );
}

/** Whether the record's declared predictionsDigest matches its predictions. */
export function verifyPredictionsDigest(
  record: ActualVersusPredicted,
): boolean {
  return (
    record.predictionsDigest === computePredictionsDigest(record.predictions)
  );
}

/**
 * Compute variances for one outcome record. First occurrence wins for
 * duplicated metricIds on either side (documented, deterministic).
 */
export function computeVariances(
  record: ActualVersusPredicted,
): VarianceResult {
  const predictedValues = new Map<string, number>();
  const predictedUnits = new Map<string, string>();
  for (const reading of record.predictions) {
    if (!predictedValues.has(reading.metricId)) {
      predictedValues.set(reading.metricId, reading.value);
      predictedUnits.set(reading.metricId, reading.unit);
    }
  }
  const actualValues = new Map<string, number>();
  const actualUnits = new Map<string, string>();
  for (const measurement of record.actuals) {
    if (!actualValues.has(measurement.metricId)) {
      actualValues.set(measurement.metricId, measurement.actualValue);
      actualUnits.set(measurement.metricId, measurement.unit);
    }
  }

  const variances: VarianceEntry[] = [];
  const missingActuals: string[] = [];
  const unitMismatches: VarianceUnitMismatch[] = [];
  for (const metricId of [...predictedValues.keys()].sort(compareStrings)) {
    const actual = actualValues.get(metricId);
    if (actual === undefined) {
      missingActuals.push(metricId);
      continue;
    }
    const predictedUnit = predictedUnits.get(metricId) ?? "";
    const actualUnit = actualUnits.get(metricId) ?? "";
    if (predictedUnit !== actualUnit) {
      unitMismatches.push({ metricId, predictedUnit, actualUnit });
      continue;
    }
    const predicted = predictedValues.get(metricId);
    if (predicted === undefined) {
      continue;
    }
    const delta = actual - predicted;
    variances.push({
      metricId,
      predicted,
      actual,
      unit: predictedUnit,
      delta,
      relativeDelta: predicted === 0 ? null : delta / Math.abs(predicted),
    });
  }

  const unmatchedActuals = [...actualValues.keys()]
    .filter((metricId) => !predictedValues.has(metricId))
    .sort(compareStrings);
  return { variances, unmatchedActuals, missingActuals, unitMismatches };
}

/** Content digest of an outcome record (canonical view, metrics sorted). */
export function outcomeRecordDigest(record: ActualVersusPredicted): string {
  return canonicalDigest({
    kind: "actual-versus-predicted",
    recordId: record.recordId,
    candidateId: record.candidateId,
    worldRevision: record.worldRevision,
    predictionsDigest: record.predictionsDigest,
    predictions: [...record.predictions]
      .sort((a, b) => compareStrings(a.metricId, b.metricId))
      .map((reading) => ({ ...reading })),
    actuals: [...record.actuals]
      .sort((a, b) => compareStrings(a.metricId, b.metricId))
      .map((measurement) => ({ ...measurement })),
    recordedDate: record.recordedDate,
  });
}
