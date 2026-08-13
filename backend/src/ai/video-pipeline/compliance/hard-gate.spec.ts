import { makeValidVideoPlan } from '../contract/fixture';
import { processVideoRenderJob } from '../core/video-render.processor';
import { assertVideoPlanHardGate, ComplianceHardGateError, evaluateVideoPlanHardGate } from './hard-gate';

function scene(overrides: {
  kind?: 'IMAGE' | 'VIDEO' | 'GENERATED_CLIP' | 'STOCK';
  url?: string;
  headline?: string | null;
  caption?: string | null;
}) {
  return {
    index: 0,
    durationSeconds: 4,
    asset: {
      kind: overrides.kind ?? 'IMAGE',
      assetId: null,
      url: overrides.url ?? 'https://cdn.example.com/a.jpg',
      prompt: null,
    },
    motion: 'KEN_BURNS' as const,
    text: {
      headline: overrides.headline ?? 'Quiet luxury',
      caption: overrides.caption ?? null,
      position: 'BOTTOM' as const,
    },
    transitionOut: 'CUT' as const,
  };
}

describe('evaluateVideoPlanHardGate', () => {
  it('passes clean slideshow copy including "Book in"', () => {
    const plan = makeValidVideoPlan({
      videoType: 'SLIDESHOW',
      scenes: [scene({ headline: 'Book in' })],
    });
    expect(evaluateVideoPlanHardGate(plan).passed).toBe(true);
  });

  it('blocks slideshow guaranteed-results copy', () => {
    const plan = makeValidVideoPlan({
      videoType: 'SLIDESHOW',
      scenes: [scene({ headline: 'Guaranteed glow tonight' })],
    });
    const result = evaluateVideoPlanHardGate(plan);
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toContain('guaranteed');
  });

  it('blocks reels VO medical-claim language', () => {
    const plan = makeValidVideoPlan({
      videoType: 'REELS',
      durationSeconds: 8,
      scenes: [
        scene({ headline: 'Skin literacy' }),
        { ...scene({ headline: 'Consult first', url: 'https://cdn.example.com/b.jpg' }), index: 1 },
      ],
      audio: {
        voiceover: {
          enabled: true,
          script: 'This cream is clinically proven to erase lines',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          assetUrl: 'https://cdn.example.com/vo.mp3',
        },
        music: { trackId: null, mood: null, volume: 0.3 },
      },
    });
    expect(evaluateVideoPlanHardGate(plan).passed).toBe(false);
  });

  it('blocks AI-clips generated faces for medical-aesthetics brands', () => {
    const plan = makeValidVideoPlan({
      videoType: 'AI_CLIPS',
      compliance: { medicalAesthetics: true },
      scenes: [scene({ kind: 'GENERATED_CLIP', url: 'https://cdn.example.com/gen.mp4', headline: 'Skin literacy' })],
    });
    const result = evaluateVideoPlanHardGate(plan);
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toContain('generated clips');
  });

  it('allows AI-clips when the brand is not medical aesthetics', () => {
    const plan = makeValidVideoPlan({
      videoType: 'AI_CLIPS',
      compliance: { medicalAesthetics: false },
      scenes: [scene({ kind: 'GENERATED_CLIP', url: 'https://cdn.example.com/gen.mp4' })],
    });
    expect(evaluateVideoPlanHardGate(plan).passed).toBe(true);
  });

  it('does not flag "treatment" as the verb "treats"', () => {
    const plan = makeValidVideoPlan({
      scenes: [scene({ headline: 'Treatment consult' })],
    });
    expect(evaluateVideoPlanHardGate(plan).passed).toBe(true);
  });
});

describe('render hard gate', () => {
  it('refuses Shotstack submit when the plan fails the gate', async () => {
    const plan = makeValidVideoPlan({
      videoType: 'SLIDESHOW',
      scenes: [scene({ headline: 'Guaranteed results' })],
    });
    const submitRender = jest.fn(async () => 'should-not-run');
    await expect(
      processVideoRenderJob(
        {
          prisma: {
            videoJob: {
              findUnique: async () => ({
                id: '11111111-1111-1111-1111-111111111111',
                tenantId: '22222222-2222-2222-2222-222222222222',
                status: 'DRAFT',
                plan,
                shotstackRenderId: null,
                outputUrl: null,
                contentItemId: null,
              }),
              update: async () => undefined,
            },
          },
          shotstack: { submitRender },
          isEnabled: () => true,
        },
        {
          videoJobId: '11111111-1111-1111-1111-111111111111',
          tenantId: '22222222-2222-2222-2222-222222222222',
        },
      ),
    ).rejects.toThrow(/Compliance hard gate/);
    expect(submitRender).not.toHaveBeenCalled();
  });
});

describe('ComplianceHardGateError', () => {
  it('is thrown by assert on a failing plan', () => {
    const plan = makeValidVideoPlan({
      scenes: [scene({ caption: 'ugly flaws you hate' })],
    });
    expect(() => assertVideoPlanHardGate(plan)).toThrow(ComplianceHardGateError);
  });
});
