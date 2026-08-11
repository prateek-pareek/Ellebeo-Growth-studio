import { isMedicalAestheticsBrand, isBeforeAfterAllowed } from './medical-compliance';

describe('isMedicalAestheticsBrand', () => {
  it('is false for a brand with neither signal set', () => {
    expect(isMedicalAestheticsBrand({ brandDnaV2: null, serviceCategories: ['hair_colour'] })).toBe(false);
  });

  it('is true when the Brand DNA compliance flag is explicitly set (object form)', () => {
    expect(
      isMedicalAestheticsBrand({
        brandDnaV2: { compliance: { medical_aesthetics_practitioner: true } },
        serviceCategories: [],
      }),
    ).toBe(true);
  });

  it('is true when brandDnaV2 arrives as a JSON string (as Prisma sometimes stores it)', () => {
    expect(
      isMedicalAestheticsBrand({
        brandDnaV2: JSON.stringify({ compliance: { medical_aesthetics_practitioner: true } }),
        serviceCategories: [],
      }),
    ).toBe(true);
  });

  it.each(['injectables_cosmetic', 'laser_treatments', 'medical_aesthetics'])(
    'is true when serviceCategories includes %s, even without the DNA flag',
    (category) => {
      expect(isMedicalAestheticsBrand({ brandDnaV2: null, serviceCategories: [category] })).toBe(true);
    },
  );

  it('is false when serviceCategories contains only unrelated categories', () => {
    expect(isMedicalAestheticsBrand({ brandDnaV2: null, serviceCategories: ['hair_colour', 'nails'] })).toBe(false);
  });

  it('does not throw on malformed brandDnaV2 JSON — fails closed to false for that signal', () => {
    expect(
      isMedicalAestheticsBrand({ brandDnaV2: '{not valid json', serviceCategories: [] }),
    ).toBe(false);
  });

  it('is true when either signal alone would qualify (flag false, category true)', () => {
    expect(
      isMedicalAestheticsBrand({
        brandDnaV2: { compliance: { medical_aesthetics_practitioner: false } },
        serviceCategories: ['medical_aesthetics'],
      }),
    ).toBe(true);
  });

  it('handles missing serviceCategories entirely (undefined, not just empty array)', () => {
    expect(isMedicalAestheticsBrand({ brandDnaV2: null })).toBe(false);
  });
});

describe('isBeforeAfterAllowed — Phase 4 AHPRA gate (client-image inputs)', () => {
  it('is false for a medical practitioner even when the client explicitly consented to before/after', () => {
    expect(isBeforeAfterAllowed(true, true)).toBe(false);
  });

  it('is false for a medical practitioner when consent also forbids it', () => {
    expect(isBeforeAfterAllowed(true, false)).toBe(false);
  });

  it('is true for a non-medical practitioner when consent allows it', () => {
    expect(isBeforeAfterAllowed(false, true)).toBe(true);
  });

  it('is false for a non-medical practitioner when consent forbids it', () => {
    expect(isBeforeAfterAllowed(false, false)).toBe(false);
  });
});
