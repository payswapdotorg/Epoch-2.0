import {
  isBoolean,
  isIso8601Utc,
  isKebabId,
  isNonEmptyStringArray,
  isSemver,
} from "../validate.js";
import {
  FREECAD_TOOL_ID,
  descriptorDigest,
  exportableFormats,
  importableFormats,
} from "./descriptor.js";
import { INVOCATION_PURPOSES, invocationPlanDigest, resolveArgv } from "./invocation.js";
import type {
  InvocationPlanRejection,
  InvocationPlanValidation,
  RejectedInvocationPlan,
} from "../types/validation.js";
import type { InvocationPlan, InvocationPurpose } from "../types/invocation.js";

const PURPOSES_REQUIRING_INPUT: ReadonlySet<InvocationPurpose> = new Set([
  "import-geometry",
  "convert-geometry",
  "inspect-scene",
]);
const PURPOSES_REQUIRING_OUTPUT: ReadonlySet<InvocationPurpose> = new Set([
  "export-geometry",
  "convert-geometry",
]);

function rejectedPlan(reason: InvocationPlanRejection): RejectedInvocationPlan {
  return { kind: "plan-rejected", reason };
}

function isInvocationPurpose(value: unknown): value is InvocationPurpose {
  return typeof value === "string" && (INVOCATION_PURPOSES as readonly string[]).includes(value);
}

function isUnderWritableRoot(path: string, roots: readonly string[]): boolean {
  return roots.some(
    (root) => path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`),
  );
}

function checkPlanSyntax(plan: InvocationPlan): { field: string; reason: string } | null {
  if (typeof plan !== "object" || plan === null) {
    return { field: "plan", reason: "not an object" };
  }
  if (plan.kind !== "invocation-plan") {
    return { field: "kind", reason: "unexpected record kind" };
  }
  if (!isKebabId(plan.planId)) {
    return { field: "planId", reason: "not a kebab id" };
  }
  if (!isKebabId(plan.toolId)) {
    return { field: "toolId", reason: "not a kebab id" };
  }
  if (!isSemver(plan.toolVersion)) {
    return { field: "toolVersion", reason: "not a semver" };
  }
  if (!isKebabId(plan.contractId)) {
    return { field: "contractId", reason: "not a kebab id" };
  }
  if (!isInvocationPurpose(plan.purpose)) {
    return { field: "purpose", reason: "unknown purpose" };
  }
  if (!Array.isArray(plan.argvBindings)) {
    return { field: "argvBindings", reason: "not an array" };
  }
  for (const binding of plan.argvBindings) {
    if (typeof binding !== "object" || binding === null) {
      return { field: "argvBindings", reason: "each binding must be an object" };
    }
    if (!isKebabId(binding.name)) {
      return { field: "argvBindings", reason: "binding name is not a kebab id" };
    }
    if (
      !Array.isArray(binding.values) ||
      !binding.values.every((value: unknown) => typeof value === "string")
    ) {
      return { field: "argvBindings", reason: "binding values must be strings" };
    }
  }
  if (!Number.isFinite(plan.requestedTimeoutMs)) {
    return { field: "requestedTimeoutMs", reason: "not a finite number" };
  }
  if (!isBoolean(plan.requestedGpu)) {
    return { field: "requestedGpu", reason: "not a boolean" };
  }
  if (!isNonEmptyStringArray(plan.requestedWritePaths)) {
    return { field: "requestedWritePaths", reason: "must be non-empty strings" };
  }
  if (plan.inputFormat !== null && !isKebabId(plan.inputFormat)) {
    return { field: "inputFormat", reason: "not a kebab id" };
  }
  if (plan.outputFormat !== null && !isKebabId(plan.outputFormat)) {
    return { field: "outputFormat", reason: "not a kebab id" };
  }
  if (!isIso8601Utc(plan.createdAtUtc)) {
    return { field: "createdAtUtc", reason: "not an ISO-8601 UTC timestamp" };
  }
  if (!isNonEmptyStringArray(plan.notes)) {
    return { field: "notes", reason: "must be non-empty strings" };
  }
  return null;
}

export function validateInvocationPlan(
  plan: InvocationPlan,
  registry: Parameters<typeof importPlanRegistry>[0] extends never
    ? never
    : InvocationPlanValidationRegistry,
): InvocationPlanValidation {
  return importPlanRegistry(plan, registry);
}

type InvocationPlanValidationRegistry = import("../types/validation.js").CapabilityRegistry;

function importPlanRegistry(
  plan: InvocationPlan,
  registry: InvocationPlanValidationRegistry,
): InvocationPlanValidation {
  const syntaxProblem = checkPlanSyntax(plan);
  if (syntaxProblem !== null) {
    return rejectedPlan({
      kind: "malformed-plan",
      field: syntaxProblem.field,
      reason: syntaxProblem.reason,
    });
  }
  const descriptor = registry.descriptors.find((candidate) => candidate.toolId === plan.toolId);
  if (descriptor === undefined) {
    return rejectedPlan({
      kind: "unknown-tool",
      toolId: plan.toolId,
      knownToolIds: registry.descriptors.map((candidate) => candidate.toolId),
    });
  }
  if (descriptor.toolVersion !== plan.toolVersion) {
    return rejectedPlan({
      kind: "tool-version-mismatch",
      toolId: plan.toolId,
      expectedVersion: descriptor.toolVersion,
      planVersion: plan.toolVersion,
    });
  }
  const contract = registry.invocationContracts.find(
    (candidate) => candidate.contractId === plan.contractId && candidate.toolId === plan.toolId,
  );
  if (contract === undefined) {
    return rejectedPlan({
      kind: "unknown-invocation-contract",
      contractId: plan.contractId,
      knownContractIds: registry.invocationContracts
        .filter((candidate) => candidate.toolId === plan.toolId)
        .map((candidate) => candidate.contractId),
    });
  }
  if (contract.toolDescriptorDigest !== descriptorDigest(descriptor)) {
    return rejectedPlan({
      kind: "contract-descriptor-mismatch",
      contractId: contract.contractId,
      toolId: plan.toolId,
    });
  }
  if (!contract.purposes.includes(plan.purpose)) {
    return rejectedPlan({
      kind: "purpose-mismatch",
      contractId: contract.contractId,
      allowedPurposes: [...contract.purposes],
      planPurpose: plan.purpose,
    });
  }
  const license = registry.licenseRecords.find(
    (candidate) => candidate.toolId === plan.toolId && candidate.toolVersion === plan.toolVersion,
  );
  if (license === undefined) {
    return rejectedPlan({
      kind: "missing-license-record",
      toolId: plan.toolId,
      toolVersion: plan.toolVersion,
    });
  }
  if (!registry.acceptedLicenseIds.includes(license.licenseId)) {
    return rejectedPlan({
      kind: "license-mismatch",
      toolId: plan.toolId,
      toolLicenseId: license.licenseId,
      acceptedLicenseIds: [...registry.acceptedLicenseIds],
    });
  }
  if (PURPOSES_REQUIRING_INPUT.has(plan.purpose) && plan.inputFormat === null) {
    return rejectedPlan({
      kind: "missing-required-format",
      field: "inputFormat",
      purpose: plan.purpose,
    });
  }
  if (PURPOSES_REQUIRING_OUTPUT.has(plan.purpose) && plan.outputFormat === null) {
    return rejectedPlan({
      kind: "missing-required-format",
      field: "outputFormat",
      purpose: plan.purpose,
    });
  }
  if (plan.inputFormat !== null) {
    const supported = importableFormats(descriptor);
    if (!supported.includes(plan.inputFormat)) {
      return rejectedPlan({
        kind: "unsupported-input-format",
        formatId: plan.inputFormat,
        toolId: plan.toolId,
        supportedInputFormats: [...supported],
      });
    }
  }
  if (plan.outputFormat !== null) {
    const supported = exportableFormats(descriptor);
    if (!supported.includes(plan.outputFormat)) {
      return rejectedPlan({
        kind: "unsupported-output-format",
        formatId: plan.outputFormat,
        toolId: plan.toolId,
        supportedOutputFormats: [...supported],
      });
    }
  }
  const placeholders: { name: string; required: boolean; repeatable: boolean }[] = [];
  for (const token of contract.argvTemplate) {
    if (token.kind === "placeholder") {
      placeholders.push({
        name: token.name,
        required: token.required,
        repeatable: token.repeatable,
      });
    }
  }
  const seen = new Set<string>();
  for (const binding of plan.argvBindings) {
    const placeholder = placeholders.find((candidate) => candidate.name === binding.name);
    if (placeholder === undefined) {
      return rejectedPlan({
        kind: "unexpected-argv-binding",
        name: binding.name,
        knownPlaceholderNames: placeholders.map((candidate) => candidate.name),
      });
    }
    if (seen.has(binding.name)) {
      return rejectedPlan({ kind: "duplicate-argv-binding", name: binding.name });
    }
    seen.add(binding.name);
    if (binding.values.length === 0 || binding.values.some((value) => value.length === 0)) {
      return rejectedPlan({ kind: "empty-argv-binding", name: binding.name });
    }
    if (!placeholder.repeatable && binding.values.length > 1) {
      return rejectedPlan({
        kind: "argv-binding-cardinality",
        name: binding.name,
        expected: "exactly one value (placeholder is not repeatable)",
        actual: binding.values.length,
      });
    }
  }
  for (const placeholder of placeholders) {
    if (placeholder.required && !seen.has(placeholder.name)) {
      return rejectedPlan({
        kind: "missing-argv-binding",
        name: placeholder.name,
        contractId: contract.contractId,
      });
    }
  }
  if (
    !Number.isInteger(plan.requestedTimeoutMs) ||
    plan.requestedTimeoutMs < contract.timeout.minTimeoutMs ||
    plan.requestedTimeoutMs > contract.timeout.maxTimeoutMs
  ) {
    return rejectedPlan({
      kind: "timeout-out-of-range",
      requestedTimeoutMs: plan.requestedTimeoutMs,
      minTimeoutMs: contract.timeout.minTimeoutMs,
      maxTimeoutMs: contract.timeout.maxTimeoutMs,
    });
  }
  for (const path of plan.requestedWritePaths) {
    if (!isUnderWritableRoot(path, contract.sandbox.writableRoots)) {
      return rejectedPlan({
        kind: "sandbox-violation",
        requestedPath: path,
        writableRoots: [...contract.sandbox.writableRoots],
      });
    }
  }
  if (plan.requestedGpu && contract.sandbox.gpuAccess === "denied") {
    return rejectedPlan({ kind: "gpu-not-permitted", toolId: plan.toolId });
  }
  const warnings: string[] = [];
  if (plan.requestedGpu && contract.sandbox.gpuAccess === "unspecified") {
    warnings.push("gpu access is unspecified by the contract; the host decides at spawn time");
  }
  if (descriptor.toolId === FREECAD_TOOL_ID) {
    warnings.push(
      "FreeCADCmd may exit 0 on script failure; treat the stdout JSON status line as the primary success signal",
    );
  }
  return {
    kind: "plan-accepted",
    planDigest: invocationPlanDigest(plan),
    resolvedArgv: resolveArgv(contract.argvTemplate, plan.argvBindings),
    matchedToolId: descriptor.toolId,
    matchedLicenseId: license.licenseId,
    warnings,
  };
}

export function formatInvocationRejection(rejection: InvocationPlanRejection): string {
  switch (rejection.kind) {
    case "malformed-plan":
      return `malformed plan: field "${rejection.field}" — ${rejection.reason}`;
    case "unknown-tool":
      return `unknown tool "${rejection.toolId}"; known tools: [${rejection.knownToolIds.join(", ")}]`;
    case "tool-version-mismatch":
      return `tool "${rejection.toolId}" pinned to ${rejection.expectedVersion}, plan says ${rejection.planVersion}`;
    case "unknown-invocation-contract":
      return `unknown invocation contract "${rejection.contractId}"; known: [${rejection.knownContractIds.join(", ")}]`;
    case "contract-descriptor-mismatch":
      return `contract "${rejection.contractId}" is not bound to the current descriptor of tool "${rejection.toolId}"`;
    case "purpose-mismatch":
      return `contract "${rejection.contractId}" allows purposes [${rejection.allowedPurposes.join(", ")}], plan requests ${rejection.planPurpose}`;
    case "missing-license-record":
      return `no license record for tool "${rejection.toolId}" version ${rejection.toolVersion}`;
    case "license-mismatch":
      return `tool license "${rejection.toolLicenseId}" is not in the accepted set [${rejection.acceptedLicenseIds.join(", ")}]`;
    case "missing-required-format":
      return `purpose ${rejection.purpose} requires the ${rejection.field}`;
    case "unsupported-input-format":
      return `tool "${rejection.toolId}" cannot import "${rejection.formatId}"; supported: [${rejection.supportedInputFormats.join(", ")}]`;
    case "unsupported-output-format":
      return `tool "${rejection.toolId}" cannot export "${rejection.formatId}"; supported: [${rejection.supportedOutputFormats.join(", ")}]`;
    case "missing-argv-binding":
      return `missing required argv binding "${rejection.name}" (contract ${rejection.contractId})`;
    case "unexpected-argv-binding":
      return `unexpected argv binding "${rejection.name}"; known placeholders: [${rejection.knownPlaceholderNames.join(", ")}]`;
    case "duplicate-argv-binding":
      return `duplicate argv binding "${rejection.name}"`;
    case "argv-binding-cardinality":
      return `binding "${rejection.name}" expects ${rejection.expected}, got ${rejection.actual}`;
    case "empty-argv-binding":
      return `binding "${rejection.name}" has no usable values`;
    case "timeout-out-of-range":
      return `timeout ${rejection.requestedTimeoutMs}ms outside [${rejection.minTimeoutMs}, ${rejection.maxTimeoutMs}]ms`;
    case "sandbox-violation":
      return `write path "${rejection.requestedPath}" is outside sandbox roots [${rejection.writableRoots.join(", ")}]`;
    case "gpu-not-permitted":
      return `tool "${rejection.toolId}" sandbox denies gpu access`;
    default: {
      const exhausted: never = rejection;
      throw new Error(`unhandled invocation rejection kind: ${JSON.stringify(exhausted)}`);
    }
  }
}
