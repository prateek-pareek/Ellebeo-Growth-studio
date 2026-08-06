import { Injectable } from '@nestjs/common';
import { CompositionPlan } from '../types/design-recipe.type';

/**
 * QualityJudge
 * RESPONSIBILITY: Validate recipe was executed properly
 * NOT: Score subjective feelings like "does it feel premium"
 * PRINCIPLE: Hard pass/fail on objective constraints only
 */
@Injectable()
export class QualityJudgeService {
  /**
   * Validate a rendered slide against composition plan
   */
  validateSlide(
    plan: CompositionPlan,
    renderedImage: Buffer,
  ): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // 1. Text readability check
    if (plan.typography.headline.fontSize < plan.validation.minHeadlineSize) {
      violations.push(`Headline too small: ${plan.typography.headline.fontSize}px < ${plan.validation.minHeadlineSize}px`);
    }

    if (plan.typography.body?.fontSize < plan.validation.minBodySize) {
      violations.push(`Body text too small: ${plan.typography.body.fontSize}px < ${plan.validation.minBodySize}px`);
    }

    // 2. Logo safety check
    if (plan.layout.logo.width === 0 || plan.layout.logo.height === 0) {
      violations.push('Logo has zero dimensions');
    }

    // 3. Primitive visibility check (basic)
    for (const primitive of plan.primitives) {
      if (primitive.opacity < 0.1) {
        violations.push(`Primitive ${primitive.id} has very low opacity: ${primitive.opacity}`);
      }
    }

    // 4. Content zone check
    if (!plan.constraints.textContentZone) {
      violations.push('Text content zone not defined');
    }

    // 5. Hierarchy check (headline must be larger than body)
    if (plan.typography.body && plan.typography.headline.fontSize <= plan.typography.body.fontSize) {
      violations.push('Headline not larger than body text');
    }

    const valid = violations.length === 0;

    return {
      valid,
      violations,
    };
  }

  /**
   * Quick validation (pre-render)
   */
  validatePlan(plan: CompositionPlan): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check logo is positioned
    if (plan.layout.logo.x === undefined || plan.layout.logo.y === undefined) {
      issues.push('Logo not positioned');
    }

    // Check headline exists
    if (!plan.layout.headline) {
      issues.push('No headline layout');
    }

    // Check typography specs exist
    if (!plan.typography.headline) {
      issues.push('No headline typography spec');
    }

    // Check constraints are defined
    if (!plan.constraints.logoReservedZone) {
      issues.push('Logo reserved zone not defined');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
