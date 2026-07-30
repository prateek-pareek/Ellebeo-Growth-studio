import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MetadataRetriever } from './template-engine/metadata.retriever';
import { HardConstraintEngine } from './template-engine/hard-constraint.engine';
import { RankingEngine } from './template-engine/ranking.engine';
import { DiversityEngine } from './template-engine/diversity.engine';
import { ITemplateContext } from './template-engine/interfaces';
import { LayoutAssemblerService } from './template-engine/layout-assembler.service';
import { registerDynamicLayout } from '../config/layout-renderers';

@Injectable()
export class TemplateAgentService {
  private openai: OpenAI;
  private logger = new Logger(TemplateAgentService.name);
  
  private retriever: MetadataRetriever;
  private hardConstraintEngine: HardConstraintEngine;
  private rankingEngine: RankingEngine;
  private diversityEngine: DiversityEngine;
  private layoutAssembler: LayoutAssemblerService;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    
    // Initialize Pipeline Engines
    this.retriever = new MetadataRetriever();
    this.hardConstraintEngine = new HardConstraintEngine();
    this.rankingEngine = new RankingEngine();
    this.diversityEngine = new DiversityEngine();
    this.layoutAssembler = new LayoutAssemblerService();
  }

  /**
   * Enterprise Template Selection Pipeline (5-Stage Architecture)
   */
  async selectTemplate(params: {
    brief: string;
    brandName: string;
    aesthetic: string;
    textLength: number;
    slideIndex: number;
    totalSlides: number;
    gridConstraints?: string;
    visionResult?: import('../types/chain-output.types').VisionAnalysisResult | null;
    excludeLayouts?: string[];
    templateIntent?: 'educational' | 'promotion' | 'testimonial' | 'before_after' | 'brand_story';
  }): Promise<{ selected_layout_id: string; reasoning: string; designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec }> {
    
    const context: ITemplateContext = {
      brief: params.brief,
      brandName: params.brandName,
      aesthetic: params.aesthetic,
      textLength: params.textLength,
      slideIndex: params.slideIndex,
      totalSlides: params.totalSlides,
      visionResult: params.visionResult,
      templateIntent: params.templateIntent
    };

    try {
      this.logger.log(`[Template Engine] Starting 5-Stage Pipeline for slide ${context.slideIndex + 1}...`);

      // Stage 1: Retrieval
      const allCandidates = await this.retriever.retrieveCandidates(context);
      this.logger.log(`[Stage 1] Retrieved ${allCandidates.length} raw candidates from library.`);

      // Stage 2: Hard Constraint Filtering (Deterministic)
      let validCandidates = this.hardConstraintEngine.filter(allCandidates, context);
      
      // If we filtered out too many (e.g. strict exclusions), fall back safely
      if (validCandidates.length < 5) {
        this.logger.warn(`[Stage 2] Too few candidates (${validCandidates.length}) after filtering. Relaxing constraints.`);
        validCandidates = allCandidates; 
      } else {
        this.logger.log(`[Stage 2] ${validCandidates.length} candidates survived constraint filtering.`);
      }

      // Stage 3: Candidate Ranking
      const rankedCandidates = this.rankingEngine.rank(validCandidates, context);

      // Stage 4: Diversity Engine
      const carouselHistory = params.excludeLayouts || [];
      const diversifiedCandidates = this.diversityEngine.applyDiversityPenalties(rankedCandidates, context, carouselHistory);

      // Take the Top 8 highest-ranked and diversified candidates to present to the LLM
      const topCandidates = diversifiedCandidates.slice(0, 8);
      this.logger.log(`[Stage 4] Reduced to Top ${topCandidates.length} candidates for AI Art Director.`);

      // Stage 5: LLM Art Director
      const candidateSummary = topCandidates.map(c => 
        `- ID: ${c.id}\n  Concept: ${c.concept}\n  Why it fits: Ranked highly for ${context.aesthetic} aesthetic.`
      ).join('\n\n');

const systemPrompt = `
You are an elite Visual Art Director.
We have mathematically narrowed down our layout library to the absolute Top ${topCandidates.length} candidates. These candidates represent specific, semantically distinct structural variants (e.g. "editorial_magazine_cover", "minimalist_offset_quote", "clinical_split").
Your ONLY job is to select the single best structural variant from this shortlist based strictly on the provided Brand Aesthetic and visual storytelling for the given brief.

Do NOT default to "minimal" or "high-end fashion" unless it perfectly matches the Brand Aesthetic. Adapt dynamically.
CRITICAL DESIGN RULE: You MUST rotate across different distinct variants. If previous slides used 'editorial_magazine_cover', you must actively select a different geometry like 'editorial_split' or 'minimalist_offset_quote'. Ensure each slide is distinct geometrically (e.g., rotating between split, centered, and full-bleed) while maintaining brand coherence.

CONTEXT:
- Brand Aesthetic: ${context.aesthetic}
- Slide Position: ${context.slideIndex + 1} of ${context.totalSlides}
- Overlay Text Length: ${context.textLength} characters
- Previously Used Layouts: ${params.excludeLayouts?.join(', ') || 'None'}
${params.gridConstraints ? `- GRID CONSTRAINTS: ${params.gridConstraints}` : ''}
${context.visionResult?.suitabilityScores ? `- PHOTO SUITABILITY: Technical Quality=${context.visionResult.suitabilityScores.technicalQuality}/100, Brand Compatibility=${context.visionResult.suitabilityScores.brandCompatibility}/100. CRITICAL: If Brand Compatibility is low (<50), choose a layout with heavy masks to hide the background.` : ''}

BRIEF FOR THIS SLIDE:
${context.brief || 'Standard beautifully aesthetic post.'}

TOP CANDIDATES SHORTLIST:
${candidateSummary}

INSTRUCTIONS:
1. Select ONE layout ID from the shortlist above that flawlessly matches the Brand Aesthetic and Brief.
2. Formulate a 'designSpec' to inject intent. 
   - CRITICAL: If the image is a high quality portrait, and the aesthetic allows modern layouts, set 'photo.imageExecution = "triptych"' to slice the image into 3 vertical elegant panels.
3. Return strictly in valid JSON format.

JSON SCHEMA:
{
  "selected_layout_id": "<exact_template_id>",
  "reasoning": "A 1-sentence explanation of why this perfectly matches the Brand DNA.",
  "designSpec": {
    "composition": {
      "hero": "image",
      "balance": "asymmetrical",
      "negativeSpace": "medium"
    },
    "photo": {
      "role": "hero",
      "treatment": "framed",
      "imageExecution": "standard" // Can be "triptych" for multi-panel splits
    },
    "typography": {
      "hierarchy": "editorial",
      "dominance": "high",
      "headlineTreatment": "standard"
    },
    "decorations": { "density": "medium" },
    "style": { "mood": "warm_paper" // Must be exactly one of: "warm_paper", "luxury_black", "clinical_white", "vibrant_pop" }
  }
}
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 500,
      });

      const responseContent = response.choices[0]?.message?.content || '{}';
      const decision = JSON.parse(responseContent);

      // Ensure the LLM didn't hallucinate an ID outside the shortlist
      const chosenCandidate = topCandidates.find(c => c.id === decision.selected_layout_id) 
        ? topCandidates.find(c => c.id === decision.selected_layout_id)!
        : topCandidates[0]; // Fallback to the mathematically highest ranked if LLM hallucinates
        
      const finalId = chosenCandidate.id;
      let returnedLayoutId = finalId;

      this.logger.log(`[Stage 5] AI Art Director finalized: ${finalId} - Reason: ${decision.reasoning}`);

      if (chosenCandidate.type === 'procedural') {
         const dsl = this.layoutAssembler.compileFamilyToDSL(finalId, params.slideIndex, params.brandName);
         registerDynamicLayout(dsl);
         returnedLayoutId = dsl.id;
         this.logger.log(`[Stage 5] Compiled procedural family ${finalId} into variant ${returnedLayoutId}`);
      }
      
      // Tell the Diversity Engine to penalize this layout for future runs
      this.diversityEngine.recordUsage(finalId);

      return {
        selected_layout_id: returnedLayoutId,
        reasoning: decision.reasoning || 'Selected via Pipeline',
        designSpec: decision.designSpec
      };

    } catch (err) {
      this.logger.error('[Template Engine] Pipeline failed, falling back to safe default.', err);
      return { selected_layout_id: 'passepartout_clean', reasoning: 'Fallback due to error' };
    }
  }
}
