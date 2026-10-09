# Epoch Architecture

This directory defines the target architecture for Epoch 2.0.

## Reading order

- `epoch-2.0-target.md` — complete target architecture and phased evolution.
- `ARCHITECTURE-LOCK.md` — binding invariants and forbidden shortcuts.
- `authority-map.md` — semantic/data/state authority ownership.
- `contracts/README.md` — public boundary contracts.
- `upstream-zcode.md` — what is inherited from ZCode and what is deliberately not inherited.
- `engineering-abundance-objective.md` — the cost/quality frontier and long-term automation objective.
- `../architecture-change-requests/ACR-002-task-conditioned-reconstruction-capability-reproduction.md` — task-conditioned fidelity, application environments, capability reproduction and abundance.

## Rule

The architecture is contract-first. Implementation may use different internal files than examples in these documents, but the public boundaries, ownership, dependency direction, and acceptance behavior must remain equivalent.

A change to a locked invariant requires a new Architecture Change Request in `spec/architecture-change-requests/` before implementation.
