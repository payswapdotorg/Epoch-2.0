import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeploymentPlanError,
  deploymentTargetInvariants,
  deploymentTargetsDigest,
  deploymentTargetsForArtifact,
  deriveDeploymentPlan,
  findDeploymentTarget,
  isDeploymentPlan,
  listDeploymentTargets,
  parseDeploymentPlan,
  permissionInventory,
  recomputePlanDigest,
  releaseChecklist,
  releaseChecklistDigest,
  releaseGate,
  releaseGateOrder,
  serializeDeploymentPlan,
  type DeploymentPlan,
  type DeploymentPlanInput,
} from "../src/contract.js";

const PRIVILEGED: readonly string[] = [
  "clipboard-access",
  "os-notifications",
  "filesystem-read",
  "filesystem-write",
  "process-spawn",
];

function planInput(targetIds: readonly string[]): DeploymentPlanInput {
  return {
    kind: "deployment-plan-input",
    version: "1.2.3",
    commit: "0123456789abcdef0123456789abcdef01234567",
    targetIds,
  };
}

test("target registry: ids are unique and sorted", () => {
  const ids = listDeploymentTargets().map((target) => target.id);
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
});

test("target registry: web targets grant no privileged permissions", () => {
  for (const target of listDeploymentTargets()) {
    if (target.kind !== "web") {
      continue;
    }
    for (const permission of target.permissionSurface) {
      assert.equal(PRIVILEGED.includes(permission), false, `${target.id} grants ${permission}`);
    }
  }
});

test("target registry: desktop targets require all three artifacts", () => {
  for (const target of listDeploymentTargets()) {
    if (target.kind !== "desktop") {
      continue;
    }
    assert.deepEqual([...target.requiredArtifacts].sort(), [
      "agent-runtime",
      "desktop-installer",
      "web-bundle",
    ]);
  }
});

test("target registry: desktop permission surface includes filesystem and process-spawn", () => {
  for (const target of listDeploymentTargets()) {
    if (target.kind !== "desktop") {
      continue;
    }
    assert.equal(target.permissionSurface.includes("filesystem-read"), true);
    assert.equal(target.permissionSurface.includes("process-spawn"), true);
  }
});

test("findDeploymentTarget resolves known ids and misses unknown ids", () => {
  assert.equal(findDeploymentTarget("web-static")?.kind, "web");
  assert.equal(findDeploymentTarget("nope"), undefined);
});

test("deploymentTargetsForArtifact: web-bundle is required by every target", () => {
  assert.equal(
    deploymentTargetsForArtifact("web-bundle").length,
    listDeploymentTargets().length,
  );
});

test("permissionInventory: deterministic channel-grouped ordering and channel-correct aggregation", () => {
  const inventory = permissionInventory();
  const permissions = inventory.map((entry) => entry.permission);
  assert.deepEqual(permissions, [
    "persistent-storage",
    "gpu-acceleration",
    "clipboard-access",
    "os-notifications",
    "filesystem-read",
    "filesystem-write",
    "process-spawn",
  ]);
  const filesystemWrite = inventory.find(
    (entry) => entry.permission === "filesystem-write",
  );
  assert.deepEqual(filesystemWrite?.channels, ["desktop"]);
  assert.equal(filesystemWrite?.targetCount, 5);
  const persistentStorage = inventory.find(
    (entry) => entry.permission === "persistent-storage",
  );
  assert.deepEqual(persistentStorage?.channels, ["desktop", "web"]);
  assert.equal(persistentStorage?.targetCount, 6);
});

test("deploymentTargetInvariants: the frozen matrix has no violations", () => {
  assert.deepEqual(deploymentTargetInvariants(), []);
});

test("deploymentTargetsDigest: stable canonical digest", () => {
  assert.equal(deploymentTargetsDigest(), deploymentTargetsDigest());
  assert.match(deploymentTargetsDigest(), /^[0-9a-f]{64}$/);
});

test("release checklist: seven gates in the frozen order", () => {
  assert.deepEqual(releaseGateOrder(), [
    "workspace-freshness",
    "frozen-install",
    "typecheck",
    "tests",
    "lint",
    "format",
    "architecture",
  ]);
  assert.equal(releaseChecklist().gates.length, 7);
});

test("release checklist: the frozen-install gate pins ELECTRON_SKIP_BINARY_DOWNLOAD", () => {
  const gate = releaseGate("frozen-install");
  assert.deepEqual(gate?.command.env, [
    { key: "ELECTRON_SKIP_BINARY_DOWNLOAD", value: "1" },
  ]);
  assert.deepEqual(gate?.command.argv, ["pnpm", "install", "--frozen-lockfile"]);
});

test("release checklist: the freshness gate runs the workspace freshness script", () => {
  assert.deepEqual(releaseGate("workspace-freshness")?.command.argv, [
    "node",
    "scripts/check-workspace-freshness.mjs",
  ]);
});

test("release checklist: every gate blocks the release on failure", () => {
  for (const gate of releaseChecklist().gates) {
    assert.equal(gate.failurePolicy, "block-release");
  }
});

test("releaseChecklistDigest: stable canonical digest", () => {
  assert.equal(releaseChecklistDigest(), releaseChecklistDigest());
  assert.match(releaseChecklistDigest(), /^[0-9a-f]{64}$/);
});

test("deriveDeploymentPlan: gate steps mirror the release checklist", () => {
  const plan = deriveDeploymentPlan(planInput(["web-static"]));
  const gateSteps = plan.steps.filter((step) => step.kind === "gate");
  assert.deepEqual(
    gateSteps.map((step) => step.gateId),
    releaseGateOrder(),
  );
  const firstGate = releaseChecklist().gates[0];
  assert.deepEqual(gateSteps[0]?.command.argv, firstGate?.command.argv);
  for (const step of gateSteps) {
    assert.equal(step.commandPolicy, "defined");
    assert.deepEqual(step.targets, []);
  }
});

test("deriveDeploymentPlan: verification steps invoke the owned QA harness", () => {
  const plan = deriveDeploymentPlan(planInput(["web-static"]));
  const verifySteps = plan.steps.filter((step) => step.kind === "verify");
  assert.deepEqual(
    verifySteps.map((step) => step.verification),
    ["scanForSecrets", "verifyStoreIntegrity", "verifyManifestConsistency"],
  );
  for (const step of verifySteps) {
    assert.equal(step.command.argv[0], "node");
    assert.equal(step.command.argv[1], "qa/epoch-productization/run-plan-step.mjs");
    assert.equal(step.commandPolicy, "defined");
  }
});

test("deriveDeploymentPlan: deploy steps are executor-defined and per-target", () => {
  const plan = deriveDeploymentPlan(
    planInput(["web-static", "desktop-linux-x64"]),
  );
  const deploySteps = plan.steps.filter((step) => step.kind === "deploy");
  assert.equal(deploySteps.length, 2);
  assert.equal(plan.steps.length, 12);
  for (const step of deploySteps) {
    assert.deepEqual(step.command.argv, []);
    assert.deepEqual(step.command.env, []);
    assert.equal(step.commandPolicy, "executor-defined");
    const target = findDeploymentTarget(step.targets[0] ?? "");
    assert.deepEqual(step.artifacts, target?.requiredArtifacts);
  }
});

test("deriveDeploymentPlan: deterministic for identical inputs", () => {
  const first = serializeDeploymentPlan(deriveDeploymentPlan(planInput(["web-static"])));
  const second = serializeDeploymentPlan(deriveDeploymentPlan(planInput(["web-static"])));
  assert.equal(first, second);
});

test("deriveDeploymentPlan: input target order does not change the plan", () => {
  const first = serializeDeploymentPlan(
    deriveDeploymentPlan(planInput(["web-static", "desktop-linux-x64"])),
  );
  const second = serializeDeploymentPlan(
    deriveDeploymentPlan(planInput(["desktop-linux-x64", "web-static"])),
  );
  assert.equal(first, second);
});

test("deriveDeploymentPlan: rejects unknown targets", () => {
  assert.throws(
    () => deriveDeploymentPlan(planInput(["desktop-vms"])),
    (error: unknown) =>
      error instanceof DeploymentPlanError && error.code === "unknown-target",
  );
});

test("deriveDeploymentPlan: rejects duplicate targets", () => {
  assert.throws(
    () => deriveDeploymentPlan(planInput(["web-static", "web-static"])),
    (error: unknown) =>
      error instanceof DeploymentPlanError && error.code === "duplicate-target",
  );
});

test("deriveDeploymentPlan: rejects an empty target list", () => {
  assert.throws(
    () => deriveDeploymentPlan(planInput([])),
    (error: unknown) =>
      error instanceof DeploymentPlanError && error.code === "empty-targets",
  );
});

test("deriveDeploymentPlan: rejects invalid versions and commits", () => {
  assert.throws(
    () => deriveDeploymentPlan({ ...planInput(["web-static"]), version: "1.2" }),
    (error: unknown) =>
      error instanceof DeploymentPlanError && error.code === "invalid-version",
  );
  assert.throws(
    () => deriveDeploymentPlan({ ...planInput(["web-static"]), commit: "zzz" }),
    (error: unknown) =>
      error instanceof DeploymentPlanError && error.code === "invalid-commit",
  );
});

test("deriveDeploymentPlan: rejects the wrong input kind", () => {
  const wrong = {
    ...planInput(["web-static"]),
    kind: "nope",
  } as unknown as DeploymentPlanInput;
  assert.throws(
    () => deriveDeploymentPlan(wrong),
    (error: unknown) =>
      error instanceof DeploymentPlanError && error.code === "invalid-input-kind",
  );
});

test("plan digest: recomputes exactly and detects tampering", () => {
  const plan = deriveDeploymentPlan(planInput(["web-static"]));
  assert.equal(recomputePlanDigest(plan), plan.planDigest);
  const tampered: DeploymentPlan = { ...plan, version: "9.9.9" };
  assert.notEqual(recomputePlanDigest(tampered), plan.planDigest);
});

test("plan serialization round-trips through parseDeploymentPlan", () => {
  const plan = deriveDeploymentPlan(
    planInput(["web-static", "desktop-linux-x64"]),
  );
  const text = serializeDeploymentPlan(plan);
  assert.equal(isDeploymentPlan(JSON.parse(text)), true);
  const parsed = parseDeploymentPlan(text);
  if (parsed === null) {
    assert.fail("expected a parsed plan");
    return;
  }
  assert.equal(serializeDeploymentPlan(parsed), text);
});

test("parseDeploymentPlan: rejects tampered plan JSON", () => {
  const plan = deriveDeploymentPlan(planInput(["web-static"]));
  const text = serializeDeploymentPlan(plan).replace(
    '"version":"1.2.3"',
    '"version":"1.2.4"',
  );
  assert.equal(parseDeploymentPlan(text), null);
});
