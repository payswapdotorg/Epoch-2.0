import type { Digest, LicenseId, ToolId } from "./brands.js";
import type { FormatClass } from "./formats.js";
import type { NativeToolDescriptor } from "./descriptor.js";
import type { InvocationContract, InvocationPlan, InvocationPurpose } from "./invocation.js";
import type { LicenseRecord } from "./license.js";
import type { GeometryExchangeRecord } from "./exchange.js";

/**
 * Typed data assembled by the host. Validation machines expect at most one
 * descriptor version per toolId; summarizeCapabilityMatrix tolerates more.
 */
export interface CapabilityRegistry {
  readonly descriptors: readonly NativeToolDescriptor[];
  readonly invocationContracts: readonly InvocationContract[];
  readonly licenseRecords: readonly LicenseRecord[];
  readonly acceptedLicenseIds: readonly LicenseId[];
}

export type InvocationPlanRejection =
  | { readonly kind: "malformed-plan"; readonly field: string; readonly reason: string }
  | {
      readonly kind: "unknown-tool";
      readonly toolId: string;
      readonly knownToolIds: readonly string[];
    }
  | {
      readonly kind: "tool-version-mismatch";
      readonly toolId: string;
      readonly expectedVersion: string;
      readonly planVersion: string;
    }
  | {
      readonly kind: "unknown-invocation-contract";
      readonly contractId: string;
      readonly knownContractIds: readonly string[];
    }
  | {
      readonly kind: "contract-descriptor-mismatch";
      readonly contractId: string;
      readonly toolId: string;
    }
  | {
      readonly kind: "purpose-mismatch";
      readonly contractId: string;
      readonly allowedPurposes: readonly InvocationPurpose[];
      readonly planPurpose: InvocationPurpose;
    }
  | {
      readonly kind: "missing-license-record";
      readonly toolId: string;
      readonly toolVersion: string;
    }
  | {
      readonly kind: "license-mismatch";
      readonly toolId: string;
      readonly toolLicenseId: LicenseId;
      readonly acceptedLicenseIds: readonly LicenseId[];
    }
  | {
      readonly kind: "missing-required-format";
      readonly field: "inputFormat" | "outputFormat";
      readonly purpose: InvocationPurpose;
    }
  | {
      readonly kind: "unsupported-input-format";
      readonly formatId: string;
      readonly toolId: string;
      readonly supportedInputFormats: readonly string[];
    }
  | {
      readonly kind: "unsupported-output-format";
      readonly formatId: string;
      readonly toolId: string;
      readonly supportedOutputFormats: readonly string[];
    }
  | { readonly kind: "missing-argv-binding"; readonly name: string; readonly contractId: string }
  | {
      readonly kind: "unexpected-argv-binding";
      readonly name: string;
      readonly knownPlaceholderNames: readonly string[];
    }
  | { readonly kind: "duplicate-argv-binding"; readonly name: string }
  | {
      readonly kind: "argv-binding-cardinality";
      readonly name: string;
      readonly expected: string;
      readonly actual: number;
    }
  | { readonly kind: "empty-argv-binding"; readonly name: string }
  | {
      readonly kind: "timeout-out-of-range";
      readonly requestedTimeoutMs: number;
      readonly minTimeoutMs: number;
      readonly maxTimeoutMs: number;
    }
  | {
      readonly kind: "sandbox-violation";
      readonly requestedPath: string;
      readonly writableRoots: readonly string[];
    }
  | { readonly kind: "gpu-not-permitted"; readonly toolId: string };

export interface AcceptedInvocationPlan {
  readonly kind: "plan-accepted";
  readonly planDigest: Digest;
  readonly resolvedArgv: readonly string[];
  readonly matchedToolId: ToolId;
  readonly matchedLicenseId: LicenseId;
  readonly warnings: readonly string[];
}

export interface RejectedInvocationPlan {
  readonly kind: "plan-rejected";
  readonly reason: InvocationPlanRejection;
}

export type InvocationPlanValidation = AcceptedInvocationPlan | RejectedInvocationPlan;

export type ExchangeRejection =
  | { readonly kind: "malformed-record"; readonly field: string; readonly reason: string }
  | {
      readonly kind: "unknown-tool";
      readonly toolId: string;
      readonly knownToolIds: readonly string[];
    }
  | {
      readonly kind: "tool-version-mismatch";
      readonly toolId: string;
      readonly expectedVersion: string;
      readonly recordVersion: string;
    }
  | {
      readonly kind: "unknown-format";
      readonly formatId: string;
      readonly knownFormatIds: readonly string[];
    }
  | {
      readonly kind: "format-not-supported-for-direction";
      readonly formatId: string;
      readonly direction: "import" | "export";
      readonly toolId: string;
      readonly supportedFormats: readonly string[];
    }
  | {
      readonly kind: "extension-mismatch";
      readonly fileExtension: string;
      readonly expectedExtensions: readonly string[];
    }
  | {
      readonly kind: "fidelity-claim-unsupported";
      readonly flag: "brepGeometry";
      readonly formatClass: FormatClass;
      readonly formatId: string;
    }
  | { readonly kind: "missing-semantic-authority" }
  | { readonly kind: "brep-authority-required"; readonly requiredAuthorityKind: "geometry-kernel" };

export interface ValidExchangeRecord {
  readonly kind: "exchange-valid";
  readonly recordDigest: Digest;
}

export interface RejectedExchangeRecord {
  readonly kind: "exchange-rejected";
  readonly reason: ExchangeRejection;
}

export type ExchangeValidation = ValidExchangeRecord | RejectedExchangeRecord;
