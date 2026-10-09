# W030 — Capability quality lab and reference benchmarks

## Dependency
W020 + W023 + W027.

## Owned surfaces
- packages/epoch-capability-evaluation/**
- qa/epoch-capability-evaluation/**

## Goal
Build repeatable task-specific evaluation for existing, learned and reproduced capabilities. “Top tier” must be backed by declared suites and metrics, not aesthetic opinion or a one-off demo.

## Deliverables
- qualification status vocabulary;
- versioned benchmark descriptors and corpus provenance;
- appropriate metrics for correctness, engineering tolerances, coverage, reliability, performance, recovery, UX/accessibility and lifecycle cost;
- differential conformance harness;
- known-limit reporting and version drift/regression checks;
- capability release gate.

## Acceptance
- Capability classes select appropriate metrics rather than a misleading universal score.
- Hard constraints cannot be traded away for cost or speed.
- Rights-unclear or unrepeatable benchmark corpora are rejected.
- Reports distinguish prototype, named-task qualified, reference-comparable and reference-superior.
- Results are reproducible and preserve reference/capability versions.
