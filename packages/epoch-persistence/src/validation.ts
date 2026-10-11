/**
 * epoch-persistence 记录校验：保存侧断言 + 读取侧解析。
 *
 * 「No second authority」的执法点：
 * - 保存侧：结构守卫 + 内容摘要校验（委托冻结的 computeWorldDigest——唯一
 *   摘要权威；本包不自造摘要算法）。失败 → PersistenceError(invalid-input /
 *   digest-mismatch)，且不写入任何字节。
 * - 读取侧：JSON 解析失败 → record-corrupt；结构守卫失败 → record-malformed；
 *   未知格式版本 → unsupported-format；内容摘要不一致 → digest-mismatch。
 *   任何失败都以 typed error 浮出——绝不修复、绝不降级返回「最接近的」记录。
 */
import { computeWorldDigest, isWorldDigest } from "@zcode/epoch-world-model";
import type {
  PersistedRevision,
  PersistedSolution,
  SessionSurfaceIdentity,
  SolutionIdentity,
} from "./contract.ts";
import { PERSISTENCE_FORMAT_VERSION } from "./contract.ts";
import { PersistenceError } from "./errors.ts";
import {
  isPersistedRevision,
  isPersistedSolution,
  isSessionSurfaceIdentity,
  isSolutionIdentity,
} from "./guards.ts";

/** 保存侧断言：记录可持久化（结构 + 格式版本 + 内容摘要校验）。 */
export function assertPersistableRevision(
  record: unknown,
  storeKind: string,
): asserts record is PersistedRevision {
  if (!isPersistedRevision(record)) {
    throw new PersistenceError({
      code: "invalid-input",
      storeKind,
      message: "record is not a well-formed PersistedRevision",
    });
  }
  assertKnownFormatVersion(record.persistence.formatVersion, storeKind);
  assertDigestMatchesRevision(record, storeKind);
}

/** 内容摘要校验：digest === revision.digest === computeWorldDigest(revision)。 */
function assertDigestMatchesRevision(record: PersistedRevision, storeKind: string): void {
  if (record.digest !== record.revision.digest) {
    throw new PersistenceError({
      code: "digest-mismatch",
      storeKind,
      key: record.digest,
      message: "record digest does not mirror revision.digest",
    });
  }
  // 委托唯一摘要权威复核内容——校验不是派生：不产出任何新世界内容。
  const recomputed = computeWorldDigest(record.revision);
  if (recomputed !== record.digest) {
    throw new PersistenceError({
      code: "digest-mismatch",
      storeKind,
      key: record.digest,
      message: `revision content digest ${recomputed} does not match declared digest ${record.digest}`,
    });
  }
}

function assertKnownFormatVersion(formatVersion: number, storeKind: string): void {
  if (formatVersion !== PERSISTENCE_FORMAT_VERSION) {
    throw new PersistenceError({
      code: "unsupported-format",
      storeKind,
      message: `unsupported persistence format version ${formatVersion} (expected ${PERSISTENCE_FORMAT_VERSION})`,
    });
  }
}

/** 读取侧：解析已存修订字节（corrupt → malformed → format → digest 逐级浮出）。 */
export function parseStoredRevision(
  text: string,
  storeKind: string,
  key: string,
): PersistedRevision {
  const parsed = parseJson(text, storeKind, key);
  if (!isPersistedRevision(parsed)) {
    throw new PersistenceError({
      code: "record-malformed",
      storeKind,
      key,
      message: `stored revision record at ${key} fails structural validation`,
    });
  }
  assertKnownFormatVersion(parsed.persistence.formatVersion, storeKind);
  assertDigestMatchesRevision(parsed, storeKind);
  return parsed;
}

/** 读取侧：解析已存解记录。 */
export function parseStoredSolution(
  text: string,
  storeKind: string,
  key: string,
): PersistedSolution {
  const parsed = parseJson(text, storeKind, key);
  if (!isPersistedSolution(parsed)) {
    throw new PersistenceError({
      code: "record-malformed",
      storeKind,
      key,
      message: `stored solution record at ${key} fails structural validation`,
    });
  }
  return parsed;
}

/** 读取侧：解析已存 surface 身份记录。 */
export function parseStoredSurfaceIdentity(
  text: string,
  storeKind: string,
  key: string,
): SessionSurfaceIdentity {
  const parsed = parseJson(text, storeKind, key);
  if (!isSessionSurfaceIdentity(parsed)) {
    throw new PersistenceError({
      code: "record-malformed",
      storeKind,
      key,
      message: `stored surface identity record at ${key} fails structural validation`,
    });
  }
  return parsed;
}

function parseJson(text: string, storeKind: string, key: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PersistenceError({
      code: "record-corrupt",
      storeKind,
      key,
      message: `stored record at ${key} is not parseable JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      cause: error,
    });
  }
}

/** 保存侧断言：解记录可持久化。 */
export function assertPersistableSolution(
  solution: unknown,
  storeKind: string,
): asserts solution is PersistedSolution {
  if (!isPersistedSolution(solution)) {
    throw new PersistenceError({
      code: "invalid-input",
      storeKind,
      message: "record is not a well-formed PersistedSolution",
    });
  }
}

/** 保存侧断言：surface 身份记录可持久化。 */
export function assertPersistableSurfaceIdentity(
  identity: unknown,
  storeKind: string,
): asserts identity is SessionSurfaceIdentity {
  if (!isSessionSurfaceIdentity(identity)) {
    throw new PersistenceError({
      code: "invalid-input",
      storeKind,
      message: "record is not a well-formed SessionSurfaceIdentity",
    });
  }
}

/** 键参数校验：load 的摘要键必须是 64 位小写 hex。 */
export function assertDigestKey(digest: string, storeKind: string): void {
  if (!isWorldDigest(digest)) {
    throw new PersistenceError({
      code: "invalid-input",
      storeKind,
      key: digest,
      message: "digest key must be a 64-character lowercase hex string",
    });
  }
}

/** 键参数校验：load 的解身份三元组。 */
export function assertIdentityKey(
  identity: unknown,
  storeKind: string,
): asserts identity is SolutionIdentity {
  if (!isSolutionIdentity(identity)) {
    throw new PersistenceError({
      code: "invalid-input",
      storeKind,
      message: "solution identity must be a non-empty workspaceKey/engineId/solutionId triple",
    });
  }
}
