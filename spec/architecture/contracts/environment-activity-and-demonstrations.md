# Environment Activity and Demonstration Contract

## Purpose

With explicit consent and appropriate permissions, Epoch captures enough of a human/agent workflow in a connected application to correlate actions, decisions and outcomes. Activity is evidence, not automatic proof of intent, correctness or permission to train a model.

## Event envelope

Record where available: event ID and sequence; workspace/project/task/environment/session; timestamp and ordering confidence; initiator (human/agent/application/OS/unknown); event class; operation and target; before/after state or revision digest; evidence references (frame, UI node, application event, document revision or output); consent/permission basis; redaction status; provenance; and result/failure/cancelled/unknown state.

Use semantic identifiers only when reliable. Raw coordinates and UI details remain evidence, not semantic identity. A click alone cannot prove that an engineering mutation succeeded.

## Demonstration episode

Group relevant events around task/outcome, preconditions, initial state, human choices, app state transitions, errors/corrections, explicit user explanation, resulting state, verification evidence and known ambiguity. Explicit user explanations are stronger evidence of intent than agent inference; inferred rationale must be labeled.

## Capture modes

- SESSION_OFF: minimum operational/security telemetry only.
- OBSERVE_ONLY: authorized signals may inform the active task but are not reusable demonstrations absent separate permission.
- PROJECT_TRACE: retain scoped trace/evidence for this project and retention period.
- REUSABLE_CANDIDATE: allow a human-approved episode to enter evaluation for reuse, subject to rights and policy.

Show visible attached/recording state. Allow pause/stop, inspect, redact, delete and retention controls. Exclude or redact unrelated windows, credentials, private content and sensitive material by default. Attachment or observation consent does not imply model-training or cross-project reuse permission.

## Completeness

Expose source coverage and observed intervals. Lost focus, unsupported events, dropped frames, bridge disconnection and off-screen operations must become explicit gaps. A later document diff may prove that a change occurred without proving who performed it or why.

## Learning boundary

Episodes may suggest a workflow, skill, adapter improvement or evaluation case, but never directly mutate authoritative world state, increase privileges or train/promote an agent. Promotion requires rights/privacy review, bounded preconditions, repeatable replay where possible, expected-output and failure tests, engineering verification, appropriate risk review, versioning and rollback.

## Acceptance

Capture one supported workflow, distinguish human/agent/application events, correlate output with a world/document revision, represent an intentional observation gap honestly and prove capture can be paused and retained evidence inspected or removed.
