/**
 * 语义关系（baseline + alternate 超集）。
 *
 * 引擎按变体实体存在性过滤：若 from/to 实体不在当前变体实体集中，关系被丢弃。
 * 故平屋面关系（引用 structure-roof-slab/envelope-roof-flat）在 baseline 存活，
 * 在 alternate（这两实体被替换）自动剔除；坡屋面关系反之。这保证关系集与实体集一致。
 *
 - finding-drain-footing-clash 以 clashes-with 关系编码进修订（在摘要内）。
 */
import type { WorldRelationship } from "@zcode/epoch-world-model";
import { authorRef } from "./helpers.ts";

function rel(
  relationshipId: string,
  kind: WorldRelationship["kind"],
  fromEntityId: string,
  toEntityId: string,
  label?: string,
): WorldRelationship {
  return label === undefined
    ? { relationshipId, kind, fromEntityId, toEntityId }
    : { relationshipId, kind, fromEntityId, toEntityId, label };
}

/** 包含 baseline + alternate 屋面关系的超集；引擎按变体实体存在性过滤。 */
export function allRelationships(): readonly WorldRelationship[] {
  return [
    rel("rel-plot-contains-subgrade", "contains", "site-plot", "foundation-subgrade"),
    rel("rel-plot-contains-access-road", "contains", "site-plot", "site-access-road"),
    rel("rel-plot-contains-staging", "contains", "site-plot", "site-staging-area"),
    rel("rel-plot-contains-fence", "contains", "site-plot", "site-perimeter-fence"),
    rel("rel-plot-contains-office", "contains", "site-plot", "site-office-temp"),
    rel("rel-subgrade-supports-slab", "supports", "foundation-subgrade", "foundation-ground-slab"),
    rel(
      "rel-strip-south-supports-wall-south",
      "supports",
      "foundation-strip-footing-south",
      "wall-south",
    ),
    rel(
      "rel-strip-north-supports-wall-north",
      "supports",
      "foundation-strip-footing-north",
      "wall-north",
    ),
    rel(
      "rel-strip-east-supports-wall-east",
      "supports",
      "foundation-strip-footing-east",
      "wall-east",
    ),
    rel(
      "rel-strip-west-supports-wall-west",
      "supports",
      "foundation-strip-footing-west",
      "wall-west",
    ),
    rel("rel-pad-1-supports-col-1", "supports", "foundation-pad-footing-1", "col-1"),
    rel("rel-pad-2-supports-col-2", "supports", "foundation-pad-footing-2", "col-2"),
    rel("rel-pad-3-supports-col-3", "supports", "foundation-pad-footing-3", "col-3"),
    rel("rel-pad-4-supports-col-4", "supports", "foundation-pad-footing-4", "col-4"),
    rel("rel-col-1-supports-beam-south", "supports", "col-1", "beam-south"),
    rel("rel-col-2-supports-beam-north", "supports", "col-2", "beam-north"),
    rel("rel-col-3-supports-beam-south", "supports", "col-3", "beam-south"),
    rel("rel-col-4-supports-beam-north", "supports", "col-4", "beam-north"),
    rel("rel-beam-south-supports-roof-slab", "supports", "beam-south", "structure-roof-slab"),
    rel("rel-beam-north-supports-roof-slab", "supports", "beam-north", "structure-roof-slab"),
    rel("rel-beam-east-supports-roof-slab", "supports", "beam-east", "structure-roof-slab"),
    rel("rel-beam-west-supports-roof-slab", "supports", "beam-west", "structure-roof-slab"),
    rel("rel-roof-slab-supports-membrane", "supports", "structure-roof-slab", "envelope-roof-flat"),
    rel("rel-wall-south-adjacent-wall-east", "adjacent-to", "wall-south", "wall-east"),
    rel("rel-wall-east-adjacent-wall-north", "adjacent-to", "wall-east", "wall-north"),
    rel("rel-wall-north-adjacent-wall-west", "adjacent-to", "wall-north", "wall-west"),
    rel("rel-wall-west-adjacent-wall-south", "adjacent-to", "wall-west", "wall-south"),
    rel("rel-wall-south-connects-door", "connects", "wall-south", "envelope-door-main"),
    rel("rel-wall-north-connects-window-1", "connects", "wall-north", "envelope-window-1"),
    rel("rel-wall-north-connects-window-2", "connects", "wall-north", "envelope-window-2"),
    rel("rel-db-serves-light-1", "serves", "mep-distribution-board", "mep-light-fixture-1"),
    rel("rel-db-serves-light-2", "serves", "mep-distribution-board", "mep-light-fixture-2"),
    rel("rel-db-serves-hvac-unit", "serves", "mep-distribution-board", "mep-hvac-unit"),
    rel("rel-supply-connects-hvac", "connects", "mep-supply-pipe", "mep-hvac-unit"),
    rel("rel-drain-depends-subgrade", "depends-on", "mep-drain-run", "foundation-subgrade"),
    {
      relationshipId: "rel-drain-clashes-strip-south",
      kind: "clashes-with",
      fromEntityId: "mep-drain-run",
      toEntityId: "foundation-strip-footing-south",
      label: "finding-drain-footing-clash",
      provenance: [authorRef("agent-mep-coordinator")],
    },
    rel(
      "rel-slab-supports-floor-finish",
      "supports",
      "foundation-ground-slab",
      "finishes-floor-tile",
    ),
    rel("rel-wall-south-contains-plaster", "contains", "wall-south", "finishes-plaster-south"),
    rel("rel-wall-north-contains-plaster", "contains", "wall-north", "finishes-plaster-north"),
    rel("rel-wall-east-supports-ridge", "supports", "wall-east", "structure-beam-ridge"),
    rel("rel-wall-west-supports-ridge", "supports", "wall-west", "structure-beam-ridge"),
    rel(
      "rel-ridge-supports-slope-south",
      "supports",
      "structure-beam-ridge",
      "envelope-roof-slope-south",
    ),
    rel(
      "rel-ridge-supports-slope-north",
      "supports",
      "structure-beam-ridge",
      "envelope-roof-slope-north",
    ),
  ];
}
