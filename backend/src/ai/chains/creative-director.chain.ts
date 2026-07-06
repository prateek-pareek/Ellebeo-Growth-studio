import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { StrategistOutput } from './brand-strategist.chain';

export interface SlideDesignBrief {
  index: number;
  title: string;
  overlayText: string;
  artDirectorPrompt: string; // The bespoke prompt for Gemini
  layoutType: 'split' | 'text_overlay' | 'full_image';
  panelHexColor: string;
  borderHexColor: string;
  textPosition: 'bottom_third' | 'centered' | 'top_left';
  textColorHex: string;
}

export interface CreativeDirectorResult {
  slides: SlideDesignBrief[];
}

export class CreativeDirectorChain {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1500,
      openAIApiKey: process.env['OPENAI_API_KEY'] ?? '',
    });
  }

  async generate(params: {
    strategistOutput: StrategistOutput;
    brandDNA: any;
    concepts: Array<{ index: number; title: string; overlayText: string }>;
  }): Promise<CreativeDirectorResult> {
    const { strategistOutput, brandDNA, concepts } = params;

    const brandColors = {
      primary: brandDNA.primaryBrandColor ?? '#1e2d24',
      secondary: brandDNA.secondaryBrandColor ?? '#c28d75',
      background: brandDNA.backgroundBrandColor ?? '#f7f4ef',
      accent: brandDNA.accentBrandColor ?? '#d4a373',
      depth: brandDNA.depthBrandColor ?? '#1e1e1c',
    };

    const systemPrompt = `You are a premium luxury beauty brand creative director.
Your job is to design the slide-by-slide visual layout and write the bespoke image generation brief for each slide of a carousel post.
You translate the strategist's copy and slide concepts into a strict, unified design strategy.

DESIGN RULES (non-negotiable):
1. Constrain design parameters to the professional's brand colors:
   - Primary: ${brandColors.primary}
   - Secondary: ${brandColors.secondary}
   - Background: ${brandColors.background}
   - Accent: ${brandColors.accent}
   - Depth: ${brandColors.depth}
2. The real photo is the hero — do NOT tell the generator to draw cartoon characters, clipart, or replace real background details.
3. Every slide must have a designated layoutType, panelHexColor, borderHexColor, and textPosition.
4. Keep overlays minimal and high-contrast. Use white or the Accent/Background hex for text, and Primary/Secondary/Depth hex for panels.

Return a JSON array of slide design briefs.`;

    const userPrompt = `Strategist Plan:
Hook: "${strategistOutput.hookSentence}"
Caption: "${strategistOutput.caption}"
CTA: "${strategistOutput.callToAction}"

Slide Concepts to Design:
${JSON.stringify(concepts, null, 2)}

For each slide, output:
- index: the slide number
- title: the concept title
- overlayText: the text to draw on this slide
- artDirectorPrompt: a detailed visual prompt describing the background texture, lighting, photo preservation rules, and layout accents.
- layoutType: 'split', 'text_overlay', or 'full_image'
- panelHexColor: one of the 5 brand colors to use as the text container panel background
- borderHexColor: one of the 5 brand colors to use for the frame/margins
- textPosition: 'bottom_third', 'centered', or 'top_left'
- textColorHex: one of the 5 brand colors (or '#ffffff') for text contrast

Return exactly this JSON structure:
{
  "slides": [
    {
      "index": 1,
      "title": "01 · Cover",
      "overlayText": "...",
      "artDirectorPrompt": "...",
      "layoutType": "text_overlay",
      "panelHexColor": "${brandColors.primary}",
      "borderHexColor": "${brandColors.secondary}",
      "textPosition": "bottom_third",
      "textColorHex": "${brandColors.accent}"
    }
  ]
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

      const parsed = JSON.parse(cleaned) as CreativeDirectorResult;
      if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        return parsed;
      }
    } catch (err) {
      // Fallback
    }

    return {
      slides: concepts.map(c => ({
        index: c.index,
        title: c.title,
        overlayText: c.overlayText,
        artDirectorPrompt: `A professional design layout for slide ${c.index} displaying real beauty treatment details. Focus on clinical excellence. Matte finish, soft shadows. Use brand primary color ${brandColors.primary} and secondary accent ${brandColors.secondary}.`,
        layoutType: 'text_overlay',
        panelHexColor: brandColors.primary,
        borderHexColor: brandColors.secondary,
        textPosition: 'bottom_third',
        textColorHex: brandColors.accent,
      })),
    };
  }
}
