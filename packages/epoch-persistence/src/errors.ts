/**
 * epoch-persistence 类型化错误。
 *
 * W021「No second authority」定律的执行面：损坏/未知/不合规记录一律以
 * PersistenceError（code 判别）浮出，绝不静默修复、绝不吞错降级。
 * 错误是提供者中立的——code 语义跨 file/memory/外部 DB 适配器一致。
 */

/** 类型化错误码（冻结集合）。 */
export const PERSISTENCE_ERROR_CODES = [
  /** 调用方输入（记录或键参数）未通过结构校验。 */
  "invalid-input",
  /** load 的目标记录不存在（未知 digest/身份/tabId）。 */
  "record-not-found",
  /** 存储字节不可解析（例如非法 JSON）。 */
  "record-corrupt",
  /** 已解析但未通过结构守卫。 */
  "record-malformed",
  /** 记录声明了未知的持久化封套格式版本。 */
  "unsupported-format",
  /** 声明/存储的摘要与内容摘要校验不一致（篡改或损坏）。 */
  "digest-mismatch",
  /** 内容寻址冲突：同摘要键已存在不同字节的记录。 */
  "record-conflict",
] as const;

export type PersistenceErrorCode = (typeof PERSISTENCE_ERROR_CODES)[number];

/** 运行时校验集合。 */
export const PERSISTENCE_ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(
  PERSISTENCE_ERROR_CODES,
);

/** 错误码守卫。 */
export function isPersistenceErrorCode(value: unknown): value is PersistenceErrorCode {
  return typeof value === "string" && PERSISTENCE_ERROR_CODE_SET.has(value);
}

/** PersistenceError 构造参数。 */
export interface PersistenceErrorInit {
  readonly code: PersistenceErrorCode;
  readonly storeKind: string;
  readonly key?: string;
  readonly message: string;
  /** 可选的底层错误（如 JSON 解析异常），保留因果链便于诊断。 */
  readonly cause?: unknown;
}

/**
 * 类型化持久化错误：code 判别 + storeKind（哪个适配器抛出）+ key（涉及的
 * 记录键，如摘要/身份键/tabId，如适用）。
 */
export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly storeKind: string;
  readonly key: string | null;

  constructor(init: PersistenceErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "PersistenceError";
    this.code = init.code;
    this.storeKind = init.storeKind;
    this.key = init.key ?? null;
  }
}

/** 类型化错误守卫。 */
export function isPersistenceError(value: unknown): value is PersistenceError {
  return value instanceof PersistenceError;
}
