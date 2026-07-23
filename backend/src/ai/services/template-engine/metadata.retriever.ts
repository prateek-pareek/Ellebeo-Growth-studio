import { ITemplateMetadata, ITemplateRetriever, ITemplateCandidate, ITemplateContext } from './interfaces';
import templateLibraryData from '../../config/template-library.json';
import { DESIGN_FAMILIES } from '../../config/design-families.config';

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

    // 1. Load Rigid Templates
    for (const [id, raw] of Object.entries(this.library)) {
      const concept = raw.concept || '';
      const visualStructure = raw.visual_structure || '';
      const suitablePosts = raw.suitable_posts || [];
      const category = raw.category || 'General';

      const isSplit = id.includes('split') || visualStructure.toLowerCase().includes('split');
      const isHeavyOverlay = id.includes('overlay') || visualStructure.toLowerCase().includes('overlay');
      const macroFaceSafe = !(isSplit || isHeavyOverlay);

      const requiresText = visualStructure.toLowerCase().includes('caption') || 
                           visualStructure.toLowerCase().includes('quote') ||
                           visualStructure.toLowerCase().includes('text box');

      let textDensity: 'low' | 'medium' | 'high' = 'medium';
      if (visualStructure.toLowerCase().includes('massive') || visualStructure.toLowerCase().includes('large text')) {
        textDensity = 'high';
      } else if (visualStructure.toLowerCase().includes('minimal text') || visualStructure.toLowerCase().includes('no text')) {
        textDensity = 'low';
      }

      let premiumScore = 5;
      if (concept.toLowerCase().includes('luxury') || concept.toLowerCase().includes('premium') || concept.toLowerCase().includes('vogue')) {
        premiumScore = 9;
      } else if (concept.toLowerCase().includes('minimal') || concept.toLowerCase().includes('elegant')) {
        premiumScore = 8;
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
        occupiedTextZones: [], // We omit logic here for brevity, assume default
        type: 'rigid'
      });
    }

    // 2. Load Procedural Design Families
    for (const [id, family] of Object.entries(DESIGN_FAMILIES)) {
      candidates.push({
        id,
        category: 'Procedural Family',
        concept: `Dynamic Layout Family: ${id.replace(/_/g, ' ')}`,
        best_use_cases: ['Carousel', 'Instagram Post', 'Story'],
        macroFaceSafe: true, // Procedural can adapt
        requiresText: id.includes('text_palette'),
        supportsNoText: !id.includes('text_palette'),
        textDensity: 'medium',
        isCarouselOnly: false,
        premiumStyleScore: 10, // Families are inherently premium
        occupiedTextZones: [],
        type: 'procedural',
        familyConfig: family
      });
    }

    return candidates;
  }
}
