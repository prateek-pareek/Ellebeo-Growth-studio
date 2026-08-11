import { ICompiledLayoutDSL, ISemanticDesignSpec, IDSLImageLayer, IDSLTextLayer } from '../interfaces';
import { IDesignLanguage } from './art-direction-engine';

export class DesignCompiler {
  /**
   * Translates the AI's Semantic DesignSpec or Art Direction Language into hard 
   * mathematical execution rules for the Renderer by mutating the DSL layer properties.
   */
  compile(dsl: ICompiledLayoutDSL, config: ISemanticDesignSpec | IDesignLanguage): ICompiledLayoutDSL {
    // Deep clone the DSL so we don't mutate the global registry
    const compiledDsl: ICompiledLayoutDSL = JSON.parse(JSON.stringify(dsl));

    const imageLayer = compiledDsl.layers.find(l => l.type === 'image') as IDSLImageLayer | undefined;
    const textLayers = compiledDsl.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    
    // Check if we are using the new Art Direction Engine
    if ('behavior' in config) {
      const lang = config as IDesignLanguage;
      const behavior = lang.behavior;
      
      // We pass the behavior profile globally to the DSL so engines can read it
      (compiledDsl as any).behavior = behavior;
      
      if (imageLayer) {
        if (behavior.imageBleedExtent === 'full') {
          imageLayer.paddingPercent = 0;
        } else if (behavior.imageBleedExtent === 'contained_70') {
          imageLayer.paddingPercent = 15; // approximate containment padding
        } else if (behavior.imageBleedExtent === 'asymmetrical_65') {
          imageLayer.paddingPercent = 0; // The layout engine will handle the crop
        }
      }

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
      return compiledDsl;
    }
    
    const spec = config as ISemanticDesignSpec;
    
    // 1. Photo Strategy Compiler — gentle relative adjustments that respect template defaults
    if (imageLayer && spec.photo) {
      const currentPadding = imageLayer.paddingPercent || 8;

      if (spec.photo.role === 'supporting') {
        imageLayer.paddingPercent = Math.min(18, currentPadding + 6); // Dramatic zoom-out for supporting elements
        imageLayer.anchor = spec.composition?.balance === 'asymmetrical' ? 'bottom_right' : imageLayer.anchor || 'center';
      } else if (spec.photo.role === 'hero') {
        // Tension zoom-out logic removed to respect template defaults and variety
        imageLayer.paddingPercent = currentPadding;
      } else if (spec.photo.role === 'background' || spec.photo.role === 'texture') {
        imageLayer.paddingPercent = 0; // Full bleed
      }

      if (spec.photo.treatment === 'floating') {
        imageLayer.paddingPercent = Math.min(14, (imageLayer.paddingPercent || 8) + 2);
      }

      if (spec.photo.imageExecution === 'triptych') {
        imageLayer.layoutMode = 'triptych';
      }
    }

    // 2. Composition Strategy Compiler — graded whitespace adjustments across the full
    // enum (previously only 'massive'/'large' had any effect; 'medium'/'minimal' silently
    // no-op'd even though the LLM picks them just as often).
    if (spec.composition) {
      const negativeSpaceRules: Record<string, { paddingBump: number; maxWidthPercent: number }> = {
        minimal: { paddingBump: 0, maxWidthPercent: 85 },
        medium: { paddingBump: 1, maxWidthPercent: 75 },
        large: { paddingBump: 2, maxWidthPercent: 65 },
        massive: { paddingBump: 3, maxWidthPercent: 50 },
      };
      const rule = negativeSpaceRules[spec.composition.negativeSpace] || negativeSpaceRules.medium;
      if (imageLayer) imageLayer.paddingPercent = Math.min(14, (imageLayer.paddingPercent || 8) + rule.paddingBump);
      textLayers.forEach(t => t.maxWidthPercent = rule.maxWidthPercent);
    }

    // 3. Typography Strategy Compiler (Behavioral Contrast & Dominance)
    if (spec.typography && textLayers.length > 0) {
      const heading = textLayers.find(t => t.role === 'heading');
      const tagline = textLayers.find(t => t.role === 'tagline');
      const body = textLayers.find(t => t.role === 'body');

      if (heading) {
        // 'editorial' and 'technical' hierarchies both read as deliberate/structured
        // and benefit from the same asymmetrical-aware left-alignment sync; 'bold' and
        // 'minimal' hierarchies are left at the template's own default alignment since
        // forcing them left has no clear typographic justification.
        if (spec.typography.hierarchy === 'editorial' || spec.typography.hierarchy === 'technical') {
          const isAsymmetrical = spec.composition?.balance === 'asymmetrical';
          heading.alignment = isAsymmetrical ? 'left' : heading.alignment || 'center';

          // TypographyEngine resolves box position/width from BOTH alignment
          // and the layer's structural anchor. Setting alignment='left' above
          // without also moving a center/right-type anchor (e.g. the
          // 'bottom_center' many recipes use) left the two fields disagreeing
          // — TypographyEngine's width-availability math then measured from
          // the wrong reference point (anchor's x), producing a badly
          // undersized/mispositioned box (seen as heading text truncated at
          // the canvas edge on mined testimonial entries). Keep the anchor's
          // vertical component but make it genuinely left so both fields
          // agree on where the box actually is.
          if (isAsymmetrical) {
            const currentAnchor = String(heading.anchor || '');
            if (currentAnchor.includes('top')) heading.anchor = 'top_left';
            else if (currentAnchor.includes('bottom')) heading.anchor = 'bottom_left';
            else heading.anchor = 'middle_left';
          }
        }

        // Explicit alignment on the spec is a more direct signal than the
        // hierarchy-inferred default above — it wins when present, on all
        // three heading/tagline/body roles.
        if (spec.typography.alignment) {
          heading.alignment = spec.typography.alignment;
          if (tagline) tagline.alignment = spec.typography.alignment;
          if (body) body.alignment = spec.typography.alignment;
        }

        // headlineTreatment is independent of hierarchy — it previously only ever
        // fired when hierarchy also happened to be 'editorial', silently dropping it
        // for every other hierarchy value.
        if (spec.typography.headlineTreatment === 'experimental') {
          heading.rotation = -90; // Rotate vertically
          heading.anchor = 'middle_left'; // Push to the side
          heading.alignment = 'center';
        }
      }
    }

    // 4. Decoration Strategy — density tunes presence, must not erase family DNA
    if (spec.decorations) {
      let allowedCount = 5;
      let opacityMultiplier = 1.0;

      if (spec.decorations.density === 'none') {
        // Truly none: keep only structural lines
        allowedCount = 0;
        opacityMultiplier = 0.55;
      } else if (spec.decorations.density === 'low') {
        // Low = subtle, NOT invisible — keep 1–2 family primitives visible
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

      // Never drive opacity to 0 — resolveOpacity floor would still leave ~0.02 (invisible)
      compiledDsl.primitiveTokens = {
        opacityMultiplier: Math.max(0.45, opacityMultiplier),
        baseStrokeWeight: spec.style.mood === 'luxury' ? 1.0 : (spec.decorations.density === 'high' ? 2.0 : 1.5),
        shadowDepth: spec.style.mood === 'luxury' ? 'soft' : 'medium',
        moodAdjustments: {
          contrast: spec.style.mood === 'minimalist' ? 0.7 : 1.0,
          saturation: spec.style.mood === 'organic' ? 1.1 : 1.0
        }
      };
    }


    return compiledDsl;
  }
}
