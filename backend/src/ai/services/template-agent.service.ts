import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// Load the template library metadata once on startup
const libraryPath = path.join(__dirname, '../config/template-library.json');
let templateLibrary: Record<string, any> = {};
try {
  templateLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
} catch (e) {
  Logger.error('Failed to load template library', e);
}

@Injectable()
export class TemplateAgentService {
  private openai: OpenAI;
  private logger = new Logger(TemplateAgentService.name);
  private compressedLibraryIndex: string = '';

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    this.compressLibrary();
  }

  /**
   * Compresses the 271 detailed JSON objects into a dense text summary
   * grouped by category to save LLM context window tokens and improve speed.
   */
  private compressLibrary() {
    const categories: Record<string, string[]> = {};
    for (const [id, metadata] of Object.entries(templateLibrary)) {
      const cat = metadata.category || 'Uncategorized';
      if (!categories[cat]) categories[cat] = [];
      const useCases = (metadata.best_use_cases || []).join(', ');
      // Compress to: "id: Concept summary (Best for: X, Y)"
      categories[cat].push(`- ${id}: ${metadata.concept} (Best for: ${useCases})`);
    }

    let compressed = 'TEMPLATE LIBRARY INDEX:\n';
    for (const [cat, templates] of Object.entries(categories)) {
      compressed += `\n[Category: ${cat}]\n${templates.join('\n')}\n`;
    }
    
    // We only take the first ~150 to keep prompt limits safe if it's too massive, 
    // but ideally we pass the whole compressed string. 
    this.compressedLibraryIndex = compressed;
    this.logger.log(`Template Library Compressed: ${Object.keys(templateLibrary).length} templates mapped.`);
  }

  /**
   * Evaluates the brief and brand DNA to select the most contextually appropriate layout.
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
  }): Promise<{ selected_layout_id: string; reasoning: string }> {
    const { brief, brandName, aesthetic, textLength, slideIndex, totalSlides, gridConstraints, visionResult, excludeLayouts = [] } = params;

    let visionConstraints = '';
    if (visionResult) {
      const isMacro = visionResult.framingType === 'macro';
      const isZoomedFace = visionResult.facesDetected && visionResult.framingType === 'portrait';
      if (isMacro || isZoomedFace) {
        visionConstraints = `\n- VISION CONSTRAINT (CRITICAL): The input image is a tightly cropped/zoomed-in face (${visionResult.framingType}). You MUST NOT select any 'split', '50/50', or 'overlay' layouts (like translucent_split or wax_seal_emblem) as they will chop the face in half. You MUST select a full-bleed or bordered layout where text sits entirely at the extreme bottom or top.`;
      }
    }

    let textConstraints = '';
    if (textLength === 0) {
      textConstraints = `\n- TEXT CONSTRAINT (CRITICAL): There is absolutely NO overlay text for this slide. You MUST NOT select any layout that relies on text blocks or text backgrounds (like 'editorial_stack' or 'translucent_left_panel'). You MUST select a clean, image-focused layout.`;
    }

    const systemPrompt = `
You are an elite Art Director and Template Agent for a premium MedSpa / Beauty marketing studio.
Your job is to select the absolute best visual layout from our Template Library for a given slide.

CONTEXT:
- Brand Name: ${brandName}
- Brand Aesthetic: ${aesthetic}
- Slide Position: ${slideIndex + 1} of ${totalSlides}
- Overlay Text Length: ${textLength} characters
${gridConstraints ? `- GRID CONSTRAINTS (CRITICAL): ${gridConstraints}` : ''}${visionConstraints}${textConstraints}

BRIEF FOR THIS SLIDE:
${brief || 'Standard beautifully aesthetic post.'}

${this.compressedLibraryIndex}

INSTRUCTIONS:
1. Review the brief and context.
2. Search the TEMPLATE LIBRARY INDEX.
3. Select the SINGLE most appropriate template ID that visually matches the intent.
4. If this is slide 1 (cover), prefer highly visual/hook layouts. If it is a middle slide with lots of text, prefer layouts with clear text regions.
5. YOU MUST OBEY THE GRID CONSTRAINTS (if provided). If the grid constraints say "Avoid heavy text", you MUST filter your selection to layouts with minimal text regions.
6. EXCLUSIONS: You MUST NOT select any of these layout IDs: ${excludeLayouts.join(', ')}. Pick a different valid layout.
7. Return your decision strictly in valid JSON format.

JSON SCHEMA EXPECTED:
{
  "selected_layout_id": "<exact_template_id>",
  "reasoning": "A 1-sentence explanation of why this layout fits the brief and obeys the Grid Constraints."
}
`;

    try {
      this.logger.log(`Routing to Template Agent for slide ${slideIndex + 1}...`);
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Fast and smart enough for routing
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.8, // Increased for creative diversity across generations
        max_tokens: 250,
      });

      const responseContent = response.choices[0]?.message?.content || '{}';
      const decision = JSON.parse(responseContent);

      this.logger.log(`Template Agent selected: ${decision.selected_layout_id} - Reason: ${decision.reasoning}`);
      
      return {
        selected_layout_id: decision.selected_layout_id || 'passepartout_clean',
        reasoning: decision.reasoning || 'Fallback default'
      };
    } catch (err) {
      this.logger.error('Template Agent failed to select layout, falling back.', err);
      return { selected_layout_id: 'passepartout_clean', reasoning: 'Fallback due to error' };
    }
  }
}
