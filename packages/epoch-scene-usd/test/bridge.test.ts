import { describe, expect, it } from 'vitest';
import type { WorldRevision } from '@zcode/epoch-world-model';
import { createSceneCompositionEngine, projectToPresentationSeed, type ComposedScene } from '../src/index.js';

const MAIN = `#usda 1.0

def Xform "Stage" (
    references = @chairs.usda@</BChair>
)
{
    float x = 1
    float y = 2
    float z = 3
    string label = "stage"
    def Scope "Child" { float q = 4 }
}
`;
const CHAIRS = `#usda 1.0\n\ndef Xform "BChair" { float w = 5 def Scope "Seat" { float h = 1 } }\n`;

const engine = createSceneCompositionEngine();
const layers = [
  { name: 'main', text: MAIN, assetPath: 'main.usda' },
  { name: 'chairs', text: CHAIRS, assetPath: 'chairs.usda' },
];
const scene: ComposedScene = engine.compose(layers);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('world-model bridge: projection (derive-only)', () => {
  it('projects entity nodes with ids, parents, children and transforms', () => {
    const seed = projectToPresentationSeed(scene);
    expect(seed.kind).toBe('epoch-scene-usd/world-presentation-seed-projection');
    expect(seed.source).toBe('epoch-scene-usd');
    expect(seed.composedSceneDigest).toBe(scene.digest);
    const stage = seed.nodes[0];
    expect(stage?.id).toBe('/Stage');
    expect(stage?.parentId).toBeNull();
    expect(stage?.translate).toEqual([1, 2, 3]);
    expect(stage?.children.map((c) => c.id).sort()).toEqual(['/Stage/Child', '/Stage/Seat']);
    const seat = stage?.children.find((c) => c.id === '/Stage/Seat');
    expect(seat?.translate).toBeNull();
  });

  it('every projected property carries a provenance ref to the contributing layer/opinion', () => {
    const seed = projectToPresentationSeed(scene);
    const stage = seed.nodes[0];
    const label = stage?.properties.find((p) => p.name === 'label');
    expect(label?.provenance.layer).toBe('main');
    expect(label?.provenance.primPath).toBe('/Stage');
    expect(label?.provenance.via).toEqual([]);
    expect(label?.provenance.line).toBeGreaterThan(0);
    const seat = stage?.children.find((c) => c.id === '/Stage/Seat');
    const h = seat?.properties.find((p) => p.name === 'h');
    expect(h?.provenance.layer).toBe('chairs');
    expect(h?.provenance.via).toEqual(['reference @chairs.usda@</BChair>']);
  });

  it('layer provenance refs (name, assetPath, textDigest) are carried', () => {
    const seed = projectToPresentationSeed(scene);
    expect(seed.layers.map((l) => l.name)).toEqual(['main', 'chairs']);
    for (const l of seed.layers) expect(l.textDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is derive-only: a deep-frozen ComposedScene is untouched by projection', () => {
    const frozen = deepFreeze(engine.compose(layers));
    const before = frozen.canonical;
    const seed = projectToPresentationSeed(frozen);
    expect(frozen.canonical).toBe(before);
    expect(seed.composedSceneDigest).toBe(frozen.digest);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it('accepts an opaque read-only WorldRevision reference without reading or mutating it', () => {
    const revision = deepFreeze({ marker: 'opaque-world-revision' }) as unknown as WorldRevision;
    const seed = projectToPresentationSeed(scene, { sourceRevision: revision });
    expect(seed.hasSourceRevision).toBe(true);
    expect(Object.isFrozen(revision)).toBe(true);
    expect(seed.nodes.length).toBeGreaterThan(0);
    // The revision is never re-exported in the projection payload.
    expect(JSON.stringify(seed)).not.toContain('opaque-world-revision');
    const without = projectToPresentationSeed(scene);
    expect(without.hasSourceRevision).toBe(false);
  });

  it('projection is deterministic: identical scene -> identical projection JSON', () => {
    const a = JSON.stringify(projectToPresentationSeed(scene));
    const b = JSON.stringify(projectToPresentationSeed(scene));
    expect(a).toBe(b);
  });
});
