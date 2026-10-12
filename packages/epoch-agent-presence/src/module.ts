import { canonicalSha256 } from "./canonical.js";

/** Module name (matches the package name). */
export const MODULE_NAME = "epoch-agent-presence";

/** Artifact roles in the module manifest. */
export type ModuleArtifactRole =
  | "canonical"
  | "contract"
  | "validate"
  | "types"
  | "machine"
  | "manifest"
  | "barrel";

/**
 * A manifest entry for one src file. Declared as a type alias (not an
 * interface) so the manifest is structurally canonicalizable.
 */
export type ModuleArtifact = {
  readonly path: string;
  readonly role: ModuleArtifactRole;
  readonly summary: string;
};

const artifact = (path: string, role: ModuleArtifactRole, summary: string): ModuleArtifact => ({
  path,
  role,
  summary,
});

/** Manifest of every src file in this package. */
export const MODULE_ARTIFACTS: readonly ModuleArtifact[] = [
  artifact("src/canonical.ts", "canonical", "Canonical JSON encoding and SHA-256 digest helpers."),
  artifact(
    "src/contract.ts",
    "contract",
    "Public contract: name, revision, typed laws, entries, assertions.",
  ),
  artifact("src/limitations.ts", "contract", "Honest limitations report (typed records)."),
  artifact(
    "src/validate.ts",
    "validate",
    "Shared primitive validators (kebab ids, hex64 digests, numbers).",
  ),
  artifact(
    "src/types/brands.ts",
    "types",
    "Compile-time branded primitives and digest reference types.",
  ),
  artifact("src/types/geometry.ts", "types", "World position and yaw orientation snapshots."),
  artifact(
    "src/types/work.ts",
    "types",
    "Work status, semantic record refs, derived work descriptor.",
  ),
  artifact(
    "src/types/presence.ts",
    "types",
    "Presence records, identity, binding, follow, derivation.",
  ),
  artifact("src/types/transition.ts", "types", "Typed presence transitions and rejection unions."),
  artifact("src/types/view.ts", "types", "Provider-neutral PresenceView read-model types."),
  artifact("src/types/summary.ts", "types", "Fleet summary records and rejection unions."),
  artifact("src/build/values.ts", "machine", "Validated value builders for presence inputs."),
  artifact("src/build/guards.ts", "machine", "Deep runtime guards for records and transitions."),
  artifact(
    "src/build/presence.ts",
    "machine",
    "projectPresence: derive a presence from digests + placement.",
  ),
  artifact(
    "src/build/transition.ts",
    "machine",
    "applyPresenceTransition and transition builders.",
  ),
  artifact("src/build/summary.ts", "machine", "summarizePresence: deterministic fleet summary."),
  artifact("src/build/view.ts", "machine", "buildPresenceView(s): read-model derivation."),
  artifact("src/module.ts", "manifest", "Module name, artifact manifest, manifest digest."),
  artifact(
    "src/index.ts",
    "barrel",
    "Public barrel exporting exactly the contract's runtime names.",
  ),
];

/** Canonical SHA-256 digest over the module manifest. */
export const MODULE_MANIFEST_DIGEST: string = canonicalSha256(MODULE_ARTIFACTS);
