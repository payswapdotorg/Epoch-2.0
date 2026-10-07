# Epoch Public Contracts

The following contracts form the stable seams between the workbench and engineering capabilities.

- `solution-surface.md` — how engineering solutions are opened and represented as workbench surfaces.
- `reconstruction-engine.md` — how reconstruction engines are registered and opened.
- `world-model.md` — semantic engineering world contract.
- `world-presentation.md` — renderer-neutral presentation contract.
- `renderer.md` — interactive renderer adapter contract.
- `interaction.md` — typed interaction path from renderer/UI to semantic operations.

### Contract rule

Types may be split across multiple source files for architecture-policy limits, but they must preserve the boundaries and ownership documented here.

Engine-specific types belong in adapters.

UI code consumes these contracts and never imports engine implementation details.
