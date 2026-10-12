/**
 * Return-package types: what comes back from the Arena — typed data,
 * validated on receipt, never assumed correct.
 */
import type {
  DeliverableKind,
  EvidencePayload,
  Hex64,
  Iso8601,
  NonEmptyString,
  ReusePermissionRequest,
} from "./types-core.js";

/** A verifiable claim inside a deliverable. */
export interface DeliverableClaim {
  readonly claimId: NonEmptyString;
  readonly statement: NonEmptyString;
  /** Task-package evidence payload digests backing the claim. */
  readonly supportedByEvidence: readonly Hex64[];
}

/** One deliverable, with typed content and claims. */
export interface DeliverableRef {
  readonly deliverableId: NonEmptyString;
  readonly kind: DeliverableKind;
  readonly claims: readonly DeliverableClaim[];
  readonly payload: EvidencePayload;
}

/** The expert's own declaration about their return. */
export interface ExpertDeclaration {
  /** Pseudonymous expert id. */
  readonly expertId: NonEmptyString;
  readonly expertiseAreas: readonly NonEmptyString[];
  readonly conflictOfInterest:
    | "none-declared"
    | { readonly description: NonEmptyString };
  /** 0..1 inclusive. */
  readonly confidence: number;
  readonly limitations: readonly NonEmptyString[];
  readonly attestation: NonEmptyString;
  readonly declaredAt: Iso8601;
}

/** Where a return says it came from. */
export interface ReturnProvenance {
  readonly arena: "simulated" | "production";
  readonly channel: NonEmptyString;
  readonly taskPackageDigest: Hex64;
  readonly submittedAt: Iso8601;
}

/** Expert-produced content, before sealing. */
export interface ArenaReturnDraft {
  readonly deliverables: readonly DeliverableRef[];
  readonly declaration: ExpertDeclaration;
  readonly reusePermissionRequested: ReusePermissionRequest;
}

/** The typed return package, sealed with digest + provenance. */
export interface ArenaReturnPackage {
  readonly schemaVersion: "1";
  readonly returnId: NonEmptyString;
  readonly provenance: ReturnProvenance;
  readonly deliverables: readonly DeliverableRef[];
  readonly declaration: ExpertDeclaration;
  readonly reusePermissionRequested: ReusePermissionRequest;
  readonly digest: Hex64;
}

/** Typed structural-validation issues found on receipt. */
export type ReturnValidationIssue =
  | {
      readonly type: "schema-version-unsupported";
      readonly supported: "1";
      readonly actual: string;
    }
  | {
      readonly type: "digest-mismatch";
      readonly field: "digest";
      readonly expected: Hex64;
      readonly actual: Hex64;
    }
  | {
      readonly type: "task-package-mismatch";
      readonly expected: Hex64;
      readonly actual: Hex64;
    }
  | { readonly type: "no-deliverables" }
  | { readonly type: "invalid-confidence"; readonly value: number }
  | { readonly type: "empty-attestation" }
  | {
      readonly type: "invalid-timestamp";
      readonly field: string;
      readonly value: string;
    }
  | {
      readonly type: "claim-evidence-ref-unknown";
      readonly claimId: NonEmptyString;
      readonly evidenceDigest: Hex64;
    }
  | { readonly type: "missing-reuse-request" };

export type ReturnValidation =
  | { readonly ok: true; readonly returnDigest: Hex64 }
  | { readonly ok: false; readonly issues: readonly ReturnValidationIssue[] };
