import { canonicalDigest } from "../canonical.js";
import type { CanonicalJsonValue } from "../canonical.js";
import type { Sha256Hex } from "../types/branded.js";
import type {
  ParaViewPluginRef,
  ParaViewPluginRefParams,
  ParaViewPluginRefRejection,
  ParaViewPluginRefValidation,
} from "../types/paraview.js";
import { isKebabId, isNonEmptyString, isRecord } from "../validate.js";

/** Validates an untrusted plugin provenance ref with typed rejections. */
export function validateParaViewPluginRef(input: unknown): ParaViewPluginRefValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      rejections: [
        {
          kind: "invalid-schema-version",
          message: "plugin ref must be a record carrying schemaVersion 1",
        },
      ],
    };
  }
  const rejections: ParaViewPluginRefRejection[] = [];
  if (input.schemaVersion !== 1) {
    rejections.push({
      kind: "invalid-schema-version",
      message: `schemaVersion must be 1 (got ${JSON.stringify(input.schemaVersion)})`,
    });
  }
  if (!isKebabId(input.pluginName)) {
    rejections.push({
      kind: "invalid-plugin-name",
      message: "pluginName must be a kebab-id",
    });
  }
  if (!isKebabId(input.provider)) {
    rejections.push({
      kind: "invalid-plugin-provider",
      message: "provider must be a kebab-id (e.g. kitware-paraview)",
    });
  }
  if (!isNonEmptyString(input.version)) {
    rejections.push({
      kind: "invalid-plugin-version",
      message: "version must be a non-empty string",
    });
  }
  if (!isKebabId(input.capability)) {
    rejections.push({
      kind: "invalid-plugin-capability",
      message: "capability must be a kebab-id",
    });
  }
  if (
    input.stateDescriptorDigest !== undefined &&
    !isKebabId(input.stateDescriptorDigest) &&
    typeof input.stateDescriptorDigest !== "string"
  ) {
    rejections.push({
      kind: "invalid-descriptor-ref",
      message: "stateDescriptorDigest, when present, must be a string digest",
    });
  } else if (
    typeof input.stateDescriptorDigest === "string" &&
    !/^[0-9a-f]{64}$/.test(input.stateDescriptorDigest)
  ) {
    rejections.push({
      kind: "invalid-descriptor-ref",
      message: "stateDescriptorDigest, when present, must be a 64-character lowercase hex digest",
    });
  }
  if (rejections.length > 0) {
    return { ok: false, rejections };
  }
  return { ok: true, value: input as unknown as ParaViewPluginRef };
}

/** Builds a plugin provenance ref from typed parameters. */
export function buildParaViewPluginRef(params: ParaViewPluginRefParams): ParaViewPluginRef {
  const base = {
    schemaVersion: 1 as const,
    pluginName: params.pluginName,
    provider: params.provider,
    version: params.version,
    capability: params.capability,
  };
  const ref: ParaViewPluginRef =
    params.stateDescriptorDigest === undefined
      ? base
      : { ...base, stateDescriptorDigest: params.stateDescriptorDigest };
  return ref;
}

/** sha256 over the canonical JSON of a plugin provenance ref. */
export function paraViewPluginRefDigest(ref: ParaViewPluginRef): Sha256Hex {
  return canonicalDigest(ref as unknown as CanonicalJsonValue);
}
