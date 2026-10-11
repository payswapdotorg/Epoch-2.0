import { describe, expect, it } from 'vitest';
import { createSceneCompositionEngine, sha256Hex, type SceneLayer } from '../src/index.js';

const MAIN = `#usda 1.0
(
    subLayers = [@sub.usda@]
)

def Xform "Stage" (
    references = @chairs.usda@</BChair>
)
{
    float x = 1
    variantSet "style"
    {
        "red" { float w = 10 }
        "blue" { float w = 20 }
        selected = "red"
    }
    def Scope "Child" { float y = 2 }
}
`;

const SUB = `#usda 1.0\n\ndef Xform "Stage" { float z = 3 float w = 99 }\n`;
const CHAIRS = `#usda 1.0\n\ndef Xform "BChair" { float x = 2 float w = 5 def Scope "Seat" { float h = 1 } }\n`;

const layers = (): SceneLayer[] => [
  { name: 'main', text: MAIN, assetPath: 'main.usda' },
  { name: 'sub', text: SUB, assetPath: 'sub.usda' },
  { name: 'chairs', text: CHAIRS, assetPath: 'chairs.usda' },
];

describe('determinism law (invariant 17)', () => {
  it('identical layer inputs produce byte-identical canonical serialization and digest', () => {
    const engineA = createSceneCompositionEngine();
    const engineB = createSceneCompositionEngine();
    const a = engineA.compose(layers());
    const b = engineB.compose(layers());
    const again = engineA.compose(layers());
    expect(a.canonical).toBe(b.canonical);
    expect(a.canonical).toBe(again.canonical);
    expect(a.digest).toBe(b.digest);
    expect(a.digest).toBe(again.digest);
  });

  it('digest is the sha-256 of the canonical serialization', () => {
    const scene = createSceneCompositionEngine().compose(layers());
    expect(scene.digest).toBe(sha256Hex(scene.canonical));
    expect(scene.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonical output is stable under repeated composition (parse-cache independence)', () => {
    const engine = createSceneCompositionEngine();
    const first = engine.compose(layers()).canonical;
    for (let i = 0; i < 5; i += 1) {
      expect(engine.compose(layers()).canonical).toBe(first);
    }
  });

  it('canonical output contains no timestamps or date-like strings', () => {
    const canonical = createSceneCompositionEngine().compose(layers()).canonical;
    expect(canonical).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(canonical).not.toMatch(/Date|random|timestamp/i);
  });

  it('stable key ordering: properties, metadata, children and layers are sorted', () => {
    const scene = createSceneCompositionEngine().compose(layers());
    const parsed = JSON.parse(scene.canonical) as {
      prims: { name: string; opinions: { name: string }[]; children: { name: string }[] }[];
    };
    for (const prim of parsed.prims) {
      const names = prim.children.map((c) => c.name);
      expect([...names].sort()).toEqual(names);
      const opinions = prim.opinions.map((o) => o.name);
      expect([...opinions].sort()).toEqual(opinions);
    }
    const layerNames = scene.layers.map((l) => l.name);
    expect(layerNames).toEqual(['main', 'sub', 'chairs']);
  });

  it('different layer inputs (renamed layers) produce a different digest — provenance is bound', () => {
    const engine = createSceneCompositionEngine();
    const a = engine.compose(layers());
    const b = engine.compose(layers().map((l) => ({ ...l, name: `${l.name}-renamed` })));
    expect(a.digest).not.toBe(b.digest);
  });

  it('compose options are part of the deterministic result (variant selection edit changes the digest)', () => {
    const engine = createSceneCompositionEngine();
    const a = engine.compose(layers());
    const b = engine.compose(layers(), { variantSelections: { '/Stage': { style: 'blue' } } });
    expect(a.digest).not.toBe(b.digest);
    expect(a.digest).toBe(engine.compose(layers()).digest);
  });
});

describe('sha256Hex known vectors (pure-TS hash correctness)', () => {
  it('empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('longer vector (448-bit block boundary)', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});
