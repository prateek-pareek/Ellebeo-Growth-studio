import { CompositionEngine } from './composition-engine';
import { LayoutEngine } from './layout-engine';
import { CompositionOptimizer } from './composition-optimizer';

/**
 * Golden geometry fixtures — template photo treatment (mask/pad) stays stable.
 * Type placement may move for a clean slide; it is not a same-to-same lock.
 */
describe('Recipe golden geometry fixtures', () => {
  const engine = new CompositionEngine();

  const build = (layoutId: string) => engine.buildRecipe(layoutId, 0, 'Ellebeo');

  const expectImageContract = (
    layoutId: string,
    expected: { mask: string; paddingPercent: number; anchor: string },
  ) => {
    const recipe = build(layoutId);
    const image = (recipe.layers || []).find((l: any) => l.type === 'image') as any;
    expect(image).toBeTruthy();
    expect(image.mask).toBe(expected.mask);
    expect(Number(image.paddingPercent) || 0).toBe(expected.paddingPercent);
    expect(String(image.anchor)).toBe(expected.anchor);
  };

  const expectHeadingContract = (
    layoutId: string,
    expected: { anchor: string; maxWidthPercent: number },
  ) => {
    const recipe = build(layoutId);
    const heading = (recipe.layers || []).find(
      (l: any) => l.type === 'text' && l.role === 'heading',
    ) as any;
    expect(heading).toBeTruthy();
    expect(String(heading.anchor)).toBe(expected.anchor);
    expect(Number(heading.maxWidthPercent)).toBe(expected.maxWidthPercent);
  };

  it('before_after_side_by_side keeps full-frame stitch + bottom heading', () => {
    expectImageContract('before_after_side_by_side', {
      mask: 'before_after_split',
      paddingPercent: 0,
      anchor: 'center',
    });
    expectHeadingContract('before_after_side_by_side', {
      anchor: 'bottom_center',
      maxWidthPercent: 80,
    });
  });

  it('before_after_labeled keeps inset stitch + dual text bands', () => {
    expectImageContract('before_after_labeled', {
      mask: 'before_after_split',
      paddingPercent: 5,
      anchor: 'center',
    });
    expectHeadingContract('before_after_labeled', {
      anchor: 'top_center',
      maxWidthPercent: 70,
    });
  });

  it('editorial_full_bleed stays edge-to-edge', () => {
    expectImageContract('editorial_full_bleed', {
      mask: 'full_bleed',
      paddingPercent: 0,
      anchor: 'center',
    });
    expectHeadingContract('editorial_full_bleed', {
      anchor: 'center',
      maxWidthPercent: 85,
    });
  });

  it('smartFitWindow crops less than full cover on tall portraits', () => {
    const cover = LayoutEngine.smartFitWindow(1000, 1600, 1080, 1080, 50, 40, Number.POSITIVE_INFINITY);
    const gentle = LayoutEngine.smartFitWindow(1000, 1600, 1080, 1080, 50, 40, 1.18);
    expect(gentle.height).toBeGreaterThan(cover.height);
    expect(gentle.scale).toBeLessThan(cover.scale);
  });

  it('coverCropWindow keeps face focus inside the crop', () => {
    const crop = LayoutEngine.coverCropWindow(1000, 1500, 1080, 1080, 50, 35);
    expect(crop.width).toBeGreaterThan(0);
    expect(crop.height).toBeGreaterThan(0);
    expect(crop.left).toBeGreaterThanOrEqual(0);
    expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.width).toBeLessThanOrEqual(1000);
    expect(crop.top + crop.height).toBeLessThanOrEqual(1500);
    const focusY = 1500 * 0.35;
    expect(focusY).toBeGreaterThanOrEqual(crop.top);
    expect(focusY).toBeLessThanOrEqual(crop.top + crop.height);
  });

  it('mapSourcePercentThroughCover is deterministic for same focus', () => {
    const a = LayoutEngine.mapSourcePercentThroughCover(50, 40, 1200, 1600, 1080, 1350, 50, 40);
    const b = LayoutEngine.mapSourcePercentThroughCover(50, 40, 1200, 1600, 1080, 1350, 50, 40);
    expect(a).toEqual(b);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
  });

  it('recipeImageSlot matches circle disk for testimonial_z_pattern', () => {
    const recipe = build('testimonial_z_pattern');
    const image = (recipe.layers || []).find((l: any) => l.type === 'image') as any;
    const slot = LayoutEngine.recipeImageSlot(1080, 1080, image);
    expect(slot.width).toBe(Math.floor(1080 * 0.6));
    expect(slot.height).toBe(slot.width);
    expect(slot.x).toBeLessThan(200);
    expect(slot.y).toBeLessThan(200);
  });

  it('mapSourcePercentIntoSlot stays inside the recipe photo box', () => {
    const slot = { x: 200, y: 80, width: 648, height: 648 };
    const mapped = LayoutEngine.mapSourcePercentIntoSlot(50, 40, 1200, 1600, slot, 50, 40);
    expect(mapped.x).toBeGreaterThanOrEqual(slot.x);
    expect(mapped.x).toBeLessThanOrEqual(slot.x + slot.width);
    expect(mapped.y).toBeGreaterThanOrEqual(slot.y);
    expect(mapped.y).toBeLessThanOrEqual(slot.y + slot.height);
  });

  it('optimizer may move testimonial_z_pattern type for a clean pocket', () => {
    const optimizer = new CompositionOptimizer();
    const canvas = 1080;
    const layoutEngine = new LayoutEngine(canvas, canvas);
    const constraints = layoutEngine.calculateConstraints('minimal', 'balanced', false);
    const recipe = build('testimonial_z_pattern');
    const result = optimizer.optimizeWithMeta(
      recipe as any,
      constraints,
      canvas,
      canvas,
      undefined,
      'image_hero',
      undefined,
      { heroSize: 48, primarySize: 24, bodySize: 18, metadataSize: 14 },
      undefined,
      'z_pattern',
      { headline: 'Best facial I have ever had', subheadline: 'Priya S.', cta: '' },
    );
    const heading = (result.dsl.layers || []).find(
      (l: any) => l.type === 'text' && l.role === 'heading',
    ) as any;
    const box = heading.allocatedBox;
    expect(box).toBeTruthy();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(40);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas);
  });

  it('optimizer keeps a heading off a central face', () => {
    const optimizer = new CompositionOptimizer();
    const canvas = 1080;
    const layoutEngine = new LayoutEngine(canvas, canvas);
    const constraints = layoutEngine.calculateConstraints('minimal', 'balanced', false);
    const recipe = build('editorial_full_bleed');
    const face = { x: 250, y: 80, width: 580, height: 640 };
    const result = optimizer.optimizeWithMeta(
      recipe as any,
      constraints,
      canvas,
      canvas,
      face,
      'image_hero',
      undefined,
      { heroSize: 56, primarySize: 24, bodySize: 18, metadataSize: 14 },
      LayoutEngine.expandFaceToSubject(face, canvas, canvas),
      'center_down',
      { headline: 'Glow that lasts', subheadline: 'Book your next facial', cta: 'Book now' },
    );
    const heading = (result.dsl.layers || []).find(
      (l: any) => l.type === 'text' && l.role === 'heading',
    ) as any;
    const box = heading.allocatedBox;
    expect(box).toBeTruthy();
    const subject = LayoutEngine.expandFaceToSubject(face, canvas, canvas);
    const overlaps =
      box.x < subject.x + subject.width
      && box.x + box.width > subject.x
      && box.y < subject.y + subject.height
      && box.y + box.height > subject.y;
    expect(overlaps).toBe(false);
  });

  it('optimizer does not swap editorial_full_bleed for a centered recipe headline', () => {
    const optimizer = new CompositionOptimizer();
    const canvas = 1080;
    const layoutEngine = new LayoutEngine(canvas, canvas);
    const constraints = layoutEngine.calculateConstraints('minimal', 'balanced', false);
    const recipe = build('editorial_full_bleed');
    const result = optimizer.optimizeWithMeta(
      recipe as any,
      constraints,
      canvas,
      canvas,
      undefined,
      'image_hero',
      undefined,
      { heroSize: 64, primarySize: 28, bodySize: 22, metadataSize: 14 },
      undefined,
      'center_down',
      { headline: 'Glow that lasts', subheadline: 'Book your next facial', cta: 'Book now' },
    );
    const heading = (result.dsl.layers || []).find(
      (l: any) => l.type === 'text' && l.role === 'heading',
    ) as any;
    expect(String(heading._templateAnchor || heading.anchor)).toBe('center');
    expect(result.suggestLayoutChange).toBe(false);
    const meta = (result.dsl as any)._compositionMeta || {};
    expect(meta.needsSpatialEscalation).toBeFalsy();
    expect(meta.qualityIssues || []).not.toContain('reading_flow_band');
  });
});
