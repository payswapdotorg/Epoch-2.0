// Drift + regression checks over versioned digests.
// Drift: the same versioned capability declaration MUST yield the same result digest.

import type { BenchmarkResult, MetricOutcome, MetricRegression, RegressionReport } from "./contract.js";
import { lookupMetricDescriptor } from "./catalog.js";
import { rankOf } from "./qualification.js";

export function detectRegression(previous: BenchmarkResult, current: BenchmarkResult): RegressionReport {
  const sameBenchmark = previous.descriptorDigest === current.descriptorDigest;
  const sameCapabilityDeclaration = previous.capabilityDigest === current.capabilityDigest;
  const driftDetected = sameCapabilityDeclaration && previous.resultDigest !== current.resultDigest;
  const rationale: string[] = [];
  const metricRegressions: MetricRegression[] = [];
  const previousOutcomes = new Map<string, MetricOutcome>(
    previous.metricOutcomes.map((outcome): [string, MetricOutcome] => [outcome.metricId, outcome]),
  );
  const newHardConstraintViolations = current.metricOutcomes
    .filter((outcome) => outcome.hardConstraintViolated && previousOutcomes.get(outcome.metricId)?.hardConstraintViolated !== true)
    .map((outcome) => outcome.metricId);
  if (!sameBenchmark) {
    rationale.push(`benchmark-changed:${previous.descriptorDigest}->${current.descriptorDigest}`);
  }
  if (sameBenchmark) {
    for (const outcome of current.metricOutcomes) {
      const before = previousOutcomes.get(outcome.metricId);
      if (before === undefined || before.cutValue === null || outcome.cutValue === null) {
        continue;
      }
      const metric = lookupMetricDescriptor(outcome.metricId);
      if (metric === null) {
        rationale.push(`unknown-metric-skipped:${outcome.metricId}`);
        continue;
      }
      const improvement =
        metric.direction === "higher-is-better" ? outcome.cutValue - before.cutValue : before.cutValue - outcome.cutValue;
      const exceededTolerance = improvement < -metric.regressionTolerance;
      metricRegressions.push({
        metricId: outcome.metricId,
        previousValue: before.cutValue,
        currentValue: outcome.cutValue,
        improvement,
        exceededTolerance,
      });
      if (exceededTolerance) {
        rationale.push(`metric-regression:${outcome.metricId}:improvement=${improvement}`);
      }
    }
  }
  const statusRegression = rankOf(current.decision.to) < rankOf(previous.decision.to);
  if (statusRegression) {
    rationale.push(`status-regression:${previous.decision.to}->${current.decision.to}`);
  }
  if (newHardConstraintViolations.length > 0) {
    rationale.push(`new-hard-constraint-violations:${newHardConstraintViolations.join(",")}`);
  }
  if (driftDetected) {
    rationale.push("drift:same-capability-declaration-different-result-digest");
  }
  const regressionDetected =
    metricRegressions.some((regression) => regression.exceededTolerance) ||
    newHardConstraintViolations.length > 0 ||
    statusRegression;
  return {
    kind: "regression-report",
    regressionDetected,
    sameBenchmark,
    sameCapabilityDeclaration,
    driftDetected,
    metricRegressions,
    newHardConstraintViolations,
    statusRegression,
    rationale,
  };
}
