import { parseVideoPlan } from '../contract';
import { VIDEO_PLAN_FIXTURE_BRAND_DNA_ID, VIDEO_PLAN_FIXTURE_TECHNICIAN_ID } from '../contract/fixture';
import { buildSlideshowPlan, SlideshowPlanBuilderError } from './slideshow-plan-builder';

const branding = { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' };

describe('buildSlideshowPlan', () => {
  it('builds a schema-valid slideshow from image URLs with no LLM', () => {
    const plan = parseVideoPlan(buildSlideshowPlan({
      technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
      brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
      objective: 'FILL_QUIET_DAYS',
      images: [
        { url: 'https://cdn.example.com/a.jpg', headline: 'Hook' },
        { url: 'https://cdn.example.com/b.jpg', headline: 'Proof' },
      ],
      branding,
      medicalAesthetics: false,
      createdAt: '2026-08-13T00:00:00.000Z',
    }));

    expect(plan.videoType).toBe('SLIDESHOW');
    expect(plan.meta.source).toBe('rule_based_v1');
    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0]!.motion).toBe('KEN_BURNS');
    expect(plan.scenes[0]!.transitionOut).toBe('FADE');
    expect(plan.scenes[1]!.transitionOut).toBe('CUT');
    expect(plan.audio.voiceover.enabled).toBe(false);
    expect(plan.durationSeconds).toBe(20);
  });

  it('rejects an empty image list', () => {
    expect(() => buildSlideshowPlan({
      technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
      brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
      objective: 'EDUCATE_TRUST',
      images: [],
      branding,
      medicalAesthetics: false,
    })).toThrow(SlideshowPlanBuilderError);
  });
});
