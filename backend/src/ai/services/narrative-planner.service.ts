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
  /** Optional filter traits a candidate must satisfy (co-worker extension — no-op until populated). */
  requiredTraits?: string[];
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
      case 'build_brand_authority': // Educational: Hook → Problem → Explanation → Solution → CTA
        recipe = {
          goal,
          slideCount: 5,
          semanticFlow: [
            { slideType: 'HOOK', description: 'Cover hook — punchy headline (3–5 words) + one-line intrigue. Teach curiosity, not the full lesson yet.', semanticIntent: { required: { visualPriority: 'typography_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'PROBLEM', description: 'Problem — name the client pain clearly. Headline 3–6 words; subheadline explains why it matters (10–18 words). Educational, specific to the service.', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'z_pattern' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'EXPLANATION', description: 'Explanation — teach one concrete mechanism or technique. Headline names the method; subheadline gives the educational why/how (12–20 words).', semanticIntent: { required: { visualPriority: 'composition_hero' }, preferred: { energy: 'structured', readingFlow: 'asymmetrical' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'SOLUTION', description: 'Solution / Process — what you do and the outcome. Headline = result; subheadline = process step or proof (10–18 words).', semanticIntent: { required: { visualPriority: 'image_hero' }, preferred: { energy: 'minimal', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } },
            { slideType: 'CTA', description: 'Call to Action — clear booking CTA using cta. Headline invites action; cta field must be explicit (e.g. Book a consult / DM to book).', semanticIntent: { required: { visualPriority: 'cta_hero' }, preferred: { energy: 'bold', readingFlow: 'center_down' }, weights: DEFAULT_WEIGHTS } }
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
