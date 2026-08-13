// GROWTH_STUDIO_VIDEO — pipeline + UI gate. Default OFF so existing still/caption
// flows are unchanged. Set env GROWTH_STUDIO_VIDEO=true to enable.

export const GROWTH_STUDIO_VIDEO_FLAG = 'GROWTH_STUDIO_VIDEO';

export function isGrowthStudioVideoEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[GROWTH_STUDIO_VIDEO_FLAG] === 'true';
}
