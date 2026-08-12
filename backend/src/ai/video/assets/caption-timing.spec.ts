import { computeCaptionTimings } from './caption-timing';

describe('computeCaptionTimings', () => {
  it('gives a scene with more words a proportionally longer duration', () => {
    const durations = computeCaptionTimings(
      [
        { index: 0, headline: 'Short', caption: null },
        { index: 1, headline: 'A much longer headline with many more words', caption: 'and a caption too' },
      ],
      15,
    );
    expect(durations[1]!).toBeGreaterThan(durations[0]!);
  });

  it('splits evenly across scenes with identical word counts', () => {
    const durations = computeCaptionTimings(
      [
        { index: 0, headline: 'Two words', caption: null },
        { index: 1, headline: 'Two words', caption: null },
      ],
      10,
    );
    expect(durations[0]).toBe(durations[1]);
  });

  it('never assigns a duration below the schema minimum', () => {
    const durations = computeCaptionTimings(
      [
        { index: 0, headline: 'One massive scene with an enormous amount of spoken words here', caption: 'and more and more and more words' },
        { index: 1, headline: 'a', caption: null },
      ],
      20,
    );
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns an empty array for zero scenes', () => {
    expect(computeCaptionTimings([], 10)).toEqual([]);
  });

  it('gives untexted scenes an equal minimal share rather than zero', () => {
    const durations = computeCaptionTimings(
      [
        { index: 0, headline: null, caption: null },
        { index: 1, headline: null, caption: null },
      ],
      10,
    );
    expect(durations[0]).toBe(durations[1]);
    expect(durations[0]!).toBeGreaterThan(0);
  });
});
