export const LIMITATION_AREAS = [
  "runtime",
  "parsing",
  "ingestion",
  "scale",
  "cross-package",
  "determinism",
] as const;
export type LimitationArea = (typeof LIMITATION_AREAS)[number];

export interface LimitationStatement {
  readonly id: string;
  readonly area: LimitationArea;
  readonly statement: string;
  readonly mitigation: string;
}

/** Honest record of external/native capability limitations. */
export interface LimitationsReport {
  readonly schemaVersion: 1;
  readonly reportId: string;
  readonly statements: readonly LimitationStatement[];
}
