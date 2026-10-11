import {
  canonicalJson,
  compareStrings,
  digestCanonical,
  isHex64,
} from "./canonical.js";
import {
  findDeploymentTarget,
  type DeploymentTarget,
  type ReleaseArtifactKind,
} from "./deployment-targets.js";
import {
  defineReleaseCommand,
  releaseChecklist,
  type ReleaseCommand,
  type ReleaseCommandEnv,
  type ReleaseGateId,
} from "./release-checklist.js";

/**
 * Deterministic deployment plans.
 *
 * deriveDeploymentPlan turns validated inputs into a frozen plan whose
 * steps carry command DATA. This package never executes any of it:
 * - kind "gate" mirrors the release checklist (repo-owned commands);
 * - kind "verify" drives this package's pure verifiers through the QA
 *   harness (qa/epoch-productization/run-plan-step.mjs);
 * - kind "deploy" is executor-defined on purpose: argv is empty and
 *   commandPolicy is "executor-defined" — delivery authority stays with
 *   the release executor, never with this package.
 */

export interface DeploymentPlanInput {
  readonly kind: "deployment-plan-input";
  readonly version: string;
  readonly commit: string;
  readonly targetIds: readonly string[];
}

export type DeploymentStepKind = "gate" | "verify" | "deploy";

export type CommandPolicy = "defined" | "executor-defined";

export interface DeploymentPlanStep {
  readonly id: string;
  readonly ordering: number;
  readonly kind: DeploymentStepKind;
  readonly label: string;
  readonly command: ReleaseCommand;
  readonly commandPolicy: CommandPolicy;
  readonly gateId: ReleaseGateId | null;
  readonly verification: string | null;
  readonly targets: readonly string[];
  readonly artifacts: readonly ReleaseArtifactKind[];
}

export interface DeploymentPlan {
  readonly kind: "deployment-plan";
  readonly version: string;
  readonly commit: string;
  readonly targetIds: readonly string[];
  readonly steps: readonly DeploymentPlanStep[];
  readonly planDigest: string;
}

export type DeploymentPlanErrorCode =
  | "invalid-input-kind"
  | "invalid-version"
  | "invalid-commit"
  | "empty-targets"
  | "unknown-target"
  | "duplicate-target";

export class DeploymentPlanError extends Error {
  readonly code: DeploymentPlanErrorCode;
  readonly detail: string;

  constructor(code: DeploymentPlanErrorCode, detail: string) {
    super(`deployment plan error (${code}): ${detail}`);
    this.name = "DeploymentPlanError";
    this.code = code;
    this.detail = detail;
  }
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const HARNESS = ["node", "qa/epoch-productization/run-plan-step.mjs"];

interface StepSeed {
  readonly kind: DeploymentStepKind;
  readonly label: string;
  readonly command: ReleaseCommand;
  readonly commandPolicy: CommandPolicy;
  readonly gateId: ReleaseGateId | null;
  readonly verification: string | null;
  readonly targets: readonly string[];
  readonly artifacts: readonly ReleaseArtifactKind[];
}

export function deriveDeploymentPlan(input: DeploymentPlanInput): DeploymentPlan {
  if (input.kind !== "deployment-plan-input") {
    throw new DeploymentPlanError(
      "invalid-input-kind",
      'expected kind "deployment-plan-input"',
    );
  }
  if (!SEMVER_PATTERN.test(input.version)) {
    throw new DeploymentPlanError(
      "invalid-version",
      `version ${JSON.stringify(input.version)} is not semver`,
    );
  }
  if (!COMMIT_PATTERN.test(input.commit)) {
    throw new DeploymentPlanError(
      "invalid-commit",
      `commit ${JSON.stringify(input.commit)} is not 40 lowercase hex characters`,
    );
  }
  if (input.targetIds.length === 0) {
    throw new DeploymentPlanError(
      "empty-targets",
      "at least one deployment target is required",
    );
  }
  const seen = new Set<string>();
  for (const targetId of input.targetIds) {
    if (seen.has(targetId)) {
      throw new DeploymentPlanError(
        "duplicate-target",
        `target ${targetId} listed more than once`,
      );
    }
    seen.add(targetId);
    if (findDeploymentTarget(targetId) === undefined) {
      throw new DeploymentPlanError(
        "unknown-target",
        `unknown deployment target ${targetId}`,
      );
    }
  }
  const targetIds = [...seen].sort(compareStrings);
  const targets: DeploymentTarget[] = [];
  for (const targetId of targetIds) {
    const target = findDeploymentTarget(targetId);
    if (target !== undefined) {
      targets.push(target);
    }
  }

  const seeds: StepSeed[] = [];
  for (const gate of releaseChecklist().gates) {
    seeds.push({
      kind: "gate",
      label: `Release gate: ${gate.label}`,
      command: gate.command,
      commandPolicy: "defined",
      gateId: gate.id,
      verification: null,
      targets: [],
      artifacts: [],
    });
  }
  seeds.push({
    kind: "verify",
    label: "Security scan: secret shapes and high-entropy material",
    command: defineReleaseCommand([...HARNESS, "scan-secrets", "."]),
    commandPolicy: "defined",
    gateId: null,
    verification: "scanForSecrets",
    targets: [],
    artifacts: [],
  });
  seeds.push({
    kind: "verify",
    label: "Store integrity: read-only WorldStore sweep",
    command: defineReleaseCommand([
      ...HARNESS,
      "verify-store",
      "--snapshot",
      "qa/epoch-productization/store-snapshot.json",
    ]),
    commandPolicy: "defined",
    gateId: null,
    verification: "verifyStoreIntegrity",
    targets: [],
    artifacts: [],
  });
  seeds.push({
    kind: "verify",
    label: "Release manifest consistency check",
    command: defineReleaseCommand([
      ...HARNESS,
      "verify-manifest",
      "qa/epoch-productization/release-manifest.json",
      "qa/epoch-productization/deployment-plan.json",
    ]),
    commandPolicy: "defined",
    gateId: null,
    verification: "verifyManifestConsistency",
    targets: [],
    artifacts: [],
  });
  for (const target of targets) {
    seeds.push({
      kind: "deploy",
      label: `Deliver ${target.id} (${target.kind})`,
      command: defineReleaseCommand([]),
      commandPolicy: "executor-defined",
      gateId: null,
      verification: null,
      targets: [target.id],
      artifacts: target.requiredArtifacts,
    });
  }

  const steps = seeds.map((seed, index) => freezeStep(seed, index + 1));
  const skeleton = {
    kind: "deployment-plan" as const,
    version: input.version,
    commit: input.commit,
    targetIds: Object.freeze(targetIds),
    steps: Object.freeze(steps),
  };
  const planDigest = digestCanonical(skeleton);
  return Object.freeze({ ...skeleton, planDigest });
}

function freezeStep(seed: StepSeed, ordering: number): DeploymentPlanStep {
  return Object.freeze({
    id: `step-${String(ordering).padStart(2, "0")}`,
    ordering,
    kind: seed.kind,
    label: seed.label,
    command: seed.command,
    commandPolicy: seed.commandPolicy,
    gateId: seed.gateId,
    verification: seed.verification,
    targets: Object.freeze([...seed.targets]),
    artifacts: Object.freeze([...seed.artifacts]),
  });
}

export function recomputePlanDigest(plan: DeploymentPlan): string {
  return digestCanonical({
    kind: plan.kind,
    version: plan.version,
    commit: plan.commit,
    targetIds: plan.targetIds,
    steps: plan.steps,
  });
}

export function serializeDeploymentPlan(plan: DeploymentPlan): string {
  return canonicalJson(plan);
}

export function isDeploymentPlan(value: unknown): value is DeploymentPlan {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record["kind"] !== "deployment-plan") {
    return false;
  }
  if (typeof record["version"] !== "string" || typeof record["commit"] !== "string") {
    return false;
  }
  if (!Array.isArray(record["targetIds"])) {
    return false;
  }
  for (const targetId of record["targetIds"]) {
    if (typeof targetId !== "string") {
      return false;
    }
  }
  if (!isHex64(record["planDigest"])) {
    return false;
  }
  if (!Array.isArray(record["steps"])) {
    return false;
  }
  for (const step of record["steps"]) {
    if (!isPlanStep(step)) {
      return false;
    }
  }
  return true;
}

function isPlanStep(value: unknown): value is DeploymentPlanStep {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["id"] === "string" &&
    typeof record["ordering"] === "number" &&
    (record["kind"] === "gate" || record["kind"] === "verify" || record["kind"] === "deploy") &&
    typeof record["label"] === "string" &&
    isReleaseCommand(record["command"]) &&
    (record["commandPolicy"] === "defined" || record["commandPolicy"] === "executor-defined") &&
    (record["gateId"] === null || typeof record["gateId"] === "string") &&
    (record["verification"] === null || typeof record["verification"] === "string") &&
    Array.isArray(record["targets"]) &&
    record["targets"].every((item) => typeof item === "string") &&
    Array.isArray(record["artifacts"]) &&
    record["artifacts"].every((item) => typeof item === "string")
  );
}

function isReleaseCommand(value: unknown): value is ReleaseCommand {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record["argv"]) &&
    record["argv"].every((item) => typeof item === "string") &&
    Array.isArray(record["env"]) &&
    record["env"].every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>)["key"] === "string" &&
        typeof (item as Record<string, unknown>)["value"] === "string",
    )
  );
}

export function parseDeploymentPlan(text: string): DeploymentPlan | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isDeploymentPlan(value)) {
    return null;
  }
  if (recomputePlanDigest(value) !== value.planDigest) {
    return null;
  }
  return value;
}

export type { ReleaseCommandEnv };
