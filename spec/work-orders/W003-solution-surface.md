# W003 — Solution Surface Workbench Integration

## Dependency

W001 complete.

## Owned surfaces

- shared Epoch Solution Surface module;
- ZCode packages/ui integration only;
- tests for the shared surface lifecycle.

Do not implement a reconstruction engine or renderer in this work order.

## Goal

Make Solution open/activate/close/reopen using the same workbench lifecycle pattern as Browser and Terminal.

## Requirements

- one solution surface/tab discriminant;
- engineId/sessionId/solutionId identity;
- idempotent open;
- recent-close/reopen semantics where inherited lifecycle supports it;
- title/icon/search presentation;
- no branching on concrete engine implementation;
- no renderer classes in shared UI;
- dependency injection for runtime services.

## Acceptance

A fake registry/session can open the Solution surface without any engine-specific UI code.

Adding another reconstruction engine must not require another UI surface type.
