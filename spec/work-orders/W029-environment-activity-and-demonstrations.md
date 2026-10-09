# W029 — Environment activity and demonstrations

## Dependency
W028 + W021.

## Owned surfaces
- packages/epoch-environment-activity/**
- qa/epoch-environment-activity/**

## Goal
Capture authorized human/agent activity in application environments and group episodes into demonstrable workflows without silently treating all activity as training data.

## Deliverables
- typed sequenced EnvironmentEvent;
- source coverage, gap, redaction and consent metadata;
- explicit human/agent/application initiator;
- state/result correlation and evidence references;
- demonstration boundaries and user-stated versus inferred intent;
- pause/inspect/redact/retention integration;
- candidate export to capability learning.

## Acceptance
- A supported or clearly labeled simulated workflow produces a trace correlated with resulting document/world revision.
- Lost/unobserved events are not represented as a complete sequence.
- Capture can be inspected and paused; unrelated sensitive data is excluded/redacted.
- Retention and cross-project reuse are separate permissions.
- Activity does not directly mutate world truth or auto-promote a capability.
