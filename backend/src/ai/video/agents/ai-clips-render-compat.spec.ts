// Phase 7 required self-test: "AI-clips renders; provider swappable via
// interface; cost ceiling enforced (test)."

import { DirectorService } from './director.service';
import { buildShotstackEditFromPlan } from '../video-plan-render.mapper';
import { AiClipsAssetProvider, AiClipsCostCeilingError } from '../assets/ai-clips-asset-provider';
import type { VideoClipProvider, GenerateClipParams, GeneratedClip } from '../clips/video-clip-provider';

jest.mock('./script-agent', () => ({
  runScriptAgent: jest.fn().mockResolvedValue({
    output: {
      scenes: [
        { index: 0, headline: 'Glow Up', caption: null },
        { index: 1, headline: 'Book Today', caption: 'Spots filling fast' },
      ],
    },
    toolCallCount: 0,
    tokensUsed: 100,
    repaired: false,
  }),
}));
jest.mock('./critic-agent', () => ({
  runCriticAgent: jest.fn().mockResolvedValue({
    score: 0.9, passed: true, weakSceneIndices: [], notes: ['Good.'], tokensUsed: 50,
  }),
}));

function makeMockPrisma() {
  let created: any = null;
  return {
    videoPlan: {
      create: jest.fn().mockImplementation((args: any) => {
        created = { id: 'plan-1', ...args.data };
        return Promise.resolve(created);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        created = { ...created, ...args.data };
        return Promise.resolve(created);
      }),
    },
  };
}

function makeFakeClipProvider(costUsdPerScene: number): VideoClipProvider {
  return {
    generateClip: jest.fn(async (params: GenerateClipParams): Promise<GeneratedClip> => ({
      url: `https://runway.example.com/${params.prompt.length}.mp4`,
      durationSeconds: params.durationSeconds,
      costUsd: costUsdPerScene,
    })),
  };
}

const baseParams = {
  tenantId: '33333333-3333-3333-3333-333333333333',
  appointmentId: '44444444-4444-4444-4444-444444444444',
  clientId: '55555555-5555-5555-5555-555555555555',
  technicianId: '11111111-1111-1111-1111-111111111111',
  brandDnaId: '22222222-2222-2222-2222-222222222222',
  sceneCount: 2,
  objective: 'fill_quiet_days' as const,
  brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm', vocabularyBlacklist: [], doNotSay: [] },
  brandMoodTag: 'elegant',
};

describe('ai_clips: Director + Runway-shaped provider feeds the Phase 2 render core', () => {
  it('renders end-to-end through the unmodified Phase 2 core', async () => {
    const fakeProvider = makeFakeClipProvider(0.25);
    const assetProvider = new AiClipsAssetProvider(fakeProvider, 5, 6);

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const { plan } = await director.draftAiClipsPlan({ ...baseParams, assetProvider });

    expect(plan.videoType).toBe('ai_clips');
    expect(plan.scenes.every((s) => s.asset.kind === 'generated_clip')).toBe(true);

    const edit = buildShotstackEditFromPlan(plan);
    const timeline = edit.timeline as { tracks: Array<{ clips: Array<{ asset: { type: string } }> }> };
    const sceneTrack = timeline.tracks.find((t) => t.clips.some((c) => c.asset.type === 'video'));
    expect(sceneTrack).toBeDefined();
  });

  it('the provider is swappable — a different VideoClipProvider implementation produces an equally valid plan', async () => {
    class AlternateFakeProvider implements VideoClipProvider {
      async generateClip(params: GenerateClipParams): Promise<GeneratedClip> {
        return { url: 'https://alt-provider.example.com/clip.mp4', durationSeconds: params.durationSeconds, costUsd: 0.1 };
      }
    }
    const assetProvider = new AiClipsAssetProvider(new AlternateFakeProvider(), 5, 6);

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const { plan } = await director.draftAiClipsPlan({ ...baseParams, assetProvider });
    expect(plan.scenes.every((s) => s.asset.url === 'https://alt-provider.example.com/clip.mp4')).toBe(true);
  });

  it('the per-video cost ceiling is enforced and fails the plan (not silently over-spent)', async () => {
    const expensiveProvider = makeFakeClipProvider(10); // way over any reasonable ceiling
    const assetProvider = new AiClipsAssetProvider(expensiveProvider, 5, 6);

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    await expect(director.draftAiClipsPlan({ ...baseParams, assetProvider })).rejects.toThrow(AiClipsCostCeilingError);
    expect(prisma.videoPlan.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});
