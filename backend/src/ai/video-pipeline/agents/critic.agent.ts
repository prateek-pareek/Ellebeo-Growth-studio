import { DEFAULT_CRITIC_PASS_SCORE, type VideoPlan } from '../contract';
import type { LlmPort } from './llm-port';
import {
  CRITIC_RUBRIC_MAX,
  CRITIC_SUBMIT_INPUT_SCHEMA,
  criticScore,
  criticVerdictSchema,
  type CriticVerdict,
} from './critic.schema';
import { runAgent, type AgentBudget, type AgentDefinition } from './runtime';

export interface CriticResult {
  verdict: CriticVerdict;
  score: number;
  passed: boolean;
  notes: string[];
  repaired: boolean;
}

export interface CriticAgentInput {
  plan: VideoPlan;
  brandVoice?: string;
  passScore?: number;
}

export function buildCriticAgentDefinition(input: CriticAgentInput): AgentDefinition<CriticVerdict> {
  return {
    name: 'critic',
    terminalToolName: 'submit_critique',
    outputSchema: criticVerdictSchema,
    systemPrompt: [
      'You are the QA critic for a 9:16 Instagram/TikTok studio video (slideshow or Reels).',
      'Score ONLY the copy and structure in the brief. Do not invent visuals that are not described.',
      'Return the result ONLY by calling submit_critique.',
      'Rubric (integer points, sum is the score out of 100):',
      `- hook (0-${CRITIC_RUBRIC_MAX.hook}): first-scene line stops the scroll without being generic.`,
      `- clarity (0-${CRITIC_RUBRIC_MAX.clarity}): each scene line is short, specific, and readable on a phone.`,
      `- brandVoice (0-${CRITIC_RUBRIC_MAX.brandVoice}): matches the brand voice; no AI tells ("obsessed", "glow up", "luxurious journey").`,
      `- pacing (0-${CRITIC_RUBRIC_MAX.pacing}): scene count and duration fit a short-form watch.`,
      `- objectiveFit (0-${CRITIC_RUBRIC_MAX.objectiveFit}): serves the stated objective without cheap urgency.`,
      `- compliance (0-${CRITIC_RUBRIC_MAX.compliance}): no guaranteed results, testimonials, before/after claims, or body-shaming. If medical aesthetics, AHPRA rules apply — compliance MUST be 0 when violated.`,
      'Notes must be actionable. If the draft is weak, say what to rewrite.',
      input.brandVoice ? `Brand voice:\n${input.brandVoice}` : '',
      input.plan.compliance.medicalAesthetics
        ? 'This brand is medical aesthetics. Education/trust only. No outcome promises.'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    tools: [
      {
        name: 'submit_critique',
        description: 'Submit the rubric scores and revision notes.',
        inputSchema: CRITIC_SUBMIT_INPUT_SCHEMA,
        terminal: true,
      },
    ],
  };
}

export function buildCriticUserPrompt(plan: VideoPlan): string {
  return `Critique this Video Plan copy:\n${JSON.stringify({
    videoType: plan.videoType,
    objective: plan.objective,
    durationSeconds: plan.durationSeconds,
    medicalAesthetics: plan.compliance.medicalAesthetics,
    scenes: plan.scenes.map((scene) => ({
      index: scene.index,
      seconds: scene.durationSeconds,
      headline: scene.text.headline,
      caption: scene.text.caption,
    })),
    voiceoverScript: plan.audio.voiceover.script,
  })}`;
}

export async function runCriticAgent(
  input: CriticAgentInput,
  llm: LlmPort,
  budget: AgentBudget,
): Promise<CriticResult> {
  const run = await runAgent({
    definition: buildCriticAgentDefinition(input),
    userPrompt: buildCriticUserPrompt(input.plan),
    llm,
    budget,
  });
  const score = criticScore(run.output);
  const passScore = input.passScore ?? DEFAULT_CRITIC_PASS_SCORE;
  return {
    verdict: run.output,
    score,
    passed: score >= passScore,
    notes: run.output.notes,
    repaired: run.repaired,
  };
}
