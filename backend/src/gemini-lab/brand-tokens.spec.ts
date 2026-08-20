import {
  EXT,
  hexOf,
  paletteFromTokens,
  resolveToken,
  tokensFromBrand,
  typographyFromTokens,
  validateTokens,
  voiceFromTokens,
  type BrandTokens,
} from './brand-tokens';
import type { LabPalette, LabTypography } from './gemini-lab-compositor';

const palette: LabPalette = {
  background: '#F6EEE4',
  secondary: '#E8D5C4',
  depth: '#5C4033',
  accent: '#C9A227',
  primary: '#8A7A6A',
};
const typography: LabTypography = { heading: 'Playfair Display', body: 'Inter' };

const tokens = tokensFromBrand({
  palette,
  typography,
  voice: { mood: 'SOFT_GLAM', essence: ['warm'], bannedWords: ['pamper'] },
});

describe('brand tokens', () => {
  it('round-trips the palette without drift', () => {
    // Nothing may change today — this is a structural migration, not a
    // restyling. Colours must come back exactly as they went in.
    const back = paletteFromTokens(tokens, palette);
    expect(back).toEqual({
      background: '#f6eee4',
      secondary: '#e8d5c4',
      depth: '#5c4033',
      accent: '#c9a227',
      primary: '#8a7a6a',
    });
  });

  it('round-trips the typeface pairing', () => {
    expect(typographyFromTokens(tokens, typography)).toEqual(typography);
  });

  it('stores colour in the spec shape, not a bare string', () => {
    const token = resolveToken(tokens, 'color.accent')!;
    const value = token.$value as any;
    expect(token.$type).toBe('color');
    expect(value.colorSpace).toBe('srgb');
    expect(value.components).toHaveLength(3);
    expect(value.hex).toBe('#c9a227');
  });

  it('resolves an alias to the token it points at', () => {
    // color.ink is an alias of color.depth — this is what lets a palette
    // treatment re-point a role without duplicating a value.
    expect(hexOf(resolveToken(tokens, 'color.ink'))).toBe('#5c4033');
    expect(hexOf(resolveToken(tokens, 'color.ground'))).toBe('#f6eee4');
  });

  it('follows a chain of aliases', () => {
    const chained: BrandTokens = {
      color: {
        base: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' } },
        one: { $type: 'color', $value: '{color.base}' },
        two: { $type: 'color', $value: '{color.one}' },
      },
    };
    expect(hexOf(resolveToken(chained, 'color.two'))).toBe('#000000');
  });

  it('refuses to loop on a circular reference', () => {
    const circular: BrandTokens = {
      color: {
        a: { $type: 'color', $value: '{color.b}' },
        b: { $type: 'color', $value: '{color.a}' },
      },
    };
    expect(resolveToken(circular, 'color.a')).toBeNull();
  });

  it('returns null for a path that is a group, not a token', () => {
    expect(resolveToken(tokens, 'color')).toBeNull();
    expect(resolveToken(tokens, 'color.nope')).toBeNull();
  });

  it('carries composite typography tokens', () => {
    const headline = resolveToken(tokens, 'type.headline')!;
    const value = headline.$value as any;
    expect(headline.$type).toBe('typography');
    expect(value.fontFamily).toContain('Playfair Display');
    expect(value.fontSize).toEqual({ value: 64, unit: 'px' });
  });

  it('keeps untyped brand facts under the vendor extension', () => {
    // The spec has no type for "never say pamper", so it goes in $extensions
    // under a namespace rather than being invented as a token type.
    const voice = voiceFromTokens(tokens);
    expect(voice?.bannedWords).toEqual(['pamper']);
    expect((tokens as any).brand.voice.$extensions[EXT].mood).toBe('SOFT_GLAM');
  });

  it('accepts a well-formed document', () => {
    expect(validateTokens(tokens)).toEqual([]);
  });

  it('reports a broken alias rather than failing at render time', () => {
    const broken: BrandTokens = {
      ...tokens,
      color: { ...(tokens as any).color, ink: { $type: 'color', $value: '{color.missing}' } },
    };
    expect(validateTokens(broken).some((e) => /does not resolve/.test(e))).toBe(true);
  });

  it('reports the tokens the renderer cannot do without', () => {
    const errors = validateTokens({ color: { accent: { $type: 'color', $value: '#fff' } } });
    expect(errors.some((e) => /color.background/.test(e))).toBe(true);
    expect(errors.some((e) => /font.heading/.test(e))).toBe(true);
  });

  it('rejects a non-object document', () => {
    expect(validateTokens(null).length).toBeGreaterThan(0);
    expect(validateTokens([]).length).toBeGreaterThan(0);
  });

  it('falls back rather than throwing when a token is absent', () => {
    expect(paletteFromTokens({}, palette)).toEqual(palette);
    expect(typographyFromTokens({}, typography)).toEqual(typography);
  });
});
