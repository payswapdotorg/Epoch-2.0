/**
 * Timeline model surface: construction, canonical serialization and strict
 * parsing, split across `model-build.ts`, `model-serialize.ts` and
 * `model-parse.ts` (each within the architecture file-size budget).
 */
export { buildModel } from "./model-build.js";
export { serializeModel } from "./model-serialize.js";
export { parseModel } from "./model-parse.js";
