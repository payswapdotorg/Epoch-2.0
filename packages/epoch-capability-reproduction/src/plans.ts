import type { BenchmarkPlan, BuildPlan, Result } from "./contract";
import { digestRefOf, isDigestRef } from "./digest";
import { ok, refuse } from "./result";

export type PlanReasonCode =
  "empty-plan" | "invalid-ref" | "no-work-items" | "no-outputs";

export type BuildPlanInput = Omit<BuildPlan, "planRef">;
export type BenchmarkPlanInput = Omit<BenchmarkPlan, "planRef">;

/**
 * Planning records only: the factory plans and digests a build; it never
 * builds, deploys, or executes anything.
 */
export function planBuild(
  input: BuildPlanInput,
): Result<BuildPlan, PlanReasonCode> {
  if (input.planId.trim() === "") {
    return refuse("empty-plan", "planId must be non-empty");
  }
  if (!isDigestRef(input.foundationRef)) {
    return refuse("invalid-ref", "foundationRef must be a sha256 digest ref");
  }
  if (input.workItems.length === 0) {
    return refuse("no-work-items", "a build plan needs at least one work item");
  }
  if (input.plannedOutputs.length === 0) {
    return refuse(
      "no-outputs",
      "a build plan needs at least one planned output",
    );
  }
  return ok({ ...input, planRef: digestRefOf(input) });
}

/**
 * Benchmark planning record: W030 benchmark descriptor, the captured behavior
 * case set, and the reproduced candidate (W029 CandidateExport), all by digest.
 */
export function planBenchmark(
  input: BenchmarkPlanInput,
): Result<BenchmarkPlan, PlanReasonCode> {
  if (
    !isDigestRef(input.descriptorRef) ||
    !isDigestRef(input.caseSetRef) ||
    !isDigestRef(input.candidateRef)
  ) {
    return refuse(
      "invalid-ref",
      "descriptorRef, caseSetRef and candidateRef must be sha256 digest refs",
    );
  }
  return ok({ ...input, planRef: digestRefOf(input) });
}
