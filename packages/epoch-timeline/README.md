# @zcode/epoch-timeline

Timeline and construction state for Epoch-2.0: the projection authority for
construction phases and portable timeline positions over world revisions.
Renderer animation is DERIVED from this authority (ARCHITECTURE-LOCK
invariants 1, 4, 17).

## Laws

- **No second authority.** The world model stays the single semantic
  authority. This package organizes _when_ entities appear in the
  construction story; it never changes _what_ they are. Content, semantics
  and identity of `WorldRevision`/`WorldEntity` stay owned by
  `@zcode/epoch-world-model`.
- **Revision binding.** A timeline is always bound to one world revision by
  digest (`TimelineModel.worldDigest`, `TimelineCursor`), never a mutable
  pointer.
- **Derived visibility.** `visibleEntities(model, position)` is a pure view
  filter (an entity-id set). It never mutates a revision; hosts layer it as
  a view filter.
- **Derived animation.** `TimelineBuilder.animate(model, from, to)` produces
  renderer-neutral steps (appearance/disappearance + interpolation hints);
  renderers consume them and never re-derive animation.
- **Determinism.** Identical revisions produce byte-identical canonical
  `TimelineModel` serializations and identical digests. No timestamps, no
  random ids; day ordinals are calendar-free integers. Digests go through
  `node:crypto` `createHash("sha256")` — the frozen W001/W011 convention —
  over the canonical JSON text.
- **Honesty.** Corrupt or unknown phase data surfaces as typed
  `TimelineError`s — never silent repairs. When a world carries no phase data,
  the builder produces the honest single-phase `as-built` model.

## Public surface (`src/index.ts`)

- Contracts: `ConstructionPhase`, `TimelineModel`, `TimelinePosition`,
  `TimelineCursor`, `TimelineAnimation`, `EntityPhaseMembership`,
  `EntityPhaseParticipation`, constants `AS_BUILT_PHASE_ID`,
  `DEFAULT_TRANSITION_DURATION_DAYS`, `DEFAULT_TIMELINE_EASING`.
- Authority: `TimelineBuilder.fromRevision(revision)`,
  `.position(model, dayOrdinal)`, `.animate(model, from, to)`,
  `.cursor(model, position)`, `.visibleAt(model, cursor)`.
- Standalone: `visibleEntities(model, position)`, `visibilityAtDay(model, day)`,
  `positionAt`, `animateBetween`, `serializePosition`/`parsePosition`,
  `serializeModel`/`parseModel`, `bindCursor`, `cursorIsBound`,
  `visibleEntitiesAtCursor`, `canonicalJson`, `sha256Hex`.
- Errors: `TimelineError` with a `code` from the `TimelineErrorCode` union.

## Input port (anti-corruption boundary)

`TimelineBuilder.fromRevision` accepts a structural port,
`TimelineRevisionInput` (`{ entities?, digest? }`), which the frozen
`WorldRevision` contract satisfies structurally. Field names the port does
not recognize produce typed errors (`revision-entities-missing`, …) rather
than silently-empty models. Recognized construction attribute shapes are
documented in `src/ingest.ts`.

## Tests

`pnpm --filter @zcode/epoch-timeline test` compiles with `tsc -b` and runs
`node --test dist/test/` (80 tests). The W002 fixture worlds are exercised
through a defensive runtime probe in `test/fixture-substrate.test.ts`.
