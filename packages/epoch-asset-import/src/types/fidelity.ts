import type { ImportFormatDescriptor } from "./format.js";

export type FidelityDeclaration = {
  readonly preservesMeshes: boolean;
  readonly preservesMaterials: boolean;
  readonly preservesSkeletons: boolean;
  readonly preservesAnimations: boolean;
  readonly preservesPbr: boolean;
};

export type FidelityRejectionKind =
  | "unsupported-feature-loss"
  | "material-fidelity-loss"
  | "topology-loss"
  | "animation-loss"
  | "undeclared-fidelity";

export type FidelityRejectionReason = {
  readonly kind: FidelityRejectionKind;
  readonly detail: string;
};

export type FidelityGateInput = {
  readonly format: ImportFormatDescriptor;
  readonly declaration: FidelityDeclaration | null;
};

export type FidelityGateDecision =
  | { readonly status: "accepted"; readonly declaration: FidelityDeclaration }
  | { readonly status: "rejected"; readonly reason: FidelityRejectionReason };
