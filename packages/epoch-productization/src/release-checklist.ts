import { digestCanonical } from "./canonical.js";

/**
 * Release checklist — the release gate battery as pure data.
 *
 * LAW: the commands below are DATA. This package never spawns a process,
 * never installs, never lints, never tests. The release executor
 * (station/CI) owns execution and exit-code interpretation.
 */

export type ReleaseGateId =
  | "workspace-freshness"
  | "frozen-install"
  | "typecheck"
  | "tests"
  | "lint"
  | "format"
  | "architecture";

export interface ReleaseCommandEnv {
  readonly key: string;
  readonly value: string;
}

export interface ReleaseCommand {
  readonly argv: readonly string[];
  readonly env: readonly ReleaseCommandEnv[];
}

export type ReleaseFailurePolicy = "block-release";

export interface ReleaseGate {
  readonly id: ReleaseGateId;
  readonly ordering: number;
  readonly label: string;
  readonly purpose: string;
  readonly command: ReleaseCommand;
  readonly failurePolicy: ReleaseFailurePolicy;
}

export interface ReleaseChecklist {
  readonly kind: "release-checklist";
  readonly gates: readonly ReleaseGate[];
}

export function defineReleaseCommand(
  argv: readonly string[],
  env: readonly ReleaseCommandEnv[] = [],
): ReleaseCommand {
  return Object.freeze({
    argv: Object.freeze([...argv]),
    env: Object.freeze(env.map((entry) => Object.freeze({ ...entry }))),
  });
}

const GATES: readonly ReleaseGate[] = [
  {
    id: "workspace-freshness",
    ordering: 1,
    label: "Workspace freshness",
    purpose: "The git workspace must be clean before release work begins.",
    command: defineReleaseCommand(["node", "scripts/check-workspace-freshness.mjs"]),
    failurePolicy: "block-release",
  },
  {
    id: "frozen-install",
    ordering: 2,
    label: "Frozen lockfile install",
    purpose: "Dependencies must install exactly from the committed lockfile.",
    command: defineReleaseCommand(
      ["pnpm", "install", "--frozen-lockfile"],
      [{ key: "ELECTRON_SKIP_BINARY_DOWNLOAD", value: "1" }],
    ),
    failurePolicy: "block-release",
  },
  {
    id: "typecheck",
    ordering: 3,
    label: "Typecheck (every package)",
    purpose: "Every package that declares a typecheck script compiles clean.",
    command: defineReleaseCommand(["pnpm", "-r", "typecheck"]),
    failurePolicy: "block-release",
  },
  {
    id: "tests",
    ordering: 4,
    label: "Tests (every package)",
    purpose: "Every package that declares a test script passes its battery.",
    command: defineReleaseCommand(["pnpm", "-r", "test"]),
    failurePolicy: "block-release",
  },
  {
    id: "lint",
    ordering: 5,
    label: "Lint",
    purpose: "Repo lint is clean.",
    command: defineReleaseCommand(["pnpm", "lint"]),
    failurePolicy: "block-release",
  },
  {
    id: "format",
    ordering: 6,
    label: "Format check",
    purpose: "Repo formatting is canonical.",
    command: defineReleaseCommand(["pnpm", "fmt:check"]),
    failurePolicy: "block-release",
  },
  {
    id: "architecture",
    ordering: 7,
    label: "Architecture check",
    purpose:
      "Architecture policy holds for the full tree (pass --changed for incremental runs).",
    command: defineReleaseCommand(["pnpm", "architecture:check"]),
    failurePolicy: "block-release",
  },
];

export const RELEASE_CHECKLIST: ReleaseChecklist = Object.freeze({
  kind: "release-checklist",
  gates: Object.freeze(GATES.map((gate) => Object.freeze(gate))),
});

export function releaseChecklist(): ReleaseChecklist {
  return RELEASE_CHECKLIST;
}

export function releaseGate(id: ReleaseGateId): ReleaseGate | undefined {
  return RELEASE_CHECKLIST.gates.find((gate) => gate.id === id);
}

export function releaseGateOrder(): readonly ReleaseGateId[] {
  return RELEASE_CHECKLIST.gates.map((gate) => gate.id);
}

export function releaseChecklistDigest(): string {
  return digestCanonical(RELEASE_CHECKLIST);
}
