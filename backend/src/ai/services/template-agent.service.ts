import { Injectable, Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { MetadataRetriever } from './template-engine/metadata.retriever';
import { HardConstraintEngine } from './template-engine/hard-constraint.engine';
import { RankingEngine } from './template-engine/ranking.engine';
import { DiversityEngine, getMacroFamily } from './template-engine/diversity.engine';
import { ITemplateCandidate, ITemplateContext, ISemanticDesignSpec } from './template-engine/interfaces';
import { LayoutAssemblerService } from './template-engine/layout-assembler.service';
import { registerDynamicLayout } from '../config/layout-renderers';
import { DesignKnowledgeService, normalizeReadingFlow } from './template-engine/design-knowledge.service';
import { getEffectiveFonts } from '../config/brand-dna-fonts.util';

interface ICandidateGrounding {
  source: 'mined_exact' | 'mined_family_stats';
  balance: string;
  readingFlow: string; // normalized, underscore form
  energy: string;
  sampleFraction?: string;
  decorationTypes?: string[];
  designRules?: string[];
}

@Injectable()
export class TemplateAgentService {
  private logger = new Logger(TemplateAgentService.name);

  private retriever: MetadataRetriever;
  private hardConstraintEngine: HardConstraintEngine;
  private rankingEngine: RankingEngine;
  private diversityEngine: DiversityEngine;
  private layoutAssembler: LayoutAssemblerService;
  private designKnowledge: DesignKnowledgeService;

  constructor() {
    // Initialize Pipeline Engines
    this.retriever = new MetadataRetriever();
    this.hardConstraintEngine = new HardConstraintEngine();
    this.rankingEngine = new RankingEngine();
    this.diversityEngine = new DiversityEngine();
    this.layoutAssembler = new LayoutAssemblerService();
    this.designKnowledge = new DesignKnowledgeService();
  }

  /**
   * Looks up real mined design data for a shortlisted candidate — exact match for
   * rigid ids (design-knowledge-map.json has 1:1 coverage of all 770 rigid ids),
   * aggregated family stats for procedural family recipes. Never returns invented data.
   */
  private groundCandidate(candidate: ITemplateCandidate): ICandidateGrounding | null {
    if (candidate.type === 'rigid') {
      const exact = this.designKnowledge.getGroundTruth(candidate.id);
      if (exact) {
        return {
          source: 'mined_exact',
          balance: exact.composition.balance,
          readingFlow: normalizeReadingFlow(exact.composition.readingFlow),
          energy: exact.visualLanguage.energy,
          decorationTypes: (exact.decorations || []).map(d => d.type),
          designRules: exact.designRules,
        };
      }
    }
    const macroFamily = getMacroFamily(candidate.id);
    const stats = this.designKnowledge.getFamilyStats(macroFamily);
    if (!stats) return null;
    return {
      source: 'mined_family_stats',
      balance: stats.balance,
      readingFlow: normalizeReadingFlow(stats.readingFlow),
      energy: stats.energy,
      sampleFraction: stats.sampleFraction,
      decorationTypes: stats.decorationTypes,
      designRules: stats.designRules,
    };
  }

  /**
   * Merges the LLM's authored designSpec with real grounding data: structural facts
   * (balance, readingFlow) are overridden from mined data when available so they can
   * never be silently invented, while every creative field the LLM authored (mood,
   * hierarchy, spacing, emphasis, philosophy...) passes through untouched.
   */
  private groundDesignSpec(rawSpec: any, grounding: ICandidateGrounding | undefined): ISemanticDesignSpec {
    const spec: ISemanticDesignSpec = {
      composition: {
        hero: rawSpec?.composition?.hero || 'image',
        balance: rawSpec?.composition?.balance || 'asymmetrical',
        negativeSpace: rawSpec?.composition?.negativeSpace || 'medium',
        readingFlow: rawSpec?.composition?.readingFlow,
      },
      photo: {
        role: rawSpec?.photo?.role || 'hero',
        treatment: rawSpec?.photo?.treatment || 'framed',
        imageExecution: rawSpec?.photo?.imageExecution,
      },
      typography: {
        hierarchy: rawSpec?.typography?.hierarchy || 'editorial',
        dominance: rawSpec?.typography?.dominance || 'medium',
        headlineTreatment: rawSpec?.typography?.headlineTreatment,
        alignment: rawSpec?.typography?.alignment,
      },
      decorations: { density: rawSpec?.decorations?.density || 'medium' },
      style: { mood: rawSpec?.style?.mood || 'warm_paper' },
      hierarchy: rawSpec?.hierarchy,
      spacing: rawSpec?.spacing,
      emphasis: rawSpec?.emphasis,
      philosophy: rawSpec?.philosophy,
    };

    if (grounding) {
      // Structural facts win over the LLM's guess — this is what makes the intent
      // "grounded" rather than invented.
      spec.composition.balance = grounding.balance as any;
      spec.composition.readingFlow = grounding.readingFlow as any;
      spec.groundedIn = {
        source: grounding.source,
        sampleFraction: grounding.sampleFraction,
        energy: grounding.energy,
      };
    } else {
      spec.groundedIn = { source: 'llm_inferred' };
    }

    return spec;
  }

  /**
   * BrandDNA extensibility seam. `params.brandDNA` is now threaded in from
   * generation-orchestrator.ts's live selectTemplate() call, so this actually
   * fires — it previously read `brandDNA.fonts?.headline`/`primaryFont`, fields
   * that don't exist on the schema, so the override was always a no-op.
   */
  private applyBrandOverrides(spec: ISemanticDesignSpec, brandDNA?: any): ISemanticDesignSpec {
    const overrides = spec.brandOverrides || (brandDNA ? {
      primaryColor: brandDNA.primaryBrandColor,
      secondaryColor: brandDNA.secondaryBrandColor,
      fontFamily: getEffectiveFonts(brandDNA),
    } : undefined);

    if (!overrides) return spec;
    return { ...spec, brandOverrides: overrides };
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
    slideType?: string;
    semanticIntent?: import('../services/narrative-planner.service').SemanticSlide['semanticIntent'];
    requiredTraits?: import('../services/narrative-planner.service').SemanticSlide['requiredTraits'];
    /** True if an earlier slide in this same carousel/story already used the triptych photo split. */
    triptychAlreadyUsed?: boolean;
    /** Extensibility seam for a future BrandDNA Agent — no-op today unless populated. */
    brandDNA?: any;
  }): Promise<{ selected_layout_id: string; reasoning: string; designSpec?: import('./template-engine/interfaces').ISemanticDesignSpec }> {

    const context: ITemplateContext & { slideType?: string; semanticIntent?: any } = {
      brief: params.brief,
      brandName: params.brandName,
      aesthetic: params.aesthetic,
      textLength: params.textLength,
      slideIndex: params.slideIndex,
      totalSlides: params.totalSlides,
      visionResult: params.visionResult,
      templateIntent: params.templateIntent,
      slideType: params.slideType,
      semanticIntent: params.semanticIntent
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
      // Ground each shortlisted candidate in real mined data BEFORE prompting, so the
      // LLM cites real facts instead of inventing structural fields.
      const groundingByCandidate = new Map<string, ICandidateGrounding>();
      for (const c of topCandidates) {
        const grounding = this.groundCandidate(c);
        if (grounding) groundingByCandidate.set(c.id, grounding);
      }

      const candidateSummary = topCandidates.map(c => {
        const grounding = groundingByCandidate.get(c.id);
        const groundingLine = grounding
          ? `\n  REAL MINED DATA (${grounding.source}${grounding.sampleFraction ? `, ${grounding.sampleFraction} samples` : ''}): balance=${grounding.balance}, readingFlow=${grounding.readingFlow}, energy=${grounding.energy}${grounding.decorationTypes?.length ? `, decorations=[${grounding.decorationTypes.join(', ')}]` : ''}${grounding.designRules?.length ? `, rules=[${grounding.designRules.join('; ')}]` : ''}`
          : '';
        return `- ID: ${c.id}\n  Concept: ${c.concept}\n  Why it fits: Ranked highly for ${context.aesthetic} aesthetic.${groundingLine}`;
      }).join('\n\n');

      const systemPrompt = `
You are an high-end premium Visual Art Director.
We have mathematically narrowed down our layout library to the absolute Top ${topCandidates.length} candidates. These candidates represent specific, semantically distinct structural variants (e.g. "editorial_magazine_cover", "minimalist_offset_quote", "clinical_split").
Your job has two parts: (1) select the single best structural variant from this shortlist, and (2) author a complete Design Intent for it so the renderer can faithfully recreate your decision instead of guessing.

Do NOT default to "minimal" or "high-end fashion" unless it perfectly matches the Brand Aesthetic. Adapt dynamically.
CRITICAL DESIGN RULE 1: Do NOT default to "hero" layouts just because it is the first slide. Choose layouts that structurally fit the brief (e.g. text-heavy briefs need split or text_only layouts).
CRITICAL DESIGN RULE 2: You MUST rotate across different Design Families (e.g., if previous slides used 'editorial', you must actively select 'minimalist_quote', 'clinical_hero', 'split', 'countdown_promo', 'product_showcase', 'before_after', 'testimonial', 'scrapbook', 'quadrant', 'transformation', 'magazine', 'polaroid', 'notification_card', 'announcement' or other distinct families). Variants from the same design family must NOT be used continuously. Ensure each slide is distinct visually while maintaining brand coherence.

GROUNDING RULE: Each candidate below may list "REAL MINED DATA" — actual measured facts about that template (or its family) from real analyzed designs. Treat "balance" and "readingFlow" as structural facts about the template itself: cite them as-is in your designSpec, do not invent different values. "energy" describes the template's inherent character; let it inform (not override) your own creative fields like mood/emphasis/spacing, which should also react to THIS specific brief and content.

CONTEXT:
- Brand Aesthetic: ${context.aesthetic}
- Slide Position: ${context.slideIndex + 1} of ${context.totalSlides}
- Semantic Slide Type: ${context.slideType || 'UNKNOWN'} (e.g. HOOK, PROBLEM, SOLUTION, CLIENT_QUOTE, CTA)
- Overlay Text Length: ${context.textLength} characters
- Previously Used Layouts: ${params.excludeLayouts?.join(', ') || 'None'}
${params.gridConstraints ? `- GRID CONSTRAINTS: ${params.gridConstraints}` : ''}
${context.visionResult?.suitabilityScores ? `- PHOTO SUITABILITY: Technical Quality=${context.visionResult.suitabilityScores.technicalQuality}/100, Brand Compatibility=${context.visionResult.suitabilityScores.brandCompatibility}/100. CRITICAL: If Brand Compatibility is low (<50), choose a layout with heavy masks to hide the background.` : ''}
${params.triptychAlreadyUsed ? `- TRIPTYCH ALREADY USED: An earlier slide in this carousel already used the 3-panel triptych photo split. Do NOT set photo.imageExecution="triptych" again — pick "standard" so slides don't all look visually identical.` : ''}
${params.brandDNA ? `- REAL BRAND COLORS: primary=${params.brandDNA.primaryBrandColor || 'n/a'}, secondary=${params.brandDNA.secondaryBrandColor || 'n/a'}, background=${params.brandDNA.backgroundBrandColor || 'n/a'}, accent=${params.brandDNA.accentBrandColor || 'n/a'}. CRITICAL: your "style.mood" choice must be visually compatible with these actual brand colors — e.g. do NOT pick "luxury_black" for a brand with a light/white background, and do NOT pick "clinical_white" for a brand with a dark background.` : ''}

BRIEF FOR THIS SLIDE:
${context.brief || 'Standard beautifully aesthetic post.'}

TOP CANDIDATES SHORTLIST:
${candidateSummary}

INSTRUCTIONS:
1. Select ONE layout ID from the shortlist above that flawlessly matches the Brand Aesthetic and Brief.
2. Author a complete 'designSpec' (full schema below) describing composition, typography, hierarchy, spacing, alignment, visual emphasis, and your design philosophy for THIS specific slide.
   - EXCEPTION, use rarely: 'photo.imageExecution = "triptych"' slices the image into 3 vertical panels. This is a deliberate, occasional stylistic choice for ONE slide at most in a whole carousel/story — not a default. Only pick it when the brief specifically calls for a fashion-editorial, multi-angle, or "process/journey" feel AND no earlier slide has used it (see TRIPTYCH ALREADY USED below). Default to "standard" otherwise, even for portrait photos.
   - Per the GROUNDING RULE above, set composition.balance and composition.readingFlow to match the cited REAL MINED DATA when present.
3. Return strictly in valid JSON format.

JSON SCHEMA:
{
  "selected_layout_id": "<exact_template_id>",
  "reasoning": "A 1-sentence explanation of why this perfectly matches the Brand DNA.",
  "designSpec": {
    "composition": {
      "hero": "image",
      "balance": "asymmetrical",
      "negativeSpace": "medium",
      "readingFlow": "z_pattern" // one of: z_pattern, center_down, circular, center_outward, diagonal, bottom_left, scattered
    },
    "photo": {
      "role": "hero",
      "treatment": "framed",
      "imageExecution": "standard" // Can be "triptych" for multi-panel splits
    },
    "typography": {
      "hierarchy": "editorial", // Must be exactly one of: "editorial", "bold", "minimal", "technical"
      "dominance": "high",
      "headlineTreatment": "standard",
      "alignment": "left" // one of: left, center, right
    },
    "decorations": { 
      "density": "medium" // Must be exactly one of: "none", "low", "medium", "high"
    },
    "style": { "mood": "warm_paper" /* one of: warm_paper, luxury_black, clinical_white, vibrant_pop */ },
    "hierarchy": {
      "primaryElement": "image", // one of: image, headline, body, cta, badge — what leads the eye
      "secondaryElement": "headline",
      "tertiaryElement": "cta"
    },
    "spacing": {
      "whitespaceFeel": "balanced", // one of: tight, balanced, generous, luxury
      "rhythm": "standard" // one of: compact, standard, relaxed
    },
    "emphasis": {
      "focalPoint": "image", // one of: headline, image, badge, balanced
      "contrastStrategy": "soft_minimal" // one of: high_impact, soft_minimal, tonal
    },
    "philosophy": "1-2 sentences explaining the design rationale for this specific slide."
  }
}
`;

      const gpt = new ChatGoogleGenerativeAI({
        model: 'gemini-flash-latest',
        temperature: 0.7,
        maxOutputTokens: 8192,
        apiKey: process.env['GEMINI_API_KEY'],
      });

      // Instruct Gemini strictly on JSON output
      const finalPrompt = systemPrompt + '\n\nIMPORTANT: You must output ONLY valid JSON. Escape all literal newlines inside strings as \\n. Do not include markdown tags.';

      const res = await gpt.invoke([
        new SystemMessage(finalPrompt),
        new HumanMessage("Please return the selected layout id as a JSON object.")
      ]);
      const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);

      let cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      let decision: any;
      try {
        decision = JSON.parse(cleaned);
      } catch (e) {
        // Fallback for newlines
        const sanitized = cleaned.replace(/\n/g, '\\n').replace(/{\\n/g, '{\n').replace(/\\n}/g, '\n}').replace(/",\\n/g, '",\n').replace(/\\n *"/g, '\n  "');
        decision = JSON.parse(sanitized);
      }

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

      // Ground the final designSpec: balance/readingFlow are structural facts about the
      // chosen template, not per-generation creative choices, so real mined data wins
      // over whatever the LLM guessed for those two fields specifically.
      const grounding = groundingByCandidate.get(finalId);
      const groundedSpec = this.groundDesignSpec(decision.designSpec, grounding);
      // BrandDNA extensibility seam — the single call site a future BrandDNA Agent's
      // output would merge through. No-op today: applyBrandOverrides only touches
      // fields when params.brandDNA/spec.brandOverrides are actually populated, and
      // nothing populates them yet.
      const designSpec = this.applyBrandOverrides(groundedSpec, params.brandDNA);

      return {
        selected_layout_id: returnedLayoutId,
        reasoning: decision.reasoning || 'Selected via Pipeline',
        designSpec
      };

    } catch (err) {
      this.logger.error('[Template Engine] Pipeline failed, falling back to safe default.', err);
      return { selected_layout_id: 'passepartout_clean', reasoning: 'Fallback due to error' };
    }
  }
}
