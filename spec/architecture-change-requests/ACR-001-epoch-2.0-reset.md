# ACR-001 — Epoch 2.0 Architecture Reset

**Status:** APPROVED / EFFECTIVE  
**Date:** 2026-10-07  
**Repository:** payswapdotorg/Epoch-2.0

## Decision

Replace the prior Epoch application architecture with a new Epoch architecture implemented from the ZCode fork.

ZCode is retained as the workbench substrate. The previous payswapdotorg/Epoch repository is historical reference only.

## Why

The previous Epoch program reached a construction-world milestone but had accumulated application-specific world/runtime structure. Starting from ZCode provides a mature workbench with the correct tab/surface lifecycle, desktop/web hosts, Agent runtime, service boundaries and side-pane patterns.

The new product should make the engineering world a first-class workbench surface rather than a separate application shell.

## Authorized architecture

See:

- spec/architecture/epoch-2.0-target.md
- spec/architecture/ARCHITECTURE-LOCK.md
- spec/architecture/authority-map.md
- spec/architecture/contracts/

## First implementation law

Visualization is implemented before the remaining engineering lifecycle.

The first usable vertical is:

- Solution Surface;
- deterministic construction fixture engine;
- Babylon renderer;
- Web + Desktop host;
- real navigation/selection/inspection evidence.

## Explicit non-goals of the first vertical

- IFC/IfcOpenShell;
- OCCT;
- OpenUSD;
- Blender;
- ParaView;
- Cesium;
- full lifecycle;
- autonomous discovery;
- human escalation;
- marketplace/productization.

These remain in the work-order roadmap.

## Migration rule

No code from the previous Epoch application is copied by default. A concept is admitted only when it is represented by a current Epoch contract and work order.

## Concurrency authorization

Maximum three workers. Workers must have pairwise-disjoint ownership. Workers never merge. The TL owns integration, acceptance and state.
