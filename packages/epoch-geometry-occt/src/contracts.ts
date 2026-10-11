// Compatibility shim: the public contract types live in contract.ts
// (architecture module artifact). This file preserves the internal import
// path used by the package's other modules and the public entrypoint.
export * from './contract.ts';
