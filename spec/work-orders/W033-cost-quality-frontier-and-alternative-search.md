# W033 — Cost/quality frontier and alternative search

## Dependency
W027 + W030.

## Owned surfaces
- packages/epoch-cost-quality-search/**
- qa/epoch-cost-quality-search/**

## Goal
Find cheaper/faster engineering solutions while preserving mandatory requirements. Optimize a feasible solution space rather than producing an unqualified cheapest answer.

## Deliverables
- baseline and candidate alternatives with separate revision identity;
- hard constraints and weighted preferences;
- lifecycle cost/time with source/date/currency/uncertainty;
- alternative generation through registered capabilities;
- feasible/Pareto frontier and rejection reasons;
- verification/implementation plan and actual-versus-predicted outcomes.

## Acceptance
- Any candidate failing a hard safety/code/performance/durability/client requirement is rejected regardless of price.
- Sources, assumptions, uncertainty and trade-offs are visible.
- Human and operating/maintenance cost is included when data permits.
- Baseline is never silently replaced.
- Tests prove both a lower-cost feasible candidate and a cheaper-but-invalid candidate rejected.
