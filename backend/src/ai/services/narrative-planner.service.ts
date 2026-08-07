import { Injectable } from '@nestjs/common';
import { BusinessGoalType } from '../types/job-payload.types';

export interface SemanticSlide {
  slideType: string;
  description: string;
  requiredTraits?: {
    visualPriority?: 'image_hero' | 'typography_hero' | 'composition_hero' | 'cta_hero';
    energy?: 'bold' | 'minimal' | 'playful';
    readingFlow?: 'center_down' | 'z_pattern' | 'asymmetrical';
  };
}

export interface MarketingGoalRecipe {
  goal: BusinessGoalType;
  slideCount: number;
  semanticFlow: SemanticSlide[];
}

@Injectable()
export class NarrativePlannerService {
  
  public getRecipe(goal: BusinessGoalType): MarketingGoalRecipe {
    let recipe: MarketingGoalRecipe;
    
    switch (goal) {
      case 'build_brand_authority': // Educational
        recipe = {
          goal,
          slideCount: 5,
          semanticFlow: [
            { slideType: 'HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Reveal Your Glow" using hook)', requiredTraits: { visualPriority: 'typography_hero', energy: 'bold' } },
            { slideType: 'PROBLEM', description: 'Context — 3 WORDS MAX (e.g. "Clogged. Pores. Hurt.")', requiredTraits: { visualPriority: 'composition_hero', readingFlow: 'z_pattern' } },
            { slideType: 'EXPLANATION', description: 'Deep Dive — 3 WORDS MAX (e.g. "Extraction. Clears. Everything.")', requiredTraits: { visualPriority: 'composition_hero' } },
            { slideType: 'PRO_TIP', description: 'Value — 3 WORDS MAX (e.g. "Safe. Proven. Glow.")', requiredTraits: { visualPriority: 'image_hero', energy: 'minimal' } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', requiredTraits: { visualPriority: 'cta_hero', energy: 'bold' } }
          ]
        };
        break;

      case 'retain_existing_clients': // Build Trust / Client Story
        recipe = {
          goal,
          slideCount: 4,
          semanticFlow: [
            { slideType: 'HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Life. Changing. Facial.")', requiredTraits: { visualPriority: 'typography_hero' } },
            { slideType: 'CLIENT_QUOTE', description: 'Context — 3 WORDS MAX (e.g. "My skin transformed")', requiredTraits: { visualPriority: 'typography_hero', energy: 'minimal' } },
            { slideType: 'TREATMENT_EXPERIENCE', description: 'Deep Dive — 3 WORDS MAX (e.g. "Calm. Relaxing. Space.")', requiredTraits: { visualPriority: 'image_hero' } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', requiredTraits: { visualPriority: 'cta_hero' } }
          ]
        };
        break;

      case 'fill_quiet_days': // Promotion
      case 'seasonal_promotion':
        recipe = {
          goal,
          slideCount: 3,
          semanticFlow: [
            { slideType: 'OFFER_HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Half. Price. Today.")', requiredTraits: { visualPriority: 'typography_hero', energy: 'bold' } },
            { slideType: 'WHAT_IS_INCLUDED', description: 'Deep Dive — 3 WORDS MAX (e.g. "Facial. Massage. Mask.")', requiredTraits: { visualPriority: 'composition_hero', readingFlow: 'center_down' } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', requiredTraits: { visualPriority: 'cta_hero', energy: 'bold' } }
          ]
        };
        break;

      case 'attract_new_clients': // Showcase Result (Before/After)
      case 'promote_high_margin_services':
        recipe = {
          goal,
          slideCount: 4,
          semanticFlow: [
            { slideType: 'STRUGGLE_HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Acne. Scars. Redness.")', requiredTraits: { visualPriority: 'image_hero' } },
            { slideType: 'REVEAL', description: 'Value — 3 WORDS MAX (e.g. "Smooth. Clear. Skin.")', requiredTraits: { visualPriority: 'image_hero' } },
            { slideType: 'TECHNIQUE', description: 'Deep Dive — 3 WORDS MAX (e.g. "Three. Sessions. Only.")', requiredTraits: { visualPriority: 'composition_hero' } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', requiredTraits: { visualPriority: 'cta_hero' } }
          ]
        };
        break;

      case 'launch_new_service': // Convert to booking
      default:
        recipe = {
          goal,
          slideCount: 4,
          semanticFlow: [
            { slideType: 'DESIRE_HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Want. Glass. Skin.")', requiredTraits: { visualPriority: 'typography_hero' } },
            { slideType: 'TREATMENT_ACTION', description: 'Deep Dive — 3 WORDS MAX (e.g. "Book. Our. Signature.")', requiredTraits: { visualPriority: 'image_hero' } },
            { slideType: 'TRUST_EVIDENCE', description: 'Value — 3 WORDS MAX (e.g. "Five. Star. Rated.")', requiredTraits: { visualPriority: 'composition_hero' } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', requiredTraits: { visualPriority: 'cta_hero', energy: 'bold' } }
          ]
        };
        break;
    }
    
    return recipe;
  }
}
