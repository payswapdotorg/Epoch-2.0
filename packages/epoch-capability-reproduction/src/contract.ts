// Public contract home for @zcode/epoch-capability-reproduction (W031).
// The reproduction factory is a governed pipeline of typed data and
// deterministic machines: it plans and records reproduction work; it never
// builds, deploys, or executes anything. Cross-package evidence binds by
// digest ref (sha256 via node:crypto); no external semantics are re-declared.

// -- shared primitives ------------------------------------------------------
export type DigestHex = string;

/** Content-addressed reference to an artifact whose authority is elsewhere. */
export interface DigestRef {
  readonly algorithm: "sha256";
  readonly digest: DigestHex;
}

/** Deterministic machine result: a value, or a refusal with reason codes. */
export type Result<T, C extends string = string> =
  | { ok: true; value: T }
  | { ok: false; reason: string; codes: readonly C[] };

// -- 1. intake ---------------------------------------------------------------
export type CapabilityGap = "missing" | "inadequate";

/** Bounded scope: non-empty inclusions, explicit exclusions, no wildcards. */
export interface ScopeDeclaration {
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
}

export interface ReproductionRequest {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly gap: CapabilityGap;
  readonly gapEvidenceRefs: readonly DigestRef[];
  readonly scope: ScopeDeclaration;
  readonly requester: string;
  readonly rationale: string;
}

export interface IntakeVerdict {
  readonly outcome: "accept" | "reject";
  readonly codes: readonly string[];
  readonly requestRef: DigestRef;
}

// -- 2. alternatives analysis (data) ----------------------------------------
export type AlternativeKind =
  | "native-commercial"
  | "open-source"
  | "standards-based";

export type LicenseClassification =
  | "permissive"
  | "copyleft"
  | "proprietary"
  | "unlicensed"
  | "unknown";

export type RightsStatus = "cleared" | "negotiation-required" | "absent";

export interface ProvenanceDeclaration {
  readonly origin: string;
  readonly sourceRef: DigestRef | null;
  readonly declaredLicenses: readonly string[];
}

export interface AlternativeRecord {
  readonly optionId: string;
  readonly kind: AlternativeKind;
  readonly name: string;
  readonly license: LicenseClassification;
  readonly rightsStatus: RightsStatus;
  readonly provenance: ProvenanceDeclaration;
}

export interface AlternativesAnalysis {
  readonly requestId: string;
  readonly alternatives: readonly AlternativeRecord[];
  readonly decisionRationale: string;
}

// -- 3. rights / provenance gate --------------------------------------------
export type RightsSubjectKind = "source" | "asset" | "dataset" | "branding";

export type RightsGateState = "cleared" | "negotiation-required" | "blocked";

export interface RightsCheckInput {
  readonly subject: string;
  readonly subjectKind: RightsSubjectKind;
  readonly requiredRights: readonly string[];
  readonly heldRights: readonly string[];
  readonly licenseRef: DigestRef | null;
  readonly remediationPlanRef: DigestRef | null;
}

export interface RightsCheckResult {
  readonly input: RightsCheckInput;
  readonly missingRights: readonly string[];
  readonly status: RightsGateState;
}

export interface ProtectedSourceRequest {
  readonly subject: string;
  readonly purpose: "inspection" | "decompilation";
  readonly authorizationRefs: readonly DigestRef[];
  readonly reviewRefs: readonly DigestRef[];
}

export interface ProtectedSourceAccess {
  readonly subject: string;
  readonly access: "inaccessible" | "authorized";
  readonly authorizationRef: DigestRef | null;
  readonly reviewRef: DigestRef | null;
}

export interface RightsGate {
  readonly requestId: string;
  readonly checks: readonly RightsCheckInput[];
  readonly protectedSources: readonly ProtectedSourceRequest[];
}

export interface RightsGateResult {
  readonly state: RightsGateState;
  readonly checks: readonly RightsCheckResult[];
  readonly protectedAccess: readonly ProtectedSourceAccess[];
  readonly blockedSubjects: readonly string[];
  readonly gateRef: DigestRef;
}

// -- 4. reference behavior contract (W029 demonstrations) -------------------
export interface BehaviorCaseCapture {
  readonly caseId: string;
  readonly demonstrationRef: DigestRef;
  readonly expectation: string;
  readonly approvers: readonly string[];
  readonly approvalRef: DigestRef;
}

export interface BehaviorCaseSet {
  readonly capabilityId: string;
  readonly cases: readonly BehaviorCaseCapture[];
  readonly setRef: DigestRef;
}

export interface ReferenceBehaviorContract {
  readonly contractId: string;
  readonly capabilityId: string;
  readonly caseSet: BehaviorCaseSet;
  readonly contractRef: DigestRef;
}

// -- 5. foundation selection --------------------------------------------------
export interface DependencyInventoryEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly classification: LicenseClassification;
  readonly origin: string;
}

export interface FoundationOption {
  readonly foundationId: string;
  readonly dependencies: readonly DependencyInventoryEntry[];
}

export interface FoundationChoice {
  readonly selected: FoundationOption;
  readonly policy: "fewest-restrictive-then-smallest-then-stable-id";
  readonly choiceRef: DigestRef;
}

// -- 6. build & benchmark plans (planning records, never execution) ---------
export interface BuildPlan {
  readonly planId: string;
  readonly foundationRef: DigestRef;
  readonly workItems: readonly string[];
  readonly plannedOutputs: readonly string[];
  readonly planRef: DigestRef;
}

export interface BenchmarkPlan {
  readonly descriptorRef: DigestRef;
  readonly caseSetRef: DigestRef;
  readonly candidateRef: DigestRef;
  readonly planRef: DigestRef;
}

// -- 7. workbench surface binding (W028), never an MCP wrapper --------------
export interface SurfaceRegistration {
  readonly surfaceAuthority: "@zcode/epoch-application-environment";
  readonly environmentContractRef: DigestRef;
  readonly surfaceId: string;
  readonly entrypoint: string;
  readonly requestedCapabilities: readonly string[];
}

export interface MiniAppDescriptor {
  readonly appId: string;
  readonly displayName: string;
  readonly version: string;
  readonly capabilityId: string;
  readonly integrationMode: "epoch-workbench-surface";
  readonly surface: SurfaceRegistration;
  readonly foundationRef: DigestRef;
  readonly behaviorContractRef: DigestRef;
}

// -- 8. lifecycle (deterministic phase machine) ------------------------------
export type ReproductionPhase =
  | "intake"
  | "alternatives"
  | "rights-gate"
  | "reference-capture"
  | "foundation"
  | "build"
  | "benchmark"
  | "released"
  | "rolled-back"
  | "rejected";

export type LifecycleTransitionKind =
  | "intake-accepted"
  | "intake-rejected"
  | "alternatives-recorded"
  | "rights-cleared"
  | "reference-captured"
  | "foundation-selected"
  | "build-planned"
  | "release"
  | "rollback";

export type ReleaseGateName =
  | "rights"
  | "quality"
  | "security"
  | "safety"
  | "license"
  | "provenance";

export type GateStatus = "green" | "red" | "blocked";

export interface ReleaseGateRecord {
  readonly gate: ReleaseGateName;
  readonly status: GateStatus;
  readonly evidence: readonly DigestRef[];
}

export interface ReleaseLimits {
  readonly allowedSurfaces: readonly string[];
  readonly dataAccess: readonly string[];
  readonly expiryCondition: string;
}

export interface ReleasePackage {
  readonly version: string;
  readonly limits: ReleaseLimits;
  readonly descriptor: MiniAppDescriptor;
}

export interface ReleaseRecord {
  readonly version: string;
  readonly limits: ReleaseLimits;
  readonly descriptorRef: DigestRef;
  readonly gateRefs: readonly DigestRef[];
  readonly releaseKey: DigestHex;
}

export interface RollbackRecord {
  readonly fromPhase: ReproductionPhase;
  readonly fromVersion: string | null;
  readonly preservedLimits: ReleaseLimits | null;
  readonly reason: string;
  readonly rollbackKey: DigestHex;
}

export interface TransitionRecord {
  readonly kind: LifecycleTransitionKind;
  readonly from: ReproductionPhase;
  readonly to: ReproductionPhase;
  readonly evidence: readonly DigestRef[];
  readonly transitionKey: DigestHex;
}

export interface ReproductionLifecycle {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly requestRef: DigestRef;
  readonly phase: ReproductionPhase;
  readonly history: readonly TransitionRecord[];
  readonly release: ReleaseRecord | null;
  readonly rollback: RollbackRecord | null;
}
