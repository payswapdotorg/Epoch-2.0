import type * as ApplicationEnvironment from "@zcode/epoch-application-environment";
import type { DigestRef, MiniAppDescriptor, Result } from "./contract";
import { digestRefOf, isDigestRef } from "./digest";
import { ok, refuse } from "./result";

export const WORKBENCH_SURFACE_AUTHORITY =
  "@zcode/epoch-application-environment";

/** Opaque authority view of the W028 workbench surface module. */
export type WorkbenchSurfaceAuthority = typeof ApplicationEnvironment;

export type SurfaceReasonCode =
  | "empty-field"
  | "wrong-integration-mode"
  | "wrong-surface-authority"
  | "invalid-ref"
  | "mcp-wrapper-detected";

const MCP_WRAPPER_KEYS: readonly string[] = [
  "mcp",
  "mcpServer",
  "mcpServers",
  "mcpClient",
  "mcpTransport",
];

/**
 * Scan a value (depth-limited) for MCP wrapper markers. Reproduced mini-apps
 * open through the generic Epoch workbench surface, never via MCP wrappers.
 */
export function detectMcpWrapperSignals(value: unknown): readonly string[] {
  const found = new Set<string>();
  collectSignalKeys(value, found, 0);
  return [...found].sort();
}

function collectSignalKeys(
  value: unknown,
  found: Set<string>,
  depth: number,
): void {
  if (depth > 3 || typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (MCP_WRAPPER_KEYS.includes(key)) {
      found.add(key);
    }
    collectSignalKeys(record[key], found, depth + 1);
  }
}

/**
 * Validate a mini-app descriptor: it must declare that it OPENS THROUGH the
 * generic Epoch workbench surface (W028 environment contracts, bound by
 * digest), and it must carry no MCP wrapper signals.
 */
export function validateMiniAppDescriptor(
  descriptor: MiniAppDescriptor,
): Result<
  { descriptor: MiniAppDescriptor; descriptorRef: DigestRef },
  SurfaceReasonCode
> {
  if (
    descriptor.appId.trim() === "" ||
    descriptor.displayName.trim() === "" ||
    descriptor.version.trim() === "" ||
    descriptor.capabilityId.trim() === ""
  ) {
    return refuse(
      "empty-field",
      "appId, displayName, version and capabilityId must be non-empty",
    );
  }
  if (descriptor.integrationMode !== "epoch-workbench-surface") {
    return refuse(
      "wrong-integration-mode",
      'integrationMode must be "epoch-workbench-surface"',
    );
  }
  const surface = descriptor.surface;
  if (surface.surfaceAuthority !== WORKBENCH_SURFACE_AUTHORITY) {
    return refuse(
      "wrong-surface-authority",
      "surface must bind to @zcode/epoch-application-environment",
    );
  }
  if (surface.surfaceId.trim() === "" || surface.entrypoint.trim() === "") {
    return refuse("empty-field", "surfaceId and entrypoint must be non-empty");
  }
  if (!isDigestRef(surface.environmentContractRef)) {
    return refuse(
      "invalid-ref",
      "environmentContractRef must be a sha256 digest ref",
    );
  }
  if (
    !isDigestRef(descriptor.foundationRef) ||
    !isDigestRef(descriptor.behaviorContractRef)
  ) {
    return refuse(
      "invalid-ref",
      "foundationRef and behaviorContractRef must be sha256 digest refs",
    );
  }
  const mcpSignals = detectMcpWrapperSignals(descriptor);
  if (mcpSignals.length > 0) {
    return refuse(
      "mcp-wrapper-detected",
      `MCP wrapper signals detected: ${mcpSignals.join(", ")}`,
    );
  }
  return ok({ descriptor, descriptorRef: digestRefOf(descriptor) });
}
