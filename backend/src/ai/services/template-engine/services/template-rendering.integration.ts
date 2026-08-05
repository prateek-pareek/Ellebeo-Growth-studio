/**
 * TemplateRenderingIntegration
 * RESPONSIBILITY: Tie together recipe resolver, composition planner, and quality judge
 * This is the main entry point for rendering operations
 */

import { Injectable } from '@nestjs/common';
import { DesignFamilyRecipe, CompositionPlan } from '../types/design-recipe.type';
import { RecipeResolverService } from './recipe-resolver.service';
import { CompositionPlannerService } from './composition-planner.service';
import { QualityJudgeService } from './quality-judge.service';
import { SceneGraphRendererService } from './scene-graph-renderer.service';
@Injectable()
export class TemplateRenderingIntegration {

  constructor(
    private recipeResolver: RecipeResolverService,
    private compositionPlanner: CompositionPlannerService,
    private renderer: SceneGraphRendererService,
    private qualityJudge: QualityJudgeService,
  ) {}

  /**
   * Main rendering pipeline
   * Input: template family/variant + copy + images + brand DNA
   * Output: CompositionPlan (ready for rendering engines)
   */
  async renderTemplate(input: {
    // Template
    familyId: string;
    variantId?: string;

    // Content
    copy: {
      headline: string;
      body?: string;
      cta?: string;
      caption?: string;
    };
    images: {
      main: any;
      secondary?: any;
    };

    // Brand
    brandDNA: any;

    // Context
    canvas?: { width: number; height: number };
    vision?: { faceCoordinates?: any; qualityScore?: number };
  }): Promise<{
    plan: CompositionPlan;
    valid: boolean;
    violations?: string[];
  } | {
    error: string;
    suggestion: string;
  }> {
    const canvas = input.canvas || { width: 1080, height: 1920 };

    // 1. Resolve recipe (family + variant + Brand DNA)
    let recipe: any;
    try {
      recipe = this.recipeResolver.resolveRecipe(
        input.familyId,
        input.variantId || null,
        input.brandDNA,
        {
          tenantId: 'system',
          slideIndex: 1,
          sceneType: canvas.width > canvas.height ? 'Landscape' : 'Portrait',
        }
      );
    } catch (err) {
      return {
        error: 'RECIPE_RESOLUTION_FAILED',
        suggestion: `Failed to load recipe for family: ${input.familyId}`,
      };
    }

    // 2. Calculate composition plan
    const planResult = await this.compositionPlanner.calculatePlan(recipe, {
      copy: input.copy,
      images: input.images,
      canvas,
      vision: input.vision ? {
        faceCoordinates: input.vision.faceCoordinates,
        qualityScore: input.vision.qualityScore ?? 0.5,
      } : undefined,
    });

    // Handle reflow needed
    if ('error' in planResult) {
      return planResult;
    }

    const plan = planResult;

    // 3. Validate plan
    const validation = this.qualityJudge.validatePlan(plan);
    if (!validation.valid) {
      console.warn('Plan validation issues:', validation.issues);
    }

    // 4. Post-render validation (basic structure checks)
    // This is done before rendering to catch structural issues early
    const structureCheck = this.validatePlanStructure(plan);
    if (!structureCheck.valid) {
      return {
        error: 'PLAN_STRUCTURE_INVALID',
        suggestion: `Plan structure check failed: ${structureCheck.issues.join(', ')}`,
      };
    }

    return {
      plan,
      valid: validation.valid,
      violations: validation.issues.length > 0 ? validation.issues : undefined,
    };
  }

  /**
   * Quick plan structure validation
   */
  private validatePlanStructure(plan: CompositionPlan): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Logo must be positioned
    if (!plan.layout.logo || plan.layout.logo.width === 0) {
      issues.push('Logo not properly positioned');
    }

    // Image must be positioned
    if (!plan.layout.image || plan.layout.image.width === 0) {
      issues.push('Image not properly positioned');
    }

    // Headline must exist
    if (!plan.layout.headline) {
      issues.push('Headline layout missing');
    }

    // Typography specs must exist
    if (!plan.typography.headline) {
      issues.push('Headline typography spec missing');
    }

    // Constraints must be defined
    if (!plan.constraints.logoReservedZone) {
      issues.push('Logo reserved zone not defined');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get available families (for UI)
   */
  getAvailableFamilies(): Array<{ id: string; name: string }> {
    return [
      { id: 'editorial', name: 'Editorial Magazine' },
      { id: 'clinical', name: 'Clinical Minimalist' },
      { id: 'premium', name: 'Premium Luxury' },
      { id: 'minimalist', name: 'Minimalist' },
      { id: 'testimonial', name: 'Testimonial' },
      { id: 'split', name: 'Split Layout' },
      { id: 'before_after', name: 'Before-After' },
      { id: 'countdown_promo', name: 'Countdown Promo' },
      { id: 'product_showcase', name: 'Product Showcase' },
      { id: 'quadrant', name: 'Quadrant Grid' },
      { id: 'scrapbook', name: 'Scrapbook' },
      { id: 'text_only', name: 'Text Only' },
    ];
  }

  /**
   * Get available variants for a family
   */
  getVariantsForFamily(familyId: string): Array<{ id: string; name: string }> {
    const variants: Record<string, Array<{ id: string; name: string }>> = {
      editorial: [
        { id: 'editorial_magazine_cover', name: 'Magazine Cover' },
        { id: 'editorial_portrait_hero', name: 'Portrait Hero' },
      ],
      clinical: [
        { id: 'clinical_before_after', name: 'Before-After' },
      ],
      premium: [
        { id: 'premium_luxury_card', name: 'Luxury Card' },
      ],
      minimalist: [
        { id: 'minimalist_zen', name: 'Zen Quote' },
      ],
    };

    return variants[familyId] || [];
  }
}
