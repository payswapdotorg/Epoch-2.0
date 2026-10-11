// Public entrypoint. Shared types come from the contract home; per-domain
// vocabularies come from the domain modules that own them; values from the
// implementation modules. The public surface is unchanged by the file split.

export type {
  BenchmarkCorpus,
  BenchmarkDescriptor,
  BenchmarkQualificationPolicy,
  BenchmarkResult,
  CapabilityClassId,
  CapabilityUnderTest,
  CorpusItem,
  CorpusProvenance,
  CorpusRepeatability,
  CorpusRef,
  CorpusRights,
  DifferentialBand,
  DifferentialVerdict,
  EvidenceRef,
  HardConstraint,
  KnownLimit,
  MetricDescriptor,
  MetricDirection,
  MetricFamily,
  MetricId,
  MetricMeasurement,
  MetricOutcome,
  MetricSelection,
  QualificationDecision,
  QualificationStatus,
  ReferenceRun,
  TransitionDirection,
} from "./contract.js";

export type {
  CorpusRejection,
  CorpusRejectionCode,
  CorpusValidation,
} from "./corpus.js";

export type {
  DescriptorRejection,
  DescriptorRejectionCode,
  DescriptorValidation,
} from "./descriptor.js";

export type { KnownLimitRejection } from "./limits.js";

export type {
  HarnessError,
  HarnessErrorCode,
  HarnessOutcome,
} from "./harness-measure.js";

export type { MetricRegression, RegressionReport } from "./regression.js";

export type {
  ReleaseBlocker,
  ReleaseBlockerCode,
  ReleaseCandidate,
  ReleasePolicy,
  ReleaseVerdict,
  SupportingResultRef,
} from "./release.js";

export type {
  DiscoveryAdapterErrorCode,
  DiscoveryAdapterOutcome,
} from "./discovery-adapter.js";

export {
  MODULE_MANIFEST,
  moduleManifest,
  type ModuleManifest,
} from "./module.js";

export {
  canonicalJson,
  digestOf,
  isSha256Digest,
  sha256Hex,
} from "./digest.js";

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

export {
  descriptorDigestOf,
  validateBenchmarkDescriptor,
} from "./descriptor.js";

export { validateKnownLimit, validateKnownLimits } from "./limits.js";

export {
  capabilityDigestOf,
  referenceDigestOf,
  verifyResultDigest,
} from "./harness-measure.js";

export { runBenchmark } from "./harness.js";

export { detectRegression } from "./regression.js";

export { evaluateRelease } from "./release.js";

export {
  evidenceRefsFromDiscovered,
  fromDiscoveredCapability,
} from "./discovery-adapter.js";
