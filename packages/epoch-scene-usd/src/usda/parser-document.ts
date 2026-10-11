/**
 * Document, layer-metadata, prim-header and prim-metadata parsing for the
 * bounded .usda text subset.
 *
 * Grammar notes (pinned by the frozen acceptance tests; column conventions
 * live in parser-core.ts):
 * - `subLayers = [@asset@, ...]` is LAYER-LEVEL metadata: accepted only in
 *   the layer metadata block directly after the #usda 1.0 header; typed
 *   error in prim metadata and in prim/variant bodies.
 * - Arcs (`references`, `inherits`, `payload`) are prim METADATA only —
 *   USD-faithful (TL ruling): accepted in the prim '(…)' block after the
 *   name; typed error as body statements and inside variant blocks.
 */

import { UsdaParseError, type SourceLocation } from '../errors.js';
import { sha256Hex } from '../hash.js';
import type {
  UsdaArcReference,
  UsdaDocument,
  UsdaInheritRef,
  UsdaPrimSpec,
  UsdaPropertyOpinion,
  UsdaSubLayerRef,
  UsdaValue,
  UsdaVariantSelection,
  UsdaVariantSetSpec,
} from './ast.js';
import { ParserCore, RESERVED_WORDS, USDA_HEADER } from './parser-core.js';

/** Keys valid only in PRIM metadata — rejected at layer level ('subLayers' is layer-level and handled separately). */
const METADATA_ONLY_KEYS = new Set(['references', 'inherits', 'payload', 'variants']);

/**
 * Document-level grammar. The prim-body/property/variantSet/value grammar
 * lives in parser-body.ts and is reached through the abstract hooks below
 * (prims contain bodies, bodies contain prims — mutual recursion across the
 * file seam).
 */
export abstract class ParserDocument extends ParserCore {
  /** Prim-body grammar hook (implemented by ParserBody in parser-body.ts). */
  protected abstract parsePrimBody(
    properties: UsdaPropertyOpinion[],
    children: UsdaPrimSpec[],
    variantSets: UsdaVariantSetSpec[],
    bodyMetadata: Record<string, UsdaValue> | null,
  ): void;

  /** Value grammar hook (implemented by ParserBody in parser-body.ts). */
  protected abstract parseValue(): UsdaValue;

  parseDocument(): UsdaDocument {
    const subLayers: UsdaSubLayerRef[] = [];
    const metadata: Record<string, UsdaValue> = {};
    if (this.isPunct('(')) {
      this.next();
      this.parseLayerMetadata(metadata, subLayers);
      this.expectPunct(')');
    }
    const rootPrims: UsdaPrimSpec[] = [];
    const seen = new Set<string>();
    while (this.peek().type !== 'eof') {
      const t = this.peek();
      if (!(t.type === 'ident' && (t.value === 'def' || t.value === 'over' || t.value === 'class'))) {
        this.err('expected a root prim', t, "'def', 'over', or 'class'");
      }
      const prim = this.parsePrim();
      if (seen.has(prim.name)) {
        throw new UsdaParseError(`duplicate root prim name '${prim.name}'`, prim.location, this.text);
      }
      seen.add(prim.name);
      rootPrims.push(prim);
    }
    return {
      header: USDA_HEADER,
      subLayers,
      metadata,
      rootPrims,
      textDigest: sha256Hex(this.text),
    };
  }

  private parseLayerMetadata(metadata: Record<string, UsdaValue>, subLayers: UsdaSubLayerRef[]): void {
    while (!this.isPunct(')')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside layer metadata', t, "')'");
      const keyTok = this.expectIdent('metadata key');
      if (METADATA_ONLY_KEYS.has(keyTok.value)) {
        this.err(`'${keyTok.value}' is prim-level metadata and is not valid in layer metadata in the bounded subset`, keyTok);
      }
      this.expectPunct('=');
      if (keyTok.value === 'subLayers') {
        const assets = this.parseAssetEntries();
        for (const a of assets) subLayers.push(a);
      } else {
        metadata[keyTok.value] = this.parseValue();
      }
    }
  }

  private parseAssetEntries(): UsdaSubLayerRef[] {
    const out: UsdaSubLayerRef[] = [];
    if (this.isPunct('[')) {
      this.next();
      if (!this.isPunct(']')) {
        for (;;) {
          out.push(this.parseAssetEntry());
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return out;
    }
    return [this.parseAssetEntry()];
  }

  private parseAssetEntry(): UsdaSubLayerRef {
    const t = this.peek();
    if (t.type !== 'asset') this.err('expected an asset path in subLayers list', t, '@asset.usda@');
    this.next();
    return { assetPath: t.value, location: { line: t.line, column: t.column } };
  }

  protected parsePrim(): UsdaPrimSpec {
    const specTok = this.next();
    const specifier = specTok.value as UsdaPrimSpec['specifier'];
    let typeName: string | null = null;
    if (this.peek().type === 'ident') {
      const typeTok = this.next();
      if (RESERVED_WORDS.has(typeTok.value)) {
        throw new UsdaParseError(
          `'${typeTok.value}' is a reserved word and cannot be used as a type name`,
          { line: typeTok.line, column: typeTok.column },
          this.text,
        );
      }
      typeName = typeTok.value;
    }
    const nameTok = this.expectString('prim name');
    const location: SourceLocation = { line: specTok.line, column: specTok.column };
    const metadata: Record<string, UsdaValue> = {};
    const references: UsdaArcReference[] = [];
    const inherits: UsdaInheritRef[] = [];
    const payloads: UsdaArcReference[] = [];
    const variantSelections: UsdaVariantSelection[] = [];
    if (this.isPunct('(')) {
      this.next();
      this.parsePrimMetadata(metadata, references, inherits, payloads, variantSelections);
      this.expectPunct(')');
    }
    const properties: UsdaPropertyOpinion[] = [];
    const children: UsdaPrimSpec[] = [];
    const variantSets: UsdaVariantSetSpec[] = [];
    this.expectPunct('{', 'opening prim body');
    this.parsePrimBody(properties, children, variantSets, metadata);
    this.expectPunct('}');
    this.checkDuplicates(children.map((c) => c.name), 'prim', location);
    this.checkDuplicates(properties.map((p) => p.name), 'property', location);
    this.checkDuplicates(variantSets.map((v) => v.name), 'variantSet', location);
    return {
      specifier,
      typeName,
      name: nameTok.value,
      location,
      metadata,
      references,
      inherits,
      payloads,
      variantSelections,
      properties,
      children,
      variantSets,
    };
  }

  private checkDuplicates(names: readonly string[], what: string, loc: SourceLocation): void {
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) throw new UsdaParseError(`duplicate ${what} name '${n}'`, loc, this.text);
      seen.add(n);
    }
  }

  private parsePrimMetadata(
    metadata: Record<string, UsdaValue>,
    references: UsdaArcReference[],
    inherits: UsdaInheritRef[],
    payloads: UsdaArcReference[],
    variantSelections: UsdaVariantSelection[],
  ): void {
    while (!this.isPunct(')')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside prim metadata', t, "')'");
      const keyTok = this.expectIdent('metadata key');
      this.expectPunct('=');
      switch (keyTok.value) {
        case 'references': {
          for (const r of this.parseArcEntries()) references.push(r);
          break;
        }
        case 'inherits': {
          for (const p of this.parsePathEntries()) inherits.push({ targetPath: p.path, location: p.location });
          break;
        }
        case 'payload': {
          for (const r of this.parseArcEntries()) payloads.push(r);
          break;
        }
        case 'variants': {
          this.parseVariantSelectionEntries(variantSelections);
          break;
        }
        case 'subLayers': {
          this.errAfterStart("'subLayers' is layer-level metadata and is not valid on prims in the bounded subset", keyTok);
          break;
        }
        default: {
          metadata[keyTok.value] = this.parseValue();
          break;
        }
      }
    }
  }

  private parseArcEntries(): UsdaArcReference[] {
    if (this.isPunct('[')) {
      this.next();
      const out: UsdaArcReference[] = [];
      if (!this.isPunct(']')) {
        for (;;) {
          out.push(this.parseArcEntry());
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return out;
    }
    return [this.parseArcEntry()];
  }

  private parseArcEntry(): UsdaArcReference {
    const t = this.peek();
    if (t.type === 'asset') {
      this.next();
      let targetPath = '/';
      const p = this.peek();
      if (p.type === 'path') {
        this.next();
        targetPath = p.value;
      }
      return { assetPath: t.value, targetPath, location: { line: t.line, column: t.column } };
    }
    if (t.type === 'path') {
      this.next();
      return { assetPath: '', targetPath: t.value, location: { line: t.line, column: t.column } };
    }
    this.err('expected an asset path (optionally followed by a prim path) or an internal prim path', t, '@file.usda@</Prim> or </Prim>');
  }

  private parsePathEntries(): { path: string; location: SourceLocation }[] {
    const out: { path: string; location: SourceLocation }[] = [];
    if (this.isPunct('[')) {
      this.next();
      if (!this.isPunct(']')) {
        for (;;) {
          const t = this.peek();
          if (t.type !== 'path') this.err('expected a prim path in inherits list', t, '</Prim>');
          this.next();
          out.push({ path: t.value, location: { line: t.line, column: t.column } });
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return out;
    }
    const t = this.peek();
    if (t.type !== 'path') this.err('expected a prim path for inherits', t, '</Prim>');
    this.next();
    return [{ path: t.value, location: { line: t.line, column: t.column } }];
  }

  private parseVariantSelectionEntries(out: UsdaVariantSelection[]): void {
    this.expectPunct('{');
    while (!this.isPunct('}')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside variants block', t, "'}'");
      let nameTok = this.expectIdent('variantSet name');
      if (this.peek().type === 'ident') {
        // Typed form: `string style = "red"` — the first identifier was the type.
        nameTok = this.next();
      }
      this.expectPunct('=');
      const valueTok = this.expectString('variant name');
      out.push({
        setName: nameTok.value,
        variantName: valueTok.value,
        location: { line: nameTok.line, column: nameTok.column },
      });
    }
    this.expectPunct('}');
  }
}
