# Upstream ZCode Boundary

## Pinned base

Epoch-2.0 starts from the `payswapdotorg/Epoch-2.0` fork of `zai-org/ZCode` at commit:

`29628c9acdb81b703bbd4080c207a0e7ce5e276e`

This is the ZCode v3.14.3 open-source baseline.

## Reuse directly

The following are deliberate foundations:

- workspace/session/task model;
- side-pane/surface lifecycle;
- Browser and Terminal opening patterns;
- Web client;
- Desktop host;
- shared UI and design system;
- services/RPC/client boundaries;
- platform dependency injection;
- Agent CLI/runtime;
- architecture-policy tooling;
- logging and operational conventions.

## Extend rather than fork

Epoch should add its capabilities through new packages/modules and small, explicit changes to inherited workbench surfaces.

Preferred direction:

```
ZCode Workbench
     +
Epoch Surface Registry
     +
Epoch Solution Surface
     +
Epoch Engineering Capabilities
```

## Do not import from the old Epoch repository

The previous `payswapdotorg/Epoch` repository is historical reference material only.

Do not transplant its web/desktop application architecture, W071/W072/W073 structure, or renderer-host hierarchy.

Validated ideas may be reimplemented under the contracts in this repository.

## Upstream reconciliation

Changes to ZCode-derived code must remain easy to reconcile with upstream.

When possible:
- minimize unrelated churn;
- isolate Epoch changes by package/feature;
- do not rewrite shared ZCode files solely for naming;
- document any intentional long-lived divergence.
