import { ICompiledLayoutDSL, ISemanticDesignSpec, IDSLImageLayer, IDSLTextLayer } from '../interfaces';

export class DesignCompiler {
  /**
   * Translates the AI's Semantic DesignSpec into hard mathematical execution rules 
   * for the Renderer by mutating the DSL layer properties.
   */
  compile(dsl: ICompiledLayoutDSL, spec: ISemanticDesignSpec): ICompiledLayoutDSL {
    // Deep clone the DSL so we don't mutate the global registry
    const compiledDsl: ICompiledLayoutDSL = JSON.parse(JSON.stringify(dsl));

    const imageLayer = compiledDsl.layers.find(l => l.type === 'image') as IDSLImageLayer | undefined;
    const textLayers = compiledDsl.layers.filter(l => l.type === 'text') as IDSLTextLayer[];
    
    // 1. Photo Strategy Compiler — gentle relative adjustments that respect template defaults
    if (imageLayer && spec.photo) {
      const currentPadding = imageLayer.paddingPercent || 8;

      if (spec.photo.role === 'supporting') {
        imageLayer.paddingPercent = Math.min(12, currentPadding + 2);
        imageLayer.anchor = spec.composition?.balance === 'asymmetrical' ? 'bottom_right' : imageLayer.anchor || 'center';
      } else if (spec.photo.role === 'hero') {
        imageLayer.paddingPercent = Math.min(8, currentPadding);
      } else if (spec.photo.role === 'background' || spec.photo.role === 'texture') {
        imageLayer.paddingPercent = 0; // Full bleed
      }

      if (spec.photo.treatment === 'floating') {
        imageLayer.paddingPercent = Math.min(14, (imageLayer.paddingPercent || 8) + 2);
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

    // 3. Typography Strategy Compiler
    if (spec.typography && textLayers.length > 0) {
      const heading = textLayers.find(t => t.role === 'heading');
      if (heading) {
        if (spec.typography.hierarchy === 'editorial') {
          heading.alignment = spec.composition?.balance === 'asymmetrical' ? 'left' : heading.alignment || 'center';
        }
      }
    }

    // 4. Decoration Strategy — preserve template integrity without unrequested auto-injections
    return compiledDsl;
  }
}
