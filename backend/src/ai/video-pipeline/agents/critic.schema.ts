import { z } from 'zod';

export const CRITIC_RUBRIC_MAX = {
  hook: 25,
  clarity: 20,
  brandVoice: 15,
  pacing: 10,
  objectiveFit: 15,
  compliance: 15,
} as const;

export const criticVerdictSchema = z.object({
  hook: z.number().min(0).max(CRITIC_RUBRIC_MAX.hook),
  clarity: z.number().min(0).max(CRITIC_RUBRIC_MAX.clarity),
  brandVoice: z.number().min(0).max(CRITIC_RUBRIC_MAX.brandVoice),
  pacing: z.number().min(0).max(CRITIC_RUBRIC_MAX.pacing),
  objectiveFit: z.number().min(0).max(CRITIC_RUBRIC_MAX.objectiveFit),
  compliance: z.number().min(0).max(CRITIC_RUBRIC_MAX.compliance),
  notes: z.array(z.string().min(1).max(200)).min(1).max(8),
});

export type CriticVerdict = z.infer<typeof criticVerdictSchema>;

export const CRITIC_SUBMIT_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    hook: { type: 'number', minimum: 0, maximum: CRITIC_RUBRIC_MAX.hook },
    clarity: { type: 'number', minimum: 0, maximum: CRITIC_RUBRIC_MAX.clarity },
    brandVoice: { type: 'number', minimum: 0, maximum: CRITIC_RUBRIC_MAX.brandVoice },
    pacing: { type: 'number', minimum: 0, maximum: CRITIC_RUBRIC_MAX.pacing },
    objectiveFit: { type: 'number', minimum: 0, maximum: CRITIC_RUBRIC_MAX.objectiveFit },
    compliance: { type: 'number', minimum: 0, maximum: CRITIC_RUBRIC_MAX.compliance },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete revision notes. If the draft fails, say exactly what to change.',
    },
  },
  required: ['hook', 'clarity', 'brandVoice', 'pacing', 'objectiveFit', 'compliance', 'notes'],
};

export function criticScore(verdict: CriticVerdict): number {
  return (
    verdict.hook +
    verdict.clarity +
    verdict.brandVoice +
    verdict.pacing +
    verdict.objectiveFit +
    verdict.compliance
  );
}
