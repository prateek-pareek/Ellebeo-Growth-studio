// Phase 3 required self-test: "Director+Script produce a valid slideshow plan
// the Phase-2 core renders." Proves the two phases are actually compatible,
// not just independently tested.

import { DirectorService } from './director.service';
import { buildShotstackEditFromPlan } from '../video-plan-render.mapper';

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

describe('Director output feeds the Phase 2 render core', () => {
  it('a Director-drafted plan maps to a valid Shotstack edit with no agent/render code changes', async () => {
    const prisma = makeMockPrisma();
    const director = new DirectorService(prisma as any);

    const { plan } = await director.draftSlideshowPlan({
      tenantId: '33333333-3333-3333-3333-333333333333',
      appointmentId: '44444444-4444-4444-4444-444444444444',
      clientId: '55555555-5555-5555-5555-555555555555',
      technicianId: '11111111-1111-1111-1111-111111111111',
      brandDnaId: '22222222-2222-2222-2222-222222222222',
      imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      objective: 'fill_quiet_days',
      brandVoice: { businessName: 'Glow Studio', primaryTone: 'warm', vocabularyBlacklist: [], doNotSay: [] },
    });

    const edit = buildShotstackEditFromPlan(plan);
    const timeline = edit.timeline as { tracks: Array<{ clips: unknown[] }> };
    expect(timeline.tracks.length).toBeGreaterThan(0);
    expect((edit.output as any).aspectRatio).toBe('9:16');
  });
});
