import { CompositionEngine } from './composition-engine';
import { LayoutEngine } from './layout-engine';

/**
 * Golden geometry fixtures — same template recipe must keep stable
 * image pad/anchor + text maxWidth/anchor contracts (accuracy forever).
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
});
