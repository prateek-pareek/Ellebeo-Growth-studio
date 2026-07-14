// ============================================================================
// asset-library-vision.chain.ts — GPT-4o Vision pass on brand asset library
// Analyses the professional's own uploaded files (salon space, products, tools,
// previous work, textures) to build a "brand environment context" block that
// keeps generated images consistent with the professional's real physical world.
//
// Usage rules enforced before any image reaches the model:
//   EXCLUDED: do_not_generate, do_not_use_publicly, private_ref
//   EXCLUDED consent: no_consent, pending
// Non-fatal: orchestrator continues without this block if the call fails.
// ============================================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const EXCLUDED_USAGE = new Set(['do_not_generate', 'do_not_use_publicly', 'private_ref']);
const EXCLUDED_CONSENT = new Set(['no_consent', 'pending']);
const MAX_IMAGES = 4;

// Most-useful asset types for image generation context — sorted by priority
const TYPE_PRIORITY = [
  'space', 'textures', 'products', 'tools',
  'work', 'behind_scenes', 'headshot', 'previous_posts',
];

export type AssetLibraryItemInput = {
  storage_path: string;
  asset_type: string;
  usage_rule: string;
  consent_status: string;
  notes: string;
};

export class AssetLibraryVisionChain {
  private model: ChatOpenAI | null = null;

  private getModel(): ChatOpenAI {
    if (!this.model) {
      if (!process.env['OPENAI_API_KEY']) {
        throw new Error('OPENAI_API_KEY required for asset library vision analysis');
      }
      this.model = new ChatOpenAI({
        modelName: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 400,
        timeout: 25000,
        openAIApiKey: process.env['OPENAI_API_KEY'],
      });
    }
    return this.model;
  }

  // Filter and rank assets before sending to vision model
  selectAssets(items: AssetLibraryItemInput[]): AssetLibraryItemInput[] {
    return items
      .filter(
        (i) =>
          i.storage_path &&
          !EXCLUDED_USAGE.has(i.usage_rule) &&
          !EXCLUDED_CONSENT.has(i.consent_status),
      )
      .sort((a, b) => {
        const pa = TYPE_PRIORITY.indexOf(a.asset_type);
        const pb = TYPE_PRIORITY.indexOf(b.asset_type);
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      })
      .slice(0, MAX_IMAGES);
  }

  async analyse(items: AssetLibraryItemInput[]): Promise<string> {
    const selected = this.selectAssets(items);
    if (selected.length === 0) return '';

    const imageDescriptions = selected
      .map(
        (item, i) =>
          `Image ${i + 1}: type="${item.asset_type}"` +
          (item.notes ? `, professional notes="${item.notes}"` : ''),
      )
      .join('\n');

    const systemPrompt =
      `You are an art director reviewing a beauty professional's brand asset library — ` +
      `their own photos of their salon space, products, tools, and previous work. ` +
      `Your output is injected directly into an image generation prompt to ensure ` +
      `AI-generated content feels visually consistent with their real physical world.`;

    const humanMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text:
            `Analyse these ${selected.length} brand asset image(s) and describe what they reveal ` +
            `about this professional's physical brand world in 2–3 sentences.\n\n` +
            `Asset context:\n${imageDescriptions}\n\n` +
            `Describe ONLY what is clearly visible and relevant for generating consistent content:\n` +
            `- Physical space: surfaces, background, ambient lighting in the real environment\n` +
            `- Products or tools present and their visual aesthetic\n` +
            `- Any signature colour or material presence in the space\n` +
            `- Work style visible in any previous work or behind-scenes shots\n\n` +
            `Do NOT invent or infer details not visible. Only describe what you can clearly see.\n` +
            `Return a single plain-text paragraph starting with "Brand environment context:". No JSON, no bullets, no headings.`,
        },
        ...selected.map((item) => ({
          type: 'image_url' as const,
          image_url: { url: item.storage_path, detail: 'low' as const },
        })),
      ],
    });

    const response = await this.getModel().invoke([
      new SystemMessage(systemPrompt),
      humanMessage,
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : String(response.content);

    return content.trim();
  }
}
