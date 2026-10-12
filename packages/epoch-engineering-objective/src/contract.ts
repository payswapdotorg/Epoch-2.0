/**
 * Contract home for @zcode/epoch-engineering-objective (W035).
 *
 * This file is the single source of truth for the public entrypoints of the
 * package. `src/index.ts` must export exactly the runtime names listed here
 * (kinds "function" and "constant"); type names document the typed surface.
 * `assertPublicContract` enforces the match at test time.
 *
 * This package is a read-only measurement layer: no execution authority, and
 * no second semantic authority over W020/W022/W024/W031/W032/W033 semantics.
 */

export const CONTRACT_NAME = "@zcode/epoch-engineering-objective";
export const CONTRACT_REVISION = 1;

/** The laws every record and machine in this package obeys. */
export const CONTRACT_LAWS: readonly string[] = [
  "authority: read-only measurement over lifecycle and evidence records; no execution authority (no process spawning, no filesystem writes, no network)",
  "no-second-authority: W020/W022/W024/W031/W032/W033 semantics stay in their owning packages; records are referenced by digest only",
  "hash: SHA-256 exclusively via node:crypto createHash; digests are lowercase hex",
  "canonical: every digest is computed over canonicalJson (recursively sorted keys, stable scalars)",
  "denominator: automation denominators are explicit data; task classes not explicitly included never count",
  "quality: unverified outputs never count as quality",
  "intervention-gate: fewer interventions count as progress only with acceptable verified quality and no hard-constraint safety regression",
  "visibility: human and arena task executions stay visible and are never counted as automated successes",
  "feasibility-gate: lower-cost abundance claims are made only for feasible solutions",
  "determinism: every machine is a pure function of its inputs; timestamps are inputs, never generated",
];

export type ContractEntryKind = "type" | "function" | "constant";

export interface ContractEntry {
  readonly name: string;
  readonly kind: ContractEntryKind;
  readonly summary: string;
}

type ContractTuple = readonly [name: string, kind: ContractEntryKind, summary: string];

const CONTRACT_TUPLES: readonly ContractTuple[] = [
  ["Sha256Digest", "type", "branded lowercase-hex sha256"],
  ["canonicalJson", "function", "deterministic canonical JSON"],
  ["digestCanonical", "function", "sha256 over canonical JSON"],
  ["isSha256Digest", "function", "digest format guard"],
  ["sha256Hex", "function", "raw sha256 via node:crypto"],
  ["toSha256Digest", "function", "validating digest constructor"],
  ["CONTRACT_LAWS", "constant", "the package laws"],
  ["CONTRACT_NAME", "constant", "package name"],
  ["CONTRACT_REVISION", "constant", "contract revision"],
  ["PUBLIC_CONTRACT", "constant", "this contract"],
  ["ContractAssertion", "type", "assertPublicContract result"],
  ["ContractEntry", "type", "one contract entry"],
  ["ContractEntryKind", "type", "type|function|constant"],
  ["assertPublicContract", "function", "exports match the contract"],
  ["publicContractNames", "function", "all contract names"],
  ["runtimeContractNames", "function", "value names only"],
  ["DigestRef", "type", "digest ref into other packages"],
  ["DigestRefInput", "type", "unvalidated digest ref input"],
  ["DurationMeasure", "type", "duration in minutes"],
  ["EvidenceRef", "type", "W022 evidence reference"],
  ["EvidenceRefInput", "type", "unvalidated evidence ref input"],
  ["KnownNamespace", "type", "documented ref namespace"],
  ["LifecyclePhaseKey", "type", "opaque W022 phase key"],
  ["MonetaryCost", "type", "minor units + currency code"],
  ["QualityAcceptanceThreshold", "type", "minimum acceptable score"],
  ["QualityScore", "type", "score in [0,1] when verified"],
  ["KNOWN_NAMESPACES", "constant", "W020-W033 ref namespaces"],
  ["digestRef", "function", "build a DigestRef"],
  ["durationMeasure", "function", "build a DurationMeasure"],
  ["evidenceRef", "function", "build an EvidenceRef"],
  ["lifecyclePhaseKey", "function", "brand a W022 phase key"],
  ["monetaryCost", "function", "build a MonetaryCost"],
  ["normalizeDigestRef", "function", "revalidate a DigestRef"],
  ["normalizeDurationMeasure", "function", "revalidate a duration"],
  ["normalizeEvidenceRef", "function", "revalidate an EvidenceRef"],
  ["normalizeMonetaryCost", "function", "revalidate a MonetaryCost"],
  ["qualityAcceptanceThreshold", "function", "build a threshold"],
  ["qualityScore", "function", "brand a quality score"],
  ["TaskFamily", "type", "named, versioned task family"],
  ["TaskFamilyRef", "type", "familyId + version ref"],
  ["TaskClassRule", "type", "class with inclusion rationale"],
  ["AutomationDenominator", "type", "explicit count definition"],
  ["AutomationDenominatorDefaultPolicy", "type", "always exclude-unlisted"],
  ["AUTOMATION_DENOMINATOR_DEFAULT_POLICY", "constant", "exclude-unlisted"],
  ["CompletionRecord", "type", "phase-keyed completion record"],
  ["QualityMetricVerification", "type", "W020 verification status"],
  ["VerifiedQuality", "type", "verified; carries a score"],
  ["FailedVerification", "type", "failed; score is null"],
  ["UnverifiedOutput", "type", "unverified; score is null"],
  ["VerifiedQualityMetric", "type", "the quality metric union"],
  ["VerifiedQualityShare", "type", "verified-quality counts"],
  ["BaselineScope", "type", "family/class/task scope"],
  ["BaselineMeasure", "type", "cost/time/intervention baseline"],
  ["InterventionMeasure", "type", "intervention counts and costs"],
  ["InterventionNonQualificationReason", "type", "typed gate block reasons"],
  ["QualifiedInterventionProgress", "type", "gated progress verdict"],
  ["NonQualifyingInterventionProgress", "type", "blocked with typed reason"],
  ["InterventionProgress", "type", "progress verdict union"],
  ["InterventionProgressInput", "type", "gate evaluation input"],
  ["SafetyRegressionStatus", "type", "regression|no|unknown"],
  ["SafetyRegressionMeasure", "type", "hard-constraint regression"],
  ["SafetyRegressionSummary", "type", "counts, visible regressions"],
  ["TaskExecutionMode", "type", "automated|human|arena modes"],
  ["TaskExecutionRecord", "type", "one task execution"],
  ["EscalationRate", "type", "escalation share and visibility"],
  ["CapabilityReuseObservation", "type", "W031/W032 reuse observation"],
  ["ReusedCapability", "type", "per-capability reuse group"],
  ["CapabilityReuseRate", "type", "reuse share and visibility"],
  ["OutcomePrediction", "type", "W033 predicted outcome"],
  ["OutcomeActual", "type", "W033 actual outcome"],
  ["Feasibility", "type", "feasible solution gate"],
  ["PredictionVarianceRecord", "type", "predicted vs actual record"],
  ["AbundanceClaimBlockReason", "type", "typed claim block reasons"],
  ["LowerCostClaim", "type", "claimable lower-cost delta"],
  ["NoAbundanceClaim", "type", "blocked claim with reason"],
  ["AbundanceClaim", "type", "claim union"],
  ["EndToEndStageKey", "type", "the five case stages"],
  ["SealedEndToEndStage", "type", "stage with chain digest"],
  ["EndToEndCase", "type", "five-stage provenance case"],
  ["ProvenanceOk", "type", "chain verified"],
  ["ProvenanceFailure", "type", "chain broken and where"],
  ["ProvenanceVerification", "type", "verification result union"],
  ["Bottleneck", "type", "remaining bottleneck"],
  ["LimitationsReport", "type", "bottlenecks + next constraint"],
  ["END_TO_END_STAGES", "constant", "the canonical stage order"],
  ["CompletionShare", "type", "denominator-scoped counts"],
  ["ClaimableCostDelta", "type", "per-currency claim total"],
  ["InterventionProgressEntry", "type", "task + progress verdict"],
  ["AbundanceEvaluationInput", "type", "evaluation input bundle"],
  ["AbundanceEvaluation", "type", "composed measurement"],
  ["taskFamily", "function", "build and validate a family"],
  ["taskFamilyRef", "function", "family identity ref"],
  ["sameTaskFamily", "function", "id+version equality"],
  ["taskClassRule", "function", "build a class rule"],
  ["automationDenominator", "function", "explicit denominator builder"],
  ["CompletionRecordInput", "type", "completion raw input"],
  ["QualityMetricInput", "type", "quality metric raw input"],
  ["completionRecord", "function", "build and digest a completion"],
  ["qualityMetric", "function", "build a quality metric"],
  ["effectiveQualityScore", "function", "score or null (the law)"],
  ["isVerifiedQualityAcceptable", "function", "verified and above threshold"],
  ["verifiedQualityShare", "function", "verified-quality counts"],
  ["BaselineMeasureInput", "type", "baseline raw input"],
  ["InterventionMeasureInput", "type", "intervention raw input"],
  ["baselineMeasure", "function", "build and digest a baseline"],
  ["interventionMeasure", "function", "build and digest an intervention"],
  ["evaluateInterventionProgress", "function", "apply the intervention gate"],
  ["SafetyRegressionMeasureInput", "type", "safety raw input"],
  ["safetyRegressionMeasure", "function", "build and digest a measure"],
  ["summarizeSafetyRegressions", "function", "counts and visibility"],
  ["TaskExecutionModeInput", "type", "mode raw input"],
  ["TaskExecutionRecordInput", "type", "execution raw input"],
  ["CapabilityReuseObservationInput", "type", "reuse raw input"],
  ["taskExecutionRecord", "function", "build an execution"],
  ["capabilityReuseObservation", "function", "build an observation"],
  ["computeEscalationRate", "function", "escalation share and ids"],
  ["computeCapabilityReuseRate", "function", "reuse share and ids"],
  ["OutcomePredictionInput", "type", "prediction raw input"],
  ["OutcomeActualInput", "type", "actual raw input"],
  ["FeasibilityInput", "type", "feasibility raw input"],
  ["PredictionVarianceRecordInput", "type", "variance raw input"],
  ["predictionVarianceRecord", "function", "build and digest variance"],
  ["evaluateAbundanceClaim", "function", "apply the feasibility gate"],
  ["EndToEndStageSpecInput", "type", "stage raw input"],
  ["EndToEndCaseInput", "type", "case raw input"],
  ["BottleneckInput", "type", "bottleneck raw input"],
  ["LimitationsReportInput", "type", "limitations raw input"],
  ["buildEndToEndCase", "function", "seal the digest chain"],
  ["verifyEndToEndCase", "function", "re-derive the chain"],
  ["buildLimitationsReport", "function", "bottlenecks and constraint"],
  ["evaluateAbundance", "function", "compose the full measurement"],
  ["ModuleArtifact", "type", "manifest artifact entry"],
  ["ModuleArtifactRole", "type", "artifact role"],
  ["MODULE_NAME", "constant", "module name"],
  ["MODULE_ARTIFACTS", "constant", "src artifact manifest"],
  ["moduleIdentityDigest", "function", "manifest digest"],
];

/** The public contract, derived from the compact tuple table above. */
export const PUBLIC_CONTRACT: readonly ContractEntry[] = CONTRACT_TUPLES.map(
  ([name, kind, summary]) => ({ name, kind, summary }),
);

/** All contract names (types, functions and constants). */
export function publicContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.map((entry) => entry.name);
}

/** Runtime (value) contract names — the names index.ts must export. */
export function runtimeContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.filter((entry) => entry.kind !== "type").map((entry) => entry.name);
}

export type ContractAssertion =
  | { readonly ok: true; readonly runtimeExportCount: number }
  | {
      readonly ok: false;
      readonly missing: readonly string[];
      readonly unexpected: readonly string[];
    };

/**
 * Assert that a module's runtime exports match the contract exactly:
 * nothing missing, nothing extra.
 */
export function assertPublicContract(
  moduleExports: Readonly<Record<string, unknown>>,
): ContractAssertion {
  const expected = new Set(runtimeContractNames());
  const actual = new Set(Object.keys(moduleExports));
  const missing = [...expected].filter((name) => !actual.has(name));
  const unexpected = [...actual].filter((name) => !expected.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    return { ok: false, missing, unexpected };
  }
  return { ok: true, runtimeExportCount: actual.size };
}
