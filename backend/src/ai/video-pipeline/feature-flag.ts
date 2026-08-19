// GROWTH_STUDIO_VIDEO — pipeline + UI gate. Default OFF so existing still/caption
// flows are unchanged. Set env GROWTH_STUDIO_VIDEO=true to enable.

export const GROWTH_STUDIO_VIDEO_FLAG = 'GROWTH_STUDIO_VIDEO';

export function isGrowthStudioVideoEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[GROWTH_STUDIO_VIDEO_FLAG] === 'true';
}

// GROWTH_STUDIO_VIDEO_AI_CLIPS — Phase 7 opt-in on top of the pipeline flag above.
// Gates whether the AI-clip asset strategy will ever attempt generation; the
// per-request CreateReelsDto.useAiClips flag decides whether a given reel asks
// for it. Both must be true. Default OFF — Runway/Gemini clip calls cost real
// money and are not required for the existing stock/technician-asset flows.
export const GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG = 'GROWTH_STUDIO_VIDEO_AI_CLIPS';

export function isAiClipsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG] === 'true';
}
