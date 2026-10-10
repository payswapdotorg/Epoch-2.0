/**
 * W028 验收点 5：Credentials/unrelated sensitive windows are excluded from
 * agent context by default.
 *
 * 断言：
 * - DEFAULT_SENSITIVE_DATA_POLICY.scope === "default-exclude"，
 *   excludeCredentials === true。
 * - shouldExposeWindowToAgent 在 default-exclude scope 下：
 *   未在 allowlist 的窗口默认排除（与 task 相关也排除）。
 * - 控制器在 attach 时校验：surface 的 sensitiveDataPolicy 不得宽于 descriptor
 *   的 sensitiveDataNeeds。provider 声明 default-exclude 时，surface 试图传
 *   full-trust 被 controller 拒绝；excludeCredentials=false 也被拒绝（除非
 *   descriptor 声明 full-trust）。
 * - isCredentialField 对 password/token/secret/apikey 等字段名返回 true
 *   （凭据字段默认从 agent context 移除）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SENSITIVE_DATA_POLICY,
  isCredentialField,
  shouldExposeWindowToAgent,
} from "../../packages/epoch-application-environment/src/index.ts";
import { EnvironmentSurfaceController } from "../../packages/epoch-environment-surface/src/index.ts";
import {
  createFakeProvider,
  createRuntimeWith,
  fullCapabilityDescriptor,
} from "./fake-provider.ts";

test("acceptance-5: DEFAULT_SENSITIVE_DATA_POLICY is default-exclude + excludes credentials", () => {
  assert.equal(DEFAULT_SENSITIVE_DATA_POLICY.scope, "default-exclude");
  assert.equal(DEFAULT_SENSITIVE_DATA_POLICY.excludeCredentials, true);
  assert.deepEqual(DEFAULT_SENSITIVE_DATA_POLICY.allowlistWindowIds, []);
  assert.deepEqual(DEFAULT_SENSITIVE_DATA_POLICY.denylistWindowIds, []);
});

test("acceptance-5: default-exclude scope excludes unrelated windows (unrelated = not in allowlist)", () => {
  const policy = DEFAULT_SENSITIVE_DATA_POLICY;
  // 与 task 无关的窗口默认排除。
  assert.equal(
    shouldExposeWindowToAgent(policy, "unrelated-window", { taskRelated: false }),
    false,
  );
  // 即使 taskRelated=true，default-exclude 仍排除（除非显式在 allowlist）。
  assert.equal(
    shouldExposeWindowToAgent(policy, "task-related-window", { taskRelated: true }),
    false,
  );
  // 显式在 allowlist 的窗口才进入。
  const allowlisted = {
    ...policy,
    allowlistWindowIds: ["allowed-window"],
  };
  assert.equal(
    shouldExposeWindowToAgent(allowlisted, "allowed-window", { taskRelated: false }),
    true,
  );
  // denylist 优先于 allowlist。
  const denied = {
    ...allowlisted,
    denylistWindowIds: ["allowed-window"],
  };
  assert.equal(shouldExposeWindowToAgent(denied, "allowed-window", { taskRelated: true }), false);
});

test("acceptance-5: controller rejects surface sensitiveDataPolicy wider than descriptor needs", async () => {
  // descriptor 声明 default-exclude；surface 试图传 full-trust 应被拒绝。
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "sensitive-app",
      name: "Sensitive App",
      sensitiveDataNeeds: "default-exclude",
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws-sensitive",
        providerId: "sensitive-app",
        mode: "observe-only",
        initiator: "human",
        sensitiveDataPolicy: {
          scope: "full-trust",
          allowlistWindowIds: [],
          denylistWindowIds: [],
          excludeCredentials: false,
        },
      }),
    /sensitive data policy full-trust exceeds provider sensitive-app sensitiveDataNeeds default-exclude/,
  );
});

test("acceptance-5: controller rejects excludeCredentials=false unless descriptor declares full-trust", async () => {
  const provider = createFakeProvider(
    fullCapabilityDescriptor({
      id: "creds-app",
      name: "Creds App",
      sensitiveDataNeeds: "task-scoped",
    }),
  );
  const controller = new EnvironmentSurfaceController(createRuntimeWith([provider]));

  await assert.rejects(
    () =>
      controller.open({
        workspaceKey: "ws-creds",
        providerId: "creds-app",
        mode: "observe-only",
        initiator: "human",
        sensitiveDataPolicy: {
          scope: "task-scoped",
          allowlistWindowIds: [],
          denylistWindowIds: [],
          excludeCredentials: false,
        },
      }),
    /excludeCredentials=false requires provider creds-app to declare sensitiveDataNeeds=full-trust/,
  );
});

test("acceptance-5: credential field names are detected (password / token / secret / apikey / authorization)", () => {
  assert.equal(isCredentialField("password"), true);
  assert.equal(isCredentialField("userPassword"), true);
  assert.equal(isCredentialField("api_key"), true);
  assert.equal(isCredentialField("apikey"), true);
  assert.equal(isCredentialField("sessionToken"), true);
  assert.equal(isCredentialField("access_token"), true);
  assert.equal(isCredentialField("Authorization"), true);
  assert.equal(isCredentialField("X-Secret"), true);
  assert.equal(isCredentialField("privateKey"), true);
  assert.equal(isCredentialField("cookie"), true);
  // 非凭据字段不误判。
  assert.equal(isCredentialField("username"), false);
  assert.equal(isCredentialField("title"), false);
  assert.equal(isCredentialField("path"), false);
});
