// ============================================================================
// brand-dna-fonts.util.ts
// Single source of truth for "which font this brand actually uses" — the
// canonical field is the flat `brandFont` column, or `brandDnaV2.typography
// .heading_font`/`body_font` for the newer onboarding schema. Several call
// sites previously checked `brandDNA.fonts?.headline`/`primaryFont`, fields
// that don't exist anywhere on the schema, so the override was always a no-op.
// ============================================================================

export function getEffectiveFonts(brandDNA: {
  brandFont?: string | null;
  brandDnaV2?: unknown;
}): { headline?: string; body?: string } {
  let v2Typography: { heading_font?: string; body_font?: string } | undefined;
  if (brandDNA.brandDnaV2) {
    try {
      const v2 = typeof brandDNA.brandDnaV2 === 'string' ? JSON.parse(brandDNA.brandDnaV2) : brandDNA.brandDnaV2;
      v2Typography = (v2 as any)?.typography;
    } catch {
      // Malformed brandDnaV2 JSON — fall back to the flat field only.
    }
  }

  return {
    headline: v2Typography?.heading_font || brandDNA.brandFont || undefined,
    body: v2Typography?.body_font || brandDNA.brandFont || undefined,
  };
}
