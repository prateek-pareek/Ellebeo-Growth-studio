// ============================================================================
// script-agent.ts — writes per-scene headline/caption copy for a Video Plan.
// No worker tools: this agent's only job is to produce validated JSON, so it
// is forced to answer by calling the `submit_scenes` output tool (tool_use
// as structured-output enforcement, not as a means to call side-effecting
// tools — that comes with the Asset/Compliance agents in later phases).
// ============================================================================

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { runToolAgent, RunToolAgentResult } from '../../agents/tool-agent-runtime';
import { AI_CONFIG } from '../../../config/ai.config';

export const ScriptAgentOutputSchema = z.object({
  scenes: z.array(z.object({
    index: z.number().int().nonnegative(),
    headline: z.string().max(200).nullable(),
    caption: z.string().max(500).nullable(),
  })).min(1),
});

export type ScriptAgentOutput = z.infer<typeof ScriptAgentOutputSchema>;

const OUTPUT_TOOL_NAME = 'submit_scenes';

const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', minimum: 0, description: 'Scene index, matching the order the images were given in.' },
          headline: { type: ['string', 'null'], description: 'Short on-screen text for this scene, or null for no text.' },
          caption: { type: ['string', 'null'], description: 'Secondary supporting text for this scene, or null.' },
        },
        required: ['index', 'headline', 'caption'],
      },
    },
  },
  required: ['scenes'],
} as const;

export interface ScriptAgentBrandVoice {
  businessName: string;
  primaryTone: string | null;
  vocabularyBlacklist: string[];
  doNotSay: string[];
}

export interface ScriptRevisionContext {
  /** Only these scene indices need new copy — everything else in the plan stays untouched. */
  indices: number[];
  /** Critic agent's targeted notes on what was wrong. */
  notes: string[];
  previousScenes: Array<{ index: number; headline: string | null; caption: string | null }>;
}

export interface ScriptAgentParams {
  sceneCount: number;
  objective: string;
  brandVoice: ScriptAgentBrandVoice;
  medicalAesthetics: boolean;
  client?: Anthropic;
  /** Set by the Director's critic loop (Phase 5) to re-write only the weak scenes. */
  revision?: ScriptRevisionContext;
}

function buildSystemPrompt(): string {
  return [
    'You are the Script agent for a short-form (9:16) video pipeline.',
    'Your only job is writing tight, on-brand on-screen text for each scene of a slideshow-style video.',
    'You never write medical claims, treatment outcomes, or before/after language.',
    'You must respond by calling the submit_scenes tool exactly once with your final answer — never respond with plain text.',
  ].join(' ');
}

function buildUserPrompt(params: ScriptAgentParams): string {
  const { sceneCount, objective, brandVoice, medicalAesthetics, revision } = params;

  if (revision) {
    const previousBlock = revision.previousScenes
      .map((s) => `Scene ${s.index}: headline="${s.headline ?? ''}" caption="${s.caption ?? ''}"`)
      .join('\n');
    const lines = [
      `Business: ${brandVoice.businessName}`,
      `Brand tone: ${brandVoice.primaryTone ?? 'warm and approachable'}`,
      `Video objective: ${objective}`,
      'A critic reviewed this draft and flagged specific scenes as weak. Rewrite ONLY those scenes — do not touch the others.',
      'Full current draft for context:',
      previousBlock,
      `Scenes to rewrite: ${revision.indices.join(', ')}`,
      `Critic notes: ${revision.notes.join(' | ')}`,
      brandVoice.vocabularyBlacklist.length > 0 ? `Never use these words/phrases: ${brandVoice.vocabularyBlacklist.join(', ')}` : null,
      brandVoice.doNotSay.length > 0 ? `Never say: ${brandVoice.doNotSay.join(', ')}` : null,
      medicalAesthetics
        ? 'This is a medical aesthetics brand — do not reference treatment outcomes, results, or before/after in any copy.'
        : null,
      `Return scenes only for indices ${revision.indices.join(', ')} — nothing else.`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  const lines = [
    `Business: ${brandVoice.businessName}`,
    `Brand tone: ${brandVoice.primaryTone ?? 'warm and approachable'}`,
    `Video objective: ${objective}`,
    `Number of scenes: ${sceneCount} (write one headline/caption pair per scene, index 0 to ${sceneCount - 1})`,
    brandVoice.vocabularyBlacklist.length > 0 ? `Never use these words/phrases: ${brandVoice.vocabularyBlacklist.join(', ')}` : null,
    brandVoice.doNotSay.length > 0 ? `Never say: ${brandVoice.doNotSay.join(', ')}` : null,
    medicalAesthetics
      ? 'This is a medical aesthetics brand — do not reference treatment outcomes, results, or before/after in any copy.'
      : null,
    'Keep each headline under 8 words. Caption is optional — use null when a headline alone is enough.',
  ].filter(Boolean);

  return lines.join('\n');
}

export async function runScriptAgent(params: ScriptAgentParams): Promise<RunToolAgentResult<ScriptAgentOutput>> {
  return runToolAgent({
    client: params.client,
    model: AI_CONFIG.models.premiumText.modelId,
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(params),
    outputToolName: OUTPUT_TOOL_NAME,
    outputToolDescription: 'Submit the final scene headline/caption copy for the video plan.',
    outputJsonSchema: OUTPUT_JSON_SCHEMA,
    outputZodSchema: ScriptAgentOutputSchema,
    maxTokens: 1024,
    maxToolCalls: 0,
    tokenBudget: 4000,
    temperature: 0.7,
  });
}
