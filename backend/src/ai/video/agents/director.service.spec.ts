import { DirectorService, DirectorError } from './director.service';
import { safeParseVideoPlan } from '../video-plan.schema';

jest.mock('./script-agent', () => ({
  runScriptAgent: jest.fn(),
}));
jest.mock('./critic-agent', () => ({
  runCriticAgent: jest.fn(),
}));

import { runScriptAgent } from './script-agent';
import { runCriticAgent } from './critic-agent';

const PASSING_CRITIQUE = { score: 0.9, passed: true, weakSceneIndices: [], notes: ['On-brand, strong hook.'], tokensUsed: 50 };

const baseParams = {
  tenantId: '33333333-3333-3333-3333-333333333333',
  appointmentId: '44444444-4444-4444-4444-444444444444',
  clientId: '55555555-5555-5555-5555-555555555555',
  technicianId: '11111111-1111-1111-1111-111111111111',
  brandDnaId: '22222222-2222-2222-2222-222222222222',
  imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
  objective: 'fill_quiet_days' as const,
  brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm', vocabularyBlacklist: [], doNotSay: [] },
};

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

describe('DirectorService.draftSlideshowPlan', () => {
  beforeEach(() => {
    (runScriptAgent as jest.Mock).mockReset();
    (runCriticAgent as jest.Mock).mockReset().mockResolvedValue(PASSING_CRITIQUE);
  });

  it('persists a draft row, then a valid in_review plan with the Script agent copy merged in', async () => {
    (runScriptAgent as jest.Mock).mockResolvedValue({
      output: {
        scenes: [
          { index: 0, headline: 'Glow Up', caption: null },
          { index: 1, headline: 'Book Today', caption: 'Spots filling fast' },
        ],
      },
      toolCallCount: 0,
      tokensUsed: 100,
      repaired: false,
    });

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const result = await director.draftSlideshowPlan(baseParams);

    expect(prisma.videoPlan.create).toHaveBeenCalledTimes(1);
    expect(prisma.videoPlan.create.mock.calls[0][0].data.status).toBe('draft');
    expect(prisma.videoPlan.update).toHaveBeenCalledTimes(1);
    expect(prisma.videoPlan.update.mock.calls[0][0].data.status).toBe('in_review');

    expect(safeParseVideoPlan(result.plan).success).toBe(true);
    expect(result.plan.scenes[0]!.text.headline).toBe('Glow Up');
    expect(result.plan.scenes[1]!.text.caption).toBe('Spots filling fast');
  });

  it('marks the plan failed and rethrows if the Script agent throws', async () => {
    (runScriptAgent as jest.Mock).mockRejectedValue(new Error('LLM unavailable'));
    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    await expect(director.draftSlideshowPlan(baseParams)).rejects.toThrow('LLM unavailable');
    expect(prisma.videoPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { status: 'failed', errorMessage: 'LLM unavailable' },
    });
  });

  it('throws DirectorError before touching the database when given zero images', async () => {
    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    await expect(director.draftSlideshowPlan({ ...baseParams, imageUrls: [] })).rejects.toThrow(DirectorError);
    expect(prisma.videoPlan.create).not.toHaveBeenCalled();
  });
});

describe('DirectorService.draftReelsPlan', () => {
  beforeEach(() => {
    (runScriptAgent as jest.Mock).mockReset();
    (runCriticAgent as jest.Mock).mockReset().mockResolvedValue(PASSING_CRITIQUE);
  });

  const reelsParams = {
    ...baseParams,
    sceneCount: 2,
    brandTone: 'warm_and_friendly',
    brandMoodTag: 'elegant',
    voiceoverEnabled: true,
  };

  it('persists a draft row, resolves assets via the given AssetProvider, and finalizes to in_review', async () => {
    (runScriptAgent as jest.Mock).mockResolvedValue({
      output: {
        scenes: [
          { index: 0, headline: 'Glow Up', caption: null },
          { index: 1, headline: 'Book Today', caption: 'Spots filling fast' },
        ],
      },
      toolCallCount: 0,
      tokensUsed: 100,
      repaired: false,
    });

    const assetProvider = {
      resolveSceneAssets: jest.fn().mockResolvedValue({
        scenes: [
          { index: 0, kind: 'image', url: 'https://cdn.example.com/1.jpg', durationSeconds: 4 },
          { index: 1, kind: 'image', url: 'https://cdn.example.com/2.jpg', durationSeconds: 6 },
        ],
        voiceover: { script: 'Glow Up. Spots filling fast.', voiceId: 'voice-1', assetUrl: 'https://cdn.example.com/vo.mp3', durationSeconds: 10 },
      }),
    };

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const result = await director.draftReelsPlan({ ...reelsParams, assetProvider: assetProvider as any });

    expect(prisma.videoPlan.create.mock.calls[0][0].data.status).toBe('draft');
    expect(prisma.videoPlan.create.mock.calls[0][0].data.videoType).toBe('reels');
    expect(assetProvider.resolveSceneAssets).toHaveBeenCalledTimes(1);
    expect(prisma.videoPlan.update.mock.calls[0][0].data.status).toBe('in_review');

    expect(safeParseVideoPlan(result.plan).success).toBe(true);
    expect(result.plan.videoType).toBe('reels');
    expect(result.plan.audio.voiceover.enabled).toBe(true);
    expect(result.plan.captions.burnedIn).toBe(true);
  });

  it('marks the plan failed and rethrows if asset resolution throws', async () => {
    (runScriptAgent as jest.Mock).mockResolvedValue({
      output: { scenes: [{ index: 0, headline: 'A', caption: null }, { index: 1, headline: 'B', caption: null }] },
      toolCallCount: 0,
      tokensUsed: 50,
      repaired: false,
    });
    const assetProvider = { resolveSceneAssets: jest.fn().mockRejectedValue(new Error('stock search failed')) };
    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    await expect(director.draftReelsPlan({ ...reelsParams, assetProvider: assetProvider as any })).rejects.toThrow('stock search failed');
    expect(prisma.videoPlan.update).toHaveBeenLastCalledWith({
      where: { id: 'plan-1' },
      data: { status: 'failed', errorMessage: 'stock search failed' },
    });
  });

  it('throws DirectorError before touching the database when sceneCount is zero', async () => {
    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    await expect(director.draftReelsPlan({ ...reelsParams, sceneCount: 0 })).rejects.toThrow(DirectorError);
    expect(prisma.videoPlan.create).not.toHaveBeenCalled();
  });
});

// Phase 5 required self-test: "a deliberately weak seeded draft triggers a
// revision and comes back with a higher score; the loop never exceeds N."
describe('DirectorService — critic revision loop', () => {
  beforeEach(() => {
    (runScriptAgent as jest.Mock).mockReset();
    (runCriticAgent as jest.Mock).mockReset();
  });

  it('a weak seeded draft triggers exactly one targeted revision and comes back with a higher score', async () => {
    (runScriptAgent as jest.Mock)
      .mockResolvedValueOnce({
        output: { scenes: [{ index: 0, headline: 'Generic Sale', caption: null }, { index: 1, headline: 'Book Today', caption: null }] },
        toolCallCount: 0, tokensUsed: 50, repaired: false,
      })
      .mockResolvedValueOnce({
        // Targeted revision — only scene 0 comes back.
        output: { scenes: [{ index: 0, headline: 'Your Glow Starts Here', caption: null }] },
        toolCallCount: 0, tokensUsed: 40, repaired: false,
      });

    (runCriticAgent as jest.Mock)
      .mockResolvedValueOnce({ score: 0.4, passed: false, weakSceneIndices: [0], notes: ['Scene 0 hook is generic'], tokensUsed: 50 })
      .mockResolvedValueOnce({ score: 0.85, passed: true, weakSceneIndices: [], notes: ['Much stronger now'], tokensUsed: 50 });

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const result = await director.draftSlideshowPlan(baseParams);

    expect(runScriptAgent).toHaveBeenCalledTimes(2);
    expect(runCriticAgent).toHaveBeenCalledTimes(2);
    expect(result.plan.critic.revisions).toBe(1);
    expect(result.plan.critic.passed).toBe(true);
    expect(result.plan.critic.score).toBe(0.85);
    // The revised scene's copy made it into the final plan.
    expect(result.plan.scenes[0]!.text.headline).toBe('Your Glow Starts Here');
    // The untouched scene's copy from the original draft is preserved.
    expect(result.plan.scenes[1]!.text.headline).toBe('Book Today');
  });

  it('never exceeds MAX_CRITIC_REVISIONS even if the critic never passes the draft', async () => {
    (runScriptAgent as jest.Mock).mockResolvedValue({
      output: { scenes: [{ index: 0, headline: 'Meh', caption: null }] },
      toolCallCount: 0, tokensUsed: 50, repaired: false,
    });
    (runCriticAgent as jest.Mock).mockResolvedValue({
      score: 0.2, passed: false, weakSceneIndices: [0], notes: ['Still weak'], tokensUsed: 50,
    });

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const result = await director.draftSlideshowPlan({ ...baseParams, imageUrls: ['https://cdn.example.com/1.jpg'] });

    // 1 initial script call + 2 revision calls (MAX_CRITIC_REVISIONS = 2)
    expect(runScriptAgent).toHaveBeenCalledTimes(3);
    // 1 initial critique + 2 re-critiques after each revision
    expect(runCriticAgent).toHaveBeenCalledTimes(3);
    expect(result.plan.critic.revisions).toBe(2);
    expect(result.plan.critic.passed).toBe(false);
  });
});
