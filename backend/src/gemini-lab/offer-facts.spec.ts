import { auditOfferContent, extractFigures, unsupportedFigures } from './offer-facts';

const OFFER = '20% off all lash refills, Tuesday to Thursday, ends 31 August. Classic refill $65, Volume refill $85.';

describe('extractFigures', () => {
  it('reads prices, percentages and dates as claims', () => {
    const figures = extractFigures(OFFER);
    expect(figures).toContain('20%');
    expect(figures).toContain('65');
    expect(figures).toContain('85');
    expect(figures).toContain('31');
    expect(figures).toContain('aug');
  });

  it('treats a currency symbol as decoration, not a different claim', () => {
    expect(unsupportedFigures('Classic refill $65', 'Classic refill 65')).toEqual([]);
  });

  it('matches an abbreviated month to its full name', () => {
    expect(unsupportedFigures('Ends 31 Aug', 'Ends 31 August')).toEqual([]);
    expect(unsupportedFigures('Ends 31 September', 'Ends 31 August')).toEqual(['sep']);
  });

  it('does not double-count a percentage as a bare number', () => {
    expect(unsupportedFigures('20% off', '20% off')).toEqual([]);
  });
});

describe('auditOfferContent', () => {
  const base = { format: 'offer' as const, offerDetails: OFFER };

  it('keeps rows whose prices the studio actually gave', () => {
    const result = auditOfferContent({
      ...base,
      content: { rows: [{ label: 'Classic refill', value: '$65' }, { label: 'Volume refill', value: '$85' }] },
      copy: ['20% off lash refills'],
    });
    expect(result.content?.rows).toHaveLength(2);
    expect(result.removed).toEqual([]);
    expect(result.copyIsUnsupported).toBe(false);
  });

  it('drops an invented price rather than publishing it', () => {
    // The exact failure this exists for: a plausible extra line nobody offered.
    const result = auditOfferContent({
      ...base,
      content: {
        rows: [
          { label: 'Classic refill', value: '$65' },
          { label: 'Lash lift', value: '$110' },
        ],
      },
      copy: [],
    });
    expect(result.content?.rows).toHaveLength(1);
    expect(result.content?.rows?.[0].label).toBe('Classic refill');
    expect(result.removed[0]).toMatch(/Lash lift/);
  });

  it('drops a badge claiming a discount that was never offered', () => {
    const result = auditOfferContent({ ...base, content: { badge: '50% OFF' }, copy: [] });
    expect(result.content?.badge).toBeUndefined();
    expect(result.removed[0]).toMatch(/50/);
  });

  it('keeps a badge that matches the studio figure', () => {
    const result = auditOfferContent({ ...base, content: { badge: '20% OFF' }, copy: [] });
    expect(result.content?.badge).toBe('20% OFF');
  });

  it('flags a headline that invents a figure, since deleting words would mangle it', () => {
    const result = auditOfferContent({ ...base, content: {}, copy: ['Half price lashes, $30 today'] });
    expect(result.copyIsUnsupported).toBe(true);
  });

  it('accepts copy that only repeats the studio figures', () => {
    const result = auditOfferContent({ ...base, content: {}, copy: ['20% off until 31 August'] });
    expect(result.copyIsUnsupported).toBe(false);
  });

  it('leaves non-commercial formats alone', () => {
    // "3 signs you need a refill" is not a price claim, and stripping numbers
    // from teaching copy would be pure damage.
    const result = auditOfferContent({
      format: 'tips',
      offerDetails: OFFER,
      content: { checklist: [{ text: '3 weeks between refills', positive: true }] },
      copy: ['3 signs you need a refill'],
    });
    expect(result.copyIsUnsupported).toBe(false);
    expect(result.content?.checklist).toHaveLength(1);
  });

  it('is inert when the studio supplied no figures to check against', () => {
    const result = auditOfferContent({
      format: 'offer',
      offerDetails: undefined,
      content: { rows: [{ label: 'Refill', value: '$65' }] },
      copy: [],
    });
    expect(result.content?.rows).toHaveLength(1);
    expect(result.removed).toEqual([]);
  });
});
