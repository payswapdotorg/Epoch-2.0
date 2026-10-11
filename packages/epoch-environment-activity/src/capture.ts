/**
 * CaptureController: pause/resume/inspect over a per-session recorder
 * (W029 task 2). Capture can be inspected and paused at any time.
 *
 * Laws enforced here:
 *  - events outside the policy scope are NEVER recorded (not even as
 *    markers — nothing about them enters the journal);
 *  - sensitive windows produce explicit redaction markers; the fact of
 *    redaction is recorded, never the content;
 *  - sequences are dense, monotonic, per session — never timestamps;
 *  - the recorder has no world/document write path of any kind.
 */

import { digestRecord } from "./canonical.js";
import {
  type CapturePolicy,
  type CorrelationSeed,
  type EnvironmentEvent,
  type EventKind,
  type EvidenceSeed,
  type GapMarker,
  type GapReason,
  type Initiator,
  type JournalRecord,
  type RedactionMarker,
  type SessionCoverageSummary,
  type SessionRef,
} from "./contract.js";
import { makeEvent, validateSessionRef } from "./events.js";
import {
  GAP_REASONS,
  isEventRecord,
  isGapMarker,
  isRedactionMarker,
  makeGapMarker,
  makeRedactionMarker,
  summarizeCoverage,
} from "./coverage.js";
import { captureDecision, isCapturePolicy, policyDigest } from "./policy.js";
import { deepFreeze } from "./freeze.js";
import { InvalidPolicyError, InvalidRecordError } from "./errors.js";

export interface EventInput {
  readonly kind: EventKind;
  readonly initiator: Initiator;
  readonly payload: unknown;
  readonly evidence?: readonly EvidenceSeed[];
  readonly correlations?: readonly CorrelationSeed[];
  /** When true, the event content is redacted: only a marker is recorded. */
  readonly sensitive?: boolean;
}

export type RejectionReason =
  | "capture-paused"
  | "consent-not-granted"
  | "out-of-scope";

export type RecordOutcome =
  | { readonly status: "recorded"; readonly event: EnvironmentEvent }
  | { readonly status: "redacted"; readonly marker: RedactionMarker }
  | {
      readonly status: "rejected";
      readonly reason: RejectionReason;
      readonly detail: string;
    };

export type CaptureMode = "active" | "paused";

export interface CaptureInspection {
  readonly session: SessionRef;
  readonly mode: CaptureMode;
  readonly sensitiveWindowOpen: boolean;
  readonly loadedPolicyDigests: readonly string[];
  readonly contributingPolicyDigests: readonly string[];
  /**
   * Aggregate telemetry only: rejectedAttempts counts refused record()
   * attempts (paused / consent / out-of-scope). No event kind, initiator,
   * payload or other event content is retained for rejected attempts.
   */
  readonly counts: {
    readonly events: number;
    readonly redactionMarkers: number;
    readonly gapMarkers: number;
    readonly rejectedAttempts: number;
  };
  readonly coverage: SessionCoverageSummary;
  readonly lastSequence: number | null;
}

export interface SessionJournal {
  readonly type: "session-journal";
  readonly session: SessionRef;
  /** Digests of the policies that authorized at least one recorded event. */
  readonly policyDigests: readonly string[];
  readonly records: readonly JournalRecord[];
  readonly coverage: SessionCoverageSummary;
}

export interface CaptureController {
  readonly mode: CaptureMode;
  pause(): void;
  resume(): void;
  inspect(): CaptureInspection;
}

function validatePoliciesForSession(
  policies: readonly CapturePolicy[],
  session: SessionRef,
): void {
  if (!Array.isArray(policies) || policies.length === 0) {
    throw new InvalidPolicyError("at least one CapturePolicy is required");
  }
  for (const policy of policies) {
    if (!isCapturePolicy(policy)) {
      throw new InvalidPolicyError("policies must be valid CapturePolicy values");
    }
    if (
      policy.environmentId !== null &&
      policy.environmentId !== session.environmentId
    ) {
      throw new InvalidPolicyError(
        `policy '${policy.policyId}' is scoped to environment '${policy.environmentId}' but the session runs in '${session.environmentId}'`,
      );
    }
  }
}

export class SessionRecorder implements CaptureController {
  private readonly session: SessionRef;
  private policies: readonly CapturePolicy[];
  private readonly records: JournalRecord[] = [];
  private readonly contributingPolicyDigests: string[] = [];
  private mode_: CaptureMode = "active";
  private sensitiveWindowOpen = false;
  private rejectedAttempts = 0;

  constructor(session: SessionRef, policies: readonly CapturePolicy[]) {
    validateSessionRef(session, "session");
    validatePoliciesForSession(policies, session);
    this.session = Object.freeze({
      sessionId: session.sessionId,
      environmentId: session.environmentId,
    });
    this.policies = [...policies];
  }

  /** Public read-only view of the capture mode (satisfies CaptureController). */
  get mode(): CaptureMode {
    return this.mode_;
  }

  get sessionLength(): number {
    return this.records.length;
  }

  pause(): void {
    if (this.mode_ === "active") {
      this.appendGap("capture-paused", null, null);
      this.mode_ = "paused";
    }
  }

  resume(): void {
    if (this.mode_ === "paused") {
      this.appendGap("capture-resumed", null, null);
      this.mode_ = "active";
    }
  }

  beginSensitiveWindow(note?: string | null): RedactionMarker {
    if (this.mode_ !== "active") {
      throw new InvalidRecordError(
        "cannot begin a sensitive window while capture is paused",
      );
    }
    if (this.sensitiveWindowOpen) {
      throw new InvalidRecordError("a sensitive window is already open");
    }
    this.sensitiveWindowOpen = true;
    return this.appendRedaction("sensitive-window", note ?? null);
  }

  endSensitiveWindow(): RedactionMarker {
    if (!this.sensitiveWindowOpen) {
      throw new InvalidRecordError("no sensitive window is open");
    }
    this.sensitiveWindowOpen = false;
    return this.appendRedaction("sensitive-window", null);
  }

  noteGap(
    reason: GapReason,
    estimatedMissed?: number | null,
    note?: string | null,
  ): GapMarker {
    if (!GAP_REASONS.includes(reason)) {
      throw new InvalidRecordError(
        `gap reason must be one of ${GAP_REASONS.join("|")}`,
      );
    }
    return this.appendGap(reason, estimatedMissed ?? null, note ?? null);
  }

  record(input: EventInput): RecordOutcome {
    if (input === null || typeof input !== "object") {
      throw new InvalidRecordError("record input must be an object");
    }
    if (this.mode_ === "paused") {
      this.rejectedAttempts += 1;
      return {
        status: "rejected",
        reason: "capture-paused",
        detail: "capture is paused; call resume() to continue",
      };
    }
    const decision = captureDecision(
      this.policies,
      input.kind,
      input.initiator,
    );
    if (!decision.recordable) {
      this.rejectedAttempts += 1;
      const reason: RejectionReason =
        decision.reason === "consent-not-granted"
          ? "consent-not-granted"
          : "out-of-scope";
      return {
        status: "rejected",
        reason,
        detail: `capture decision: ${decision.reason}`,
      };
    }
    if (input.sensitive === true || this.sensitiveWindowOpen) {
      // Sensitive window: record the FACT of redaction, never the content.
      const marker = this.appendRedaction("sensitive-window", null);
      return { status: "redacted", marker };
    }
    const event = makeEvent({
      session: this.session,
      sequence: this.records.length + 1,
      kind: input.kind,
      initiator: input.initiator,
      payload: input.payload as never,
      captureQuality: "observed",
      evidence: input.evidence,
      correlations: input.correlations,
    });
    this.records.push(event);
    const authorizer = decision.authorizingPolicy;
    if (authorizer !== null) {
      const digest = policyDigest(authorizer);
      if (!this.contributingPolicyDigests.includes(digest)) {
        this.contributingPolicyDigests.push(digest);
      }
    }
    return { status: "recorded", event };
  }

  inspect(): CaptureInspection {
    return deepFreeze({
      session: this.session,
      mode: this.mode_,
      sensitiveWindowOpen: this.sensitiveWindowOpen,
      loadedPolicyDigests: this.policies.map((policy) => policyDigest(policy)),
      contributingPolicyDigests: [...this.contributingPolicyDigests],
      counts: {
        events: this.records.filter(isEventRecord).length,
        redactionMarkers: this.records.filter(isRedactionMarker).length,
        gapMarkers: this.records.filter(isGapMarker).length,
        rejectedAttempts: this.rejectedAttempts,
      },
      coverage: summarizeCoverage(this.records),
      lastSequence:
        this.records.length === 0
          ? null
          : this.records[this.records.length - 1].sequence,
    });
  }

  snapshot(): SessionJournal {
    const journal: SessionJournal = {
      type: "session-journal",
      session: this.session,
      policyDigests: [...this.contributingPolicyDigests],
      records: [...this.records],
      coverage: summarizeCoverage(this.records),
    };
    return deepFreeze(journal);
  }

  setPolicies(policies: readonly CapturePolicy[]): void {
    validatePoliciesForSession(policies, this.session);
    this.policies = [...policies];
  }

  private appendGap(
    reason: GapReason,
    estimatedMissed: number | null,
    note: string | null,
  ): GapMarker {
    const marker = makeGapMarker({
      session: this.session,
      sequence: this.records.length + 1,
      reason,
      estimatedMissed,
      note,
    });
    this.records.push(marker);
    return marker;
  }

  private appendRedaction(
    reason: "sensitive-window" | "policy-exclusion" | "retroactive",
    note: string | null,
  ): RedactionMarker {
    const marker = makeRedactionMarker({
      session: this.session,
      sequence: this.records.length + 1,
      reason,
      note,
    });
    this.records.push(marker);
    return marker;
  }
}

export function createSessionRecorder(input: {
  readonly session: SessionRef;
  readonly policies: readonly CapturePolicy[];
}): SessionRecorder {
  return new SessionRecorder(input.session, input.policies);
}

export function journalDigest(journal: SessionJournal): string {
  return digestRecord(journal);
}
