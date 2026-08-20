import { parseVideoPlan, safeParseVideoPlan, VideoPlanValidationError } from './video-plan.schema';

function validPlan(overrides: Record<string, any> = {}) {
  return {
    technicianId: '11111111-1111-1111-1111-111111111111',
    brandDnaRef: '22222222-2222-2222-2222-222222222222',
    videoType: 'slideshow',
    durationSeconds: 20,
    objective: 'fill_quiet_days',
    scenes: [
      {
        index: 0,
        durationSeconds: 4,
        asset: { kind: 'image', assetId: null, url: 'https://cdn.example.com/a.jpg', prompt: null },
        motion: 'ken_burns',
        text: { headline: 'Hello', caption: null, position: 'bottom' },
        transitionOut: 'fade',
      },
    ],
    audio: {
      voiceover: { enabled: false, script: null, voiceId: null, assetUrl: null },
      music: { trackId: null, mood: 'chill', volume: 0.6 },
    },
    captions: { enabled: true, style: 'bold', burnedIn: true },
    branding: { logoAssetId: null, palette: ['#FFFFFF'], font: 'Inter' },
    compliance: { medicalAesthetics: false },
    critic: { score: null, status: 'pending', passed: false, revisions: 0, notes: [] },
    render: { provider: 'shotstack', renderId: null, outputUrl: null },
    meta: { createdAt: new Date().toISOString(), source: 'agentic_v1' },
    ...overrides,
  };
}

describe('VideoPlanSchema', () => {
  it('accepts a well-formed slideshow plan and fills in defaults', () => {
    const parsed = parseVideoPlan(validPlan());
    expect(parsed.planVersion).toBe(1);
    expect(parsed.aspect).toBe('9:16');
    expect(parsed.status).toBe('draft');
  });

  it('rejects an off-enum videoType', () => {
    expect(() => parseVideoPlan(validPlan({ videoType: 'CINEMATIC' }))).toThrow(VideoPlanValidationError);
  });

  it('rejects an off-enum scene motion', () => {
    const plan = validPlan();
    plan.scenes[0].motion = 'ZOOM_BLUR';
    expect(() => parseVideoPlan(plan)).toThrow(VideoPlanValidationError);
  });

  it('rejects an off-enum objective', () => {
    expect(() => parseVideoPlan(validPlan({ objective: 'GO_VIRAL' }))).toThrow(VideoPlanValidationError);
  });

  it('rejects a plan with zero scenes', () => {
    expect(() => parseVideoPlan(validPlan({ scenes: [] }))).toThrow(VideoPlanValidationError);
  });

  it('rejects a non-uuid technicianId', () => {
    expect(() => parseVideoPlan(validPlan({ technicianId: 'not-a-uuid' }))).toThrow(VideoPlanValidationError);
  });

  it('rejects an aspect ratio other than 9:16', () => {
    expect(() => parseVideoPlan(validPlan({ aspect: '16:9' }))).toThrow(VideoPlanValidationError);
  });

  it('safeParseVideoPlan returns success:false instead of throwing', () => {
    const result = safeParseVideoPlan(validPlan({ videoType: 'nope' }));
    expect(result.success).toBe(false);
  });
});
