/**
 * Public contract of @zcode/epoch-agent-presence.
 *
 * PUBLIC_CONTRACT enumerates every public name of the package (runtime and
 * type). The barrel (src/index.ts) exports exactly the runtime names, and
 * test/contract.test.ts asserts that with assertPublicContract.
 */

export const CONTRACT_NAME = "epoch-agent-presence";
export const CONTRACT_REVISION = 1;

/** A typed package law. */
export interface ContractLaw {
  readonly id: string;
  readonly statement: string;
}

const law = (id: string, statement: string): ContractLaw => ({ id, statement });

export const CONTRACT_LAWS: readonly ContractLaw[] = [
  law(
    "derived-visual-state",
    "Agent visual state is derived; presence records never become a second task or activity authority.",
  ),
  law(
    "digest-only-cross-refs",
    "Sibling semantics (agent tools, environment activity, world model) are referenced by typed digest refs only.",
  ),
  law(
    "deterministic-machines",
    "Projection, transition, summary, and view machines are pure deterministic functions of their inputs.",
  ),
  law(
    "timestamps-are-inputs",
    "Recorded and computed timestamps are caller-supplied; no clock is ever read.",
  ),
  law(
    "typed-rejections",
    "Illegal transitions and fleet conflicts return discriminated rejection unions; domain states never throw.",
  ),
  law(
    "validation-throws",
    "Malformed structural input to builders and machines throws TypeError before any record is returned.",
  ),
  law("no-execution-authority", "No process spawning, no filesystem writes, no network access."),
  law(
    "view-is-read-model",
    "PresenceView is provider-neutral typed data; no rendering or UI code ships here.",
  ),
  law(
    "one-presence-per-agent",
    "A fleet holds at most one presence per agent record digest; duplicates rejected.",
  ),
  law(
    "identity-by-digest",
    "Agent identity is the agent-tools record digest; presenceKey identifies the projection.",
  ),
];

/** Kind of a public contract entry. */
export type PublicContractEntryKind = "constant" | "function" | "type";

/** A public contract entry. */
export interface PublicContractEntry {
  readonly name: string;
  readonly kind: PublicContractEntryKind;
  readonly summary: string;
}

const entry = (
  name: string,
  kind: PublicContractEntryKind,
  summary: string,
): PublicContractEntry => ({
  name,
  kind,
  summary,
});

export const PUBLIC_CONTRACT: readonly PublicContractEntry[] = [
  // canonical
  entry(
    "canonicalJson",
    "function",
    "Canonical JSON encoding: recursively key-sorted, no whitespace.",
  ),
  entry(
    "canonicalSha256",
    "function",
    "Lowercase SHA-256 hex digest of the canonical JSON encoding.",
  ),
  entry("sha256Hex", "function", "Lowercase SHA-256 hex digest of a UTF-8 string."),
  entry("CanonicalJsonValue", "type", "JSON value shapes accepted by canonicalJson."),
  // contract
  entry("CONTRACT_NAME", "constant", "Contract name: epoch-agent-presence."),
  entry("CONTRACT_REVISION", "constant", "Contract revision number."),
  entry("CONTRACT_LAWS", "constant", "Typed package laws (id + statement)."),
  entry("PUBLIC_CONTRACT", "constant", "Public contract entries (name/kind/summary)."),
  entry("publicContractNames", "function", "Sorted names of all public contract entries."),
  entry("runtimeContractNames", "function", "Sorted names of runtime (non-type) contract entries."),
  entry(
    "assertPublicContract",
    "function",
    "Assert a runtime export-name list matches the contract exactly.",
  ),
  entry("ContractLaw", "type", "Typed law record (id + statement)."),
  entry("PublicContractEntry", "type", "Public contract entry (name/kind/summary)."),
  entry("PublicContractEntryKind", "type", "Entry kind: constant | function | type."),
  // validate
  entry("isHex64", "function", "Guard: 64-char lowercase hex digest string."),
  entry("isKebabId", "function", "Guard: kebab-case identifier string."),
  entry("isNonEmptyString", "function", "Guard: non-empty string."),
  entry("isNonNegativeInteger", "function", "Guard: non-negative integer number."),
  // limitations
  entry("LIMITATIONS_REPORT", "constant", "Honest limitations report (typed records)."),
  entry("LimitationRecord", "type", "Limitation record (id/area/statement)."),
  entry("LimitationArea", "type", "Limitation area vocabulary."),
  // module
  entry("MODULE_NAME", "constant", "Module name string."),
  entry("MODULE_ARTIFACTS", "constant", "Manifest of src artifacts (path/role/summary)."),
  entry("MODULE_MANIFEST_DIGEST", "constant", "Canonical SHA-256 digest over the module manifest."),
  entry("ModuleArtifact", "type", "Manifest artifact record (path/role/summary)."),
  entry("ModuleArtifactRole", "type", "Artifact role vocabulary."),
  // types — brands
  entry("Branded", "type", "Compile-time brand helper."),
  entry("Hex64", "type", "64-char lowercase hex digest string (branded)."),
  entry("AgentRecordDigest", "type", "Digest of an agent-tools agent record (branded)."),
  entry("TaskRecordDigest", "type", "Digest of an agent-tools task record (branded)."),
  entry("ActivityRecordDigest", "type", "Digest of an environment-activity record (branded)."),
  entry("WorldModelEntityDigest", "type", "Digest of a world-model entity record (branded)."),
  entry("NonEmptyString", "type", "Non-empty string (branded)."),
  entry("KebabId", "type", "Kebab-case identifier (branded)."),
  entry("EpochMillis", "type", "Non-negative integer epoch milliseconds (branded)."),
  entry("NonNegativeInteger", "type", "Non-negative integer (branded)."),
  // types — geometry
  entry("WorldPosition", "type", "World position snapshot (finite x/y/z)."),
  entry("Orientation", "type", "Yaw heading normalized to [0, 2*pi) radians."),
  // types — work
  entry("WorkStatus", "type", "Work status: idle | active | blocked."),
  entry("TaskRecordRef", "type", "Agent-tools task record reference (kind + digest)."),
  entry("ActivityRecordRef", "type", "Environment-activity record reference (kind + digest)."),
  entry("SemanticRecordRef", "type", "Task or activity record reference."),
  entry("WorkDescriptor", "type", "Derived work descriptor (status/label/source)."),
  // types — presence
  entry("AgentPresenceIdentity", "type", "Agent identity by digest + local projection key."),
  entry("EntityBinding", "type", "Entity binding: none or a world-model entity digest."),
  entry("FollowTarget", "type", "Follow target: camera or entity digest."),
  entry("FollowState", "type", "Follow state: none, camera, or entity digest."),
  entry("PresenceDerivation", "type", "Projection lineage: consumed semantic records + time."),
  entry("AgentPresence", "type", "Per-agent derived visual presence record."),
  entry("PresenceProjectionInput", "type", "Input for projectPresence."),
  // types — transition
  entry("MoveTransition", "type", "Move transition (to + optional orientation)."),
  entry("BindTransition", "type", "Bind transition (world-model entity digest)."),
  entry("FollowTransition", "type", "Follow transition (camera or entity target)."),
  entry("IdleTransition", "type", "Idle transition (release follow/binding)."),
  entry("PresenceTransition", "type", "Union of presence transitions."),
  entry("PresenceTransitionRejection", "type", "Typed illegal-transition rejections."),
  entry("PresenceTransitionOk", "type", "Successful transition result."),
  entry("PresenceTransitionRejected", "type", "Rejected transition result."),
  entry("PresenceTransitionResult", "type", "Transition result union (ok | rejected)."),
  // types — view
  entry("PresenceBadge", "type", "Badge: following | bound | working | blocked | idle."),
  entry(
    "PositionPolicy",
    "type",
    "Position policy: explicit | derived-from-follow | derived-from-binding.",
  ),
  entry("PresenceView", "type", "Provider-neutral presence read-model for UIs."),
  // types — summary
  entry("AgentSummaryEntry", "type", "Per-agent fleet summary entry."),
  entry("FollowCounts", "type", "Follow state counts."),
  entry("BindingCounts", "type", "Binding state counts."),
  entry("PresenceFleetSummary", "type", "Deterministic fleet summary record."),
  entry("FleetSummaryRejection", "type", "Typed fleet summary rejections."),
  entry("FleetSummaryOk", "type", "Successful fleet summary result."),
  entry("FleetSummaryRejected", "type", "Rejected fleet summary result."),
  entry("FleetSummaryResult", "type", "Fleet summary result union (ok | rejected)."),
  // machines — value builders
  entry("buildAgentPresenceIdentity", "function", "Build validated agent presence identity."),
  entry("buildWorldPosition", "function", "Build validated world position (finite x/y/z)."),
  entry("buildOrientation", "function", "Build orientation; yaw normalized to [0, 2*pi)."),
  entry("buildTaskRecordRef", "function", "Build a task-record digest reference."),
  entry("buildActivityRecordRef", "function", "Build an activity-record digest reference."),
  entry("buildWorkDescriptor", "function", "Build validated derived work descriptor."),
  entry("buildNoneBinding", "function", "Build the unbound entity-binding state."),
  entry("buildEntityBinding", "function", "Build an entity binding (world-model entity digest)."),
  entry("buildFollowNone", "function", "Build the not-following state."),
  entry("buildCameraFollowTarget", "function", "Build the camera follow target."),
  entry("buildEntityFollowTarget", "function", "Build an entity follow target (entity digest)."),
  // machines — projection / transition / summary / view
  entry(
    "projectPresence",
    "function",
    "Project an AgentPresence from digest refs + placement input.",
  ),
  entry(
    "applyPresenceTransition",
    "function",
    "Apply a typed transition; typed rejections for illegal ones.",
  ),
  entry("buildMoveTransition", "function", "Build a move transition."),
  entry("buildBindTransition", "function", "Build a bind transition (entity digest)."),
  entry("buildFollowTransition", "function", "Build a follow transition (target)."),
  entry("buildIdleTransition", "function", "Build an idle (release) transition."),
  entry(
    "summarizePresence",
    "function",
    "Deterministic fleet summary with typed duplicate rejections.",
  ),
  entry("buildPresenceView", "function", "Derive the provider-neutral PresenceView read-model."),
  entry("buildPresenceViews", "function", "Derive presence views sorted by presence key."),
];

/** Sorted names of all public contract entries. */
export function publicContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.map((contractEntry) => contractEntry.name).sort();
}

/** Sorted names of runtime (non-type) contract entries. */
export function runtimeContractNames(): readonly string[] {
  return PUBLIC_CONTRACT.filter((contractEntry) => contractEntry.kind !== "type")
    .map((contractEntry) => contractEntry.name)
    .sort();
}

/**
 * Assert that a list of runtime export names (for example Object.keys of the
 * barrel namespace) matches the runtime side of PUBLIC_CONTRACT exactly: no
 * missing names, no unexpected names, no duplicates.
 */
export function assertPublicContract(actualRuntimeNames: readonly string[]): void {
  const expected = runtimeContractNames();
  const actual = [...actualRuntimeNames].sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  const matches =
    expected.length === actual.length && expected.every((name, index) => name === actual[index]);
  if (!matches) {
    throw new TypeError(
      `assertPublicContract: runtime exports do not match PUBLIC_CONTRACT ` +
        `(missing: [${missing.join(", ")}]; unexpected: [${unexpected.join(", ")}])`,
    );
  }
}
