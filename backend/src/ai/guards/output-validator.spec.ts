import { OutputValidator } from './output-validator';
import type { ConsentRecord } from '../types/job-payload.types';

const consent = { id: 'c1', clientId: 'cl1', tenantId: 't1', status: 'granted' } as ConsentRecord;

describe('OutputValidator — Phase 4 AHPRA gate', () => {
  const validator = new OutputValidator();

  it.each([
    'Come see the incredible transformation from your last visit!',
    'Book now before spots fill up for this life-changing treatment.',
  ])('hard-fails a medical-outcome/urgency term for medical practitioners: "%s"', async (caption) => {
    const result = await validator.validate(caption, consent, 'injectables_cosmetic', 't1', true);
    expect(result.passed).toBe(false);
    expect(result.requiresRegeneration).toBe(true);
    expect(result.hardFailures.some((f) => f.startsWith('AHPRA:'))).toBe(true);
  });

  it('does NOT apply the medical-only terms for a non-medical practitioner', async () => {
    const result = await validator.validate(
      'Come see the incredible transformation from your last visit!',
      consent, 'hair_colour', 't1', false,
    );
    expect(result.hardFailures.some((f) => f.startsWith('AHPRA:'))).toBe(false);
  });

  it('defaults isMedicalPractitioner to false when omitted (back-compat call sites)', async () => {
    const result = await validator.validate('Come see the incredible transformation!', consent, 'general', 't1');
    expect(result.hardFailures.some((f) => f.startsWith('AHPRA:'))).toBe(false);
  });

  it('still catches the pre-existing generic checks for a medical practitioner', async () => {
    const result = await validator.validate('This treats and cures everything, guaranteed.', consent, 'injectables_cosmetic', 't1', true);
    expect(result.passed).toBe(false);
    expect(result.hardFailures.length).toBeGreaterThan(0);
  });

  it('passes clean, compliant medical copy', async () => {
    const result = await validator.validate(
      'Our clinic offers a free consultation to discuss your goals with a qualified practitioner.',
      consent, 'injectables_cosmetic', 't1', true,
    );
    expect(result.passed).toBe(true);
    expect(result.hardFailures).toHaveLength(0);
  });
});
