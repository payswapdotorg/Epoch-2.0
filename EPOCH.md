# Epoch

Epoch is an AI engineering workbench derived from the ZCode workbench substrate.

**This repository is the sole source of truth for Epoch architecture and implementation.**

## North star

Epoch progressively automates engineering work and searches for lower total lifecycle cost while preserving required quality, safety, reliability, durability and compliance. Reconstruction detail is conditioned on the work; connected software is a shared environment; capabilities that cannot be integrated adequately may be reproduced as qualified Epoch mini-apps; unresolved gaps flow to Arena. See [ACR-002](spec/architecture-change-requests/ACR-002-task-conditioned-reconstruction-capability-reproduction.md) and the [engineering abundance objective](spec/architecture/engineering-abundance-objective.md).

Start here:

1. [Epoch Architecture](spec/architecture/epoch-2.0-target.md)
2. [Architecture Lock](spec/architecture/ARCHITECTURE-LOCK.md)
3. [Authority Map](spec/architecture/authority-map.md)
4. [Contracts](spec/architecture/contracts/README.md)
5. [Work Orders](spec/work-orders.md)
6. [Development State](spec/development-state/README.md)
7. [TL Handoff](docs/TL-HANDOFF.md)
8. [Approved architecture changes](spec/architecture-change-requests/)
9. [Engineering abundance objective](spec/architecture/engineering-abundance-objective.md)

The product-reset decision is intentional: the old `payswapdotorg/Epoch` repository is a historical reference only. Do not copy its application structure. Reuse its validated architectural ideas only where they appear in this repository's locked specifications.

The first implementation milestone is visualization-first: open a construction solution from the same workbench mechanism used by Browser and Terminal, enter a believable navigable engineering world, and select semantic construction entities.

No architecture decision is valid unless it is reflected in the locked specifications and state files under `spec/`.
