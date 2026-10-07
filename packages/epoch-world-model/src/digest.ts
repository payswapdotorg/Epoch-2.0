/**
 * epoch-world-model 确定性世界摘要契约 + 实现。
 *
 * ## 摘要算法（冻结定义）
 *
 * 输入 `WorldDigestSource`（`WorldRevision` 结构上满足该接口），
 * 摘要只覆盖规范语义内容：
 *
 * 1. 规范对象只包含四个键（键按 UTF-16 码元升序序列化）：
 *    - `entities`：每个实体的规范字段，按 `entityId` 升序（UTF-16 码元序）排列；
 *    - `provenance`：修订级溯源，按 `(sourceId, kind, artifact)` 升序排列；
 *    - `relationships`：按 `(relationshipId, kind, fromEntityId, toEntityId)` 升序排列；
 *    - `worldId`：世界身份字符串。
 * 2. 排除项：`revisionId`（身份元数据）、`digest`（自身）、`presentationSeed`
 *    （投影种子，非语义内容）。未知字段一律丢弃——摘要只覆盖上述规范字段。
 * 3. 实体规范字段：`constraints`（存在时按字典序排序，集合语义）、
 *    `costReference`、`dimensions`（键排序的 quantity 映射）、`entityId`、
 *    `entityType`、`label`、`material{grade,type}`、`phase`、`provenance`
 *    （同上排序）、`quantity{unit,value}`、`status`。可选字段仅在其「存在且
 *    非 undefined」时参与（在场性是语义）：`[]`/`{}` 与缺失产生不同摘要；
 *    修订级 `provenance` 同样按在场性处理（`WorldRevision.provenance`
 *    为必填，直接传入修订时恒参与）。
 * 4. 序列化为「递归键排序、无空白」的规范 JSON：对象键按 UTF-16 码元升序
 *    （`Array.prototype.sort` 默认序）手工序列化，避免 JS 整数样键重排；
 *    字符串转义与数字格式遵循 ECMAScript `JSON.stringify`（数字为最短往返
 *    表示；`-0` 规范化为 `0`；非有限数字视为非法并抛错）。
 * 5. 摘要 = SHA-256（`node:crypto`）对规范 JSON 的 UTF-8 字节，输出 64 位
 *    小写 hex 字符串。
 *
 * 同一规范输入在任何进程与任何次运行中产生相同摘要；键序不同（语义相同）
 * 的输入产生相同摘要；实体/关系/溯源/约束数组顺序不同（集合语义相同）的
 * 输入产生相同摘要；语义内容不同的输入以 sha-256 概率分离。
 */
import { createHash } from "node:crypto";
import type { WorldEntity } from "./entity.ts";
import type { WorldRelationship } from "./relationship.ts";
import type { ProvenanceRef } from "./provenance.ts";

/** 摘要算法标识（契约级：固定为 sha256）。 */
export const WORLD_DIGEST_ALGORITHM = "sha256" as const;
export type WorldDigestAlgorithm = typeof WORLD_DIGEST_ALGORITHM;

/** 摘要输出格式：64 位小写 hex。 */
export const WORLD_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/**
 * 摘要输入的规范语义视图。`WorldRevision` 结构上满足该接口：
 * 直接传入修订即可（digest/revisionId/presentationSeed 会被排除）。
 */
export interface WorldDigestSource {
  readonly worldId: string;
  readonly entities: readonly WorldEntity[];
  readonly relationships: readonly WorldRelationship[];
  readonly provenance?: readonly ProvenanceRef[];
}

/** 摘要值守卫：64 位小写 hex 字符串。 */
export function isWorldDigest(value: unknown): value is string {
  return typeof value === "string" && WORLD_DIGEST_PATTERN.test(value);
}

type Canonical = string | number | boolean | Canonical[] | { [key: string]: Canonical | undefined };

/** 递归键排序、无空白的规范 JSON 序列化（手工构造，规避整数样键重排）。 */
function canonicalJson(value: Canonical): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`non-finite number is not valid canonical world content: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  const members = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as Canonical)}`,
  );
  return `{${members.join(",")}}`;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalProvenanceList(refs: readonly ProvenanceRef[]): Canonical {
  return refs
    .map((ref) => ({
      artifact: ref.artifact,
      engineId: ref.engineId,
      engineVersion: ref.engineVersion,
      digest: ref.digest,
      kind: ref.kind,
      sourceId: ref.sourceId,
    }))
    .sort((left, right) =>
      compareStrings(left.sourceId, right.sourceId) ||
      compareStrings(left.kind, right.kind) ||
      compareStrings(left.artifact ?? "", right.artifact ?? ""),
    );
}

function canonicalEntity(entity: WorldEntity): Canonical {
  return {
    constraints:
      entity.constraints === undefined ? undefined : [...entity.constraints].sort(compareStrings),
    costReference: entity.costReference,
    dimensions:
      entity.dimensions === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(entity.dimensions).map(([key, quantity]) => [
              key,
              { unit: quantity.unit, value: quantity.value },
            ]),
          ),
    entityId: entity.entityId,
    entityType: entity.entityType,
    label: entity.label,
    material:
      entity.material === undefined
        ? undefined
        : { grade: entity.material.grade, type: entity.material.type },
    phase: entity.phase,
    provenance:
      entity.provenance === undefined ? undefined : canonicalProvenanceList(entity.provenance),
    quantity:
      entity.quantity === undefined
        ? undefined
        : { unit: entity.quantity.unit, value: entity.quantity.value },
    status: entity.status,
  };
}

function canonicalRelationship(relationship: WorldRelationship): Canonical {
  return {
    fromEntityId: relationship.fromEntityId,
    kind: relationship.kind,
    label: relationship.label,
    provenance:
      relationship.provenance === undefined
        ? undefined
        : canonicalProvenanceList(relationship.provenance),
    relationshipId: relationship.relationshipId,
    toEntityId: relationship.toEntityId,
  };
}

/**
 * 输出世界的规范 JSON 字符串（无空白、递归键排序、集合排序）。
 * 测试与调试用它核对规范形态；`computeWorldDigest` 用它做哈希输入。
 */
export function canonicalizeWorld(world: WorldDigestSource): string {
  const canonical: Canonical = {
    entities: [...world.entities]
      .sort((left, right) => compareStrings(left.entityId, right.entityId))
      .map((entity) => canonicalEntity(entity)),
    provenance:
      world.provenance === undefined ? undefined : canonicalProvenanceList(world.provenance),
    relationships: [...world.relationships]
      .sort(
        (left, right) =>
          compareStrings(left.relationshipId, right.relationshipId) ||
          compareStrings(left.kind, right.kind) ||
          compareStrings(left.fromEntityId, right.fromEntityId) ||
          compareStrings(left.toEntityId, right.toEntityId),
      )
      .map((relationship) => canonicalRelationship(relationship)),
    worldId: world.worldId,
  };
  return canonicalJson(canonical);
}

/**
 * 计算世界摘要：SHA-256（node:crypto）对 `canonicalizeWorld(world)`
 * 的 UTF-8 字节，输出 64 位小写 hex。
 */
export function computeWorldDigest(world: WorldDigestSource): string {
  return createHash(WORLD_DIGEST_ALGORITHM)
    .update(canonicalizeWorld(world), "utf8")
    .digest("hex");
}
