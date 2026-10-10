/**
 * epoch-application-environment contract unit tests.
 *
 * 验证守卫与常量：capability plane / autonomy mode / adapter seam /
 * sensitive data scope / descriptor / attach request / health snapshot。
 * 与 acceptance-5 略有重叠（敏感数据），但本测试聚焦守卫真值表——
 * 不依赖 controller 与 fake-provider。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_SEAM_SET,
  ADAPTER_SEAMS,
  AUTONOMY_MODE_RANK,
  AUTONOMY_MODE_SET,
  AUTONOMY_MODES,
  CAPABILITY_PLANE_SET,
  CAPABILITY_PLANES,
  DEFAULT_SENSITIVE_DATA_POLICY,
  ENVIRONMENT_HEALTHS,
  ENVIRONMENT_HEALTH_SET,
  ENVIRONMENT_SESSION_STATUSES,
  ENVIRONMENT_SESSION_STATUS_SET,
  OPERATION_INITIATOR_SET,
  OPERATION_INITIATORS,
  SENSITIVE_DATA_SCOPE_SET,
  SENSITIVE_DATA_SCOPES,
  isAdapterSeam,
  isCapabilityPlane,
  isCredentialField,
  isEnvironmentAttachRequest,
  isEnvironmentDescriptor,
  isEnvironmentHealthSnapshot,
  isOperationInitiator,
  isPlaneCapabilityDeclaration,
  isSensitiveDataPolicy,
  modeAllowsPlane,
  shouldExposeWindowToAgent,
} from "../src/index.ts";

test("capability planes/constants: observe/control/semantic are the only planes", () => {
  assert.deepEqual([...CAPABILITY_PLANES], ["observe", "control", "semantic"]);
  assert.equal(CAPABILITY_PLANE_SET.size, 3);
  assert.equal(isCapabilityPlane("observe"), true);
  assert.equal(isCapabilityPlane("control"), true);
  assert.equal(isCapabilityPlane("semantic"), true);
  assert.equal(isCapabilityPlane("other"), false);
});

test("autonomy modes: ordered observe-only -> suggest -> confirmation -> bounded-autonomy -> full", () => {
  assert.deepEqual(
    [...AUTONOMY_MODES],
    ["observe-only", "suggest", "confirmation", "bounded-autonomy", "full"],
  );
  assert.equal(AUTONOMY_MODE_SET.size, 5);
  assert.equal(AUTONOMY_MODE_RANK["observe-only"], 0);
  assert.equal(AUTONOMY_MODE_RANK["suggest"], 1);
  assert.equal(AUTONOMY_MODE_RANK["confirmation"], 2);
  assert.equal(AUTONOMY_MODE_RANK["bounded-autonomy"], 3);
  assert.equal(AUTONOMY_MODE_RANK["full"], 4);
});

test("modeAllowsPlane: observe-only always allows observe plane; never allows control/semantic for agent", () => {
  assert.equal(modeAllowsPlane("observe-only", "observe"), true);
  assert.equal(modeAllowsPlane("observe-only", "control"), false);
  assert.equal(modeAllowsPlane("observe-only", "semantic"), false);
  assert.equal(modeAllowsPlane("suggest", "observe"), true);
  assert.equal(modeAllowsPlane("suggest", "control"), false);
  assert.equal(modeAllowsPlane("confirmation", "control"), true);
  assert.equal(modeAllowsPlane("full", "semantic"), true);
});

test("adapter seams: screen/ui/native", () => {
  assert.deepEqual([...ADAPTER_SEAMS], ["screen", "ui", "native"]);
  assert.equal(ADAPTER_SEAM_SET.size, 3);
  assert.equal(isAdapterSeam("screen"), true);
  assert.equal(isAdapterSeam("ui"), true);
  assert.equal(isAdapterSeam("native"), true);
  assert.equal(isAdapterSeam("web"), false);
});

test("environment session statuses: attached/detached/lost/stale", () => {
  assert.deepEqual([...ENVIRONMENT_SESSION_STATUSES], ["attached", "detached", "lost", "stale"]);
  assert.equal(ENVIRONMENT_SESSION_STATUS_SET.size, 4);
});

test("environment healths: ok/degraded/unreachable", () => {
  assert.deepEqual([...ENVIRONMENT_HEALTHS], ["ok", "degraded", "unreachable"]);
  assert.equal(ENVIRONMENT_HEALTH_SET.size, 3);
});

test("operation initiators: human/agent (验收点 3)", () => {
  assert.deepEqual([...OPERATION_INITIATORS], ["human", "agent"]);
  assert.equal(OPERATION_INITIATOR_SET.size, 2);
  assert.equal(isOperationInitiator("human"), true);
  assert.equal(isOperationInitiator("agent"), true);
  assert.equal(isOperationInitiator("system"), false);
});

test("sensitive data scopes: ordered default-exclude -> task-scoped/explicit-allowlist -> full-trust", () => {
  assert.deepEqual(
    [...SENSITIVE_DATA_SCOPES],
    ["default-exclude", "task-scoped", "explicit-allowlist", "full-trust"],
  );
  assert.equal(SENSITIVE_DATA_SCOPE_SET.size, 4);
});

test("DEFAULT_SENSITIVE_DATA_POLICY: default-exclude + excludes credentials", () => {
  assert.equal(DEFAULT_SENSITIVE_DATA_POLICY.scope, "default-exclude");
  assert.equal(DEFAULT_SENSITIVE_DATA_POLICY.excludeCredentials, true);
  assert.deepEqual(DEFAULT_SENSITIVE_DATA_POLICY.allowlistWindowIds, []);
  assert.deepEqual(DEFAULT_SENSITIVE_DATA_POLICY.denylistWindowIds, []);
  assert.equal(isSensitiveDataPolicy(DEFAULT_SENSITIVE_DATA_POLICY), true);
});

test("shouldExposeWindowToAgent: default-exclude only exposes allowlisted; denylist overrides allowlist", () => {
  const policy = {
    scope: "default-exclude" as const,
    allowlistWindowIds: ["w1"],
    denylistWindowIds: ["w2"],
    excludeCredentials: true,
  };
  assert.equal(shouldExposeWindowToAgent(policy, "w1"), true);
  assert.equal(shouldExposeWindowToAgent(policy, "w2"), false); // denylist wins
  assert.equal(shouldExposeWindowToAgent(policy, "w3"), false); // not allowlisted
});

test("isCredentialField: password/token/secret/apikey/cookie/authorization", () => {
  for (const field of [
    "password",
    "userPassword",
    "api_key",
    "apikey",
    "access_token",
    "sessionToken",
    "Authorization",
    "X-Secret",
    "privateKey",
    "cookie",
  ]) {
    assert.equal(isCredentialField(field), true, `${field} should be credential`);
  }
  for (const field of ["username", "title", "path", "url"]) {
    assert.equal(isCredentialField(field), false, `${field} should NOT be credential`);
  }
});

test("isPlaneCapabilityDeclaration: well-formed plane capability passes; malformed fails", () => {
  assert.equal(
    isPlaneCapabilityDeclaration({
      plane: "observe",
      operations: ["list-windows"],
      available: true,
    }),
    true,
  );
  // 缺字段
  assert.equal(isPlaneCapabilityDeclaration({ plane: "observe", operations: ["x"] }), false);
  // 未知 plane
  assert.equal(
    isPlaneCapabilityDeclaration({
      plane: "other",
      operations: ["x"],
      available: true,
    }),
    false,
  );
  // operation 不是 string
  assert.equal(
    isPlaneCapabilityDeclaration({
      plane: "observe",
      operations: [1],
      available: true,
    }),
    false,
  );
  // available 不是 boolean
  assert.equal(
    isPlaneCapabilityDeclaration({
      plane: "observe",
      operations: ["x"],
      available: "yes",
    }),
    false,
  );
});

test("isEnvironmentDescriptor: well-formed descriptor passes; malformed fails", () => {
  const ok = {
    id: "fake-app",
    name: "Fake App",
    version: "1.0.0",
    runtime: "local",
    planes: [
      { plane: "observe", operations: ["list-windows"], available: true },
      { plane: "control", operations: ["click"], available: true },
    ],
    maxAutonomyMode: "full",
    adapterSeams: ["screen", "ui"],
    simulation: false,
    sensitiveDataNeeds: "default-exclude",
  };
  assert.equal(isEnvironmentDescriptor(ok), true);
  // 重复 plane
  assert.equal(
    isEnvironmentDescriptor({
      ...ok,
      planes: [
        { plane: "observe", operations: ["x"], available: true },
        { plane: "observe", operations: ["y"], available: true },
      ],
    }),
    false,
  );
  // 未知 runtime
  assert.equal(isEnvironmentDescriptor({ ...ok, runtime: "cloud" }), false);
  // 缺 simulation
  assert.equal(
    isEnvironmentDescriptor({
      id: "x",
      name: "x",
      version: "1",
      runtime: "local",
      planes: [],
      maxAutonomyMode: "full",
      adapterSeams: [],
      sensitiveDataNeeds: "default-exclude",
    }),
    false,
  );
});

test("isEnvironmentAttachRequest: well-formed passes; malformed fails", () => {
  const ok = {
    workspaceKey: "ws",
    providerId: "fake-app",
    mode: "observe-only",
    initiator: "human",
  };
  assert.equal(isEnvironmentAttachRequest(ok), true);
  assert.equal(isEnvironmentAttachRequest({ ...ok, mode: "invalid-mode" }), false);
  assert.equal(isEnvironmentAttachRequest({ ...ok, initiator: "system" }), false);
  assert.equal(isEnvironmentAttachRequest({ ...ok, workspaceKey: "" }), false);
  assert.equal(
    isEnvironmentAttachRequest({ ...ok, remoteHost: { id: "host-1", label: "Host" } }),
    true,
  );
  // remoteHost 缺 label
  assert.equal(isEnvironmentAttachRequest({ ...ok, remoteHost: { id: "host-1" } }), false);
});

test("isEnvironmentHealthSnapshot: well-formed passes; malformed fails", () => {
  assert.equal(
    isEnvironmentHealthSnapshot({
      status: "attached",
      health: "ok",
      unavailablePlanes: [],
      reason: null,
    }),
    true,
  );
  assert.equal(
    isEnvironmentHealthSnapshot({
      status: "lost",
      health: "degraded",
      unavailablePlanes: ["control"],
      reason: "lost-connection",
    }),
    true,
  );
  assert.equal(
    isEnvironmentHealthSnapshot({
      status: "attached",
      health: "ok",
      unavailablePlanes: "control", // wrong type
      reason: null,
    }),
    false,
  );
  assert.equal(
    isEnvironmentHealthSnapshot({
      status: "unknown",
      health: "ok",
      unavailablePlanes: [],
      reason: null,
    }),
    false,
  );
});
