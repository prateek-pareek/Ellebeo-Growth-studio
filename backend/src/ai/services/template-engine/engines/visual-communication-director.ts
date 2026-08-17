import { Injectable, Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import OpenAI from 'openai';
import { IVisualCommunicationSpec } from '../interfaces';

@Injectable()
export class VisualCommunicationDirector {
  private logger = new Logger(VisualCommunicationDirector.name);

  /**
   * Generates a semantic Visual Communication Spec that defines the art direction for the slide.
   */
  public async generateSpec(params: {
    brandName: string;
    aesthetic: string;
    brief: string;
    slideIndex: number;
    totalSlides: number;
    textLength: number;
    templateIntent?: string;
    visionResult?: any;
    slideType?: string;
  }): Promise<IVisualCommunicationSpec> {
    
    this.logger.log(`[Visual Communication Director] Analyzing slide ${params.slideIndex + 1} for art direction...`);

    const isFreeform = process.env['LAYOUT_MODE'] === 'ai_freeform';

    const systemPrompt = `
You are the Executive Art Director for a high-end design agency.
Your job is to determine the optimal Visual Communication strategy for a specific slide.
${isFreeform
  ? 'You DO build the layout: your regionPlan is authoritative geometry that gets rendered directly — there is no template library backing you up, so choose real anchors and shares, not vague aspiration.'
  : 'You do not build the layout yourself. You dictate WHAT the layout must accomplish semantically.'}
Your output must be strict JSON adhering to the IVisualCommunicationSpec schema.

CONTEXT:
- Brand Aesthetic: ${params.aesthetic}
- Slide Position: ${params.slideIndex + 1} of ${params.totalSlides}
- Semantic Slide Type: ${params.slideType || 'UNKNOWN'}
- Overlay Text Length: ${params.textLength} characters
- Brief: ${params.brief}
${params.visionResult?.suitabilityScores ? `- PHOTO CONTEXT: Technical Quality=${params.visionResult.suitabilityScores.technicalQuality}/100, Brand Compatibility=${params.visionResult.suitabilityScores.brandCompatibility}/100.` : ''}

INSTRUCTIONS:
1. Determine the visual hierarchy (primary, secondary, tertiary elements).
2. Determine the role and importance of the image. If there is no image context, or this is a pure text slide, set imageRole to "none".
3. Determine the relationship between typography and image (e.g., integrated, separated).
4. Determine the whitespace intent (e.g., tight, airy).
5. Determine a coarse regionPlan: where the image sits (imageAnchor), roughly what share of the canvas it takes (imageSharePercent), and where the text sits (textAnchor). Reason in coarse anchors and percentages only — never exact pixels, you cannot see the final canvas size.
6. Output ONLY valid JSON.

IMPORTANT: There is no single "usual" answer. Base every field on the CONTEXT above —
slide position, slide type, brief, aesthetic — not on habit. A cover slide, a body
slide, and a CTA slide in the same carousel should very often land on different
choices. If you notice you're about to pick the same combination you'd pick for any
generic post, stop and reconsider against this specific slide's CONTEXT instead.

JSON SCHEMA — each field is a type below, NOT a recommended value. Pick freely
from the listed options for each field based on the CONTEXT, independently per field:
{
  "hierarchy": {
    "primary": "<one of: image, typography, composition>",
    "secondary": "<one of: image, typography, badge, cta, none>",
    "tertiary": "<one of: badge, cta, none>"
  },
  "imageRole": "<one of: hero, supporting_evidence, context, atmosphere, none>",
  "imageImportance": "<one of: critical, high, medium, low>",
  "relationship": "<one of: separated, integrated, overlap, framed, stacked>",
  "whitespaceIntent": "<one of: tight, balanced, airy, intentional>",
  "readingFlow": "<one of: z_pattern, center_down, circular, center_anchored, split>",
  "energy": "<one of: calm, dynamic, structured, playful>",
  "primitiveIntent": "<one of: framing, accent, structural, none>",
  "regionPlan": {
    "imageAnchor": "<one of: top, bottom, left, right, full>",
    "imageSharePercent": "<integer 0-100 — rough % of canvas the image region occupies>",
    "textAnchor": "<one of: top, bottom, left, right, overlay>"
  }
}
`;

    const DEFAULT_SPEC: IVisualCommunicationSpec = {
      hierarchy: { primary: 'image', secondary: 'typography', tertiary: 'none' },
      imageRole: 'hero',
      imageImportance: 'high',
      relationship: 'separated',
      whitespaceIntent: 'balanced',
      readingFlow: 'z_pattern',
      energy: 'calm',
      primitiveIntent: 'none',
      regionPlan: { imageAnchor: 'top', imageSharePercent: 55, textAnchor: 'bottom' },
    };

    // --- LAYOUT_MODE=ai_freeform: this spec is authoritative geometry, so it's
    // worth a stronger reasoning model here. Default path (unset) keeps using
    // Gemini exactly as before — commented block below, not deleted.
    if (isFreeform) {
      try {
        const client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
        const model = process.env['OPENAI_ART_DIRECTOR_MODEL'] || 'gpt-4o';

        const completion = await client.chat.completions.create({
          model,
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Please generate the Visual Communication Spec as a JSON object.' },
          ],
        });

        const content = completion.choices[0]?.message?.content || '';
        const spec = JSON.parse(content) as IVisualCommunicationSpec;
        return { ...DEFAULT_SPEC, ...spec };
      } catch (err) {
        this.logger.error(`[Visual Communication Director] GPT call failed, falling back to safe default.`, err);
        return DEFAULT_SPEC;
      }
    }

    // --- Default path (LAYOUT_MODE unset): Gemini, shadow-mode as before ---
    try {
      const gpt = new ChatGoogleGenerativeAI({
        model: 'gemini-flash-latest',
        temperature: 0.7,
        maxOutputTokens: 2048,
        apiKey: process.env['GEMINI_API_KEY'],
      });

      const finalPrompt = systemPrompt + '\n\nIMPORTANT: You must output ONLY valid JSON. Do not include markdown tags like \`\`\`json.';

      const res = await gpt.invoke([
        new SystemMessage(finalPrompt),
        new HumanMessage("Please generate the Visual Communication Spec as a JSON object.")
      ]);

      const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

      const spec = JSON.parse(cleaned) as IVisualCommunicationSpec;
      return { ...DEFAULT_SPEC, ...spec };

    } catch (err) {
      this.logger.error(`[Visual Communication Director] Failed to generate spec, falling back to safe default.`, err);
      return DEFAULT_SPEC;
    }
  }
}
