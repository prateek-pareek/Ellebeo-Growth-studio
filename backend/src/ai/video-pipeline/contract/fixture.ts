import type { VideoPlan } from './schema';

export const VIDEO_PLAN_FIXTURE_TECHNICIAN_ID = '550e8400-e29b-41d4-a716-446655440000';
export const VIDEO_PLAN_FIXTURE_BRAND_DNA_ID = '550e8400-e29b-41d4-a716-446655440001';

export function makeValidVideoPlan(overrides: Partial<VideoPlan> = {}): VideoPlan {
  return {
    planVersion: 1,
    technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
    brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
    videoType: 'SLIDESHOW',
    aspect: '9:16',
    durationSeconds: 20,
    objective: 'EDUCATE_TRUST',
    scenes: [
      {
        index: 0,
        durationSeconds: 4,
        asset: { kind: 'IMAGE', assetId: null, url: null, prompt: null },
        motion: 'KEN_BURNS',
        text: { headline: null, caption: null, position: 'BOTTOM' },
        transitionOut: 'FADE',
      },
    ],
    audio: {
      voiceover: { enabled: false, script: null, voiceId: null, assetUrl: null },
      music: { trackId: null, mood: null, volume: 0.6 },
    },
    captions: { enabled: true, style: 'BOLD', burnedIn: true },
    branding: { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' },
    compliance: { medicalAesthetics: false },
    critic: { score: null, passed: false, revisions: 0, notes: [] },
    status: 'DRAFT',
    render: { provider: 'shotstack', renderId: null, outputUrl: null },
    meta: { createdAt: '2026-08-13T00:00:00.000Z', source: 'agentic_v1' },
    ...overrides,
  };
}
