// ============================================================================
// critic-agent.ts — the QA/critic agent: scores a draft's scene copy against
// a rubric (on-brand, matches objective, hook strength, pacing, compliance)
// and names which scenes are weak. Zero worker tools, same structured-output
// pattern as the Script agent — its only job is judgment, not action.
//
// The pass/fail decision itself is NOT trusted to the model's own opinion:
// the code compares the model's score against CRITIC_PASS_THRESHOLD
// deterministically (same "agent reasons, code decides" split used for the
// compliance hard gate) so the bar can't silently drift with prompt changes.
// ============================================================================

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { runToolAgent, RunToolAgentResult } from '../../agents/tool-agent-runtime';
import { AI_CONFIG } from '../../../config/ai.config';
import { CRITIC_PASS_THRESHOLD } from '../video-plan.constants';
import type { ScriptAgentBrandVoice } from './script-agent';

export const CriticAgentOutputSchema = z.object({
  score: z.number().min(0).max(1),
  weakSceneIndices: z.array(z.number().int().nonnegative()),
  notes: z.array(z.string()).min(1),
});

export type CriticAgentOutput = z.infer<typeof CriticAgentOutputSchema>;

const OUTPUT_TOOL_NAME = 'submit_critique';

const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 1, description: 'Overall quality score from 0 (unusable) to 1 (excellent).' },
    weakSceneIndices: { type: 'array', items: { type: 'integer', minimum: 0 }, description: 'Indices of scenes that need rewriting. Empty if none.' },
    notes: { type: 'array', items: { type: 'string' }, description: 'Specific, actionable notes explaining the score — at least one.' },
  },
  required: ['score', 'weakSceneIndices', 'notes'],
} as const;

export interface CriticScene {
  index: number;
  headline: string | null;
  caption: string | null;
}

export interface CriticAgentParams {
  scenes: CriticScene[];
  objective: string;
  brandVoice: ScriptAgentBrandVoice;
  medicalAesthetics: boolean;
  client?: Anthropic;
}

function buildSystemPrompt(): string {
  return [
    'You are the QA/critic agent for a short-form video pipeline.',
    'Score the draft scene copy against this rubric: (1) on-brand — matches the stated brand tone and vocabulary rules,',
    '(2) matches the stated objective, (3) hook strength — does scene 0 grab attention in the first second,',
    '(4) pacing — is each scene\'s text concise enough to read in its likely on-screen time,',
    '(5) compliance — for medical aesthetics brands, zero treatment/outcome/before-after language.',
    'Be a harsh, specific critic — vague praise is not useful. List every scene index that has a real problem in weakSceneIndices.',
    'You must respond by calling the submit_critique tool exactly once — never respond with plain text.',
  ].join(' ');
}

function buildUserPrompt(params: CriticAgentParams): string {
  const scenesBlock = params.scenes
    .map((s) => `Scene ${s.index}: headline="${s.headline ?? ''}" caption="${s.caption ?? ''}"`)
    .join('\n');
  return [
    `Business: ${params.brandVoice.businessName}`,
    `Brand tone: ${params.brandVoice.primaryTone ?? 'warm and approachable'}`,
    `Video objective: ${params.objective}`,
    params.brandVoice.vocabularyBlacklist.length > 0 ? `Forbidden words/phrases: ${params.brandVoice.vocabularyBlacklist.join(', ')}` : null,
    params.medicalAesthetics ? 'This is a medical aesthetics brand — flag any treatment/outcome/before-after language as a hard failure.' : null,
    'Draft scenes:',
    scenesBlock,
  ].filter(Boolean).join('\n');
}

export interface CriticResult {
  score: number;
  passed: boolean;
  weakSceneIndices: number[];
  notes: string[];
  tokensUsed: number;
}

export async function runCriticAgent(params: CriticAgentParams): Promise<CriticResult> {
  const result: RunToolAgentResult<CriticAgentOutput> = await runToolAgent({
    client: params.client,
    model: AI_CONFIG.models.premiumText.modelId,
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(params),
    outputToolName: OUTPUT_TOOL_NAME,
    outputToolDescription: 'Submit the critique: score, weak scene indices, and notes.',
    outputJsonSchema: OUTPUT_JSON_SCHEMA,
    outputZodSchema: CriticAgentOutputSchema,
    maxTokens: 1024,
    maxToolCalls: 0,
    tokenBudget: 4000,
    temperature: 0.3,
  });

  return {
    score: result.output.score,
    passed: result.output.score >= CRITIC_PASS_THRESHOLD,
    weakSceneIndices: result.output.weakSceneIndices,
    notes: result.output.notes,
    tokensUsed: result.tokensUsed,
  };
}
