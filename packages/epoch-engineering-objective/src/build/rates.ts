import { digestCanonical } from "../canonical.js";
import { booleanFlag, kebabId, nonEmptyString } from "../validate.js";
import { normalizeDigestRef } from "../types/core.js";
import type { DigestRef, DigestRefInput } from "../types/core.js";
import type {
  CapabilityReuseObservation,
  CapabilityReuseRate,
  EscalationRate,
  ReusedCapability,
  TaskExecutionMode,
  TaskExecutionRecord,
} from "../types/rates.js";
import type { TaskFamilyRef } from "../types/task-family.js";
import { normalizeFamilyRefInput, sameTaskFamily } from "./denominators.js";
import type { FamilyRefInput } from "./denominators.js";

export type TaskExecutionModeInput =
  | {
      readonly mode: "automated";
      readonly executedBy: string;
      readonly evidence: DigestRefInput;
    }
  | { readonly mode: "human"; readonly reason: string }
  | { readonly mode: "arena"; readonly ref: DigestRefInput; readonly reason: string };

function normalizeExecutionMode(mode: TaskExecutionModeInput): TaskExecutionMode {
  if (mode === null || typeof mode !== "object" || typeof mode.mode !== "string") {
    throw new TypeError("taskExecutionRecord.mode: execution mode object expected");
  }
  switch (mode.mode) {
    case "automated":
      return {
        mode: "automated",
        executedBy: kebabId(
          "taskExecutionRecord.mode.executedBy",
          mode.executedBy
        ),
        evidence: normalizeDigestRef(mode.evidence),
      };
    case "human":
      return {
        mode: "human",
        reason: nonEmptyString("taskExecutionRecord.mode.reason", mode.reason),
      };
    case "arena":
      return {
        mode: "arena",
        ref: normalizeDigestRef(mode.ref),
        reason: nonEmptyString("taskExecutionRecord.mode.reason", mode.reason),
      };
    default:
      // NOTE: `mode` is narrowed to `never` here (all mode literals are
      // covered above), so the message stringifies the value itself.
      throw new TypeError(
        `taskExecutionRecord.mode: 'automated' | 'human' | 'arena' expected, got: ${JSON.stringify(mode)}`
      );
  }
}

export interface TaskExecutionRecordInput {
  readonly taskId: string;
  readonly familyRef: FamilyRefInput;
  readonly taskClassId: string;
  readonly mode: TaskExecutionModeInput;
  readonly outcome: "succeeded" | "failed" | "abandoned";
}

/**
 * Build one task execution record. Human and arena executions are VISIBLE
 * first-class records; they are never counted as automated successes.
 */
export function taskExecutionRecord(
  input: TaskExecutionRecordInput
): TaskExecutionRecord {
  if (
    input.outcome !== "succeeded" &&
    input.outcome !== "failed" &&
    input.outcome !== "abandoned"
  ) {
    throw new TypeError(
      `taskExecutionRecord.outcome: 'succeeded' | 'failed' | 'abandoned' expected, got: ${JSON.stringify(input.outcome)}`
    );
  }
  return {
    kind: "task-execution-record",
    taskId: kebabId("taskExecutionRecord.taskId", input.taskId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    taskClassId: kebabId("taskExecutionRecord.taskClassId", input.taskClassId),
    mode: normalizeExecutionMode(input.mode),
    outcome: input.outcome,
  };
}

export interface CapabilityReuseObservationInput {
  readonly taskId: string;
  readonly familyRef: FamilyRefInput;
  readonly capabilityKey: string;
  readonly reused: boolean;
  readonly reproductionRef: DigestRefInput;
  readonly learningRef: DigestRefInput;
}

/** Build one reuse observation with W031/W032 digest references. */
export function capabilityReuseObservation(
  input: CapabilityReuseObservationInput
): CapabilityReuseObservation {
  return {
    kind: "capability-reuse-observation",
    taskId: kebabId("capabilityReuseObservation.taskId", input.taskId),
    familyRef: normalizeFamilyRefInput(input.familyRef),
    capabilityKey: kebabId(
      "capabilityReuseObservation.capabilityKey",
      input.capabilityKey
    ),
    reused: booleanFlag("capabilityReuseObservation.reused", input.reused),
    reproductionRef: normalizeDigestRef(input.reproductionRef),
    learningRef: normalizeDigestRef(input.learningRef),
  };
}

/**
 * Escalation share for a family. The visibility law: escalatedTaskIds and
 * automatedSuccessTaskIds are computed from disjoint mode sets — a human or
 * arena task can NEVER appear in automatedSuccessTaskIds.
 */
export function computeEscalationRate(
  rateId: string,
  familyRef: TaskFamilyRef,
  executions: readonly TaskExecutionRecord[]
): EscalationRate {
  const familyExecutions = executions.filter((e) =>
    sameTaskFamily(e.familyRef, familyRef)
  );
  const automated = familyExecutions.filter((e) => e.mode.mode === "automated");
  const automatedSuccesses = automated.filter((e) => e.outcome === "succeeded");
  const human = familyExecutions.filter((e) => e.mode.mode === "human");
  const arena = familyExecutions.filter((e) => e.mode.mode === "arena");
  const escalatedTaskIds = [...human, ...arena].map((e) => e.taskId);
  const automatedSuccessTaskIds = automatedSuccesses.map((e) => e.taskId);
  const totalTasks = familyExecutions.length;
  const rate = totalTasks === 0 ? 0 : (human.length + arena.length) / totalTasks;
  return {
    kind: "escalation-rate",
    rateId: kebabId("computeEscalationRate.rateId", rateId),
    familyRef,
    totalTasks,
    automatedTasks: automated.length,
    automatedSuccesses: automatedSuccesses.length,
    escalatedHumanTasks: human.length,
    escalatedArenaTasks: arena.length,
    escalatedTaskIds,
    automatedSuccessTaskIds,
    rate,
    computedFromDigest: digestCanonical(familyExecutions),
  };
}

/**
 * Capability reuse share. Non-automated tasks stay VISIBLE via
 * visibleNonAutomatedTaskIds and are never folded into reuse successes.
 */
export function computeCapabilityReuseRate(
  rateId: string,
  familyRef: TaskFamilyRef,
  observations: readonly CapabilityReuseObservation[],
  executions: readonly TaskExecutionRecord[]
): CapabilityReuseRate {
  const familyObservations = observations.filter((o) =>
    sameTaskFamily(o.familyRef, familyRef)
  );
  const groups = new Map<
    string,
    {
      reproductionRef: DigestRef;
      learningRef: DigestRef;
      observedTasks: number;
      reusedTaskIds: string[];
    }
  >();
  for (const observation of familyObservations) {
    const group = groups.get(observation.capabilityKey);
    if (group === undefined) {
      groups.set(observation.capabilityKey, {
        reproductionRef: observation.reproductionRef,
        learningRef: observation.learningRef,
        observedTasks: 1,
        reusedTaskIds: observation.reused ? [observation.taskId] : [],
      });
      continue;
    }
    if (
      group.reproductionRef.digest !== observation.reproductionRef.digest ||
      group.learningRef.digest !== observation.learningRef.digest
    ) {
      throw new TypeError(
        `computeCapabilityReuseRate: inconsistent W031/W032 digest refs for capability '${observation.capabilityKey}'`
      );
    }
    group.observedTasks += 1;
    if (observation.reused) {
      group.reusedTaskIds.push(observation.taskId);
    }
  }
  const reusedCapabilities: ReusedCapability[] = [];
  for (const [capabilityKey, group] of groups) {
    reusedCapabilities.push({
      capabilityKey,
      reproductionRef: group.reproductionRef,
      learningRef: group.learningRef,
      observedTasks: group.observedTasks,
      reusedTasks: group.reusedTaskIds.length,
      reusedTaskIds: group.reusedTaskIds,
    });
  }
  const reuseOpportunities = familyObservations.length;
  const reuseEvents = familyObservations.filter((o) => o.reused).length;
  const rate = reuseOpportunities === 0 ? 0 : reuseEvents / reuseOpportunities;
  const familyExecutions = executions.filter((e) =>
    sameTaskFamily(e.familyRef, familyRef)
  );
  const visibleNonAutomatedTaskIds: string[] = [];
  const seen = new Set<string>();
  for (const execution of familyExecutions) {
    if (execution.mode.mode !== "automated" && !seen.has(execution.taskId)) {
      seen.add(execution.taskId);
      visibleNonAutomatedTaskIds.push(execution.taskId);
    }
  }
  return {
    kind: "capability-reuse-rate",
    rateId: kebabId("computeCapabilityReuseRate.rateId", rateId),
    familyRef,
    reuseOpportunities,
    reuseEvents,
    reusedCapabilities,
    rate,
    visibleNonAutomatedTaskIds,
    computedFromDigest: digestCanonical({
      observations: familyObservations,
      executions: familyExecutions,
    }),
  };
}
