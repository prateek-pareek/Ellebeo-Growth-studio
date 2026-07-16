// ============================================================================
// medical-compliance.ts
// Single source of truth for "is this technician's Brand DNA a medical
// aesthetics practitioner" — used to force compliance behaviour (no client
// photos/faces in generated content) independent of client consent.
// ============================================================================

export function isMedicalAestheticsBrand(brandDNA: {
  brandDnaV2?: unknown;
  serviceCategories?: string[] | null;
}): boolean {
  const isByDnaFlag = (() => {
    try {
      const v2 = brandDNA.brandDnaV2
        ? (typeof brandDNA.brandDnaV2 === 'string' ? JSON.parse(brandDNA.brandDnaV2) : brandDNA.brandDnaV2)
        : null;
      return (v2 as any)?.compliance?.medical_aesthetics_practitioner === true;
    } catch {
      return false;
    }
  })();

  const isByServiceCategories = Array.isArray(brandDNA.serviceCategories) &&
    brandDNA.serviceCategories.some(
      (c) => c === 'injectables_cosmetic' || c === 'laser_treatments' || c === 'medical_aesthetics',
    );

  return isByDnaFlag || isByServiceCategories;
}
