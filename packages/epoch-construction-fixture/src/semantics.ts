/**
 * 构造 fixture 语义丰富度（W002「Semantics richness」契约最小集）。
 *
 - 至少两个 agent（agent 引用）：以 author 溯源附加到实体（冻结契约 provenance）。
 - 至少一个 constraint：以实体 constraints 字段（冻结契约）携带，定义在此处。
 - 至少一个 finding：以 clashes-with 关系（冻结契约）编码进修订，定义在此处。
 - 至少两个 variant：见 descriptor.ts + engine.ts（不同变体 -> 不同实体集 -> 不同摘要）。
 *
 这些定义是渲染器中立的语义数据（非 mesh 语义），确定性字面量。
 */
import type { ConstructionLayerId } from "./layers.ts";

/** 构造 agent（设计/施工参与方引用）。 */
export interface ConstructionFixtureAgent {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly discipline: string;
}

/** 构造约束定义（实体 constraints 字段引用这些 id）。 */
export interface ConstructionFixtureConstraint {
  readonly constraintId: string;
  readonly label: string;
  readonly description: string;
  readonly appliesToLayers: readonly ConstructionLayerId[];
}

/** 构造发现定义（至少一个以 clashes-with 关系编码进修订）。 */
export interface ConstructionFixtureFinding {
  readonly findingId: string;
  readonly label: string;
  readonly description: string;
  readonly kind: "clash" | "coverage-gap" | "defect";
  readonly entityIds: readonly string[];
}

export const CONSTRUCTION_FIXTURE_AGENTS: readonly ConstructionFixtureAgent[] = [
  {
    agentId: "agent-structural-engineer",
    name: "M. Okafor",
    role: "Structural Engineer of Record",
    discipline: "structural",
  },
  {
    agentId: "agent-mep-coordinator",
    name: "L. Sørensen",
    role: "MEP Coordinator",
    discipline: "mep",
  },
  {
    agentId: "agent-site-manager",
    name: "R. Vasquez",
    role: "Site Manager",
    discipline: "site",
  },
];

export const CONSTRUCTION_FIXTURE_CONSTRAINTS: readonly ConstructionFixtureConstraint[] = [
  {
    constraintId: "constraint-fire-rating-60",
    label: "60-minute fire rating",
    description:
      "Envelope elements enclosing the equipment room must achieve a 60-minute fire rating.",
    appliesToLayers: ["ENVELOPE"],
  },
  {
    constraintId: "constraint-slab-bearing-150kPa",
    label: "Slab bearing capacity 150 kPa",
    description:
      "Ground slab and footings designed for 150 kPa allowable bearing pressure on prepared subgrade.",
    appliesToLayers: ["FOUNDATION", "STRUCTURE"],
  },
  {
    constraintId: "constraint-headroom-2700mm",
    label: "Minimum headroom 2.7 m",
    description:
      "Finished clear headroom above slab must not be less than 2.7 m at any passable point.",
    appliesToLayers: ["STRUCTURE", "ENVELOPE"],
  },
];

export const CONSTRUCTION_FIXTURE_FINDINGS: readonly ConstructionFixtureFinding[] = [
  {
    findingId: "finding-drain-footing-clash",
    label: "Drainage run clashes with perimeter footing",
    description:
      "The perimeter floor drainage run intersects the south strip footing; coordinate an offset or sleeve before substructure pour.",
    kind: "clash",
    entityIds: ["mep-drain-run", "foundation-strip-footing-south"],
  },
  {
    findingId: "finding-light-coverage-gap",
    label: "Lighting coverage gap at north-east corner",
    description:
      "Light fixture L2 does not meet the 200 lux target at the north-east corner; add a third fixture or relocate L2.",
    kind: "coverage-gap",
    entityIds: ["mep-light-fixture-1", "mep-light-fixture-2"],
  },
];

export function agentById(agentId: string): ConstructionFixtureAgent | undefined {
  return CONSTRUCTION_FIXTURE_AGENTS.find((agent) => agent.agentId === agentId);
}

export function constraintById(constraintId: string): ConstructionFixtureConstraint | undefined {
  return CONSTRUCTION_FIXTURE_CONSTRAINTS.find((item) => item.constraintId === constraintId);
}

export function findingById(findingId: string): ConstructionFixtureFinding | undefined {
  return CONSTRUCTION_FIXTURE_FINDINGS.find((item) => item.findingId === findingId);
}
