/**
 * epoch-application-environment 敏感数据范围（隐私默认）。
 *
 * 依据 spec/work-orders/W028-application-environment-fabric.md「source-gap,
 * unsupported-signal and sensitive-data handling」与验收点 5：
 *
 * - Credentials/unrelated sensitive windows 默认从 agent context 中排除。
 * - 一次 attach 显式授权 sensitive data scope；缺省 = "default-exclude"。
 * - provider 不能要求 surface 把更宽的 sensitive scope 静默打开——必须经
 *   人类显式同意（验收点 3：human 与 agent 有不同 initiator/permissions）。
 */

/**
 * SensitiveDataScope：一次 attach 允许进入 agent context 的敏感数据范围。
 *
 * - "default-exclude"：凭据/与任务无关的窗口/非声明范围的内容全部从 agent
 *   context 中移除（默认值；验收点 5）。
 * - "task-scoped"：允许进入与当前 task/session 直接相关的窗口内容（仍排除凭据）。
 * - "explicit-allowlist"：仅允许显式列在 allowlistWindowIds 中的窗口。
 * - "full-trust"：完全开放（需要显式授权；provider 不得要求该 scope 才能工作）。
 */
export type SensitiveDataScope =
  | "default-exclude"
  | "task-scoped"
  | "explicit-allowlist"
  | "full-trust";

export const SENSITIVE_DATA_SCOPES: readonly SensitiveDataScope[] = [
  "default-exclude",
  "task-scoped",
  "explicit-allowlist",
  "full-trust",
];
export const SENSITIVE_DATA_SCOPE_SET: ReadonlySet<SensitiveDataScope> = new Set(
  SENSITIVE_DATA_SCOPES,
);

export function isSensitiveDataScope(value: unknown): value is SensitiveDataScope {
  return typeof value === "string" && SENSITIVE_DATA_SCOPE_SET.has(value as SensitiveDataScope);
}

/**
 * 敏感数据过滤规则：决定一个 window/credential 是否进入 agent context。
 *
 * 一次 attach 时由 host/surface 提供；缺省 default-exclude 规则。provider
 * 不持有这个规则——它是 surface/host 的隐私权威，provider 只接受 surface
 * 过滤后的视图（不变量 13：UI/host 是投影，不能成为业务权威的反向也成立——
 * surface 在这里是隐私边界权威，provider 不能反向覆写）。
 */
export interface SensitiveDataPolicy {
  readonly scope: SensitiveDataScope;
  /**
   * allowlistWindowIds：scope="explicit-allowlist" 时被允许的窗口 id 集合。
   * scope="default-exclude" 或 "task-scoped" 时为空数组（按规则推断）。
   */
  readonly allowlistWindowIds: readonly string[];
  /**
   * denylistWindowIds：被显式排除的窗口 id（覆盖 allowlist；用于敏感窗口
   * 即使在 task-scoped 下也排除）。默认空数组。
   */
  readonly denylistWindowIds: readonly string[];
  /**
   * excludeCredentials：是否将凭据字段（任何带 credential/password/token
   * 关键字的字段）从 agent context 中移除。默认 true（验收点 5 强制）。
   */
  readonly excludeCredentials: boolean;
}

export function isSensitiveDataPolicy(value: unknown): value is SensitiveDataPolicy {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isSensitiveDataScope(candidate.scope)) return false;
  if (!Array.isArray(candidate.allowlistWindowIds)) return false;
  if (!candidate.allowlistWindowIds.every((id) => typeof id === "string")) return false;
  if (!Array.isArray(candidate.denylistWindowIds)) return false;
  if (!candidate.denylistWindowIds.every((id) => typeof id === "string")) return false;
  if (typeof candidate.excludeCredentials !== "boolean") return false;
  return true;
}

/** 缺省敏感数据策略：default-exclude + 排除凭据 + 空 allowlist/denylist。 */
export const DEFAULT_SENSITIVE_DATA_POLICY: SensitiveDataPolicy = {
  scope: "default-exclude",
  allowlistWindowIds: [],
  denylistWindowIds: [],
  excludeCredentials: true,
};

/**
 * 判定一个窗口是否应进入 agent context（true = 进入；false = 排除）。
 *
 * - denylist 优先于 allowlist。
 * - scope=default-exclude：除非显式在 allowlist 中，否则排除（验收点 5）。
 * - scope=task-scoped：与 task 无关的窗口默认排除（由 provider 调用方提供
 *   taskRelated 判定）。
 * - scope=explicit-allowlist：仅 allowlist 中的窗口进入。
 * - scope=full-trust：全部进入（除非在 denylist 中）。
 */
export function shouldExposeWindowToAgent(
  policy: SensitiveDataPolicy,
  windowId: string,
  options: { taskRelated?: boolean } = {},
): boolean {
  if (policy.denylistWindowIds.includes(windowId)) return false;
  switch (policy.scope) {
    case "default-exclude":
      return policy.allowlistWindowIds.includes(windowId);
    case "task-scoped":
      if (policy.allowlistWindowIds.includes(windowId)) return true;
      return options.taskRelated === true;
    case "explicit-allowlist":
      return policy.allowlistWindowIds.includes(windowId);
    case "full-trust":
      return true;
  }
}

/**
 * 判定一个字段值是否因名称被视为凭据字段（应从 agent context 移除）。
 *
 * 命名约定（避免依赖值内容）：字段名（lowercased + 去掉下划线/连字符）含
 * password / secret / token / apikey / accesskey / privatekey /
 * sessionsecret / cookie / authorization 时视为凭据字段。值内容不参与判定
 * （不扫描值字符串）。
 */
const CREDENTIAL_FIELD_PATTERNS = [
  "password",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "privatekey",
  "sessionsecret",
  "cookie",
  "authorization",
];

export function isCredentialField(fieldName: string): boolean {
  // 去掉下划线/连字符/空格再匹配——让 api_key / api-key / ApiKey 都命中。
  const normalized = fieldName.toLowerCase().replace(/[_\-\s]/g, "");
  return CREDENTIAL_FIELD_PATTERNS.some((pattern) => normalized.includes(pattern));
}
