import { ITemplateMetadata, ITemplateRetriever, ITemplateCandidate, ITemplateContext } from './interfaces';
import templateLibraryData from '../../config/template-library.json';

export class MetadataRetriever implements ITemplateRetriever {
  private library: Record<string, any> = {};

  constructor() {
    try {
      this.library = JSON.parse(JSON.stringify(templateLibraryData));
      // Remove any internal configs like _proposed_template_agent_library
      Object.keys(this.library).forEach(key => {
        if (key.startsWith('_')) delete this.library[key];
      });
    } catch (e) {
      console.error('Failed to load template library', e);
    }
  }

  async retrieveCandidates(context: ITemplateContext): Promise<ITemplateCandidate[]> {
    const candidates: ITemplateCandidate[] = [];

    for (const [id, raw] of Object.entries(this.library)) {
      // Safely infer metadata from unstructured JSON to structured constraints
      const concept = raw.concept || '';
      const visualStructure = raw.visual_structure || '';
      const suitablePosts = raw.suitable_posts || [];
      const textConfig = raw.textTemplate || '';
      const category = raw.category || 'General';

      // Advanced Inference Logic
      // 1. If it's a split screen, or has large overlays, it is NOT macroFaceSafe.
      const isSplit = id.includes('split') || visualStructure.toLowerCase().includes('split');
      const isHeavyOverlay = id.includes('overlay') || visualStructure.toLowerCase().includes('overlay');
      const macroFaceSafe = !(isSplit || isHeavyOverlay);

      // 2. Does it require text?
      const requiresText = visualStructure.toLowerCase().includes('caption') || 
                           visualStructure.toLowerCase().includes('quote') ||
                           visualStructure.toLowerCase().includes('text box');

      // 3. Text Density
      let textDensity: 'low' | 'medium' | 'high' = 'medium';
      if (visualStructure.toLowerCase().includes('massive') || visualStructure.toLowerCase().includes('large text')) {
        textDensity = 'high';
      } else if (visualStructure.toLowerCase().includes('minimal text') || visualStructure.toLowerCase().includes('no text')) {
        textDensity = 'low';
      }

      // 4. Premium Style
      let premiumScore = 5;
      if (concept.toLowerCase().includes('luxury') || concept.toLowerCase().includes('premium') || concept.toLowerCase().includes('vogue')) {
        premiumScore = 9;
      } else if (concept.toLowerCase().includes('minimal') || concept.toLowerCase().includes('elegant')) {
        premiumScore = 8;
      }

      // 5. Occupied Text Zones (For Collision Avoidance)
      const occupiedTextZones: { yMinPercent: number, yMaxPercent: number }[] = [];
      const textRegionsStr = (raw.visual_structure?.text_regions || visualStructure).toLowerCase();
      
      if (textRegionsStr.includes('top')) {
        occupiedTextZones.push({ yMinPercent: 0, yMaxPercent: 35 });
      }
      if (textRegionsStr.includes('bottom')) {
        occupiedTextZones.push({ yMinPercent: 65, yMaxPercent: 100 });
      }
      if (textRegionsStr.includes('center') || textRegionsStr.includes('middle')) {
        occupiedTextZones.push({ yMinPercent: 35, yMaxPercent: 65 });
      }
      
      // Default to bottom text if no specific region is found to avoid over-filtering
      if (occupiedTextZones.length === 0) {
        occupiedTextZones.push({ yMinPercent: 70, yMaxPercent: 100 });
      }

      candidates.push({
        id,
        category,
        concept,
        best_use_cases: suitablePosts,
        macroFaceSafe,
        requiresText,
        supportsNoText: !requiresText,
        textDensity,
        isCarouselOnly: id.includes('carousel_only') || suitablePosts.includes('Carousel'),
        premiumStyleScore: premiumScore,
        occupiedTextZones
      });
    }

    return candidates;
  }
}
