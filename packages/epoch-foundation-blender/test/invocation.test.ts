import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildBlenderInvocationContract,
  buildBlenderToolDescriptor,
  buildFreecadInvocationContract,
  buildFreecadToolDescriptor,
  buildInvocationPlan,
  descriptorDigest,
  invocationContractDigest,
  invocationPlanDigest,
  resolveArgv,
} from "../src/index.js";
import { toKebabId } from "../src/validate.js";
import type { InvocationPlanInput } from "../src/index.js";

const blender = buildBlenderToolDescriptor({ toolVersion: "4.2.0" });
const freecad = buildFreecadToolDescriptor({ toolVersion: "1.0.0" });
const blenderContract = buildBlenderInvocationContract(blender);
const freecadContract = buildFreecadInvocationContract(freecad);

const planInput: InvocationPlanInput = {
  planId: "export-scene-obj",
  toolId: "blender-bpy-headless",
  toolVersion: "4.2.0",
  contractId: "blender-bpy-headless-standard",
  purpose: "export-geometry",
  argvBindings: [
    { name: "script-path", values: ["<workdir>/scripts/export_obj.py"] },
    { name: "script-args", values: ["--input", "<workdir>/in/scene.blend"] },
  ],
  requestedTimeoutMs: 300000,
  requestedGpu: false,
  requestedWritePaths: ["<workdir>/out/scene.obj"],
  inputFormat: "blend",
  outputFormat: "obj",
  createdAtUtc: "2025-01-15T09:30:00Z",
};

test("blender invocation contract binds its descriptor by digest", () => {
  assert.equal(blenderContract.contractId, "blender-bpy-headless-standard");
  assert.equal(blenderContract.toolDescriptorDigest, descriptorDigest(blender));
  assert.equal(blenderContract.toolId, "blender-bpy-headless");
  assert.equal(blenderContract.toolVersion, "4.2.0");
  assert.deepEqual(blenderContract.purposes, [
    "import-geometry",
    "export-geometry",
    "convert-geometry",
    "inspect-scene",
    "run-script",
  ]);
  assert.equal(blenderContract.stdin.kind, "none");
  assert.equal(blenderContract.exitCodes.successCode, 0);
});

test("blender argv template includes the exit-code flag and both placeholders", () => {
  const literals = blenderContract.argvTemplate.flatMap((token) =>
    token.kind === "literal" ? [token.value] : [],
  );
  assert.ok(literals.includes("--background"));
  assert.ok(literals.includes("--factory-startup"));
  assert.ok(literals.includes("--python"));
  assert.ok(literals.includes("--python-exit-code"));
  assert.ok(literals.includes("1"));
  assert.ok(literals.includes("--"));
  const placeholders = blenderContract.argvTemplate.flatMap((token) =>
    token.kind === "placeholder" ? [token.name] : [],
  );
  assert.deepEqual(placeholders, ["script-path", "script-args"]);
});

test("freecad contract denies gpu and network and orders timeouts", () => {
  assert.equal(freecadContract.contractId, "freecad-console-standard");
  assert.equal(freecadContract.sandbox.gpuAccess, "denied");
  assert.equal(freecadContract.sandbox.networkAccess, "denied");
  assert.equal(freecadContract.sandbox.requiresDisplay, false);
  assert.ok(freecadContract.timeout.minTimeoutMs < freecadContract.timeout.defaultTimeoutMs);
  assert.ok(freecadContract.timeout.defaultTimeoutMs < freecadContract.timeout.maxTimeoutMs);
  assert.equal(freecadContract.timeout.onTimeout, "kill-process-tree");
  assert.equal(freecadContract.stdoutCapture.expectsJsonStatusLine, true);
  const placeholders = freecadContract.argvTemplate.flatMap((token) =>
    token.kind === "placeholder" ? [token.name] : [],
  );
  assert.deepEqual(placeholders, ["script-path", "script-args"]);
});

test("resolveArgv expands literals, placeholders, and repeatable tokens", () => {
  const argv = resolveArgv(blenderContract.argvTemplate, [
    { name: toKebabId("script-path"), values: ["s.py"] },
    { name: toKebabId("script-args"), values: ["--in", "a.blend", "--out", "b.obj"] },
  ]);
  assert.deepEqual(argv, [
    "--background",
    "--factory-startup",
    "--python",
    "s.py",
    "--python-exit-code",
    "1",
    "--",
    "--in",
    "a.blend",
    "--out",
    "b.obj",
  ]);
});

test("resolveArgv omits absent optional placeholders and throws on missing required ones", () => {
  const argv = resolveArgv(blenderContract.argvTemplate, [
    { name: toKebabId("script-path"), values: ["s.py"] },
  ]);
  assert.deepEqual(argv, [
    "--background",
    "--factory-startup",
    "--python",
    "s.py",
    "--python-exit-code",
    "1",
    "--",
  ]);
  assert.throws(() => resolveArgv(blenderContract.argvTemplate, []));
});

test("buildInvocationPlan validates and brands inputs", () => {
  const plan = buildInvocationPlan(planInput);
  assert.equal(plan.planId, "export-scene-obj");
  assert.equal(plan.toolVersion, "4.2.0");
  assert.equal(plan.inputFormat, "blend");
  assert.equal(plan.outputFormat, "obj");
  assert.equal(plan.createdAtUtc, "2025-01-15T09:30:00Z");
  assert.equal(plan.notes.length, 0);
  assert.throws(() => buildInvocationPlan({ ...planInput, planId: "Not Kebab" }));
  assert.throws(() => buildInvocationPlan({ ...planInput, createdAtUtc: "2025-01-15 09:30:00" }));
  assert.throws(() => buildInvocationPlan({ ...planInput, inputFormat: "not kebab" }));
  assert.throws(() =>
    buildInvocationPlan({
      ...planInput,
      purpose: "not-a-purpose",
    } as unknown as InvocationPlanInput),
  );
});

test("contract and plan digests are stable and distinct", () => {
  assert.equal(
    invocationContractDigest(blenderContract),
    invocationContractDigest(buildBlenderInvocationContract(blender)),
  );
  assert.notEqual(
    invocationContractDigest(blenderContract),
    invocationContractDigest(freecadContract),
  );
  const p1 = buildInvocationPlan(planInput);
  const p2 = buildInvocationPlan({ ...planInput, planId: "another-plan" });
  assert.equal(invocationPlanDigest(p1), invocationPlanDigest(buildInvocationPlan(planInput)));
  assert.notEqual(invocationPlanDigest(p1), invocationPlanDigest(p2));
  assert.match(invocationPlanDigest(p1), /^[0-9a-f]{64}$/);
});
