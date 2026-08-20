import { Module } from '@nestjs/common';
import { RecipeResolverService } from './services/recipe-resolver.service';
import { CompositionPlannerService } from './services/composition-planner.service';
import { QualityJudgeService } from './services/quality-judge.service';
import { TemplateRenderingIntegration } from './services/template-rendering.integration';

@Module({
  providers: [
    RecipeResolverService,
    CompositionPlannerService,
    QualityJudgeService,
    TemplateRenderingIntegration,
  ],
  exports: [
    RecipeResolverService,
    CompositionPlannerService,
    QualityJudgeService,
    TemplateRenderingIntegration,
  ],
})
export class TemplateEngineModule {}
