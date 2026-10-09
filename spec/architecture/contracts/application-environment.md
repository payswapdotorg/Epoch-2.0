# Application Environment Contract

## Purpose

An Application Environment lets a human and Epoch agent share a running external application or Epoch mini-app. It combines authorized observation, control, context and optional native semantic access; it is substantially more than a function-only integration.

## Descriptor and session

A registered descriptor states the capability/provider ID, supported application versions and runtimes, attachment/recovery lifecycle, observation/control/semantic capabilities, permissions, event sources, evidence quality, supported files, data policy, tested status and limitations.

A session binds environment/workspace/project/task identity, target application/process/window or remote host, active document/selection/viewport when available, permissions, event sequence, state digest, semantic bindings, session health and provenance. Credentials and unrelated sensitive content are excluded from agent context by default.

## Separate planes

**Observation:** screen/frame, focus, accessibility/UI tree, active document, selections, supported app events, document metadata, semantic snapshots, file changes and outcomes.

**Control:** focus/restore, mouse/keyboard, clipboard, UI-element action, application command, open/save/export and supported native API/plugin calls.

**Semantic:** mapping provider objects/actions to Epoch concepts with binding method, confidence, external key, document version and source evidence.

A provider declares the actual support per operation. Screen coordinates are not semantic identity, and a click is not proof of successful mutation.

## Capability ladder

1. Screen observation and input.
2. UI-aware controls/actions.
3. Application events and change detection.
4. Native APIs, plugins, commands or SDKs.
5. Semantic application objects and operations.
6. Bindings to the canonical Epoch World Model.
7. Coordinated workflows spanning multiple environments.

Only tested levels may be advertised. Gaps, lost events and approximations remain visible.

## Workbench integration

Use a generic registered environment/capability surface that supports open, activate, close, restore and status like Browser/Terminal. Adding a provider must not require an app-specific shell, tab type or UI. Reuse the inherited workbench, platform boundaries and surface lifecycle. Browser and Terminal remain intact; they can adopt common contracts progressively rather than being rewritten prematurely.

Factory mini-apps must be real human workspace surfaces with structured agent-visible state and typed actions subject to the same permissions. A hidden endpoint behind an unrelated UI is not sufficient.

## Permissions, safety and lifecycle

- Explicitly authorize attachment and observation; make attached/recording status visible.
- Separate observe/read from control, document mutation, deletion, export and publication.
- Support observe-only, suggest, act-with-confirmation and bounded-autonomy modes.
- Require confirmation for destructive, irreversible or high-consequence actions unless an explicit policy authorizes them.
- Use undo/checkpoints/temporary variants where supported.
- Isolate untrusted adapters and native code at declared process/worker/remote boundaries.
- Apply least privilege, tenant/project isolation, secret redaction, retention controls and auditable provenance.
- Respect supported mechanisms, access controls, license terms and organizational policy.
- Detach cleanly without deleting the source application's data.

## Authority

Environment state and event traces are evidence/capabilities. Validated changes flow through Epoch's canonical world/verification contracts; an external application is not a second Epoch world or lifecycle authority.
