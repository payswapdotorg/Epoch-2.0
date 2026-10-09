/**
 * 构造 fixture 引擎描述符与确定性溯源常量（W002「Provenance」）。
 *
 * fixture 溯源：engine id + version + 确定性内容引用（contentRef）。无时间戳、
 * 无随机——所有标识为字面量，保证 open() 幂等且可复现。
 */
import type { ReconstructionEngineDescriptor } from "@zcode/epoch-reconstruction-contract";

/** 引擎身份（注册表唯一键）。 */
export const CONSTRUCTION_FIXTURE_ENGINE_ID = "epoch.construction-fixture";
/** 引擎版本（语义化）。 */
export const CONSTRUCTION_FIXTURE_ENGINE_VERSION = "0.1.0";
/** 引擎人类可读名称。 */
export const CONSTRUCTION_FIXTURE_ENGINE_NAME = "Epoch Construction Fixture Engine";

/** 世界身份（跨修订稳定；确定性字面量）。 */
export const CONSTRUCTION_FIXTURE_WORLD_ID = "epoch-fixture-pump-house-v1";
/** 确定性内容引用：fixture 内容的版本化锚点（用于溯源 artifact 字段）。 */
export const CONSTRUCTION_FIXTURE_CONTENT_REF = "epoch-fixture-content@v1";

/** 引擎接受的输入种类（仅 engine-native：fixture 不读取文件/网络）。 */
export const CONSTRUCTION_FIXTURE_INPUT_KINDS = ["engine-native"] as const;

/** 变体标识：选择不同变体改变投影世界（不同实体集 -> 不同摘要）。 */
export const CONSTRUCTION_FIXTURE_VARIANT_IDS = ["baseline", "alternate-pitched-roof"] as const;
export type ConstructionFixtureVariantId = (typeof CONSTRUCTION_FIXTURE_VARIANT_IDS)[number];

export const CONSTRUCTION_FIXTURE_VARIANT_SET: ReadonlySet<string> = new Set<string>(
  CONSTRUCTION_FIXTURE_VARIANT_IDS,
);

export function isConstructionFixtureVariantId(
  value: unknown,
): value is ConstructionFixtureVariantId {
  return typeof value === "string" && CONSTRUCTION_FIXTURE_VARIANT_SET.has(value);
}

/** 引擎能力声明：open/inspect/mutate/variants 为真；timeline/measurements/simulation 为假。 */
export const CONSTRUCTION_FIXTURE_CAPABILITIES = {
  open: true,
  inspect: true,
  mutate: true,
  timeline: false,
  variants: true,
  measurements: false,
  simulation: false,
} as const;

/** 引擎描述符（冻结字面量，每次 descriptor() 返回同一引用）。 */
export const CONSTRUCTION_FIXTURE_DESCRIPTOR: ReconstructionEngineDescriptor = {
  id: CONSTRUCTION_FIXTURE_ENGINE_ID,
  name: CONSTRUCTION_FIXTURE_ENGINE_NAME,
  version: CONSTRUCTION_FIXTURE_ENGINE_VERSION,
  runtime: "in-process",
  inputKinds: [...CONSTRUCTION_FIXTURE_INPUT_KINDS],
  capabilities: CONSTRUCTION_FIXTURE_CAPABILITIES,
};

/** 构造阶段词汇（phase 字段，per 冻结契约；确定性字面量）。 */
export const CONSTRUCTION_PHASES = [
  "site-works",
  "substructure",
  "superstructure",
  "envelope",
  "services",
  "fitout",
] as const;
export type ConstructionPhase = (typeof CONSTRUCTION_PHASES)[number];

/**
 * fixture 修订级溯源引用：标记内容来自 fixture 引擎 + 确定性内容引用。
 * 参与世界摘要（provenance 在规范字段内），故内容确定时溯源亦确定。
 */
export function fixtureProvenanceRef(): {
  readonly sourceId: string;
  readonly kind: "fixture";
  readonly artifact: string;
  readonly engineId: string;
  readonly engineVersion: string;
} {
  return {
    sourceId: CONSTRUCTION_FIXTURE_ENGINE_ID,
    kind: "fixture" as const,
    artifact: CONSTRUCTION_FIXTURE_CONTENT_REF,
    engineId: CONSTRUCTION_FIXTURE_ENGINE_ID,
    engineVersion: CONSTRUCTION_FIXTURE_ENGINE_VERSION,
  };
}
