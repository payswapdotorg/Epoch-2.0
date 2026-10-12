import type { KebabId } from "./shared.js";

/**
 * LimitationsReport types — the honest record of what this package does NOT
 * do (pricing, scheduling, code-compliance checking, geometry computation,
 * execution, persistence).
 */

export type LimitationScope =
  | "pricing"
  | "scheduling"
  | "code-compliance"
  | "geometry"
  | "execution"
  | "persistence";

export interface LimitationStatement {
  readonly scope: LimitationScope;
  readonly statement: string;
  readonly mitigation: string;
}

export interface LimitationsReport {
  readonly reportId: KebabId;
  readonly statements: readonly LimitationStatement[];
}
