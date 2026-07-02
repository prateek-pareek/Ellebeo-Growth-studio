import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { wrapSystemPrompt } from '../config/platform-system-prompt';

export interface VisualConcept {
  index: number;
  title: string;
  overlayText: string;
  artDirectorPrompt: string; // The bespoke generated image prompt
}

export interface ArtDirectorBriefResult {
  slides: VisualConcept[];
}

export class ArtDirectorBriefChain {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1024,
      openAIApiKey: process.env['OPENAI_API_KEY'] ?? '',
    });
  }

  async generate(params: {
    concepts: Array<{ index: number; title: string; overlayText: string }>;
    businessName: string;
    brandColor: string;
    secondaryColor: string;
    aesthetic: string;
    serviceType: string;
  }): Promise<ArtDirectorBriefResult> {
    const { concepts, businessName, brandColor, secondaryColor, aesthetic, serviceType } = params;

    const systemPrompt = `You are a premium luxury beauty brand creative director.
Your job is to write a detailed, bespoke image generation prompt (Art-Director Brief) for each slide concept in a post.
The goal is to translate a plain text slide overlay into a visual instruction that preserves the original photo while adding elevated, minimal layout accents.

RULES FOR THE GENERATED IMAGE PROMPTS (non-negotiable):
- The real photo is the hero — preserve every detail of the person, hair, skin, nails exactly as they are.
- Keep the natural background, towels, salon boards, and environment fully intact. Do NOT remove or replace the background.
- Tell the AI model to place a clean, semi-transparent dark rectangle (black at 55% opacity) behind the white text for high contrast and legibility.
- Use a clean, modern, white all-caps sans-serif font for the typography.
- Do NOT use copyrighted brand names (Netflix, Vogue, Dior, Chanel).
- Output must be entirely family-friendly and safe for professional social media.`;

    const userPrompt = `Generate a detailed artDirectorPrompt for each of these slide concepts:

Business Name: "${businessName}"
Service Type: "${serviceType}"
Brand Palette: primary ${brandColor}, secondary ${secondaryColor}
Aesthetic: "${aesthetic}"

SLIDE CONCEPTS:
${JSON.stringify(concepts, null, 2)}

For each concept, return a JSON slide object containing:
- index: the slide number
- title: the concept title
- overlayText: the slide overlay text
- artDirectorPrompt: a detailed, bespoke visual prompt instructing the image model how to overlay "${brandColor}" and "${secondaryColor}" highlights, place the semi-transparent text box, and preserve the original photo's environment.

Return exactly this JSON structure:
{
  "slides": [
    {
      "index": 1,
      "title": "01 · Cover",
      "overlayText": "Headline text",
      "artDirectorPrompt": "Bespoke visual prompt for Slide 1..."
    }
  ]
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(wrapSystemPrompt(systemPrompt)),
        new HumanMessage(userPrompt),
      ]);
      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      const cleaned = content
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned) as ArtDirectorBriefResult;
      if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        return parsed;
      }
    } catch (err) {
      // Fallback below
    }

    // Default Fallback mapping
    return {
      slides: concepts.map(c => ({
        index: c.index,
        title: c.title,
        overlayText: c.overlayText,
        artDirectorPrompt: `You are a professional social media designer creating an Instagram graphic.
This is a real photo of a ${serviceType}. Overlay the text "${c.overlayText}" cleanly in a semi-transparent dark rectangle (black at 55% opacity) at the bottom.
Preserve the photo background, skin texture, and details exactly. Brand colors: primary ${brandColor}, secondary ${secondaryColor}.`,
      })),
    };
  }
}
