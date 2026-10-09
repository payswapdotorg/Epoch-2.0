# W028 — External Application Environment Fabric

## Dependency
W007 visual integration.

## Owned surfaces
- packages/epoch-application-environment/**
- packages/epoch-environment-surface/**
- packages/ui/src/lib/workspaceSidePane.ts
- packages/ui/src/hooks/useAppPanels.ts
- packages/ui/src/app-shell/WorkspaceShellLayout.tsx
- packages/ui/src/app-shell/SidePaneTabTrigger.tsx
- packages/ui/src/app-shell/sidePaneTabPresentation.ts
- qa/epoch-application-environment/**

## Goal
Attach to, observe and operate existing software through a generic environment/session/registry contract and workbench surface like Browser/Terminal.

## Deliverables
- environment descriptors, registry and session lifecycle;
- separate observation/control/semantic planes;
- screen/UI/native adapter seams with truthful capability levels;
- visible attach/detach/observation status;
- observe-only, suggest, confirmation and bounded-autonomy modes;
- local/remote boundaries and recovery/health status;
- generic surface registration with no per-vendor surface types;
- source-gap, unsupported-signal and sensitive-data handling.

## Acceptance
- Demonstrate a real attached or safely simulated session, clearly labeling simulation.
- A provider registers through descriptors rather than a new workbench surface type.
- Human and agent share task/session context with distinct initiators and permissions.
- Read/observe permission never implicitly grants mutation.
- Credentials/unrelated sensitive windows are excluded from agent context by default.
- Existing Browser/Terminal behavior remains intact.
- Tests cover attach, detach, lost connection, stale session, denied permissions and remote host.
