/**
 * W024 — Agent Tools: the append-only, digest-keyed command audit record and
 * its canonical serialization. Records persist THROUGH the W021 WorldStore
 * port (see `ports.ts`); this package never re-implements storage.
 */
import { isAgentCommandKind, type AgentCommandKind } from "./kinds.js";
import type { AgentDeniedReason } from "./authorization.js";
import { canonicalJson } from "./hash.js";

/**
 * Outcome of an audited command. Executed commands are `'succeeded'`;
 * authorization denials are `'denied'`. Port-level failures are surfaced as
 * typed `AgentPortError`s and are deliberately NOT persisted (an append-only,
 * digest-keyed log fixes the outcome per digest — see README).
 */
export type AgentCommandOutcome = "succeeded" | "denied";

export interface AgentCommandAuditRecord {
  /** sha256 hex of the canonical JSON serialization of the command. */
  readonly digest: string;
  readonly kind: AgentCommandKind;
  readonly sessionId: string;
  readonly agentId: string;
  /** Canonical JSON serialization of the dispatched command. */
  readonly command: string;
  readonly outcome: AgentCommandOutcome;
  readonly errorCode?: string;
  readonly deniedReason?: AgentDeniedReason;
  /** Canonical JSON serialization of the value payload (succeeded records only). */
  readonly result?: string;
}

export function serializeAuditRecord(record: AgentCommandAuditRecord): string {
  return canonicalJson(record);
}

/** One canonical JSON line per record, in log order — byte-identical for identical command sequences. */
export function serializeAuditLog(
  records: readonly AgentCommandAuditRecord[],
): string {
  return records.map((record) => serializeAuditRecord(record)).join("\n");
}

export function isAgentCommandAuditRecord(
  value: unknown,
): value is AgentCommandAuditRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["digest"] === "string" &&
    isAgentCommandKind(record["kind"]) &&
    typeof record["sessionId"] === "string" &&
    typeof record["agentId"] === "string" &&
    typeof record["command"] === "string" &&
    (record["outcome"] === "succeeded" || record["outcome"] === "denied") &&
    (record["errorCode"] === undefined ||
      typeof record["errorCode"] === "string") &&
    (record["deniedReason"] === undefined ||
      typeof record["deniedReason"] === "string") &&
    (record["result"] === undefined || typeof record["result"] === "string")
  );
}
