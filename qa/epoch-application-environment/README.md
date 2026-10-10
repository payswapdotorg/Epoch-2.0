# qa/epoch-application-environment — W028 Application Environment Fabric

Acceptance harness for **W028 — External Application Environment Fabric**.

Coverage maps 1:1 to `spec/work-orders/W028-application-environment-fabric.md`
acceptance bullets. Each test file is named after the bullet it covers; each
`test(...)` block names the path it asserts.

## Run

```bash
node --test --experimental-strip-types qa/epoch-application-environment/*.test.ts
# or
pnpm --filter @zcode/epoch-environment-surface test   # surface + contract unit tests
pnpm --filter @zcode/epoch-application-environment test # contract/registry unit tests
node qa/epoch-application-environment/run-acceptance.mjs
```

The acceptance tests import `packages/epoch-application-environment/src/index.ts`
and `packages/epoch-environment-surface/src/index.ts` via relative paths —
Node 24's native TypeScript stripping executes them directly. The
`fake-provider.ts` helper is a deterministic fake `EnvironmentProvider` + fake
`EnvironmentSession` used by all acceptance tests.

## Acceptance mapping table

| Acceptance bullet (W028 spec)                                                                   | Test file                                       | Test cases                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demonstrate a real attached or safely simulated session, clearly labeling simulation.           | `acceptance-1-simulation.test.ts`               | simulated labeled `[simulated]` + `tab.simulation=true`; real no prefix; attach failure NOT silently downgraded to simulation                                                                                                                                                                                                                                                                                                                |
| A provider registers through descriptors rather than a new workbench surface type.              | `acceptance-2-descriptor-registration.test.ts`  | two providers share `type="application-environment"`; unregistered providerId rejected; `registry.list()` in order                                                                                                                                                                                                                                                                                                                           |
| Human and agent share task/session context with distinct initiators and permissions.            | `acceptance-3-shared-context.test.ts`           | human/agent same task → distinct sessions; human observe-only CAN control; agent observe-only CANNOT; agent confirmation-mode CAN control                                                                                                                                                                                                                                                                                                    |
| Read/observe permission never implicitly grants mutation.                                       | `acceptance-4-observe-no-mutation.test.ts`      | observe-only agent denied control+semantic (mode-denied even when capability available); suggest mode same; `available=false` denies even human + full mode; not-declared operation rejected                                                                                                                                                                                                                                                 |
| Credentials/unrelated sensitive windows are excluded from agent context by default.             | `acceptance-5-sensitive-data.test.ts`           | DEFAULT policy `default-exclude` + `excludeCredentials=true`; `shouldExposeWindowToAgent` rules; controller rejects wider policy than descriptor needs; `excludeCredentials=false` requires `full-trust`; `isCredentialField` detects password/token/secret/apikey/cookie/authorization                                                                                                                                                      |
| Existing Browser/Terminal behavior remains intact.                                              | `acceptance-6-existing-surfaces-intact.test.ts` | controller only produces `application-environment` tabs; close only removes its own identity mapping; activate is no-op on already-active; activate throws on unknown tabId; static type/lint invariants documented (covered by `pnpm typecheck` + `pnpm lint`)                                                                                                                                                                              |
| Tests cover attach, detach, lost connection, stale session, denied permissions and remote host. | `acceptance-7-lifecycle-remote-denied.test.ts`  | attach: `provider.attach()` called + tab created + `health=attached/ok`; detach: `session.detach()` called + tab removed + second close no-op; lost-connection: `forceLost` fires + `health.status=lost` + control denied; stale-session: `forceStale` + reuse-no-fresh-attach; denied-permissions: `provider.attach` throws → controller.open throws + no tab; remote-host: `runtime=remote` + `remoteHost` propagated + unreachable throws |

## Static invariants (verified by `pnpm typecheck` + `pnpm lint`, not repeated here)

- `WorkspaceSidePaneTab` union includes `ApplicationEnvironmentSidePaneTab`
  alongside `browser`/`terminal`/`solution`/`git`/`code-viewer`/... (existing
  branches unchanged) — `packages/ui/src/lib/workspaceSidePane.ts`.
- `useAppPanels` returns `handleOpenApplicationEnvironmentTab` alongside
  existing handlers; existing handlers unchanged — `packages/ui/src/hooks/useAppPanels.ts`.
- `SidePaneTabTrigger` and `sidePaneTabPresentation` add
  `application-environment` branches; existing branches unchanged.

Full Browser/Terminal runtime behavior is verified by the visual-integration
suite (W007) and the inherited side-pane tests in `packages/ui` — neither is
in W028 ownership, so this harness only asserts the W028 boundary invariants
above.
