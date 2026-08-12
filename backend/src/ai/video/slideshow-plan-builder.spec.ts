import { buildSlideshowPlan, SlideshowPlanBuilderError } from './slideshow-plan-builder';
import { safeParseVideoPlan } from './video-plan.schema';

const baseParams = {
  technicianId: '11111111-1111-1111-1111-111111111111',
  brandDnaRef: '22222222-2222-2222-2222-222222222222',
  objective: 'fill_quiet_days' as const,
};

describe('buildSlideshowPlan', () => {
  it('produces a plan that independently validates against the schema', () => {
    const plan = buildSlideshowPlan({
      ...baseParams,
      imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg', 'https://cdn.example.com/3.jpg'],
    });
    expect(safeParseVideoPlan(plan).success).toBe(true);
    expect(plan.videoType).toBe('slideshow');
    expect(plan.scenes).toHaveLength(3);
  });

  it('spreads the total duration evenly across scenes', () => {
    const plan = buildSlideshowPlan({
      ...baseParams,
      imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      totalDurationSeconds: 10,
    });
    expect(plan.scenes[0]!.durationSeconds).toBe(5);
    expect(plan.scenes[1]!.durationSeconds).toBe(5);
  });

  it('clamps per-scene duration to the schema-allowed range', () => {
    const plan = buildSlideshowPlan({
      ...baseParams,
      imageUrls: Array.from({ length: 10 }, (_, i) => `https://cdn.example.com/${i}.jpg`),
      totalDurationSeconds: 20,
    });
    for (const scene of plan.scenes) {
      expect(scene.durationSeconds).toBeGreaterThanOrEqual(2);
    }
  });

  it('carries the medicalAesthetics compliance flag through', () => {
    const plan = buildSlideshowPlan({
      ...baseParams,
      imageUrls: ['https://cdn.example.com/1.jpg'],
      medicalAesthetics: true,
    });
    expect(plan.compliance.medicalAesthetics).toBe(true);
  });

  it('throws when given zero images', () => {
    expect(() => buildSlideshowPlan({ ...baseParams, imageUrls: [] })).toThrow(SlideshowPlanBuilderError);
  });
});
