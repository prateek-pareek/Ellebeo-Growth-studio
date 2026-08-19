import {
  GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG,
  GROWTH_STUDIO_VIDEO_FLAG,
  isAiClipsEnabled,
  isGrowthStudioVideoEnabled,
} from './feature-flag';

describe('GROWTH_STUDIO_VIDEO flag', () => {
  it('is off by default (existing flows stay unaffected)', () => {
    expect(isGrowthStudioVideoEnabled({})).toBe(false);
  });

  it('is on only when the env value is the string true', () => {
    expect(isGrowthStudioVideoEnabled({ [GROWTH_STUDIO_VIDEO_FLAG]: 'true' })).toBe(true);
    expect(isGrowthStudioVideoEnabled({ [GROWTH_STUDIO_VIDEO_FLAG]: '1' })).toBe(false);
    expect(isGrowthStudioVideoEnabled({ [GROWTH_STUDIO_VIDEO_FLAG]: 'false' })).toBe(false);
  });
});

describe('GROWTH_STUDIO_VIDEO_AI_CLIPS flag', () => {
  it('is off by default', () => {
    expect(isAiClipsEnabled({})).toBe(false);
  });

  it('is on only when the env value is the string true', () => {
    expect(isAiClipsEnabled({ [GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG]: 'true' })).toBe(true);
    expect(isAiClipsEnabled({ [GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG]: '1' })).toBe(false);
  });
});
