# qa/epoch-engineering-abundance (W035)

Read-only QA harness for `@zcode/epoch-engineering-objective`.

## Run

    pnpm --filter @zcode/epoch-engineering-objective build
    node qa/epoch-engineering-abundance/run.mjs

The harness:

1. asserts the package's public contract (runtime exports match
   `src/contract.ts` exactly — 54 runtime names);
2. builds a full fixture scenario: explicit denominator, completions,
   verified quality, baseline + intervention, executions (automated/human),
   capability reuse, safety, predicted-vs-actual variance, a five-stage
   end-to-end case with a limitations report;
3. runs `evaluateAbundance` twice and asserts identical input and
   evaluation digests (determinism law);
4. asserts the typed laws on the fixture (visibility of human tasks,
   intervention quality gate, feasibility-gated lower-cost claim);
5. prints a measurement summary. Exits 0 on success, non-zero on failure.
