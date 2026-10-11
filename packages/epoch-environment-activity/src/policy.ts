/**
 * Consent and privacy laws (W029 task 2).
 *
 * The contract types live in contract.ts; the policy-domain runtime
 * constant (consent states) is declared here and re-exported through
 * index.ts, so the public surface is unchanged. CapturePolicy is the
 * per-source scope/consent record: what is capturable, what is excluded,
 * and TWO SEPARATE permissions — retention (may captured activity be kept
 * at all) and reuse (may it be reused, and in which projects). RETENTION
 * AND REUSE ARE SEPARATE PERMISSIONS: neither is derivable from the other,
 * and both must be inspected independently.
 */

import {
  digestRecord,
  isNonEmptyString,
  isNullableString,
} from "./canonical.js";
import {
  type CaptureDecision,
  type CapturePolicy,
  type CaptureScope,
  type ConsentRecord,
  type ConsentState,
  type Initiator,
  type RetentionPermission,
  type ReusePermission,
  type ScopeDecision,
} from "./contract.js";
import { INITIATORS } from "./events.js";
import { deepFreeze } from "./freeze.js";
import { InvalidPolicyError } from "./errors.js";

export * from "./contract.js";

/** Allowed consent states. */
export const CONSENT_STATES: readonly ConsentState[] = [
  "granted",
  "withdrawn",
  "never-granted",
];

/** Input form of CaptureScope. */
export interface CaptureScopeInput {
  readonly includedEventKinds: readonly string[];
  readonly excludedEventKinds?: readonly string[];
  readonly includedInitiators: readonly Initiator[];
}

/** Input form of ConsentRecord. */
export interface ConsentRecordInput {
  readonly consentId: string;
  readonly subject: string;
  readonly state: ConsentState;
  readonly externalRef?: string | null;
  readonly note?: string | null;
}

/** Input form of RetentionPermission. */
export interface RetentionPermissionInput {
  readonly allowed: boolean;
  readonly note?: string | null;
}

/** Input form of ReusePermission. */
export interface ReusePermissionInput {
  readonly allowed: boolean;
  readonly projects?: readonly string[];
  readonly note?: string | null;
}

/** Input form of CapturePolicy. */
export interface CapturePolicyInput {
  readonly policyId: string;
  readonly subject: string;
  readonly environmentId?: string | null;
  readonly scope: CaptureScopeInput;
  readonly consent: ConsentRecordInput;
  readonly retention: RetentionPermissionInput;
  readonly reuse: ReusePermissionInput;
}

function validateScope(scope: CaptureScope): void {
  if (scope === null || typeof scope !== "object") {
    throw new InvalidPolicyError("scope must be an object");
  }
  if (!Array.isArray(scope.includedEventKinds) ||
      scope.includedEventKinds.length === 0) {
    throw new InvalidPolicyError(
      "scope.includedEventKinds must be a non-empty array",
    );
  }
  for (const kind of scope.includedEventKinds) {
    if (!isNonEmptyString(kind)) {
      throw new InvalidPolicyError(
        "scope.includedEventKinds entries must be non-empty strings",
      );
    }
  }
  if (!Array.isArray(scope.excludedEventKinds)) {
    throw new InvalidPolicyError("scope.excludedEventKinds must be an array");
  }
  for (const kind of scope.excludedEventKinds) {
    if (!isNonEmptyString(kind)) {
      throw new InvalidPolicyError(
        "scope.excludedEventKinds entries must be non-empty strings",
      );
    }
  }
  if (!Array.isArray(scope.includedInitiators) ||
      scope.includedInitiators.length === 0) {
    throw new InvalidPolicyError(
      "scope.includedInitiators must be a non-empty array",
    );
  }
  for (const initiator of scope.includedInitiators) {
    if (!INITIATORS.includes(initiator)) {
      throw new InvalidPolicyError(
        `scope.includedInitiators entries must be one of ${INITIATORS.join("|")}`,
      );
    }
  }
}

function validateConsent(consent: ConsentRecord, subject: string): void {
  if (consent === null || typeof consent !== "object") {
    throw new InvalidPolicyError("consent must be an object");
  }
  if (!isNonEmptyString(consent.consentId)) {
    throw new InvalidPolicyError("consent.consentId must be a non-empty string");
  }
  if (!isNonEmptyString(consent.subject)) {
    throw new InvalidPolicyError("consent.subject must be a non-empty string");
  }
  if (consent.subject !== subject) {
    throw new InvalidPolicyError(
      "consent.subject must match the policy subject (a policy's consent belongs to its subject)",
    );
  }
  if (!CONSENT_STATES.includes(consent.state)) {
    throw new InvalidPolicyError(
      `consent.state must be one of ${CONSENT_STATES.join("|")}`,
    );
  }
  if (!isNullableString(consent.externalRef) || !isNullableString(consent.note)) {
    throw new InvalidPolicyError(
      "consent.externalRef/note must be null or strings",
    );
  }
}

export function validateCapturePolicy(policy: CapturePolicy): void {
  if (policy === null || typeof policy !== "object") {
    throw new InvalidPolicyError("policy must be an object");
  }
  if (policy.type !== "capture-policy") {
    throw new InvalidPolicyError('policy.type must be "capture-policy"');
  }
  if (!isNonEmptyString(policy.policyId)) {
    throw new InvalidPolicyError("policy.policyId must be a non-empty string");
  }
  if (!isNonEmptyString(policy.subject)) {
    throw new InvalidPolicyError("policy.subject must be a non-empty string");
  }
  if (policy.environmentId !== null && !isNonEmptyString(policy.environmentId)) {
    throw new InvalidPolicyError(
      "policy.environmentId must be null or a non-empty string",
    );
  }
  validateScope(policy.scope);
  validateConsent(policy.consent, policy.subject);
  if (typeof policy.retention !== "object" || policy.retention === null) {
    throw new InvalidPolicyError("policy.retention must be an object");
  }
  if (typeof policy.retention.allowed !== "boolean") {
    throw new InvalidPolicyError("policy.retention.allowed must be a boolean");
  }
  if (!isNullableString(policy.retention.note)) {
    throw new InvalidPolicyError("policy.retention.note must be null or a string");
  }
  if (typeof policy.reuse !== "object" || policy.reuse === null) {
    throw new InvalidPolicyError("policy.reuse must be an object");
  }
  if (typeof policy.reuse.allowed !== "boolean") {
    throw new InvalidPolicyError("policy.reuse.allowed must be a boolean");
  }
  if (!Array.isArray(policy.reuse.projects)) {
    throw new InvalidPolicyError("policy.reuse.projects must be an array");
  }
  for (const project of policy.reuse.projects) {
    if (!isNonEmptyString(project)) {
      throw new InvalidPolicyError(
        "policy.reuse.projects entries must be non-empty strings",
      );
    }
  }
  if (!isNullableString(policy.reuse.note)) {
    throw new InvalidPolicyError("policy.reuse.note must be null or a string");
  }
}

export function isCapturePolicy(value: unknown): value is CapturePolicy {
  try {
    validateCapturePolicy(value as CapturePolicy);
    return true;
  } catch {
    return false;
  }
}

export function makeCapturePolicy(input: CapturePolicyInput): CapturePolicy {
  if (input === null || typeof input !== "object") {
    throw new InvalidPolicyError("input must be an object");
  }
  const policy: CapturePolicy = {
    type: "capture-policy",
    policyId: input.policyId,
    subject: input.subject,
    environmentId: input.environmentId ?? null,
    scope: {
      includedEventKinds: [...(input.scope?.includedEventKinds ?? [])],
      excludedEventKinds: [...(input.scope?.excludedEventKinds ?? [])],
      includedInitiators: [...(input.scope?.includedInitiators ?? [])],
    },
    consent: {
      consentId: input.consent?.consentId,
      subject: input.consent?.subject,
      state: input.consent?.state,
      externalRef: input.consent?.externalRef ?? null,
      note: input.consent?.note ?? null,
    },
    retention: {
      allowed: input.retention?.allowed,
      note: input.retention?.note ?? null,
    },
    reuse: {
      allowed: input.reuse?.allowed,
      projects: [...(input.reuse?.projects ?? [])],
      note: input.reuse?.note ?? null,
    },
  };
  validateCapturePolicy(policy);
  return deepFreeze(policy);
}

export function policyDigest(policy: CapturePolicy): string {
  return digestRecord(policy);
}

export function consentGranted(policy: CapturePolicy): boolean {
  return policy.consent.state === "granted";
}

export function retentionAllowed(policy: CapturePolicy): boolean {
  return policy.retention.allowed;
}

/**
 * Cross-project reuse permission. Same-project use is always permitted
 * (reuse permission governs CROSS-project reuse); cross-project reuse
 * requires an explicit reuse grant covering the target project.
 * This reads ONLY the reuse permission — never retention (separate laws).
 */
export function crossProjectReuseAllowed(
  policy: CapturePolicy,
  originProject: string,
  targetProject: string,
): boolean {
  if (targetProject === originProject) {
    return true;
  }
  return (
    policy.reuse.allowed &&
    (policy.reuse.projects.includes(targetProject) ||
      policy.reuse.projects.includes("*"))
  );
}

export function scopeDecision(
  scope: CaptureScope,
  kind: string,
  initiator: Initiator,
): ScopeDecision {
  if (!scope.includedInitiators.includes(initiator)) {
    return { capturable: false, reason: "initiator-not-included" };
  }
  if (scope.excludedEventKinds.includes(kind)) {
    return { capturable: false, reason: "excluded-kind" };
  }
  if (
    !scope.includedEventKinds.includes("*") &&
    !scope.includedEventKinds.includes(kind)
  ) {
    return { capturable: false, reason: "kind-not-included" };
  }
  return { capturable: true, reason: "in-scope" };
}

/**
 * Combined consent + scope decision across a policy set. An event is
 * recordable when at least one applicable policy has granted consent AND
 * the event kind is in that policy's scope.
 */
export function captureDecision(
  policies: readonly CapturePolicy[],
  kind: string,
  initiator: Initiator,
): CaptureDecision {
  let applicable = false;
  let grantedApplicable = false;
  let excluded = false;
  for (const policy of policies) {
    const scope = scopeDecision(policy.scope, kind, initiator);
    if (scope.reason === "initiator-not-included") {
      continue;
    }
    applicable = true;
    if (!consentGranted(policy)) {
      continue;
    }
    grantedApplicable = true;
    if (scope.reason === "excluded-kind") {
      excluded = true;
      continue;
    }
    if (scope.reason === "kind-not-included") {
      continue;
    }
    return { recordable: true, reason: "granted-in-scope", authorizingPolicy: policy };
  }
  if (!applicable) {
    return { recordable: false, reason: "no-applicable-policy", authorizingPolicy: null };
  }
  if (!grantedApplicable) {
    return { recordable: false, reason: "consent-not-granted", authorizingPolicy: null };
  }
  return excluded
    ? { recordable: false, reason: "excluded-kind", authorizingPolicy: null }
    : { recordable: false, reason: "kind-not-included", authorizingPolicy: null };
}
