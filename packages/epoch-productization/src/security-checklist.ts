import { digestCanonical } from "./canonical.js";
import {
  defineReleaseCommand,
  type ReleaseCommand,
} from "./release-checklist.js";

/**
 * Security review surface — pure data. The checklist is DATA for
 * reviewers and executors; nothing here talks to the network, the
 * filesystem, or a package registry. Checks whose command argv is empty
 * are executor-defined (human review or executor-chosen invocation).
 */

export type SecurityChecklistSectionId =
  | "token-hygiene"
  | "dependency-audit"
  | "permission-surface";

export interface SecurityCheck {
  readonly id: string;
  readonly section: SecurityChecklistSectionId;
  readonly ordering: number;
  readonly label: string;
  readonly requirement: string;
  readonly automated: boolean;
  readonly command: ReleaseCommand;
}

export interface SecurityChecklist {
  readonly kind: "security-checklist";
  readonly checks: readonly SecurityCheck[];
}

interface CheckSeed {
  readonly id: string;
  readonly section: SecurityChecklistSectionId;
  readonly ordering: number;
  readonly label: string;
  readonly requirement: string;
  readonly automated: boolean;
  readonly command: ReleaseCommand;
}

const CHECK_SEEDS: readonly CheckSeed[] = [
  {
    id: "no-secrets-in-source",
    section: "token-hygiene",
    ordering: 1,
    label: "No credentials in source or configuration",
    requirement:
      "No credential material may live in code, config, docs or fixtures; the pure scanForSecrets matcher must stay clean over the repo tree.",
    automated: true,
    command: defineReleaseCommand([
      "node",
      "qa/epoch-productization/run-plan-step.mjs",
      "scan-secrets",
      ".",
    ]),
  },
  {
    id: "no-secrets-in-history",
    section: "token-hygiene",
    ordering: 2,
    label: "No credentials in branch history",
    requirement:
      "No credential material may be committed on any branch; the executor reviews full history output for token shapes.",
    automated: false,
    command: defineReleaseCommand(["git", "log", "--all", "--full-history", "-p"]),
  },
  {
    id: "no-credentials-in-remotes",
    section: "token-hygiene",
    ordering: 3,
    label: "No credentials in git remotes",
    requirement:
      "Push and fetch remotes must not embed tokens; review git remote output (tokenized push URLs are typed at the shell, never stored).",
    automated: false,
    command: defineReleaseCommand(["git", "remote", "-v"]),
  },
  {
    id: "scan-release-artifacts",
    section: "token-hygiene",
    ordering: 4,
    label: "Scan staged release artifacts",
    requirement:
      "Before publication the release executor runs scan-secrets over the staged artifact root; this package only defines the matcher.",
    automated: false,
    command: defineReleaseCommand([]),
  },
  {
    id: "telemetry-privacy-law",
    section: "token-hygiene",
    ordering: 5,
    label: "Telemetry stays private by construction",
    requirement:
      "Telemetry must be disabled by default and may only carry counts and labels (no world content, no user identifiers, no remote sink).",
    automated: true,
    command: defineReleaseCommand([
      "pnpm",
      "--filter",
      "@zcode/epoch-productization",
      "test",
    ]),
  },
  {
    id: "dependency-audit",
    section: "dependency-audit",
    ordering: 6,
    label: "Full dependency audit",
    requirement: "pnpm audit must report no known vulnerabilities for the workspace graph.",
    automated: true,
    command: defineReleaseCommand(["pnpm", "audit"]),
  },
  {
    id: "dependency-audit-prod",
    section: "dependency-audit",
    ordering: 7,
    label: "Production dependency audit",
    requirement:
      "pnpm audit --prod must report no known vulnerabilities in production dependencies.",
    automated: true,
    command: defineReleaseCommand(["pnpm", "audit", "--prod"]),
  },
  {
    id: "lockfile-frozen-install",
    section: "dependency-audit",
    ordering: 8,
    label: "Dependencies install frozen",
    requirement:
      "The release installs exactly from the committed lockfile (mirrors the frozen-install release gate).",
    automated: true,
    command: defineReleaseCommand(
      ["pnpm", "install", "--frozen-lockfile"],
      [{ key: "ELECTRON_SKIP_BINARY_DOWNLOAD", value: "1" }],
    ),
  },
  {
    id: "zero-runtime-dependencies",
    section: "dependency-audit",
    ordering: 9,
    label: "Productization adapter keeps zero runtime dependencies",
    requirement:
      "@zcode/epoch-productization must keep an empty runtime dependency list so the release surface adds no supply-chain surface.",
    automated: true,
    command: defineReleaseCommand([
      "pnpm",
      "--filter",
      "@zcode/epoch-productization",
      "list",
      "--depth",
      "0",
    ]),
  },
  {
    id: "permission-inventory-current",
    section: "permission-surface",
    ordering: 10,
    label: "Permission inventory matches the target matrix",
    requirement:
      "permissionInventory() must aggregate exactly the permissions granted by the deployment target registry.",
    automated: true,
    command: defineReleaseCommand([
      "pnpm",
      "--filter",
      "@zcode/epoch-productization",
      "test",
    ]),
  },
  {
    id: "web-no-privileged-permissions",
    section: "permission-surface",
    ordering: 11,
    label: "Web channel grants no privileged permissions",
    requirement:
      "Web targets must never grant filesystem, process, clipboard or notification permissions.",
    automated: true,
    command: defineReleaseCommand([
      "pnpm",
      "--filter",
      "@zcode/epoch-productization",
      "test",
    ]),
  },
  {
    id: "desktop-permissions-reviewed",
    section: "permission-surface",
    ordering: 12,
    label: "Desktop permission surface reviewed per release",
    requirement:
      "A reviewer walks the desktop permissionSurface in the target registry and confirms each grant is required for the release.",
    automated: false,
    command: defineReleaseCommand([]),
  },
  {
    id: "agent-runtime-least-privilege",
    section: "permission-surface",
    ordering: 13,
    label: "Agent runtime runs least-privilege",
    requirement:
      "The agent runtime must not widen the permission surface beyond process-spawn scoped to the world store location.",
    automated: false,
    command: defineReleaseCommand([]),
  },
];

export const SECURITY_CHECKLIST_SECTIONS: readonly SecurityChecklistSectionId[] =
  Object.freeze(["token-hygiene", "dependency-audit", "permission-surface"]);

export const SECURITY_CHECKLIST: SecurityChecklist = Object.freeze({
  kind: "security-checklist",
  checks: Object.freeze(CHECK_SEEDS.map((seed) => Object.freeze(seed))),
});

export function securityChecklist(): SecurityChecklist {
  return SECURITY_CHECKLIST;
}

export function securityChecksBySection(
  section: SecurityChecklistSectionId,
): readonly SecurityCheck[] {
  return SECURITY_CHECKLIST.checks.filter((check) => check.section === section);
}

export function securityChecklistDigest(): string {
  return digestCanonical(SECURITY_CHECKLIST);
}
