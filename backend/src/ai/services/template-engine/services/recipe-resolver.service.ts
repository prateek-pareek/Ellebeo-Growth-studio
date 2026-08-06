import { Injectable } from '@nestjs/common';
import { DesignFamilyRecipe, VariantRecipe } from '../types/design-recipe.type';
import { designFamilyRecipes } from '../config/design-families.recipe';

@Injectable()
export class RecipeResolverService {

  /**
   * Resolve a recipe for a given family + variant
   * Brand DNA overrides recipe defaults
   */
  resolveRecipe(
    familyId: string,
    variantId: string | null,
    brandDNA: any,
    context?: { tenantId: string; slideIndex: number; goal?: string; mood?: string; pillar?: string; sceneType?: 'Portrait' | 'Landscape' }
  ): DesignFamilyRecipe | any {
    // 1. Load base family recipe
    const baseRecipe = designFamilyRecipes[familyId];
    if (!baseRecipe) {
      throw new Error(`Family recipe not found: ${familyId}`);
    }

    // 2. Start with copy of base
    let resolvedRecipe = JSON.parse(JSON.stringify(baseRecipe));

    // 3. If variant specified, merge variant overrides
    if (variantId) {
      const variantRecipe = this.loadVariantRecipe(variantId);
      if (variantRecipe) {
        resolvedRecipe = this.mergeRecipes(resolvedRecipe, variantRecipe.overrides);
      }
    }

    // 4. Apply Brand DNA overrides (colors, aesthetics, tier)
    resolvedRecipe = this.applyBrandDNAOverrides(resolvedRecipe, brandDNA);

    return resolvedRecipe;
  }

  /**
   * Load a variant recipe by ID
   * This is where variant inheritance happens
   */
  private loadVariantRecipe(variantId: string): VariantRecipe | null {
    // For now, variants are defined inline
    // In production, these would load from database
    const variants: Record<string, VariantRecipe> = {
      'editorial_magazine_cover': {
        id: 'editorial_magazine_cover',
        name: 'Magazine Cover',
        extendsFamily: 'editorial',
        overrides: {
          dominance: { type: 'image_hero', imageRatio: 0.75 },
          readingFlow: {
            type: 'z_pattern',
            elementSequence: ['logo', 'image', 'headline', 'subheadline', 'cta'],
          },
          typographyScale: {
            ratios: [4.0, 2.8, 1.5, 1.0, 0.7],
            fontWeights: [700, 600, 500, 400, 300],
            lineHeights: [1.1, 1.15, 1.3, 1.4, 1.6],
            fontFamilies: {
              headline: 'Playfair Display, Georgia, serif',
              body: 'Inter, Helvetica Neue, sans-serif',
            },
          },
          primitives: {
            magazine_label: {
              type: 'badge',
              opacity: 1.0,
              color: 'primary',
              visibility: 'always',
            },
            accent_rule: {
              type: 'rule',
              opacity: 0.4,
              thickness: 2,
              color: 'primary',
              visibility: 'always',
            },
          },
        },
      },

      'editorial_portrait_hero': {
        id: 'editorial_portrait_hero',
        name: 'Portrait Hero',
        extendsFamily: 'editorial',
        overrides: {
          dominance: { type: 'image_hero', imageRatio: 0.8 },
          readingFlow: {
            type: 'center_down',
            elementSequence: ['logo', 'image', 'headline', 'caption'],
          },
          spacing: {
            verticalRhythm: 24,
            horizontalGutter: 32,
            whitespaceRatio: 0.5,
            topBuffer: 0.1,
            bottomBuffer: 0.15,
            sideBuffer: 0.08,
          },
        },
      },

      'clinical_before_after': {
        id: 'clinical_before_after',
        name: 'Before-After',
        extendsFamily: 'clinical',
        overrides: {
          dominance: { type: 'image_hero', imageRatio: 0.9 },
          spacing: {
            verticalRhythm: 20,
            horizontalGutter: 2,
            whitespaceRatio: 0.25,
            topBuffer: 0.08,
            bottomBuffer: 0.1,
            sideBuffer: 0.02,
          },
          primitives: {
            comparison_arrow: {
              type: 'badge',
              opacity: 1.0,
              color: 'primary',
              visibility: 'always',
            },
          },
        },
      },

      'premium_luxury_card': {
        id: 'premium_luxury_card',
        name: 'Luxury Card',
        extendsFamily: 'premium',
        overrides: {
          spacing: {
            verticalRhythm: 32,
            horizontalGutter: 48,
            whitespaceRatio: 0.6,
            topBuffer: 0.15,
            bottomBuffer: 0.2,
            sideBuffer: 0.12,
          },
          primitives: {
            luxury_card_frame: {
              type: 'card',
              opacity: 0.1,
              color: 'primary',
              visibility: 'always',
            },
            luxury_shadow: {
              type: 'border',
              opacity: 0.08,
              thickness: 1,
              color: 'primary',
              visibility: 'always',
            },
          },
        },
      },

      'minimalist_zen': {
        id: 'minimalist_zen',
        name: 'Zen Quote',
        extendsFamily: 'minimalist',
        overrides: {
          readingFlow: {
            type: 'center_down',
            elementSequence: ['logo', 'quote', 'attribution'],
          },
          typographyScale: {
            ratios: [6.0, 3.5, 1.5, 1.0, 0.5],
            fontWeights: [400, 400, 400, 300, 300],
            lineHeights: [1.0, 1.05, 1.3, 1.5, 1.6],
            fontFamilies: {
              headline: 'Georgia, Playfair, serif',
              body: 'Inter, sans-serif',
            },
          },
        },
      },
    };

    return variants[variantId] || null;
  }

  /**
   * Merge two recipes (shallow merge for overrides)
   */
  private mergeRecipes(
    base: DesignFamilyRecipe,
    overrides: Partial<DesignFamilyRecipe>,
  ): DesignFamilyRecipe {
    return {
      ...base,
      ...overrides,
      // Deep merge nested objects
      spacing: { ...base.spacing, ...(overrides.spacing || {}) },
      typographyScale: {
        ...base.typographyScale,
        ...(overrides.typographyScale || {}),
        fontFamilies: {
          ...base.typographyScale.fontFamilies,
          ...(overrides.typographyScale?.fontFamilies || {}),
        },
      },
      readingFlow: { ...base.readingFlow, ...(overrides.readingFlow || {}) },
      colors: { ...base.colors, ...(overrides.colors || {}) },
      dominance: { ...base.dominance, ...(overrides.dominance || {}) },
      primitives: { ...base.primitives, ...(overrides.primitives || {}) },
      logo: { ...base.logo, ...(overrides.logo || {}) },
      faceHandling: { ...base.faceHandling, ...(overrides.faceHandling || {}) },
      reflowRules: { ...base.reflowRules, ...(overrides.reflowRules || {}) },
    };
  }

  private applyBrandDNAOverrides(
    recipe: DesignFamilyRecipe,
    brandDNA: any,
    context?: any
  ): DesignFamilyRecipe {
    if (!brandDNA) return recipe;

    const updated = JSON.parse(JSON.stringify(recipe));

    // Palette Rotation Logic
    const bg = brandDNA.backgroundBrandColor || '#FFFFFF';
    const primary = brandDNA.primaryBrandColor || '#000000';
    const depth = brandDNA.depthBrandColor || brandDNA.primaryBrandColor || '#222222';
    const accent = brandDNA.accentBrandColor || brandDNA.secondaryBrandColor || '#CCCCCC';
    const secondary = brandDNA.secondaryBrandColor || '#888888';

    const slideIndex = context?.slideIndex || 0;
    const rotation = slideIndex % 3;

    if (rotation === 0) {
      updated.colors.headline = depth;
      updated.colors.body = primary;
      updated.colors.decorative = accent;
      updated.colors.supporting = secondary;
    } else if (rotation === 1) {
      updated.colors.headline = primary;
      updated.colors.body = depth;
      updated.colors.decorative = secondary;
      updated.colors.supporting = accent;
    } else {
      updated.colors.headline = depth;
      updated.colors.body = secondary;
      updated.colors.decorative = primary;
      updated.colors.supporting = accent;
    }

    // IMMUTABLE BRAND ASSETS: BrandDNA defines the font family, family defines expression
    if (brandDNA.fonts?.headline || brandDNA.primaryFont) {
      updated.typographyScale.fontFamilies.headline = brandDNA.fonts?.headline || brandDNA.primaryFont;
    }
    if (brandDNA.fonts?.body || brandDNA.secondaryFont) {
      updated.typographyScale.fontFamilies.body = brandDNA.fonts?.body || brandDNA.secondaryFont;
    }

    // Adjust spacing based on brand tier (keeping structural tweaks only)
    if (brandDNA.brandTier === 'luxury') {
      updated.spacing.whitespaceRatio = Math.max(updated.spacing.whitespaceRatio, 0.5);
      updated.spacing.topBuffer = Math.max(updated.spacing.topBuffer, 0.12);
      updated.spacing.bottomBuffer = Math.max(updated.spacing.bottomBuffer, 0.15);
    } else if (brandDNA.brandTier === 'accessible') {
      updated.spacing.whitespaceRatio = Math.min(updated.spacing.whitespaceRatio, 0.35);
    }

    return updated;
  }

  /**
   * Get base font size for given canvas width
   * Used by composition planner
   */
  calculateBaseTypographySize(
    canvasWidth: number,
    recipe: DesignFamilyRecipe,
  ): number {
    // Base calculation: ~2-3% of canvas width
    // This is a heuristic that works across 1080px mobile and wider screens
    const baseSize = Math.max(16, Math.round(canvasWidth * 0.025));

    // Adjust based on whitespace ratio (more whitespace = larger text)
    const spacingFactor = recipe.spacing.whitespaceRatio > 0.5 ? 1.1 : 1.0;

    return Math.round(baseSize * spacingFactor);
  }
}
