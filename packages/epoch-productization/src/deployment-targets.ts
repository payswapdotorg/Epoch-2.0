import { compareStrings, digestCanonical } from "./canonical.js";

/**
 * Deployment target matrix — pure data (web/desktop channels).
 * Infrastructure adapter: describes the delivery surface; it never
 * builds, ships, or executes anything.
 */

export type DeploymentChannelKind = "web" | "desktop";

export type ReleaseArtifactKind =
  | "web-bundle"
  | "desktop-installer"
  | "agent-runtime";

export type PermissionGrant =
  | "persistent-storage"
  | "gpu-acceleration"
  | "clipboard-access"
  | "os-notifications"
  | "filesystem-read"
  | "filesystem-write"
  | "process-spawn";

export interface DeploymentTarget {
  readonly id: string;
  readonly kind: DeploymentChannelKind;
  readonly label: string;
  readonly platforms: readonly string[];
  readonly requiredArtifacts: readonly ReleaseArtifactKind[];
  readonly permissionSurface: readonly PermissionGrant[];
  readonly notes: readonly string[];
}

export interface PermissionInventoryEntry {
  readonly permission: PermissionGrant;
  readonly channels: readonly DeploymentChannelKind[];
  readonly targetCount: number;
}

export const RELEASE_ARTIFACT_KINDS: readonly ReleaseArtifactKind[] = Object.freeze([
  "web-bundle",
  "desktop-installer",
  "agent-runtime",
]);

export const PERMISSION_GRANTS: readonly PermissionGrant[] = Object.freeze([
  "persistent-storage",
  "gpu-acceleration",
  "clipboard-access",
  "os-notifications",
  "filesystem-read",
  "filesystem-write",
  "process-spawn",
]);

const PRIVILEGED_PERMISSIONS: readonly PermissionGrant[] = Object.freeze([
  "clipboard-access",
  "os-notifications",
  "filesystem-read",
  "filesystem-write",
  "process-spawn",
]);

const WEB_PERMISSIONS: readonly PermissionGrant[] = Object.freeze([
  "persistent-storage",
  "gpu-acceleration",
]);

const DESKTOP_PERMISSIONS: readonly PermissionGrant[] = Object.freeze([
  "filesystem-read",
  "filesystem-write",
  "process-spawn",
  "persistent-storage",
  "gpu-acceleration",
  "clipboard-access",
  "os-notifications",
]);

const WEB_ARTIFACTS: readonly ReleaseArtifactKind[] = Object.freeze(["web-bundle"]);

const DESKTOP_ARTIFACTS: readonly ReleaseArtifactKind[] = Object.freeze([
  "web-bundle",
  "desktop-installer",
  "agent-runtime",
]);

interface TargetSeed {
  readonly id: string;
  readonly kind: DeploymentChannelKind;
  readonly label: string;
  readonly platforms: readonly string[];
  readonly requiredArtifacts: readonly ReleaseArtifactKind[];
  readonly permissionSurface: readonly PermissionGrant[];
  readonly notes: readonly string[];
}

function desktopSeed(
  id: string,
  label: string,
  platform: string,
): TargetSeed {
  return {
    id,
    kind: "desktop",
    label,
    platforms: [platform],
    requiredArtifacts: DESKTOP_ARTIFACTS,
    permissionSurface: DESKTOP_PERMISSIONS,
    notes: [
      "embeds the web bundle for offline rendering",
      "agent runtime executes as the installing user",
      "filesystem access is scoped to the world store location",
    ],
  };
}

const TARGET_SEEDS: readonly TargetSeed[] = [
  {
    id: "web-static",
    kind: "web",
    label: "Static web bundle",
    platforms: ["any"],
    requiredArtifacts: WEB_ARTIFACTS,
    permissionSurface: WEB_PERMISSIONS,
    notes: [
      "served as static assets; no server-side runtime",
      "browser storage is sandboxed; no raw filesystem access",
      "no network egress permission is granted by default",
    ],
  },
  desktopSeed("desktop-darwin-arm64", "Desktop (macOS, arm64)", "darwin-arm64"),
  desktopSeed("desktop-darwin-x64", "Desktop (macOS, x64)", "darwin-x64"),
  desktopSeed("desktop-linux-arm64", "Desktop (Linux, arm64)", "linux-arm64"),
  desktopSeed("desktop-linux-x64", "Desktop (Linux, x64)", "linux-x64"),
  desktopSeed("desktop-win32-x64", "Desktop (Windows, x64)", "win32-x64"),
];

function freezeTarget(seed: TargetSeed): DeploymentTarget {
  return Object.freeze({
    id: seed.id,
    kind: seed.kind,
    label: seed.label,
    platforms: Object.freeze([...seed.platforms]),
    requiredArtifacts: Object.freeze([...seed.requiredArtifacts]),
    permissionSurface: Object.freeze([...seed.permissionSurface]),
    notes: Object.freeze([...seed.notes]),
  });
}

export const DEPLOYMENT_TARGETS: readonly DeploymentTarget[] = Object.freeze(
  TARGET_SEEDS.map(freezeTarget).sort((left, right) =>
    compareStrings(left.id, right.id),
  ),
);

export function listDeploymentTargets(): readonly DeploymentTarget[] {
  return DEPLOYMENT_TARGETS;
}

export function findDeploymentTarget(id: string): DeploymentTarget | undefined {
  return DEPLOYMENT_TARGETS.find((target) => target.id === id);
}

export function deploymentTargetsForArtifact(
  artifact: ReleaseArtifactKind,
): readonly DeploymentTarget[] {
  return DEPLOYMENT_TARGETS.filter((target) =>
    target.requiredArtifacts.includes(artifact),
  );
}

export function permissionInventory(): readonly PermissionInventoryEntry[] {
  return PERMISSION_GRANTS.map((permission) => {
    const targets = DEPLOYMENT_TARGETS.filter((target) =>
      target.permissionSurface.includes(permission),
    );
    const channels: DeploymentChannelKind[] = [];
    for (const target of targets) {
      if (!channels.includes(target.kind)) {
        channels.push(target.kind);
      }
    }
    channels.sort(compareStrings);
    return Object.freeze({
      permission,
      channels: Object.freeze(channels),
      targetCount: targets.length,
    });
  });
}

export function deploymentTargetInvariants(): readonly string[] {
  const violations: string[] = [];
  const ids = new Set<string>();
  for (const target of DEPLOYMENT_TARGETS) {
    if (ids.has(target.id)) {
      violations.push(`duplicate target id: ${target.id}`);
    }
    ids.add(target.id);
    if (target.platforms.length === 0) {
      violations.push(`target ${target.id} declares no platforms`);
    }
    for (const permission of target.permissionSurface) {
      if (!PERMISSION_GRANTS.includes(permission)) {
        violations.push(
          `target ${target.id} grants unknown permission ${permission}`,
        );
      }
    }
    if (target.kind === "web") {
      for (const permission of target.permissionSurface) {
        if (PRIVILEGED_PERMISSIONS.includes(permission)) {
          violations.push(
            `web target ${target.id} grants privileged permission ${permission}`,
          );
        }
      }
    }
    if (target.kind === "desktop") {
      for (const artifact of RELEASE_ARTIFACT_KINDS) {
        if (!target.requiredArtifacts.includes(artifact)) {
          violations.push(
            `desktop target ${target.id} is missing artifact ${artifact}`,
          );
        }
      }
    }
  }
  return violations;
}

export function deploymentTargetsDigest(): string {
  return digestCanonical(DEPLOYMENT_TARGETS);
}
