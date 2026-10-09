# Epoch Public Contracts

The following contracts form the stable seams between the workbench and engineering capabilities.

- `solution-surface.md` — how engineering solutions are opened and represented as workbench surfaces.
- `reconstruction-engine.md` — how reconstruction engines are registered and opened.
- `world-model.md` — semantic engineering world contract.
- `world-presentation.md` — renderer-neutral presentation contract.
- `renderer.md` — interactive renderer adapter contract.
- `interaction.md` — typed interaction path from renderer/UI to semantic operations.
- `task-conditioned-reconstruction.md` — task-specific fidelity and information sufficiency.
- `application-environment.md` — shared external application sessions and generic mini-app surface.
- `environment-activity-and-demonstrations.md` — provenance-bearing activity and demonstration capture.
- `capability-reproduction-factory.md` — governed creation of Epoch-native capability mini-apps.
- `capability-quality-and-rights-gates.md` — task benchmarks, rights review and release gates.
- `capability-gap-learning.md` — gap-to-candidate-to-qualified-capability lifecycle.
- `arena-escalation.md` — expert task/return packages and learnback boundary.

### Contract rule

Types may be split across multiple source files for architecture-policy limits, but they must preserve the boundaries and ownership documented here.

Engine-specific types belong in adapters.

UI code consumes these contracts and never imports engine implementation details.
