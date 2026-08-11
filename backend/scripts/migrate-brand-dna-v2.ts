// Phase 2 migration — BrandDNA (v1) -> BrandDnaProfile (v2, BRAND_DNA_GUIDED_V2).
// See /brand_dna_implementation_plan.md §6. Non-destructive: only ever reads
// BrandDNA and writes BrandDnaProfile; the old table/rows are never touched.
//
// Every mapped field is a best-effort heuristic classification of free text
// (no real AI classification call — that's Phase 3 scope), so every row this
// script creates is written with needsReview = true.
//
// Usage:
//   npx ts-node scripts/migrate-brand-dna-v2.ts             (dry-run, default)
//   npx ts-node scripts/migrate-brand-dna-v2.ts --write      (actually writes)
//
// Report (dry-run or write) is saved to scripts/output/brand-dna-v2-migration-report.json

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, BrandDNA, Tenant } from '@prisma/client';
import { isMedicalAestheticsBrand } from '../src/ai/config/medical-compliance';

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');
const REPORT_PATH = path.join(__dirname, 'output', 'brand-dna-v2-migration-report.json');

// §3 field-mapping table's "drops" — logged per tenant so nothing is lost silently.
const DROPPED_FIELD_KEYS: (keyof BrandDNA)[] = [
  'vocabularyBlacklist', 'doNotSay', 'visualRanking', 'clientFears',
  'clientTrustTriggers', 'clientVisualTaste', 'clientBuyingTriggers',
  'clientEmotionalOutcome', 'brandPerceptionGoal', 'brandProofStatement',
  'brandNeverLooksLike', 'moodboardUrls', 'reputationAsset',
  'workDifferentiation', 'brandWorldAnchor', 'signatureOutcome',
];

const MOOD_BY_STYLE_OR_AESTHETIC: Record<string, string> = {
  minimalist_clean: 'EDITORIAL_MINIMAL',
  moody_editorial: 'EDITORIAL_MINIMAL',
  bright_playful: 'PLAYFUL_FRESH',
  soft_feminine: 'SOFT_GLAM',
  bold_luxury: 'BOLD_LUXE',
  quiet_luxury: 'BOLD_LUXE',
  editorial_beauty: 'EDITORIAL_MINIMAL',
  clinical_minimalist: 'CLEAN_CLINICAL',
  warm_wellness: 'NATURAL_ORGANIC',
  contemporary_cool: 'EDITORIAL_MINIMAL',
  bold_campaign: 'BOLD_LUXE',
  natural_organic: 'NATURAL_ORGANIC',
  high_fashion: 'BOLD_LUXE',
  polished_commercial: 'CLEAN_CLINICAL',
};

function classifyMood(dna: BrandDNA): string {
  const styleKey = dna.visualRanking?.[0] || dna.aestheticDirection || '';
  return MOOD_BY_STYLE_OR_AESTHETIC[styleKey] ?? 'EDITORIAL_MINIMAL';
}

function classifyObjective(dna: BrandDNA): string {
  const text = (dna.commercialObjective ?? '').toLowerCase();
  if (/bridal|wedding/.test(text)) return 'PROMOTE_BRIDAL';
  if (/launch|new product/.test(text)) return 'LAUNCH_PRODUCT';
  if (/educat|trust|authority/.test(text)) return 'EDUCATE_TRUST';
  if (/quiet|fill|slow day/.test(text)) return 'FILL_QUIET_DAYS';
  return 'PREMIUM_CLIENTS';
}

function classifyLanguageVariant(locale: string | undefined): string {
  const l = (locale ?? '').toLowerCase();
  if (l.includes('gb') || l.includes('uk')) return 'UK';
  if (l.includes('us')) return 'US';
  return 'AU';
}

interface TenantMigrationEntry {
  tenantId: string;
  businessName: string;
  droppedNonEmptyFields: string[];
  mapped: Record<string, unknown>;
  skippedReason?: string;
}

async function buildEntry(dna: BrandDNA, tenant: Tenant): Promise<TenantMigrationEntry> {
  const droppedNonEmptyFields = DROPPED_FIELD_KEYS.filter((key) => {
    const v = dna[key];
    return Array.isArray(v) ? v.length > 0 : v != null && v !== '';
  });

  const socialAccounts = await prisma.socialAccount.findMany({
    where: { tenantId: tenant.id, status: 'connected' },
    select: { platform: true },
  });
  const connected = new Set(socialAccounts.map((a) => a.platform.toLowerCase()));

  const palette = [
    dna.primaryBrandColor, dna.secondaryBrandColor, dna.backgroundBrandColor,
    dna.accentBrandColor, dna.depthBrandColor,
  ].filter((c): c is string => !!c);

  const mapped = {
    tenantId: tenant.id,
    schemaVersion: 2,
    isCurrent: true,
    needsReview: true,
    brandName: dna.businessName,
    logoAssetId: dna.logoUrl,
    palette,
    mood: classifyMood(dna),
    typographyHeading: dna.brandFont,
    typographyBody: dna.brandFont,
    essence: [dna.primaryTone, dna.secondaryTone].filter((t): t is string => !!t).slice(0, 3),
    serviceCategory: dna.serviceCategories[0] ?? '',
    services: dna.serviceCategories,
    signatureHandle: null,
    serviceAreas: dna.serviceArea ? [dna.serviceArea] : [],
    ageMin: 18,
    ageMax: 65,
    genderFocus: 'ALL',
    clientTypes: dna.clientPainPoints,
    objective: classifyObjective(dna),
    postsPerWeek: 3,
    bookingTargetPerMonth: 0,
    languageVariant: classifyLanguageVariant(tenant.locale),
    platformInstagram: connected.size === 0 || connected.has('instagram'),
    platformFacebook: connected.has('facebook'),
    platformTiktok: connected.has('tiktok'),
    medicalAestheticsCompliance: isMedicalAestheticsBrand(dna),
    useAssetLibrary: dna.moodboardUrls.length > 0,
    userWrittenStory: dna.oneLiner ?? dna.workDifferentiation ?? null,
    aiDraftedStory: null,
    completedAt: null,
  };

  return { tenantId: tenant.id, businessName: dna.businessName, droppedNonEmptyFields, mapped };
}

async function main() {
  console.log(`Brand DNA v2 migration — mode: ${WRITE ? 'WRITE' : 'DRY-RUN'}`);

  const currentDnas = await prisma.brandDNA.findMany({ where: { isCurrent: true } });
  console.log(`Found ${currentDnas.length} current BrandDNA (v1) rows.`);

  const entries: TenantMigrationEntry[] = [];
  const skipped: TenantMigrationEntry[] = [];

  for (const dna of currentDnas) {
    const existingProfile = await prisma.brandDnaProfile.findUnique({
      where: { unique_current_brand_dna_profile: { tenantId: dna.tenantId, isCurrent: true } },
    });
    if (existingProfile) {
      skipped.push({
        tenantId: dna.tenantId, businessName: dna.businessName,
        droppedNonEmptyFields: [], mapped: {}, skippedReason: 'BrandDnaProfile already exists',
      });
      continue;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: dna.tenantId } });
    if (!tenant) {
      skipped.push({
        tenantId: dna.tenantId, businessName: dna.businessName,
        droppedNonEmptyFields: [], mapped: {}, skippedReason: 'Tenant not found',
      });
      continue;
    }

    entries.push(await buildEntry(dna, tenant));
  }

  if (WRITE) {
    for (const entry of entries) {
      await prisma.brandDnaProfile.create({ data: entry.mapped as any });
    }
    console.log(`Wrote ${entries.length} new BrandDnaProfile rows.`);
  } else {
    console.log(`Dry-run: would write ${entries.length} new BrandDnaProfile rows (0 written).`);
  }

  const report = {
    mode: WRITE ? 'write' : 'dry-run',
    totalCurrentBrandDnaRows: currentDnas.length,
    toMigrate: entries.length,
    skipped: skipped.length,
    tenantsWithDroppedData: entries.filter((e) => e.droppedNonEmptyFields.length > 0).length,
    entries,
    skippedEntries: skipped,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
