# @zcode/epoch-engineering-objective (W035)

Engineering automation and abundance evaluation as typed data plus
deterministic machines. This package has **no execution authority**: it is a
read-only measurement layer over lifecycle/evidence records owned by the
frozen packages (W020 verification battery, W022 lifecycle, W024 agent
tools, W031 capability reproduction, W032 capability learning, W033
cost/quality frontier). Records from those packages are referenced **by
digest only** — this package is never a second semantic authority.

## Laws (see `src/contract.ts`)

- hash: SHA-256 exclusively via `node:crypto` `createHash("sha256")`
- canonical: every digest is computed over `canonicalJson` (sorted keys)
- denominator: task denominators are explicit data; unlisted classes never count
- quality: unverified outputs never count as quality
- intervention gate: fewer interventions are progress only with acceptable
  verified quality and no hard-constraint safety regression
- visibility: human and arena task executions stay visible and are never
  counted as automated successes
- feasibility gate: lower-cost abundance claims require feasible solutions
- determinism: pure functions of inputs; timestamps are inputs, never generated

## Artifacts

`src/module.ts` is the module manifest; `src/contract.ts` is the contract
home (public entrypoints + laws). `src/index.ts` re-exports exactly the
public contract — asserted by `test/contract.test.ts`.

## Build / test

    pnpm --filter @zcode/epoch-engineering-objective build
    pnpm --filter @zcode/epoch-engineering-objective test

## QA harness

    node qa/epoch-engineering-abundance/run.mjs   # after building the package
