export type CostPhase =
  | "human-implementation"
  | "human-review"
  | "operating"
  | "maintenance"
  | "migration"
  | "decommission";

export type CostKind = "human" | "operating" | "maintenance";  // work order: "human cost + operating/maintenance cost when data permits"
