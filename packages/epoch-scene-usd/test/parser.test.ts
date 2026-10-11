import { describe, expect, it } from 'vitest';
import { documentSummary, parseUsda, UsdaParseError } from '../src/index.js';

const FIXTURE = `#usda 1.0
(
    subLayers = [@sub.usda@]
    docInfo = "pass-through"
)

def Xform "World"
{
    kind = "assembly"
    custom float x = 1.5
    color3f[] c = [1, 0, 0]
    string s = "hello"
    bool b = true
    rel r = </Prim>
    rel r2 = [</A>, </B>]
    untyped = 42
    def Scope "Chair"
    {
        float y = 2
    }
    over Scope "Tweak"
    {
        float z = 3
    }
    variantSet "style"
    {
        "red"
        {
            float x = 10
            def Scope "RedChild" { float q = 1 }
        }
        "blue" { float x = 20 }
        selected = "red"
    }
}
`;

describe('usda parser: round-trips', () => {
  it('parses the full bounded subset fixture', () => {
    const doc = parseUsda(FIXTURE);
    expect(doc.subLayers.map((s) => s.assetPath)).toEqual(['sub.usda']);
    expect(doc.metadata['docInfo']).toEqual({ kind: 'string', value: 'pass-through' });
    const world = doc.rootPrims[0];
    expect(world?.name).toBe('World');
    expect(world?.typeName).toBe('Xform');
    expect(world?.specifier).toBe('def');
    expect(world?.metadata['kind']).toEqual({ kind: 'string', value: 'assembly' });
    const names = world?.properties.map((p) => p.name);
    expect(names).toContain('x');
    expect(names).toContain('c');
    expect(names).toContain('s');
    expect(names).toContain('b');
    expect(names).toContain('r');
    expect(names).toContain('r2');
    expect(names).toContain('untyped');
    const x = world?.properties.find((p) => p.name === 'x');
    expect(x?.typeName).toBe('float');
    expect(x?.isCustom).toBe(true);
    expect(x?.value).toEqual({ kind: 'number', value: 1.5 });
    const c = world?.properties.find((p) => p.name === 'c');
    expect(c?.typeName).toBe('color3f[]');
    expect(c?.value).toEqual({ kind: 'array', items: [{ kind: 'number', value: 1 }, { kind: 'number', value: 0 }, { kind: 'number', value: 0 }] });
    const r = world?.properties.find((p) => p.name === 'r');
    expect(r?.kind).toBe('relationship');
    expect(r?.value).toEqual({ kind: 'path', value: '/Prim' });
    const childSpecs = world?.children.map((ch) => ch.specifier) ?? [];
    expect(childSpecs).toContain('def');
    expect(childSpecs).toContain('over');
    const vs = world?.variantSets[0];
    expect(vs?.name).toBe('style');
    expect(vs?.selected).toBe('red');
    expect(vs?.variants.map((v) => v.name)).toEqual(['red', 'blue']);
    expect(vs?.variants[0]?.children[0]?.name).toBe('RedChild');
  });

  it('round-trips: identical text parses to an identical full summary (with locations)', () => {
    const a = documentSummary(parseUsda(FIXTURE), true);
    const b = documentSummary(parseUsda(FIXTURE), true);
    expect(a).toBe(b);
  });

  it('round-trips: comment/whitespace variations produce identical semantic summaries', () => {
    const varied = FIXTURE.replace('float y = 2', 'float y = 2  # trailing comment').replace('\n    bool b = true', '\n\n    bool b = true');
    expect(documentSummary(parseUsda(varied))).toBe(documentSummary(parseUsda(FIXTURE)));
  });

  it('parses prim metadata arcs: references (list + internal), inherits (list), payload', () => {
    const doc = parseUsda(`#usda 1.0
def Xform "P" (
    references = [@a.usda@</A>, @b.usda@]
    inherits = [</C1>, </C2>]
    payload = @big.usda@</Big>
    variants = { string style = "red" }
)
{
}
`);
    const p = doc.rootPrims[0];
    expect(p?.references).toEqual([
      { assetPath: 'a.usda', targetPath: '/A', location: expect.any(Object) },
      { assetPath: 'b.usda', targetPath: '/', location: expect.any(Object) },
    ]);
    expect(p?.inherits.map((i) => i.targetPath)).toEqual(['/C1', '/C2']);
    expect(p?.payloads).toEqual([{ assetPath: 'big.usda', targetPath: '/Big', location: expect.any(Object) }]);
    expect(p?.variantSelections.map((s) => [s.setName, s.variantName])).toEqual([['style', 'red']]);
  });
});

describe('usda parser: typed errors with line/column', () => {
  const expectParseError = (text: string, line: number, column: number | null, fragment: string): void => {
    let err: unknown = null;
    try {
      parseUsda(text);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UsdaParseError);
    const parseErr = err as UsdaParseError;
    expect(parseErr.line).toBe(line);
    if (column !== null) expect(parseErr.column).toBe(column);
    expect(parseErr.message).toContain(fragment);
    expect(parseErr.message).toContain(`${line}:`);
  };

  it('missing header -> error at 1:1', () => {
    expectParseError('def Xform "A" { float x = 1 }\n', 1, 1, 'missing required header');
  });

  it('unexpected content after header -> typed error on line 1', () => {
    expectParseError('#usda 1.0 extra\n', 1, null, 'unexpected content after the #usda 1.0 header');
  });

  it('unterminated string -> error at the opening quote', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { string s = "abc }\n', 2, 28, 'unterminated string literal');
  });

  it('missing value -> error at the offending token with line/column', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { float x = }\n', 2, 27, 'expected a value');
  });

  it('unclosed prim body -> EOF error with line/column', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { float x = 1\n', 2, 28, 'unexpected end of file');
  });

  it('malformed number -> error at the second dot', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { float x = 1.2.3 }\n', 2, 31, "unexpected character '.'");
  });

  it('unquoted token as value -> typed error', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { string s = hello }\n', 2, 28, 'expected a value');
  });

  it('duplicate prim name -> typed error', () => {
    expectParseError('#usda 1.0\ndef Xform "A" {}\ndef Xform "A" {}\n', 3, 1, "duplicate root prim name 'A'");
  });

  it('duplicate property name in one spec -> typed error', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { float x = 1 float x = 2 }\n', 2, 1, "duplicate property name 'x'");
  });

  it('arc keyword as a body statement -> typed error (bounded subset)', () => {
    expectParseError('#usda 1.0\ndef Xform "A" { references = @a.usda@</P> }\n', 2, 18, 'only valid inside prim');
  });

  it('subLayers on a prim -> typed error (bounded subset)', () => {
    expectParseError('#usda 1.0\ndef Xform "A" ( subLayers = [@x@] ) { }\n', 2, 18, 'not valid on prims');
  });

  it('nested variantSet inside a variant block -> typed error (bounded subset)', () => {
    expectParseError(
      '#usda 1.0\ndef Xform "A" { variantSet "s" { "on" { variantSet "t" { "x" { } } } } }\n',
      2,
      null,
      'nested variantSets inside variant blocks',
    );
  });

  it('prim name must be a quoted string -> typed error', () => {
    expectParseError('#usda 1.0\ndef Xform A { }\n', 2, 12, 'expected prim name');
  });
});
