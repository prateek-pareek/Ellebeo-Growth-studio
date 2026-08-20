// ============================================================================
// asset-agent.ts — sources a stock image for scenes the technician didn't
// supply a photo for. This is the pipeline's first real worker-tool
// delegation (Script agent's tool-use in Phase 3 was structured-output-only):
// the model calls search_stock_image, sees real results, and judges which
// one fits, rather than the runtime deciding search queries deterministically.
// Only invoked for scenes with a gap — cost discipline over agentic purity.
// ============================================================================

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { runToolAgent, AgentToolHandler, RunToolAgentResult } from '../../agents/tool-agent-runtime';
import { AI_CONFIG } from '../../../config/ai.config';
import { PixabayStockImageService } from '../../services/pixabay-stock-image.service';
import type { SceneCopy } from './../assets/asset-provider';

export const AssetAgentOutputSchema = z.object({
  assets: z.array(z.object({
    index: z.number().int().nonnegative(),
    url: z.string().url(),
  })).min(1),
});

export type AssetAgentOutput = z.infer<typeof AssetAgentOutputSchema>;

const OUTPUT_TOOL_NAME = 'submit_asset_plan';
const SEARCH_TOOL_NAME = 'search_stock_image';

const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', minimum: 0 },
          url: { type: 'string', description: "The chosen stock image url for this scene, taken from a search_stock_image result." },
        },
        required: ['index', 'url'],
      },
    },
  },
  required: ['assets'],
} as const;

const SEARCH_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query for a royalty-free stock photo, e.g. "modern beauty salon interior".' },
  },
  required: ['query'],
} as const;

export interface AssetAgentParams {
  scenesNeedingAssets: SceneCopy[];
  brandMoodTag: string | null;
  medicalAesthetics: boolean;
  stockImageService?: PixabayStockImageService;
  client?: Anthropic;
}

function buildSystemPrompt(): string {
  return [
    'You are the Asset agent for a short-form video pipeline.',
    'Your job is finding a royalty-free stock photo for each scene that has no technician-supplied image.',
    'Use the search_stock_image tool to search, then call submit_asset_plan with the best result url for every scene listed.',
    "Never search for or select images depicting real people's faces, medical treatments, or before/after results.",
  ].join(' ');
}

function buildUserPrompt(params: AssetAgentParams): string {
  const scenes = params.scenesNeedingAssets
    .map((s) => `Scene ${s.index}: ${s.headline ?? s.caption ?? '(no text)'}`)
    .join('\n');
  return [
    `Brand mood: ${params.brandMoodTag ?? 'neutral, professional'}`,
    params.medicalAesthetics
      ? 'This is a medical aesthetics brand — search for clinic/spa/beauty imagery only, never treatment or client photos.'
      : null,
    'Scenes needing a stock image:',
    scenes,
  ].filter(Boolean).join('\n');
}

export async function runAssetAgent(params: AssetAgentParams): Promise<RunToolAgentResult<AssetAgentOutput>> {
  const stockImageService = params.stockImageService ?? new PixabayStockImageService();

  const searchTool: AgentToolHandler = {
    name: SEARCH_TOOL_NAME,
    description: 'Search for a royalty-free stock photo by query. Returns up to one candidate image (id, url, tags).',
    inputSchema: SEARCH_TOOL_SCHEMA,
    execute: async (input) => {
      const { query } = input as { query: string };
      const result = await stockImageService.search(query);
      return result ?? { error: 'No results found for that query — try a different query.' };
    },
  };

  return runToolAgent({
    client: params.client,
    model: AI_CONFIG.models.premiumText.modelId,
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(params),
    tools: [searchTool],
    outputToolName: OUTPUT_TOOL_NAME,
    outputToolDescription: 'Submit the final chosen stock image url for each scene that needed one.',
    outputJsonSchema: OUTPUT_JSON_SCHEMA,
    outputZodSchema: AssetAgentOutputSchema,
    maxTokens: 1024,
    maxToolCalls: Math.max(2, params.scenesNeedingAssets.length * 2),
    tokenBudget: 6000,
    temperature: 0.3,
  });
}
