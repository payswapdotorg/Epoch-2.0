export type FormatId = string & { readonly __brand: "FormatId" };

/**
 * Coarse fidelity tier of a format's documented surface:
 * - "full-fidelity": meshes, materials, skeletons, animations and PBR are all documented.
 * - "meshes-materials": geometry and materials (possibly skeletons/animations), no PBR.
 * - "meshes-only": bare geometry.
 */
export type FidelityClass = "full-fidelity" | "meshes-materials" | "meshes-only";

export type FormatFeatureSupport = {
  readonly meshes: boolean;
  readonly materials: boolean;
  readonly skeletons: boolean;
  readonly animations: boolean;
  readonly pbr: boolean;
};

export type ImportFormatDescriptor = {
  readonly formatId: FormatId;
  readonly displayName: string;
  readonly extensions: readonly string[];
  readonly features: FormatFeatureSupport;
  readonly fidelityClass: FidelityClass;
  readonly notes: string;
};
