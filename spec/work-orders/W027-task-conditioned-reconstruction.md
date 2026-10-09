# W027 — Task-conditioned reconstruction and information sufficiency

## Dependency
W007 visual integration.

## Owned surfaces
- packages/epoch-reconstruction-policy/**
- qa/epoch-reconstruction-policy/**

The Tech Lead owns shared architecture-policy registrations. The worker supplies the module registration proposal and does not edit the shared policy file.

## Goal
Implement task-conditioned reconstruction profiles, progressive refinement and information sufficiency without introducing another world authority.

## Deliverables
- Typed ReconstructionIntent and ReconstructionProfile.
- Registry and work-type/task-to-profile resolution.
- Fitness states READY / CONDITIONALLY_READY / BLOCKED / INFORMATION_REQUESTED.
- Evidence/uncertainty-aware sufficiency evaluation.
- Value-of-information-based request ordering where feasible.
- Initial profiles for feasibility, BOQ, clash, structural analysis and site verification.
- Tests mapped to acceptance/task-conditioned-reconstruction.md.

## Acceptance
- Low-detail feasibility is not forced through a structural-grade model.
- Missing mandatory engineering inputs block unsafe conclusions.
- Missing/conflicting evidence remains visible and provenance-bearing.
- A profile can be added without modifying the renderer or World Model authority.
- Public contracts remain provider-neutral; tests and architecture checks pass.
