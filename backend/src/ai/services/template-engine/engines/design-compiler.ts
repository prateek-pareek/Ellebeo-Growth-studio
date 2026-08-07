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

    // 2. Composition Strategy Compiler — subtle whitespace adjustments
    if (spec.composition) {
      if (spec.composition.negativeSpace === 'massive') {
        if (imageLayer) imageLayer.paddingPercent = Math.min(14, (imageLayer.paddingPercent || 8) + 3);
        textLayers.forEach(t => t.maxWidthPercent = 50);
      } else if (spec.composition.negativeSpace === 'large') {
        if (imageLayer) imageLayer.paddingPercent = Math.min(12, (imageLayer.paddingPercent || 8) + 2);
        textLayers.forEach(t => t.maxWidthPercent = 65);
      }
    }

    // 3. Typography Strategy Compiler (Behavioral Contrast & Dominance)
    if (spec.typography && textLayers.length > 0) {
      const heading = textLayers.find(t => t.role === 'heading');
      const tagline = textLayers.find(t => t.role === 'tagline');
      const body = textLayers.find(t => t.role === 'body');
      
      if (heading) {
        if (spec.typography.hierarchy === 'editorial') {
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

          if (spec.typography.headlineTreatment === 'experimental') {
            heading.rotation = -90; // Rotate vertically
            heading.anchor = 'middle_left'; // Push to the side
            heading.alignment = 'center';
          }
        }
      }
    }

    // 4. Decoration Strategy — Enforce Decoration Policy based on density
    if (spec.decorations) {
      let allowedCount = 5;
      let opacityMultiplier = 1.0;

      if (spec.decorations.density === 'none' || spec.decorations.density === 'low') {
        allowedCount = 0;
        opacityMultiplier = 0.0;
      } else if (spec.decorations.density === 'medium') {
        allowedCount = 1;
        opacityMultiplier = 0.7;
      } else if (spec.decorations.density === 'high') {
        allowedCount = 3;
        opacityMultiplier = 1.2;
      }

      let currentDecoCount = 0;
      compiledDsl.layers = compiledDsl.layers.filter(layer => {
        if (layer.type === 'decoration') {
          // Allow functional/structural borders, but limit heavy noise/shapes
          const isStructural = ['structural_border', 'thin_divider', 'divider'].includes(layer.component || '');
          if (!isStructural) {
            currentDecoCount++;
            if (currentDecoCount > allowedCount) return false;
            // Optionally mutate opacity if the layer supported it, for now we just filter count
          }
        }
        return true;
      });
    }

    return compiledDsl;
  }
}
