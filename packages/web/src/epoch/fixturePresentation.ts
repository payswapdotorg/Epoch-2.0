/**
 * 构造 fixture 世界修订 -> 渲染器中立世界表现（PresentationCompiler 实现）。
 *
 * 依据 spec/architecture/contracts/world-presentation.md「Compilation」：
 * WorldRevision -> 规范表现编译 -> WorldPresentation -> 渲染器适配器。
 * 渲染器不得修改规范表现源。本编译器是 W005 宿主侧参考实现（W002/W007 之前
 * 的过渡实现；契约允许宿主提供编译器），确定性：同修订+同种子+同模式 =>
 * 同表现。
 *
 * 编译只读 fixture 实体携带的扩展投影字段（layer + GeometrySeed）——这些是
 * W002 fixture 公开契约（ConstructionFixtureEntity / isGeometrySeed）的扩展
 * 数据，不参与世界摘要，属投影/分类。本编译器不引入新语义身份。
 */
import type { WorldRevision, WorldEntity } from "@zcode/epoch-world-model";
import {
  CONSTRUCTION_LAYER_DESCRIPTIONS,
  CONSTRUCTION_LAYERS,
  isConstructionLayerId,
  isGeometrySeed,
  type ConstructionFixtureEntity,
} from "@zcode/epoch-construction-fixture";
import type {
  RepresentationRef,
  WorldPresentation,
  WorldPresentationNode,
} from "@zcode/epoch-world-presentation";
import {
  eulerDegToQuaternion,
  identityQuaternion,
  representationForSeed,
} from "./geometryCodec.js";

/** 编译选项（投影模式缺省 3d）。 */
export interface FixtureCompileOptions {
  readonly projectionMode?: "3d" | "plan" | "section-cutaway" | string;
}

function asFixtureEntity(entity: WorldEntity): ConstructionFixtureEntity | null {
  const candidate = entity as unknown as Partial<ConstructionFixtureEntity>;
  if (!isConstructionLayerId(candidate.layer)) return null;
  if (!isGeometrySeed(candidate.geometry)) return null;
  return candidate as ConstructionFixtureEntity;
}

function nodeForEntity(entity: ConstructionFixtureEntity, index: number): WorldPresentationNode {
  const presentationId = `p:${entity.entityId}`;
  const seed = entity.geometry;
  const representation: RepresentationRef = representationForSeed(seed, `r:${index}`);
  const translation = {
    x: seed.position[0] ?? 0,
    y: seed.position[1] ?? 0,
    z: seed.position[2] ?? 0,
  };
  const rotation = seed.rotation
    ? eulerDegToQuaternion(seed.rotation[0] ?? 0, seed.rotation[1] ?? 0, seed.rotation[2] ?? 0)
    : identityQuaternion();
  return {
    presentationId,
    entityId: entity.entityId,
    transform: { translation, rotation },
    representations: [representation],
    visibility: "visible",
    interaction: {
      selectable: true,
      focusable: true,
      layerIds: [entity.layer],
    },
  };
}

/**
 * 把构造 fixture 世界修订编译为渲染器中立表现。
 * 非法扩展字段（layer/geometry 缺失）的实体跳过（守卫忽略未知字段语义）。
 */
export function compileFixturePresentation(
  revision: WorldRevision,
  options?: FixtureCompileOptions,
): WorldPresentation {
  const projectionMode = options?.projectionMode ?? "3d";
  const nodes: WorldPresentationNode[] = [];
  let index = 0;
  for (const entity of revision.entities) {
    const fixtureEntity = asFixtureEntity(entity);
    if (!fixtureEntity) continue;
    nodes.push(nodeForEntity(fixtureEntity, index));
    index += 1;
  }
  return {
    worldId: revision.worldId,
    revisionId: revision.revisionId,
    digest: revision.digest,
    projectionMode,
    nodes,
  };
}

/** fixture 六层词汇（图层控制 UI 与渲染器 setVisibility 共用）。 */
export function fixtureLayerIds(): readonly string[] {
  return CONSTRUCTION_LAYERS;
}

/** fixture 层描述（图层控制 UI 展示）。 */
export function fixtureLayerDescriptions(): Readonly<Record<string, string>> {
  return CONSTRUCTION_LAYER_DESCRIPTIONS;
}
