import type { KebabId, UtcTimestamp } from "./brands.js";

export type LimitationArea =
  | "execution"
  | "environment"
  | "fidelity"
  | "licensing"
  | "semantics"
  | "provenance";

export interface Limitation {
  readonly limitationId: KebabId;
  readonly area: LimitationArea;
  readonly statement: string;
  readonly mitigation: string | null;
}

export interface LimitationsReport {
  readonly kind: "limitations-report";
  readonly reportId: KebabId;
  readonly packageName: string;
  readonly recordedAtUtc: UtcTimestamp;
  readonly limitations: readonly Limitation[];
  readonly notLegalAdvice: true;
  readonly honestyNotes: readonly string[];
}
