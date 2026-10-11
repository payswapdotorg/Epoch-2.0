import { canonicalDigest } from "./internal/digest.js";

/**
 * Contract home (W033 module-artifact law): the declarative registry of
 * this package's public exports and its binding laws. The digest below
 * versions the contract; changing the public surface or a law changes it.
 */

export const CONTRACT_PACKAGE_NAME = "@zcode/epoch-cost-quality-search";

export type ContractExportKind = "type" | "function" | "constant";

export interface ContractExport {
  readonly name: string;
  readonly kind: ContractExportKind;
  readonly source: string;
  readonly summary: string;
}

export interface ContractLaw {
  readonly lawId: string;
  readonly statement: string;
}

function entry(
  name: string,
  kind: ContractExportKind,
  source: string,
  summary: string,
): ContractExport {
  return { name, kind, source, summary };
}

function law(lawId: string, statement: string): ContractLaw {
  return { lawId, statement };
}

export const CONTRACT_EXPORTS: readonly ContractExport[] = [
  entry("MetricDirection", "type", "metrics", "direction of better"),
  entry("MetricBasis", "type", "metrics", "value provenance"),
  entry("MetricReading", "type", "metrics", "one metric value"),
  entry("QualityAttribute", "type", "metrics", "declared attribute"),
  entry("MetricCompositionIssue", "type", "metrics", "composition conflict"),
  entry("ComposedPredictions", "type", "metrics", "composition result"),
  entry("PredictionContribution", "type", "metrics", "per-capability attrs"),
  entry("composePredictedMetrics", "function", "metrics", "worst-case composition"),
  entry("findReading", "function", "metrics", "lookup by metric id"),
  entry("HardConstraintKind", "type", "requirements", "constraint family"),
  entry("ComparisonOp", "type", "requirements", "bound comparison"),
  entry("HardConstraint", "type", "requirements", "hard requirement"),
  entry("WeightedPreference", "type", "requirements", "weighted trade-off"),
  entry("RequirementSet", "type", "requirements", "constraints + preferences"),
  entry("RequirementIssue", "type", "requirements", "intake issue"),
  entry("RequirementsIntake", "type", "requirements", "validated requirements"),
  entry("ConstraintCheck", "type", "requirements", "constraint outcome"),
  entry("prepareRequirements", "function", "requirements", "validate requirements"),
  entry("requirementMetricIds", "function", "requirements", "referenced metrics"),
  entry("checkHardConstraint", "function", "requirements", "check one constraint"),
  entry("RegisteredCapability", "type", "capabilities", "capability declaration"),
  entry("CapabilityIssue", "type", "capabilities", "registry intake issue"),
  entry("CapabilitiesIntake", "type", "capabilities", "validated registry"),
  entry("prepareCapabilities", "function", "capabilities", "validate registry"),
  entry("findCapability", "function", "capabilities", "lookup by id"),
  entry("capabilityMetricIds", "function", "capabilities", "declared metric ids"),
  entry(
    "capabilityPredictionContribution",
    "function",
    "capabilities",
    "contribution view",
  ),
  entry("registryDigest", "function", "capabilities", "registry content digest"),
  entry("CostCategory", "type", "cost", "cost family"),
  entry("CostUncertainty", "type", "cost", "point or range"),
  entry("CostEntry", "type", "cost", "one cost record"),
  entry("LifecycleCost", "type", "cost", "per-subject ledger"),
  entry("CurrencyConversion", "type", "cost", "declared rate"),
  entry("CostIssue", "type", "cost", "cost intake issue"),
  entry("CategoryTotal", "type", "cost", "per-category totals"),
  entry("CostAggregate", "type", "cost", "aggregated cost"),
  entry("CostAggregation", "type", "cost", "aggregate + issues"),
  entry("aggregateLifecycleCosts", "function", "cost", "deterministic aggregation"),
  entry("WorldRevisionRef", "type", "generation", "world revision digest ref"),
  entry("SolutionBaseline", "type", "generation", "baseline solution"),
  entry("CandidateDelta", "type", "generation", "capability delta"),
  entry("BaselineRef", "type", "generation", "baseline anchor"),
  entry("SolutionCandidate", "type", "generation", "alternative candidate"),
  entry("GenerationIssue", "type", "generation", "generation issue"),
  entry("GenerationResult", "type", "generation", "generation output"),
  entry("resolveCapabilityRefs", "function", "generation", "apply deltas"),
  entry("deriveProposalRevision", "function", "generation", "derived revision"),
  entry("baselineContentDigest", "function", "generation", "baseline digest"),
  entry("candidateContentDigest", "function", "generation", "candidate digest"),
  entry("generateAlternatives", "function", "generation", "compose alternatives"),
  entry("FrontierOptions", "type", "frontier", "evaluation options"),
  entry("RejectionReason", "type", "frontier", "typed rejection"),
  entry("ObjectiveValue", "type", "frontier", "pareto objective"),
  entry("PreferenceScore", "type", "frontier", "weighted satisfaction"),
  entry("CandidateEvaluation", "type", "frontier", "candidate outcome"),
  entry("FrontierRanking", "type", "frontier", "ranked frontier entry"),
  entry("FrontierResult", "type", "frontier", "evaluation result"),
  entry("evaluateFrontier", "function", "frontier", "feasible/pareto/rank"),
  entry("VerificationRole", "type", "plan", "command role"),
  entry("ExpectedOutcome", "type", "plan", "success or threshold"),
  entry("VerificationThreshold", "type", "plan", "threshold declaration"),
  entry("VerificationCommand", "type", "plan", "command as data"),
  entry("ImplementationStep", "type", "plan", "plan step"),
  entry("ImplementationPlan", "type", "plan", "verification plan"),
  entry("PlanIssue", "type", "plan", "plan intake issue"),
  entry("PlanIntake", "type", "plan", "validated plan"),
  entry("buildImplementationPlan", "function", "plan", "validate plan"),
  entry("planDigest", "function", "plan", "plan content digest"),
  entry("ActualMeasurement", "type", "outcomes", "measured value"),
  entry("ActualVersusPredicted", "type", "outcomes", "outcome record"),
  entry("VarianceEntry", "type", "outcomes", "signed variance"),
  entry("VarianceUnitMismatch", "type", "outcomes", "unit mismatch"),
  entry("VarianceResult", "type", "outcomes", "variance report"),
  entry("computePredictionsDigest", "function", "outcomes", "prediction digest"),
  entry("verifyPredictionsDigest", "function", "outcomes", "check version link"),
  entry("computeVariances", "function", "outcomes", "variance tracking"),
  entry("outcomeRecordDigest", "function", "outcomes", "record digest"),
  entry("CONTRACT_PACKAGE_NAME", "constant", "contract", "package name"),
  entry("ContractExportKind", "type", "contract", "export kind"),
  entry("ContractExport", "type", "contract", "export declaration"),
  entry("ContractLaw", "type", "contract", "law declaration"),
  entry("CONTRACT_EXPORTS", "constant", "contract", "export registry"),
  entry("CONTRACT_LAWS", "constant", "contract", "law registry"),
  entry("contractDigest", "function", "contract", "contract digest"),
  entry("ModuleArtifactEntry", "type", "module", "artifact entry"),
  entry("ModuleManifest", "type", "module", "module manifest"),
  entry("moduleManifest", "constant", "module", "manifest data"),
  entry("moduleManifestDigest", "function", "module", "manifest digest"),
];

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  law(
    "no-execution-authority",
    "the package produces typed data and deterministic classifications only",
  ),
  law(
    "sha256-via-node-crypto",
    "every digest is SHA-256 via node:crypto createHash; never hand-rolled",
  ),
  law(
    "canonical-serialization",
    "digests run over canonical JSON: sorted keys, preserved array order",
  ),
  law(
    "separate-revision-identity",
    "candidates carry their own revision digest and name the baseline revision",
  ),
  law(
    "hard-constraints-fail-closed",
    "any constraint failure, missing metric or unit mismatch rejects regardless of cost",
  ),
  law(
    "preferences-are-data",
    "weighted preferences never reject a candidate; weights are data",
  ),
  law(
    "no-hidden-rounding",
    "cost bounds and points propagate as exact IEEE-754 doubles, never rounded",
  ),
  law(
    "alternatives-from-declarations",
    "generated alternatives compose registered capability declarations only",
  ),
  law(
    "verification-commands-are-data",
    "verification argv arrays are data; running them is outside this package",
  ),
  law(
    "deterministic-ordering",
    "all outputs are ordered lexicographically by identifier",
  ),
];

/** SHA-256 over the canonical contract registry (versions the contract). */
export function contractDigest(): string {
  return canonicalDigest({
    package: CONTRACT_PACKAGE_NAME,
    exports: CONTRACT_EXPORTS,
    laws: CONTRACT_LAWS,
  });
}
