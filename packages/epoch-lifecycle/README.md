# @zcode/epoch-lifecycle (W022)

The universal engineering lifecycle — Understand → Decide → Plan → Acquire →
Realize → Observe/Actualize → Verify → Forecast → Close → Learn — as a pure,
deterministic, evidence-keyed state machine that organizes engineering work
AROUND the world-model authority and never becomes a second semantic authority.

Laws (ARCHITECTURE-LOCK invariants 1, 4, 17):

- The world model stays the single semantic authority. This package never
  derives or repairs world content and never writes world revisions; it
  references revisions by digest only (`attachRevision`).
- Determinism: identical operation sequences produce byte-identical canonical
  serializations and identical digests (`canonicalizeLifecycleState`,
  `lifecycleStateDigest`). State carries no timestamps — one monotonic step
  counter plus digest references.
- Illegal transitions raise typed `LifecycleError`s; nothing is silently
  corrected. Every produced state is deeply frozen.
- Persistence goes THROUGH the W021 `WorldStore` port (`bindWorldStore`),
  keyed by state digest, alongside revision lineage. Storage is never
  re-implemented here; restore re-attaches by digest, never by pointer.
- The Learn phase records structured planned-vs-actual notes keyed by digests.
  It trains nothing and calls no model. `deriveLearnings` is a pure projection.
- Hosts render the read-only `LifecycleOverview` projection and never import
  machine internals.

Entry point: `src/index.ts` (all public contracts plus `init`/`LifecycleMachine`).
Tests: `pnpm --filter @zcode/epoch-lifecycle test` (Node 24 type stripping;
erasable TypeScript syntax only — no enums, namespaces or parameter properties).

Frozen inputs are consumed type-only (`import type`), so the package has no
runtime dependency on them: `@zcode/epoch-world-model` (`WorldRevision`),
`@zcode/epoch-solution-contract` (`SolutionSurfaceState`),
`@zcode/epoch-persistence` (`WorldStore`, `PersistedRevision`, `PersistedSolution`).

Integration note: the exact W021 WorldStore method shape could not be read in
the authoring environment. `bindWorldStore` probes put/get, save/load,
putArtifact/getArtifact, saveArtifact/loadArtifact and write/read pairs that
accept (key, string) arguments, and throws a typed `persistence-binding` error
naming what it probed otherwise. If the real port differs, adapt
`src/persistence.ts` ONLY.
