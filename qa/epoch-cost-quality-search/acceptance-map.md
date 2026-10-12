# W033 acceptance map — @zcode/epoch-cost-quality-search

Mapping of the W033 task-packet bullets to the package's tests
(`src/*.test.ts`, run with `node --test dist/` after `tsc -b`).

| W033 bullet | Tests |
| --- | --- |
| 1. Baseline + alternatives with SEPARATE revision identity | generation.test.ts: "emits the baseline itself as an identity candidate with zero deltas"; "gives generated candidates their own revision identity while naming the baseline revision" |
| 2. Requirements model: hard constraints (ANY failure rejects regardless of price) + weighted preferences as data | frontier.test.ts: "rejects the cheapest candidate when any hard constraint fails, regardless of price"; "fails closed on missing constrained metrics and unit mismatches"; "never rejects a candidate for preference reasons (weights are data)"; "ranks the frontier by weighted preference score with deterministic tie-breaks" |
| 3. Cost model: source/date/currency/uncertainty, human + operating/maintenance, deterministic aggregation with explicit uncertainty propagation, no hidden rounding | cost.test.ts: all 7 tests (sums, per-category, conversions, unconvertible currencies, validation, duplicates/subject mismatch, invalid reporting currency/conversions) |
| 4. generateAlternatives composes DATA from registered capabilities, never invented behavior | generation.test.ts: "composes add candidates from registered capabilities only"; "composes replace candidates on metric overlap or requirement coverage"; "is deterministic across repeated generation"; "reports unknown baseline capability refs without inventing predictions"; capabilities.test.ts: all 6 tests |
| 5. evaluateFrontier: feasible/Pareto classification, typed rejections (violated constraint named; dominator named), deterministic ordering | frontier.test.ts: all 9 tests |
| 6. ImplementationPlan (commands as DATA) + ActualVersusPredicted (variance tracking, digest-versioned) | plan.test.ts: all 3 tests; outcomes.test.ts: all 5 tests |
| 7. Package laws: module.ts + contract.ts artifacts, node:crypto hashing, canonical serialization, no execution authority, line limits | contract.test.ts: all 3 tests; capabilities.test.ts: "computes registry digests insensitive to key order"; cost.test.ts rounding tests; outcomes.test.ts digest tests |

Gate checklist (to be executed by the station — see RUNBOOK in the work
delivery transcript):

1. `node scripts/check-workspace-freshness.mjs`
2. `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile`
3. `pnpm --filter @zcode/epoch-cost-quality-search exec tsc -b` (0 errors)
4. `pnpm lint` (clean for this package)
5. `pnpm fmt:check`
6. `pnpm architecture:check --changed` (with the proposed registration
   applied locally only, never committed)
7. `pnpm --filter @zcode/epoch-cost-quality-search exec node --test dist/`
   (expected: 40 pass / 0 fail)
