# W007 — Visual Integration Closure Evidence Summary

## Work order
W007 — Visual Integration Closure (branch: `work/w007-visual-closure`)

## Acceptance law
> open -> world -> navigate -> select -> inspect (with downstream projection) ->
> layer isolate -> section-or-plan -> measure-or-annotate

Both hosts (Web + Desktop) demonstrate the full acceptance flow with numbered
screenshots. The world stays dominant (invariant #3): tools/inspector float
as overlays on top of the canvas, never replacing it.

## Evidence locations
- Web: `qa/epoch-web/evidence/w007/` (8 PNGs + manifest.json)
- Desktop: `qa/epoch-desktop/evidence/w007/` (8 PNGs + manifest.json)

## Reproduce
```bash
# Common prep
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile

# Web journey
pnpm --filter @zcode/web dev   # Vite :5173
node qa/epoch-web/w007-journey.mjs

# Desktop journey (requires Electron binary + xvfb)
pnpm rebuild electron
cd packages/desktop && npx tsup
cd ../..
DISPLAY=:99 Xvfb :99 -screen 0 1440x900x24 &
node qa/epoch-desktop/w007-journey.mjs
```

## World-not-dashboard self-assessment

The artifact set makes the "world product, not dashboard" verdict visually
unambiguous:

- **01/02 open + world**: full-bleed 3D construction fixture visible immediately
  on host open. No empty state, no placeholder, no dashboard.
- **03 navigate**: orbit + zoom visibly moves the camera off the home framing.
- **04 select**: pointer click resolves through renderer hit mapping to an Epoch
  entityId; inspector populates with real engineering semantics from the world
  model (not mesh names).
- **05 inspect with projection**: inspector + downstream projection link
  (layer/phase/properties + BOQ-ish quantity rollup read directly from world
  model + constraint refs). PROJECTION ONLY — no second BOQ authority.
- **06 layer isolate**: solo STRUCTURE — 5 of 6 fixture layers hidden via
  renderer-neutral `setVisibility`. World stays dominant.
- **07 plan/section**: plan-view navigation path applied (top-down orthographic
  style via `look-at` + high elevation + zoom out). Capability boundary
  honest: Babylon `descriptor.capabilities.section === false`, so section-cut
  is implemented as a layer-visibility sequence hiding ENVELOPE/MEP/FINISHES to
  expose STRUCTURE — still only renderer-neutral `setVisibility`.
- **08 measure/annotate**: SI-unit measurement (5.00 m) + annotation anchored
  to selected entityId (survives navigation — projection state, not a second
  semantic authority).

## Capability boundary (honest)

- Babylon renderer descriptor declares `plan: true, section: false` (W004 frozen).
- W007 implements BOTH plan-view path AND section-cut path:
  - plan-view: real navigation preset (top-down `look-at`).
  - section-cut: capability boundary — Babylon has no section geometry, so
    section-cut is implemented as a layer-visibility sequence (visual cutaway
    equivalent). Still only renderer-neutral `setVisibility`.
- Recorded honestly in `packages/epoch-world-interaction/src/navigation-path.ts`
  and in `packages/epoch-renderer-babylon/src/descriptor.ts`.
