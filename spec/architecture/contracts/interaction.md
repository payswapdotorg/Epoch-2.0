# Solution Interaction Contract

## Principle

Every spatial user gesture becomes a typed Epoch interaction intent before it can affect semantic state.

## Flow

```
pointer / keyboard / tool call
       |
       v
renderer adapter normalization
       |
       v
Epoch interaction intent
       |
       v
semantic authority
       |
       +--> selection/focus
       +--> visibility
       +--> measurement
       +--> annotation
       +--> mutation (future)
```

## Initial intents

- `solution.navigate`
- `solution.select`
- `solution.focus`
- `solution.setLayerVisibility`
- `solution.measure`
- `solution.annotate`

Future intents can add:

- manipulation;
- simulation;
- intervention;
- approve/commit.

## Renderer neutrality

A typed intent must not contain Babylon/Three classes or handles.

## Measurement

Measurements reference semantic entity IDs and/or world coordinates. A renderer only supplies the observation needed to create the semantic measurement.

## Annotation

Annotations attach to semantic entities or stable world coordinates and may display through renderer-specific presentation.

## Acceptance

A click that selects a column must resolve to the canonical entity identifier for that column and drive every downstream projection from that identity.
