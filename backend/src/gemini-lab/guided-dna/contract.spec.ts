import {
  coerceGuidedDraft,
  emptyGuidedDraft,
  labComplianceBlocksClientPhotos,
  validateGuidedProfile,
} from './contract';

describe('guided DNA contract', () => {
  it('repairs off-vocab mood and essence', () => {
    const draft = coerceGuidedDraft({
      identity: { mood: 'NEON_CHAOS', essence: ['WARM', 'SPICY', 'PREMIUM', 'LOUD'] },
    });
    expect(draft.identity.mood).toBe('SOFT_GLAM');
    expect(draft.identity.essence).toEqual(['WARM', 'PREMIUM']);
    expect(draft.schemaVersion).toBe(2);
  });

  it('requires name, category and essence to complete', () => {
    const empty = emptyGuidedDraft();
    expect(validateGuidedProfile(empty).length).toBeGreaterThan(0);
    empty.identity.brandName = 'Elle';
    empty.offering.serviceCategory = 'hair';
    empty.identity.essence = ['WARM'];
    expect(validateGuidedProfile(empty)).toEqual([]);
  });

  it('compliance gate is explicit boolean only', () => {
    const draft = emptyGuidedDraft();
    expect(labComplianceBlocksClientPhotos(draft)).toBe(false);
    draft.config.medicalAestheticsCompliance = true;
    expect(labComplianceBlocksClientPhotos(draft)).toBe(true);
  });
});
