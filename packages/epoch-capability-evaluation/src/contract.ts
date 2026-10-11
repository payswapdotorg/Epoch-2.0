// @zcode/epoch-capability-evaluation — contract home (W030).
// Law: the SHARED type vocabulary is declared here and only here; per-domain
// result/error vocabularies live beside their validators in the domain modules
// (corpus/descriptor/limits/harness-measure/regression/release/discovery-adapter)
// and are re-exported by src/index.ts, so the public surface is unchanged.
// The lab has no execution authority: it is read-only over declarations.

/** Capability qualification ladder; a capability moves UP only via benchmark evidence. */
export type QualificationStatus =
  | "prototype"
  | "named-task-qualified"
  | "reference-comparable"
  | "reference-superior";

export type TransitionDirection = "promotion" | "regression" | "hold";

export type MetricFamily =
  | "correctness"
  | "engineering-tolerance"
  | "coverage"
  | "reliability"
  | "performance"
  | "recovery"
  | "ux-accessibility"
  | "lifecycle-cost";

/** Namespaced metric identifier, e.g. "correctness/conformance-pass-rate". */
export type MetricId = string;

/** Capability class identifier; the frozen registry lives in the catalog module. */
export type CapabilityClassId = string;

export type MetricDirection = "higher-is-better" | "lower-is-better";

export type MetricDescriptor = {
  readonly id: MetricId;
  readonly family: MetricFamily;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly aggregation: "mean" | "median" | "max" | "sum";
  /** Absolute worsening tolerance used by detectRegression. */
  readonly regressionTolerance: number;
  readonly description: string;
};

/** Differential comparison band against the reference run. */
export type DifferentialBand = {
  /** Worsening within this magnitude still counts as comparable. */
  readonly comparableTolerance: number;
  /** Improvement at or beyond this margin counts as superior. */
  readonly superiorityMargin: number;
};

export type MetricSelection = {
  readonly metricId: MetricId;
  /** Reporting weight in (0,1]; never tradeable against hard constraints. */
  readonly weight: number;
  /** Absolute, direction-aware. */
  readonly qualificationThreshold?: number;
  /** Present => compared differentially to the reference run. */
  readonly differential?: DifferentialBand;
};

/** Non-tradeable constraint; violation can never qualify, regardless of other scores. */
export type HardConstraint = {
  readonly metricId: MetricId;
  readonly kind: "minimum" | "maximum";
  readonly value: number;
  readonly rationale: string;
};

export type CorpusRepeatability =
  | {
      readonly kind: "deterministic-seeded";
      readonly generatorId: string;
      readonly generatorVersion: string;
      readonly seed: string;
    }
  | {
      readonly kind: "recorded-artifacts";
      readonly recorderId: string;
      readonly recorderVersion: string;
    }
  | { readonly kind: "unverified" };

export type CorpusRights = {
  readonly licenseId: string;
  readonly permitsBenchmarkUse: boolean;
  readonly clarity: "clear" | "unclear";
};

export type CorpusProvenance = {
  readonly repeatability: CorpusRepeatability;
  readonly rights: CorpusRights;
  readonly notes?: string;
};

export type CorpusItem = {
  readonly id: string;
  readonly contentDigest: string;
  readonly bytes: number;
};

export type BenchmarkCorpus = {
  readonly kind: "benchmark-corpus";
  readonly id: string;
  readonly version: number;
  readonly capabilityClass: CapabilityClassId;
  readonly provenance: CorpusProvenance;
  readonly items: readonly CorpusItem[];
};

export type CorpusRef = {
  readonly corpusId: string;
  readonly corpusVersion: number;
  readonly corpusDigest: string;
};

export type BenchmarkQualificationPolicy = {
  /** Minimum count of passing threshold metrics. */
  readonly minQualifiedMetrics: number;
  /** Minimum differentially-evaluated metrics for reference rungs. */
  readonly minDifferentialMetrics: number;
  /** Every passing metric must carry a measurement evidence digest. */
  readonly evidenceRequired: boolean;
};

export type BenchmarkDescriptor = {
  readonly kind: "benchmark-descriptor";
  readonly id: string;
  readonly version: number;
  readonly capabilityClass: CapabilityClassId;
  readonly corpus: CorpusRef;
  readonly metricSelections: readonly MetricSelection[];
  readonly hardConstraints: readonly HardConstraint[];
  readonly qualificationPolicy: BenchmarkQualificationPolicy;
  readonly notes?: string;
};

/** A declared measurement for one metric; the lab never executes capabilities. */
export type MetricMeasurement = {
  readonly metricId: MetricId;
  readonly value: number;
  readonly samples: number;
  /** Measurement-record digest; demanded by evidenceRequired policies. */
  readonly evidenceDigest?: string;
};

export type EvidenceRef = {
  readonly digest: string;
  readonly source: "discovery-evidence" | "measurement-record";
  readonly benchmarkId?: string;
  readonly benchmarkVersion?: number;
  readonly capturedAtEpoch: number;
};

export type KnownLimit = {
  readonly id: string;
  readonly scope: string;
  readonly affectedMetrics: readonly MetricId[];
  readonly severity: "minor" | "moderate" | "severe";
  /** "none" when acknowledged but unmitigated. */
  readonly mitigation: string;
  readonly acknowledgedAtEpoch: number;
  readonly evidenceDigest?: string;
};

export type CapabilityUnderTest = {
  readonly kind: "capability-under-test";
  readonly capabilityId: string;
  readonly capabilityClass: CapabilityClassId;
  readonly version: string;
  readonly currentStatus: QualificationStatus;
  readonly measurements: readonly MetricMeasurement[];
  readonly evidence: readonly EvidenceRef[];
  readonly knownLimits: readonly KnownLimit[];
};

export type ReferenceRun = {
  readonly kind: "reference-run";
  readonly referenceId: string;
  readonly referenceVersion: string;
  readonly benchmarkId: string;
  readonly benchmarkVersion: number;
  readonly measurements: readonly MetricMeasurement[];
  readonly recordedAtEpoch: number;
};

export type DifferentialVerdict = "superior" | "comparable" | "inferior";

export type MetricOutcome = {
  readonly metricId: MetricId;
  readonly family: MetricFamily;
  readonly cutValue: number | null;
  readonly referenceValue: number | null;
  readonly hardConstraint: HardConstraint | null;
  readonly hardConstraintViolated: boolean;
  readonly thresholdMet: boolean | null;
  readonly differential: DifferentialVerdict | null;
  /** Direction-aware capability-minus-reference. */
  readonly improvement: number | null;
  readonly evidenceDigest: string | null;
  readonly verdict: "pass" | "fail" | "not-evaluated";
};

export type QualificationDecision = {
  readonly from: QualificationStatus;
  readonly to: QualificationStatus;
  readonly direction: TransitionDirection;
  /** False on any hard-constraint violation or failed metric. */
  readonly qualifiedForRelease: boolean;
  readonly hardConstraintViolations: readonly MetricId[];
  readonly failedMetricIds: readonly MetricId[];
  /** By digest, sorted and de-duplicated. */
  readonly evidenceRefs: readonly string[];
  readonly rationale: readonly string[];
};

export type BenchmarkResult = {
  readonly kind: "benchmark-result";
  readonly benchmarkId: string;
  readonly benchmarkVersion: number;
  readonly descriptorDigest: string;
  readonly corpusDigest: string;
  readonly capabilityDigest: string;
  readonly referenceDigest: string;
  readonly metricOutcomes: readonly MetricOutcome[];
  readonly outcomeCounts: {
    readonly passed: number;
    readonly failed: number;
    readonly notEvaluated: number;
  };
  readonly decision: QualificationDecision;
  readonly knownLimits: readonly KnownLimit[];
  readonly resultDigest: string;
};
