import type { FormatId } from "./brands.js";

/**
 * Transport-level classification of an exchange format. This is metadata
 * about file formats, NOT geometry semantics — semantics stay with the OCCT
 * package (W011) and the world model (W000), referenced by digest.
 */
export type FormatClass =
  | "mesh"
  | "brep"
  | "scene-graph"
  | "geometry-cache"
  | "native-document"
  | "bim-model";

export interface FormatCatalogEntry {
  readonly formatId: FormatId;
  readonly formatClass: FormatClass;
  readonly extensions: readonly string[];
  readonly carriesBRep: boolean;
  readonly notes: readonly string[];
}
