// Public entrypoint. Types come from the contract home; values from implementation modules.

export type {
  BenchmarkCorpus, BenchmarkDescriptor, BenchmarkQualificationPolicy, BenchmarkResult,
  CapabilityClassId, CapabilityUnderTest, CorpusItem, CorpusProvenance, CorpusRepeatability,
  CorpusRef, CorpusRejection, CorpusRejectionCode, CorpusRights, CorpusValidation,
  DescriptorRejection, DescriptorRejectionCode, DescriptorValidation, DifferentialBand,
  DifferentialVerdict, DiscoveryAdapterErrorCode, DiscoveryAdapterOutcome, EvidenceRef,
  HardConstraint, HarnessError, HarnessErrorCode, HarnessOutcome, KnownLimit,
  KnownLimitRejection, MetricDescriptor, MetricDirection, MetricFamily, MetricId,
  MetricMeasurement, MetricOutcome, MetricRegression, MetricSelection, QualificationDecision,
  QualificationStatus, ReferenceRun, RegressionReport, ReleaseBlocker, ReleaseBlockerCode,
  ReleaseCandidate, ReleasePolicy, ReleaseVerdict, SupportingResultRef, TransitionDirection,
} from "./contract.js";

export { MODULE_MANIFEST, moduleManifest, type ModuleManifest } from "./module.js";

export { canonicalJson, digestOf, isSha256Digest, sha256Hex } from "./digest.js";

export {
  QUALIFICATION_STATUSES,
  QUALIFICATION_TRANSITIONS,
  isQualifiedStatus,
  rankOf,
  statusSatisfies,
  stepDown,
  transitionDirection,
} from "./qualification.js";

export {
  CLASS_METRIC_SELECTIONS,
  METRIC_CATALOG,
  METRIC_CATALOG_RECORD,
  isMetricInClass,
  knownCapabilityClasses,
  lookupMetricDescriptor,
  metricIdsForClass,
} from "./catalog.js";

export { corpusDigestOf, validateCorpus } from "./corpus.js";

export { descriptorDigestOf, validateBenchmarkDescriptor } from "./descriptor.js";

export { validateKnownLimit, validateKnownLimits } from "./limits.js";

export { capabilityDigestOf, referenceDigestOf, runBenchmark, verifyResultDigest } from "./harness.js";

export { detectRegression } from "./regression.js";

export { evaluateRelease } from "./release.js";

export { evidenceRefsFromDiscovered, fromDiscoveredCapability } from "./discovery-adapter.js";
