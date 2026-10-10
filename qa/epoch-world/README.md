# qa/epoch-world — W020 Verification and Evidence Battery

The standing verification and evidence battery for the Epoch visualization-first
milestone. It proves the product journey through **both merged hosts** (Web W005

- Desktop W006) and the renderer replaceability/portable-state invariants
  through **both merged renderers** (Babylon W004 + Three W008), with a
  machine-checkable evidence convention and an honest environment capability
  matrix.

This is the repo's permanent acceptance machinery: a check that cannot run
honestly is reported **SKIPPED with its blocker**, never silently passed.

## Layout

| File                            | Role                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `contract.ts`                   | Typed evidence convention + environment matrix + battery report shapes (the script contract).            |
| `module.ts`                     | Module manifest (requires the frozen renderer/presentation contracts read-only).                         |
| `world-presentation-fixture.ts` | The shared deterministic WorldPresentation — the **equivalence partner** mounted through both renderers. |
| `equivalence.test.ts`           | Renderer equivalence checks (node:test; NullEngine/headless real adapter paths).                         |
| `journey-web.mjs`               | Real-Chromium Web host journey (W005 pattern) — full visual journey + per-step evidence.                 |
| `journey-desktop.mjs`           | Real-Electron Desktop host journey (W006 pattern) — SKIPPED honestly when the Electron binary is absent. |
| `journey-helpers.mjs`           | Shared journey helpers (keeps each journey under the 400-line lint cap).                                 |
| `environment-matrix.ts`         | Honest environment capability matrix (probes real Chromium/Electron/display/network).                    |
| `evidence-check.mjs`            | Typed convention checker — FAILS when a referenced evidence file is missing or unlabeled.                |
| `run-battery.mjs`               | Orchestrator — runs all four checks, emits `battery-report.json` (pass/fail/skip).                       |
| `evidence/web/`                 | Web journey screenshots + `manifest.json`.                                                               |
| `evidence/desktop/`             | Desktop journey screenshots + `manifest.json`.                                                           |

## The evidence convention (machine-checkable)

Every acceptance item is an `EvidenceItem` with:

- a **named evidence file** (screenshot, or recording where the environment
  permits) under `evidence/<host>/`;
- a **caption law** — what MUST be visible in the evidence for the item to pass;
- an **environment qualification** — `gpu` (real/software), `hostRuntime`
  (real/headless/null-engine), `network` (real/offline) + a free-form note;
- a **verdict** — `pass` | `skip` | `fail`. A `skip` MUST carry a `skipReason`.

`evidence-check.mjs` reads the journey manifests and FAILS (exit 1) when any
PASS item references a missing file or is unlabeled, or any FAIL item exists.

## The honest environment capability matrix

`environment-matrix.ts` probes the actual environment rather than assuming it:

- **real-GPU vs software**: this sandbox has no real GPU; the honest answer is
  `software` (SwiftShader / NullEngine). A real-GPU run would self-declare
  `real`.
- **real-Electron vs headless**: a real Electron window requires the Electron
  binary (`node_modules/electron/dist/electron`) + a display (real or Xvfb).
  When `ELECTRON_SKIP_BINARY_DOWNLOAD=1` was used at install and the Electron
  mirror is unreachable, the binary is absent and the desktop journey
  self-declares SKIPPED with its blocker.
- **networked vs offline**: the construction fixture is client-side/network-free
  (invariant #17), so the journey is always `offline`. Network is only probed to
  qualify whether an absent Electron binary COULD be fetched.

## How to run (repo root)

```bash
# 1. Renderer equivalence (NullEngine/headless — no GPU/browser needed):
node --test qa/epoch-world/equivalence.test.ts

# 2. Web host journey (real Chromium — needs cached Playwright Chromium):
pnpm --filter @zcode/web dev   # port 5173, in another shell
node qa/epoch-world/journey-web.mjs

# 3. Desktop host journey (real Electron — needs the binary + display):
node qa/epoch-world/journey-desktop.mjs

# 4. Evidence convention checker:
node qa/epoch-world/evidence-check.mjs

# 5. Full battery (runs all four + writes battery-report.json):
node qa/epoch-world/run-battery.mjs
```

## Boundaries (ownership)

This battery consumes the frozen public entrypoints of
`@zcode/epoch-renderer-babylon`, `@zcode/epoch-renderer-three`,
`@zcode/epoch-world-presentation` and `@zcode/epoch-renderer-contract`
**read-only**. It never edits `packages/**`, `qa/epoch-web/**`,
`qa/epoch-desktop/**`, `qa/epoch-renderer-babylon/**`,
`qa/epoch-renderer-three/**`, or `qa/epoch-visual-closure/**` (all read-only
pattern references). The only `spec/` file it owns is
`spec/acceptance/evidence-ledger.md`.

## Proposal for the TL

`qa/epoch-world` is not yet registered as a managed module in
`architecture-policy.yaml` (the desktop journey `qa/epoch-desktop` is registered
as `epoch-desktop-journey`; `qa/epoch-gltf` is noted as unmanaged). Registering
`qa/epoch-world` as a managed module (`epoch-world`, requires the four frozen
epoch contracts) would let `architecture:check` enforce the boundary on this
surface too. Left as a TL proposal — shared config is TL-owned.
