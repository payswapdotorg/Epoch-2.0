# Visualization-First Acceptance

## Governing criterion

A user can open an engineering solution from Epoch's workbench and enter a believable, navigable construction world.

## Required journey

1. Start Epoch Web.
2. Start/enter an existing task/workspace.
3. Open Solution like Browser or Terminal.
4. See the construction world without navigating through a dashboard.
5. Orbit, pan and zoom.
6. Select a wall, column, beam or MEP element.
7. The canonical semantic entity is shown.
8. Inspector reflects that entity.
9. Hide/isolate at least one construction layer.
10. Measure or annotate an element.
11. Open Plan or Section when supported.
12. Repeat on Desktop.

## Renderer criterion

The same WorldRevision and semantic IDs must work through Babylon and, after W008, Three.js.

## Non-acceptance

Any of the following fails the milestone:
- a dashboard is the primary surface;
- the world is a tiny decorative panel;
- geometry is abstract enough that the construction problem is not recognizable;
- clicking an object produces only a renderer-local identifier;
- adding an engine requires adding a new UI surface type;
- unit tests pass but a real product journey is not demonstrated.

## Evidence

UI work requires real product screenshots or recordings from the actual target host. Headless-only evidence may supplement but never replace the product journey requirement.
