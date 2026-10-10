/**
 * @zcode/epoch-gltf 确定性辅助：canonical JSON 序列化 + sha256 摘要。
 *
 * 依据 ARCHITECTURE-LOCK #17（确定性：fixture/test 必须内容寻址、网络无依赖）。
 * - canonicalJsonStringify：递归排序对象 key（字符串升序），确保同输入 → 同字节串。
 *   数组顺序保留（数组是有序载荷）；数字/字符串/布尔/null 原样输出。
 * - sha256Digest：node:crypto 单向摘要，返回 16 进制字符串（64 字符）。
 */
import { createHash } from "node:crypto";

/**
 * 把任意 JSON 值序列化为 canonical 字符串：对象 key 递归升序排序，无空格，
 * ASCII 转义。数组保留顺序。NaN/Infinity 视为 null（JSON 标准行为）。
 */
export function canonicalJsonStringify(value: unknown): string {
  return _canonical(value);
}

function _canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") {
    return JSON.stringify(Number(value));
  }
  if (Array.isArray(value)) {
    const parts = value.map((v) => _canonical(v));
    return "[" + parts.join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + _canonical(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  // 函数/symbol/undefined → null（防御性；不应出现在 glTF 文档里）。
  return "null";
}

/** sha256(bytes) → 16 进制小写串。 */
export function sha256Digest(bytes: Uint8Array | string): string {
  const hash = createHash("sha256");
  hash.update(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes);
  return hash.digest("hex");
}

/** sha256(canonical JSON string)。 */
export function sha256CanonicalJson(value: unknown): string {
  return sha256Digest(canonicalJsonStringify(value));
}
