// ============================================================================
// compliance-agent.ts — the reasoning layer of the two-layer compliance
// design. Reviews scene copy for medical-aesthetics brands and flags edge
// cases a keyword blocklist can't catch (e.g. subtly implied outcomes like
// "you'll notice a difference"). It is NOT the backstop — the code-enforced
// hard gates (client-photo-gate.ts, copy-compliance-gate.ts) are certain and
// unconditional; this agent is smart but fallible, same split as the Critic
// agent. When it flags scenes, the Director spends exactly one extra
// targeted Script-agent revision pass on them (not a loop) before the hard
// copy gate runs again as the final check.
// ============================================================================

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { runToolAgent, RunToolAgentResult } from '../../agents/tool-agent-runtime';
import { AI_CONFIG } from '../../../config/ai.config';
import type { ScriptAgentBrandVoice } from './script-agent';

export const ComplianceAgentOutputSchema = z.object({
  flaggedSceneIndices: z.array(z.number().int().nonnegative()),
  reasons: z.array(z.string()),
});

export type ComplianceAgentOutput = z.infer<typeof ComplianceAgentOutputSchema>;

const OUTPUT_TOOL_NAME = 'submit_compliance_review';

const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    flaggedSceneIndices: { type: 'array', items: { type: 'integer', minimum: 0 }, description: 'Indices of scenes with a compliance risk. Empty if none.' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'One reason per flagged scene, or empty if none flagged.' },
  },
  required: ['flaggedSceneIndices', 'reasons'],
} as const;

export interface ComplianceScene {
  index: number;
  headline: string | null;
  caption: string | null;
}

export interface ComplianceAgentParams {
  scenes: ComplianceScene[];
  brandVoice: ScriptAgentBrandVoice;
  client?: Anthropic;
}

function buildSystemPrompt(): string {
  return [
    'You are the Compliance agent for a medical aesthetics brand\'s short-form video pipeline.',
    'A code-level filter has already removed obvious medical-claim/guaranteed-results language.',
    'Your job is catching subtler edge cases it would miss: implied treatment outcomes ("you\'ll notice a difference"),',
    'before/after framing without the words "before" or "after", implied medical authority, or comparative claims.',
    'When in doubt, flag it — a false positive costs a rewrite; a false negative is a legal risk.',
    'You must respond by calling the submit_compliance_review tool exactly once — never respond with plain text.',
  ].join(' ');
}

function buildUserPrompt(params: ComplianceAgentParams): string {
  const scenesBlock = params.scenes
    .map((s) => `Scene ${s.index}: headline="${s.headline ?? ''}" caption="${s.caption ?? ''}"`)
    .join('\n');
  return [
    `Business: ${params.brandVoice.businessName} (medical aesthetics practitioner)`,
    'Review these scenes for compliance risk:',
    scenesBlock,
  ].join('\n');
}

export async function runComplianceAgent(params: ComplianceAgentParams): Promise<RunToolAgentResult<ComplianceAgentOutput>> {
  return runToolAgent({
    client: params.client,
    model: AI_CONFIG.models.premiumText.modelId,
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(params),
    outputToolName: OUTPUT_TOOL_NAME,
    outputToolDescription: 'Submit the compliance review: flagged scene indices and reasons.',
    outputJsonSchema: OUTPUT_JSON_SCHEMA,
    outputZodSchema: ComplianceAgentOutputSchema,
    maxTokens: 1024,
    maxToolCalls: 0,
    tokenBudget: 4000,
    temperature: 0.2,
  });
}
