// @zcode/epoch-capability-evaluation — contract home (W030).
// Law: every public type of this package is declared in this file and only here.
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
  readonly regressionTolerance: number; // absolute worsening tolerance used by detectRegression
  readonly description: string;
};

/** Differential comparison band against the reference run. */
export type DifferentialBand = {
  readonly comparableTolerance: number; // worsening within this magnitude still counts as comparable
  readonly superiorityMargin: number; // improvement at or beyond this margin counts as superior
};

export type MetricSelection = {
  readonly metricId: MetricId;
  readonly weight: number; // reporting weight in (0,1]; never tradeable against hard constraints
  readonly qualificationThreshold?: number; // absolute, direction-aware
  readonly differential?: DifferentialBand; // present => compared differentially to the reference run
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

export type CorpusRejectionCode =
  | "corpus/invalid-identity"
  | "corpus/unknown-capability-class"
  | "corpus/rights-unclear"
  | "corpus/rights-declined"
  | "corpus/non-repeatable"
  | "corpus/empty"
  | "corpus/invalid-artifact"
  | "corpus/bad-digest"
  | "corpus/duplicate-artifact";

export type CorpusRejection = {
  readonly code: CorpusRejectionCode;
  readonly detail: string;
};

export type CorpusValidation =
  | { readonly ok: true; readonly corpusDigest: string }
  | { readonly ok: false; readonly rejection: CorpusRejection };

export type CorpusRef = {
  readonly corpusId: string;
  readonly corpusVersion: number;
  readonly corpusDigest: string;
};

export type BenchmarkQualificationPolicy = {
  readonly minQualifiedMetrics: number; // minimum count of passing threshold metrics
  readonly minDifferentialMetrics: number; // minimum differentially-evaluated metrics for reference rungs
  readonly evidenceRequired: boolean; // every passing metric must carry a measurement evidence digest
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

export type DescriptorRejectionCode =
  | "descriptor/invalid-identity"
  | "descriptor/unknown-capability-class"
  | "descriptor/corpus-ref-malformed"
  | "descriptor/no-metrics"
  | "descriptor/metric-not-selected-for-class"
  | "descriptor/duplicate-metric"
  | "descriptor/invalid-weight"
  | "descriptor/invalid-threshold"
  | "descriptor/invalid-differential-band"
  | "descriptor/hard-constraint-unknown-metric"
  | "descriptor/duplicate-hard-constraint"
  | "descriptor/invalid-hard-constraint"
  | "descriptor/invalid-qualification-policy";

export type DescriptorRejection = {
  readonly code: DescriptorRejectionCode;
  readonly detail: string;
};

export type DescriptorValidation =
  | { readonly ok: true; readonly descriptorDigest: string }
  | { readonly ok: false; readonly rejection: DescriptorRejection };

/** A declared measurement for one metric; the lab never executes capabilities. */
export type MetricMeasurement = {
  readonly metricId: MetricId;
  readonly value: number;
  readonly samples: number;
  readonly evidenceDigest?: string; // measurement-record digest; demanded by evidenceRequired policies
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
  readonly mitigation: string; // "none" when acknowledged but unmitigated
  readonly acknowledgedAtEpoch: number;
  readonly evidenceDigest?: string;
};

export type KnownLimitRejection = {
  readonly code: "limit/invalid";
  readonly detail: string;
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
  readonly improvement: number | null; // direction-aware capability-minus-reference
  readonly evidenceDigest: string | null;
  readonly verdict: "pass" | "fail" | "not-evaluated";
};

export type QualificationDecision = {
  readonly from: QualificationStatus;
  readonly to: QualificationStatus;
  readonly direction: TransitionDirection;
  readonly qualifiedForRelease: boolean; // false on any hard-constraint violation or failed metric
  readonly hardConstraintViolations: readonly MetricId[];
  readonly failedMetricIds: readonly MetricId[];
  readonly evidenceRefs: readonly string[]; // by digest, sorted and de-duplicated
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

export type HarnessErrorCode =
  | "harness/descriptor-invalid"
  | "harness/class-mismatch"
  | "harness/invalid-capability-declaration"
  | "harness/invalid-reference-run"
  | "harness/reference-benchmark-mismatch"
  | "harness/measurement-metric-not-selected"
  | "harness/duplicate-measurement"
  | "harness/invalid-measurement"
  | "harness/invalid-evidence"
  | "harness/invalid-known-limit"
  | "harness/missing-measurement"
  | "harness/missing-reference-measurement";

export type HarnessError = {
  readonly code: HarnessErrorCode;
  readonly detail: string;
};

export type HarnessOutcome =
  | { readonly ok: true; readonly result: BenchmarkResult }
  | { readonly ok: false; readonly error: HarnessError };

export type MetricRegression = {
  readonly metricId: MetricId;
  readonly previousValue: number;
  readonly currentValue: number;
  readonly improvement: number; // direction-aware; negative = worsening
  readonly exceededTolerance: boolean;
};

export type RegressionReport = {
  readonly kind: "regression-report";
  readonly regressionDetected: boolean;
  readonly sameBenchmark: boolean;
  readonly sameCapabilityDeclaration: boolean;
  readonly driftDetected: boolean; // same versioned capability digest, different result digest
  readonly metricRegressions: readonly MetricRegression[];
  readonly newHardConstraintViolations: readonly MetricId[];
  readonly statusRegression: boolean;
  readonly rationale: readonly string[];
};

export type SupportingResultRef = {
  readonly resultDigest: string;
  readonly benchmarkId: string;
  readonly benchmarkVersion: number;
  readonly descriptorDigest: string;
  readonly capturedAtEpoch: number;
  readonly decision: QualificationDecision;
};

export type ReleaseCandidate = {
  readonly kind: "release-candidate";
  readonly capabilityId: string;
  readonly capabilityClass: CapabilityClassId;
  readonly version: string;
  readonly qualificationStatus: QualificationStatus;
  readonly supportingResults: readonly SupportingResultRef[];
  readonly knownLimits: readonly KnownLimit[];
};

export type ReleasePolicy = {
  readonly requiredStatus: QualificationStatus;
  readonly currentEpoch: number; // logical epoch of this evaluation; staleness is measured against it
  readonly maxEvidenceAgeEpochs: number;
  readonly requiredBenchmarkIds: readonly string[];
  readonly maxUnmitigatedSevereLimits: number;
};

export type ReleaseBlockerCode =
  | "release/status-below-required"
  | "release/no-supporting-results"
  | "release/stale-evidence"
  | "release/missing-required-benchmark"
  | "release/unqualified-supporting-result"
  | "release/unmitigated-severe-limits";

export type ReleaseBlocker = {
  readonly code: ReleaseBlockerCode;
  readonly detail: string;
};

export type ReleaseVerdict = {
  readonly kind: "release-verdict";
  readonly released: boolean;
  readonly statusRequirementMet: boolean;
  readonly blockers: readonly ReleaseBlocker[];
  readonly staleEvidenceDigests: readonly string[];
  readonly rationale: readonly string[];
};

export type DiscoveryAdapterErrorCode =
  "adapter/insufficient-declaration" | "adapter/unknown-capability-class";

export type DiscoveryAdapterOutcome =
  | { readonly ok: true; readonly capability: CapabilityUnderTest }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: DiscoveryAdapterErrorCode;
        readonly detail: string;
      };
    };
