/**
 * W024 — Agent Tools (`@zcode/epoch-agent-tools`).
 *
 * Typed, authorization-aware agent tools over the Epoch solution surface:
 *
 * - command contracts: `AgentCommand` (discriminated union over nine
 *   `solution.*` kinds, each carrying typed params + a provenance block),
 *   `AgentCommandResult`, `AgentAuthorization`, `AgentSessionDescriptor`;
 * - a pure, deterministic `AgentToolDispatcher` (command in → authorization
 *   check → port call out) that depends only on the Solution Surface port
 *   slice, the W007 interaction command surface slice and the W021 WorldStore
 *   audit slice (see `./ports.ts`);
 * - a digest-keyed, append-only command audit log persisted through the
 *   WorldStore port, plus session restore by digest;
 * - a read-only `AgentToolsOverview` projection.
 *
 * This package never imports a renderer or presentation implementation and
 * never mutates world revisions directly (enforced by
 * `test/no-renderer-imports.test.ts`).
 */
export * from './kinds.js';
export * from './values.js';
export * from './commands.js';
export * from './authorization.js';
export * from './errors.js';
export * from './ports.js';
export * from './results.js';
export * from './audit.js';
export * from './session.js';
export * from './overview.js';
export * from './dispatcher.js';
export * from './hash.js';
