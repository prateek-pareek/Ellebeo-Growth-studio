import { PrismaClient } from '@prisma/client';
import { mapBrandDnaProfileToLegacyRecord } from './brand-dna-v2.mapper';

// Phase 2 dual-read (BRAND_DNA_GUIDED_V2 — /brand_dna_implementation_plan.md §6):
// prefer the new BrandDnaProfile if the tenant has one, else fall back to the
// legacy BrandDNA row. Scoped to the generation-time read path only — the
// existing /brand-dna onboarding endpoints keep reading BrandDNA directly
// until the Phase 5 frontend (which understands the v2 shape) replaces them.
// Typed against PrismaClient (not PrismaService) so it works from both a
// NestJS-injected PrismaService and the plain PrismaClient the AI
// orchestrator holds.
export async function getEffectiveCurrentBrandDna(
  prisma: PrismaClient,
  tenantId: string,
  legacyInclude?: Record<string, boolean>,
) {
  const profile = await prisma.brandDnaProfile.findUnique({
    where: { unique_current_brand_dna_profile: { tenantId, isCurrent: true } },
  });

  if (profile) {
    return mapBrandDnaProfileToLegacyRecord(profile);
  }

  return prisma.brandDNA.findUnique({
    where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
    ...(legacyInclude ? { include: legacyInclude } : {}),
  });
}
