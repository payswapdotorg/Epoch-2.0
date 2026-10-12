import { digestCanonical } from "../canonical.js";
import { kebabId } from "../validate.js";
import { normalizeDigestRef } from "../types/core.js";
import type { DigestRefInput } from "../types/core.js";
import type {
  SafetyRegressionMeasure,
  SafetyRegressionStatus,
  SafetyRegressionSummary,
} from "../types/safety.js";
import type { TaskFamilyRef } from "../types/task-family.js";
import { normalizeFamilyRefInput, sameTaskFamily } from "./denominators.js";
import type { FamilyRefInput } from "./denominators.js";

const SAFETY_STATUSES: readonly SafetyRegressionStatus[] = [
  "regression",
  "no-regression",
  "unknown",
];

export interface SafetyRegressionMeasureInput {
  readonly measureId: string;
  readonly familyRef: FamilyRefInput;
  readonly taskId: string | null;
  readonly hardConstraintId: string;
  readonly status: SafetyRegressionStatus;
  readonly frontierRef: DigestRefInput;
  readonly evidenceRefs: readonly DigestRefInput[];
}

/** Build a hard-constraint regression measure per W033 semantics. */
export function safetyRegressionMeasure(
  input: SafetyRegressionMeasureInput
): SafetyRegressionMeasure {
  if (!SAFETY_STATUSES.includes(input.status)) {
    throw new TypeError(
      `safetyRegressionMeasure.status: ${SAFETY_STATUSES.map((s) => `'${s}'`).join(" | ")} expected, got: ${JSON.stringify(input.status)}`
    );
  }
  const evidenceRefs = input.evidenceRefs.map((ref) => normalizeDigestRef(ref));
  if (evidenceRefs.length === 0) {
    throw new TypeError(
      "safetyRegressionMeasure: at least one evidence digest ref is required"
    );
  }
  const record: Omit<SafetyRegressionMeasure, "measureDigest"> = {
    kind: "safety-regression-measure",
    measureId: kebabId("safetyRegressionMeasure.measureId", input.measureId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    taskId:
      input.taskId === null
        ? null
        : kebabId("safetyRegressionMeasure.taskId", input.taskId),
    hardConstraintId: kebabId(
      "safetyRegressionMeasure.hardConstraintId",
      input.hardConstraintId
    ),
    status: input.status,
    frontierRef: normalizeDigestRef(input.frontierRef),
    evidenceRefs,
  };
  return { ...record, measureDigest: digestCanonical(record) };
}

/** Aggregate regressions; every regression stays VISIBLE. */
export function summarizeSafetyRegressions(
  measures: readonly SafetyRegressionMeasure[],
  familyRef: TaskFamilyRef | null
): SafetyRegressionSummary {
  const scoped =
    familyRef === null
      ? measures
      : measures.filter((m) => sameTaskFamily(m.familyRef, familyRef));
  let regressions = 0;
  let noRegression = 0;
  let unknown = 0;
  const regressionTaskIds: string[] = [];
  const regressionConstraintIds: string[] = [];
  for (const measure of scoped) {
    if (measure.status === "regression") {
      regressions += 1;
      if (measure.taskId !== null && !regressionTaskIds.includes(measure.taskId)) {
        regressionTaskIds.push(measure.taskId);
      }
      if (!regressionConstraintIds.includes(measure.hardConstraintId)) {
        regressionConstraintIds.push(measure.hardConstraintId);
      }
    } else if (measure.status === "no-regression") {
      noRegression += 1;
    } else {
      unknown += 1;
    }
  }
  return {
    kind: "safety-regression-summary",
    familyRef,
    total: scoped.length,
    regressions,
    noRegression,
    unknown,
    regressionTaskIds,
    regressionConstraintIds,
    hasRegressions: regressions > 0,
  };
}
