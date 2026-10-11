// Single import point for the package under test.
// The relative path works before workspace linking (dist must be built first);
// after the workspace install links the package, this can be switched to the
// package specifier "@zcode/epoch-capability-evaluation" in one place.
export * from "../../../packages/epoch-capability-evaluation/dist/index.js";
