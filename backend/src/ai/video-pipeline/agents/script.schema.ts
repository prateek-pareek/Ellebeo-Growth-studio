import { z } from 'zod';
import { MAX_SCENES, TEXT_POSITIONS } from '../contract';

export const scriptSceneDraftSchema = z.object({
  index: z.number().int().min(0),
  headline: z.string().min(1).max(80),
  caption: z.string().max(120).nullable(),
  position: z.enum(TEXT_POSITIONS),
});

export const scriptDraftSchema = z.object({
  hook: z.string().min(1).max(80),
  scenes: z.array(scriptSceneDraftSchema).min(1).max(MAX_SCENES),
  voiceoverScript: z.string().max(800).nullable(),
});

export type ScriptSceneDraft = z.infer<typeof scriptSceneDraftSchema>;
export type ScriptDraft = z.infer<typeof scriptDraftSchema>;

export const SCRIPT_SUBMIT_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    hook: {
      type: 'string',
      description: 'Opening hook for scene 0. Max 80 characters. No hashtags.',
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', minimum: 0 },
          headline: { type: 'string', maxLength: 80 },
          caption: { type: ['string', 'null'], maxLength: 120 },
          position: { type: 'string', enum: [...TEXT_POSITIONS] },
        },
        required: ['index', 'headline', 'caption', 'position'],
      },
    },
    voiceoverScript: {
      type: ['string', 'null'],
      description: 'Optional spoken script for later reels/VO. Null for silent slideshow.',
    },
  },
  required: ['hook', 'scenes', 'voiceoverScript'],
};
