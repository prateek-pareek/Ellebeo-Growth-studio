// ============================================================================
// video-plan.schema.ts — the Video Plan contract (planVersion 1).
// Single source of truth for the shape stored in VideoPlan.plan (Prisma Json
// column). Imported by agents (output validation), the render core (input
// validation), and — once the tweak UI ships — the frontend, so all three
// speak the exact same shape. Do not hand-roll a parallel interface anywhere;
// extend this file instead.
// ============================================================================

import { z } from 'zod';
import {
  ASPECT_RATIO,
  CAPTION_STYLES,
  CRITIC_STATUSES,
  MAX_SCENES,
  MAX_SCENE_DURATION_SECONDS,
  MIN_SCENES,
  MIN_SCENE_DURATION_SECONDS,
  MOTIONS,
  PLAN_VERSION,
  RENDER_PROVIDERS,
  SCENE_ASSET_KINDS,
  TEXT_POSITIONS,
  TRANSITIONS,
  VIDEO_OBJECTIVES,
  VIDEO_STATUSES,
  VIDEO_TYPES,
} from './video-plan.constants';

const uuid = z.string().uuid();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'expected a hex color');

export const SceneAssetSchema = z.object({
  kind: z.enum(SCENE_ASSET_KINDS),
  assetId: uuid.nullable().default(null),
  url: z.string().url().nullable().default(null),
  prompt: z.string().max(2000).nullable().default(null),
});

export const SceneTextSchema = z.object({
  headline: z.string().max(200).nullable().default(null),
  caption: z.string().max(500).nullable().default(null),
  position: z.enum(TEXT_POSITIONS).default('bottom'),
});

export const SceneSchema = z.object({
  index: z.number().int().nonnegative(),
  durationSeconds: z.number().min(MIN_SCENE_DURATION_SECONDS).max(MAX_SCENE_DURATION_SECONDS),
  asset: SceneAssetSchema,
  motion: z.enum(MOTIONS).default('none'),
  text: SceneTextSchema,
  transitionOut: z.enum(TRANSITIONS).default('fade'),
});

export const VoiceoverSchema = z.object({
  enabled: z.boolean().default(false),
  script: z.string().max(5000).nullable().default(null),
  voiceId: z.string().nullable().default(null),
  assetUrl: z.string().url().nullable().default(null),
});

export const MusicSchema = z.object({
  trackId: z.string().nullable().default(null),
  mood: z.string().max(100).nullable().default(null),
  volume: z.number().min(0).max(1).default(0.6),
});

export const AudioSchema = z.object({
  voiceover: VoiceoverSchema,
  music: MusicSchema,
});

export const CaptionsSchema = z.object({
  enabled: z.boolean().default(true),
  style: z.enum(CAPTION_STYLES).default('minimal'),
  burnedIn: z.boolean().default(true),
});

export const BrandingSchema = z.object({
  logoAssetId: uuid.nullable().default(null),
  palette: z.array(hexColor).max(6).default([]),
  font: z.string().max(100).nullable().default(null),
});

export const ComplianceSchema = z.object({
  medicalAesthetics: z.boolean().default(false),
});

export const CriticSchema = z.object({
  score: z.number().min(0).max(1).nullable().default(null),
  status: z.enum(CRITIC_STATUSES).default('pending'),
  passed: z.boolean().default(false),
  revisions: z.number().int().nonnegative().default(0),
  notes: z.array(z.string()).default([]),
});

export const RenderSchema = z.object({
  provider: z.enum(RENDER_PROVIDERS).default('shotstack'),
  renderId: z.string().nullable().default(null),
  outputUrl: z.string().url().nullable().default(null),
});

export const VideoPlanMetaSchema = z.object({
  createdAt: z.string().datetime(),
  source: z.literal('agentic_v1').default('agentic_v1'),
});

export const VideoPlanSchema = z.object({
  planVersion: z.literal(PLAN_VERSION).default(PLAN_VERSION),
  technicianId: uuid,
  brandDnaRef: uuid,
  videoType: z.enum(VIDEO_TYPES),
  aspect: z.literal(ASPECT_RATIO).default(ASPECT_RATIO),
  durationSeconds: z.number().positive(),
  objective: z.enum(VIDEO_OBJECTIVES),
  scenes: z.array(SceneSchema).min(MIN_SCENES).max(MAX_SCENES),
  audio: AudioSchema,
  captions: CaptionsSchema,
  branding: BrandingSchema,
  compliance: ComplianceSchema,
  critic: CriticSchema,
  status: z.enum(VIDEO_STATUSES).default('draft'),
  render: RenderSchema,
  meta: VideoPlanMetaSchema,
});

export type SceneAsset = z.infer<typeof SceneAssetSchema>;
export type SceneText = z.infer<typeof SceneTextSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Voiceover = z.infer<typeof VoiceoverSchema>;
export type Music = z.infer<typeof MusicSchema>;
export type Audio = z.infer<typeof AudioSchema>;
export type Captions = z.infer<typeof CaptionsSchema>;
export type Branding = z.infer<typeof BrandingSchema>;
export type Compliance = z.infer<typeof ComplianceSchema>;
export type Critic = z.infer<typeof CriticSchema>;
export type Render = z.infer<typeof RenderSchema>;
export type VideoPlanMeta = z.infer<typeof VideoPlanMetaSchema>;
export type VideoPlan = z.infer<typeof VideoPlanSchema>;

export class VideoPlanValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(`Video Plan failed validation: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    this.name = 'VideoPlanValidationError';
  }
}

export function parseVideoPlan(data: unknown): VideoPlan {
  const result = VideoPlanSchema.safeParse(data);
  if (!result.success) {
    throw new VideoPlanValidationError(result.error.issues);
  }
  return result.data;
}

export function safeParseVideoPlan(data: unknown) {
  return VideoPlanSchema.safeParse(data);
}
