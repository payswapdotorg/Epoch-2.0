// Metric catalog + per-class metric selections — frozen data, no behavior.
// Law: a capability class SELECTS appropriate metrics; there is no universal score.

import type { CapabilityClassId, MetricDescriptor, MetricId } from "./contract.js";

const catalogEntries: readonly MetricDescriptor[] = [
  {
    id: "correctness/conformance-pass-rate",
    family: "correctness",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.005,
    description: "Fraction of corpus items whose outputs conform to the governing specification.",
  },
  {
    id: "correctness/differential-agreement-rate",
    family: "correctness",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.005,
    description: "Fraction of corpus items whose outputs agree with the reference implementation.",
  },
  {
    id: "tolerance/geometric-deviation-max",
    family: "engineering-tolerance",
    unit: "mm",
    direction: "lower-is-better",
    aggregation: "max",
    regressionTolerance: 0.01,
    description: "Maximum geometric deviation from the reference surface across the corpus.",
  },
  {
    id: "tolerance/bounds-error-rate",
    family: "engineering-tolerance",
    unit: "ratio",
    direction: "lower-is-better",
    aggregation: "mean",
    regressionTolerance: 0.002,
    description: "Fraction of outputs that exceed declared engineering bounds.",
  },
  {
    id: "coverage/input-space-coverage",
    family: "coverage",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.01,
    description: "Fraction of the declared input space exercised by the capability's verified support.",
  },
  {
    id: "coverage/corpus-item-coverage",
    family: "coverage",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.005,
    description: "Fraction of corpus items the capability processes without refusal.",
  },
  {
    id: "reliability/failure-rate",
    family: "reliability",
    unit: "ratio",
    direction: "lower-is-better",
    aggregation: "mean",
    regressionTolerance: 0.002,
    description: "Fraction of runs that terminate in an unplanned failure.",
  },
  {
    id: "reliability/crash-free-run-rate",
    family: "reliability",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.002,
    description: "Fraction of runs that complete without crashing the host process.",
  },
  {
    id: "performance/median-latency-ms",
    family: "performance",
    unit: "ms",
    direction: "lower-is-better",
    aggregation: "median",
    regressionTolerance: 5,
    description: "Median end-to-end latency per corpus item, in milliseconds.",
  },
  {
    id: "performance/peak-memory-mb",
    family: "performance",
    unit: "MB",
    direction: "lower-is-better",
    aggregation: "max",
    regressionTolerance: 16,
    description: "Peak resident memory during a benchmark run, in megabytes.",
  },
  {
    id: "recovery/error-recovery-rate",
    family: "recovery",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.01,
    description: "Fraction of injected error conditions the capability recovers from.",
  },
  {
    id: "recovery/recovery-time-ms",
    family: "recovery",
    unit: "ms",
    direction: "lower-is-better",
    aggregation: "mean",
    regressionTolerance: 10,
    description: "Mean time to restore service after an injected error, in milliseconds.",
  },
  {
    id: "ux/interaction-response-ms",
    family: "ux-accessibility",
    unit: "ms",
    direction: "lower-is-better",
    aggregation: "mean",
    regressionTolerance: 8,
    description: "Mean response time to user interaction, in milliseconds.",
  },
  {
    id: "a11y/guideline-conformance-rate",
    family: "ux-accessibility",
    unit: "ratio",
    direction: "higher-is-better",
    aggregation: "mean",
    regressionTolerance: 0.01,
    description: "Fraction of applicable accessibility guideline checks that pass.",
  },
  {
    id: "lifecycle/maintenance-effort-hours",
    family: "lifecycle-cost",
    unit: "hours",
    direction: "lower-is-better",
    aggregation: "sum",
    regressionTolerance: 2,
    description: "Declared maintenance effort per release cycle, in hours.",
  },
  {
    id: "lifecycle/dependency-risk-score",
    family: "lifecycle-cost",
    unit: "score",
    direction: "lower-is-better",
    aggregation: "mean",
    regressionTolerance: 0.05,
    description: "Declared aggregate dependency risk score in [0,1].",
  },
];

const catalog: Partial<Record<MetricId, MetricDescriptor>> = {};
for (const entry of catalogEntries) {
  catalog[entry.id] = entry;
}

export const METRIC_CATALOG: readonly MetricDescriptor[] = Object.freeze(catalogEntries.slice());

export const METRIC_CATALOG_RECORD: Readonly<Partial<Record<MetricId, MetricDescriptor>>> = Object.freeze(catalog);

const classSelections: Partial<Record<CapabilityClassId, readonly MetricId[]>> = {
  "ifc-ingestion": [
    "correctness/conformance-pass-rate",
    "coverage/corpus-item-coverage",
    "reliability/crash-free-run-rate",
    "performance/median-latency-ms",
    "recovery/error-recovery-rate",
    "lifecycle/dependency-risk-score",
  ],
  "gltf-pipeline": [
    "correctness/conformance-pass-rate",
    "correctness/differential-agreement-rate",
    "coverage/corpus-item-coverage",
    "reliability/failure-rate",
    "performance/median-latency-ms",
    "performance/peak-memory-mb",
  ],
  "occt-geometry": [
    "correctness/differential-agreement-rate",
    "tolerance/geometric-deviation-max",
    "tolerance/bounds-error-rate",
    "coverage/input-space-coverage",
    "performance/median-latency-ms",
    "lifecycle/maintenance-effort-hours",
  ],
  "openusd-composition": [
    "correctness/conformance-pass-rate",
    "coverage/corpus-item-coverage",
    "reliability/crash-free-run-rate",
    "performance/peak-memory-mb",
    "lifecycle/dependency-risk-score",
  ],
  rendering: [
    "correctness/differential-agreement-rate",
    "tolerance/bounds-error-rate",
    "performance/median-latency-ms",
    "performance/peak-memory-mb",
    "ux/interaction-response-ms",
  ],
  "interaction-runtime": [
    "reliability/crash-free-run-rate",
    "performance/median-latency-ms",
    "recovery/recovery-time-ms",
    "ux/interaction-response-ms",
    "a11y/guideline-conformance-rate",
  ],
  timeline: [
    "correctness/conformance-pass-rate",
    "reliability/failure-rate",
    "performance/median-latency-ms",
    "recovery/error-recovery-rate",
  ],
  "durable-persistence": [
    "correctness/conformance-pass-rate",
    "reliability/crash-free-run-rate",
    "recovery/error-recovery-rate",
    "recovery/recovery-time-ms",
    "lifecycle/dependency-risk-score",
  ],
};

export const CLASS_METRIC_SELECTIONS: Readonly<Partial<Record<CapabilityClassId, readonly MetricId[]>>> =
  Object.freeze(classSelections);

export function lookupMetricDescriptor(metricId: MetricId): MetricDescriptor | null {
  return METRIC_CATALOG_RECORD[metricId] ?? null;
}

export function metricIdsForClass(classId: CapabilityClassId): readonly MetricId[] | null {
  return CLASS_METRIC_SELECTIONS[classId] ?? null;
}

export function isMetricInClass(classId: CapabilityClassId, metricId: MetricId): boolean {
  const ids = metricIdsForClass(classId);
  return ids !== null && ids.includes(metricId);
}

export function knownCapabilityClasses(): readonly CapabilityClassId[] {
  return Object.keys(CLASS_METRIC_SELECTIONS).sort();
}
