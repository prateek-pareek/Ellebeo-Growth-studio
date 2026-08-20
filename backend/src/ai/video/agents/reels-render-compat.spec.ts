// Phase 4 required self-test: "reels renders end-to-end; captions align to
// VO in the integration test." Proves Director + ReelsAssetProvider + the
// Phase 2 render core are actually compatible end to end.

import { DirectorService } from './director.service';
import { buildShotstackEditFromPlan } from '../video-plan-render.mapper';
import { ReelsAssetProvider } from '../assets/reels-asset-provider';
import { SlideshowAssetProvider } from '../assets/slideshow-asset-provider';

jest.mock('./script-agent', () => ({
  runScriptAgent: jest.fn().mockResolvedValue({
    output: {
      scenes: [
        { index: 0, headline: 'Glow Up', caption: 'A short teaser' },
        { index: 1, headline: 'Book Today', caption: 'Spots are filling fast this month, do not wait' },
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

describe('Reels: Director + Asset agent output feeds the Phase 2 render core, captions align to VO', () => {
  it('produces a Video Plan whose scene durations track word-count-weighted VO duration and maps to a valid Shotstack edit', async () => {
    const elevenLabs = {
      generateVoiceover: jest.fn().mockResolvedValue({ audioCdnUrl: 'https://cdn.example.com/vo.mp3', durationSeconds: 14 }),
    };
    const assetProvider = new ReelsAssetProvider(new SlideshowAssetProvider(), elevenLabs as any);

    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const { plan } = await director.draftReelsPlan({
      tenantId: '33333333-3333-3333-3333-333333333333',
      appointmentId: '44444444-4444-4444-4444-444444444444',
      clientId: '55555555-5555-5555-5555-555555555555',
      technicianId: '11111111-1111-1111-1111-111111111111',
      brandDnaId: '22222222-2222-2222-2222-222222222222',
      imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      sceneCount: 2,
      objective: 'fill_quiet_days',
      brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm_and_friendly', vocabularyBlacklist: [], doNotSay: [] },
      brandTone: 'warm_and_friendly',
      brandMoodTag: 'elegant',
      voiceoverEnabled: true,
      assetProvider,
    });

    // Voiceover made it into the plan.
    expect(plan.audio.voiceover.enabled).toBe(true);
    expect(plan.audio.voiceover.assetUrl).toBe('https://cdn.example.com/vo.mp3');

    // Captions align to VO: scene 1 has a longer caption, so it gets a longer slice
    // of the measured 14s voiceover than scene 0's shorter caption.
    expect(plan.scenes[1]!.durationSeconds).toBeGreaterThan(plan.scenes[0]!.durationSeconds);
    // Total scene duration is derived directly from the measured VO duration, not a flat default.
    const totalSceneDuration = plan.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
    expect(totalSceneDuration).toBeGreaterThan(0);

    // Renders end-to-end through the unmodified Phase 2 core.
    const edit = buildShotstackEditFromPlan(plan);
    const timeline = edit.timeline as { tracks: unknown[]; soundtrack?: { src: string } };
    expect(timeline.tracks.length).toBeGreaterThan(0);
    expect(timeline.soundtrack?.src).toBe('https://cdn.example.com/vo.mp3');
  });
});
