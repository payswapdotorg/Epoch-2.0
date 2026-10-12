import type { Sha256Digest } from "../canonical.js";
import type { TaskFamilyRef } from "./task-family.js";
import type { AutomationDenominator } from "./task-family.js";
import type { QualityAcceptanceThreshold } from "./core.js";
import type {
  CompletionRecord,
  VerifiedQualityMetric,
  VerifiedQualityShare,
} from "./completion.js";
import type { BaselineMeasure, InterventionMeasure, InterventionProgress } from "./measures.js";
import type { SafetyRegressionMeasure, SafetyRegressionSummary } from "./safety.js";
import type {
  CapabilityReuseObservation,
  CapabilityReuseRate,
  EscalationRate,
  TaskExecutionRecord,
} from "./rates.js";
import type { AbundanceClaim, PredictionVarianceRecord } from "./variance.js";
import type { EndToEndCase, LimitationsReport, ProvenanceVerification } from "./end-to-end.js";

/** Completion counts scoped by the explicit denominator. */
export interface CompletionShare {
  readonly kind: "completion-share";
  readonly total: number;
  readonly completed: number;
  readonly inDenominator: number;
  readonly excludedTaskIds: readonly string[];
}

/** Per-currency total of claimable lower-cost deltas. */
export interface ClaimableCostDelta {
  readonly kind: "claimable-cost-delta";
  readonly currencyCode: string;
  readonly claimedReductionMinorUnits: number;
  readonly claimCount: number;
}

/** One task's intervention-progress verdict. */
export interface InterventionProgressEntry {
  readonly taskId: string;
  readonly progress: InterventionProgress;
}

/** Input bundle for the composite abundance evaluation. */
export interface AbundanceEvaluationInput {
  readonly evaluationId: string;
  readonly denominator: AutomationDenominator;
  readonly completions: readonly CompletionRecord[];
  readonly qualityMetrics: readonly VerifiedQualityMetric[];
  readonly baselines: readonly BaselineMeasure[];
  readonly interventions: readonly InterventionMeasure[];
  readonly executions: readonly TaskExecutionRecord[];
  readonly reuseObservations: readonly CapabilityReuseObservation[];
  readonly safetyMeasures: readonly SafetyRegressionMeasure[];
  readonly variances: readonly PredictionVarianceRecord[];
  readonly qualityAcceptance: QualityAcceptanceThreshold;
  readonly endToEndCase: EndToEndCase | null;
  readonly limitations: LimitationsReport | null;
}

/** The composed, deterministic abundance measurement. */
export interface AbundanceEvaluation {
  readonly kind: "abundance-evaluation";
  readonly evaluationId: string;
  readonly familyRef: TaskFamilyRef;
  readonly denominator: AutomationDenominator;
  readonly completion: CompletionShare;
  readonly verifiedQuality: VerifiedQualityShare;
  readonly escalationRate: EscalationRate;
  readonly capabilityReuseRate: CapabilityReuseRate;
  readonly interventionProgress: readonly InterventionProgressEntry[];
  readonly safety: SafetyRegressionSummary;
  readonly abundanceClaims: readonly AbundanceClaim[];
  readonly claimableCostDeltas: readonly ClaimableCostDelta[];
  readonly visibleNonAutomatedTaskIds: readonly string[];
  readonly endToEndCase: EndToEndCase | null;
  readonly endToEndProvenance: ProvenanceVerification;
  readonly limitations: LimitationsReport | null;
  readonly inputDigest: Sha256Digest;
  readonly evaluationDigest: Sha256Digest;
}
