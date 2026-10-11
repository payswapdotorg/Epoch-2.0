export interface MetricComparison {
  readonly metricId: string;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly predicted: number;
  readonly actual: number;
}

export interface VarianceObservation {
  readonly metricId: string;
  readonly predicted: number;
  readonly actual: number;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly absoluteDelta: number;       // actual - predicted
  readonly relativeDelta: number;       // (actual - predicted) / predicted
  readonly regressed: boolean;          // direction-aware
}

export interface VarianceSummary {
  readonly comparisonCount: number;
  readonly regressionCount: number;
  readonly worstRelativeRegression: number; // max positive relativeDelta among regressed (0 if none)
  readonly maxAbsoluteRelativeDelta: number;
  readonly observations: readonly VarianceObservation[]; // ordered by metricId
}

export interface ActualVersusPredicted {
  readonly recordId: string;
  readonly subjectId: string;
  readonly subjectKind: "baseline" | "candidate";
  readonly revision: WorldRevisionRef;
  readonly planDigest: string;      // link to executed plan ("" if none? no — optional? make required: plans are how implementation happens; but baseline tracking may have no plan. Use `readonly planDigest: string | null`? Cleaner: optional with exactOptional off: `planDigest?: string`. I'll make it required-nullable: `readonly planDigest: string | null`.)
  readonly comparisons: readonly MetricComparison[];
  readonly recordedAt: string;      // ISO 8601 UTC timestamp
  readonly recorder: string;        // provenance: who recorded
  readonly recordDigest: string;    // sha256 over canonical body
}
