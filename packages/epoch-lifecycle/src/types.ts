/**
 * Compatibility shim. The canonical public contract home is ./contract.ts
 * (the repo's managed-module convention: contract.ts + module.ts + index.ts,
 * per the frozen W021 epoch-persistence precedent). This file re-exports the
 * contract verbatim so every internal module importing from "./types.ts"
 * stays untouched; new code should import from ./contract.ts directly.
 *
 * `export *` is the one re-export form that carries both values and types
 * without per-name annotations, so it stays clean under verbatimModuleSyntax
 * and isolatedModules.
 */

export * from "./contract.ts";
