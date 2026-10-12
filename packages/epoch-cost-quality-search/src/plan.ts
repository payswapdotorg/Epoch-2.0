import { compareStrings } from "./internal/compare.js";
import { canonicalDigest, isSha256Hex } from "./internal/digest.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isNonEmptyStringArray,
  isObject,
} from "./internal/guards.js";
import type { WorldRevisionRef } from "./generation.js";
import type { ComparisonOp } from "./requirements.js";

/**
 * Implementation planning (W033): per-step verification commands as DATA.
 * This package never executes anything — argv arrays are declarations a
 * capable agent (or station) may choose to run; that authority stays
 * outside this package by law.
 */

export type VerificationRole =
  "typecheck" | "lint" | "format-check" | "test" | "benchmark" | "custom";

export type ExpectedOutcome = "success" | "threshold";

export interface VerificationThreshold {
  readonly metric: string;
  readonly op: ComparisonOp;
  readonly bound: number;
  readonly unit: string;
}

export interface VerificationCommand {
  readonly commandId: string;
  readonly role: VerificationRole;
  /** argv as DATA — never executed by this package. */
  readonly argv: readonly string[];
  readonly expectedOutcome: ExpectedOutcome;
  /** Required when expectedOutcome is "threshold". */
  readonly threshold?: VerificationThreshold;
  readonly description: string;
}

export interface ImplementationStep {
  readonly stepId: string;
  readonly description: string;
  readonly verification: readonly VerificationCommand[];
}

export interface ImplementationPlan {
  readonly planId: string;
  readonly candidateId: string;
  readonly worldRevision: WorldRevisionRef;
  readonly createdDate: string;
  readonly steps: readonly ImplementationStep[];
}

export type PlanIssue =
  | { readonly kind: "invalid-plan"; readonly detail: string }
  | {
      readonly kind: "invalid-step";
      readonly stepId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "invalid-command";
      readonly commandId: string;
      readonly stepId: string;
      readonly detail: string;
    }
  | { readonly kind: "duplicate-step-id"; readonly stepId: string }
  | {
      readonly kind: "duplicate-command-id";
      readonly commandId: string;
      readonly stepId: string;
    };

export interface PlanIntake {
  /** Null when plan-level fields are invalid. */
  readonly plan: ImplementationPlan | null;
  readonly issues: readonly PlanIssue[];
}

const VERIFICATION_ROLES: readonly string[] = [
  "typecheck",
  "lint",
  "format-check",
  "test",
  "benchmark",
  "custom",
];
const EXPECTED_OUTCOMES: readonly string[] = ["success", "threshold"];
const COMPARISON_OPS: readonly string[] = ["<=", ">=", "=="];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Intake gate for plans. Steps are sorted by stepId, commands by commandId.
 * A step with any invalid or duplicated command is dropped whole
 * (all-or-nothing per step); plan-level invalidity yields a null plan.
 */
export function buildImplementationPlan(plan: ImplementationPlan): PlanIntake {
  if (!isObject(plan)) {
    return {
      plan: null,
      issues: [{ kind: "invalid-plan", detail: "plan must be an object" }],
    };
  }
  const planDetail = planProblem(plan);
  if (planDetail !== null) {
    return {
      plan: null,
      issues: [{ kind: "invalid-plan", detail: planDetail }],
    };
  }

  const issues: PlanIssue[] = [];
  const steps: ImplementationStep[] = [];
  const seenStepIds = new Set<string>();
  const rawSteps: readonly unknown[] = Array.isArray(plan.steps)
    ? plan.steps
    : [];
  if (!Array.isArray(plan.steps)) {
    issues.push({
      kind: "invalid-plan",
      detail: "steps must be an array",
    });
  }
  for (const raw of rawSteps) {
    if (!isObject(raw)) {
      issues.push({
        kind: "invalid-step",
        stepId: "<missing>",
        detail: "step must be an object",
      });
      continue;
    }
    const step = raw as unknown as ImplementationStep;
    if (!isNonEmptyString(step.stepId)) {
      issues.push({
        kind: "invalid-step",
        stepId: "<missing>",
        detail: "stepId must be a non-empty string",
      });
      continue;
    }
    if (seenStepIds.has(step.stepId)) {
      issues.push({ kind: "duplicate-step-id", stepId: step.stepId });
      continue;
    }
    if (!isNonEmptyString(step.description)) {
      issues.push({
        kind: "invalid-step",
        stepId: step.stepId,
        detail: "description must be a non-empty string",
      });
      continue;
    }
    if (!Array.isArray(step.verification)) {
      issues.push({
        kind: "invalid-step",
        stepId: step.stepId,
        detail: "verification must be an array",
      });
      continue;
    }
    const commands: VerificationCommand[] = [];
    const seenCommandIds = new Set<string>();
    let stepValid = true;
    for (const rawCommand of step.verification) {
      const command = rawCommand as unknown as VerificationCommand;
      const detail = commandProblem(command);
      if (detail !== null) {
        issues.push({
          kind: "invalid-command",
          commandId: commandIdOf(command),
          stepId: step.stepId,
          detail,
        });
        stepValid = false;
        continue;
      }
      if (seenCommandIds.has(command.commandId)) {
        issues.push({
          kind: "duplicate-command-id",
          commandId: command.commandId,
          stepId: step.stepId,
        });
        stepValid = false;
        continue;
      }
      seenCommandIds.add(command.commandId);
      commands.push(command);
    }
    if (!stepValid) {
      continue;
    }
    seenStepIds.add(step.stepId);
    commands.sort((a, b) => compareStrings(a.commandId, b.commandId));
    steps.push({
      stepId: step.stepId,
      description: step.description,
      verification: commands,
    });
  }

  steps.sort((a, b) => compareStrings(a.stepId, b.stepId));
  issues.sort(comparePlanIssues);
  return {
    plan: {
      planId: plan.planId,
      candidateId: plan.candidateId,
      worldRevision: plan.worldRevision,
      createdDate: plan.createdDate,
      steps,
    },
    issues,
  };
}

/**
 * Content digest over the canonical plan view (steps sorted by stepId,
 * commands sorted by commandId; absent threshold serialized as null).
 */
export function planDigest(plan: ImplementationPlan): string {
  return canonicalDigest({
    kind: "implementation-plan",
    planId: plan.planId,
    candidateId: plan.candidateId,
    worldRevision: plan.worldRevision,
    createdDate: plan.createdDate,
    steps: [...plan.steps]
      .sort((a, b) => compareStrings(a.stepId, b.stepId))
      .map((step) => ({
        stepId: step.stepId,
        description: step.description,
        verification: [...step.verification]
          .sort((a, b) => compareStrings(a.commandId, b.commandId))
          .map((command) => ({
            commandId: command.commandId,
            role: command.role,
            argv: [...command.argv],
            expectedOutcome: command.expectedOutcome,
            threshold:
              command.threshold === undefined ? null : command.threshold,
            description: command.description,
          })),
      })),
  });
}

function planProblem(plan: ImplementationPlan): string | null {
  if (!isNonEmptyString(plan.planId)) {
    return "planId must be a non-empty string";
  }
  if (!isNonEmptyString(plan.candidateId)) {
    return "candidateId must be a non-empty string";
  }
  if (
    !isNonEmptyString(plan.createdDate) ||
    !isValidIsoDate(plan.createdDate)
  ) {
    return "createdDate must be an ISO calendar date (YYYY-MM-DD)";
  }
  const revision: unknown = plan.worldRevision;
  if (!isObject(revision)) {
    return "worldRevision must be an object";
  }
  const worldId: unknown = revision.worldId;
  const digest: unknown = revision.revisionDigest;
  if (!isNonEmptyString(worldId)) {
    return "worldRevision.worldId must be a non-empty string";
  }
  if (typeof digest !== "string" || !isSha256Hex(digest)) {
    return "worldRevision.revisionDigest must be lowercase hex SHA-256";
  }
  return null;
}

function commandProblem(command: VerificationCommand): string | null {
  if (!isObject(command)) {
    return "command must be an object";
  }
  if (!isNonEmptyString(command.commandId)) {
    return "commandId must be a non-empty string";
  }
  if (
    typeof command.role !== "string" ||
    !VERIFICATION_ROLES.includes(command.role)
  ) {
    return `unknown role "${String(command.role)}"`;
  }
  if (!isNonEmptyStringArray(command.argv) || command.argv.length === 0) {
    return "argv must be a non-empty array of non-empty strings";
  }
  if (
    typeof command.expectedOutcome !== "string" ||
    !EXPECTED_OUTCOMES.includes(command.expectedOutcome)
  ) {
    return `unknown expectedOutcome "${String(command.expectedOutcome)}"`;
  }
  if (!isNonEmptyString(command.description)) {
    return "description must be a non-empty string";
  }
  if (command.expectedOutcome === "threshold") {
    const threshold: unknown = command.threshold;
    if (!isObject(threshold)) {
      return "threshold is required when expectedOutcome is threshold";
    }
    const view = threshold as unknown as VerificationThreshold;
    if (!isNonEmptyString(view.metric)) {
      return "threshold metric must be a non-empty string";
    }
    if (typeof view.op !== "string" || !COMPARISON_OPS.includes(view.op)) {
      return "threshold op must be <=, >= or ==";
    }
    if (!isFiniteNumber(view.bound)) {
      return "threshold bound must be a finite number";
    }
    if (!isNonEmptyString(view.unit)) {
      return "threshold unit must be a non-empty string";
    }
    return null;
  }
  if (command.threshold !== undefined) {
    return "threshold is only allowed when expectedOutcome is threshold";
  }
  return null;
}

function commandIdOf(command: unknown): string {
  if (isObject(command)) {
    const id = (command as Record<string, unknown>).commandId;
    if (isNonEmptyString(id)) {
      return id;
    }
  }
  return "<missing>";
}

/** Format-level check only: month 01-12, day 01-31. */
function isValidIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function comparePlanIssues(a: PlanIssue, b: PlanIssue): number {
  const byKind = compareStrings(a.kind, b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  const aId = planIssueId(a);
  const bId = planIssueId(b);
  const byId = compareStrings(aId, bId);
  if (byId !== 0) {
    return byId;
  }
  return compareStrings(planIssueDetail(a), planIssueDetail(b));
}

function planIssueId(issue: PlanIssue): string {
  switch (issue.kind) {
    case "invalid-plan":
      return "";
    case "invalid-step":
    case "duplicate-step-id":
      return issue.stepId;
    case "invalid-command":
    case "duplicate-command-id":
      return `${issue.stepId}/${issue.commandId}`;
  }
}

function planIssueDetail(issue: PlanIssue): string {
  switch (issue.kind) {
    case "invalid-plan":
    case "invalid-step":
    case "invalid-command":
      return issue.detail;
    default:
      return "";
  }
}
