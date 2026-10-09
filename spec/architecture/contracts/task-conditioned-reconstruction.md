# Task-Conditioned Reconstruction Contract

## Purpose

The reconstructed world serves a declared task; it is not maximally detailed by default. Required geometry, semantics, material properties, evidence, time-state, tolerances and provenance depend on the decision and consequence of error.

A project has one canonical World Model. Different work types request different fidelity profiles against that same world. A profile is a sufficiency requirement and refinement plan, not a second world or parallel model.

## Intent and profile

A reconstruction intent declares project/task, work type and lifecycle stage, decisions to support, required outputs/validators, constraints, units, tolerances, jurisdiction/codes, consequence of error, acceptable uncertainty, known evidence and user overrides.

A profile defines minimum requirements for:
- geometric and dimensional accuracy;
- semantic classification and relationships;
- materials, assemblies and engineering properties;
- current condition and temporal relevance;
- site/system context;
- quantities and assumptions;
- provenance/confidence;
- mandatory validation and blocking unknowns.

Profiles are registered capabilities, can be composed for interdisciplinary tasks and can evolve independently of renderers. Conflicting requirements must be reconciled; applicable safety/regulatory requirements cannot be weakened by an informal preference.

## Progressive refinement

1. Build the best-supported initial world from available natural language, photographs, video, drawings, measurements, scans, documents, sensors and attached applications.
2. Normalize sources and preserve source, timestamp, scale, units, orientation and limitations.
3. Mark inferred, estimated, disputed and unknown information explicitly.
4. Select a profile for the next intended decision/action.
5. Check information sufficiency and identify which missing information could change the result.
6. Ask targeted questions, request new capture, inspect an authorized application or call a reconstruction capability only when it has material value.
7. Run required validators and return READY, CONDITIONALLY_READY, BLOCKED or INFORMATION_REQUESTED.
8. Refine when task, tolerance, evidence, risk or downstream operation changes.

Prioritize the next observation by expected value of information, cost to obtain it and risk reduction. Do not require all possible facts before low-risk exploratory work, but do not present exploratory outputs as validated designs.

## Initial profile examples

| Work type | Detail emphasized | Example readiness gate |
|---|---|---|
| Early feasibility | Broad dimensions, topology, use, site constraints, cost drivers, unknowns | Enough evidence to compare concepts; uncertainties remain ranges |
| BOQ/cost estimate | Measurable dimensions, assemblies, material/spec, rate source/date/location, waste assumptions | Quantities and assumptions traceable to the requested estimate class |
| Clash/coordination | Relevant system geometry, transforms, clearances, connectivity and revisions | Required systems meet stated tolerance and coverage |
| Structural analysis | Geometry, loads, supports, material properties, connections, combinations and codes | Mandatory inputs and analysis assumptions pass domain validation |
| Construction planning | Work breakdown, quantities, dependencies, resources, durations, access and calendars | Logic and blocking assumptions are explicit |
| Site verification | Current field condition, tolerances, hazards, access, planned-versus-actual evidence | Relevant work package can be verified with no blocking unknown |
| Asset operation | Asset identity, installed state, condition, service relations, maintenance and time history | Required asset data coverage and uncertainty are explicit |

These are starter profiles, not universal engineering rules. Domain packs must identify jurisdiction and method-specific requirements.

## Fitness states

- READY: mandatory inputs and validation gates pass for the named task.
- CONDITIONALLY_READY: work may proceed only within attached assumptions/bounds.
- BLOCKED: a fact or constraint prevents reliable/safe work.
- INFORMATION_REQUESTED: the next targeted evidence step is awaiting response.

An unknown must not be changed to confirmed merely to advance a task.

## Evaluation

Cover conflicting photo/drawing evidence, stale models, scale/unit errors, low-detail feasibility, high-detail follow-on analysis, missing safety inputs, profile changes and cases where more geometry has no decision value. All results must retain source and revision lineage.
