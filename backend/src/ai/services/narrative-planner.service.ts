import { Injectable } from '@nestjs/common';
import { BusinessGoalType } from '../types/job-payload.types';

export interface SemanticSlide {
  slideType: string;
  description: string;
  semanticIntent?: {
    required: {
      visualPriority?: 'image_hero' | 'typography_hero' | 'composition_hero' | 'cta_hero';
    };
    preferred: {
      energy?: 'bold' | 'minimal' | 'playful' | 'calm' | 'structured';
      readingFlow?: 'center_down' | 'z_pattern' | 'asymmetrical';
    };
    weights: {
      visualPriority: number;
      readingFlow: number;
      energy: number;
    };
  };
}

export interface MarketingGoalRecipe {
  goal: BusinessGoalType;
  slideCount: number;
  semanticFlow: SemanticSlide[];
}

const DEFAULT_WEIGHTS = { visualPriority: 30, readingFlow: 15, energy: 10 };

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
            { slideType: 'HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Reveal Your Glow" using hook)', semanticIntent: { required: { visualPriority: 'typography_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'PROBLEM', description: 'Context — 3 WORDS MAX (e.g. "Clogged. Pores. Hurt.")', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'z_pattern' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'EXPLANATION', description: 'Deep Dive — 3 WORDS MAX (e.g. "Extraction. Clears. Everything.")', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'asymmetrical' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'PRO_TIP', description: 'Value — 3 WORDS MAX (e.g. "Safe. Proven. Glow.")', semanticIntent: { required: { visualPriority: 'image_hero' }, preferred: { energy: 'minimal', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', semanticIntent: { required: { visualPriority: 'cta_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } }
          ]
        };
        break;

      case 'retain_existing_clients': // Build Trust / Client Story
        recipe = {
          goal,
          slideCount: 4,
          semanticFlow: [
            { slideType: 'HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Life. Changing. Facial.")', semanticIntent: { required: { visualPriority: 'typography_hero' }, preferred: { energy: 'minimal', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CLIENT_QUOTE', description: 'Context — 3 WORDS MAX (e.g. "My skin transformed")', semanticIntent: { required: { visualPriority: 'typography_hero' }, preferred: { energy: 'minimal', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'TREATMENT_EXPERIENCE', description: 'Deep Dive — 3 WORDS MAX (e.g. "Calm. Relaxing. Space.")', semanticIntent: { required: { visualPriority: 'image_hero' }, preferred: { energy: 'calm', readingFlow: 'asymmetrical' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', semanticIntent: { required: { visualPriority: 'cta_hero' }, preferred: { energy: 'minimal', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } }
          ]
        };
        break;

      case 'fill_quiet_days': // Promotion
      case 'seasonal_promotion':
        recipe = {
          goal,
          slideCount: 3,
          semanticFlow: [
            { slideType: 'OFFER_HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Half. Price. Today.")', semanticIntent: { required: { visualPriority: 'typography_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'WHAT_IS_INCLUDED', description: 'Deep Dive — 3 WORDS MAX (e.g. "Facial. Massage. Mask.")', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', semanticIntent: { required: { visualPriority: 'cta_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } }
          ]
        };
        break;

      case 'attract_new_clients': // Showcase Result (Before/After)
      case 'promote_high_margin_services':
        recipe = {
          goal,
          slideCount: 4,
          semanticFlow: [
            { slideType: 'STRUGGLE_HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Acne. Scars. Redness.")', semanticIntent: { required: { visualPriority: 'image_hero' }, preferred: { energy: 'structured', readingFlow: 'asymmetrical' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'REVEAL', description: 'Value — 3 WORDS MAX (e.g. "Smooth. Clear. Skin.")', semanticIntent: { required: { visualPriority: 'image_hero' }, preferred: { energy: 'calm', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'TECHNIQUE', description: 'Deep Dive — 3 WORDS MAX (e.g. "Three. Sessions. Only.")', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'z_pattern' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', semanticIntent: { required: { visualPriority: 'cta_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } }
          ]
        };
        break;

      case 'launch_new_service': // Convert to booking
      default:
        recipe = {
          goal,
          slideCount: 4,
          semanticFlow: [
            { slideType: 'DESIRE_HOOK', description: 'Cover — 3 WORDS MAX (e.g. "Want. Glass. Skin.")', semanticIntent: { required: { visualPriority: 'typography_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'TREATMENT_ACTION', description: 'Deep Dive — 3 WORDS MAX (e.g. "Book. Our. Signature.")', semanticIntent: { required: { visualPriority: 'image_hero' }, preferred: { energy: 'minimal', readingFlow: 'asymmetrical' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'TRUST_EVIDENCE', description: 'Value — 3 WORDS MAX (e.g. "Five. Star. Rated.")', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CTA', description: 'Call to Action — 3 WORDS MAX (e.g. "Book Today" using CTA)', semanticIntent: { required: { visualPriority: 'cta_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } }
          ]
        };
        break;
    }
    
    return recipe;
  }
}
