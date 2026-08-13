import { Injectable, Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
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

    const systemPrompt = `
You are the Executive Art Director for a high-end design agency.
Your job is to determine the optimal Visual Communication strategy for a specific slide.
You do not build the layout yourself. You dictate WHAT the layout must accomplish semantically.
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
5. Output ONLY valid JSON.

JSON SCHEMA:
{
  "hierarchy": {
    "primary": "image", // one of: image, typography, composition
    "secondary": "typography", // one of: image, typography, badge, cta, none
    "tertiary": "none" // one of: badge, cta, none
  },
  "imageRole": "hero", // one of: hero, supporting_evidence, context, atmosphere, none
  "imageImportance": "high", // one of: critical, high, medium, low
  "relationship": "integrated", // one of: separated, integrated, overlap, framed, stacked
  "whitespaceIntent": "balanced", // one of: tight, balanced, airy, intentional
  "readingFlow": "z_pattern", // one of: z_pattern, center_down, circular, center_anchored, split
  "energy": "calm", // one of: calm, dynamic, structured, playful
  "primitiveIntent": "none" // one of: framing, accent, structural, none
}
`;

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
      return spec;
      
    } catch (err) {
      this.logger.error(`[Visual Communication Director] Failed to generate spec, falling back to safe default.`, err);
      return {
        hierarchy: { primary: 'image', secondary: 'typography', tertiary: 'none' },
        imageRole: 'hero',
        imageImportance: 'high',
        relationship: 'separated',
        whitespaceIntent: 'balanced',
        readingFlow: 'z_pattern',
        energy: 'calm',
        primitiveIntent: 'none'
      };
    }
  }
}
