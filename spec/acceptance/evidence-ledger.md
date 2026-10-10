# Epoch Visual Acceptance — Evidence Ledger

This is the durable record of every visual acceptance claim for the Epoch
visualization-first milestone. Each entry records the work order, the
acceptance item, the evidence path, the environment qualification, the date
and the verdict. It is the repo's permanent acceptance machinery (W020).

A check that cannot run honestly is recorded as **SKIPPED** with its blocker,
never silently passed (ARCHITECTURE-LOCK #27 evidence-based capability claims;
`spec/acceptance/visualization-first.md`).

## Evidence convention

Every acceptance item is an `EvidenceItem` (typed in
`qa/epoch-world/contract.ts`) with:

- **named evidence file** — screenshot (or recording where the environment
  permits) under `qa/epoch-world/evidence/<host>/`;
- **caption law** — what MUST be visible in the evidence for the item to pass;
- **environment qualification** — `gpu` (real/software), `hostRuntime`
  (real/headless/null-engine), `network` (real/offline) + a free-form note;
- **verdict** — `pass` | `skip` | `fail`. A `skip` MUST carry a `skipReason`.

The machine-checker `qa/epoch-world/evidence-check.mjs` FAILS (exit 1) when a
PASS item references a missing file or is unlabeled, or any FAIL item exists.

## Capability matrix (seed run)

| Check | GPU | Host runtime | Network | Available | Blocker |
| --- | --- | --- | --- | --- | --- |
| renderer-equivalence (Babylon NullEngine + Three headless) | software | null-engine | offline | yes | — |
| web-journey (real Chromium) | software | headless | offline | yes | — |
| desktop-journey (real Electron) | software | real | offline | no | Electron binary not present (`ELECTRON_SKIP_BINARY_DOWNLOAD=1` at install) and Electron mirror unreachable; cannot obtain binary to launch a real Electron window. |

The construction fixture is client-side/network-free (invariant #17), so every
journey is `offline`. The real-GPU column is `software` for this sandbox (no
real GPU; SwiftShader / NullEngine). A future run on a real-GPU host would
self-declare `real`.

---

## Seed run — 2026-10-10

Battery: `qa/epoch-world/run-battery.mjs` — pass **13** / skip **1** / fail
**0** (total **14**).

### Renderer equivalence (Babylon W004 + Three W008, NullEngine/headless)

The SAME deterministic WorldPresentation (`qa/epoch-world/world-presentation-fixture.ts`)
mounted through BOTH merged renderers' public entrypoints
(`@zcode/epoch-renderer-babylon`, `@zcode/epoch-renderer-three`).

| # | Item | Work order | Caption law | Evidence | Environment | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | equivalence:same-entityId-set | W004+W008+W020 | BOTH renderers resolve the SAME deterministic entityId set for the same fixture (invariant #6/#11). | `node --test qa/epoch-world/equivalence.test.ts` (5/5 pass) | null-engine / software / offline | **pass** |
| E2 | equivalence:same-world-AABB | W004+W008+W020 | Each entity resolves to a hit point inside the SAME declared world AABB through both renderers (geometry-faithful, renderer-independent mapping). | equivalence.test.ts | null-engine / software / offline | **pass** |
| E3 | equivalence:portable-state-Babylon→Three | W004+W008+W020 | Portable focused-entity + layer state survives a renderer switch Babylon→Three (invariant #12). | equivalence.test.ts | null-engine / software / offline | **pass** |
| E4 | equivalence:portable-state-Three→Babylon | W004+W008+W020 | Portable focused-entity + layer state survives a renderer switch Three→Babylon (bidirectional). | equivalence.test.ts | null-engine / software / offline | **pass** |
| E5 | equivalence:world-identity-untouched | W004+W008+W020 | World identity fields (worldId/digest/revisionId) are untouched by both renderers (invariant #4/#5). | equivalence.test.ts | null-engine / software / offline | **pass** |

### Web host journey (real Chromium, W005 pattern)

| # | Item | Work order | Caption law | Evidence | Environment | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | web:01-open | W005+W007 | Solution opened from the workbench — world-dominant host route active (no dashboard). | `evidence/web/web:01-open.png` | headless / software / offline | **pass** |
| W2 | web:02-world | W005+W007 | Real fixture world rendered full-bleed (construction geometry, not a placeholder canvas). | `evidence/web/web:02-world.png` | headless / software / offline | **pass** |
| W3 | web:03-navigate | W005+W007 | Orbit + zoom navigation applied — camera moved off home framing via renderer-neutral session.navigate. | `evidence/web/web:03-navigate.png` | headless / software / offline | **pass** |
| W4 | web:04-select | W005+W007 | Semantic selection — pointer click resolved through renderer hit mapping to an Epoch entityId (focus highlight applied). | `evidence/web/web:04-select.png` | headless / software / offline | **pass** |
| W5 | web:05-inspect | W005+W007 | Inspector populated with the selected entity's engineering semantics (entityId/layer/phase/properties) from the world model. | `evidence/web/web:05-inspect.png` | headless / software / offline | **pass** |
| W6 | web:06-isolate | W005+W007 | Layer isolate — soloed a construction layer; all other fixture layers hidden via renderer-neutral setVisibility. | `evidence/web/web:06-isolate.png` | headless / software / offline | **pass** |
| W7 | web:07-section-or-plan | W005+W007 | Plan-view navigation path applied (top-down orthographic-style look-at + high elevation). | `evidence/web/web:07-section-or-plan.png` | headless / software / offline | **pass** |
| W8 | web:08-measure | W005+W007 | Measurement added with SI-unit readout (world-anchored, stable under navigation). | `evidence/web/web:08-measure.png` | headless / software / offline | **pass** |

### Desktop host journey (real Electron, W006 pattern)

| # | Item | Work order | Caption law | Evidence | Environment | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | desktop:journey | W006+W007 | Real Electron window opens the construction world and drives the full visual journey (open→world→navigate→select→inspect→isolate→section/plan→measure). | — | — | **skip** |

**Desktop skip reason:** Electron binary not present
(`ELECTRON_SKIP_BINARY_DOWNLOAD=1` at install) and Electron mirror unreachable;
cannot obtain binary to launch a real Electron window. The desktop journey
harness (`qa/epoch-world/journey-desktop.mjs`) is complete and will run
honestly when a real Electron binary + display are available. The W006 merged
harness (`qa/epoch-desktop/journey.mjs`) provides the prior Electron journey
evidence on `main` and remains the reference.

### Evidence convention check

`qa/epoch-world/evidence-check.mjs` — **OK**: every PASS item has a present,
labeled evidence file; the desktop SKIP carries its blocker.

## Reproduce

```bash
cd <repo-root>
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile
node --test qa/epoch-world/equivalence.test.ts        # 5/5 pass (NullEngine)
pnpm --filter @zcode/web dev &                        # port 5173
node qa/epoch-world/journey-web.mjs                   # 8/8 pass (real Chromium)
node qa/epoch-world/journey-desktop.mjs               # SKIPPED (no Electron binary)
node qa/epoch-world/evidence-check.mjs               # OK
node qa/epoch-world/run-battery.mjs                   # pass 13 / skip 1 / fail 0
```

## TL handoff notes

- `qa/epoch-world` is a new owned surface. It is NOT yet registered as a managed
  module in `architecture-policy.yaml` (the desktop journey
  `qa/epoch-desktop` is registered as `epoch-desktop-journey`; `qa/epoch-gltf`
  is noted as unmanaged). Registering `qa/epoch-world` as a managed module
  (`epoch-world`, requires the four frozen epoch contracts:
  `epoch-renderer-babylon`, `epoch-renderer-three`, `epoch-world-presentation`,
  `epoch-renderer-contract`) would let `architecture:check` enforce the boundary
  on this surface too. Left as a TL proposal — shared config is TL-owned.
- The desktop journey is honestly SKIPPED in this environment. To close it on a
  real host: install without `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (or run
  `pnpm rebuild electron` with a reachable mirror), ensure `DISPLAY` (real or
  Xvfb), then `node qa/epoch-world/journey-desktop.mjs`. The harness is complete
  and will produce `evidence/desktop/01-open.png`…`08-measure.png` + manifest.
- The equivalence battery (NullEngine) is the strongest renderer-replaceability
  proof available without a real GPU; it exercises the real adapter
  intersection/mapping code through both renderers' public entrypoints. A
  real-GPU visual equivalence (same entityId resolved through real Babylon WebGL
  + real Three WebGL) would be a future strengthening, not a replacement.
