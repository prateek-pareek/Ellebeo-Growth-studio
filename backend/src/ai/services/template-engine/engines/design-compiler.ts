import { ICompiledLayoutDSL, ISemanticDesignSpec, IDSLImageLayer, IDSLTextLayer } from '../interfaces';
import { IDesignLanguage } from './art-direction-engine';

export class DesignCompiler {
  /**
   * Applies Art Direction / DesignSpec to a recipe DSL.
   *
   * Geometry contract: recipe mask / padding / anchors / maxWidthPercent / alignment
   * are AUTHORITATIVE. Same template ⇒ same placement. Spec may tune fonts, tracking,
   * casing, decoration density — never rewrite composition geometry.
   */
  compile(dsl: ICompiledLayoutDSL, config: ISemanticDesignSpec | IDesignLanguage): ICompiledLayoutDSL {
    const compiledDsl: ICompiledLayoutDSL = JSON.parse(JSON.stringify(dsl));

    const imageLayer = compiledDsl.layers.find(l => l.type === 'image') as IDSLImageLayer | undefined;
    const textLayers = compiledDsl.layers.filter(l => l.type === 'text') as IDSLTextLayer[];

    const recipeImage = imageLayer
      ? {
          mask: imageLayer.mask,
          paddingPercent: imageLayer.paddingPercent,
          anchor: imageLayer.anchor,
          orientation: (imageLayer as any).orientation,
        }
      : null;
    const recipeText = textLayers.map(t => ({
      id: t.id,
      anchor: t.anchor,
      alignment: t.alignment,
      maxWidthPercent: t.maxWidthPercent,
    }));

    if ('behavior' in config) {
      const lang = config as IDesignLanguage;
      const behavior = lang.behavior;
      (compiledDsl as any).behavior = behavior;

      // Fonts / tracking / casing only — never rewrite image padding from bleed extent
      if (textLayers.length > 0) {
        const heading = textLayers.find(t => t.role === 'heading');
        const tagline = textLayers.find(t => t.role === 'tagline');
        const body = textLayers.find(t => t.role === 'body');

        if (heading) {
          (heading as any).fontSize = behavior.heroBaseFontSize;
          (heading as any).tracking = behavior.trackingHero;
          (heading as any).lineHeight = behavior.lineHeightMultiplier;
          (heading as any).capitalizationRule = behavior.capitalizationRule;
        }
        if (tagline) {
          (tagline as any).fontSize = behavior.metadataBaseFontSize;
          (tagline as any).tracking = behavior.trackingMetadata;
          (tagline as any).capitalizationRule = behavior.capitalizationRule;
          (tagline as any).opacity = behavior.secondaryTextOpacity;
        }
        if (body) {
          (body as any).fontSize = behavior.bodyBaseFontSize;
          (body as any).lineHeight = behavior.lineHeightMultiplier;
          (body as any).opacity = behavior.secondaryTextOpacity;
        }
      }

      this.restoreRecipeGeometry(imageLayer, textLayers, recipeImage, recipeText);
      return compiledDsl;
    }

    const spec = config as ISemanticDesignSpec;

    // Photo: style flags only (triptych). Padding/anchor stay on the recipe.
    if (imageLayer && spec.photo?.imageExecution === 'triptych') {
      imageLayer.layoutMode = 'triptych';
    }

    // Typography: soft tracking signal only — never rotate/re-anchor the recipe
    if (spec.typography && textLayers.length > 0) {
      const heading = textLayers.find(t => t.role === 'heading');
      if (heading && spec.typography.headlineTreatment === 'experimental' && !(heading as any).rotation) {
        (heading as any).tracking = (heading as any).tracking || '0.04em';
      }
    }

    // Decorations: density tunes presence; recipe-defined structural layers stay
    if (spec.decorations) {
      let allowedCount = 5;
      let opacityMultiplier = 1.0;

      if (spec.decorations.density === 'none') {
        allowedCount = 0;
        opacityMultiplier = 0.55;
      } else if (spec.decorations.density === 'low') {
        allowedCount = 2;
        opacityMultiplier = 0.55;
      } else if (spec.decorations.density === 'medium') {
        allowedCount = 3;
        opacityMultiplier = 0.75;
      } else if (spec.decorations.density === 'high') {
        allowedCount = 5;
        opacityMultiplier = 1.15;
      }

      let currentDecoCount = 0;
      compiledDsl.layers = compiledDsl.layers.filter(layer => {
        if (layer.type === 'decoration') {
          const isStructural = ['structural_border', 'thin_divider', 'divider', 'accent_rule', 'margin_rule'].includes((layer as any).component || '');
          if (!isStructural) {
            currentDecoCount++;
            if (currentDecoCount > allowedCount) return false;
          }
        }
        return true;
      });

      compiledDsl.primitiveTokens = {
        opacityMultiplier: Math.max(0.45, opacityMultiplier),
        baseStrokeWeight: spec.style.mood === 'luxury' ? 1.0 : (spec.decorations.density === 'high' ? 2.0 : 1.5),
        shadowDepth: spec.style.mood === 'luxury' ? 'soft' : 'medium',
        moodAdjustments: {
          contrast: spec.style.mood === 'minimalist' ? 0.7 : 1.0,
          saturation: spec.style.mood === 'organic' ? 1.1 : 1.0,
        },
      };
    }

    this.restoreRecipeGeometry(imageLayer, textLayers, recipeImage, recipeText);
    return compiledDsl;
  }

  /** Re-apply recipe mask/padding/anchors after any design-spec pass. */
  private restoreRecipeGeometry(
    imageLayer: IDSLImageLayer | undefined,
    textLayers: IDSLTextLayer[],
    recipeImage: { mask?: string; paddingPercent?: number; anchor?: string; orientation?: string } | null,
    recipeText: Array<{ id: string; anchor?: string; alignment?: string; maxWidthPercent?: number }>,
  ): void {
    if (imageLayer && recipeImage) {
      if (recipeImage.mask != null) imageLayer.mask = recipeImage.mask as any;
      if (recipeImage.paddingPercent != null) imageLayer.paddingPercent = recipeImage.paddingPercent;
      if (recipeImage.anchor != null) imageLayer.anchor = recipeImage.anchor as any;
      if (recipeImage.orientation != null) (imageLayer as any).orientation = recipeImage.orientation;
    }
    for (const snap of recipeText) {
      const layer = textLayers.find(t => t.id === snap.id);
      if (!layer) continue;
      if (snap.anchor != null) layer.anchor = snap.anchor as any;
      if (snap.alignment != null) layer.alignment = snap.alignment as any;
      if (snap.maxWidthPercent != null) layer.maxWidthPercent = snap.maxWidthPercent;
    }
  }
}
