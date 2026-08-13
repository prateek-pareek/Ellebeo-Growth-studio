// ============================================================================
// Video Plan Zod schema — single source of truth for agents, UI, and core.
// Prisma VideoJob.plan must always pass parseVideoPlan() before render/publish.
// ============================================================================

import { z } from 'zod';
import {
  CAPTION_STYLES,
  CRITIC_STATUSES,
  DEFAULT_MUSIC_VOLUME,
  MAX_SCENES,
  MAX_VIDEO_DURATION_SECONDS,
  MIN_VIDEO_DURATION_SECONDS,
  MUSIC_MOODS,
  RENDER_PROVIDERS,
  SCENE_ASSET_KINDS,
  TEXT_POSITIONS,
  VIDEO_ASPECT,
  VIDEO_MOTIONS,
  VIDEO_OBJECTIVES,
  VIDEO_PLAN_SOURCES,
  VIDEO_PLAN_VERSION,
  VIDEO_STATUSES,
  VIDEO_TRANSITIONS,
  VIDEO_TYPES,
} from './constants';

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'palette colours must be #RGB or #RRGGBB');

export const sceneAssetSchema = z.object({
  kind: z.enum(SCENE_ASSET_KINDS),
  assetId: z.string().uuid().nullable(),
  url: z.string().nullable(),
  prompt: z.string().nullable(),
});

export const sceneTextSchema = z.object({
  headline: z.string().nullable(),
  caption: z.string().nullable(),
  position: z.enum(TEXT_POSITIONS),
});

export const videoSceneSchema = z.object({
  index: z.number().int().min(0),
  durationSeconds: z.number().positive().max(MAX_VIDEO_DURATION_SECONDS),
  asset: sceneAssetSchema,
  motion: z.enum(VIDEO_MOTIONS),
  text: sceneTextSchema,
  transitionOut: z.enum(VIDEO_TRANSITIONS),
});

export const voiceoverSchema = z.object({
  enabled: z.boolean(),
  script: z.string().nullable(),
  voiceId: z.string().nullable(),
  assetUrl: z.string().nullable(),
});

export const musicSchema = z.object({
  trackId: z.string().nullable(),
  mood: z.enum(MUSIC_MOODS).nullable(),
  volume: z.number().min(0).max(1).default(DEFAULT_MUSIC_VOLUME),
});

export const videoAudioSchema = z.object({
  voiceover: voiceoverSchema,
  music: musicSchema,
});

export const videoCaptionsSchema = z.object({
  enabled: z.boolean(),
  style: z.enum(CAPTION_STYLES),
  burnedIn: z.boolean(),
});

export const videoBrandingSchema = z.object({
  logoAssetId: z.string().uuid().nullable(),
  palette: z.array(hexColor),
  font: z.string(),
});

export const videoComplianceSchema = z.object({
  medicalAesthetics: z.boolean(),
});

export const videoCriticSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  passed: z.boolean(),
  revisions: z.number().int().min(0),
  notes: z.array(z.string()),
});

export const videoRenderSchema = z.object({
  provider: z.enum(RENDER_PROVIDERS),
  renderId: z.string().nullable(),
  outputUrl: z.string().nullable(),
});

export const videoMetaSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  source: z.enum(VIDEO_PLAN_SOURCES),
});

export const videoPlanSchema = z.object({
  planVersion: z.literal(VIDEO_PLAN_VERSION),
  technicianId: z.string().uuid(),
  brandDnaRef: z.string().uuid(),
  videoType: z.enum(VIDEO_TYPES),
  aspect: z.literal(VIDEO_ASPECT),
  durationSeconds: z
    .number()
    .min(MIN_VIDEO_DURATION_SECONDS)
    .max(MAX_VIDEO_DURATION_SECONDS),
  objective: z.enum(VIDEO_OBJECTIVES),
  scenes: z.array(videoSceneSchema).min(1).max(MAX_SCENES),
  audio: videoAudioSchema,
  captions: videoCaptionsSchema,
  branding: videoBrandingSchema,
  compliance: videoComplianceSchema,
  critic: videoCriticSchema,
  status: z.enum(VIDEO_STATUSES),
  render: videoRenderSchema,
  meta: videoMetaSchema,
});

export type VideoPlan = z.infer<typeof videoPlanSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type SceneAsset = z.infer<typeof sceneAssetSchema>;

export const criticStatusSchema = z.enum(CRITIC_STATUSES);

export function parseVideoPlan(input: unknown): VideoPlan {
  return videoPlanSchema.parse(input);
}

export function safeParseVideoPlan(input: unknown) {
  return videoPlanSchema.safeParse(input);
}
