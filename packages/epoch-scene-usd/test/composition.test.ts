import { describe, expect, it } from 'vitest';
import { createSceneCompositionEngine, SceneCompositionError, type ComposedScene, type SceneLayer } from '../src/index.js';

const engine = createSceneCompositionEngine();
const layer = (name: string, text: string, assetPath?: string): SceneLayer => ({
  name,
  text,
  ...(assetPath === undefined ? {} : { assetPath }),
});

const ROOT_LAYER = `#usda 1.0
(
    subLayers = [@sub.usda@]
)

def Xform "World"
{
    float x = 1.5
    float rootOnly = 7
    def Scope "Chair"
    {
        float y = 2
    }
}
`;

const SUB_LAYER = `#usda 1.0

def Xform "World"
{
    float x = 9
    float z = 3
    over Scope "Chair"
    {
        float y = 8
    }
}
`;

const MAIN_LAYER = `#usda 1.0

def Xform "Stage"
{
    float x = 1
    references = @chairs.usda@</BChair>
}
`;

const CHAIRS_LAYER = `#usda 1.0

def Xform "BChair"
{
    float x = 2
    float w = 5
    def Scope "Seat"
    {
        float h = 1
    }
}
`;

function opinion(scene: ComposedScene, path: string, name: string) {
  const find = (prims: readonly typeof scene.rootPrims[number][], p: string): typeof scene.rootPrims[number] | null => {
    for (const prim of prims) {
      if (prim.path === p) return prim;
      const child = find(prim.children, p);
      if (child !== null) return child;
    }
    return null;
  };
  const prim = find(scene.rootPrims, path);
  return prim?.opinions.find((o) => o.name === name) ?? null;
}

describe('opinion resolution: layer stack ordering (Local > Sublayers)', () => {
  it('local (root) opinions beat sublayer opinions; sublayer-only opinions compose', () => {
    const scene = engine.compose([
      layer('root', ROOT_LAYER, 'root.usda'),
      layer('sub', SUB_LAYER, 'sub.usda'),
    ]);
    expect(opinion(scene, '/World', 'x')?.value).toEqual({ kind: 'number', value: 1.5 });
    expect(opinion(scene, '/World', 'x')?.provenance.layer).toBe('root');
    expect(opinion(scene, '/World', 'z')?.value).toEqual({ kind: 'number', value: 3 });
    expect(opinion(scene, '/World', 'z')?.provenance.layer).toBe('sub');
    expect(opinion(scene, '/World/Chair', 'y')?.value).toEqual({ kind: 'number', value: 2 });
  });

  it('sublayers of sublayers expand recursively in listed order', () => {
    const a = `#usda 1.0\n(\n    subLayers = [@b.usda@]\n)\n\ndef Xform "W" { float v = 1 float aOnly = 10 }\n`;
    const b = `#usda 1.0\n(\n    subLayers = [@c.usda@]\n)\n\ndef Xform "W" { float v = 2 float bOnly = 20 }\n`;
    const c = `#usda 1.0\n\ndef Xform "W" { float v = 3 float cOnly = 30 }\n`;
    const scene = engine.compose([
      layer('a', a, 'a.usda'),
      layer('b', b, 'b.usda'),
      layer('c', c, 'c.usda'),
    ]);
    expect(opinion(scene, '/W', 'v')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/W', 'bOnly')?.value).toEqual({ kind: 'number', value: 20 });
    expect(opinion(scene, '/W', 'cOnly')?.value).toEqual({ kind: 'number', value: 30 });
  });

  it('the provided stack order is absolute: a layer\'s sublayers beat later root layers', () => {
    const root1 = `#usda 1.0\n(\n    subLayers = [@s.usda@]\n)\n\ndef Xform "W" { float aOnly = 1 }\n`;
    const s = `#usda 1.0\n\ndef Xform "W" { float v = 2 }\n`;
    const root2 = `#usda 1.0\n\ndef Xform "W" { float v = 3 }\n`;
    const scene = engine.compose([
      layer('root1', root1, 'root1.usda'),
      layer('s', s, 's.usda'),
      layer('root2', root2, 'root2.usda'),
    ]);
    expect(opinion(scene, '/W', 'v')?.value).toEqual({ kind: 'number', value: 2 });
    expect(scene.layers.map((l) => l.name)).toEqual(['root1', 's', 'root2']);
    expect(scene.layers.map((l) => l.role)).toEqual(['root-stack', 'sublayer', 'root-stack']);
  });
});

describe('opinion resolution: references (Local > References; reference beats target locals)', () => {
  it('referencing-site local opinions beat the referenced target\'s own local opinions', () => {
    const scene = engine.compose([
      layer('main', MAIN_LAYER, 'main.usda'),
      layer('chairs', CHAIRS_LAYER, 'chairs.usda'),
    ]);
    expect(opinion(scene, '/Stage', 'x')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/Stage', 'x')?.provenance.layer).toBe('main');
    expect(opinion(scene, '/Stage', 'x')?.provenance.via).toEqual([]);
  });

  it('target-only opinions compose with full provenance (arc trail + line/column)', () => {
    const scene = engine.compose([
      layer('main', MAIN_LAYER, 'main.usda'),
      layer('chairs', CHAIRS_LAYER, 'chairs.usda'),
    ]);
    const w = opinion(scene, '/Stage', 'w');
    expect(w?.value).toEqual({ kind: 'number', value: 5 });
    expect(w?.provenance.layer).toBe('chairs');
    expect(w?.provenance.primPath).toBe('/BChair');
    expect(w?.provenance.via).toEqual(['reference @chairs.usda@</BChair>']);
    expect(w?.provenance.line).toBeGreaterThan(0);
    expect(w?.provenance.column).toBeGreaterThan(0);
  });

  it('referenced subtrees compose as children of the referencing prim', () => {
    const scene = engine.compose([
      layer('main', MAIN_LAYER, 'main.usda'),
      layer('chairs', CHAIRS_LAYER, 'chairs.usda'),
    ]);
    expect(opinion(scene, '/Stage/Seat', 'h')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/Stage/Seat', 'h')?.provenance.via).toEqual(['reference @chairs.usda@</BChair>']);
  });

  it('reference chains order weakest-last (main > mid > deep)', () => {
    const main = `#usda 1.0\n\ndef Xform "P" { float v = 1 references = @mid.usda@</M> }\n`;
    const mid = `#usda 1.0\n\ndef Xform "M" { float v = 2 float mOnly = 22 references = @deep.usda@</D> }\n`;
    const deep = `#usda 1.0\n\ndef Xform "D" { float v = 3 float dOnly = 33 }\n`;
    const scene = engine.compose([
      layer('main', main, 'main.usda'),
      layer('mid', mid, 'mid.usda'),
      layer('deep', deep, 'deep.usda'),
    ]);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/P', 'mOnly')?.provenance.via).toEqual(['reference @mid.usda@</M>']);
    expect(opinion(scene, '/P', 'dOnly')?.provenance.via).toEqual(['reference @mid.usda@</M>', 'reference @deep.usda@</D>']);
  });

  it('internal (path-only) references resolve in the declaring stack', () => {
    const text = `#usda 1.0\n\ndef Xform "P" { float v = 0 references = </Q> }\n\ndef Xform "Q" { float v = 5 float q = 1 }\n`;
    const scene = engine.compose([layer('a', text, 'a.usda')]);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 0 });
    expect(opinion(scene, '/P', 'q')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/P', 'q')?.provenance.via).toEqual(['reference /Q']);
  });

  it('strongest declaration of a reference list wins (no list-edit merging — bounded)', () => {
    const a = `#usda 1.0\n\ndef Xform "P" { references = @r1.usda@</R1> }\n`;
    const b = `#usda 1.0\n\ndef Xform "P" { references = @r2.usda@</R2> }\n`;
    const r1 = `#usda 1.0\n\ndef Xform "R1" { float v = 1 }\n`;
    const r2 = `#usda 1.0\n\ndef Xform "R2" { float v = 2 float r2Only = 9 }\n`;
    const scene = engine.compose([
      layer('a', a, 'a.usda'),
      layer('b', b, 'b.usda'),
      layer('r1', r1, 'r1.usda'),
      layer('r2', r2, 'r2.usda'),
    ]);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/P', 'r2Only')).toBeNull();
  });

  it('an over in a stronger layer strengthens a referenced def', () => {
    const main = `#usda 1.0\n\ndef Xform "P" { float v = 1 references = @r.usda@</R> }\n`;
    const over = `#usda 1.0\n\nover Xform "P" { float v = 9 }\n`;
    const r = `#usda 1.0\n\ndef Xform "R" { float v = 2 float w = 3 }\n`;
    const scene = engine.compose([
      layer('main', main, 'main.usda'),
      layer('over', over, 'over.usda'),
      layer('r', r, 'r.usda'),
    ]);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 9 });
    expect(opinion(scene, '/P', 'w')?.value).toEqual({ kind: 'number', value: 3 });
  });
});

describe('opinion resolution: variants', () => {
  const VARIANT_LAYER = `#usda 1.0

def Xform "Model"
{
    float x = 0
    variantSet "style"
    {
        "red"
        {
            float x = 1
            color3f[] c = [1, 0, 0]
            float redOnly = 11
            def Scope "RedChild" { float q = 1 }
        }
        "blue"
        {
            float x = 2
            float blueOnly = 22
        }
        selected = "red"
    }
}
`;

  it('variants selected by the variantSet block selected edit; unselected variants contribute nothing', () => {
    const scene = engine.compose([layer('v', VARIANT_LAYER, 'v.usda')]);
    expect(opinion(scene, '/Model', 'x')?.value).toEqual({ kind: 'number', value: 0 }); // Local > Variants
    expect(opinion(scene, '/Model', 'redOnly')?.value).toEqual({ kind: 'number', value: 11 });
    expect(opinion(scene, '/Model', 'redOnly')?.provenance.via).toEqual(['variant style=red']);
    expect(opinion(scene, '/Model', 'blueOnly')).toBeNull();
    expect(opinion(scene, '/Model/RedChild', 'q')?.value).toEqual({ kind: 'number', value: 1 });
  });

  it('prim metadata variants = {...} beats the block selected edit', () => {
    const text = VARIANT_LAYER.replace('def Xform "Model"\n{', 'def Xform "Model"\n(\n    variants = { string style = "blue" }\n)\n{');
    const scene = engine.compose([layer('v', text, 'v.usda')]);
    expect(opinion(scene, '/Model', 'blueOnly')?.value).toEqual({ kind: 'number', value: 22 });
    expect(opinion(scene, '/Model', 'redOnly')).toBeNull();
    const sel = scene.variantSelections.find((s) => s.primPath === '/Model');
    expect(sel?.source).toBe('prim-metadata');
  });

  it('the compose-time variantSelection edit is the strongest selection source', () => {
    const scene = engine.compose(
      [layer('v', VARIANT_LAYER, 'v.usda')],
      { variantSelections: { '/Model': { style: 'blue' } } },
    );
    expect(opinion(scene, '/Model', 'blueOnly')?.value).toEqual({ kind: 'number', value: 22 });
    expect(opinion(scene, '/Model', 'redOnly')).toBeNull();
    expect(scene.variantSelections.find((s) => s.primPath === '/Model')?.source).toBe('compose-option');
  });

  it('an override naming an unknown variant is a recorded diagnostic — never silent', () => {
    const scene = engine.compose(
      [layer('v', VARIANT_LAYER, 'v.usda')],
      { variantSelections: { '/Model': { style: 'green' } } },
    );
    expect(scene.diagnostics.some((d) => d.code === 'unknown-variant')).toBe(true);
    expect(opinion(scene, '/Model', 'redOnly')).toBeNull();
  });

  it('variant opinions beat reference-target opinions (LIVRPS: Variants > References)', () => {
    const main = `#usda 1.0\n\ndef Xform "P" {\n    references = @r.usda@</R>\n    variantSet "s" { "on" { float v = 2 string which = "variant" } selected = "on" }\n}\n`;
    const r = `#usda 1.0\n\ndef Xform "R" { float v = 3 string which = "reference" }\n`;
    const scene = engine.compose([
      layer('main', main, 'main.usda'),
      layer('r', r, 'r.usda'),
    ]);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 2 });
    expect(opinion(scene, '/P', 'which')?.value).toEqual({ kind: 'string', value: 'variant' });
  });
});

describe('opinion resolution: inherits', () => {
  it('direct opinions win over inherits (Local > Inherits)', () => {
    const text = `#usda 1.0
class Xform "_class_Chair"
{
    float w = 10
    string tag = "class"
}

def Xform "Chair"
{
    inherits = </_class_Chair>
    float w = 1
    float q = 2
}
`;
    const scene = engine.compose([layer('a', text, 'a.usda')]);
    expect(opinion(scene, '/Chair', 'w')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/Chair', 'tag')?.value).toEqual({ kind: 'string', value: 'class' });
    expect(opinion(scene, '/Chair', 'tag')?.provenance.via).toEqual(['inherits /_class_Chair']);
    expect(opinion(scene, '/Chair', 'q')?.value).toEqual({ kind: 'number', value: 2 });
  });

  it('class prims do not appear in the composed hierarchy (informational diagnostic)', () => {
    const text = `#usda 1.0\nclass Xform "_class_C" { float a = 1 }\n\ndef Xform "P" { inherits = </_class_C> }\n`;
    const scene = engine.compose([layer('a', text, 'a.usda')]);
    expect(scene.rootPrims.map((p) => p.name)).toEqual(['P']);
    expect(scene.diagnostics.some((d) => d.code === 'class-prim-not-composed')).toBe(true);
  });

  it('inherit chains resolve recursively (P > C1 > C2)', () => {
    const text = `#usda 1.0
class "_class_C2" { float a = 2 float b = 3 }
class "_class_C1" { float a = 1 inherits = </_class_C2> }
def Xform "P" { inherits = </_class_C1> }
`;
    const scene = engine.compose([layer('a', text, 'a.usda')]);
    expect(opinion(scene, '/P', 'a')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/P', 'b')?.provenance.via).toEqual(['inherits /_class_C1', 'inherits /_class_C2']);
  });

  it('inherit opinions beat variant opinions, which beat reference opinions (I > V > R)', () => {
    const main = `#usda 1.0
class "_class_A" { float v = 1 string which = "inherit" }

def Xform "P" (
    inherits = </_class_A>
)
{
    references = @r.usda@</R>
    variantSet "s" { "on" { float v = 2 string which = "variant" } selected = "on" }
}
`;
    const r = `#usda 1.0\n\ndef Xform "R" { float v = 3 string which = "reference" string refOnly = "R" }\n`;
    const scene = engine.compose([
      layer('main', main, 'main.usda'),
      layer('r', r, 'r.usda'),
    ]);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/P', 'which')?.value).toEqual({ kind: 'string', value: 'inherit' });
    expect(opinion(scene, '/P', 'refOnly')?.value).toEqual({ kind: 'string', value: 'R' });
  });

  it('a missing inherit target is a recorded diagnostic — never silent', () => {
    const text = `#usda 1.0\n\ndef Xform "P" { inherits = </_class_Missing> float v = 1 }\n`;
    const scene = engine.compose([layer('a', text, 'a.usda')]);
    expect(scene.diagnostics.some((d) => d.code === 'missing-arc-target')).toBe(true);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 1 });
  });
});

describe('opinion resolution: payloads', () => {
  const MAIN = `#usda 1.0

def Xform "P" (
    payload = @big.usda@</Big>
)
{
    references = @small.usda@</Small>
}
`;
  const BIG = `#usda 1.0\n\ndef Xform "Big" { float p = 1 float v = 10 string which = "payload" }\n`;
  const SMALL = `#usda 1.0\n\ndef Xform "Small" { float v = 5 string which = "reference" }\n`;

  const layers = (): SceneLayer[] => [
    layer('main', MAIN, 'main.usda'),
    layer('big', BIG, 'big.usda'),
    layer('small', SMALL, 'small.usda'),
  ];

  it('payloads compose by default and are weaker than references (References > Payloads)', () => {
    const scene = engine.compose(layers());
    expect(opinion(scene, '/P', 'p')?.value).toEqual({ kind: 'number', value: 1 });
    expect(opinion(scene, '/P', 'p')?.provenance.via).toEqual(['payload @big.usda@</Big>']);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 5 });
    expect(opinion(scene, '/P', 'which')?.value).toEqual({ kind: 'string', value: 'reference' });
  });

  it('payloads compose only when included; exclusion is a recorded diagnostic', () => {
    const included = engine.compose(layers());
    expect(opinion(included, '/P', 'p')).not.toBeNull();
    const excluded = engine.compose(layers(), { includePayloads: false });
    expect(opinion(excluded, '/P', 'p')).toBeNull();
    expect(excluded.diagnostics.some((d) => d.code === 'payload-excluded')).toBe(true);
    expect(excluded.diagnostics.every((d) => d.code !== 'payload-excluded' || d.layer === 'main')).toBe(true);
  });
});

describe('composition diagnostics and hard errors (never silent)', () => {
  it('a reference to a missing prim in an existing layer is a diagnostic', () => {
    const main = `#usda 1.0\n\ndef Xform "P" { references = @r.usda@</Missing> float v = 1 }\n`;
    const r = `#usda 1.0\n\ndef Xform "Other" { float v = 2 }\n`;
    const scene = engine.compose([layer('main', main, 'main.usda'), layer('r', r, 'r.usda')]);
    expect(scene.diagnostics.some((d) => d.code === 'missing-arc-target')).toBe(true);
    expect(opinion(scene, '/P', 'v')?.value).toEqual({ kind: 'number', value: 1 });
  });

  it('a reference to an asset not in the layer set is a diagnostic', () => {
    const main = `#usda 1.0\n\ndef Xform "P" { references = @nowhere.usda@</X> float v = 1 }\n`;
    const scene = engine.compose([layer('main', main, 'main.usda')]);
    expect(scene.diagnostics.some((d) => d.code === 'unresolved-reference-asset')).toBe(true);
  });

  it('over-without-def is dropped from the hierarchy with a diagnostic', () => {
    const text = `#usda 1.0\n\nover Xform "Ghost" { float v = 1 }\n\ndef Xform "Real" { float v = 2 }\n`;
    const scene = engine.compose([layer('a', text, 'a.usda')]);
    expect(scene.rootPrims.map((p) => p.name)).toEqual(['Real']);
    expect(scene.diagnostics.some((d) => d.code === 'over-without-def')).toBe(true);
  });

  it('composition cycles are detected and recorded, composition terminates', () => {
    const a = `#usda 1.0\n\ndef Xform "A" { references = @b.usda@</B> float va = 1 }\n`;
    const b = `#usda 1.0\n\ndef Xform "B" { references = @a.usda@</A> float vb = 2 }\n`;
    const scene = engine.compose([
      layer('a', a, 'a.usda'),
      layer('b', b, 'b.usda'),
    ]);
    expect(scene.diagnostics.some((d) => d.code === 'composition-cycle')).toBe(true);
    expect(opinion(scene, '/A', 'va')?.value).toEqual({ kind: 'number', value: 1 });
  });

  it('hard error: empty layer stack', () => {
    expect(() => engine.compose([])).toThrow(SceneCompositionError);
    try {
      engine.compose([]);
    } catch (e) {
      expect((e as SceneCompositionError).code).toBe('empty-layer-stack');
    }
  });

  it('hard error: duplicate layer names', () => {
    const t = `#usda 1.0\n\ndef Xform "A" { }\n`;
    expect(() => engine.compose([layer('x', t), layer('x', t)])).toThrow(/duplicate layer name/);
  });

  it('hard error: unresolved sublayer asset', () => {
    const t = `#usda 1.0\n(\n    subLayers = [@missing.usda@]\n)\n\ndef Xform "A" { }\n`;
    try {
      engine.compose([layer('x', t, 'x.usda')]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SceneCompositionError);
      expect((e as SceneCompositionError).code).toBe('unresolved-sublayer');
    }
  });

  it('hard error: sublayer cycles', () => {
    const a = `#usda 1.0\n(\n    subLayers = [@b.usda@]\n)\n\ndef Xform "A" { float v = 1 }\n`;
    const b = `#usda 1.0\n(\n    subLayers = [@a.usda@]\n)\n\ndef Xform "B" { float v = 2 }\n`;
    try {
      engine.compose([layer('a', a, 'a.usda'), layer('b', b, 'b.usda')]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SceneCompositionError);
      expect((e as SceneCompositionError).code).toBe('layer-cycle');
    }
  });
});
