// ============================================================================
// Video Plan constants — motions, transitions, caption styles, enums.
// Imported by agents, UI, and the deterministic render core.
// Keep in lockstep with Prisma enums in backend/prisma/schema.prisma.
// ============================================================================

export const VIDEO_PLAN_VERSION = 1 as const;

export const VIDEO_ASPECT = '9:16' as const;

export const VIDEO_TYPES = ['SLIDESHOW', 'REELS', 'AI_CLIPS'] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

export const SCENE_ASSET_KINDS = ['IMAGE', 'VIDEO', 'GENERATED_CLIP', 'STOCK'] as const;
export type SceneAssetKind = (typeof SCENE_ASSET_KINDS)[number];

export const VIDEO_MOTIONS = ['KEN_BURNS', 'NONE', 'SLIDE'] as const;
export type VideoMotion = (typeof VIDEO_MOTIONS)[number];

export const VIDEO_TRANSITIONS = ['FADE', 'CUT', 'SLIDE'] as const;
export type VideoTransition = (typeof VIDEO_TRANSITIONS)[number];

export const VIDEO_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'EDITED',
  'RENDERING',
  'RENDERED',
  'PUBLISHED',
  'FAILED',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const CRITIC_STATUSES = ['PENDING', 'PASSED', 'FAILED', 'REVISION_REQUESTED'] as const;
export type CriticStatus = (typeof CRITIC_STATUSES)[number];

export const VIDEO_OBJECTIVES = [
  'PREMIUM_CLIENTS',
  'FILL_QUIET_DAYS',
  'EDUCATE_TRUST',
  'ATTRACT_NEW_CLIENTS',
  'PROMOTE_HIGH_MARGIN',
  'CLIENT_RETENTION',
  'LAUNCH_NEW_SERVICE',
] as const;
export type VideoObjective = (typeof VIDEO_OBJECTIVES)[number];

export const CAPTION_STYLES = ['BOLD', 'MINIMAL'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const TEXT_POSITIONS = ['TOP', 'CENTER', 'BOTTOM'] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

export const RENDER_PROVIDERS = ['shotstack'] as const;
export type RenderProvider = (typeof RENDER_PROVIDERS)[number];

export const VIDEO_PLAN_SOURCES = ['agentic_v1', 'rule_based_v1'] as const;
export type VideoPlanSource = (typeof VIDEO_PLAN_SOURCES)[number];

export const MUSIC_MOODS = [
  'luxury',
  'upbeat',
  'chill',
  'elegant',
  'bold',
  'clinical',
  'warm',
  'playful',
] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const VIDEO_MOTION_LABELS: Record<VideoMotion, string> = {
  KEN_BURNS: 'Ken Burns',
  NONE: 'None',
  SLIDE: 'Slide',
};

export const VIDEO_TRANSITION_LABELS: Record<VideoTransition, string> = {
  FADE: 'Fade',
  CUT: 'Cut',
  SLIDE: 'Slide',
};

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  BOLD: 'Bold',
  MINIMAL: 'Minimal',
};

export const TEXT_POSITION_LABELS: Record<TextPosition, string> = {
  TOP: 'Top',
  CENTER: 'Center',
  BOTTOM: 'Bottom',
};

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
  SLIDESHOW: 'Slideshow',
  REELS: 'Reels',
  AI_CLIPS: 'AI clips',
};

export const DEFAULT_MUSIC_VOLUME = 0.6;
export const DEFAULT_SCENE_DURATION_SECONDS = 4;
export const DEFAULT_VIDEO_DURATION_SECONDS = 20;
export const MAX_VIDEO_DURATION_SECONDS = 90;
export const MIN_VIDEO_DURATION_SECONDS = 4;
export const MAX_SCENES = 12;
export const DEFAULT_CRITIC_MAX_REVISIONS = 2;
