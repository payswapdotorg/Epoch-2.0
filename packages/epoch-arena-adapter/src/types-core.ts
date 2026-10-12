/**
 * Core vocabulary types shared across the Arena adapter.
 *
 * Loose-coupling law: W025 (escalation), W029 (environment activity)
 * and W032 (capability learning) records are referenced BY DIGEST
 * ONLY — this package never imports those packages and never
 * re-interprets their semantics (no second semantic authority).
 */

/** 64-char lowercase hex SHA-256 digest. */
export type Hex64 = string;

/** Strict ISO-8601 UTC timestamp string (trailing `Z`). */
export type Iso8601 = string;

/** Non-empty string. */
export type NonEmptyString = string;

/** JSON-safe value (what canonical serialization accepts). */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Where a piece of evidence came from. */
export type EvidenceKind =
  | "capability-gap"
  | "demonstration"
  | "escalation-exchange"
  | "environment-log"
  | "synthetic";

/** Kinds of expert deliverable. */
export type DeliverableKind =
  "analysis" | "patch-proposal" | "artifact" | "report";

/** Typed evidence payload (never raw bytes, never opaque blobs). */
export type EvidencePayload =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "json"; readonly value: JsonValue };

/**
 * Full-fidelity evidence available on the host. Never leaves the task
 * builder unredacted.
 */
export interface EvidenceSource {
  readonly sourceId: NonEmptyString;
  readonly kind: EvidenceKind;
  readonly tags: readonly string[];
  readonly payload: EvidencePayload;
}

/** One literal-substring redaction rule. */
export interface RedactionRule {
  readonly ruleId: NonEmptyString;
  readonly literal: NonEmptyString;
  readonly replacement: NonEmptyString;
}

/**
 * Privacy-preserving evidence export: minimized to the scoped task,
 * redacted, and referenced by digest. `sourceDigest` digests the
 * ORIGINAL payload for traceability — the original itself is never
 * included in the export.
 */
export interface EvidenceExport {
  readonly evidenceId: NonEmptyString;
  readonly kind: EvidenceKind;
  readonly tags: readonly string[];
  readonly payload: EvidencePayload;
  /** Digest of the exported (redacted) payload — what the expert sees. */
  readonly payloadDigest: Hex64;
  /** Digest of the original unredacted payload (traceability only). */
  readonly sourceDigest: Hex64;
  /** Redaction rule ids that actually fired. */
  readonly redactionsApplied: readonly NonEmptyString[];
}

/** Reference to a W032 CapabilityGap record — by digest only. */
export interface GapRef {
  readonly gapId: NonEmptyString;
  readonly capabilityGapDigest: Hex64;
  readonly title: NonEmptyString;
}

/** Reuse scopes understood by the adapter. */
export type ReuseScope =
  | "capability-promotion"
  | "demonstration-capture"
  | "world-revision"
  | "internal-analysis";

/** What the expert declared about reuse of their return. */
export type ReusePermissionRequest =
  | {
      readonly kind: "granted";
      readonly scopes: readonly ReuseScope[];
      readonly conditions: readonly NonEmptyString[];
    }
  | { readonly kind: "denied"; readonly reason: NonEmptyString }
  | { readonly kind: "unspecified" };
