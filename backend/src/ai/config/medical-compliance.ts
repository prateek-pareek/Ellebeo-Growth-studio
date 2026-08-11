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
  const dnaFlagState = (() => {
    try {
      const v2 = brandDNA.brandDnaV2
        ? (typeof brandDNA.brandDnaV2 === 'string' ? JSON.parse(brandDNA.brandDnaV2) : brandDNA.brandDnaV2)
        : null;
      return (v2 as any)?.compliance?.medical_aesthetics_practitioner;
    } catch {
      return undefined;
    }
  })();

  // Explicit user toggle in Brand DNA settings takes ultimate priority
  if (dnaFlagState === false) return false;
  if (dnaFlagState === true) return true;

  const isByServiceCategories = Array.isArray(brandDNA.serviceCategories) &&
    brandDNA.serviceCategories.some(
      (c) => c === 'injectables_cosmetic' || c === 'laser_treatments' || c === 'medical_aesthetics',
    );

  return isByServiceCategories;
}

// Phase 4 (BRAND_DNA_GUIDED_V2 — /brand_dna_implementation_plan.md §7):
// medical-aesthetics accounts never get before/after treated as allowed,
// regardless of client consent — consent covers usage rights (can this
// client's photo be used at all), not clinical-claims compliance (can a
// before/after transformation be shown at all). The two must not be
// conflated: a client consenting to "use my photo" does not consent to
// having an AHPRA-regulated outcome claim built from it.
export function isBeforeAfterAllowed(isMedicalPractitioner: boolean, consentAllowsBeforeAfter: boolean): boolean {
  return !isMedicalPractitioner && consentAllowsBeforeAfter;
}
