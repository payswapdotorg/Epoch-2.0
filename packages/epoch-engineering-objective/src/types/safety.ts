import type { Sha256Digest } from "../canonical.js";
import type { DigestRef, TaskFamilyRef } from "./core.js";

export type SafetyRegressionStatus = "regression" | "no-regression" | "unknown";

/** Hard-constraint regression measure per W033 semantics (W035 item 5). */
export interface SafetyRegressionMeasure {
  readonly kind: "safety-regression-measure";
  readonly measureId: string;
  readonly familyRef: TaskFamilyRef;
  readonly taskId: string | null;
  readonly hardConstraintId: string;
  readonly status: SafetyRegressionStatus;
  readonly frontierRef: DigestRef;
  readonly evidenceRefs: readonly DigestRef[];
  readonly measureDigest: Sha256Digest;
}

/** Aggregated safety summary; regressions stay VISIBLE. */
export interface SafetyRegressionSummary {
  readonly kind: "safety-regression-summary";
  readonly familyRef: TaskFamilyRef | null;
  readonly total: number;
  readonly regressions: number;
  readonly noRegression: number;
  readonly unknown: number;
  readonly regressionTaskIds: readonly string[];
  readonly regressionConstraintIds: readonly string[];
  readonly hasRegressions: boolean;
}
