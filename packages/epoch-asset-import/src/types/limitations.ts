export type LimitationScope = "runtime" | "format-matrix" | "archives" | "provenance" | "contract";

export type LimitationItem = {
  readonly id: string;
  readonly scope: LimitationScope;
  readonly summary: string;
};

export type LimitationsReport = {
  readonly reportId: string;
  readonly honest: true;
  readonly items: readonly LimitationItem[];
};
