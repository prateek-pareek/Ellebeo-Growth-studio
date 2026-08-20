import { filterSceneCopyForCompliance } from './copy-compliance-gate';

describe('filterSceneCopyForCompliance', () => {
  it('strips a headline containing medical-claim language and records the violation', async () => {
    const result = await filterSceneCopyForCompliance([
      { index: 0, headline: 'This treats acne permanently', caption: null },
    ]);

    expect(result.sceneCopy[0]!.headline).toBeNull();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.index).toBe(0);
    expect(result.violations[0]!.field).toBe('headline');
  });

  it('strips guaranteed-results language from a caption', async () => {
    const result = await filterSceneCopyForCompliance([
      { index: 0, headline: 'Glow Up', caption: 'Guaranteed results in one session' },
    ]);

    expect(result.sceneCopy[0]!.caption).toBeNull();
    expect(result.sceneCopy[0]!.headline).toBe('Glow Up');
    expect(result.violations).toHaveLength(1);
  });

  it('leaves clean copy untouched with zero violations', async () => {
    const result = await filterSceneCopyForCompliance([
      { index: 0, headline: 'Book Today', caption: 'Spots are filling fast' },
    ]);

    expect(result.sceneCopy[0]!.headline).toBe('Book Today');
    expect(result.sceneCopy[0]!.caption).toBe('Spots are filling fast');
    expect(result.violations).toHaveLength(0);
  });

  it('passes through null headline/caption without calling the validator', async () => {
    const result = await filterSceneCopyForCompliance([{ index: 0, headline: null, caption: null }]);
    expect(result.sceneCopy[0]).toEqual({ index: 0, headline: null, caption: null });
    expect(result.violations).toHaveLength(0);
  });
});
