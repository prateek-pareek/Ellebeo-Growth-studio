import { GROWTH_STUDIO_VIDEO_FLAG, isGrowthStudioVideoEnabled } from './feature-flag';

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
