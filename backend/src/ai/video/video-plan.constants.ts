// ============================================================================
// video-plan.constants.ts — enumerated values + defaults for the Video Plan
// contract. Mirrors the Prisma enums in schema.prisma (VideoType,
// SceneAssetKind, Motion, Transition, VideoStatus, CriticStatus) so the DB,
// the zod schema, and any UI dropdown all read from the same list.
// ============================================================================

export const VIDEO_TYPES = ['slideshow', 'reels', 'ai_clips'] as const;

export const SCENE_ASSET_KINDS = ['image', 'video', 'generated_clip', 'stock'] as const;

export const MOTIONS = ['ken_burns', 'none', 'slide'] as const;

export const TRANSITIONS = ['fade', 'cut', 'slide'] as const;

export const TEXT_POSITIONS = ['top', 'center', 'bottom'] as const;

export const CAPTION_STYLES = ['bold', 'minimal'] as const;

export const VIDEO_STATUSES = [
  'draft',
  'in_review',
  'edited',
  'rendering',
  'rendered',
  'published',
  'failed',
] as const;

export const CRITIC_STATUSES = ['pending', 'passed', 'failed', 'revising'] as const;

// Video-specific CTA objective. Deliberately separate from BusinessGoalType
// (Prisma) — that models the tenant's overall business goal; this models what
// a single video is trying to do, which is a finer-grained, video-only concept.
export const VIDEO_OBJECTIVES = [
  'premium_clients',
  'fill_quiet_days',
  'educate_trust',
  'social_proof',
  'promotion',
  'brand_awareness',
] as const;

export const RENDER_PROVIDERS = ['shotstack'] as const;

export const PLAN_VERSION = 1;

export const ASPECT_RATIO = '9:16';

export const DEFAULT_DURATION_SECONDS = 20;
export const MIN_SCENE_DURATION_SECONDS = 2;
export const MAX_SCENE_DURATION_SECONDS = 15;
export const MIN_SCENES = 1;
export const MAX_SCENES = 12;

export const DEFAULT_MUSIC_VOLUME = 0.6;

// Bounds enforced by the critic loop (Phase 5) — kept here so the Prisma
// column default, the agent runtime, and any UI copy agree on the ceiling.
export const MAX_CRITIC_REVISIONS = 2;
export const CRITIC_PASS_THRESHOLD = 0.7;

export type VideoTypeValue = (typeof VIDEO_TYPES)[number];
export type SceneAssetKindValue = (typeof SCENE_ASSET_KINDS)[number];
export type MotionValue = (typeof MOTIONS)[number];
export type TransitionValue = (typeof TRANSITIONS)[number];
export type TextPositionValue = (typeof TEXT_POSITIONS)[number];
export type CaptionStyleValue = (typeof CAPTION_STYLES)[number];
export type VideoStatusValue = (typeof VIDEO_STATUSES)[number];
export type CriticStatusValue = (typeof CRITIC_STATUSES)[number];
export type VideoObjectiveValue = (typeof VIDEO_OBJECTIVES)[number];
