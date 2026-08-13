import type { VideoObjective, VideoType } from '../contract';
import type { AgentDefinition } from './runtime';
import { SCRIPT_SUBMIT_INPUT_SCHEMA, scriptDraftSchema, type ScriptDraft } from './script.schema';
import { runAgent, type AgentBudget } from './runtime';
import type { LlmPort } from './llm-port';

const AHPRA_RULES = `AHPRA / medical aesthetics (mandatory):
- Education and trust only. No testimonials, client quotes, or outcome promises.
- No guaranteed results, "treats/cures", before/after claims, or false urgency.
- No "book now", "only X slots left", or transformation marketing.
- Headlines may invite a consultation. Do not promise a look.`;

export interface ScriptAgentInput {
  sceneCount: number;
  objective: VideoObjective;
  brandVoice: string;
  medicalAesthetics: boolean;
  imageNotes?: string[];
  videoType?: VideoType;
  requireVoiceover?: boolean;
}

export function buildScriptAgentDefinition(input: ScriptAgentInput): AgentDefinition<ScriptDraft> {
  return {
    name: 'script',
    terminalToolName: 'submit_script',
    outputSchema: scriptDraftSchema,
    systemPrompt: [
      `You write short-form 9:16 Instagram/TikTok ${input.videoType === 'REELS' ? 'Reels' : 'slideshow'} copy for a beauty or wellness studio.`,
      'Return the result ONLY by calling submit_script. Do not wrap JSON in markdown.',
      `Write exactly ${input.sceneCount} scenes (indexes 0..${input.sceneCount - 1}).`,
      'Scene 0 headline should match the hook. Keep lines punchy. No hashtags. No emoji unless the brand voice asks for them.',
      input.requireVoiceover
        ? 'voiceoverScript is required: a spoken 12–25 second script that covers every scene in order. Do not return null.'
        : 'voiceoverScript may be null for a silent slideshow.',
      `Objective: ${input.objective}.`,
      input.brandVoice ? `Brand voice:\n${input.brandVoice}` : '',
      input.medicalAesthetics ? AHPRA_RULES : 'This is not a medical-aesthetics brand. Still avoid body-shaming and guaranteed-results language.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    tools: [
      {
        name: 'submit_script',
        description: 'Submit the final slideshow script. Call this once when the copy is ready.',
        inputSchema: SCRIPT_SUBMIT_INPUT_SCHEMA,
        terminal: true,
      },
    ],
  };
}

export function buildScriptUserPrompt(input: ScriptAgentInput): string {
  const notes = input.imageNotes?.length
    ? input.imageNotes.map((note, i) => `- Scene ${i}: ${note}`).join('\n')
    : `Write copy for ${input.sceneCount} still images.`;
  const kind = input.videoType === 'REELS' ? 'Reels' : 'slideshow';
  return `Draft a ${input.sceneCount}-scene ${kind} script.\n${notes}`;
}

export function runScriptAgent(
  input: ScriptAgentInput,
  llm: LlmPort,
  budget: AgentBudget,
) {
  return runAgent({
    definition: buildScriptAgentDefinition(input),
    userPrompt: buildScriptUserPrompt(input),
    llm,
    budget,
  });
}
