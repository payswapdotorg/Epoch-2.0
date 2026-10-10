/**
 * W020 — public contract for the qa/epoch-world verification battery.
 *
 * This is a script/contract surface (typed shapes the battery, the checker and
 * the ledger all agree on), not a runtime API. It declares:
 * - the evidence convention types (each acceptance item: named evidence file,
 *   caption law, environment qualification, verdict);
 * - the environment capability matrix (honest self-declaration of which
 *   environment each check ran in);
 * - the battery report shape (pass/fail/skip counts + per-check verdicts).
 *
 * Conforms to ARCHITECTURE-LOCK #27 (evidence-based capability claims) and the
 * visualization-first law: a check that cannot run honestly is reported SKIPPED
 * with its blocker, never silently passed.
 */

/** The two merged hosts the battery drives the journey through. */
export type HostKind = "web" | "desktop";

/** The two merged renderers that mount the SAME WorldPresentation. */
export type RendererKind = "babylon" | "three";

/**
 * Environment capability axis. Each axis self-declares the honest value the
 * check ran under. "software" / "headless" / "offline" are honest admissions;
 * "real" is only claimed when the real capability is actually present.
 */
export interface EnvironmentQualification {
  /** real-GPU vs software rendering (SwiftShader / NullEngine). */
  readonly gpu: "real" | "software";
  /** real browser/Electron window vs headless / NullEngine. */
  readonly hostRuntime: "real" | "headless" | "null-engine";
  /** real network vs offline (fixture is client-side / network-free). */
  readonly network: "real" | "offline";
  /** Free-form note recording the specific environment (e.g. SwiftShader WebGL,
   * Electron binary absent). */
  readonly note: string;
}

/** The verdict for a single acceptance item. */
export type EvidenceVerdict = "pass" | "skip" | "fail";

/** A single acceptance item's evidence record (the convention unit). */
export interface EvidenceItem {
  /** Stable id, e.g. "web:01-open" or "equivalence:same-entityId-set". */
  readonly id: string;
  /** Work order the item verifies (W005/W006/W008/W020). */
  readonly workOrder: string;
  /** Which host this item is for (equivalence items use "both"). */
  readonly host: HostKind | "both";
  /** Which renderer this item exercises (equivalence items use "both"). */
  readonly renderer: RendererKind | "both";
  /** Step label in the journey (open/world/navigate/select/...). */
  readonly step: string;
  /** Caption law: what MUST be visible in the evidence for the item to pass. */
  readonly caption: string;
  /** Relative path to the evidence file (screenshot/recording) under
   * qa/epoch-world/evidence/. Empty/absent for skipped items. */
  readonly evidencePath: string;
  /** Honest environment qualification for this item's run. */
  readonly environment: EnvironmentQualification;
  readonly verdict: EvidenceVerdict;
  /** For skipped items: the blocker (why it could not run honestly). */
  readonly skipReason?: string;
  /** ISO timestamp the item was captured. */
  readonly capturedAt: string;
}

/** The environment capability matrix (one row per check family). */
export interface CapabilityMatrixRow {
  readonly check: string;
  readonly gpu: EnvironmentQualification["gpu"];
  readonly hostRuntime: EnvironmentQualification["hostRuntime"];
  readonly network: EnvironmentQualification["network"];
  readonly available: boolean;
  readonly blocker?: string;
}

/** The battery report produced by run-battery.mjs. */
export interface BatteryReport {
  readonly workOrder: "W020";
  readonly generatedAt: string;
  readonly counts: {
    readonly pass: number;
    readonly skip: number;
    readonly fail: number;
    readonly total: number;
  };
  readonly capabilityMatrix: readonly CapabilityMatrixRow[];
  readonly items: readonly EvidenceItem[];
}

/** Guard: non-empty string. */
export function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Guard: an evidence item is well-formed AND labeled (caption + environment
 * note present). The checker FAILS any item that is not well-formed-labeled. */
export function isLabeledEvidenceItem(value: unknown): value is EvidenceItem {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (!isNonEmpty(c.id) || !isNonEmpty(c.workOrder) || !isNonEmpty(c.step)) return false;
  if (!isNonEmpty(c.caption)) return false;
  if (typeof c.environment !== "object" || c.environment === null) return false;
  const env = c.environment as Record<string, unknown>;
  if (!isNonEmpty(env.note)) return false;
  if (env.gpu !== "real" && env.gpu !== "software") return false;
  if (
    env.hostRuntime !== "real" &&
    env.hostRuntime !== "headless" &&
    env.hostRuntime !== "null-engine"
  ) {
    return false;
  }
  if (env.network !== "real" && env.network !== "offline") return false;
  if (c.verdict !== "pass" && c.verdict !== "skip" && c.verdict !== "fail") return false;
  if (c.verdict === "skip" && !isNonEmpty(c.skipReason)) return false;
  return true;
}
