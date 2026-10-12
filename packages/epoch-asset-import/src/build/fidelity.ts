import type {
  FidelityGateDecision,
  FidelityGateInput,
  FidelityRejectionReason,
} from "../types/fidelity.js";

export function applyFidelityGate(input: FidelityGateInput): FidelityGateDecision {
  const { format, declaration } = input;
  if (declaration === null) {
    return {
      status: "rejected",
      reason: {
        kind: "undeclared-fidelity",
        detail: `rejection is the default: no fidelity declaration was provided for format ${format.formatId}`,
      },
    };
  }
  if (format.features.meshes && !declaration.preservesMeshes) {
    return {
      status: "rejected",
      reason: {
        kind: "topology-loss",
        detail: `format ${format.formatId} carries meshes but the declaration does not preserve them`,
      },
    };
  }
  if (format.features.materials && !declaration.preservesMaterials) {
    return {
      status: "rejected",
      reason: {
        kind: "material-fidelity-loss",
        detail: `format ${format.formatId} carries materials but the declaration does not preserve them`,
      },
    };
  }
  if (format.features.pbr && !declaration.preservesPbr) {
    return {
      status: "rejected",
      reason: {
        kind: "material-fidelity-loss",
        detail: `format ${format.formatId} carries PBR materials but the declaration does not preserve them`,
      },
    };
  }
  if (format.features.skeletons && !declaration.preservesSkeletons) {
    return {
      status: "rejected",
      reason: {
        kind: "unsupported-feature-loss",
        detail: `format ${format.formatId} carries skeletons but the declaration does not preserve them`,
      },
    };
  }
  if (format.features.animations && !declaration.preservesAnimations) {
    return {
      status: "rejected",
      reason: {
        kind: "animation-loss",
        detail: `format ${format.formatId} carries animations but the declaration does not preserve them`,
      },
    };
  }
  return { status: "accepted", declaration };
}

export function describeFidelityRejection(reason: FidelityRejectionReason): string {
  switch (reason.kind) {
    case "unsupported-feature-loss":
      return `unsupported feature loss: ${reason.detail}`;
    case "material-fidelity-loss":
      return `material fidelity loss: ${reason.detail}`;
    case "topology-loss":
      return `topology loss: ${reason.detail}`;
    case "animation-loss":
      return `animation loss: ${reason.detail}`;
    case "undeclared-fidelity":
      return `undeclared fidelity: ${reason.detail}`;
    default: {
      // FidelityRejectionReason is a single object type whose `kind` PROPERTY is
      // the FidelityRejectionKind union (not a discriminated union of object
      // members), so `reason` itself never narrows to `never` — assigning it to
      // `never` is a type error. Every union member is cased above; the default
      // arm accepts the leftover type honestly and stringifies the whole value
      // (no property access on a never) per package law.
      const leftover: FidelityRejectionReason = reason;
      throw new Error(
        `describeFidelityRejection: unhandled rejection reason: ${JSON.stringify(leftover)}`,
      );
    }
  }
}
