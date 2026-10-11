import { describe, expect, it } from 'vitest';
import {
  createSceneCompositionEngine,
  describeLayerArcs,
  SCENE_USD_DESCRIPTOR,
  type SceneCompositionFeature,
} from '../src/index.js';

const FEATURES: SceneCompositionFeature[] = [
  'usda-parse',
  'layer-stack',
  'reference',
  'variant',
  'inherit',
  'payload',
  'opinions',
];

describe('provider-neutral composition contracts', () => {
  it('describe() declares all seven capability levels with honest values', () => {
    const d = createSceneCompositionEngine().describe();
    expect(d.id).toBe('epoch-scene-usd');
    expect(d.version).toBe(SCENE_USD_DESCRIPTOR.version);
    for (const f of FEATURES) {
      expect(Object.keys(d.capabilities)).toContain(f);
      const level = d.capabilities[f];
      expect(['native', 'partial', 'unsupported']).toContain(level);
    }
  });

  it('no feature claims native capability (no native OpenUSD binding — honest declarations)', () => {
    const d = createSceneCompositionEngine().describe();
    for (const f of FEATURES) {
      expect(d.capabilities[f]).not.toBe('native');
      expect(d.capabilities[f]).toBe('partial');
    }
  });

  it('descriptor records authority, wire format and LIVRPS bounds', () => {
    const d = createSceneCompositionEngine().describe();
    expect(d.authority).toBe('representation-and-composition-only');
    expect(d.wireFormat).toBe('.usda (bounded text subset)');
    expect(d.notes['livrps'] ?? '').toContain('Local');
    expect(d.notes['livrps'] ?? '').toContain('Inherits');
    expect(d.notes['livrps'] ?? '').toContain('specializes');
  });

  it('describe() is stable across calls and engine instances', () => {
    const a = createSceneCompositionEngine().describe();
    const b = createSceneCompositionEngine().describe();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('describeLayerArcs derives the ordered arcs of a layer (sublayer/reference/variant/inherit/payload)', () => {
    const arcs = describeLayerArcs({
      name: 'root',
      assetPath: 'root.usda',
      text: `#usda 1.0
(
    subLayers = [@sub.usda@]
)

def Xform "P" (
    inherits = </_C>
    payload = @big.usda@</Big>
)
{
    references = @r.usda@</R>
    variantSet "style" { "on" { float v = 1 } selected = "on" }
}
`,
    });
    const kinds = arcs.map((a) => a.kind);
    expect(kinds).toEqual(['sublayer', 'inherit', 'payload', 'reference', 'variant']);
    expect(arcs[0]?.assetPath).toBe('sub.usda');
    expect(arcs[3]?.targetPrimPath).toBe('/R');
    expect(arcs[4]?.variantSet).toBe('style');
    expect(arcs[4]?.variantSelection).toBe('on');
    expect(arcs.every((a) => a.declaringLayer === 'root')).toBe(true);
  });

  it('composed scenes expose ordered layer summaries with arcs and digests', () => {
    const scene = createSceneCompositionEngine().compose([
      { name: 'main', text: '#usda 1.0\n\ndef Xform "A" { float v = 1 }\n', assetPath: 'main.usda' },
    ]);
    expect(scene.schema).toBe('epoch-scene-usd/composed-scene/1');
    expect(scene.layers[0]?.textDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(scene.layers[0]?.arcs).toEqual([]);
  });
});
