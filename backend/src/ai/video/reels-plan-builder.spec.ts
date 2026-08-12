import { buildReelsPlan, buildAiClipsPlan, ReelsPlanBuilderError } from './reels-plan-builder';
import { safeParseVideoPlan } from './video-plan.schema';

const baseParams = {
  technicianId: '11111111-1111-1111-1111-111111111111',
  brandDnaRef: '22222222-2222-2222-2222-222222222222',
  objective: 'fill_quiet_days' as const,
  sceneCopy: [
    { index: 0, headline: 'Glow Up', caption: null },
    { index: 1, headline: 'Book Today', caption: 'Spots filling fast' },
  ],
  resolvedAssets: [
    { index: 0, kind: 'image' as const, url: 'https://cdn.example.com/1.jpg', durationSeconds: 4 },
    { index: 1, kind: 'stock' as const, url: 'https://pixabay.com/2.jpg', durationSeconds: 6 },
  ],
};

describe('buildReelsPlan', () => {
  it('produces a schema-valid plan with videoType reels', () => {
    const plan = buildReelsPlan(baseParams);
    expect(safeParseVideoPlan(plan).success).toBe(true);
    expect(plan.videoType).toBe('reels');
    expect(plan.captions.burnedIn).toBe(true);
  });

  it('uses each scene resolved asset duration directly, and sums total duration from them', () => {
    const plan = buildReelsPlan(baseParams);
    expect(plan.scenes[0]!.durationSeconds).toBe(4);
    expect(plan.scenes[1]!.durationSeconds).toBe(6);
    expect(plan.durationSeconds).toBe(10);
  });

  it('enables voiceover in the plan when a resolved voiceover is provided', () => {
    const plan = buildReelsPlan({
      ...baseParams,
      voiceover: { script: 'Glow up. Book today.', voiceId: 'voice-1', assetUrl: 'https://cdn.example.com/vo.mp3', durationSeconds: 10 },
    });
    expect(plan.audio.voiceover.enabled).toBe(true);
    expect(plan.audio.voiceover.assetUrl).toBe('https://cdn.example.com/vo.mp3');
  });

  it('throws if a scene has no resolved asset', () => {
    expect(() => buildReelsPlan({ ...baseParams, resolvedAssets: [baseParams.resolvedAssets[0]!] })).toThrow(ReelsPlanBuilderError);
  });

  it('throws on zero scenes', () => {
    expect(() => buildReelsPlan({ ...baseParams, sceneCopy: [], resolvedAssets: [] })).toThrow(ReelsPlanBuilderError);
  });

  it('sets motion to none for video/generated_clip assets, ken_burns for stills', () => {
    const plan = buildReelsPlan({
      ...baseParams,
      resolvedAssets: [
        { index: 0, kind: 'image' as const, url: 'https://cdn.example.com/1.jpg', durationSeconds: 4 },
        { index: 1, kind: 'generated_clip' as const, url: 'https://runway.example.com/2.mp4', durationSeconds: 6 },
      ],
    });
    expect(plan.scenes[0]!.motion).toBe('ken_burns');
    expect(plan.scenes[1]!.motion).toBe('none');
  });
});

describe('buildAiClipsPlan', () => {
  const aiClipsParams = {
    ...baseParams,
    resolvedAssets: [
      { index: 0, kind: 'generated_clip' as const, url: 'https://runway.example.com/1.mp4', durationSeconds: 5 },
      { index: 1, kind: 'generated_clip' as const, url: 'https://runway.example.com/2.mp4', durationSeconds: 5 },
    ],
  };

  it('produces a schema-valid plan with videoType ai_clips', () => {
    const plan = buildAiClipsPlan(aiClipsParams);
    expect(safeParseVideoPlan(plan).success).toBe(true);
    expect(plan.videoType).toBe('ai_clips');
  });

  it('every scene asset kind is generated_clip and motion is none (no Ken Burns on video)', () => {
    const plan = buildAiClipsPlan(aiClipsParams);
    for (const scene of plan.scenes) {
      expect(scene.asset.kind).toBe('generated_clip');
      expect(scene.motion).toBe('none');
    }
  });
});
