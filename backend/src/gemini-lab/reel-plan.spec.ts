import { buildSlideshowPlan } from '../ai/video/slideshow-plan-builder';
import { parseVideoPlan } from '../ai/video/video-plan.schema';

/**
 * The first connection between the Lab and the video pipeline. Roughly half of
 * what a beauty account posts is video and the Lab produced none — while kept
 * posts already carried a hosted image URL and the plan builder already turned
 * image URLs into a plan. These guard the seam between them.
 */
const imageUrls = [
  'https://res.cloudinary.com/demo/image/upload/a.png',
  'https://res.cloudinary.com/demo/image/upload/b.png',
  'https://res.cloudinary.com/demo/image/upload/c.png',
];

function plan(over: Partial<Parameters<typeof buildSlideshowPlan>[0]> = {}) {
  return buildSlideshowPlan({
    technicianId: '11111111-1111-1111-1111-111111111111',
    brandDnaRef: '22222222-2222-2222-2222-222222222222',
    imageUrls,
    objective: 'premium_clients',
    headlines: ['Colour menu', 'Aftercare', 'Book now'],
    captions: ['Prices for autumn', null, 'Chairs open Thursday'],
    brandFont: 'Cormorant Garamond',
    brandPalette: ['#F6EEE4', '#E8D5C4', '#5C4033', '#C9A227'],
    ...over,
  });
}

describe('reel from kept posts', () => {
  it('produces a plan the video pipeline accepts', () => {
    // parseVideoPlan is the pipeline's own gate — if this passes, the plan is
    // renderable by the existing worker rather than merely well-shaped here.
    expect(() => parseVideoPlan(plan())).not.toThrow();
  });

  it('keeps one scene per post', () => {
    expect(plan().scenes).toHaveLength(3);
  });

  it('carries the studio brand into the reel', () => {
    const p: any = plan();
    const serialised = JSON.stringify(p);
    expect(serialised).toContain('#5C4033');
    expect(serialised).toContain('Cormorant Garamond');
  });

  it('gives the reel a real duration', () => {
    expect(plan().durationSeconds).toBeGreaterThan(0);
  });

  it('refuses to build a reel from nothing', () => {
    expect(() => plan({ imageUrls: [] })).toThrow(/at least one image/i);
  });

  it('works from a single post', () => {
    expect(plan({ imageUrls: [imageUrls[0]], headlines: ['One'], captions: [null] }).scenes).toHaveLength(1);
  });
});
