/**
 * epoch-persistence 规范 JSON 序列化（确定性核心）。
 *
 * 依据 ARCHITECTURE-LOCK #17：同一记录 → 字节相同的载荷。规则与
 * epoch-world-model 的 digest 规范化保持同族：
 * - 对象键按 UTF-16 码元升序（Array.prototype.sort 默认序）递归排序；
 * - 无空白；字符串转义/数字格式遵循 ECMAScript JSON.stringify（数字为最短
 *   往返表示；-0 规范化为 "0"；非有限数字抛 TypeError——拒绝进入持久层）；
 * - 数组保序（有序载荷）；undefined 值的键丢弃（JSON 语义）；
 * - 未知字段保留：store 持久化「给出的全部」，不裁剪也不发明字段。
 *
 * 与 world-model canonicalizeWorld 的分工：那边定义**语义摘要**的规范输入；
 * 这边定义**持久化封套**的规范字节。两者互不替代——摘要校验始终委托
 * computeWorldDigest（唯一摘要权威），本序列化只保证载荷字节稳定。
 */

/** 递归键排序、无空白的规范 JSON 字符串。 */
export function canonicalJsonStringify(value: unknown): string {
  return canonicalize(value);
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(`non-finite number is not persistable: ${value}`);
      }
      // JSON.stringify(-0) === "0"：与 world-model 摘要的数字规范化一致。
      return JSON.stringify(value);
    }
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalize(item)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
      return `{${members.join(",")}}`;
    }
    default:
      throw new TypeError(`value of type ${typeof value} is not persistable`);
  }
}
