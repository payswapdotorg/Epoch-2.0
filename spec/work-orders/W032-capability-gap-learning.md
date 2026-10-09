# W032 — Capability-gap learning and promotion

## Dependency
W029 + W030 + W023.

## Owned surfaces
- packages/epoch-capability-learning/**
- qa/epoch-capability-learning/**

## Goal
Reduce future human intervention by converting verified demonstrations and outcomes into versioned skills, workflows, adapter improvements or capabilities with explicit reuse permissions.

## Deliverables
- gap record and classifier;
- routing to evidence request, environment repair, existing capability, demonstration, reproduction or expert escalation;
- candidate extraction and held-out replay;
- project-local, organization-shared and public reuse policies;
- approval, rollback and autonomy promotion;
- regression monitoring.

## Acceptance
- A human intervention proposes a candidate but never auto-promotes it.
- Candidate is tested on the original and at least one held-out representative case.
- Permissions and rights control all reuse.
- Measurement includes quality/safety and intervention cost, not only intervention count.
- Failure to generalize remains explicitly scoped or rejected.
